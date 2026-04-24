import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const VIDEOS_PER_GROUP = 2;
const MAX_VIDEOS = 60;
const DELAY_MS = 1050;

async function measureAnyCover(coverUrl: string): Promise<{ w: number; h: number } | null> {
  if (!coverUrl) return null;
  try {
    const res = await fetch(coverUrl, {
      headers: { 'Range': 'bytes=0-255' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok && res.status !== 206) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // WebP VP8X (ai_dynamic_cover)
    for (let i = 12; i < bytes.length - 18; i++) {
      if (bytes[i] === 0x56 && bytes[i+1] === 0x50 && bytes[i+2] === 0x38 && bytes[i+3] === 0x58) {
        const w = 1 + (bytes[i+12] | (bytes[i+13] << 8) | (bytes[i+14] << 16));
        const h = 1 + (bytes[i+15] | (bytes[i+16] << 8) | (bytes[i+17] << 16));
        if (w > 0 && h > 0 && w < 10000 && h < 10000) return { w, h };
      }
    }
    // PNG IHDR
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0 && w < 10000 && h < 10000) return { w, h };
    }
    // JPEG SOF0/SOF1 only (SOF2/SOF3 return garbage from progressive JPEGs)
    for (let i = 0; i < bytes.length - 9; i++) {
      if (bytes[i] === 0xFF && (bytes[i+1] === 0xC0 || bytes[i+1] === 0xC1)) {
        const h = (bytes[i+5] << 8) | bytes[i+6];
        const w = (bytes[i+7] << 8) | bytes[i+8];
        if (w > 0 && h > 0 && w < 10000 && h < 10000) return { w, h };
      }
    }
    return null;
  } catch { return null; }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const staleCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // ── 1. Fetch 2 stale videos per hashtag_group (balanced distribution) ──
    const { data: staleVideos, error: fetchErr } = await adminClient
      .rpc('pool_stale_per_group', {
        stale_cutoff: staleCutoff,
        per_group: VIDEOS_PER_GROUP,
      });

    if (fetchErr) {
      console.error('[pool-refresh-urls] fetch error:', fetchErr);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const videos = staleVideos?.slice(0, MAX_VIDEOS) ?? [];

    if (videos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, refreshed: 0, message: 'No stale videos found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[pool-refresh-urls] Found ${videos.length} stale videos across groups`);

    // ── 2. Refresh URLs via TikWM — SEQUENTIAL (1 req/1.1s to respect rate limit) ──
    let refreshed = 0;
    let retried = 0;
    let deleted = 0;
    let errors = 0;
    const retryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i] as any;

      try {
        const res = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          },
          body: `url=${encodeURIComponent(video.source_url || `https://www.tiktok.com/@${video.author || 'user'}/video/${video.tiktok_id}`)}`,
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          errors++;
        } else {
          const data = await res.json();
          const code = data?.code;
          const newUrl = data?.data?.play || null;

          if (code === 0 && newUrl) {
            const updateData: Record<string, any> = {
              video_url: newUrl,
              fetched_at: new Date().toISOString(),
            };

            // Save region (populates old videos progressively)
            if (data?.data?.region) {
              updateData.video_region = String(data.data.region).toUpperCase();
            }

            // Measure via ai_dynamic_cover (WebP with correct ratio)
            // NOTE: cover is 300x400 preview (useless), but ai_dynamic_cover preserves real ratio
            const freshCover = data?.data?.ai_dynamic_cover;
            if (freshCover) {
              const dims = await measureAnyCover(freshCover);
              if (dims) {
                updateData.video_width = dims.w;
                updateData.video_height = dims.h;
                if (dims.h < dims.w * 1.6) {
                  updateData.niche_approved = false;
                }
              }
            }

            await adminClient.from('hashtag_pool').update(updateData).eq('id', video.id);
            refreshed++;
          } else {
            // Video unavailable (code:-1 or no play URL)
            const isSecondFailure = video.fetched_at < retryThreshold;
            if (isSecondFailure) {
              await adminClient.from('hashtag_pool').delete().eq('id', video.id);
              deleted++;
            } else {
              await adminClient.from('hashtag_pool').update({
                fetched_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              }).eq('id', video.id);
              retried++;
            }
          }
        }
      } catch {
        errors++;
      }

      // 1.1s delay between requests to respect TikWM 1 req/s limit
      if (i < videos.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`[pool-refresh-urls] Done: ${refreshed} refreshed, ${retried} retried, ${deleted} deleted, ${errors} errors (total ${videos.length})`);

    return new Response(
      JSON.stringify({ success: true, refreshed, retried, deleted, errors, total: videos.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[pool-refresh-urls] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
