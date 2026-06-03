// ─── Edge Function: refund-pod ─────────────────────────────────────────────────
// Issues Stripe refunds for all succeeded escrow payments on a pod.
// Called by the captain before deleting a pod that has funded members.
// Uses the same raw-fetch Stripe pattern as payout-pod.
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
    if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { podId } = await req.json() as { podId: string };
    if (!podId) throw new Error("podId is required");

    // ── Verify pod exists and load name ──────────────────────────────────────
    const { data: pod, error: podErr } = await supabase
      .from("pods")
      .select("id, name, captain_id, status")
      .eq("id", podId)
      .single();

    if (podErr || !pod) throw new Error("Pod not found");
    if (pod.status === "active") {
      throw new Error("Cannot refund a fully funded pod — all members have paid.");
    }

    // ── Get all succeeded escrow payments ─────────────────────────────────────
    const { data: payments, error: paymentsErr } = await supabase
      .from("escrow_payments")
      .select("id, stripe_payment_intent_id, amount, user_id")
      .eq("pod_id", podId)
      .eq("status", "succeeded");

    if (paymentsErr) throw paymentsErr;
    if (!payments || payments.length === 0) {
      // No funded members — nothing to refund, safe to proceed with delete
      return new Response(
        JSON.stringify({ refunded: 0, total: 0 }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ── Issue Stripe refunds ──────────────────────────────────────────────────
    const results: { userId: string; amount: number; refundId: string }[] = [];
    const failures: { userId: string; error: string }[] = [];

    for (const payment of payments) {
      try {
        // Create Stripe refund (full amount, no reason needed)
        const refund = await stripePost("/refunds", {
          payment_intent: payment.stripe_payment_intent_id,
        });

        // Mark payment as refunded in DB
        await supabase
          .from("escrow_payments")
          .update({ status: "refunded", stripe_status: "refunded" })
          .eq("id", payment.id);

        // Clear escrow_funded flag on the member row
        await supabase
          .from("pod_members")
          .update({ escrow_funded: false, escrow_funded_at: null })
          .eq("pod_id", podId)
          .eq("user_id", payment.user_id);

        // Notify the member
        await supabase.from("notifications").insert({
          user_id: payment.user_id,
          type:    "escrow_funded",   // reuses escrow icon in the email template
          title:   "💰 Escrow refunded",
          body:    `Your $${Number(payment.amount).toFixed(2)} escrow for ${pod.name} has been refunded. It should appear in your account within 5–10 business days.`,
          pod_id:  podId,
        });

        results.push({
          userId:   payment.user_id,
          amount:   Number(payment.amount),
          refundId: refund.id,
        });

        console.log(`✅ Refunded $${payment.amount} → user ${payment.user_id} (refund ${refund.id})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`❌ Refund failed for payment ${payment.id}:`, msg);
        failures.push({ userId: payment.user_id, error: msg });
      }
    }

    // ── Abort if any refund failed ────────────────────────────────────────────
    // Don't delete the pod if we couldn't refund everyone — captain can retry.
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} refund(s) failed. Please try again or contact support before deleting.`
      );
    }

    const totalRefunded = results.reduce((s, r) => s + r.amount, 0);
    console.log(`✅ All ${results.length} escrow payment(s) refunded — total $${totalRefunded.toFixed(2)}`);

    return new Response(
      JSON.stringify({ refunded: results.length, total: totalRefunded }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("refund-pod error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
