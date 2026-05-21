// ─── Edge Function: create-payment-intent ─────────────────────────────────────
// Creates a Stripe PaymentIntent for pod escrow collection.
// Called by src/api/payments.js → createEscrowPaymentIntent()
//
// Deploy:  supabase functions deploy create-payment-intent
// Env vars required (supabase secrets set):
//   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
//   SUPABASE_URL        — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.168.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: verify the caller is a signed-in user ────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { data: { user }, error: authErr } =
      await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    // ── Parse body ─────────────────────────────────────────────────────────
    const { podId, amount } = await req.json() as { podId: string; amount: number };
    if (!podId || !amount || amount <= 0) throw new Error("podId and amount are required");

    // ── Verify user is a member of this pod ────────────────────────────────
    const { data: member, error: memberErr } = await supabase
      .from("pod_members")
      .select("user_id, share_pct, cost")
      .eq("pod_id", podId)
      .eq("user_id", user.id)
      .single();

    if (memberErr || !member) throw new Error("You are not a member of this pod");

    // ── Fetch or create Stripe Customer for idempotency ────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, display_name")
      .eq("id", user.id)
      .single();

    let stripeCustomerId: string | undefined = profile?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     profile?.display_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      // Persist for future payments
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);
    }

    // ── Create PaymentIntent ───────────────────────────────────────────────
    // amount is in dollars — Stripe needs cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(amount * 100),
      currency: "usd",
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        pod_id:        podId,
        user_id:       user.id,
        share_pct:     member.share_pct?.toString() ?? "0",
        supabase_url:  Deno.env.get("SUPABASE_URL")!,
      },
      description: `HalfTime escrow — pod ${podId}`,
    });

    return new Response(
      JSON.stringify({
        clientSecret:    paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
