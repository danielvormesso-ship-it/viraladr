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
    // Verify authenticated user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const user_id = user.id;

    const { tiktok_ids, table = 'seen_videos' } = await req.json();

    if (!tiktok_ids || !Array.isArray(tiktok_ids) || tiktok_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'tiktok_ids array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Only allow seen_videos and used_videos
    const allowedTables = ['seen_videos', 'used_videos'];
    if (!allowedTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: 'Invalid table' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use service_role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Cleanup: delete rows older than 7 days for this user
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - TTL_MS).toISOString();
    const dateCol = table === 'seen_videos' ? 'seen_at' : 'used_at';
    const { error: cleanupErr } = await adminClient
      .from(table)
      .delete()
      .eq('user_id', user_id)
      .lt(dateCol, cutoff);
    if (cleanupErr) console.error(`[save-seen-videos] cleanup error:`, cleanupErr);

    const rows = tiktok_ids
      .filter((item: any) => item != null && item !== '')
      .map((item: any) => {
        if (typeof item === 'string') return { user_id, tiktok_id: item };
        return { user_id, tiktok_id: item.tiktok_id, ...(item.video_meta ? { video_meta: item.video_meta } : {}) };
      })
      .filter((r: any) => r.tiktok_id);

    console.log(`[save-seen-videos] user=${user_id} table=${table} ids=${rows.length} first5=${rows.slice(0, 5).map(r => r.tiktok_id).join(',')}`);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await adminClient
        .from(table)
        .upsert(batch, { onConflict: 'user_id,tiktok_id' });
      if (error) {
        console.error(`[save-seen-videos] batch ${i / 50 + 1} error:`, error);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('save-seen-videos error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
