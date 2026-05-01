import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { token, new_password } = await req.json();

    if (!token || !new_password) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_params' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (new_password.length < 6) {
      return new Response(JSON.stringify({ ok: false, error: 'password_too_short' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find valid token
    const { data: resetRecord, error: findError } = await supabase
      .from('password_resets')
      .select('id, user_id, expires_at')
      .eq('token', token)
      .is('used_at', null)
      .single();

    if (findError || !resetRecord) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_or_expired_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiration
    if (new Date(resetRecord.expires_at) < new Date()) {
      return new Response(JSON.stringify({ ok: false, error: 'token_expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update password via admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      resetRecord.user_id,
      { password: new_password },
    );

    if (updateError) {
      console.error('[reset-password-confirm] Update error:', updateError.message);
      return new Response(JSON.stringify({ ok: false, error: 'update_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark token as used
    await supabase
      .from('password_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetRecord.id);

    console.log(`[reset-password-confirm] Password reset for user ${resetRecord.user_id}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[reset-password-confirm] Error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
