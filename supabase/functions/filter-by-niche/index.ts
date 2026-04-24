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
  humor: "kpop, k-pop, drama coreano, k-drama, doramas, receita, culinaria, cozinha, fitness, academia, treino, musculacao, gameplay, jogo, gamer, noticia, tragedia, acidente, morte, crime, policia, preso, vitima, politica, eleicao, governo, viagem, turismo, maquiagem, skincare, tutorial tecnico, ASMR, unboxing, slideshow de foto, paisagem, decoracao, organizacao, meditacao, yoga, nutricao, dieta, spycam, camera espia, produto espiao, review produto, passeio com animal, caminhada natureza, trilha, caca, pesca, dancinha, danca, coreografia, cover musical, musica cover, filme, serie, streaming, netflix, disney, prime video, promocao filme, anuncio, propaganda, papagaio falante, animal imitando humano, vlog opiniao, comentario sobre pegadinha, reaction em estudio, armadilha metaforica, armadilha amorosa, prank, hidden camera, broma, camara oculta, fyp generico sem contexto",
  viral: "receita detalhada, passo a passo culinario, tutorial tecnico longo, fitness detalhado, serie de exercicios, maquiagem tutorial, gameplay longo, partida completa, politica, eleicao, governo, kpop, k-pop, filme, serie, netflix, disney, anuncio, propaganda, prank, broma, conteudo estrangeiro, spam generico",
  lifestyle_danca: "pegadinha, trolagem, receita, culinaria, gameplay, jogo, gamer, noticia, tragedia, politica, eleicao, tutorial tecnico, kpop, k-pop, unboxing, organizacao, filme, serie, netflix, anuncio, propaganda, aula tecnica de danca, danca profissional de palco, vlog sem danca, cover sem coreografia",
  lifestyle_musica: "pegadinha, trolagem, gameplay, jogo, gamer, tutorial tecnico, politica, eleicao, fitness, academia, receita, culinaria, dancinha pura, coreografia sem musica, filme, serie, videoclipe oficial gravadora, musica estrangeira",
  lifestyle_rotina: "gameplay, jogo, gamer, politica, eleicao, tutorial tecnico, kpop, k-pop, pegadinha, trolagem, dancinha, receita detalhada, filme, serie, storytime sem rotina visivel, vlog de expatriado longo",
  lifestyle_viagem: "pegadinha, trolagem, gameplay, jogo, gamer, kpop, k-pop, politica, eleicao, fitness, academia, receita, dancinha em viagem, filme, serie, anuncio de hotel disfarcado, propaganda de agencia",
  ia_novela: "pegadinha real, trolagem real, receita real, culinaria real, fitness, academia, treino, kpop, k-pop, gameplay, jogo, gamer, politica, eleicao, noticia, tragedia, unboxing, organizacao, filme de cinema, novela real de TV sem IA",
  casa_unboxing: "pegadinha, trolagem, humor, comedia, dancinha, receita, culinaria, comida, fitness, academia, treino, gameplay, jogo, gamer, romance, casal, politica, eleicao, noticia, tragedia, paisagem, viagem, turismo, ASMR, kpop, k-pop, musica, filme, serie, propaganda explicita com link",
  casa_organizacao: "pegadinha, trolagem, humor, comedia, dancinha, gameplay, jogo, gamer, politica, eleicao, noticia, tragedia, romance, casal, kpop, k-pop, viagem, turismo, fitness, academia, musica, filme, serie, storytime sobre organizacao sem acao visivel",
  casa_decoracao: "pegadinha, humor, danca, kpop, k-pop, gameplay, jogo, gamer, fitness, academia, receita, culinaria, tutorial, zoeira, trolagem, politica, eleicao, romance, casal, viagem, turismo, filme, serie, faxina apenas, reforma apenas",
  casa_faxina: "pegadinha, humor, danca, kpop, k-pop, gameplay, jogo, gamer, fitness, academia, receita, culinaria, tutorial, zoeira, trolagem, politica, eleicao, romance, casal, decoracao sem limpeza, organizacao",
  novelas_fruta: "pegadinha, humor, danca, fitness, academia, gameplay, jogo, gamer, politica, eleicao, unboxing, receita real de fruta, culinaria, tutorial, hack, dica, organizacao, kpop, k-pop, zoeira, filme, serie",
  novelas_drama: "pegadinha, fitness, academia, gameplay, jogo, gamer, politica, eleicao, unboxing, receita, culinaria, tutorial, hack, dica, organizacao, kpop, k-pop, zoeira, trolagem, novela real de TV copyright, dancinha, filme de cinema",
  novelas_cortes: "pegadinha real, fitness, academia, gameplay, jogo, gamer, politica, eleicao, unboxing, receita, culinaria, tutorial, hack, dica, organizacao, kpop, k-pop, zoeira, trolagem, filme estrangeiro, dancinha",
  dicas_receita: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, politica, eleicao, dancinha, humor, comedia, fitness, academia, maquiagem, unboxing de comida, review de restaurante, filme, serie",
  dicas_fitness: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, politica, eleicao, receita culinaria, cozinha, maquiagem, dancinha, humor, filme, serie, venda de suplemento sem ciencia",
  dicas_tutorial: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, politica, eleicao, humor, comedia, dancinha, filme, serie, curso completo de 1h, tutorial em ingles sem legenda",
  dicas_motivacao: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, receita, culinaria, humor, comedia, dancinha, maquiagem, filme, serie, coach com venda de curso, gospel explicito",
  dicas_curiosidade: "pegadinha, trolagem, kpop, k-pop, gameplay, jogo, gamer, romance, casal, musica, dancinha, maquiagem, fitness, filme, serie, conspiracao sem base, opiniao disfarcada de fato",
  hook: "receita detalhada, culinaria passo a passo, tutorial tecnico, fitness detalhado, serie de exercicios, ASMR, meditacao, yoga, kpop, k-pop, filme, serie, spam, clickbait sem entrega",
  satisfying: "pegadinha, trolagem, gameplay, jogo, gamer, noticia, tragedia, politica, eleicao, kpop, k-pop, musica agitada, funk, dancinha, filme, serie, video gore disfarcado",
};

const NICHE_INSTRUCTIONS: Record<string, string> = {
  humor: "APROVAR: pegadinhas presenciais com reacao genuina, trotes, camera escondida real, trolagem com vitima real, armadilha fisica com reacao, zoeira entre amigos, humor brasileiro autentico, piada, esquete, meme em video, queda engracada, fail real, situacao comica real. REJEITAR: sem elemento humoristico real, dancinha com texto engracado, musica cover, reaction em estudio, vlog opiniao, promocao de filme, papagaio falante como tema principal, prank em ingles, armadilha metaforica (amor/trabalho), storytime sem humor visivel, fyp generico sem contexto, slideshow estatico.",
  viral: "APROVAR: trend do momento BR, viral brasileiro com engajamento real, conteudo BR popular, trend nacional, formato em alta BR. REJEITAR: viral internacional sem adaptacao BR, promocao de filme travestida de viral, receita detalhada, tutorial longo, gameplay, conteudo estrangeiro sem legenda, spam generico, fyp sem contexto.",
  lifestyle_danca: "APROVAR: coreografia executada, trend de danca BR, dancinha viral, passinho BR, desafio de danca, funk dance, sertanejo com danca. REJEITAR: pegadinha, humor sem danca, cover musical sem coreografia, aula tecnica de danca profissional, filme de danca, propaganda, kpop sem adaptacao BR, receita.",
  lifestyle_musica: "APROVAR: cover musical BR autentico, composicao original, trecho de show brasileiro, musica ambiente BR, performance musical vertical. REJEITAR: dancinha sem musica destacada, pegadinha com musica, videoclipe oficial de gravadora (copyright), musica estrangeira sem contexto BR, karaoke generico.",
  lifestyle_rotina: "APROVAR: get ready with me BR, rotina matinal, dia na minha vida, bastidor do dia, rotina noturna, day in my life real. REJEITAR: pegadinha durante rotina, tutorial tecnico, filme, storytime sem rotina visivel, vlog longo de expatriado, dancinha.",
  lifestyle_viagem: "APROVAR: mostrar destino turistico, dica de viagem real, bastidor de viagem, tour local BR, praia brasileira, turismo nacional. REJEITAR: dancinha em viagem (virou dancinha), pegadinha em viagem, propaganda de hotel disfarcada, vlog expatriado longo, filme sobre viagem.",
  ia_novela: "APROVAR: filtro de IA aplicado, transformacao com IA, novela gerada por IA, personagem IA, IA transforma visual, animacao IA de drama. REJEITAR: novela real de TV sem IA, dancinha, pegadinha real, tutorial tecnico de IA longo, anuncio de app IA.",
  casa_unboxing: "APROVAR: abrindo caixa de produto, primeira impressao produto, haul de compras, recebidos do mes, unboxing real BR. REJEITAR: propaganda explicita com link, unboxing de brinquedo infantil em loop, saude sem produto, esporte, comida, luta, musica, danca.",
  casa_organizacao: "APROVAR: organizar gaveta, organizar armario, antes e depois organizacao, dica de organizacao, rotina de arrumacao. REJEITAR: pegadinha em casa organizada, limpeza pura (e faxina nao organizacao), decoracao sem organizacao, storytime sobre organizar sem mostrar.",
  casa_decoracao: "APROVAR: tour pela casa decorada, dica de decoracao, antes e depois decoracao, DIY decoracao, home decor BR. REJEITAR: pegadinha na casa decorada, organizacao sem decoracao, reforma estrutural pesada, faxina, dancinha em casa decorada, filme.",
  casa_faxina: "APROVAR: antes e depois faxina, produto de limpeza funcionando, cleaning hack, rotina de limpeza, diarista profissional trabalhando. REJEITAR: pegadinha durante limpeza, organizacao sem limpeza, decoracao, reforma, storytime sem limpeza visivel.",
  novelas_fruta: "APROVAR: frutinha falando, drama de frutas, novela de frutas com IA, moranguete, abacatudo, personagem fruta animado. REJEITAR: receita real de fruta, dancinha, pegadinha, tutorial de suco, fruta sem animacao/IA.",
  novelas_drama: "APROVAR: mininovela vertical, drama curto encenado, historia romantica curta, novela brasileira vertical, draminha de TikTok. REJEITAR: novela real de TV (copyright), dancinha, pegadinha real, vlog longo, filme de cinema.",
  novelas_cortes: "APROVAR: trecho de novela BR, cena famosa de novela, best of novela, cena viral de novela brasileira, momento iconico BR. REJEITAR: novela estrangeira, dancinha, pegadinha, filme estrangeiro, cena sem contexto brasileiro.",
  dicas_receita: "APROVAR: passo a passo de receita, receita rapida BR, dica culinaria, ingredientes sendo preparados, prato sendo montado. REJEITAR: dancinha na cozinha, pegadinha com comida, unboxing de comida, review de restaurante apenas, fruta IA, filme sobre comida.",
  dicas_fitness: "APROVAR: exercicio demonstrado, dica de treino, bastidor academia BR, musculacao, cardio, shape evolution. REJEITAR: dancinha como exercicio, pegadinha na academia, venda de suplemento sem ciencia, filme sobre fitness.",
  dicas_tutorial: "APROVAR: tutorial pratico BR, passo a passo claro, ensino visual, DIY, how-to BR. REJEITAR: dancinha com texto tutorial, pegadinha disfarcada de tutorial, tutorial em ingles sem legenda, curso completo longo, filme.",
  dicas_motivacao: "APROVAR: discurso inspirador BR, frase motivacional com contexto, historia de superacao, mindset, mensagem positiva. REJEITAR: dancinha com frase motivacional, pegadinha, gospel explicito, coach vendendo curso, filme motivacional trecho.",
  dicas_curiosidade: "APROVAR: fato curioso BR verificavel, informacao surpreendente, descoberta interessante, sabia que, ciencia acessivel. REJEITAR: conspiracao sem base, opiniao disfarcada de fato, dancinha com texto curioso, pegadinha com fato, fake news.",
  hook: "APROVAR: desafio viral BR, react autentico, chocante real, revelacao genuina, transformacao real, exposed com prova, polemico com argumento, plot twist real. REJEITAR: receita detalhada como hook, tutorial tecnico, fitness longo, meditacao, yoga, kpop, clickbait sem entrega real, fofoca celebridade.",
  satisfying: "APROVAR: organizacao visual satisfatoria, corte preciso, limpeza satisfatoria, ASMR visual, slime, processo limpo hipnotizante. REJEITAR: conteudo agitado, pegadinha, politica, musica agitada, funk, dancinha, video gore disfarcado de satisfying.",
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
    const allKeys = [
      Deno.env.get("GEMINI_API_KEY"),
      Deno.env.get("GEMINI_API_KEY_2"),
      Deno.env.get("GEMINI_API_KEY_3"),
    ].filter(Boolean) as string[];
    let response: Response | null = null;
    for (const key of allKeys) {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { signal: AbortSignal.timeout(30000),
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (response.ok || response.status !== 429) break;
      console.warn(`[filter-by-niche] 429 with key ...${key.slice(-6)}, trying next`);
    }

    if (!response || !response.ok) {
      console.warn(`AI niche filter failed (${response?.status}), rejecting batch`);
      return [];
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
    console.warn("Niche filter batch error, rejecting:", err);
    return [];
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
    const autoApproved: string[] = [];
    const autoRejected: string[] = [];
    const needsAI: VideoToFilter[] = [];
    for (const v of videos) {
      const t = v.title.trim();
      if (!t || NO_TITLE_RE.test(t) || t.length < 5 || EMOJI_ONLY_RE.test(t)) {
        autoRejected.push(v.id);
      } else {
        needsAI.push(v);
      }
    }
    console.log(`[filter-by-niche] Auto-rejected ${autoRejected.length} videos with empty/generic titles`);

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
