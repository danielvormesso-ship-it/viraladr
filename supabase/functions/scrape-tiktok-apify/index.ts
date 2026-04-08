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

interface VideoData {
  tiktok_id: string;
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
}

function parseVideoItem(v: any, hashtag: string, maxDuration = 40, requireBrazilian = true): VideoData | null {
  const w = v?.video?.width || v?.videoMeta?.width || 0;
  const h = v?.video?.height || v?.videoMeta?.height || 0;
  if (w > 0 && h > 0 && h < w * 1.5) return null;

  const dur = v?.video?.duration || v?.videoMeta?.duration || 0;
  if (dur <= 0 || dur > maxDuration) return null;

  if (requireBrazilian) {
    const text = `${v?.desc || ''} ${v?.text || ''} ${v?.description || ''} ${v?.caption || ''}`.toLowerCase();
    const ptChars = /[ãõáéíóúâêôçà]/.test(text);
    const ptWords = ['kkk','vc','pra','mano','gente','muito','quando','porque','voce','você','não','nao','brasil','dancinha','novelinha','pegadinha','zoeira','humor','parati','olha','então','entao','também','né','tá'];
    const ptCount = ptWords.filter(w => new RegExp(`\\b${w}`, 'i').test(text)).length;
    const enWords = ['the','this','that','with','have','from','they','been','would','could','about','their','which','when','your','what'];
    const enCount = enWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
    const authorRegion = v?.author?.region || v?.authorMeta?.region || '';
    const isBR = authorRegion.toUpperCase() === 'BR';

    if (!isBR && !ptChars && ptCount === 0 && enCount >= 3) return null;
    if (!isBR && !ptChars && ptCount === 0 && text.trim().length > 20) return null;
  }

  return {
    tiktok_id: String(v?.id || v?.video?.id || crypto.randomUUID()),
    title: v?.desc || v?.text || v?.description || v?.caption || 'Vídeo sem título',
    thumbnail: v?.video?.cover || v?.video?.originCover || v?.covers?.default || v?.cover || null,
    views: parseInt(v?.stats?.playCount || v?.statsV2?.playCount || v?.playCount || v?.plays || 0),
    likes: parseInt(v?.stats?.diggCount || v?.statsV2?.diggCount || v?.diggCount || v?.likes || 0),
    comments: parseInt(v?.stats?.commentCount || v?.statsV2?.commentCount || v?.commentCount || 0),
    shares: parseInt(v?.stats?.shareCount || v?.statsV2?.shareCount || v?.shareCount || 0),
    duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
    author: v?.author?.uniqueId || v?.author?.nickname || v?.authorMeta?.name || v?.authorMeta?.nickName || 'desconhecido',
    video_url: v?.video?.playAddr || v?.video?.downloadAddr || v?.videoUrl || null,
    source_url: v?.webVideoUrl || v?.url || `https://www.tiktok.com/@${v?.author?.uniqueId || v?.authorMeta?.name || 'unknown'}/video/${v?.id || ''}`,
    status: 'pending',
    hashtag,
  };
}

async function scrapeDirectHTML(hashtag: string, limit: number, maxDuration = 40, requireBrazilian = true): Promise<VideoData[]> {
  const videos: VideoData[] = [];
  try {
    const res = await fetch(`https://www.tiktok.com/tag/${hashtag}`, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'follow',
    });
    if (!res.ok) return videos;
    const html = await res.text();

    const patterns = [
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
      /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
    ];

    let jsonData: any = null;
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) { try { jsonData = JSON.parse(m[1]); break; } catch { continue; } }
    }
    if (!jsonData) return videos;

    const items: any[] = [];
    const ds = jsonData?.['__DEFAULT_SCOPE__'];
    if (ds?.['webapp.challenge-detail']?.itemList) items.push(...ds['webapp.challenge-detail'].itemList);
    if (ds?.['webapp.search']?.itemList) items.push(...ds['webapp.search'].itemList);
    const im = jsonData?.ItemModule;
    if (im && typeof im === 'object') items.push(...Object.values(im));

    for (const item of items) {
      if (videos.length >= limit) break;
      const v = parseVideoItem(item, hashtag, maxDuration, requireBrazilian);
      if (v && !videos.some(e => e.tiktok_id === v.tiktok_id)) videos.push(v);
    }
    console.log(`[Strategy 1] Direct HTML: ${videos.length} videos`);
  } catch (err) {
    console.log('[Strategy 1] Direct HTML error:', err);
  }
  return videos;
}

// ---- Brazilian content detection ----
function isBrazilianContent(item: any): boolean {
  const text = `${item?.title || ''} ${item?.desc || ''} ${item?.text || ''}`.toLowerCase();
  const ptIndicators = [
    'kkk', 'kkkk', 'vc', 'pra', 'tbm', 'mds', 'slc', 'mano', 'cara',
    'gente', 'muito', 'quando', 'porque', 'como', 'esse', 'essa', 'isso',
    'aqui', 'voce', 'você', 'não', 'nao', 'sim', 'bem', 'dia', 'vida',
    'amor', 'todo', 'uma', 'uns', 'das', 'dos', 'nas', 'nos', 'pela',
    'pelo', 'com', 'sem', 'mais', 'mas', 'pois', 'que', 'quem',
    'brasil', 'brasileir', 'tiktokbrasil', 'dancinha', 'novelinha',
    'pegadinha', 'zoeira', 'humor', 'risada', 'trollagem', 'comedia',
    'engraçado', 'engracado', 'parati', 'fyp', 'foryou',
    'ação', 'acao', 'reação', 'reacao', 'olha', 'veja', 'será',
    'então', 'entao', 'também', 'tambem', 'né', 'tá', 'fé',
    'coisa', 'fazer', 'sabe', 'acho', 'tipo', 'bom', 'boa',
  ];
  const hasPtChars = /[ãõáéíóúâêôçà]/.test(text);
  if (hasPtChars) return true;

  const matchCount = ptIndicators.filter(w => {
    const regex = new RegExp(`\\b${w}`, 'i');
    return regex.test(text);
  }).length;

  if (matchCount >= 2) return true;

  const authorRegion = item?.author?.region || item?.authorMeta?.region || '';
  if (authorRegion.toUpperCase() === 'BR') return true;

  const hashtags = (item?.challenges || item?.hashtags || []).map((h: any) => (h?.title || h?.name || h || '').toLowerCase());
  const brHashtags = ['brasil', 'tiktokbrasil', 'br', 'parati', 'humor', 'dancinha', 'pegadinha', 'viral', 'fyp'];
  if (hashtags.some((h: string) => brHashtags.includes(h))) return true;

  const enIndicators = ['the', 'this', 'that', 'with', 'have', 'from', 'they', 'been', 'were', 'would', 'could', 'should', 'about', 'their', 'which', 'when', 'your', 'what'];
  const enCount = enIndicators.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
  if (enCount >= 3 && matchCount === 0) return false;

  if (text.trim().length < 10) return true;

  return matchCount >= 1;
}

async function scrapeTikWM(hashtag: string, limit: number, randomOffset = false, maxPages = 5, requireBrazilian = true, maxDuration = 120): Promise<VideoData[]> {
  const videos: VideoData[] = [];
  const seenIds = new Set<string>();

  const addVideo = (item: any) => {
    const dur = item?.duration || 0;
    const w = item?.width || 0;
    const h = item?.height || 0;
    if (w > 0 && h > 0 && h < w * 1.5) return;
    if (dur <= 0 || dur > maxDuration) return;
    if (requireBrazilian && !isBrazilianContent(item)) return;

    const vid: VideoData = {
      tiktok_id: String(item?.video_id || item?.id || crypto.randomUUID()),
      title: item?.title || 'Vídeo sem título',
      thumbnail: item?.cover || item?.origin_cover || null,
      views: parseInt(item?.play_count || 0),
      likes: parseInt(item?.digg_count || 0),
      comments: parseInt(item?.comment_count || 0),
      shares: parseInt(item?.share_count || 0),
      duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
      author: item?.author?.unique_id || item?.author?.nickname || 'desconhecido',
      video_url: item?.play || item?.hdplay || null,
      source_url: `https://www.tiktok.com/@${item?.author?.unique_id || 'user'}/video/${item?.video_id || item?.id || ''}`,
      status: 'pending',
      hashtag,
    };

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
      body: `keywords=${encodeURIComponent('#' + hashtag)}&count=200&cursor=${cursor}&HD=1&region=BR`,
    });

    if (!res.ok) return null;
    return await res.json();
  };

  try {
    const seedCursors = randomOffset
      ? [0, 20, 60, 120, 240, Math.floor(Math.random() * 400)]
      : [0, 20, 60, 120];

    for (const seedCursor of seedCursors) {
      if (videos.length >= limit) break;

      let nextCursor: number | string | undefined = seedCursor;
      let pages = 0;

      while (videos.length < limit && nextCursor !== undefined && nextCursor !== null && pages < maxPages) {
        pages++;
        try {
          const pageData = await fetchPage(nextCursor);
          const pageItems = pageData?.data?.videos || [];
          if (pageItems.length === 0) break;

          for (const item of pageItems) {
            if (videos.length >= limit) break;
            addVideo(item);
          }

          const returnedCursor = pageData?.data?.cursor;
          if (!returnedCursor || returnedCursor === nextCursor) break;
          nextCursor = returnedCursor;
        } catch {
          break;
        }
      }
    }

    console.log(`[Strategy 2] TikWM total: ${videos.length} videos (maxPages=${maxPages}, requireBrazilian=${requireBrazilian})`);
  } catch (err) {
    console.log('[Strategy 2] TikWM error:', err);
  }
  return videos;
}

async function scrapeEnsave(hashtag: string, limit: number, maxDuration = 40, requireBrazilian = true): Promise<VideoData[]> {
  const videos: VideoData[] = [];
  try {
    const res = await fetch(`https://ensave.io/api/tiktok/hashtag/${encodeURIComponent(hashtag)}?count=${Math.min(limit, 50)}`, {
      headers: { 'User-Agent': randomUA() },
    });
    if (!res.ok) return videos;
    const data = await res.json();
    const items = data?.data || data?.items || data?.videos || [];

    for (const item of items) {
      if (videos.length >= limit) break;
      const v = parseVideoItem(item, hashtag, maxDuration, requireBrazilian);
      if (v && !videos.some(e => e.tiktok_id === v.tiktok_id)) videos.push(v);
    }
  } catch (err) {
    console.log('[Strategy 3] Ensave error:', err);
  }
  return videos;
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
    const { hashtag = 'viral', limit = 50, keyword, force = false, light = false } = await req.json().catch(() => ({}));
    const searchTerm = (keyword || hashtag).replace('#', '').trim().toLowerCase();
    const requestedLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

    // ── LIGHT MODE: skip ALL DB operations, just scrape and return ──
    if (light) {
      console.log(`[LIGHT] Scraping #${searchTerm}, limit=${requestedLimit}`);
      
      // Run strategies in parallel with deeper TikWM pagination for higher volume
      const [htmlVideos, tikwmVideos, ensaveVideos] = await Promise.all([
        scrapeDirectHTML(searchTerm, Math.min(requestedLimit * 2, 1000), 120, false),
        scrapeTikWM(searchTerm, Math.min(requestedLimit * 3, 1000), true, 6, false, 120),
        scrapeEnsave(searchTerm, Math.min(requestedLimit * 2, 200), 120, false),
      ]);

      // Merge and dedupe
      const seenIds = new Set<string>();
      const videos: VideoData[] = [];
      for (const v of [...htmlVideos, ...tikwmVideos, ...ensaveVideos]) {
        if (!seenIds.has(v.tiktok_id)) {
          seenIds.add(v.tiktok_id);
          videos.push(v);
        }
      }

      // Shuffle for variety
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
      }

      const result = uniqueByVideoKey(videos).slice(0, requestedLimit);
      console.log(`[LIGHT] #${searchTerm}: ${result.length} videos (html=${htmlVideos.length}, tikwm=${tikwmVideos.length}, ensave=${ensaveVideos.length})`);

      return new Response(
        JSON.stringify({
          success: true,
          videos_found: result.length,
          new_scraped: result.length,
          from_cache: false,
          strategy: 'light',
          videos: result,
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

      const [htmlVideos, tikwmVideos, ensaveVideos] = await Promise.all([
        scrapeDirectHTML(searchTerm, limit * 2, 40, true),
        scrapeTikWM(searchTerm, limit * 2, true, 5, true, 120),
        scrapeEnsave(searchTerm, limit, 40, true),
      ]);

      const strategies: string[] = [];
      if (htmlVideos.length > 0) strategies.push('direct_html');
      if (tikwmVideos.length > 0) strategies.push('tikwm');
      if (ensaveVideos.length > 0) strategies.push('ensave');
      strategyUsed = strategies.join('+') || 'none';

      const seenIds = new Set<string>();
      for (const v of [...htmlVideos, ...tikwmVideos, ...ensaveVideos]) {
        if (!seenIds.has(v.tiktok_id)) {
          seenIds.add(v.tiktok_id);
          videos.push(v);
        }
      }

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
