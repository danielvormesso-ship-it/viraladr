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
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    const res = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Referer': 'https://www.tiktok.com/',
        'Origin': 'https://www.tiktok.com',
        'Accept': 'video/mp4,video/*,*/*',
      },
    });

    if (!res.ok || !res.body) {
      return new Response(
        JSON.stringify({ error: `upstream ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const contentType = res.headers.get('content-type') || 'video/mp4';
    const contentLength = res.headers.get('content-length');

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
    };
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    return new Response(res.body, { headers: responseHeaders });
  } catch (err) {
    console.error('proxy-video error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'proxy failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
