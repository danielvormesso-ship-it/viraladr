import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const staleCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // ── 1. Fetch stale videos (approved but URLs expired) ──
    const { data: staleVideos, error: fetchErr } = await adminClient
      .from('hashtag_pool')
      .select('id, tiktok_id, source_url, author, hashtag_group')
      .eq('niche_approved', true)
      .lt('fetched_at', staleCutoff)
      .order('fetched_at', { ascending: true })
      .limit(500);

    if (fetchErr) {
      console.error('[pool-refresh-urls] fetch error:', fetchErr);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!staleVideos || staleVideos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, refreshed: 0, message: 'No stale videos found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[pool-refresh-urls] Found ${staleVideos.length} stale videos to refresh`);

    // ── 2. Refresh URLs via TikWM ──
    // Strategy: if TikWM returns code:-1, the video is deleted/private.
    // First failure: set fetched_at to 3h ago (retry in ~1h).
    // Second failure (fetched_at already < staleCutoff - 1h): delete from pool.
    let refreshed = 0;
    let retried = 0;
    let deleted = 0;
    let errors = 0;
    const BATCH = 15;
    const retryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30min ago = already retried

    for (let i = 0; i < staleVideos.length; i += BATCH) {
      const batch = staleVideos.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (video: any) => {
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

            if (!res.ok) return { id: video.id, status: 'error' as const };

            const data = await res.json();
            const code = data?.code;
            const newUrl = data?.data?.play || null;

            if (code === 0 && newUrl) {
              // Success — update URL and timestamp
              await adminClient.from('hashtag_pool').update({
                video_url: newUrl,
                fetched_at: new Date().toISOString(),
              }).eq('id', video.id);
              return { id: video.id, status: 'refreshed' as const };
            }

            // Video unavailable (code:-1 or no play URL)
            const isSecondFailure = video.fetched_at < retryThreshold;
            if (isSecondFailure) {
              // Already failed before — delete from pool
              await adminClient.from('hashtag_pool').delete().eq('id', video.id);
              return { id: video.id, status: 'deleted' as const };
            }

            // First failure — set fetched_at to 3h ago for retry in ~1h
            await adminClient.from('hashtag_pool').update({
              fetched_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            }).eq('id', video.id);
            return { id: video.id, status: 'retry' as const };
          } catch {
            return { id: video.id, status: 'error' as const };
          }
        })
      );

      // 200ms delay between batches to avoid TikWM rate limits
      if (i + BATCH < staleVideos.length) await new Promise(r => setTimeout(r, 200));

      for (const r of results) {
        if (r.status === 'refreshed') refreshed++;
        else if (r.status === 'deleted') deleted++;
        else if (r.status === 'retry') retried++;
        else errors++;
      }
    }

    console.log(`[pool-refresh-urls] Done: ${refreshed} refreshed, ${retried} retried, ${deleted} deleted, ${errors} errors (total ${staleVideos.length})`);

    return new Response(
      JSON.stringify({ success: true, refreshed, retried, deleted, errors, total: staleVideos.length }),
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
