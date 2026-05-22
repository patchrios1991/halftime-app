// ─── usePayments ──────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import {
  createEscrowPaymentIntent,
  recordEscrowPayment,
  getEscrowPayments,
  getMyEscrowPayment,
} from "../api/payments";
import { isSupabaseConfigured } from "../lib/supabase";

/**
 * Hook for managing escrow payments for a pod.
 *
 * Usage:
 *   const { payments, myPayment, clientSecret, startPayment, loading } = usePayments(podId);
 */
export function usePayments(podId) {
  const [payments, setPayments]     = useState([]);
  const [myPayment, setMyPayment]   = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [paying, setPaying]         = useState(false);
  const [error, setError]           = useState(null);   // payment errors only (shown to user)
  const [loadError, setLoadError]   = useState(null);   // load errors (logged, not shown)

  const load = useCallback(async () => {
    if (!podId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [all, mine] = await Promise.all([
        getEscrowPayments(podId),
        getMyEscrowPayment(podId),
      ]);
      setPayments(all || []);
      setMyPayment(mine);
    } catch (e) {
      console.warn("[usePayments] load error:", e.message);
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Kick off the payment flow:
   * 1. Creates a PaymentIntent via Edge Function (returns clientSecret)
   * 2. Records the intent in our DB as "pending"
   * 3. Returns clientSecret for Stripe Elements
   */
  const startPayment = useCallback(async (amount) => {
    setPaying(true);
    setError(null);
    try {
      const { clientSecret: cs, paymentIntentId } =
        await createEscrowPaymentIntent({ podId, amount });

      await recordEscrowPayment({ podId, amount, stripePaymentIntentId: paymentIntentId });
      setClientSecret(cs);
      await load();
      return cs;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setPaying(false);
    }
  }, [podId, load]);

  const clearClientSecret = useCallback(() => setClientSecret(null), []);

  return {
    payments,
    myPayment,
    clientSecret,
    loading,
    paying,
    error,
    startPayment,
    clearClientSecret,
    refresh: load,
  };
}
