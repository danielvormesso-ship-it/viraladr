import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json();

    if (!description) {
      return new Response(
        JSON.stringify({ error: "Descrição é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: `Especialista TikTok Brasil. Descrição do usuário: "${description}"

Retorne JSON PURO sem markdown:
{"hashtags":[{"tag":"x","relevance":"alta"}],"genderFilter":"female"|"male"|"none","excludeKeywords":["word1","word2"],"contentType":"dancing"|"funny"|"lifestyle"|"general"}

REGRAS ABSOLUTAS - LEIA COM ATENÇÃO:

1. FOCO VISUAL: As hashtags devem trazer EXATAMENTE o conteúdo VISUAL descrito.
   - "mulher dançando" = hashtags que mostrem MULHERES REAIS DANÇANDO em vídeo
   - NÃO inclua hashtags de GÊNERO MUSICAL (bregafunk, funk, pagode, sertanejo, reggaeton)
   - NÃO inclua hashtags de MOOD/STATUS (nostalgia, statusvideo, reflexão, motivação)

2. HASHTAGS OBRIGATÓRIAS POR TIPO DE CONTEÚDO:
   - Se o usuário pedir DANÇA/DANÇANDO/DANCINHA → SEMPRE inclua "dancinha" como relevância ALTA (essa é a melhor hashtag do TikTok para conteúdo de dança, com 4M+ de publicações)
   - Se pedir MULHER dançando → inclua também: "mulherdançando", "garotadançando", "dancafeminina" como alta relevância
   - Essas hashtags são INFINITAS em conteúdo e devem ser priorizadas

3. HASHTAGS PROIBIDAS (NUNCA use estas):
   fyp, viral, trending, foryou, parati, dance, music, song, lyrics, audio, 
   bregafunk, funk, pagode, sertanejo, forró, trap, rap, hiphop, reggaeton,
   nostalgia, status, statusvideo, reflexão, motivação, frases, pensamentos,
   sheesh, fancam, kpop, stan, idol, anime, edit, tutorial, photoshop

4. GERE 10-15 hashtags que descrevam a AÇÃO VISUAL, não o gênero musical:
   BONS exemplos para "mulher dançando": dancinha, mulherdançando, dancafeminina, garotadançando, 
   novinhadançando, morenalinda, tiktokmulher, corporeal, dançarina, 
   lindadançando, mulherbonita, gatadançando, corpofeminino
   
   MAUS exemplos (NUNCA use): bregafunk, funk, nostalgia, statusvideo, musica, audio

5. FILTRO DE GÊNERO:
   - MULHER/MINA/GAROTA/GATA/GOSTOSA/BONITA/LINDA → genderFilter="female"
   - HOMEM/CARA/GAROTO/MANO → genderFilter="male"  
   - Neutro → genderFilter="none"

6. excludeKeywords OBRIGATÓRIOS (SEMPRE incluir todos):
   ["animação","cartoon","desenho","anime","mascote","personagem","boneco","puppet","lego","minecraft","lyrics","letra","song","tutorial","photoshop","edit","gato","cat","dog","pet","cachorro","animal","pássaro","bird","hamster","coelho","kpop","k-pop","fancam","stan","idol","oppa","pinay","pinoy","habibi","nostalgia","status","statusvideo","reflexão","motivação","frases","audio","música","clip","videoclipe","oficial","official"]
   - Para female ADICIONAR: ["mano","cara","brother","garoto","menino","boy","man","bro","pai","king","homem"]
   - Para male ADICIONAR: ["mina","gata","menina","garota","girl","she","mãe","queen","mulher"]

relevance: "alta", "media", "baixa"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*"hashtags"[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const hashtags = parsed.hashtags || [];
    const genderFilter = parsed.genderFilter || "none";
    const excludeKeywords = parsed.excludeKeywords || [];
    const contentType = parsed.contentType || "general";

    console.log(`"${description}" -> gender:${genderFilter}, type:${contentType}, tags: ${hashtags.map((h: any) => h.tag).join(', ')}, exclude: ${excludeKeywords.join(',')}`);

    return new Response(
      JSON.stringify({ success: true, hashtags, genderFilter, excludeKeywords, contentType, description }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-hashtag-suggest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
