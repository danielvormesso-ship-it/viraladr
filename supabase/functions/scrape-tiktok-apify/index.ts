const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Global reject patterns — applied before any niche filter
const GLOBAL_REJECT_PATTERNS = [
  /\b(disponivel|disponível|estreia|estréia)\s+(na|no|em)\s+(netflix|prime|disney|hbo|max|globoplay|paramount|apple)/i,
  /\b(netflix|prime\s*video|disney\+|hbo\s*max|globoplay)\b.*\b(filme|série|serie|trailer|oficial)\b/i,
  /\b(filme|série|serie)\b.*\b(disponivel|disponível|assista|confira|estreia)\b/i,
  /\b(trailer\s+oficial|teaser\s+oficial)\b/i,
  /\b(link\s+na\s+bio|compre\s+agora|clique\s+aqui|garanta\s+o\s+seu|promocao\s+relampago)\b/i,
  /\b(#ad|#publi|#publicidade|#patrocinado|#parceriapaga)\b/i,
  /\b(afiliado|hotmart|monetizze|kiwify)\s+(link|codigo|código)/i,
  /\b(prank|pranks|pranking|got\s+pranked|prank\s+wars?)\b/i,
  /\b(hidden\s+cam|hidden\s+camera|caught\s+on\s+camera)\b/i,
  /\b(broma|cámara\s+oculta|segundo\s+intento)\b/i,
  /\b(chien|promenade|forêt|foret|dans\s+la)\b/i,
  /\b(hati\s+hati|dimana|kamera\s+tersembunyi)\b/i,
  /\b(papagaio|louro|cacatua)\s+(fal|imit|disse|respond|atend)/i,
];

interface VideoData {
  tiktok_id: string | null;
  title: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: string;
  author: string;
  video_url: string | null;
  source_url: string;
  status: string;
  hashtag: string;
  video_width: number;
  video_height: number;
  region: string | null;
}

// ---- Brazilian content detection ----
// Reject known foreign language patterns early
const FOREIGN_REJECT_RE = /\b(broma|cámara oculta|camara oculta|segundo intento|chien|promenade|forêt|foret|hati hati|dimana|kamera|prank war|prank on|pranking|got pranked|best prank|pranked my|hidden camera|spy cam|spycam|segundo intento)\b/i;
const FOREIGN_SCRIPT_RE = /[\u3000-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u0900-\u097F]/;

function isBrazilianContent(item: any): boolean {
  const text = `${item?.title || ''} ${item?.desc || ''} ${item?.text || ''}`.toLowerCase();

  // ─── CHECK POR REGION (dado oficial do TikTok via TikWM) ───
  const videoRegion = String(item?.region || '').toUpperCase();
  if (videoRegion && videoRegion !== 'BR') return false;  // region existe e NÃO é BR → rejeita
  if (videoRegion === 'BR') return true;                   // region é BR → aceita direto

  // ─── FALLBACK: region vazio → heurísticas ───

  // Early reject: known foreign phrases and non-latin scripts
  if (FOREIGN_REJECT_RE.test(text)) return false;
  if (FOREIGN_SCRIPT_RE.test(text)) return false;

  const ptIndicators = [
    'kkk', 'kkkk', 'vc', 'pra', 'tbm', 'mds', 'slc', 'mano', 'cara',
    'gente', 'muito', 'quando', 'porque', 'esse', 'essa', 'isso',
    'aqui', 'voce', 'você', 'não', 'nao',
    'brasil', 'brasileir', 'tiktokbrasil', 'dancinha', 'novelinha',
    'pegadinha', 'zoeira', 'humor', 'risada', 'trollagem', 'comedia',
    'engraçado', 'engracado',
    'ação', 'acao', 'reação', 'reacao', 'olha', 'veja', 'será',
    'então', 'entao', 'também', 'tambem', 'né', 'tá', 'fé',
    'coisa', 'fazer', 'sabe', 'acho', 'bora', 'eita', 'uai', 'oxe',
  ];

  // Acentos exclusivos BR (ã, õ, ç) são sinal forte
  const hasBrExclusive = /[ãõç]/.test(text);
  if (hasBrExclusive) return true;

  const matchCount = ptIndicators.filter(w => {
    const regex = new RegExp(`\\b${w}`, 'i');
    return regex.test(text);
  }).length;

  if (matchCount >= 2) return true;

  const hashtags = (item?.challenges || item?.hashtags || []).map((h: any) => (h?.title || h?.name || h || '').toLowerCase());
  const brHashtags = ['brasil', 'tiktokbrasil', 'br', 'dancinha', 'pegadinha', 'humor', 'zoeira', 'comedia', 'novelinha'];
  if (hashtags.some((h: string) => brHashtags.includes(h))) return true;

  const enIndicators = ['the', 'this', 'that', 'with', 'have', 'from', 'they', 'been', 'were', 'would', 'could', 'should', 'about', 'their', 'which', 'when', 'your', 'what'];
  const enCount = enIndicators.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
  if (enCount >= 3 && matchCount === 0) return false;

  // Título curto sem sinal BR → rejeitar (antes aceitava tudo < 10 chars)
  const titleClean = text.replace(/#\w+/g, '').trim();
  if (titleClean.length < 10 && matchCount === 0 && !hasBrExclusive) return false;

  return matchCount >= 1;
}

async function scrapeTikWM(hashtag: string, limit: number, maxPages = 10, requireBrazilian = true, maxDuration = 120, startCursor?: number | string, sortType?: number): Promise<{ videos: VideoData[]; nextCursor: string | null; pageLogs: string[] }> {
  const videos: VideoData[] = [];
  const seenIds = new Set<string>();
  let lastCursor: string | null = null;
  const pageLogs: string[] = [];

  let skippedNoUrl = 0;

  const addVideo = (item: any) => {
    if (item?.images && Array.isArray(item.images) && item.images.length > 0) return;
    // Global reject patterns — spam, promos, foreign content
    const rawTitle = item?.title || '';
    for (const pat of GLOBAL_REJECT_PATTERNS) { if (pat.test(rawTitle)) return; }
    const dur = item?.duration || 0;
    const w = item?.width || 0;
    const h = item?.height || 0;
    // Se TikWM retornar dimensoes (raro): rejeitar se nao for vertical
    // Se nao retornar (comum): aceitar — TikTok e vertical por padrao na maioria
    if (w > 0 && h > 0 && h < w * 1.6) return;
    if (dur < 5 || dur > maxDuration) return;
    if (requireBrazilian && !isBrazilianContent(item)) return;

    const downloadUrl = item?.play || item?.hdplay || null;
    if (!downloadUrl) {
      skippedNoUrl++;
      return;
    }

    const vid: VideoData = {
      tiktok_id: item?.video_id ? String(item.video_id) : item?.id ? String(item.id) : null,
      title: item?.title || 'Vídeo sem título',
      thumbnail: item?.cover || item?.origin_cover || null,
      views: parseInt(item?.play_count || 0),
      likes: parseInt(item?.digg_count || 0),
      comments: parseInt(item?.comment_count || 0),
      shares: parseInt(item?.share_count || 0),
      duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
      author: item?.author?.unique_id || item?.author?.nickname || 'desconhecido',
      video_url: downloadUrl,
      source_url: `https://www.tiktok.com/@${item?.author?.unique_id || 'user'}/video/${item?.video_id || item?.id || ''}`,
      status: 'pending',
      hashtag,
      video_width: w,
      video_height: h,
      region: item?.region ? String(item.region).toUpperCase() : null,
    };

    if (!vid.tiktok_id) {
      skippedNoUrl++;
      return;
    }

    if (!seenIds.has(vid.tiktok_id)) {
      seenIds.add(vid.tiktok_id);
      videos.push(vid);
    }
  };

  const fetchPage = async (cursor: number | string) => {
    const res = await fetch('https://www.tikwm.com/api/feed/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': randomUA(),
      },
      body: `keywords=${encodeURIComponent('#' + hashtag)}&count=200&cursor=${cursor}&region=BR${sortType ? '&sort_type=' + sortType : ''}`,
    });

    if (!res.ok) return null;
    return await res.json();
  };

  try {
    // Single cursor start: use startCursor if resuming, otherwise 0
    let nextCursor: number | string | undefined = startCursor ?? 0;
    let pages = 0;

    while (videos.length < limit && nextCursor !== undefined && nextCursor !== null && pages < maxPages) {
      pages++;
      try {
        const pageData = await fetchPage(nextCursor);
        const pageItems = pageData?.data?.videos || [];
        const logMsg = `page ${pages}: cursor=${nextCursor}, raw=${pageItems.length}, accepted=${videos.length}`;
        console.log(`[TikWM] #${hashtag} ${logMsg}`);
        pageLogs.push(logMsg);
        if (pageItems.length === 0) break;

        for (const item of pageItems) {
          if (videos.length >= limit) break;
          addVideo(item);
        }

        const returnedCursor = pageData?.data?.cursor;
        if (!returnedCursor || returnedCursor === nextCursor) break;
        nextCursor = returnedCursor;
        lastCursor = String(returnedCursor);
      } catch {
        break;
      }
    }

    console.log(`[TikWM] #${hashtag}: ${videos.length} videos (pages=${pages}, startCursor=${startCursor ?? 0}, lastCursor=${lastCursor}, skippedNoUrl=${skippedNoUrl})`);
  } catch (err) {
    console.log('[TikWM] error:', err);
    pageLogs.push(`error: ${err}`);
  }
  return { videos, nextCursor: lastCursor, pageLogs };
}

// Helper for Supabase REST calls
function sbHeaders() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function sbUrl(path: string) {
  return `${Deno.env.get('SUPABASE_URL')!}/rest/v1/${path}`;
}

function normalizeSourceUrl(url: string | null) {
  if (!url) return null;
  return url.split('#')[0].split('?')[0].replace(/\/+$/, '').trim();
}

function uniqueByVideoKey(videos: VideoData[]): VideoData[] {
  const seen = new Set<string>();
  const deduped: VideoData[] = [];

  for (const video of videos) {
    const normalizedSource = normalizeSourceUrl(video.source_url);
    const key = video.tiktok_id
      ? `id:${video.tiktok_id}`
      : (normalizedSource ? `source:${normalizedSource.toLowerCase()}` : `title:${video.author}|${video.title}`);

    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      ...video,
      source_url: normalizedSource || video.source_url,
    });
  }

  return deduped;
}

async function getRequesterUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!anonKey || !supabaseUrl) return null;

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': authHeader,
      'apikey': anonKey,
    },
  });

  if (!userRes.ok) return null;
  const userData = await userRes.json().catch(() => null);
  return userData?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { hashtag = 'viral', limit = 50, keyword, force = false, light = false, cursor: inputCursor, sort_type: inputSortType } = await req.json().catch(() => ({}));
    const searchTerm = (keyword || hashtag).replace('#', '').trim().toLowerCase();
    const requestedLimit = Math.max(1, Math.min(Number(limit) || 50, 1000));
    const sortType = inputSortType ? Number(inputSortType) : undefined;

    // ── LIGHT MODE: skip ALL DB operations, just scrape and return ──
    if (light) {
      console.log(`[LIGHT] Scraping #${searchTerm}, limit=${requestedLimit}, cursor=${inputCursor ?? 'none'}, sort_type=${sortType ?? 'default'}`);

      const tikwmResult = await scrapeTikWM(searchTerm, Math.min(requestedLimit * 3, 1000), 10, true, 120, inputCursor, sortType);

      // Shuffle for variety
      const videos = tikwmResult.videos;
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
      }

      const result = uniqueByVideoKey(videos).slice(0, requestedLimit);
      console.log(`[LIGHT] #${searchTerm}: ${result.length} videos, nextCursor=${tikwmResult.nextCursor}`);

      return new Response(
        JSON.stringify({
          success: true,
          videos_found: result.length,
          new_scraped: result.length,
          from_cache: false,
          strategy: 'tikwm',
          videos: result,
          next_cursor: tikwmResult.nextCursor,
          debug_logs: tikwmResult.pageLogs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── FULL MODE (original behavior with DB operations) ──
    const userId = await getRequesterUserId(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Request: user=${userId}, #${searchTerm}, limit=${requestedLimit}`);

    // ---- CACHE CHECK ----
    const cacheRes = await fetch(sbUrl(`hashtag_cache?hashtag=eq.${encodeURIComponent(searchTerm)}&select=*`), {
      headers: sbHeaders(),
    });
    const cacheData = cacheRes.ok ? await cacheRes.json() : [];
    const cached = cacheData?.[0];

    const ownVideosRes = await fetch(
      sbUrl(`tiktok_videos?owner_user_id=eq.${userId}&hashtag=eq.${encodeURIComponent(searchTerm)}&select=id&limit=${requestedLimit}`),
      { headers: sbHeaders() }
    );
    const ownVideos = ownVideosRes.ok ? await ownVideosRes.json() : [];

    let shouldScrape = true;
    if (cached && !force) {
      const hoursAgo = (Date.now() - new Date(cached.last_scraped_at).getTime()) / 3600000;
      const cacheHasEnoughVideos = (cached.videos_found || 0) >= requestedLimit;
      const userAlreadyHasEnoughVideos = ownVideos.length >= requestedLimit;

      if (hoursAgo < 1 && cacheHasEnoughVideos && userAlreadyHasEnoughVideos) {
        console.log(`Cache HIT user=${userId}: #${searchTerm}`);
        shouldScrape = false;
      }
    }

    let newVideosCount = 0;
    let strategyUsed = 'cache';

    if (shouldScrape) {
      const globalExistingRes = await fetch(
        sbUrl(`tiktok_videos?hashtag=eq.${encodeURIComponent(searchTerm)}&select=tiktok_id&limit=5000`),
        { headers: sbHeaders() }
      );
      const globalExisting = globalExistingRes.ok ? await globalExistingRes.json() : [];
      const globalExistingIds = new Set(globalExisting.map((v: any) => String(v.tiktok_id)));

      let videos: VideoData[] = [];

      const tikwmResult = await scrapeTikWM(searchTerm, limit * 3, 10, true, 120, inputCursor);
      strategyUsed = tikwmResult.videos.length > 0 ? 'tikwm' : 'none';
      videos = tikwmResult.videos;

      const userExistingRes = await fetch(
        sbUrl(`tiktok_videos?owner_user_id=eq.${userId}&hashtag=eq.${encodeURIComponent(searchTerm)}&select=tiktok_id&limit=5000`),
        { headers: sbHeaders() }
      );
      const userExisting = userExistingRes.ok ? await userExistingRes.json() : [];
      const userExistingIds = new Set(userExisting.map((v: any) => String(v.tiktok_id)));

      let newVideos = videos.filter(v => !globalExistingIds.has(String(v.tiktok_id)));

      if (newVideos.length < requestedLimit) {
        const recycled = videos.filter(v =>
          globalExistingIds.has(String(v.tiktok_id)) && !userExistingIds.has(String(v.tiktok_id))
        );
        newVideos = [...newVideos, ...recycled];
      }

      for (let i = newVideos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newVideos[i], newVideos[j]] = [newVideos[j], newVideos[i]];
      }
      videos = newVideos;

      if (videos.length > 0) {
        const dedupedVideos = uniqueByVideoKey(videos).map((video) => ({
          ...video,
          owner_user_id: userId,
        }));

        const withTikTokId = dedupedVideos.filter((v) => !!v.tiktok_id);
        const withoutTikTokId = dedupedVideos.filter((v) => !v.tiktok_id && !!v.source_url);

        for (let i = 0; i < withTikTokId.length; i += 50) {
          const batch = withTikTokId.slice(i, i + 50);
          const insertRes = await fetch(sbUrl('tiktok_videos?on_conflict=owner_user_id,tiktok_id'), {
            method: 'POST',
            headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(batch),
          });
          if (!insertRes.ok) console.error('DB error (tiktok_id):', await insertRes.text());
        }

        for (let i = 0; i < withoutTikTokId.length; i += 50) {
          const batch = withoutTikTokId.slice(i, i + 50);
          const insertRes = await fetch(sbUrl('tiktok_videos?on_conflict=owner_user_id,source_url'), {
            method: 'POST',
            headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(batch),
          });
          if (!insertRes.ok) console.error('DB error (source_url):', await insertRes.text());
        }

        newVideosCount = dedupedVideos.length;
      }

      await fetch(sbUrl('hashtag_cache'), {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          hashtag: searchTerm,
          last_scraped_at: new Date().toISOString(),
          videos_found: newVideosCount,
        }),
      });
    }

    const videosRes = await fetch(
      sbUrl(`tiktok_videos?owner_user_id=eq.${userId}&hashtag=eq.${encodeURIComponent(searchTerm)}&select=*&order=created_at.desc&limit=${requestedLimit * 3}`),
      { headers: sbHeaders() }
    );
    const filteredVideosRaw = videosRes.ok ? await videosRes.json() : [];
    const dedupedVideos = uniqueByVideoKey(filteredVideosRaw);
    for (let i = dedupedVideos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dedupedVideos[i], dedupedVideos[j]] = [dedupedVideos[j], dedupedVideos[i]];
    }
    const filteredVideos = dedupedVideos.slice(0, requestedLimit);

    return new Response(
      JSON.stringify({
        success: true,
        videos_found: filteredVideos.length,
        new_scraped: newVideosCount,
        from_cache: !shouldScrape,
        strategy: strategyUsed,
        videos: filteredVideos,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
