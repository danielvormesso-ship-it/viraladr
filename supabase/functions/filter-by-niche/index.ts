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
  lifestyle_rotina: "gameplay, jogo, gamer, política, eleição, tutorial técnico, kpop, k-pop, pegadinha, trolagem",
  lifestyle_viagem: "pegadinha, trolagem, gameplay, jogo, gamer, kpop, k-pop, política, eleição, fitness, academia, receita",
  // IA & Novelas
  ia_novela: "pegadinha, trolagem, receita, culinária, fitness, academia, treino, kpop, k-pop, gameplay, jogo, gamer, política, eleição, notícia, tragédia, unboxing, organização",
  // Casa & Organização — sub-grupos
  casa_unboxing: "pegadinha, trolagem, humor, comédia, dancinha, receita, culinária, comida, fitness, academia, treino, gameplay, jogo, gamer, romance, casal, política, eleição, notícia, tragédia, paisagem, viagem, turismo, ASMR, kpop, k-pop, música",
  casa_organizacao: "pegadinha, trolagem, humor, comédia, dancinha, gameplay, jogo, gamer, política, eleição, notícia, tragédia, romance, casal, kpop, k-pop, viagem, turismo, fitness, academia, música",
  casa_decoracao: "pegadinha, humor, dança, gameplay, política, kpop, receita, fitness",
  casa_faxina: "pegadinha, humor, dança, gameplay, política, kpop, receita, fitness, decoração",
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

const NICHE_INSTRUCTIONS: Record<string, string> = {
  humor: "APROVAR: pegadinhas, trotes, câmera escondida, trolagem, susto, armadilha, humor, piada, meme, zueira, fail, queda engraçada, situação cômica, risada. REJEITAR: qualquer vídeo sem elemento de humor, surpresa ou engano. Vídeo sério/informativo → REJEITAR.",
  viral: "APROVAR: trending, viral, react, story time, conteúdo para viralizar, desafio viral, vídeo curto impactante. REJEITAR: tutoriais longos e detalhados, receitas passo a passo, gameplay completo.",
  lifestyle_danca: "APROVAR: dança, coreografia, passinho, dancinha, ballet, funk dance, dancetrend, dançando. REJEITAR: qualquer vídeo sem elemento de dança ou movimento corporal coreografado.",
  lifestyle_musica: "APROVAR: cantando, cover, clipe, show, performance musical, instrumento, vocal, música ao vivo, karaoke. REJEITAR: qualquer vídeo sem elemento musical — pessoa cantando ou tocando.",
  lifestyle_rotina: "APROVAR: dia a dia, rotina matinal, rotina noturna, dayinmylife, morning routine, vida cotidiana, produtividade pessoal. REJEITAR: vídeo sem contexto de rotina ou cotidiano pessoal.",
  lifestyle_viagem: "APROVAR: turismo, destinos, passeio, lugar bonito, hotel, praia, cidade, ponto turístico, mochilão, viajando. REJEITAR: vídeo sem contexto de viagem, lugar ou turismo.",
  ia_novela: "APROVAR: filtro de IA, transformação com IA, novela, cena de novela, personagem IA, novela antiga, cenas icônicas, IA cria, IA transforma. REJEITAR: vídeo sem referência a IA ou novela/dramaturgia.",
  casa_unboxing: "APROVAR: abertura de caixa, produto novo, compras, haul, recebidos, review de produto, encomenda, unboxing. REJEITAR: saúde, esporte, comida/receita, luta, música, dança, paisagem, viagem.",
  casa_organizacao: "APROVAR: organização de casa, arrumando, limpeza, decoração, antes e depois de cômodo, faxina, armário organizado, home tour. REJEITAR: vídeo sem contexto de organização, arrumação ou decoração de ambientes.",
  casa_decoracao: "APROVAR: decoração, reforma, antes e depois de ambiente, móveis, sofá, almofadas, painel, instalação, home decor, casa nova, transformação de cômodo. REJEITAR: sem contexto de decoração ou reforma.",
  casa_faxina: "APROVAR: faxina, limpeza da casa, diarista, casa limpa, antes e depois de limpeza, produtos de limpeza, rotina de faxina, limpeza profunda. REJEITAR: sem contexto de limpeza ou faxina.",
  dicas_receita: "APROVAR: cozinhando, receita, prato, gastronomia, comida, ingredientes, modo de preparo, sobremesa, lanche. REJEITAR: vídeo sem contexto culinário — sem comida sendo preparada ou apresentada.",
  dicas_fitness: "APROVAR: treino, exercício, academia, musculação, cardio, shape, série de exercícios, agachamento, supino, corrida. REJEITAR: vídeo sem contexto de exercício físico ou atividade esportiva.",
  dicas_tutorial: "APROVAR: ensinando algo, passo a passo, como fazer, DIY, tutorial, dica prática, hack, truque útil. REJEITAR: vídeo sem contexto educativo — não está ensinando nada.",
  dicas_motivacao: "APROVAR: superação, motivação, mindset, inspiração, frase motivacional, história de superação, empreendedorismo. REJEITAR: vídeo sem contexto motivacional ou inspiracional.",
  dicas_curiosidade: "APROVAR: fatos curiosos, você sabia, ciência, descoberta, informação surpreendente, mundo curioso, história interessante. REJEITAR: vídeo sem fato curioso ou informação — puro entretenimento sem valor informativo.",
  hook: "APROVAR: desafio, react, chocante, revelação, transformação, exposed, antes e depois, polêmico, surpresa, reviravolta. REJEITAR: receita, tutorial técnico, fitness detalhado, meditação.",
  satisfying: "APROVAR: satisfatório, organizado visualmente, limpeza satisfatória, relaxante, ASMR visual, slime, corte satisfatório, oddly satisfying. REJEITAR: conteúdo agitado, pegadinha, política, humor sem elemento visual satisfatório.",
};

function getGroupFromKeywords(nicheKeywords: string[] | undefined, nicheDescription: string): string {
  const text = [...(nicheKeywords || []), nicheDescription].join(' ').toLowerCase();
  // Sub-grupos específicos primeiro
  if (/unboxing/.test(text)) return 'casa_unboxing';
  if (/decoracao|decoração|reforma|homedecor|casanova|moveis|móveis/.test(text)) return 'casa_decoracao';
  if (/faxina|diarista|limpezadacasa|casalimpa/.test(text)) return 'casa_faxina';
  if (/organizacao|organização|arrumando|limpeza/.test(text)) return 'casa_organizacao';
  if (/dancinha|danca|dança|coreografia/.test(text)) return 'lifestyle_danca';
  if (/musica|música|cantando|cover|sertanejo|funk|pagode/.test(text)) return 'lifestyle_musica';
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

async function filterBatch(batch: VideoToFilter[], nicheDescription: string, nicheKeywords: string[] | undefined, apiKey: string, rejectList: string, nicheInstructions: string): Promise<string[]> {
  const videoList = batch.map((v, idx) =>
    `${idx + 1}. [${v.id}] "${v.title}" (autor: ${v.author || 'desconhecido'})`
  ).join('\n');

  const prompt = `Você é um filtro RIGOROSO de nicho para vídeos do TikTok brasileiro.

O editor busca: "${nicheDescription}"
${nicheKeywords?.length ? `Palavras-chave do nicho: ${nicheKeywords.join(', ')}` : ''}

INSTRUÇÕES ESPECÍFICAS DESTE NICHO:
${nicheInstructions}

REGRAS GERAIS:
- Título em inglês, espanhol, alemão ou outro idioma estrangeiro → REJEITAR (exceto palavras comuns como "fail", "react", "challenge")
- Título de trend/filtro sem relação (mewing, AI filter, manga filter, kpop dance) → REJEITAR
- Slideshow de fotos, paisagem sem contexto, propaganda → REJEITAR
- REJEITAR OBRIGATORIAMENTE conteúdo destes nichos: ${rejectList}
- Título curto/genérico em PT ("kkk", "olha", "mds") sem sinal de outro nicho → APROVAR só se puder ser do nicho

REGRA CRÍTICA: Se o vídeo CLARAMENTE é de outro nicho → REJEITAR sem hesitar.
Na DÚVIDA entre aprovar e rejeitar → REJEITAR. Prefira falso negativo a falso positivo.

Responda APENAS com JSON puro sem markdown:
{"approved": ["id1", "id2"], "rejected": ["id3"]}

Vídeos:
${videoList}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
    const nicheInstructions = NICHE_INSTRUCTIONS[group] || NICHE_INSTRUCTIONS.viral;
    console.log(`Niche filter: group=${group}, instructions=${nicheInstructions.slice(0, 60)}...`);
    const results = await Promise.all(
      batches.map(batch => filterBatch(batch, nicheDescription, nicheKeywords, GEMINI_API_KEY, rejectList, nicheInstructions))
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
