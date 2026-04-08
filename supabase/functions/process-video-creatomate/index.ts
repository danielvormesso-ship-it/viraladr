import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CREATOMATE_API = 'https://api.creatomate.com/v1/renders';

interface ProcessRequest {
  videoUrl: string;
  popupMediaUrl?: string;
  popupMediaType?: 'image' | 'video';
  popupAudioUrl?: string;
  bgMusicUrl?: string;
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  backgroundMusicVolume: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CREATOMATE_API_KEY = Deno.env.get('CREATOMATE_API_KEY');
    if (!CREATOMATE_API_KEY) {
      throw new Error('CREATOMATE_API_KEY not configured');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ProcessRequest = await req.json();
    const { videoUrl, popupMediaUrl, popupMediaType, popupAudioUrl, bgMusicUrl,
      appearAt, popupDuration, endVideoWithPopup, opacity,
      popupAudioVolume, videoVolumeAfterPopup, backgroundMusicVolume } = body;

    if (!videoUrl) {
      return new Response(JSON.stringify({ error: 'videoUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalDuration = endVideoWithPopup ? appearAt + popupDuration : null;
    const popupAudioFraction = popupAudioVolume / 100;
    const bgMusicFraction = backgroundMusicVolume / 100;
    const opacityFraction = opacity / 100;

    // Creatomate does NOT support keyframes on 'volume'.
    // Use the reduced volume for the main video when popup is present.
    const mainVideoVolume = (popupMediaUrl && videoVolumeAfterPopup < 100)
      ? `${videoVolumeAfterPopup}%`
      : '100%';

    const elements: any[] = [];

    // Main video element
    elements.push({
      type: 'video',
      source: videoUrl,
      ...(totalDuration ? { duration: `${totalDuration} s` } : {}),
      volume: mainVideoVolume,
    });

    // Popup overlay (image or video)
    if (popupMediaUrl) {
      elements.push({
        type: popupMediaType === 'video' ? 'video' : 'image',
        source: popupMediaUrl,
        time: `${appearAt} s`,
        duration: `${popupDuration} s`,
        opacity: `${opacityFraction * 100}%`,
        fit: 'cover',
        width: '100%',
        height: '100%',
      });
    }

    // Popup audio
    if (popupAudioUrl) {
      elements.push({
        type: 'audio',
        source: popupAudioUrl,
        time: `${appearAt} s`,
        volume: `${popupAudioFraction * 100}%`,
      });
    }

    // Background music
    if (bgMusicUrl) {
      elements.push({
        type: 'audio',
        source: bgMusicUrl,
        volume: `${bgMusicFraction * 100}%`,
      });
    }

    const renderPayload = {
      source: {
        output_format: 'mp4',
        width: 1080,
        height: 1920,
        ...(totalDuration ? { duration: `${totalDuration} s` } : {}),
        elements,
      },
    };

    console.log('Sending to Creatomate:', JSON.stringify(renderPayload, null, 2));

    const renderRes = await fetch(CREATOMATE_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(renderPayload),
    });

    if (!renderRes.ok) {
      const errBody = await renderRes.text();
      console.error('Creatomate render request failed:', renderRes.status, errBody);
      throw new Error(`Creatomate API error ${renderRes.status}: ${errBody.slice(0, 500)}`);
    }

    const renderData = await renderRes.json();
    console.log('Creatomate render response:', JSON.stringify(renderData));

    const render = Array.isArray(renderData) ? renderData[0] : renderData;
    const renderId = render.id;

    if (!renderId) {
      throw new Error('No render ID returned from Creatomate');
    }

    // Poll for completion (max 5 min)
    const maxWait = 300000;
    const pollInterval = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusRes = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
        headers: { 'Authorization': `Bearer ${CREATOMATE_API_KEY}` },
      });

      if (!statusRes.ok) {
        console.error('Creatomate status check failed:', statusRes.status);
        continue;
      }

      const statusData = await statusRes.json();
      console.log('Render status:', statusData.status);

      if (statusData.status === 'succeeded') {
        return new Response(JSON.stringify({
          success: true,
          url: statusData.url,
          renderId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (statusData.status === 'failed') {
        throw new Error(`Render failed: ${statusData.error_message || 'Unknown error'}`);
      }
    }

    throw new Error('Render timed out after 5 minutes');
  } catch (error) {
    console.error('process-video-creatomate error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
