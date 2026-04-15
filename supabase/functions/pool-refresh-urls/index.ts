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
      .limit(200);

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
    let refreshed = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < staleVideos.length; i += BATCH) {
      const batch = staleVideos.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (video) => {
          try {
            const res = await fetch('https://www.tikwm.com/api/', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
              },
              body: `url=${encodeURIComponent(video.source_url || `https://www.tiktok.com/@${video.author || 'user'}/video/${video.tiktok_id}`)}`,
              signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) return { id: video.id, success: false };

            const data = await res.json();
            const newUrl = data?.data?.play || data?.data?.hdplay || null;

            if (!newUrl) return { id: video.id, success: false };

            // Update video_url and fetched_at
            const { error: updateErr } = await adminClient
              .from('hashtag_pool')
              .update({
                video_url: newUrl,
                fetched_at: new Date().toISOString(),
              })
              .eq('id', video.id);

            if (updateErr) {
              console.warn(`[pool-refresh-urls] update error for ${video.tiktok_id}:`, updateErr.message);
              return { id: video.id, success: false };
            }

            return { id: video.id, success: true };
          } catch (err) {
            return { id: video.id, success: false };
          }
        })
      );

      for (const r of results) {
        if (r.success) refreshed++;
        else failed++;
      }
    }

    console.log(`[pool-refresh-urls] Done: ${refreshed} refreshed, ${failed} failed out of ${staleVideos.length}`);

    return new Response(
      JSON.stringify({ success: true, refreshed, failed, total: staleVideos.length }),
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
