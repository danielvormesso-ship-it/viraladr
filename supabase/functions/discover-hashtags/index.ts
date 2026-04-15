const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function sbHeaders() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };
}

function sbUrl(path: string) {
  return `${Deno.env.get('SUPABASE_URL')!}/rest/v1/${path}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, category } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Tópico é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_KEYS = [
      Deno.env.get('GEMINI_API_KEY'),
      Deno.env.get('GEMINI_API_KEY_2'),
      Deno.env.get('GEMINI_API_KEY_3'),
    ].filter(Boolean) as string[];
    if (GEMINI_KEYS.length === 0) throw new Error('No GEMINI_API_KEY configured');

    // Check if we already have recent discoveries for this topic (last 24h)
    const cacheRes = await fetch(
      sbUrl(`trending_hashtags?category=eq.${encodeURIComponent(category || topic)}&order=last_discovered_at.desc&limit=20`),
      { headers: sbHeaders() }
    );
    const cached = cacheRes.ok ? await cacheRes.json() : [];
    
    if (cached.length >= 5) {
      const newest = new Date(cached[0].last_discovered_at);
      const hoursAgo = (Date.now() - newest.getTime()) / 3600000;
      if (hoursAgo < 24) {
        console.log(`Cache HIT: ${cached.length} trending hashtags for "${topic}" (${hoursAgo.toFixed(1)}h ago)`);
        return new Response(
          JSON.stringify({ success: true, hashtags: cached, from_cache: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use AI to discover related hashtags — rotate keys on 429
    const discoverPrompt = `Você é um especialista em TikTok brasileiro. Para o tópico/nicho "${topic}", descubra hashtags REAIS e ATIVAS no TikTok que tragam vídeos relevantes.

RETORNE JSON PURO sem markdown:
{"hashtags":[{"tag":"nome","emoji":"🎭","label":"Nome Legível","related":["tag1","tag2"],"score":85}]}

REGRAS:
1. Gere 15-25 hashtags REAIS do TikTok brasileiro relacionadas a "${topic}"
2. Inclua hashtags de NICHO ESPECÍFICO (não genéricas como viral, fyp, trending)
3. Inclua hashtags de TENDÊNCIAS RECENTES (trends de IA, novelas, memes atuais)
4. Cada hashtag deve ter um score de 0-100 (quanto maior, mais conteúdo tem)
5. Inclua 2-3 tags "related" para cada hashtag
6. Use emojis relevantes para cada hashtag
7. Foque em hashtags que REALMENTE existem e são usadas no TikTok BR
8. Inclua variações: com e sem acento, abreviadas, etc.

Exemplos de boas hashtags para nichos:
- Trends IA: iatransforma, iatrend, filtrodeia, noveladeia, frutasia, animaliaia
- Novelas: novelaantiga, novelinha, cenasiconica, personagem, atuacao
- Desafio: desafiotiktok, challenge, desafiodancinha, desafioviral
- Satisfying: satisfying, relaxante, oddlysatisfying, asmrbr
- Curiosidade: vocesabia, curiosidade, fatocurioso, mundocurioso`;

    let response: Response | null = null;
    for (const key of GEMINI_KEYS) {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-2.0-flash', messages: [{ role: 'user', content: discoverPrompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok || response.status !== 429) break;
      console.warn(`[discover-hashtags] 429 with key ...${key.slice(-6)}, trying next`);
    }

    if (!response || !response.ok) {
      const status = response?.status || 0;
      const errBody = await response?.text().catch(() => '') || '';
      console.error(`[discover-hashtags] Gemini ${status}: ${errBody}`);
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit em todas as chaves, tente novamente.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*"hashtags"[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    const hashtags = parsed.hashtags || [];

    // Save discovered hashtags to DB
    const categoryName = category || topic;
    const toSave = hashtags.map((h: any) => ({
      tag: h.tag.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      category: categoryName,
      emoji: h.emoji || '🏷️',
      label: h.label || h.tag,
      related_tags: h.related || [],
      popularity_score: h.score || 50,
      last_discovered_at: new Date().toISOString(),
      is_global: true,
    }));

    if (toSave.length > 0) {
      await fetch(sbUrl('trending_hashtags?on_conflict=tag,category'), {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify(toSave),
      });
    }

    console.log(`Discovered ${toSave.length} hashtags for "${topic}" (${categoryName})`);

    return new Response(
      JSON.stringify({ success: true, hashtags: toSave, from_cache: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('discover-hashtags error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
