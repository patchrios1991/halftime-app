// ─── Edge Function: payout-pod ────────────────────────────────────────────────
// Transfers pooled escrow funds to the captain's Stripe Connect account.
// Called automatically by stripe-webhook when all members are funded,
// or manually by the captain from the Pod screen.
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY  = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_API         = "https://api.stripe.com/v1";
const PLATFORM_FEE_PCT   = 0.03; // 3% platform fee on escrow payouts

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

    const { podId } = await req.json() as { podId: string };
    if (!podId) throw new Error("podId is required");

    // ── Load pod + captain profile ──────────────────────────────────────────
    const { data: pod, error: podErr } = await supabase
      .from("pods")
      .select("id, name, captain_id, payout_status")
      .eq("id", podId)
      .single();

    if (podErr || !pod) throw new Error("Pod not found");
    if (pod.payout_status === "paid") {
      console.log(`Pod ${podId} already paid out — skipping`);
      return new Response(JSON.stringify({ skipped: "already_paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: captainProfile } = await supabase
      .from("profiles")
      .select("connect_account_id, connect_onboarded, display_name")
      .eq("id", pod.captain_id)
      .single();

    if (!captainProfile?.connect_account_id) {
      throw new Error("Captain hasn't set up payouts yet");
    }
    if (!captainProfile?.connect_onboarded) {
      throw new Error("Captain hasn't completed payout setup");
    }

    // ── Sum all succeeded escrow payments ───────────────────────────────────
    const { data: payments } = await supabase
      .from("escrow_payments")
      .select("amount")
      .eq("pod_id", podId)
      .eq("status", "succeeded");

    const totalCollected = (payments ?? [])
      .reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);

    if (totalCollected <= 0) throw new Error("No escrow payments to pay out");

    // ── Calculate amounts ───────────────────────────────────────────────────
    const totalCents    = Math.round(totalCollected * 100);
    const feeCents      = Math.round(totalCents * PLATFORM_FEE_PCT);
    const transferCents = totalCents - feeCents;

    // ── Create Stripe Transfer ──────────────────────────────────────────────
    // Moves money from HalfTime's platform account → captain's bank account
    const transfer = await stripePost("/transfers", {
      amount:         transferCents,
      currency:       "usd",
      destination:    captainProfile.connect_account_id,
      transfer_group: podId,
      description:    `HalfTime pod payout — ${pod.name}`,
      metadata: {
        pod_id:          podId,
        pod_name:        pod.name,
        total_collected: totalCollected.toFixed(2),
        platform_fee:    (feeCents / 100).toFixed(2),
      },
    });

    // ── Mark pod as paid out ────────────────────────────────────────────────
    await supabase
      .from("pods")
      .update({
        payout_status:      "paid",
        payout_amount:      transferCents / 100,
        payout_transfer_id: transfer.id,
        payout_at:          new Date().toISOString(),
      })
      .eq("id", podId);

    // ── Notify all pod members ──────────────────────────────────────────────
    const { data: members } = await supabase
      .from("pod_members")
      .select("user_id")
      .eq("pod_id", podId);

    if (members?.length) {
      await supabase.from("notifications").insert(
        members.map((m: { user_id: string }) => ({
          user_id: m.user_id,
          type:    "pod_active",
          title:   "Pod fully funded! 🎉",
          body:    `${pod.name} is 100% funded. $${(transferCents / 100).toFixed(2)} has been transferred to ${captainProfile.display_name || "your captain"} to cover your season tickets.`,
          pod_id:  podId,
        }))
      );
    }

    console.log(`✅ Payout ${transfer.id}: $${(transferCents / 100).toFixed(2)} → ${captainProfile.connect_account_id}`);

    return new Response(
      JSON.stringify({
        transferId: transfer.id,
        amount:     transferCents / 100,
        fee:        feeCents / 100,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("payout-pod error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
