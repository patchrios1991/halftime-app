// ─── Escrow Payments API ──────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";

/**
 * Create a Stripe PaymentIntent via Supabase Edge Function.
 * Returns { clientSecret } for use with Stripe Elements.
 */
export async function createEscrowPaymentIntent({ podId, amount }) {
  const { data, error } = await supabase.functions.invoke("create-payment-intent", {
    body: { podId, amount },
  });

  if (error) throw error;
  return data; // { clientSecret, paymentIntentId }
}

/**
 * Record a payment intent in our DB (called before Stripe redirect).
 * The webhook will update status to 'succeeded' on completion.
 */
export async function recordEscrowPayment({ podId, amount, stripePaymentIntentId }) {
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase
    .from("escrow_payments")
    .insert({
      pod_id:                   podId,
      user_id:                  user.id,
      amount,
      stripe_payment_intent_id: stripePaymentIntentId,
      stripe_status:            "requires_payment_method",
      status:                   "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Get all escrow payments for a pod (for the Pod > Escrow tab) */
export async function getEscrowPayments(podId) {
  const { data, error } = await supabase
    .from("escrow_payments")
    .select("*")
    .eq("pod_id", podId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** Get the current user's escrow payment for a specific pod */
export async function getMyEscrowPayment(podId) {
  // Use getSession (local storage) instead of getUser (network call) for reliability
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("escrow_payments")
    .select("*")
    .eq("pod_id", podId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Mark a member's escrow as funded (used after webhook confirms payment) */
export async function markEscrowFunded(podId, userId) {
  const { error } = await supabase
    .from("pod_members")
    .update({ escrow_funded: true, escrow_funded_at: new Date().toISOString() })
    .eq("pod_id", podId)
    .eq("user_id", userId);

  if (error) throw error;
}
