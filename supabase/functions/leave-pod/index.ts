// ─── Edge Function: leave-pod ──────────────────────────────────────────────────
// Called when a member wants to leave a pod.
// 1. If they funded escrow → issues a Stripe refund
// 2. Removes them from pod_members
// 3. Notifies the captain
// Only allowed while the pod is in 'recruiting' status (not yet fully funded).
import { serve }       from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_API        = "https://api.stripe.com/v1";

function encodeForm(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
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

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Identify the calling user via their JWT ─────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { podId } = await req.json() as { podId: string };
    if (!podId) throw new Error("podId is required");

    // Use service-role client for all writes
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Load the pod ────────────────────────────────────────────────────────
    const { data: pod, error: podErr } = await supabase
      .from("pods")
      .select("id, name, captain_id, status, pod_type")
      .eq("id", podId)
      .single();

    if (podErr || !pod) throw new Error("Pod not found");
    if (pod.status !== "recruiting") {
      throw new Error("You can only leave a pod while it's still recruiting members.");
    }
    if (pod.captain_id === user.id) {
      throw new Error("You're the organizer — delete the pod instead of leaving it.");
    }

    // ── Check for funded escrow and refund if needed ────────────────────────
    const { data: payment } = await supabase
      .from("escrow_payments")
      .select("id, stripe_payment_intent_id, amount")
      .eq("pod_id", podId)
      .eq("user_id", user.id)
      .eq("status", "succeeded")
      .maybeSingle();

    let refunded = false;
    if (payment?.stripe_payment_intent_id) {
      const piId = payment.stripe_payment_intent_id;
      const refundParams = piId.startsWith("ch_")
        ? { charge: piId }
        : { payment_intent: piId };

      const isModeMismatch = (msg: string) =>
        msg.includes("test mode") || msg.includes("live mode");

      try {
        await stripePost("/refunds", refundParams);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!isModeMismatch(msg)) throw err; // real error — abort
        console.warn("Test/live mode mismatch — skipping Stripe refund (no real money).");
      }

      await supabase
        .from("escrow_payments")
        .update({ status: "refunded", stripe_status: "refunded" })
        .eq("id", payment.id);

      refunded = true;
    }

    // ── Remove the member from the pod ──────────────────────────────────────
    const { error: deleteErr } = await supabase
      .from("pod_members")
      .delete()
      .eq("pod_id", podId)
      .eq("user_id", user.id);

    if (deleteErr) throw deleteErr;

    // ── Notify the captain ──────────────────────────────────────────────────
    if (pod.captain_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      const memberName = profile?.display_name || "A member";
      await supabase.from("notifications").insert({
        user_id: pod.captain_id,
        type:    "member_joined",   // uses 👥 icon
        title:   `${memberName} left the pod`,
        body:    refunded
          ? `${memberName} left ${pod.name} and their escrow has been automatically refunded.`
          : `${memberName} left ${pod.name}. They had not funded their escrow.`,
        pod_id: podId,
      });
    }

    console.log(`✅ User ${user.id} left pod ${podId} — refunded: ${refunded}`);

    return new Response(
      JSON.stringify({ success: true, refunded }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("leave-pod error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
