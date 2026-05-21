// ─── Edge Function: stripe-webhook ────────────────────────────────────────────
// Receives Stripe webhook events and updates our database accordingly.
//
// Events handled:
//   payment_intent.succeeded  → mark escrow_payments succeeded + fund pod_members
//   payment_intent.payment_failed → mark escrow_payments failed
//   charge.refunded            → mark escrow_payments refunded
//
// Deploy:   supabase functions deploy stripe-webhook
// Env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (from Stripe Dashboard)

import { serve }  from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe      from "https://esm.sh/stripe@14.21.0?target=deno&deno-std=0.168.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion:  "2023-10-16",
  httpClient:  Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const body = await req.text();

  // ── Verify signature ──────────────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // ── Service-role Supabase client (bypasses RLS) ────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Handle events ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Payment succeeded ────────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { pod_id, user_id } = pi.metadata;

        if (!pod_id || !user_id) break;

        // Update escrow_payments row
        await supabase
          .from("escrow_payments")
          .update({
            stripe_status: "succeeded",
            status:        "succeeded",
          })
          .eq("stripe_payment_intent_id", pi.id);

        // Mark pod_member as funded
        await supabase
          .from("pod_members")
          .update({
            escrow_funded:    true,
            escrow_funded_at: new Date().toISOString(),
          })
          .eq("pod_id",  pod_id)
          .eq("user_id", user_id);

        // Check if ALL members have funded — if so, mark pod "active"
        const { data: members } = await supabase
          .from("pod_members")
          .select("escrow_funded")
          .eq("pod_id", pod_id);

        const allFunded = members?.every(m => m.escrow_funded) ?? false;
        if (allFunded) {
          await supabase
            .from("pods")
            .update({ status: "active" })
            .eq("id", pod_id);
        }

        // Send notification to the user
        await supabase.from("notifications").insert({
          user_id,
          type:    "escrow_funded",
          title:   "Escrow funded ✅",
          body:    `Your $${(pi.amount / 100).toFixed(2)} escrow payment was received.`,
          pod_id,
        });

        console.log(`✅ PaymentIntent ${pi.id} succeeded for pod ${pod_id}, user ${user_id}`);
        break;
      }

      // ── Payment failed ───────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { pod_id, user_id } = pi.metadata;

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

      // ── Charge refunded ──────────────────────────────────────────────────
      case "charge.refunded": {
        const charge   = event.data.object as Stripe.Charge;
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
