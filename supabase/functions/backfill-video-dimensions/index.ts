import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function measureThumb(coverUrl: string): Promise<{ w: number; h: number } | null> {
  if (!coverUrl) return null;
  try {
    const res = await fetch(coverUrl, {
      headers: { 'Range': 'bytes=0-511' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 206) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    for (let i = 0; i < bytes.length - 9; i++) {
      if (bytes[i] === 0xFF && (bytes[i + 1] === 0xC0 || bytes[i + 1] === 0xC2)) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        if (w > 0 && h > 0) return { w, h };
      }
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0) return { w, h };
    }
    return null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { batch_size = 50 } = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(batch_size) || 50, 10), 500);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch videos without dimensions
    const { data: videos, error } = await adminClient
      .from('hashtag_pool')
      .select('id, tiktok_id, thumbnail, niche_approved')
      .is('video_width', null)
      .not('thumbnail', 'is', null)
      .limit(limit);

    if (error) throw error;
    if (!videos || videos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No videos left to backfill' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let vertical = 0, rejected = 0, failed = 0;
    const PARALLEL = 10;

    for (let i = 0; i < videos.length; i += PARALLEL) {
      const batch = videos.slice(i, i + PARALLEL);
      const dims = await Promise.all(batch.map(v => measureThumb(v.thumbnail || '')));

      for (let j = 0; j < batch.length; j++) {
        const v = batch[j];
        const d = dims[j];

        if (d) {
          const isVertical = d.h >= d.w * 1.6;
          if (isVertical) {
            vertical++;
          } else {
            rejected++;
          }
          await adminClient
            .from('hashtag_pool')
            .update({
              video_width: d.w,
              video_height: d.h,
              // Soft reject: mark non-vertical as not approved
              ...((!isVertical && v.niche_approved) ? { niche_approved: false } : {}),
            })
            .eq('id', v.id);
        } else {
          failed++;
          // Mark as measured but unknown (0,0) so we don't retry
          await adminClient
            .from('hashtag_pool')
            .update({ video_width: 0, video_height: 0 })
            .eq('id', v.id);
        }
      }
    }

    const remaining = await adminClient
      .from('hashtag_pool')
      .select('id', { count: 'exact', head: true })
      .is('video_width', null)
      .not('thumbnail', 'is', null);

    console.log(`[backfill] processed=${videos.length} vertical=${vertical} rejected=${rejected} failed=${failed} remaining=${remaining.count}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: videos.length,
        vertical,
        rejected,
        failed,
        remaining: remaining.count,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[backfill] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
