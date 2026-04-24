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
  owner_user_id: string;
}

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

async function getRequesterUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!anonKey || !supabaseUrl) return null;

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': authHeader, 'apikey': anonKey },
  });

  if (!userRes.ok) return null;
  const userData = await userRes.json().catch(() => null);
  return userData?.id || null;
}

// ---- Brazilian content detection ----
function isBrazilianContent(item: any): boolean {
  const text = `${item?.title || ''} ${item?.desc || ''}`.toLowerCase();
  const ptChars = /[ãõáéíóúâêôçà]/.test(text);
  if (ptChars) return true;
  
  const ptWords = ['kkk','vc','pra','mano','gente','muito','quando','porque','voce','você','não','nao','brasil','dancinha','novelinha','pegadinha','zoeira','humor','parati','olha','então','entao','também','né','tá','cara','mds','slc'];
  const ptCount = ptWords.filter(w => new RegExp(`\\b${w}`, 'i').test(text)).length;
  if (ptCount >= 2) return true;
  
  const authorRegion = item?.author?.region || '';
  if (authorRegion.toUpperCase() === 'BR') return true;
  
  const enWords = ['the','this','that','with','have','from','they','been','would','could','about','their','which','when','your','what'];
  const enCount = enWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(text)).length;
  if (enCount >= 3 && ptCount === 0) return false;
  if (!ptChars && ptCount === 0 && text.trim().length > 20) return false;
  
  return text.trim().length < 10 || ptCount >= 1;
}

// Search TikWM trending/foryou with different keywords to get diverse BR videos
async function scrapeTikWMTrending(
  keywords: string[],
  targetCount: number,
  minViews: number,
  minLikes: number,
  minShares: number,
  minComments: number,
  existingIds: Set<string>,
): Promise<VideoData[]> {
  const videos: VideoData[] = [];
  const seenIds = new Set<string>(existingIds);

  for (const keyword of keywords) {
    if (videos.length >= targetCount) break;

    const cursors = [0, Math.floor(Math.random() * 100), Math.floor(Math.random() * 300)];

    for (const cursor of cursors) {
      if (videos.length >= targetCount) break;

      try {
        const res = await fetch('https://www.tikwm.com/api/feed/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': randomUA(),
          },
          body: `keywords=${encodeURIComponent(keyword)}&count=100&cursor=${cursor}&HD=1&region=BR`,
        });

        if (!res.ok) continue;
        const data = await res.json();
        const items = data?.data?.videos || [];

        for (const item of items) {
          if (videos.length >= targetCount) break;

          const w = item?.width || 0;
          const h = item?.height || 0;
          if (w > 0 && h > 0 && h < w * 1.6) continue;

          const dur = item?.duration || 0;
          if (dur <= 0 || dur > 45) continue;

          const tiktokId = String(item?.video_id || item?.id || '');
          if (!tiktokId || seenIds.has(tiktokId)) continue;

          // Brazilian filter
          if (!isBrazilianContent(item)) continue;

          const views = parseInt(item?.play_count || 0);
          const likes = parseInt(item?.digg_count || 0);
          const shares = parseInt(item?.share_count || 0);
          const comments = parseInt(item?.comment_count || 0);

          if (views < minViews || likes < minLikes || shares < minShares || comments < minComments) continue;

          seenIds.add(tiktokId);
          videos.push({
            tiktok_id: tiktokId,
            title: item?.title || 'Vídeo sem título',
            thumbnail: item?.cover || item?.origin_cover || null,
            views,
            likes,
            comments,
            shares,
            duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
            author: item?.author?.unique_id || item?.author?.nickname || 'desconhecido',
            video_url: item?.play || item?.hdplay || null,
            source_url: `https://www.tiktok.com/@${item?.author?.unique_id || 'user'}/video/${tiktokId}`,
            status: 'pending',
            hashtag: 'foryou',
            owner_user_id: '',
          });
        }

        // Paginate
        let nextCursor = data?.data?.cursor;
        let pages = 0;
        while (videos.length < targetCount && nextCursor && pages < 8) {
          pages++;
          try {
            const pageRes = await fetch('https://www.tikwm.com/api/feed/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': randomUA(),
              },
              body: `keywords=${encodeURIComponent(keyword)}&count=100&cursor=${nextCursor}&HD=1&region=BR`,
            });
            if (!pageRes.ok) break;
            const pageData = await pageRes.json();
            const pageItems = pageData?.data?.videos || [];
            if (pageItems.length === 0) break;

            for (const item of pageItems) {
              if (videos.length >= targetCount) break;
              const w2 = item?.width || 0;
              const h2 = item?.height || 0;
              if (w2 > 0 && h2 > 0 && h2 < w2 * 1.6) continue;
              const dur2Check = item?.duration || 0;
              if (dur2Check <= 0 || dur2Check > 45) continue;

              const tiktokId2 = String(item?.video_id || item?.id || '');
              if (!tiktokId2 || seenIds.has(tiktokId2)) continue;

              if (!isBrazilianContent(item)) continue;

              const views2 = parseInt(item?.play_count || 0);
              const likes2 = parseInt(item?.digg_count || 0);
              const shares2 = parseInt(item?.share_count || 0);
              const comments2 = parseInt(item?.comment_count || 0);

              if (views2 < minViews || likes2 < minLikes || shares2 < minShares || comments2 < minComments) continue;

              const dur2 = item?.duration || 0;
              seenIds.add(tiktokId2);
              videos.push({
                tiktok_id: tiktokId2,
                title: item?.title || 'Vídeo sem título',
                thumbnail: item?.cover || item?.origin_cover || null,
                views: views2,
                likes: likes2,
                comments: comments2,
                shares: shares2,
                duration: `${Math.floor(dur2 / 60)}:${String(dur2 % 60).padStart(2, '0')}`,
                author: item?.author?.unique_id || item?.author?.nickname || 'desconhecido',
                video_url: item?.play || item?.hdplay || null,
                source_url: `https://www.tiktok.com/@${item?.author?.unique_id || 'user'}/video/${tiktokId2}`,
                status: 'pending',
                hashtag: 'foryou',
                owner_user_id: '',
              });
            }
            nextCursor = pageData?.data?.cursor;
          } catch { break; }
        }
      } catch (err) {
        console.log(`TikWM error for "${keyword}":`, err);
      }
    }
  }

  console.log(`FYP scrape total: ${videos.length} BR videos from ${keywords.length} keywords`);
  return videos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await getRequesterUserId(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      quantity = 50,
      minViews = 0,
      minLikes = 0,
      minShares = 0,
      minComments = 0,
    } = await req.json().catch(() => ({}));

    const targetCount = Math.min(Math.max(1, quantity), 500);
    console.log(`FYP request: user=${userId}, qty=${targetCount}, minViews=${minViews}, minLikes=${minLikes}`);

    // Get existing tiktok_ids for this user to avoid duplicates
    const existingRes = await fetch(
      sbUrl(`tiktok_videos?owner_user_id=eq.${userId}&select=tiktok_id&limit=1000`),
      { headers: sbHeaders() }
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    const existingIds = new Set<string>(existingRows.map((r: any) => r.tiktok_id).filter(Boolean));

    // Diverse trending search keywords focused on Brazilian content
    const trendingKeywords = [
      'viral brasil', 'tiktokbrasil', 'humor brasileiro', 'dancinha',
      'pegadinha', 'novelinha', 'zoeira', 'comedia brasileira',
      'memes brasil', 'engraçado', 'risada', 'trollagem',
      'desafio brasil', 'react brasil', 'storytime brasil',
      'satisfying brasil', 'fyp brasil', 'parati',
      'trend brasil', 'challenge brasil', 'viral br',
    ];

    // Shuffle keywords for variety each search
    const shuffled = [...trendingKeywords].sort(() => Math.random() - 0.5);

    const videos = await scrapeTikWMTrending(
      shuffled,
      targetCount,
      minViews,
      minLikes,
      minShares,
      minComments,
      existingIds,
    );

    // Set owner and save to DB
    if (videos.length > 0) {
      const withOwner = videos.map(v => ({ ...v, owner_user_id: userId }));

      for (let i = 0; i < withOwner.length; i += 50) {
        const batch = withOwner.slice(i, i + 50);
        const insertRes = await fetch(sbUrl('tiktok_videos?on_conflict=owner_user_id,tiktok_id'), {
          method: 'POST',
          headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(batch),
        });
        if (!insertRes.ok) {
          console.error('DB error:', await insertRes.text());
        }
      }
      console.log(`Saved ${videos.length} FYP videos for user=${userId}`);
    }

    // Return all user's videos ordered by views
    const allRes = await fetch(
      sbUrl(`tiktok_videos?owner_user_id=eq.${userId}&select=*&order=views.desc.nullslast&limit=${Math.max(targetCount, 400)}`),
      { headers: sbHeaders() }
    );
    const allVideos = allRes.ok ? await allRes.json() : [];

    return new Response(
      JSON.stringify({
        success: true,
        new_scraped: videos.length,
        total_available: allVideos.length,
        target: targetCount,
        videos: allVideos,
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
