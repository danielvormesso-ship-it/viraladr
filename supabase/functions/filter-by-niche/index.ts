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
  humor: "receita, culinária, fitness, academia, treino, saúde, nutrição, kpop, gameplay, jogo, notícia, política, viagem, turismo, maquiagem, skincare, tutorial técnico, decoração, organização, ASMR, meditação, motivação, empreendedorismo",
  viral: "receita, culinária, gameplay, jogo, kpop, política, tutorial técnico longo, fitness, maquiagem",
  lifestyle: "pegadinha, trolagem, trollagem, gameplay, jogo, política, kpop",
  ia_novela: "pegadinha, trolagem, receita, culinária, fitness, academia, kpop, gameplay, jogo, política",
  casa: "pegadinha, trolagem, kpop, gameplay, jogo, política, fitness, romance",
  dicas: "pegadinha, trolagem, kpop, gameplay, jogo, romance, entretenimento vazio",
  hook: "receita, culinária, tutorial técnico, fitness detalhado, ASMR, meditação, kpop",
  satisfying: "pegadinha, trolagem, gameplay, jogo, notícia, política, kpop, música agitada, funk",
};

function getGroupFromKeywords(nicheKeywords: string[] | undefined, nicheDescription: string): string {
  const text = [...(nicheKeywords || []), nicheDescription].join(' ').toLowerCase();
  if (/pegadinha|humor|comedia|memes|zoeira|risada|fail|troll/.test(text)) return 'humor';
  if (/viral|fyp|trending|storytime|parati|viraltiktok/.test(text)) return 'viral';
  if (/dancinha|novelinha|satisfying|asmr|rotina|viagem|musica/.test(text)) return 'lifestyle';
  if (/iatransforma|filtrodeia|noveladeia|animaliaia|novelaantiga|cenasiconica|frutasia/.test(text)) return 'ia_novela';
  if (/organizacao|unboxing/.test(text)) return 'casa';
  if (/motivacao|receita|dica|curiosidade|fitness|saude|hack|tutorial/.test(text)) return 'dicas';
  if (/react|desafio|antesedepois|transformacao|chocante|exposed|polemico|ninguemesperava/.test(text)) return 'hook';
  if (/oddlysatisfying|relaxante|vocesabia|fatocurioso/.test(text)) return 'satisfying';
  return 'viral';
}

async function filterBatch(batch: VideoToFilter[], nicheDescription: string, nicheKeywords: string[] | undefined, apiKey: string, rejectList: string): Promise<string[]> {
  const videoList = batch.map((v, idx) =>
    `${idx + 1}. [${v.id}] "${v.title}" (autor: ${v.author || 'desconhecido'})`
  ).join('\n');

  const prompt = `Você é um filtro RIGOROSO de nicho para vídeos do TikTok brasileiro.

O editor busca: "${nicheDescription}"
${nicheKeywords?.length ? `Palavras-chave do nicho: ${nicheKeywords.join(', ')}` : ''}

APROVAR:
- Títulos claramente relacionados ao nicho pedido
- Títulos curtos/genéricos em PT sem sinal de outro nicho ("kkk", "olha", "kkkk", "mds")
- Títulos ambíguos em PT que PODERIAM ser do nicho

REJEITAR:
- Títulos em inglês, espanhol, alemão ou outro idioma estrangeiro
- Títulos claramente de um nicho DIFERENTE do pedido
- Títulos de trends/filtros sem relação com o nicho (mewing, AI filter, manga filter)
- REJEITAR obrigatoriamente conteúdo destes nichos: ${rejectList}

REGRA FINAL: Se claramente é outro nicho → REJEITAR. Se ambíguo ou genérico em PT → APROVAR.

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
