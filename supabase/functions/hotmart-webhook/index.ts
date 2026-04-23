import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Map Hotmart product to our plan type.
 * Primary: match by product ID (stable). Fallback: match by product name.
 */
const PRODUCT_ID_MAP: Record<string, 'starter' | 'pro' | 'agency'> = {
  '7565314': 'starter',
  '7565350': 'pro',
  '7565365': 'agency',
};

function offerToPlan(productId: string | number | undefined, productName: string): 'starter' | 'pro' | 'agency' | null {
  if (productId) {
    const id = String(productId);
    if (PRODUCT_ID_MAP[id]) return PRODUCT_ID_MAP[id];
  }
  const name = productName.toLowerCase();
  if (name.includes('agency')) return 'agency';
  if (name.includes('pro')) return 'pro';
  if (name.includes('starter')) return 'starter';
  return null;
}

/** Helper to log webhook events to webhook_logs table */
async function logWebhook(
  supabase: ReturnType<typeof createClient>,
  params: { event?: string; email?: string; status: string; detail?: string; ip?: string },
) {
  try {
    await supabase.from('webhook_logs').insert(params);
  } catch (e) {
    console.error('[hotmart-webhook] Failed to write log:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Supabase admin client — init early so we can log even on auth failure
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

  // Hotmart always expects 200 — wrap everything in try/catch
  try {
    // 1. Validate webhook secret via hottok header
    const secret = Deno.env.get('HOTMART_WEBHOOK_SECRET');
    const hottok = req.headers.get('hottok');

    if (!secret || hottok !== secret) {
      console.error('[hotmart-webhook] Invalid hottok');
      await logWebhook(supabase, {
        event: 'AUTH_FAILED',
        status: 'unauthorized',
        detail: `hottok=${hottok ? 'present-but-wrong' : 'missing'}`,
        ip: clientIp,
      });
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
      await logWebhook(supabase, {
        event,
        status: 'error',
        detail: 'No buyer email in payload',
        ip: clientIp,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Resolve plan from product
    const productId = body.data?.product?.id;
    const productName: string = body.data?.product?.name ?? '';
    const transactionId: string = body.data?.purchase?.transaction ?? '';
    const plan = offerToPlan(productId, productName);

    // 4. Find user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, plan')
      .eq('email', buyerEmail)
      .maybeSingle();

    if (profileError) {
      console.error('[hotmart-webhook] Profile lookup error:', profileError.message);
      await logWebhook(supabase, {
        event,
        email: buyerEmail,
        status: 'error',
        detail: `Profile lookup: ${profileError.message}`,
        ip: clientIp,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Handle events
    switch (event) {
      case 'PURCHASE_APPROVED': {
        if (!plan) {
          console.error(`[hotmart-webhook] Unknown product: id=${productId} name=${productName}`);
          await logWebhook(supabase, {
            event,
            email: buyerEmail,
            status: 'error',
            detail: `Unknown product: id=${productId} name=${productName}`,
            ip: clientIp,
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!profile) {
          console.log(`[hotmart-webhook] No profile for ${buyerEmail}, saving pending plan=${plan}`);
          await supabase.from('pending_plans').upsert(
            { email: buyerEmail, plan, transaction_id: transactionId, product_id: String(productId ?? '') },
            { onConflict: 'email' },
          );
          await logWebhook(supabase, {
            event,
            email: buyerEmail,
            status: 'pending',
            detail: `plan=${plan} saved to pending_plans`,
            ip: clientIp,
          });
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

        if (error) {
          console.error('[hotmart-webhook] Update error:', error.message);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'error', detail: error.message, ip: clientIp });
        } else {
          console.log(`[hotmart-webhook] Activated plan=${plan} for ${buyerEmail}`);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: `plan=${plan}`, ip: clientIp });
        }
        break;
      }

      case 'PURCHASE_CANCELED':
      case 'PURCHASE_REFUNDED': {
        if (!profile) {
          await supabase.from('pending_plans').delete().eq('email', buyerEmail);
          console.log(`[hotmart-webhook] Cleaned pending plan for ${buyerEmail}`);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: 'Cleaned pending plan (no profile)', ip: clientIp });
          break;
        }

        const cancelledPlan = plan;

        // If we can't determine which product was cancelled, do NOT downgrade blindly
        if (!cancelledPlan) {
          console.log(`[hotmart-webhook] Skipping downgrade: unknown product in cancel event`);
          await logWebhook(supabase, {
            event,
            email: buyerEmail,
            status: 'skipped',
            detail: `Unknown product in cancel event (id=${productId} name=${productName})`,
            ip: clientIp,
          });
          break;
        }

        // Only downgrade if the cancelled plan matches the user's current plan
        if (cancelledPlan !== profile.plan) {
          console.log(`[hotmart-webhook] Skipping downgrade: user has plan=${profile.plan} but cancelled=${cancelledPlan}`);
          await logWebhook(supabase, {
            event,
            email: buyerEmail,
            status: 'skipped',
            detail: `User has ${profile.plan}, cancelled ${cancelledPlan}`,
            ip: clientIp,
          });
          break;
        }

        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'free', credits_used: 0 })
          .eq('id', profile.id);

        if (error) {
          console.error('[hotmart-webhook] Downgrade error:', error.message);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'error', detail: error.message, ip: clientIp });
        } else {
          console.log(`[hotmart-webhook] Downgraded to free for ${buyerEmail}`);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: 'Downgraded to free', ip: clientIp });
        }
        break;
      }

      case 'PURCHASE_SUBSCRIPTION_CANCELING': {
        console.log(`[hotmart-webhook] Subscription canceling (keeping plan) for ${buyerEmail}`);
        await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: 'Keeping plan until period ends', ip: clientIp });
        break;
      }

      default:
        console.log(`[hotmart-webhook] Unhandled event: ${event}`);
        await logWebhook(supabase, { event, email: buyerEmail, status: 'skipped', detail: 'Unhandled event', ip: clientIp });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[hotmart-webhook] Unexpected error:', err);
    await logWebhook(supabase, {
      status: 'error',
      detail: `Unexpected: ${(err as Error).message}`,
      ip: clientIp,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
