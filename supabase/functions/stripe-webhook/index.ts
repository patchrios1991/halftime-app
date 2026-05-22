// ─── Edge Function: stripe-webhook ────────────────────────────────────────────
// Uses Web Crypto API for signature verification (no Stripe SDK needed).
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// ── Signature verification (replaces stripe.webhooks.constructEventAsync) ─────
async function verifyStripeSignature(
  body: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};
    for (const part of sigHeader.split(",")) {
      const [k, v] = part.split("=");
      parts[k] = v;
    }
    const timestamp = parts["t"];
    const v1        = parts["v1"];
    if (!timestamp || !v1) return false;

    // Reject events older than 5 minutes
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig      = await crypto.subtle.sign(
      "HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`),
    );
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === v1;
  } catch {
    return false;
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const body = await req.text();

  const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
  if (!valid) {
    console.error("Webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  // deno-lint-ignore no-explicit-any
  const event: { type: string; data: { object: any } } = JSON.parse(body);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {

      // ── Payment succeeded ──────────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const { pod_id, user_id } = pi.metadata ?? {};
        if (!pod_id || !user_id) break;

        await supabase
          .from("escrow_payments")
          .upsert({
            stripe_payment_intent_id: pi.id,
            pod_id,
            user_id,
            amount:        pi.amount / 100,
            stripe_status: "succeeded",
            status:        "succeeded",
          }, { onConflict: "stripe_payment_intent_id" });

        await supabase
          .from("pod_members")
          .update({ escrow_funded: true, escrow_funded_at: new Date().toISOString() })
          .eq("pod_id",  pod_id)
          .eq("user_id", user_id);

        const { data: members } = await supabase
          .from("pod_members")
          .select("escrow_funded")
          .eq("pod_id", pod_id);

        const allFunded = members?.every((m: { escrow_funded: boolean }) => m.escrow_funded) ?? false;
        if (allFunded) {
          await supabase.from("pods").update({ status: "active" }).eq("id", pod_id);
        }

        await supabase.from("notifications").insert({
          user_id,
          type:   "escrow_funded",
          title:  "Escrow funded ✅",
          body:   `Your $${(pi.amount / 100).toFixed(2)} escrow payment was received.`,
          pod_id,
        });

        console.log(`✅ PaymentIntent ${pi.id} succeeded for pod ${pod_id}, user ${user_id}`);
        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const { pod_id, user_id } = pi.metadata ?? {};

        await supabase
          .from("escrow_payments")
          .update({ stripe_status: "failed", status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);

        if (user_id) {
          await supabase.from("notifications").insert({
            user_id,
            type:   "escrow_failed",
            title:  "Payment failed",
            body:   "Your escrow payment could not be processed. Please retry.",
            pod_id: pod_id ?? null,
          });
        }

        console.warn(`❌ PaymentIntent ${pi.id} failed`);
        break;
      }

      // ── Charge refunded ────────────────────────────────────────────────────
      case "charge.refunded": {
        const charge   = event.data.object;
        const intentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

        if (intentId) {
          await supabase
            .from("escrow_payments")
            .update({ stripe_status: "refunded", status: "refunded" })
            .eq("stripe_payment_intent_id", intentId);
        }

        console.log(`↩️ Charge ${charge.id} refunded`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Handler error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
