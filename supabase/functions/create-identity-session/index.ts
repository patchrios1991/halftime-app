// ─── create-identity-session ──────────────────────────────────────────────────
// Creates a Stripe Identity verification session for the calling user.
// Returns: { url } — open this URL to start the hosted verification flow.
// ─────────────────────────────────────────────────────────────────────────────
import { serve }       from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Authenticate caller
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase   = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Unauthorized");

    if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");

    // Determine return URL from Origin header (works in both dev and prod)
    const origin    = req.headers.get("origin") ?? "http://localhost:5173";
    const returnUrl = `${origin}/app`;

    // Create Stripe Identity verification session
    const stripeResp = await fetch(
      "https://api.stripe.com/v1/identity/verification_sessions",
      {
        method: "POST",
        headers: {
          Authorization:  `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          type:                "document",
          "metadata[user_id]": user.id,
          return_url:          returnUrl,
        }),
      }
    );

    if (!stripeResp.ok) {
      const err = await stripeResp.text();
      throw new Error(`Stripe error: ${err}`);
    }

    const session = await stripeResp.json();

    // Store session ID on profile for tracking
    await supabase
      .from("profiles")
      .update({ persona_inquiry_id: session.id })  // reusing column for Stripe session ID
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
