import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// All preset labels to keep stocked, grouped by category
// Key presets per group — covers the most popular from each
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

    const freshCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // ── 1. Read stats for demand info (optional — enhances priority) ──
    const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: statsRows } = await adminClient
      .from('editor_hashtag_stats')
      .select('hashtag_group, avg_quantity, user_id')
      .gt('search_count', 0)
      .gte('last_searched_at', ttlCutoff);

    const groupDemand: Record<string, { demand: number; editors: number }> = {};
    for (const row of statsRows || []) {
      const g = row.hashtag_group;
      if (!groupDemand[g]) groupDemand[g] = { demand: 0, editors: 0 };
      groupDemand[g].demand += row.avg_quantity || 50;
      groupDemand[g].editors += 1;
    }

    // ── 2. Build list of all presets to check ──
    const allPresets = new Set<string>();
    for (const presets of Object.values(DEFAULT_PRESETS)) {
      for (const p of presets) allPresets.add(p);
    }

    console.log(`[pool-scheduler] Checking ${allPresets.size} presets across ${Object.keys(DEFAULT_PRESETS).length} groups`);

    // ── 3. For each preset, check fresh pool availability ──
    const refilled: { preset: string; pool_fresh: number; threshold: number; target: number; result: any }[] = [];
    const skipped: string[] = [];

    for (const preset of allPresets) {
      const { count: freshCount } = await adminClient
        .from('hashtag_pool')
        .select('*', { count: 'exact', head: true })
        .eq('hashtag_group', preset)
        .eq('niche_approved', true)
        .gte('fetched_at', freshCutoff);

      const available = freshCount || 0;
      // Use demand-based threshold if stats exist, otherwise fixed minimum
      const statsDemand = groupDemand[preset]?.demand;
      const threshold = statsDemand ? Math.max(statsDemand * 3, MIN_POOL_THRESHOLD) : MIN_POOL_THRESHOLD;

      if (available >= threshold) {
        skipped.push(`${preset}(${available})`);
        continue;
      }

      const target = statsDemand ? Math.max(statsDemand * 5, REFILL_TARGET) : REFILL_TARGET;
      console.log(`[pool-scheduler] ${preset}: fresh=${available} < threshold=${threshold}, refilling target=${target}`);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/pool-refill`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ hashtag_group: preset, target }),
        });

        const result = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
        refilled.push({ preset, pool_fresh: available, threshold, target, result });
      } catch (err) {
        console.error(`[pool-scheduler] refill error for ${preset}:`, err);
        refilled.push({
          preset,
          pool_fresh: available,
          threshold,
          target,
          result: { error: err instanceof Error ? err.message : 'Unknown error' },
        });
      }
    }

    if (skipped.length > 0) {
      console.log(`[pool-scheduler] Skipped (sufficient): ${skipped.join(', ')}`);
    }
    console.log(`[pool-scheduler] Done: refilled ${refilled.length}/${allPresets.size} presets`);

    return new Response(
      JSON.stringify({
        success: true,
        total_presets: allPresets.size,
        refilled_count: refilled.length,
        skipped_count: skipped.length,
        refilled,
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
