import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Map Hotmart product offer to our plan type */
function offerToPlan(productName: string): 'starter' | 'pro' | 'agency' {
  const name = productName.toLowerCase();
  if (name.includes('agency')) return 'agency';
  if (name.includes('pro')) return 'pro';
  return 'starter';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Hotmart always expects 200 — wrap everything in try/catch
  try {
    // 1. Validate webhook secret via hottok header
    const secret = Deno.env.get('HOTMART_WEBHOOK_SECRET');
    const hottok = req.headers.get('x-hotmart-hottok');

    if (!secret || hottok !== secret) {
      console.error('[hotmart-webhook] Invalid hottok');
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 200, // Hotmart requires 200 even on auth failure
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse body
    const body = await req.json();
    const event: string = body.event;
    const buyerEmail: string | undefined =
      body.data?.buyer?.email?.toLowerCase().trim();

    console.log(`[hotmart-webhook] event=${event} email=${buyerEmail}`);

    if (!buyerEmail) {
      console.error('[hotmart-webhook] No buyer email in payload');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Init Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 4. Find user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, plan')
      .eq('email', buyerEmail)
      .maybeSingle();

    if (profileError) {
      console.error('[hotmart-webhook] Profile lookup error:', profileError.message);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile) {
      console.error(`[hotmart-webhook] No profile found for ${buyerEmail}`);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Handle events
    const productName: string = body.data?.product?.name ?? '';

    switch (event) {
      case 'PURCHASE_APPROVED': {
        const plan = offerToPlan(productName);
        const { error } = await supabase
          .from('profiles')
          .update({ plan, credits_used: 0 })
          .eq('id', profile.id);
        if (error) console.error('[hotmart-webhook] Update error:', error.message);
        else console.log(`[hotmart-webhook] Activated plan=${plan} for ${buyerEmail}`);
        break;
      }

      case 'PURCHASE_CANCELED':
      case 'PURCHASE_REFUNDED': {
        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'free', credits_used: 0 })
          .eq('id', profile.id);
        if (error) console.error('[hotmart-webhook] Downgrade error:', error.message);
        else console.log(`[hotmart-webhook] Downgraded to free for ${buyerEmail}`);
        break;
      }

      case 'PURCHASE_SUBSCRIPTION_CANCELING': {
        // User requested cancellation — keep current plan until billing period ends.
        // Hotmart will send PURCHASE_CANCELED when the period actually ends.
        console.log(`[hotmart-webhook] Subscription canceling (keeping plan) for ${buyerEmail}`);
        break;
      }

      default:
        console.log(`[hotmart-webhook] Unhandled event: ${event}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[hotmart-webhook] Unexpected error:', err);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
