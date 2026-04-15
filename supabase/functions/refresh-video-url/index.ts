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
    const { tiktok_id } = await req.json();

    if (!tiktok_id || typeof tiktok_id !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'tiktok_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Fetch source_url and author from pool
    const { data: video, error: fetchErr } = await adminClient
      .from('hashtag_pool')
      .select('id, source_url, author')
      .eq('tiktok_id', tiktok_id)
      .limit(1)
      .maybeSingle();

    if (fetchErr || !video) {
      return new Response(
        JSON.stringify({ success: false, error: 'Video not found in pool' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tikwmUrl = video.source_url || `https://www.tiktok.com/@${video.author || 'user'}/video/${tiktok_id}`;

    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      },
      body: `url=${encodeURIComponent(tikwmUrl)}`,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `TikWM status ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await res.json();
    const newUrl = data?.data?.play || null;

    if (data?.code !== 0 || !newUrl) {
      return new Response(
        JSON.stringify({ success: false, error: data?.msg || 'TikWM returned no URL' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Update pool with fresh URL
    await adminClient.from('hashtag_pool').update({
      video_url: newUrl,
      fetched_at: new Date().toISOString(),
    }).eq('id', video.id);

    return new Response(
      JSON.stringify({ success: true, video_url: newUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[refresh-video-url] error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
