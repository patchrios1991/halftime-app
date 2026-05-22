// ─── Edge Function: create-payment-intent ─────────────────────────────────────
// Handles both escrow deposits and resale ticket purchases.
// Uses Stripe REST API directly (no SDK) to avoid Deno compat issues.
import { serve }       from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_API        = "https://api.stripe.com/v1";

// ── Stripe REST helpers ────────────────────────────────────────────────────────

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

// ── Shared: get or create Stripe customer ──────────────────────────────────────
async function getOrCreateCustomer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, display_name")
    .eq("id", userId)
    .single();

  let customerId: string = profile?.stripe_customer_id ?? "";
  if (!customerId) {
    const customer = await stripePost("/customers", {
      email:    userEmail,
      name:     profile?.display_name ?? "",
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", userId);
  }
  return customerId;
}

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
    const body = await req.json() as {
      type?:      "escrow" | "resale";
      podId?:     string;
      amount?:    number;
      listingId?: string;
    };

    // ────────────────────────────────────────────────────────────────────────
    // ── RESALE purchase ─────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────────────────────
    if (body.type === "resale" && body.listingId) {
      const { listingId } = body;

      // Verify listing exists and is active
      const { data: listing, error: listingErr } = await supabase
        .from("resale_listings")
        .select("*, games(opponent)")
        .eq("id", listingId)
        .eq("status", "active")
        .single();

      if (listingErr || !listing) throw new Error("Listing not found or no longer available");
      if (listing.seller_id === user.id)  throw new Error("You cannot buy your own listing");

      // Verify buyer is a pod member
      const { data: member } = await supabase
        .from("pod_members")
        .select("user_id")
        .eq("pod_id", listing.pod_id)
        .eq("user_id", user.id)
        .single();

      if (!member) throw new Error("Only pod members can purchase pod tickets");

      const customerId = await getOrCreateCustomer(supabase, user.id, user.email ?? "");
      const askPrice   = parseFloat(listing.ask_price);

      const paymentIntent = await stripePost("/payment_intents", {
        amount:                    Math.round(askPrice * 100),
        currency:                  "usd",
        customer:                  customerId,
        automatic_payment_methods: { enabled: "true" },
        metadata: {
          type:       "resale",
          listing_id: listingId,
          pod_id:     listing.pod_id,
          seller_id:  listing.seller_id,
          buyer_id:   user.id,
          supabase_url: Deno.env.get("SUPABASE_URL")!,
        },
        description: `HalfTime resale — ${listing.games?.opponent ?? listingId}`,
      });

      return new Response(
        JSON.stringify({
          clientSecret:    paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount:          askPrice,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ────────────────────────────────────────────────────────────────────────
    // ── ESCROW deposit (original flow) ──────────────────────────────────────
    // ────────────────────────────────────────────────────────────────────────
    const { podId, amount } = body;
    if (!podId || !amount || amount <= 0) throw new Error("podId and amount are required");

    // Verify pod membership
    const { data: member, error: memberErr } = await supabase
      .from("pod_members")
      .select("user_id, share_pct, cost")
      .eq("pod_id", podId)
      .eq("user_id", user.id)
      .single();
    if (memberErr || !member) throw new Error("You are not a member of this pod");

    const customerId = await getOrCreateCustomer(supabase, user.id, user.email ?? "");

    const paymentIntent = await stripePost("/payment_intents", {
      amount:                    Math.round(amount * 100),
      currency:                  "usd",
      customer:                  customerId,
      automatic_payment_methods: { enabled: "true" },
      metadata: {
        type:         "escrow",
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
