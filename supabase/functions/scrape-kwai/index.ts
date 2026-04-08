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

    const { page = 1, limit = 50 } = await req.json().catch(() => ({}));

    // Scrape Kwai trending/viral page
    const kwaiUrls = [
      'https://www.kwai.com/discover',
      'https://www.kwai.com/',
      'https://m.kwai.com/',
    ];

    const allVideos: any[] = [];

    for (const url of kwaiUrls) {
      try {
        console.log(`Scraping: ${url}`);
        
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
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

        const data = await response.json();

        if (!response.ok) {
          console.error(`Firecrawl error for ${url}:`, data);
          continue;
        }

        // Extract video links from the scraped page
        const links = data.data?.links || data.links || [];
        const markdown = data.data?.markdown || data.markdown || '';

        // Parse video data from links and markdown
        const videoLinks = links.filter((link: string) => 
          link.includes('/video/') || 
          link.includes('/short-video/') ||
          link.includes('kwai.com/@')
        );

        // For each video link found, try to scrape individual video pages
        for (const videoLink of videoLinks.slice(0, limit)) {
          try {
            const videoResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: videoLink,
                formats: [
                  { 
                    type: 'json', 
                    prompt: 'Extract the video title, author username, view count (as number), like count (as number), comment count (as number), share count (as number), video duration, thumbnail image URL, and video download URL. Return as JSON with fields: title, author, views, likes, comments, shares, duration, thumbnail, videoUrl' 
                  },
                  'screenshot'
                ],
                waitFor: 2000,
              }),
            });

            const videoData = await videoResponse.json();

            if (videoResponse.ok) {
              const extracted = videoData.data?.json || videoData.json || {};
              const screenshot = videoData.data?.screenshot || videoData.screenshot;

              if (extracted.title) {
                allVideos.push({
                  kwai_id: videoLink.split('/').pop() || crypto.randomUUID(),
                  title: extracted.title || 'Vídeo sem título',
                  thumbnail: extracted.thumbnail || screenshot || null,
                  views: parseInt(extracted.views) || 0,
                  likes: parseInt(extracted.likes) || 0,
                  comments: parseInt(extracted.comments) || 0,
                  shares: parseInt(extracted.shares) || 0,
                  duration: extracted.duration || '0:00',
                  author: extracted.author || 'desconhecido',
                  video_url: extracted.videoUrl || null,
                  source_url: videoLink,
                  status: 'pending',
                });
              }
            }
          } catch (videoErr) {
            console.error(`Error scraping video ${videoLink}:`, videoErr);
          }
        }
      } catch (err) {
        console.error(`Error scraping ${url}:`, err);
      }
    }

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (allVideos.length > 0) {
      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/kwai_videos`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(allVideos),
      });

      if (!insertResponse.ok) {
        const err = await insertResponse.text();
        console.error('DB insert error:', err);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        videos_found: allVideos.length,
        videos: allVideos 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-kwai:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
