// ─── Edge Function: create-connect-account ────────────────────────────────────
// Creates a Stripe Express connected account for a captain and returns
// the hosted onboarding URL so they can add their bank account + verify identity.
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL           = Deno.env.get("APP_URL") ?? "https://app.halftime-app.com";
const STRIPE_API        = "https://api.stripe.com/v1";

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

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    // ── Check for existing Connect account ──────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("connect_account_id, display_name")
      .eq("id", user.id)
      .single();

    let connectAccountId: string = profile?.connect_account_id ?? "";

    // ── Create Express account if none exists ───────────────────────────────
    if (!connectAccountId) {
      const account = await stripePost("/accounts", {
        type:          "express",
        email:         user.email ?? "",
        capabilities:  { transfers: { requested: "true" }, card_payments: { requested: "true" } },
        business_type: "individual",
        metadata:      { supabase_user_id: user.id },
      });
      connectAccountId = account.id;

      await supabase
        .from("profiles")
        .update({ connect_account_id: connectAccountId, connect_onboarded: false })
        .eq("id", user.id);

      console.log(`Created Connect account ${connectAccountId} for user ${user.id}`);
    }

    // ── Generate account onboarding link ────────────────────────────────────
    // The link is single-use and expires after a few minutes.
    const accountLink = await stripePost("/account_links", {
      account:     connectAccountId,
      refresh_url: `${APP_URL}/auth/callback?connect=refresh`,
      return_url:  `${APP_URL}/auth/callback?connect=success`,
      type:        "account_onboarding",
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId: connectAccountId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("create-connect-account error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
