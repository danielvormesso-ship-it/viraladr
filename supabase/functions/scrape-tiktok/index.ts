const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { limit = 20 } = await req.json().catch(() => ({}));
    const allVideos: any[] = [];

    // Scrape aggregator sites that list trending TikTok videos
    const aggregatorUrls = [
      'https://tokcount.com/trending',
      'https://www.tokboard.com/',
      'https://tokchart.com/',
    ];

    for (const url of aggregatorUrls) {
      if (allVideos.length >= limit) break;

      try {
        console.log(`Scraping aggregator: ${url}`);
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['links', 'markdown'],
            waitFor: 3000,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          console.error(`Scrape error for ${url}:`, data);
          continue;
        }

        const links: string[] = data.data?.links || data.links || [];
        const markdown: string = data.data?.markdown || data.markdown || '';

        console.log(`Found ${links.length} links from ${url}`);

        // Extract TikTok video URLs
        const tiktokRegex = /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.]+\/video\/(\d+)/g;
        const foundUrls = new Set<string>();
        
        for (const link of links) {
          const match = link.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
          if (match) foundUrls.add(link);
        }

        let m;
        while ((m = tiktokRegex.exec(markdown)) !== null) {
          foundUrls.add(m[0]);
        }

        console.log(`Found ${foundUrls.size} TikTok video URLs`);

        for (const videoUrl of foundUrls) {
          if (allVideos.length >= limit) break;

          const idMatch = videoUrl.match(/\/video\/(\d+)/);
          const authorMatch = videoUrl.match(/tiktok\.com\/@([\w.]+)/);
          const tiktokId = idMatch![1];

          if (allVideos.some(v => v.tiktok_id === tiktokId)) continue;

          allVideos.push({
            tiktok_id: tiktokId,
            title: `Vídeo viral de @${authorMatch?.[1] || 'unknown'}`,
            thumbnail: null,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            duration: '0:00',
            author: authorMatch?.[1] || 'desconhecido',
            video_url: null,
            source_url: videoUrl,
            status: 'pending',
          });
        }
      } catch (err) {
        console.error(`Error scraping ${url}:`, err);
      }
    }

    // Fallback: if no videos found from aggregators, use Firecrawl search
    if (allVideos.length === 0) {
      console.log('No videos from aggregators, trying search...');
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'site:tiktok.com/@* /video/ viral brasil',
            limit: 20,
            lang: 'pt-br',
            country: 'BR',
          }),
        });

        const data = await res.json();
        if (res.ok) {
          const results = data.data || [];
          console.log(`Search found ${results.length} results`);

          for (const result of results) {
            if (allVideos.length >= limit) break;
            const url = result.url || '';
            const idMatch = url.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
            if (!idMatch) continue;

            const tiktokId = idMatch[1];
            if (allVideos.some(v => v.tiktok_id === tiktokId)) continue;

            const authorMatch = url.match(/tiktok\.com\/@([\w.]+)/);
            allVideos.push({
              tiktok_id: tiktokId,
              title: result.title || result.description || `Vídeo de @${authorMatch?.[1]}`,
              thumbnail: null,
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              duration: '0:00',
              author: authorMatch?.[1] || 'desconhecido',
              video_url: null,
              source_url: url,
              status: 'pending',
            });
          }
        }
      } catch (err) {
        console.error('Search fallback error:', err);
      }
    }

    console.log(`Total videos: ${allVideos.length}`);

    // Save to DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (allVideos.length > 0) {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/tiktok_videos`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(allVideos),
      });

      if (!insertRes.ok) {
        console.error('DB error:', await insertRes.text());
      } else {
        console.log(`Saved ${allVideos.length} to DB`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, videos_found: allVideos.length, videos: allVideos }),
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
