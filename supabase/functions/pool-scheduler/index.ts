import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Read active groups from editor_hashtag_stats (searched in last 7 days) ──
    const { data: statsRows, error: statsErr } = await adminClient
      .from('editor_hashtag_stats')
      .select('hashtag_group, avg_quantity, user_id')
      .gt('search_count', 0)
      .gte('last_searched_at', ttlCutoff);

    if (statsErr) throw statsErr;
    if (!statsRows || statsRows.length === 0) {
      console.log('[pool-scheduler] No active groups in last 7 days');
      return new Response(
        JSON.stringify({ success: true, message: 'No active groups', refilled: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Aggregate demand per group: sum of avg_quantity across active editors
    const groupDemand: Record<string, { demand: number; editors: number }> = {};
    for (const row of statsRows) {
      const g = row.hashtag_group;
      if (!groupDemand[g]) groupDemand[g] = { demand: 0, editors: 0 };
      groupDemand[g].demand += row.avg_quantity || 50;
      groupDemand[g].editors += 1;
    }

    console.log(`[pool-scheduler] Active groups: ${Object.keys(groupDemand).join(', ')}`);

    // ── 2. For each active group, check pool availability ──
    // Collect all active user IDs for seen_videos exclusion
    const activeUserIds = [...new Set(statsRows.map(r => r.user_id))];

    // Get seen tiktok_ids across all active editors (last 7 days)
    const { data: seenRows } = await adminClient
      .from('seen_videos')
      .select('tiktok_id')
      .in('user_id', activeUserIds)
      .gte('seen_at', ttlCutoff);
    const globalSeenIds = new Set((seenRows || []).map((r: any) => r.tiktok_id));

    const refilled: { group: string; pool_before: number; available: number; demand: number; target: number; result: any }[] = [];

    for (const [group, info] of Object.entries(groupDemand)) {
      // Count approved videos in pool for this group
      const { count: poolTotal } = await adminClient
        .from('hashtag_pool')
        .select('*', { count: 'exact', head: true })
        .eq('hashtag_group', group)
        .eq('niche_approved', true);

      // Count how many of those are already seen by active editors
      const { data: poolIds } = await adminClient
        .from('hashtag_pool')
        .select('tiktok_id')
        .eq('hashtag_group', group)
        .eq('niche_approved', true);

      const available = (poolIds || []).filter(r => !globalSeenIds.has(r.tiktok_id)).length;
      const threshold = info.demand * 3;

      console.log(`[pool-scheduler] ${group}: pool=${poolTotal}, available=${available}, demand=${info.demand}, threshold=${threshold}, editors=${info.editors}`);

      if (available >= threshold) {
        console.log(`[pool-scheduler] ${group}: sufficient (${available} >= ${threshold}), skipping`);
        continue;
      }

      // ── 3. Call pool-refill ──
      const target = info.demand * 5;
      console.log(`[pool-scheduler] ${group}: refilling target=${target}`);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/pool-refill`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ hashtag_group: group, target }),
        });

        const result = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
        refilled.push({
          group,
          pool_before: poolTotal || 0,
          available,
          demand: info.demand,
          target,
          result,
        });
      } catch (err) {
        console.error(`[pool-scheduler] refill error for ${group}:`, err);
        refilled.push({
          group,
          pool_before: poolTotal || 0,
          available,
          demand: info.demand,
          target,
          result: { error: err instanceof Error ? err.message : 'Unknown error' },
        });
      }
    }

    console.log(`[pool-scheduler] Done: refilled ${refilled.length} groups`);

    return new Response(
      JSON.stringify({ success: true, active_groups: Object.keys(groupDemand).length, refilled }),
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
