import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Map Hotmart product to our plan type.
 * Primary: match by product ID (stable). Fallback: match by product name.
 * To find your product IDs: Hotmart webhook payload → data.product.id
 */
const PRODUCT_ID_MAP: Record<string, 'starter' | 'pro' | 'agency'> = {
  '7565314': 'starter',
  '7565350': 'pro',
  '7565365': 'agency',
};

function offerToPlan(productId: string | number | undefined, productName: string): 'starter' | 'pro' | 'agency' | null {
  // 1. Try by product ID (most reliable)
  if (productId) {
    const id = String(productId);
    if (PRODUCT_ID_MAP[id]) return PRODUCT_ID_MAP[id];
  }

  // 2. Fallback to product name
  const name = productName.toLowerCase();
  if (name.includes('agency')) return 'agency';
  if (name.includes('pro')) return 'pro';
  if (name.includes('starter')) return 'starter';

  // 3. Unknown product — do not default blindly
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Hotmart always expects 200 — wrap everything in try/catch
  try {
    // 1. Validate webhook secret via hottok header
    const secret = Deno.env.get('HOTMART_WEBHOOK_SECRET');
    const hottok = req.headers.get('hottok');

    if (!secret || hottok !== secret) {
      console.error('[hotmart-webhook] Invalid hottok');
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 200,
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

    // 4. Resolve plan from product
    const productId = body.data?.product?.id;
    const productName: string = body.data?.product?.name ?? '';
    const transactionId: string = body.data?.purchase?.transaction ?? '';
    const plan = offerToPlan(productId, productName);

    // 5. Find user by email
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

    // 6. Handle events
    switch (event) {
      case 'PURCHASE_APPROVED': {
        if (!plan) {
          console.error(`[hotmart-webhook] Unknown product: id=${productId} name=${productName}`);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!profile) {
          // User paid but has no account yet — save for activation on signup
          console.log(`[hotmart-webhook] No profile for ${buyerEmail}, saving pending plan=${plan}`);
          await supabase.from('pending_plans').upsert(
            { email: buyerEmail, plan, transaction_id: transactionId, product_id: String(productId ?? '') },
            { onConflict: 'email' },
          );
          return new Response(JSON.stringify({ ok: true, pending: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            plan,
            credits_used: 0,
            credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', profile.id);
        if (error) console.error('[hotmart-webhook] Update error:', error.message);
        else console.log(`[hotmart-webhook] Activated plan=${plan} for ${buyerEmail}`);
        break;
      }

      case 'PURCHASE_CANCELED':
      case 'PURCHASE_REFUNDED': {
        if (!profile) {
          // No account — just clean up any pending plan
          await supabase.from('pending_plans').delete().eq('email', buyerEmail);
          console.log(`[hotmart-webhook] Cleaned pending plan for ${buyerEmail}`);
          break;
        }

        // Only downgrade if the cancelled plan matches the user's current plan
        const cancelledPlan = plan; // plan derived from the product in this event
        if (cancelledPlan && cancelledPlan !== profile.plan) {
          console.log(
            `[hotmart-webhook] Skipping downgrade: user has plan=${profile.plan} but cancelled=${cancelledPlan}`,
          );
          break;
        }

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
