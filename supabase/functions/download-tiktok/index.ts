const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

interface DownloadResult {
  success: boolean;
  download_url?: string;
  title?: string;
  error?: string;
}

// Strategy 1: tikwm.com API (free, reliable)
async function getTikwmDownload(videoUrl: string): Promise<DownloadResult> {
  try {
    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENTS[0],
      },
      body: `url=${encodeURIComponent(videoUrl)}&hd=1`,
    });

    if (!res.ok) return { success: false, error: `tikwm status ${res.status}` };

    const data = await res.json();
    if (data?.code !== 0 && data?.code !== undefined) {
      return { success: false, error: data?.msg || 'tikwm error' };
    }

    // ALWAYS use 'play' (H.264). NEVER use 'hdplay' — it's almost always BVC2/ByteVC2
    // (ByteDance proprietary codec incompatible with VLC, CapCut, DaVinci, FFmpeg, etc.)
    const downloadUrl = data?.data?.play;
    
    if (!downloadUrl) {
      return { success: false, error: 'No video download URL in response' };
    }
    
    // Reject if URL looks like an audio file
    if (downloadUrl.includes('/music/') || downloadUrl.endsWith('.mp3') || downloadUrl.endsWith('.m4a')) {
      return { success: false, error: 'URL is audio-only, not video' };
    }

    return {
      success: true,
      download_url: downloadUrl,
      title: data?.data?.title || 'video',
    };
  } catch (err) {
    console.error('tikwm error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'tikwm failed' };
  }
}

// Strategy 2: tikcdn.io API (backup)
async function getTikcdnDownload(videoUrl: string): Promise<DownloadResult> {
  try {
    const res = await fetch(`https://tikcdn.io/ssstik/${encodeURIComponent(videoUrl)}`, {
      headers: { 'User-Agent': USER_AGENTS[1] },
    });

    if (!res.ok) return { success: false, error: `tikcdn status ${res.status}` };

    // This endpoint typically returns the video file directly or a redirect
    const finalUrl = res.url;
    if (finalUrl && finalUrl !== videoUrl) {
      return { success: true, download_url: finalUrl };
    }

    return { success: false, error: 'tikcdn no redirect' };
  } catch (err) {
    console.error('tikcdn error:', err);
    return { success: false, error: 'tikcdn failed' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, tiktok_id, mode = 'url' } = await req.json();

    // Build the TikTok URL
    let tiktokUrl = video_url;
    if (!tiktokUrl && tiktok_id) {
      tiktokUrl = `https://www.tiktok.com/@user/video/${tiktok_id}`;
    }

    if (!tiktokUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'video_url or tiktok_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Download request: ${tiktokUrl}, mode: ${mode}`);

    // Try tikwm first
    let result = await getTikwmDownload(tiktokUrl);

    // If tikwm fails, try tikcdn
    if (!result.success) {
      console.log('tikwm failed, trying tikcdn...');
      result = await getTikcdnDownload(tiktokUrl);
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'All download strategies failed' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode "url" returns the download URL for the frontend to trigger download
    // Mode "proxy" proxies the video bytes (for CORS issues)
    if (mode === 'proxy' && result.download_url) {
      const videoRes = await fetch(result.download_url, {
        headers: { 'User-Agent': USER_AGENTS[0], 'Referer': 'https://www.tiktok.com/' },
      });

      if (!videoRes.ok || !videoRes.body) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to proxy video' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(videoRes.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="tiktok_${tiktok_id || 'video'}.mp4"`,
        },
      });
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
