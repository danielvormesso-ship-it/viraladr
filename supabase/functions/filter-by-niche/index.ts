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

async function filterBatch(batch: VideoToFilter[], nicheDescription: string, nicheKeywords: string[] | undefined, apiKey: string): Promise<string[]> {
  const videoList = batch.map((v, idx) =>
    `${idx + 1}. [${v.id}] "${v.title}" (autor: ${v.author || 'desconhecido'})`
  ).join('\n');

  const prompt = `Você é um filtro de relevância de nicho para vídeos do TikTok brasileiro.

O usuário busca: "${nicheDescription}"
${nicheKeywords?.length ? `Palavras-chave do nicho: ${nicheKeywords.join(', ')}` : ''}

Analise CADA vídeo e decida se pertence ao nicho pedido.

REGRAS:
- APROVAR títulos em português que tenham relação com o nicho (direta ou indireta)
- APROVAR títulos curtos ou genéricos em português (ex: "kkk", "olha isso", "que situação", "mds") — são BR legítimos
- APROVAR títulos sem texto útil ou "Vídeo sem título" — dar benefício da dúvida
- REJEITAR títulos em inglês ou outros idiomas estrangeiros
- REJEITAR títulos que são CLARAMENTE de outro nicho (ex: kpop, mewing, makeup tutorial, gameplay, futebol quando o nicho é pegadinha)
- REJEITAR filtros/trends que não têm relação com o nicho (ex: "mewing filter", "AI filter", "manga filter")
- Na dúvida entre APROVAR e REJEITAR → APROVAR se o título é em português, REJEITAR se é em inglês

Responda APENAS com JSON puro:
{"approved": ["id1", "id2", ...], "rejected": ["id3", ...]}

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
    const results = await Promise.all(
      batches.map(batch => filterBatch(batch, nicheDescription, nicheKeywords, GEMINI_API_KEY))
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
