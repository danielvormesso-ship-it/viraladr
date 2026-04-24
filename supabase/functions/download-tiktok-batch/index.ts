const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

interface VideoRequest {
  video_url: string;
  tiktok_id?: string;
  index: number;
}

interface VideoResult {
  index: number;
  success: boolean;
  download_url?: string;
  error?: string;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getTikwmDownload(videoUrl: string, attempt = 1): Promise<{ success: boolean; download_url?: string; error?: string }> {
  const MAX_RETRIES = 3;
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'application/json',
        'Referer': 'https://www.tikwm.com/',
        'Origin': 'https://www.tikwm.com',
      },
      body: `url=${encodeURIComponent(videoUrl)}&hd=1`,
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt < MAX_RETRIES) {
        await delay(1200 * attempt);
        return getTikwmDownload(videoUrl, attempt + 1);
      }
      return { success: false, error: `tikwm status ${res.status} after ${attempt} attempts` };
    }

    if (!res.ok) return { success: false, error: `tikwm status ${res.status}` };

    const data = await res.json();
    const downloadUrl = data?.data?.play;
    
    if (!downloadUrl) {
      if (attempt < MAX_RETRIES) {
        await delay(1200 * attempt);
        return getTikwmDownload(videoUrl, attempt + 1);
      }
      return { success: false, error: 'No download URL' };
    }
    if (downloadUrl.includes('/music/') || downloadUrl.endsWith('.mp3') || downloadUrl.endsWith('.m4a')) {
      return { success: false, error: 'Audio-only URL' };
    }

    return { success: true, download_url: downloadUrl };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await delay(1200 * attempt);
      return getTikwmDownload(videoUrl, attempt + 1);
    }
    return { success: false, error: err instanceof Error ? err.message : 'tikwm failed' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos } = await req.json() as { videos: VideoRequest[] };

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'videos array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batch = videos.slice(0, 50);
    console.log(`Batch download: resolving ${batch.length} URLs`);

    // Process serially respecting TikWM's 1.2s rate limit
    // Sequential with 1200ms delay = ~60s for 50 videos, 99%+ success
    const CONCURRENCY = 1;
    const results: VideoResult[] = [];

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const group = batch.slice(i, i + CONCURRENCY);
      
      const groupResults = await Promise.all(
        group.map(async (v): Promise<VideoResult> => {
          let tiktokUrl = v.video_url;
          if (!tiktokUrl && v.tiktok_id) {
            tiktokUrl = `https://www.tiktok.com/@user/video/${v.tiktok_id}`;
          }
          if (!tiktokUrl) {
            return { index: v.index, success: false, error: 'No URL' };
          }
          const result = await getTikwmDownload(tiktokUrl);
          return { index: v.index, ...result };
        })
      );

      results.push(...groupResults);

      // Respect TikWM 1.2s rate limit between requests
      if (i + CONCURRENCY < batch.length) {
        await delay(1200);
      }
    }

    const resolved = results.filter(r => r.success).length;
    console.log(`Batch resolved: ${resolved}/${batch.length}`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Batch error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
