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
    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fakeEmail = `${username.toLowerCase().trim()}@viralapp.local`;

    // Find user by auth email
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const authUser = users?.find(u => u.email === fakeEmail);

    if (!authUser) {
      // Don't leak whether user exists
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get real email from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, username')
      .eq('id', authUser.id)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ ok: true, no_email: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Insert reset record
    await supabase.from('password_resets').insert({
      user_id: authUser.id,
      token,
      expires_at: expiresAt,
    });

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('[send-reset-password] RESEND_API_KEY not set');
      return new Response(JSON.stringify({ ok: false, error: 'email_not_configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resetUrl = `https://criativosai.com/reset-password-confirm?token=${token}`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CriativosIA <noreply@criativosai.com>',
        to: profile.email,
        subject: 'Recuperar senha - CriativosIA',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <h2 style="color: #1a1a2e;">Recuperar senha</h2>
            <p>Olá <strong>${profile.username || username}</strong>,</p>
            <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
            <a href="${resetUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
              Criar nova senha
            </a>
            <p style="color: #666; font-size: 13px;">Este link expira em 1 hora.</p>
            <p style="color: #666; font-size: 13px;">Se você não solicitou a redefinição, ignore este email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px;">CriativosIA — Crie conteúdo em massa com IA</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error('[send-reset-password] Resend error:', errBody);
      return new Response(JSON.stringify({ ok: false, error: 'email_send_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[send-reset-password] Sent reset email to ${profile.email.replace(/(.{2}).+(@.+)/, '$1***$2')}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-reset-password] Error:', err);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
