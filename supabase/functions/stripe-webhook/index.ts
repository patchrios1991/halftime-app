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
        const meta = pi.metadata ?? {};

        // ── Resale purchase ──────────────────────────────────────────────────
        if (meta.type === "resale" && meta.listing_id) {
          const { listing_id, pod_id, seller_id, buyer_id } = meta;
          const soldPrice = pi.amount / 100;

          // Mark listing as sold
          const { data: listing } = await supabase
            .from("resale_listings")
            .update({ status: "sold", sold_price: soldPrice, sold_at: new Date().toISOString() })
            .eq("id", listing_id)
            .select()
            .single();

          if (listing) {
            // Distribute proceeds: net (after 8% fee) split by share_pct
            const netProceeds = soldPrice * 0.92;
            const { data: podMembers } = await supabase
              .from("pod_members")
              .select("user_id, share_pct")
              .eq("pod_id", pod_id);

            if (podMembers && podMembers.length > 0) {
              const payoutRows = podMembers.map((m: { user_id: string; share_pct: number }) => ({
                listing_id,
                user_id:   m.user_id,
                share_pct: m.share_pct,
                amount:    Math.round((netProceeds * m.share_pct / 100) * 100) / 100,
              }));
              await supabase.from("resale_payouts").insert(payoutRows);
            }

            // Re-assign the game to the buyer
            await supabase
              .from("assignments")
              .update({ user_id: buyer_id, method: "resale" })
              .eq("game_id", listing.game_id);

            // Notify seller
            if (seller_id) {
              await supabase.from("notifications").insert({
                user_id: seller_id,
                type:    "resale_sold",
                title:   "Ticket sold! 💰",
                body:    `Your ticket sold for $${soldPrice.toFixed(2)}. Your share of the proceeds has been added to the pod.`,
                pod_id,
              });
            }

            // Notify buyer
            if (buyer_id) {
              await supabase.from("notifications").insert({
                user_id: buyer_id,
                type:    "game_allocated",
                title:   "Ticket confirmed 🎟️",
                body:    `You bought a ticket for $${soldPrice.toFixed(2)}. It's now in your schedule.`,
                pod_id,
              });
            }
          }

          console.log(`✅ Resale ${listing_id} sold for $${soldPrice} (buyer: ${buyer_id})`);
          break;
        }

        // ── Escrow deposit ───────────────────────────────────────────────────
        const { pod_id, user_id } = meta;
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

          // Auto-trigger payout if captain has Connect account set up
          try {
            await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/payout-pod`,
              {
                method:  "POST",
                headers: {
                  "Content-Type":  "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ podId: pod_id }),
              }
            );
          } catch (payoutErr) {
            // Non-fatal — captain can trigger manually from the app
            console.warn("Auto-payout skipped:", payoutErr);
          }
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

      // ── Identity verification completed ───────────────────────────────────
      case "identity.verification_session.verified": {
        const session = event.data.object;
        const userId  = session.metadata?.user_id;
        if (!userId) break;

        await supabase
          .from("profiles")
          .update({ verified: true, trust_score: 80 })
          .eq("id", userId);

        await supabase.from("notifications").insert({
          user_id: userId,
          type:    "verification_complete",
          title:   "✅ Identity verified!",
          body:    "Your identity has been confirmed. Your trust score is now 80.",
          data:    { screen: "profile" },
        });

        console.log(`✅ Identity verified for user ${userId}`);
        break;
      }

      // ── Identity verification failed / cancelled ───────────────────────────
      case "identity.verification_session.requires_input": {
        const session = event.data.object;
        const userId  = session.metadata?.user_id;
        if (!userId) break;

        const reason = session.last_error?.reason ?? "incomplete";
        await supabase.from("notifications").insert({
          user_id: userId,
          type:    "verification_failed",
          title:   "⚠️ Verification needs attention",
          body:    `Your identity verification couldn't complete (${reason}). Tap to try again.`,
          data:    { screen: "profile" },
        });

        console.warn(`⚠️ Identity verification failed for user ${userId}: ${reason}`);
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
