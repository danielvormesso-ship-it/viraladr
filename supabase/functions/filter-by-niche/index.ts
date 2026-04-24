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
  humor: "dancinha coreografia sem humor, receita culinaria longa, tutorial tecnico longo, filme serie oficial promocao, politica eleicao, kpop drama coreano, cover musical sem humor, conteudo sensual/sexualizado/biquini/adulto",
  viral: "receita detalhada longa, tutorial tecnico, politica eleicao, filme oficial promocao, conteudo sensual/sexualizado/biquini/adulto",
  lifestyle_danca: "receita, tutorial tecnico, politica, filme, pegadinha principal",
  lifestyle_musica: "pegadinha, politica, fitness detalhado, receita",
  lifestyle_rotina: "pegadinha, dancinha, receita, filme",
  lifestyle_viagem: "pegadinha, dancinha, receita, fitness",
  ia_novela: "pegadinha real sem IA, receita real sem IA, politica, filme",
  casa_unboxing: "pegadinha, dancinha, receita, musica, politica",
  casa_organizacao: "pegadinha, dancinha, politica, filme, receita",
  casa_decoracao: "pegadinha, dancinha, receita, politica, filme",
  casa_faxina: "pegadinha, dancinha, receita, politica, filme",
  novelas_fruta: "receita real de fruta, politica, pegadinha, filme",
  novelas_drama: "pegadinha real, receita, politica, filme de cinema",
  novelas_cortes: "pegadinha real, receita, politica, novela estrangeira",
  dicas_receita: "dancinha principal, pegadinha, politica, filme",
  dicas_fitness: "dancinha como exercicio, pegadinha, politica, filme",
  dicas_tutorial: "dancinha principal, pegadinha, politica, filme, curso pago",
  dicas_motivacao: "dancinha, pegadinha, politica, gospel, coach vendendo",
  dicas_curiosidade: "dancinha, pegadinha, conspiracao, politica, filme",
  hook: "receita detalhada, tutorial tecnico, meditacao, kpop",
  satisfying: "pegadinha, politica, musica agitada, funk, dancinha",
};

const NICHE_INSTRUCTIONS: Record<string, string> = {
  humor: "APROVAR SE o titulo contém: pegadinha, trote (de rua/adulto/entre amigos), susto, armadilha, zoeira, zueira, trolagem, trolou, trolei, humor, piada, engraçado, engraçada, meme, comedia, fail, queda, rir, risada, kkkk, kkkkk, viral com contexto de reacao, fyp com humor. REJEITAR SEMPRE conteúdo sensual/sexualizado (sensual, biquíni, decote, sexy, gostosa, adulto) MESMO SE mencionar pegadinha. REJEITAR palavras ambíguas: 'pegar pegar' NÃO é pegadinha, 'toptop' NÃO é top qualidade, 'dana do momento' é dancinha NÃO é pegadinha. REJEITAR SE CLARAMENTE é: dancinha coreográfica sem humor (incluindo 'dana do momento'), receita culinária, tutorial técnico, review de produto, cena de filme/série comercial, promoção Netflix/Disney/Prime, videoclipe musical oficial, vlog de viagem, política/eleição, trote de faculdade/terceirão/formatura/calouro/medicina/direito/engenharia (trote ACADÊMICO não serve), exame médico/consulta/clínica real (contexto médico sério não é humor). NA DÚVIDA: APROVAR (exceto sensual/adulto que SEMPRE rejeita).",
  viral: "APROVAR SE tem sinais de conteúdo viral brasileiro: trend, viral, BR, engajamento visível, formato curto impactante, reação genuína. REJEITAR SEMPRE conteúdo sensual/sexualizado (biquíni, sensual, decote, gostosa, sexy, adulto, bikini). REJEITAR SE: receita longa detalhada, tutorial técnico, gameplay de partida completa, política, filme promoção oficial. NA DÚVIDA: APROVAR (exceto sensual/adulto que SEMPRE rejeita).",
  lifestyle_danca: "APROVAR SE menciona danca, coreografia, passinho, dancinha, dance, dancando, bailando, funk dance, sertanejo com coreografia. REJEITAR APENAS SE: pegadinha principal, receita, filme, tutorial tecnico sem danca. NA DUVIDA: APROVAR.",
  lifestyle_musica: "APROVAR SE menciona: musica, cover, cantando, tocando, instrumento, show, performance, BR musical. REJEITAR APENAS SE: dancinha sem musica destacada, pegadinha, tutorial culinario, filme. NA DUVIDA: APROVAR.",
  lifestyle_rotina: "APROVAR SE menciona: rotina, dia a dia, morning, noite, GRWM, dayinmylife, dia na vida, produtividade, bastidores. REJEITAR APENAS SE: pegadinha, tutorial tecnico, filme completo, receita longa. NA DUVIDA: APROVAR.",
  lifestyle_viagem: "APROVAR SE menciona: viagem, destino, hotel, praia, cidade, turismo, passeio, tour, mochilao, trip. REJEITAR APENAS SE: pegadinha durante viagem, dancinha em viagem, filme sobre viagem. NA DUVIDA: APROVAR.",
  ia_novela: "APROVAR SE menciona: IA, inteligencia artificial, filtro, transformacao IA, novela, drama, personagem, midjourney, chatgpt, filtro AI. REJEITAR APENAS SE: pegadinha real sem IA, receita sem tema IA, tutorial tecnico longo. NA DUVIDA: APROVAR.",
  casa_unboxing: "APROVAR SE menciona: unboxing, abrindo, compras, haul, recebidos, review, produto novo, primeira impressao. REJEITAR APENAS SE: pegadinha, comida, dancinha, musica principal. NA DUVIDA: APROVAR.",
  casa_organizacao: "APROVAR SE menciona: organizar, organizacao, arrumando, limpeza, antes e depois de comodo, home, casa, gaveta, armario. REJEITAR APENAS SE: pegadinha, dancinha, filme, receita. NA DUVIDA: APROVAR.",
  casa_decoracao: "APROVAR SE menciona: decoracao, decor, reforma, antes e depois, moveis, home, casa, quarto, sala. REJEITAR APENAS SE: pegadinha, dancinha principal, receita, filme. NA DUVIDA: APROVAR.",
  casa_faxina: "APROVAR SE menciona: faxina, limpeza, diarista, limpando, cleaning, produto limpeza, casa limpa. REJEITAR APENAS SE: pegadinha, dancinha, receita, filme. NA DUVIDA: APROVAR.",
  novelas_fruta: "APROVAR SE menciona: frutinha, frutas com IA, moranguete, abacatudo, bananildo, novela de frutas. REJEITAR APENAS SE: receita real de fruta sem drama, suco. NA DUVIDA: APROVAR.",
  novelas_drama: "APROVAR SE menciona: mininovela, drama, novela, drama vertical, historia romantica, personagem encenado, cena de drama. REJEITAR APENAS SE: pegadinha real, dancinha, receita. NA DUVIDA: APROVAR.",
  novelas_cortes: "APROVAR SE menciona: corte de novela, cena de novela, cenas, trecho de novela, melhores momentos novela, novela BR. REJEITAR APENAS SE: novela estrangeira em outra lingua, pegadinha, dancinha. NA DUVIDA: APROVAR.",
  dicas_receita: "APROVAR SE menciona: receita, cozinhando, prato, ingredientes, culinaria, preparando, sobremesa, lanche, refeicao. REJEITAR APENAS SE: dancinha na cozinha como foco, pegadinha, filme. NA DUVIDA: APROVAR.",
  dicas_fitness: "APROVAR SE menciona: treino, exercicio, academia, musculacao, cardio, shape, fitness, agachamento, corrida, abdominal. REJEITAR APENAS SE: dancinha como exercicio, pegadinha na academia, filme. NA DUVIDA: APROVAR.",
  dicas_tutorial: "APROVAR SE menciona: tutorial, ensinando, como fazer, passo a passo, DIY, dica, hack, truque, aprenda. REJEITAR APENAS SE: dancinha com texto tutorial, pegadinha disfarcada, curso pago longo. NA DUVIDA: APROVAR.",
  dicas_motivacao: "APROVAR SE menciona: superacao, motivacao, mindset, inspiracao, frase motivacional, forca de vontade, sonho, meta. REJEITAR APENAS SE: dancinha com frase, pegadinha, gospel explicito, coach vendendo curso. NA DUVIDA: APROVAR.",
  dicas_curiosidade: "APROVAR SE menciona: fato curioso, voce sabia, ciencia, descoberta, informacao, fato interessante, sabia que. REJEITAR APENAS SE: conspiracao teorizada, dancinha com texto curioso, pegadinha. NA DUVIDA: APROVAR.",
  hook: "APROVAR SE tem gancho forte: chocante, desafio, react, revelacao, transformacao, exposed, polemico, plot twist, ninguem esperava. REJEITAR APENAS SE: receita detalhada, tutorial tecnico, fitness longo, meditacao. NA DUVIDA: APROVAR.",
  satisfying: "APROVAR SE menciona: satisfying, satisfatorio, organizado, limpeza, ASMR visual, slime, corte preciso, relaxante, hipnotizante. REJEITAR APENAS SE: agitado, pegadinha, politica, filme. NA DUVIDA: APROVAR.",
};

function getGroupFromKeywords(nicheKeywords: string[] | undefined, nicheDescription: string): string {
  const text = [...(nicheKeywords || []), nicheDescription].join(' ').toLowerCase();
  // Sub-grupos específicos primeiro
  if (/fruta|frutas|moranguete|abacatudo|bananildo|frutinovela/.test(text)) return 'novelas_fruta';
  if (/mininovela|novelinha|dramabr|micronovela/.test(text)) return 'novelas_drama';
  if (/cortesdenovela|cortesdeserie|cortesdefilme|trechos/.test(text)) return 'novelas_cortes';
  if (/novelaglobo|novelassbt|telenovela|novelabr/.test(text)) return 'novelas_drama';
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

  const prompt = `Você é um filtro de nicho PERMISSIVO para vídeos do TikTok brasileiro.

O editor busca: "${nicheDescription}"
${nicheKeywords?.length ? `Palavras-chave do nicho: ${nicheKeywords.join(', ')}` : ''}

INSTRUÇÕES DESTE NICHO:
${nicheInstructions}

REGRAS:
- Título em idioma estrangeiro sem contexto BR → REJEITAR
- Conteúdo CLARAMENTE de outro nicho (${rejectList}) → REJEITAR
- Título curto/genérico em PT ("kkk", "olha", "#fyp") → APROVAR se não for claramente de outro nicho
- Título com hashtag do nicho (#pegadinha, #humor, #trolagem etc) → APROVAR

REGRA CRÍTICA: Na DÚVIDA entre aprovar e rejeitar → APROVAR. Só rejeite se tiver CERTEZA que é de outro nicho.

Responda APENAS com JSON puro sem markdown:
{"approved": ["id1", "id2"], "rejected": ["id3"]}

Vídeos:
${videoList}`;

  try {
    const allKeys = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter(Boolean) as string[];
    const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];
    let response: Response | null = null;
    for (const model of MODELS) {
      for (const key of allKeys) {
        response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { signal: AbortSignal.timeout(30000),
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (response.ok) break;
        if (response.status === 429) {
          console.warn(`[filter-by-niche] 429 with ${model} key ...${key.slice(-6)}, trying next`);
        } else if (response.status === 503) {
          console.warn(`[filter-by-niche] 503 with ${model}, trying fallback model`);
          break;
        }
      }
      if (response?.ok) break;
    }

    if (!response || !response.ok) {
      console.warn(`AI niche filter failed (${response?.status}), approving batch (fail-open)`);
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
    console.warn("Niche filter batch error, approving (fail-open):", err);
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

    const GEMINI_KEYS = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter(Boolean) as string[];
    if (GEMINI_KEYS.length === 0) throw new Error("No GEMINI_API_KEY configured");
    const GEMINI_API_KEY = GEMINI_KEYS[Math.floor(Math.random() * GEMINI_KEYS.length)];

    // Reject videos with empty/generic titles — can't verify niche without title
    const NO_TITLE_RE = /^(v[ií]deo\s*sem\s*t[ií]tulo|sem\s*t[ií]tulo|video\s*sem\s*titulo|)$/i;
    const EMOJI_ONLY_RE = /^[\p{Emoji}\s#@]+$/u;

    // Hard blocklist: sensual/adulto rejeitado independente do Gemini
    const HARD_BLOCKLIST = /\b(sensual|sensualizando|sexy|gostosa|gostoso|gostosademais|biquini|biquíni|bikini|decote|nudez|pelada|pelado|nsfw|18 ?\+|conteudo adulto|provocante|insinuante|hot ?girl|hot ?boy|safad[oa]|atrevida|cavalona|rabuda|rab[aã]o|peit[ãa]o|siliconada|body ?positiv|lingerie|roupa intima|de calcinha|sem suti[aã]|biscoitando|biscoitar|novinhagosta|gostosademais|delicia|vamosbalançar)\b/i;
    // Dancinha disfarçada de nicho
    const DANCINHA_TRAP = /\b(dana do momento|dancinha do momento|coreografia do momento|passinho do momento|dance challenge|dance trend)\b/i;
    // Spam/lixo genérico
    const SPAM_TITLES = /^(toptop viralvideo|lixo de video|spam de viral|fake views)/i;

    const autoApproved: string[] = [];
    const autoRejected: string[] = [];
    const needsAI: VideoToFilter[] = [];
    let blocklistedCount = 0;
    for (const v of videos) {
      const t = v.title.trim();
      if (!t || NO_TITLE_RE.test(t) || t.length < 5 || EMOJI_ONLY_RE.test(t)) {
        autoRejected.push(v.id);
      } else if (HARD_BLOCKLIST.test(t)) {
        autoRejected.push(v.id);
        blocklistedCount++;
      } else if (DANCINHA_TRAP.test(t)) {
        autoRejected.push(v.id);
        blocklistedCount++;
      } else if (SPAM_TITLES.test(t)) {
        autoRejected.push(v.id);
        blocklistedCount++;
      } else {
        needsAI.push(v);
      }
    }
    console.log(`[filter-by-niche] Auto-rejected ${autoRejected.length} videos (${blocklistedCount} blocklisted, ${autoRejected.length - blocklistedCount} empty/generic)`);

    const BATCH_SIZE = 60;
    const batches: VideoToFilter[][] = [];
    for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
      batches.push(needsAI.slice(i, i + BATCH_SIZE));
    }

    // Run batches: parallel if ≤3, sequential chunks of 3 if more (avoid Gemini rate limits)
    const group = getGroupFromKeywords(nicheKeywords, nicheDescription);
    const rejectList = NICHE_REJECT_MAP[group] || NICHE_REJECT_MAP.viral;
    const nicheInstructions = NICHE_INSTRUCTIONS[group] || NICHE_INSTRUCTIONS.viral;
    console.log(`Niche filter: group=${group}, batches=${batches.length}, instructions=${nicheInstructions.slice(0, 60)}...`);
    const results: string[][] = [];
    const PARALLEL_LIMIT = 3;
    for (let i = 0; i < batches.length; i += PARALLEL_LIMIT) {
      const chunk = batches.slice(i, i + PARALLEL_LIMIT);
      const chunkResults = await Promise.all(
        chunk.map(batch => filterBatch(batch, nicheDescription, nicheKeywords, GEMINI_API_KEY, rejectList, nicheInstructions))
      );
      results.push(...chunkResults);
    }

    const approvedIds = new Set<string>(autoApproved);
    results.forEach(ids => ids.forEach(id => approvedIds.add(id)));
    // autoApproved is intentionally empty — empty titles are now rejected, not approved

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
