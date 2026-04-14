import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PRESETS: Record<string, string[]> = {
  humor:      ['pegadinha', 'humor', 'memes', 'zoeira', 'fail', 'trollagem', 'risada'],
  viral:      ['viral', 'fyp', 'trending', 'viraltiktok'],
  lifestyle:  ['dancinha', 'novelinha', 'satisfying', 'asmr', 'rotina'],
  ia_novela:  ['ia transforma', 'novela antiga', 'cenas icônicas'],
  casa:       ['organização', 'unboxing'],
  dicas:      ['receita', 'dica', 'curiosidade', 'motivação', 'fitness'],
  hook:       ['react', 'desafio', 'chocante', 'exposed', 'transformação'],
  satisfying: ['oddly satisfying', 'relaxante', 'você sabia?', 'fato curioso'],
};

const MIN_POOL_THRESHOLD = 200;
const REFILL_TARGET = 300;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const freshCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Build flat list of all presets
    const allPresets: string[] = [];
    for (const presets of Object.values(DEFAULT_PRESETS)) {
      for (const p of presets) allPresets.push(p);
    }

    // ── 1. Check fresh pool count for all presets in parallel ──
    const countResults = await Promise.all(
      allPresets.map(async (preset) => {
        const { count } = await adminClient
          .from('hashtag_pool')
          .select('*', { count: 'exact', head: true })
          .eq('hashtag_group', preset)
          .eq('niche_approved', true)
          .gte('fetched_at', freshCutoff);
        return { preset, fresh: count || 0 };
      })
    );

    // ── 2. Determine which need refill ──
    const triggered: { preset: string; fresh: number; threshold: number }[] = [];
    const sufficient: string[] = [];

    for (const { preset, fresh } of countResults) {
      if (fresh >= MIN_POOL_THRESHOLD) {
        sufficient.push(`${preset}(${fresh})`);
      } else {
        triggered.push({ preset, fresh, threshold: MIN_POOL_THRESHOLD });
      }
    }

    console.log(`[pool-scheduler] ${allPresets.length} presets: ${triggered.length} need refill, ${sufficient.length} sufficient`);
    if (sufficient.length > 0) console.log(`[pool-scheduler] Sufficient: ${sufficient.join(', ')}`);

    // ── 3. Reset exhausted cursors, then dispatch pool-refill ──
    for (const t of triggered) {
      // Auto-reset cursors that are exhausted so refill can fetch new pages
      try {
        const { data: resetRows } = await adminClient
          .from('pool_cursors')
          .update({ exhausted: false, cursor_value: null })
          .eq('hashtag_group', t.preset)
          .eq('exhausted', true)
          .select('hashtag_group');
        const resetCount = resetRows?.length || 0;
        if (resetCount > 0) {
          console.log(`[pool-scheduler] Reset ${resetCount} exhausted cursors for ${t.preset}`);
        }
      } catch (err) {
        console.error(`[pool-scheduler] cursor reset error ${t.preset}:`, err);
      }

      console.log(`[pool-scheduler] Dispatching refill: ${t.preset} (fresh=${t.fresh})`);
      fetch(`${supabaseUrl}/functions/v1/pool-refill`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hashtag_group: t.preset, target: REFILL_TARGET }),
      }).catch(err => console.error(`[pool-scheduler] dispatch error ${t.preset}:`, err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_presets: allPresets.length,
        triggered_count: triggered.length,
        sufficient_count: sufficient.length,
        triggered: triggered.map(t => ({ preset: t.preset, fresh: t.fresh })),
        sufficient,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[pool-scheduler] error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
