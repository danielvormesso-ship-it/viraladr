import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VideoToFilter {
  id: string;
  title: string;
  author: string | null;
}

const NICHE_REJECT_MAP: Record<string, string> = {
  // Humor & Entretenimento
  humor: "música, kpop, k-pop, receita, culinária, cozinha, fitness, academia, treino, musculação, gameplay, jogo, gamer, notícia, tragédia, acidente, morte, crime, polícia, preso, vítima, política, eleição, governo, viagem, turismo, maquiagem, skincare, tutorial técnico, ASMR, unboxing, romance, casal, slideshow de foto, paisagem, decoração, organização, meditação, yoga, nutrição, dieta",
  // Trends & Viral
  viral: "receita detalhada, passo a passo culinário, tutorial técnico longo, fitness detalhado, série de exercícios, maquiagem tutorial, gameplay longo, partida completa, política, eleição, governo, kpop, k-pop",
  // Lifestyle — sub-grupos
  lifestyle_danca: "pegadinha, trolagem, receita, culinária, gameplay, jogo, gamer, notícia, tragédia, política, eleição, tutorial técnico, kpop, k-pop, unboxing, organização",
  lifestyle_musica: "pegadinha, trolagem, gameplay, jogo, gamer, tutorial técnico, política, eleição, fitness, academia, receita, culinária",
  lifestyle_asmr: "pegadinha, trolagem, gameplay, jogo, gamer, notícia, política, eleição, kpop, k-pop, música agitada, funk, dancinha, pegadinha",
  lifestyle_rotina: "gameplay, jogo, gamer, política, eleição, tutorial técnico, kpop, k-pop, pegadinha, trolagem",
  lifestyle_viagem: "pegadinha, trolagem, gameplay, jogo, gamer, kpop, k-pop, política, eleição, fitness, academia, receita",
  // IA & Novelas
  ia_novela: "pegadinha, trolagem, receita, culinária, fitness, academia, treino, kpop, k-pop, gameplay, jogo, gamer, política, eleição, notícia, tragédia, unboxing, organização",
  // Casa & Organização — sub-grupos
  casa_unboxing: "pegadinha, trolagem, humor, comédia, dancinha, receita, culinária, comida, fitness, academia, treino, gameplay, jogo, gamer, romance, casal, política, eleição, notícia, tragédia, paisagem, viagem, turismo, ASMR, kpop, k-pop, música",
  casa_organizacao: "pegadinha, trolagem, humor, comédia, dancinha, gameplay, jogo, gamer, política, eleição, notícia, tragédia, romance, casal, kpop, k-pop, viagem, turismo, fitness, academia, música",
  // Dicas — sub-grupos
  dicas_receita: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, política, eleição, dancinha, humor, comédia, fitness, academia, maquiagem",
  dicas_fitness: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, política, eleição, receita culinária, cozinha, maquiagem, dancinha, humor",
  dicas_tutorial: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, política, eleição, humor, comédia, dancinha",
  dicas_motivacao: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, receita, culinária, humor, comédia, dancinha, maquiagem",
  dicas_curiosidade: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, música, dancinha, maquiagem, fitness",
  // Hook forte
  hook: "receita, culinária, tutorial técnico, fitness detalhado, série de exercícios, ASMR, meditação, yoga, kpop, k-pop, organização, decoração",
  // Satisfying & Curiosidades
  satisfying: "pegadinha, trolagem, gameplay, jogo, gamer, notícia, tragédia, política, eleição, kpop, k-pop, música agitada, funk, dancinha, humor, comédia",
};

function getGroupFromKeywords(nicheKeywords: string[] | undefined, nicheDescription: string): string {
  const text = [...(nicheKeywords || []), nicheDescription].join(' ').toLowerCase();
  // Sub-grupos específicos primeiro
  if (/unboxing/.test(text)) return 'casa_unboxing';
  if (/organizacao|organização|arrumando|limpeza|faxina/.test(text)) return 'casa_organizacao';
  if (/dancinha|danca|dança|coreografia/.test(text)) return 'lifestyle_danca';
  if (/musica|música|cantando|cover|sertanejo|funk|pagode/.test(text)) return 'lifestyle_musica';
  if (/asmr/.test(text)) return 'lifestyle_asmr';
  if (/rotina|dayinmylife/.test(text)) return 'lifestyle_rotina';
  if (/viagem|turismo|destino/.test(text)) return 'lifestyle_viagem';
  if (/receita|culinária|cozinha/.test(text)) return 'dicas_receita';
  if (/fitness|treino|academia|musculação|musculacao/.test(text)) return 'dicas_fitness';
  if (/tutorial|comofazer|passoapasso/.test(text)) return 'dicas_tutorial';
  if (/motivacao|motivação|superacao|inspiracao/.test(text)) return 'dicas_motivacao';
  if (/curiosidade|vocesabia|fatocurioso/.test(text)) return 'dicas_curiosidade';
  // Grupos gerais
  if (/pegadinha|humor|comedia|comédia|memes|zoeira|risada|fail|troll/.test(text)) return 'humor';
  if (/viral|fyp|trending|storytime|parati|viraltiktok/.test(text)) return 'viral';
  if (/iatransforma|filtrodeia|noveladeia|animaliaia|novelaantiga|cenasiconica|frutasia/.test(text)) return 'ia_novela';
  if (/dica|hack|saude|saúde/.test(text)) return 'dicas_tutorial';
  if (/react|desafio|antesedepois|transformacao|chocante|exposed|polemico|ninguemesperava/.test(text)) return 'hook';
  if (/oddlysatisfying|relaxante|satisfying/.test(text)) return 'satisfying';
  return 'viral';
}

async function filterBatch(batch: VideoToFilter[], nicheDescription: string, nicheKeywords: string[] | undefined, apiKey: string, rejectList: string): Promise<string[]> {
  const videoList = batch.map((v, idx) =>
    `${idx + 1}. [${v.id}] "${v.title}" (autor: ${v.author || 'desconhecido'})`
  ).join('\n');

  const prompt = `Você é um filtro RIGOROSO de nicho para vídeos do TikTok brasileiro.

O editor busca: "${nicheDescription}"
${nicheKeywords?.length ? `Palavras-chave do nicho: ${nicheKeywords.join(', ')}` : ''}

APROVAR APENAS SE:
- O título é claramente relacionado ao nicho "${nicheDescription}"
- Título curto/genérico em PT sem sinal de outro nicho ("kkk", "olha", "mds") — APROVAR só se puder ser do nicho
- Título ambíguo em PT que PODERIA ser do nicho pedido

REJEITAR SE:
- O vídeo CLARAMENTE não pertence ao nicho pedido
- Título em inglês, espanhol, alemão ou outro idioma estrangeiro (exceto palavras comuns como "fail", "react")
- Título de trend/filtro sem relação (mewing, AI filter, manga filter, kpop dance)
- Conteúdo de slideshow de fotos, paisagem sem contexto, propaganda
- REJEITAR OBRIGATORIAMENTE conteúdo destes nichos: ${rejectList}

REGRA CRÍTICA: Se o vídeo CLARAMENTE é de outro nicho → REJEITAR sem hesitar.
Títulos ambíguos em português → APROVAR apenas se puderem razoavelmente ser do nicho "${nicheDescription}".
Na DÚVIDA entre aprovar e rejeitar → REJEITAR. Prefira falso negativo a falso positivo.

Responda APENAS com JSON puro sem markdown:
{"approved": ["id1", "id2"], "rejected": ["id3"]}

Vídeos:
${videoList}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.warn(`AI niche filter failed (${response.status}), auto-approving batch`);
      return batch.map(v => v.id);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*"approved"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.approved || [];
    }
    return batch.map(v => v.id);
  } catch (err) {
    console.warn("Niche filter batch error, auto-approving:", err);
    return batch.map(v => v.id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos, nicheDescription, nicheKeywords } = await req.json() as {
      videos: VideoToFilter[];
      nicheDescription: string;
      nicheKeywords?: string[];
    };

    if (!videos?.length || !nicheDescription) {
      return new Response(
        JSON.stringify({ error: "videos e nicheDescription são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Auto-approve videos with empty/generic titles (no useful signal for AI)
    const NO_TITLE_RE = /^(v[ií]deo\s*sem\s*t[ií]tulo|sem\s*t[ií]tulo|video\s*sem\s*titulo|)$/i;
    const autoApproved: string[] = [];
    const needsAI: VideoToFilter[] = [];
    for (const v of videos) {
      if (NO_TITLE_RE.test(v.title.trim())) {
        autoApproved.push(v.id);
      } else {
        needsAI.push(v);
      }
    }

    const BATCH_SIZE = 60;
    const batches: VideoToFilter[][] = [];
    for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
      batches.push(needsAI.slice(i, i + BATCH_SIZE));
    }

    // Run ALL batches in PARALLEL for maximum speed
    const group = getGroupFromKeywords(nicheKeywords, nicheDescription);
    const rejectList = NICHE_REJECT_MAP[group] || NICHE_REJECT_MAP.viral;
    console.log(`Niche filter: group=${group}, rejectList=${rejectList.slice(0, 60)}...`);
    const results = await Promise.all(
      batches.map(batch => filterBatch(batch, nicheDescription, nicheKeywords, GEMINI_API_KEY, rejectList))
    );

    const approvedIds = new Set<string>(autoApproved);
    results.forEach(ids => ids.forEach(id => approvedIds.add(id)));
    if (autoApproved.length > 0) console.log(`Niche filter: ${autoApproved.length} auto-approved (no title)`);

    console.log(`Niche filter: ${approvedIds.size}/${videos.length} approved for "${nicheDescription}"`);

    return new Response(
      JSON.stringify({
        success: true,
        total: videos.length,
        approved: approvedIds.size,
        rejected: videos.length - approvedIds.size,
        approvedIds: Array.from(approvedIds),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("filter-by-niche error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
