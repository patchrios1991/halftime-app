// ─── Edge Function: sweep-group-buy-deadlines ─────────────────────────────────
// 1.0.7 item 4, part 2: Group Buy pods set a purchase_deadline (24h after
// full funding, see stripe-webhook) but nothing ever actually checked or
// acted on it once set — a missed deadline just sat there until the
// captain manually clicked "Cancel the pod" in the app.
//
// Called on a schedule (see migration 049) to find every 'purchasing' pod
// whose deadline has passed, refund all members via the existing
// refund-pod function (reused rather than duplicated — it already handles
// the Stripe refund + test/live-mode-mismatch edge cases), then mark the
// pod 'cancelled' instead of hard-deleting it, preserving history.
//
// Needs a real HTTP hop (unlike the member-funding-deadline sweep in
// migration 048) because issuing refunds means calling Stripe — something
// Postgres itself can't do.
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { data: expired, error: expiredErr } = await supabase
      .from("pods")
      .select("id, name, captain_id")
      .eq("status", "purchasing")
      .lt("purchase_deadline", new Date().toISOString());

    if (expiredErr) throw expiredErr;

    const results: { podId: string; cancelled: boolean; error?: string }[] = [];

    for (const pod of expired ?? []) {
      try {
        const refundRes = await fetch(`${supabaseUrl}/functions/v1/refund-pod`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ podId: pod.id }),
        });
        const refundBody = await refundRes.json();
        if (!refundRes.ok || refundBody?.error) {
          throw new Error(refundBody?.error ?? `refund-pod returned ${refundRes.status}`);
        }

        await supabase.from("pods").update({ status: "cancelled" }).eq("id", pod.id);

        if (pod.captain_id) {
          await supabase.from("notifications").insert({
            user_id: pod.captain_id,
            type:    "pod_dissolved",
            title:   "⏰ Purchase window expired",
            body:    `${pod.name}'s 24-hour purchase window passed without a receipt. The pod has been cancelled and all members automatically refunded.`,
            pod_id:  pod.id,
          });
        }

        console.log(`✅ Auto-cancelled ${pod.id} (${pod.name}) — refunded: ${JSON.stringify(refundBody)}`);
        results.push({ podId: pod.id, cancelled: true });
      } catch (err) {
        // Leave status as 'purchasing' so the next sweep retries — don't
        // strand a pod in 'cancelled' if the refund itself didn't succeed.
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`❌ Failed to auto-cancel ${pod.id} (${pod.name}):`, message);
        results.push({ podId: pod.id, cancelled: false, error: message });
      }
    }

    return new Response(
      JSON.stringify({ swept: results.length, results }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sweep-group-buy-deadlines error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
