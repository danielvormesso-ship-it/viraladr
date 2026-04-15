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
            await adminClient.from('hashtag_pool').update({
              video_url: newUrl,
              fetched_at: new Date().toISOString(),
            }).eq('id', video.id);
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
