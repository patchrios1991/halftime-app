// ─── Edge Function: create-payment-intent ─────────────────────────────────────
// Uses Stripe REST API directly (no SDK) to avoid Deno compat issues.
import { serve }       from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_API        = "https://api.stripe.com/v1";

// ── Stripe REST helpers ────────────────────────────────────────────────────────

/** Recursively encode an object to Stripe's form-encoded format */
function encodeForm(obj: Record<string, unknown>, prefix = ""): string {
  return Object.entries(obj)
    .flatMap(([k, v]) => {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        return encodeForm(v as Record<string, unknown>, key).split("&");
      }
      return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
    })
    .join("&");
}

async function stripePost(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: encodeForm(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Stripe API error");
  return json;
}

// ── CORS headers ───────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Handler ────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { data: { user }, error: authErr } =
      await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    // ── Parse body ──────────────────────────────────────────────────────────
    const { podId, amount } = await req.json() as { podId: string; amount: number };
    if (!podId || !amount || amount <= 0) throw new Error("podId and amount are required");

    // ── Verify pod membership ───────────────────────────────────────────────
    const { data: member, error: memberErr } = await supabase
      .from("pod_members")
      .select("user_id, share_pct, cost")
      .eq("pod_id", podId)
      .eq("user_id", user.id)
      .single();
    if (memberErr || !member) throw new Error("You are not a member of this pod");

    // ── Get or create Stripe customer ───────────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, display_name")
      .eq("id", user.id)
      .single();

    let stripeCustomerId: string = profile?.stripe_customer_id ?? "";
    if (!stripeCustomerId) {
      const customer = await stripePost("/customers", {
        email:    user.email ?? "",
        name:     profile?.display_name ?? "",
        metadata: { supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);
    }

    // ── Create PaymentIntent ────────────────────────────────────────────────
    const paymentIntent = await stripePost("/payment_intents", {
      amount:                    Math.round(amount * 100),
      currency:                  "usd",
      customer:                  stripeCustomerId,
      automatic_payment_methods: { enabled: "true" },
      metadata: {
        pod_id:       podId,
        user_id:      user.id,
        share_pct:    member.share_pct?.toString() ?? "0",
        supabase_url: Deno.env.get("SUPABASE_URL")!,
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
    console.error("create-payment-intent error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
