import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VideoToValidate {
  id: string;
  thumbnail: string | null;
  title: string;
}

async function validateBatch(batch: VideoToValidate[], description: string, apiKey: string): Promise<string[]> {
  const withThumbs = batch.filter(v => v.thumbnail);
  const withoutThumbs = batch.filter(v => !v.thumbnail);
  const approved: string[] = withoutThumbs.map(v => v.id);

  if (withThumbs.length === 0) return approved;

  const content: any[] = [
    {
      type: "text",
      text: `O usuário quer: "${description}"

Analise as ${withThumbs.length} thumbnails abaixo. Para CADA uma, responda APENAS "SIM" ou "NÃO" indicando se o conteúdo visual corresponde ao que o usuário pediu.

REGRAS DE APROVAÇÃO (ULTRA RIGOROSO — rejeite na menor dúvida):
- Aprovar APENAS se a thumbnail CLARAMENTE mostra conteúdo do nicho pedido
- Se o nicho é "organização/casa/limpeza": aprovar APENAS thumbnails mostrando casa/quarto/cozinha/banheiro sendo organizado, produtos de limpeza em uso, antes/depois de organização, armários, prateleiras, gavetas organizadas, unboxing de produtos para casa
- Se o nicho é "mulher dançando/dancinha": aprovar APENAS thumbnails de MULHER REAL dançando
- REJEITAR AGRESSIVAMENTE qualquer thumbnail que mostre: memes, texto sobreposto (capturas de tela, prints), animações/cartoon, paisagens, comida/receita, produtos à venda, animais, gameplay, pessoas em poses estáticas sem relação com o nicho, humor/comédia, celebridades em contexto diferente, clipes musicais, logos, thumbnails genéricas
- REJEITAR thumbnails com VLC media player, cones de trânsito, ou screenshots de apps
- Se pediu organização → rejeitar humor, meme, dança, yoga, fitness
- Na dúvida entre SIM e NÃO → SEMPRE diga NÃO (preferir falso negativo)

Responda em formato JSON puro: {"results":["SIM","NÃO","SIM",...]}
IDs dos vídeos na ordem: ${withThumbs.map(v => v.id).join(', ')}

Thumbnails:`
    }
  ];

  for (const v of withThumbs) {
    content.push({ type: "image_url", image_url: { url: v.thumbnail!, detail: "low" } });
    content.push({ type: "text", text: `[${v.id}] Título: "${v.title.slice(0, 60)}"` });
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      console.warn(`AI validation failed (${response.status}), auto-approving batch`);
      return [...approved, ...withThumbs.map(v => v.id)];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*"results"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const results = parsed.results || [];
      withThumbs.forEach((v, idx) => {
        const verdict = (results[idx] || "").toString().toUpperCase().trim();
        if (verdict.startsWith("SIM")) approved.push(v.id);
      });
    } else {
      const lines = text.split('\n').filter((l: string) => /sim|não|nao|yes|no/i.test(l));
      withThumbs.forEach((v, idx) => {
        if (idx < lines.length) {
          if (/sim|yes/i.test(lines[idx])) approved.push(v.id);
        } else {
          approved.push(v.id);
        }
      });
    }
    return approved;
  } catch (err) {
    console.warn("Batch validation error, auto-approving:", err);
    return [...approved, ...withThumbs.map(v => v.id)];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videos, description } = await req.json() as {
      videos: VideoToValidate[];
      description: string;
    };

    if (!videos?.length || !description) {
      return new Response(
        JSON.stringify({ error: "videos e description são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Larger batches (15 thumbnails each) + run ALL in parallel
    const BATCH_SIZE = 25;
    const batches: VideoToValidate[][] = [];
    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      batches.push(videos.slice(i, i + BATCH_SIZE));
    }

    const results = await Promise.all(
      batches.map(batch => validateBatch(batch, description, GEMINI_API_KEY))
    );

    const approvedIds = new Set<string>();
    results.forEach(ids => ids.forEach(id => approvedIds.add(id)));

    console.log(`Thumbnail validation: ${approvedIds.size}/${videos.length} approved for "${description}"`);

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
    console.error("validate-thumbnails error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
