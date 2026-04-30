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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Activate plan on an existing profile */
async function activatePlan(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  plan: string,
) {
  return supabase
    .from('profiles')
    .update({
      plan,
      plan_selected: true,
      credits_used: 0,
      credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', profileId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

  try {
    // 1. Validate webhook secret via hottok header (timing-safe)
    const secret = Deno.env.get('HOTMART_WEBHOOK_SECRET');
    const hottok = req.headers.get('hottok');

    const isValid = secret && hottok && secret.length === hottok.length &&
      crypto.subtle && await (async () => {
        const enc = new TextEncoder();
        const a = enc.encode(secret);
        const b = enc.encode(hottok);
        // Constant-time compare via HMAC (prevents timing attacks)
        const key = await crypto.subtle.importKey('raw', a, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sigA = await crypto.subtle.sign('HMAC', key, a);
        const sigB = await crypto.subtle.sign('HMAC', key, b);
        return new Uint8Array(sigA).every((v, i) => v === new Uint8Array(sigB)[i]);
      })().catch(() => secret === hottok);

    if (!isValid) {
      console.error('[hotmart-webhook] Invalid hottok');
      await logWebhook(supabase, {
        event: 'AUTH_FAILED',
        status: 'unauthorized',
        detail: `hottok=${hottok ? 'present-but-wrong' : 'missing'}`,
        ip: clientIp,
      });
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse body
    const body = await req.json();
    const event: string = body.event;
    const buyerEmail: string | undefined =
      body.data?.buyer?.email?.toLowerCase().trim();

    // Extract SCK (Hotmart tracking param) — used to match user by profile.id
    const rawSck: string | undefined =
      body.data?.purchase?.tracking?.source_sck ||
      body.data?.purchase?.tracking?.source ||
      undefined;
    const sck = rawSck && UUID_RE.test(rawSck) ? rawSck : null;

    console.log(`[hotmart-webhook] event=${event} email=${buyerEmail} sck=${sck || 'none'}`);

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

    // 3.1 Idempotency: reject duplicate webhooks
    if (transactionId) {
      const { data: alreadyProcessed } = await supabase
        .from('processed_webhooks')
        .select('id')
        .eq('transaction_id', `${transactionId}_${event}`)
        .maybeSingle();
      if (alreadyProcessed) {
        console.log(`[hotmart-webhook] Already processed txn=${transactionId} event=${event}, skipping`);
        await logWebhook(supabase, { event, email: buyerEmail, status: 'skipped', detail: 'duplicate webhook (idempotency)', ip: clientIp });
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 4. Find user — try SCK first, then email
    let profile: { id: string; plan: string } | null = null;
    let matchedBy: 'sck' | 'email' | null = null;

    if (sck) {
      const { data } = await supabase
        .from('profiles')
        .select('id, plan')
        .eq('id', sck)
        .maybeSingle();
      if (data) {
        profile = data;
        matchedBy = 'sck';
      }
    }

    if (!profile) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, plan')
        .eq('email', buyerEmail)
        .maybeSingle();
      if (error) {
        console.error('[hotmart-webhook] Profile lookup error:', error.message);
        await logWebhook(supabase, {
          event, email: buyerEmail, status: 'error',
          detail: `Profile lookup: ${error.message}`,
          ip: clientIp,
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (data) {
        profile = data;
        matchedBy = 'email';
      }
    }

    // 5. Handle events
    switch (event) {
      case 'PURCHASE_APPROVED': {
        if (!plan) {
          console.error(`[hotmart-webhook] Unknown product: id=${productId} name=${productName}`);
          await logWebhook(supabase, {
            event, email: buyerEmail, status: 'error',
            detail: `Unknown product: id=${productId} name=${productName}`,
            ip: clientIp,
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!profile) {
          console.log(`[hotmart-webhook] No profile found, saving pending plan=${plan}`);
          await supabase.from('pending_plans').upsert(
            { email: buyerEmail, plan, transaction_id: transactionId, product_id: String(productId ?? '') },
            { onConflict: 'email' },
          );
          await logWebhook(supabase, {
            event, email: buyerEmail, status: 'pending',
            detail: `plan=${plan} saved to pending_plans`,
            ip: clientIp,
          });
          return new Response(JSON.stringify({ ok: true, pending: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await activatePlan(supabase, profile.id, plan);

        if (error) {
          console.error('[hotmart-webhook] Update error:', error.message);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'error', detail: error.message, ip: clientIp });
        } else {
          console.log(`[hotmart-webhook] Activated plan=${plan} for ${buyerEmail} (matched_by_${matchedBy})`);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: `plan=${plan} matched_by_${matchedBy}`, ip: clientIp });
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

        if (!cancelledPlan) {
          console.log(`[hotmart-webhook] Skipping downgrade: unknown product in cancel event`);
          await logWebhook(supabase, {
            event, email: buyerEmail, status: 'skipped',
            detail: `Unknown product in cancel event (id=${productId} name=${productName})`,
            ip: clientIp,
          });
          break;
        }

        if (cancelledPlan !== profile.plan) {
          console.log(`[hotmart-webhook] Skipping downgrade: user has plan=${profile.plan} but cancelled=${cancelledPlan}`);
          await logWebhook(supabase, {
            event, email: buyerEmail, status: 'skipped',
            detail: `User has ${profile.plan}, cancelled ${cancelledPlan} matched_by_${matchedBy}`,
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
          console.log(`[hotmart-webhook] Downgraded to free for ${buyerEmail} (matched_by_${matchedBy})`);
          await logWebhook(supabase, { event, email: buyerEmail, status: 'ok', detail: `Downgraded to free matched_by_${matchedBy}`, ip: clientIp });
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

    // Mark webhook as processed (idempotency)
    if (transactionId) {
      await supabase.from('processed_webhooks').insert({
        transaction_id: `${transactionId}_${event}`,
        event_type: event,
      }).catch(() => {}); // non-blocking
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
