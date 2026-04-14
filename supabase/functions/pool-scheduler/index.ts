import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PRESETS: Record<string, string[]> = {
  humor:      ['pegadinha', 'humor', 'memes', 'zoeira', 'fail', 'trollagem', 'risada'],
  viral:      ['viral', 'fyp', 'trending', 'viraltiktok'],
  lifestyle:  ['dancinha', 'novelinha', 'satisfying', 'rotina'],
  ia_novela:  ['ia transforma', 'novela antiga', 'cenas icônicas'],
  novelas:    ['frutinovela', 'mininovela', 'cortesdenovela', 'novelaglobo', 'dramabr', 'frutasia', 'novelinha'],
  casa:       ['organização', 'unboxing', 'decoração', 'reforma', 'faxina', 'diarista'],
  dicas:      ['receita', 'dica', 'curiosidade', 'motivação', 'fitness'],
  hook:       ['react', 'desafio', 'chocante', 'exposed', 'transformação'],
  satisfying: ['oddly satisfying', 'relaxante', 'você sabia?', 'fato curioso'],
};

// Low BR-rate presets — cap target to avoid wasting API calls
const LOW_BR_RATE_CAPS: Record<string, number> = {};

// Dynamic priority tiers based on search_count in last 7 days
function getTier(searchCount: number): { target: number; threshold: number } {
  if (searchCount > 30) return { target: 1000, threshold: 400 };
  if (searchCount >= 16) return { target: 800, threshold: 300 };
  if (searchCount >= 6)  return { target: 500, threshold: 200 };
  if (searchCount >= 1)  return { target: 300, threshold: 150 };
  return { target: 200, threshold: 100 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const freshCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Build flat list of all presets
    const allPresets: string[] = [];
    for (const presets of Object.values(DEFAULT_PRESETS)) {
      for (const p of presets) allPresets.push(p);
    }

    // ── 1. Fetch usage stats from last 7 days ──
    const { data: statsRows } = await adminClient
      .from('editor_hashtag_stats')
      .select('hashtag_group, search_count, last_searched_at')
      .gte('last_searched_at', weekAgo);

    // Aggregate search_count per group
    const usageByGroup: Record<string, number> = {};
    for (const row of statsRows || []) {
      const g = row.hashtag_group;
      usageByGroup[g] = (usageByGroup[g] || 0) + (row.search_count || 0);
    }

    // ── 2. Check fresh pool count for all presets in parallel ──
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

    // ── 3. Determine which need refill with dynamic tiers ──
    const triggered: { preset: string; fresh: number; threshold: number; target: number; searches: number }[] = [];
    const sufficient: string[] = [];

    for (const { preset, fresh } of countResults) {
      const searches = usageByGroup[preset] || 0;
      const tier = getTier(searches);
      let { target, threshold } = tier;

      // Apply low-BR-rate cap
      if (LOW_BR_RATE_CAPS[preset]) {
        target = Math.min(target, LOW_BR_RATE_CAPS[preset]);
        threshold = Math.min(threshold, Math.floor(LOW_BR_RATE_CAPS[preset] / 2));
      }

      if (fresh >= threshold) {
        sufficient.push(`${preset}(${fresh}/${threshold}|${searches}s)`);
      } else {
        triggered.push({ preset, fresh, threshold, target, searches });
      }
    }

    // Sort by searches descending — high-demand groups refill first
    triggered.sort((a, b) => b.searches - a.searches);

    console.log(`[pool-scheduler] ${allPresets.length} presets: ${triggered.length} need refill, ${sufficient.length} sufficient`);
    if (sufficient.length > 0) console.log(`[pool-scheduler] Sufficient: ${sufficient.join(', ')}`);

    // ── 4. Reset exhausted cursors, then dispatch pool-refill ──
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

      console.log(`[pool-scheduler] Dispatching refill: ${t.preset} (fresh=${t.fresh}, threshold=${t.threshold}, target=${t.target}, searches=${t.searches})`);
      fetch(`${supabaseUrl}/functions/v1/pool-refill`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hashtag_group: t.preset, target: t.target }),
      }).catch(err => console.error(`[pool-scheduler] dispatch error ${t.preset}:`, err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_presets: allPresets.length,
        triggered_count: triggered.length,
        sufficient_count: sufficient.length,
        triggered: triggered.map(t => ({ preset: t.preset, fresh: t.fresh, threshold: t.threshold, target: t.target, searches: t.searches })),
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
