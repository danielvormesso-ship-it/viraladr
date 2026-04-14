import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalized content signature for secondary dedup (mirrors frontend getVideoMeta)
function getVideoMeta(v: { author: string | null; title: string | null; duration: string | null }): string {
  const author = (v.author || '').toLowerCase().trim();
  const rawTitle = (v.title || '').toLowerCase()
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F000}-\u{1FAFF}]/gu, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  const dur = v.duration || '';
  return `${author}|${rawTitle}|${dur}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hashtag_group, user_id, limit = 50 } = await req.json();

    if (!hashtag_group || typeof hashtag_group !== 'string') {
      return new Response(
        JSON.stringify({ error: 'hashtag_group required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const groupKey = hashtag_group.toLowerCase();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── 1. Fetch ALL seen + used IDs for this user (last 7 days) via pagination ──
    const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const PAGE = 1000;

    const excludeIds = new Set<string>();
    const excludeMetas = new Set<string>();
    const idsWithoutMeta: string[] = [];

    // Paginate seen_videos
    let seenTotal = 0;
    for (let from = 0; ; from += PAGE) {
      const { data } = await adminClient
        .from('seen_videos')
        .select('tiktok_id, video_meta')
        .eq('user_id', user_id)
        .gte('seen_at', ttlCutoff)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        excludeIds.add(r.tiktok_id);
        if (r.video_meta) excludeMetas.add(r.video_meta);
        else idsWithoutMeta.push(r.tiktok_id);
      }
      seenTotal += data.length;
      if (data.length < PAGE) break;
    }

    // Paginate used_videos
    let usedTotal = 0;
    for (let from = 0; ; from += PAGE) {
      const { data } = await adminClient
        .from('used_videos')
        .select('tiktok_id')
        .eq('user_id', user_id)
        .gte('used_at', ttlCutoff)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) excludeIds.add(r.tiktok_id);
      usedTotal += data.length;
      if (data.length < PAGE) break;
    }

    console.log(`[pool-serve] seenRows=${seenTotal} usedRows=${usedTotal} excludeIds=${excludeIds.size}`);

    // ── 1b. Fallback: for seen IDs without video_meta, lookup meta from hashtag_pool ──
    if (idsWithoutMeta.length > 0) {
      const lookupIds = idsWithoutMeta.slice(0, 1000);
      const { data: fallbackRows } = await adminClient
        .from('hashtag_pool')
        .select('author, title, duration')
        .in('tiktok_id', lookupIds);
      for (const r of fallbackRows || []) {
        const meta = getVideoMeta(r);
        if (meta !== '||') excludeMetas.add(meta);
      }
    }

    console.log(`[pool-serve] group=${groupKey} user=${user_id.slice(0, 8)}... limit=${safeLimit} exclude=${excludeIds.size} excludeMetas=${excludeMetas.size} fallback=${idsWithoutMeta.length}`);

    // ── 2. Query pool: approved videos, overfetch to compensate exclusions ──
    // Only serve videos with fresh CDN URLs (fetched within last 4 hours)
    const freshCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const overfetch = Math.min(safeLimit + excludeIds.size + excludeMetas.size + 50, 2000);
    const { data: poolRows, error: poolErr } = await adminClient
      .from('hashtag_pool')
      .select('tiktok_id, title, thumbnail, views, likes, comments, shares, duration, author, video_url, source_url')
      .eq('hashtag_group', groupKey)
      .eq('niche_approved', true)
      .gte('fetched_at', freshCutoff)
      .order('br_score', { ascending: false })
      .order('views', { ascending: false })
      .limit(overfetch);

    if (poolErr) {
      console.error('[pool-serve] pool query error:', poolErr);
      return new Response(
        JSON.stringify({ error: 'Pool query failed', details: poolErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Filter out seen/used by tiktok_id AND by meta (catches reposts) ──
    const served = (poolRows || [])
      .filter(v => {
        if (excludeIds.has(v.tiktok_id)) return false;
        const meta = getVideoMeta(v);
        if (meta !== '||' && excludeMetas.has(meta)) return false;
        return true;
      })
      .slice(0, safeLimit);

    // ── 4. Format as TikTokVideo (same shape frontend expects) ──
    const videos = served.map(v => ({
      id: v.tiktok_id,
      tiktok_id: v.tiktok_id,
      title: v.title || '',
      thumbnail: v.thumbnail,
      views: v.views || 0,
      likes: v.likes || 0,
      comments: v.comments || 0,
      shares: v.shares || 0,
      duration: v.duration,
      author: v.author,
      video_url: v.video_url || null,
      source_url: v.source_url,
      status: 'pool',
    }));

    // ── 5. Mark served videos as seen (await to prevent race conditions) ──
    if (videos.length > 0) {
      const seenRows = videos.map(v => ({ user_id, tiktok_id: v.tiktok_id, video_meta: getVideoMeta(v) }));
      for (let i = 0; i < seenRows.length; i += 50) {
        const batch = seenRows.slice(i, i + 50);
        const { error } = await adminClient
          .from('seen_videos')
          .upsert(batch, { onConflict: 'user_id,tiktok_id' });
        if (error) console.error('[pool-serve] seen upsert error:', error);
      }
    }

    // ── 6. Update editor_hashtag_stats ──
    const poolAvailable = (poolRows || []).filter(v => {
      if (excludeIds.has(v.tiktok_id)) return false;
      const meta = getVideoMeta(v);
      if (meta !== '||' && excludeMetas.has(meta)) return false;
      return true;
    }).length;
    const hitRate = safeLimit > 0 ? Math.min(1, videos.length / safeLimit) : 0;

    const { data: existingStats } = await adminClient
      .from('editor_hashtag_stats')
      .select('search_count, avg_quantity')
      .eq('user_id', user_id)
      .eq('hashtag_group', groupKey)
      .maybeSingle();

    const prevCount = existingStats?.search_count || 0;
    const prevAvg = existingStats?.avg_quantity || safeLimit;
    const newCount = prevCount + 1;
    const newAvg = Math.round((prevAvg * prevCount + safeLimit) / newCount);

    adminClient
      .from('editor_hashtag_stats')
      .upsert({
        user_id,
        hashtag_group: groupKey,
        search_count: newCount,
        last_searched_at: new Date().toISOString(),
        avg_quantity: newAvg,
        pool_hit_rate: Math.round(hitRate * 100) / 100,
      }, { onConflict: 'user_id,hashtag_group' })
      .then(({ error }) => {
        if (error) console.error('[pool-serve] stats upsert error:', error);
      });

    console.log(`[pool-serve] Served ${videos.length}/${safeLimit} from pool (available=${poolAvailable}, hitRate=${(hitRate * 100).toFixed(0)}%)`);

    return new Response(
      JSON.stringify({
        success: true,
        videos,
        served: videos.length,
        pool_available: poolAvailable,
        hit_rate: hitRate,
        from_pool: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[pool-serve] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
