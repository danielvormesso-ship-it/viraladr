import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PRESETS: Record<string, string[]> = {
  humor:      ['pegadinha', 'humor', 'comédia', 'memes', 'zoeira', 'fail', 'trollagem', 'risada'],
  viral:      ['viral', 'fyp', 'trending', 'storytime', 'parati', 'viraltiktok'],
  lifestyle:  ['dancinha', 'novelinha', 'satisfying', 'rotina', 'viagem', 'música'],
  ia_novela:  ['ia transforma', 'filtro ia', 'novela ia', 'frutas ia', 'novela antiga', 'cenas icônicas', 'animalia ia'],
  novelas:    ['frutinovela', 'mininovela', 'cortesdenovela', 'novelaglobo'],
  casa:       ['organização', 'unboxing', 'decoração', 'reforma', 'faxina', 'diarista'],
  dicas:      ['receita', 'dica', 'curiosidade', 'motivação', 'fitness', 'saúde', 'hack', 'tutorial'],
  hook:       ['react', 'desafio', 'chocante', 'exposed', 'transformação', 'antes e depois', 'polêmico', 'ninguém esperava'],
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
    // Use service_role key for internal function-to-function calls (bypasses JWT verification)
    const invokeKey = serviceKey;

    const freshCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 0. Daily cleanup: delete pool videos older than 7 days (runs once per day) ──
    try {
      const { data: lastCleanup } = await adminClient
        .from('hashtag_pool')
        .select('fetched_at')
        .lt('fetched_at', weekAgo)
        .limit(1);
      if (lastCleanup && lastCleanup.length > 0) {
        const { error: delErr, count } = await adminClient
          .from('hashtag_pool')
          .delete()
          .lt('fetched_at', weekAgo);
        if (!delErr) {
          console.log(`[pool-scheduler] Cleanup: deleted old pool videos (fetched_at < 7d)`);
        }
      }
    } catch (cleanupErr) {
      console.warn('[pool-scheduler] cleanup error:', cleanupErr);
    }

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
    }

    // Dispatch all refills — fire the fetch but only await the initial HTTP response (not the full refill)
    // Each fetch resolves as soon as pool-refill ACKs (HTTP 200), not when the refill completes
    const dispatched = triggered.length;
    await Promise.all(
      triggered.map(async (t) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/pool-refill`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${invokeKey}`,
              'apikey': invokeKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ hashtag_group: t.preset, target: t.target }),
            signal: AbortSignal.timeout(5000), // Only wait 5s for the HTTP connection, refill runs async
          });
          console.log(`[pool-scheduler] Refill ${t.preset}: HTTP ${res.status}`);
        } catch (err) {
          // Timeout is expected — pool-refill takes 30-60s but we only wait 5s for ACK
          const msg = err instanceof Error ? err.message : 'unknown';
          if (msg.includes('abort') || msg.includes('timeout')) {
            console.log(`[pool-scheduler] Refill ${t.preset}: dispatched (timeout ACK — refill running in background)`);
          } else {
            console.error(`[pool-scheduler] dispatch error ${t.preset}:`, msg);
          }
        }
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        total_presets: allPresets.length,
        triggered_count: triggered.length,
        sufficient_count: sufficient.length,
        dispatched_count: dispatched,
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
