// ─── ResalePaymentModal ────────────────────────────────────────────────────────
// Stripe payment flow for buying a resale ticket listing.
import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { T } from "../../tokens";
import { stripePromise, isStripeConfigured } from "../../lib/stripe";
import { supabase } from "../../lib/supabase";

// ── Stripe appearance (matches EscrowPaymentScreen) ───────────────────────────
const stripeAppearance = {
  theme: "night",
  variables: {
    colorPrimary:       T.lime,
    colorBackground:    T.forest,
    colorText:          T.white,
    colorDanger:        T.red,
    colorTextSecondary: T.mist,
    borderRadius:       "10px",
    fontFamily:         "Calibri, system-ui, sans-serif",
    spacingUnit:        "4px",
  },
  rules: {
    ".Input": { border: `1.5px solid ${T.green}`, boxShadow: "none", padding: "12px 14px" },
    ".Input:focus": { border: `1.5px solid ${T.lime}`, boxShadow: "none" },
    ".Label": { fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em" },
  },
};

// ── Inner checkout form ────────────────────────────────────────────────────────
function CheckoutForm({ amount, gameName, onSuccess, onCancel }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/auth/callback` },
      redirect: "if_required",
    });

    if (stripeErr) {
      setError(stripeErr.message);
      setBusy(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess(paymentIntent);
    } else {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "rgba(200,241,53,0.08)", border: `1px solid ${T.lime}`,
        borderRadius: 12, padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: T.mist, fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em" }}>Ticket purchase</div>
          <div style={{ color: T.chalk, fontSize: 13, marginTop: 2 }}>{gameName}</div>
        </div>
        <div style={{ color: T.lime, fontSize: 24, fontWeight: 800, fontFamily: "Georgia,serif" }}>
          ${amount.toFixed(2)}
        </div>
      </div>

      <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />

      {error && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
          borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ flex: 1, padding: "13px 0", borderRadius: 10,
            border: `1.5px solid ${T.green}`, background: "transparent",
            color: T.chalk, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !ready || !stripe}
          style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none",
            background: busy ? T.mist : T.lime, color: T.dark,
            fontSize: 14, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
            transition: "background 0.15s" }}>
          {busy ? "Processing…" : `Buy for $${amount.toFixed(2)}`}
        </button>
      </div>

      <p style={{ color: T.mist, fontSize: 11, textAlign: "center", margin: 0 }}>
        🔒 Secured by Stripe · Proceeds shared with your pod
      </p>
    </form>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.88)",
      zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 430, background: T.dark,
        borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`, borderBottom: "none",
        padding: "20px 20px 32px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2,
          background: T.green, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ color: T.white, fontSize: 17, fontWeight: 700,
            fontFamily: "Georgia,serif", margin: 0 }}>{title}</h3>
          <button onClick={onClose}
            style={{ background: T.forest, border: "none", color: T.mist,
              width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * Props:
 *   listing   — resale_listings row (with games join)
 *   podName   — string
 *   onSuccess — fn(paymentIntent)
 *   onClose   — fn()
 */
export default function ResalePaymentModal({ listing, podName, onSuccess, onClose }) {
  const [phase, setPhase]         = useState("confirm"); // "confirm" | "checkout" | "done"
  const [clientSecret, setSecret] = useState(null);
  const [amount, setAmount]       = useState(parseFloat(listing.ask_price) || 0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const gameName = `${podName} vs. ${listing.games?.opponent || "—"}`;

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ type: "resale", listingId: listing.id }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSecret(json.clientSecret);
      setAmount(json.amount ?? amount);
      setPhase("checkout");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Modal title="Ticket Purchased!" onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56 }}>🎟️</div>
          <h3 style={{ color: T.lime, margin: "12px 0 6px", fontFamily: "Georgia,serif" }}>
            You're going to the game!
          </h3>
          <p style={{ color: T.chalk, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            ${amount.toFixed(2)} charged. The ticket will appear in your Schedule tab momentarily.
          </p>
          <button onClick={onClose}
            style={{ background: T.lime, color: T.dark, border: "none", borderRadius: 10,
              padding: "13px 32px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            View Schedule →
          </button>
        </div>
      </Modal>
    );
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (phase === "confirm") {
    return (
      <Modal title="Buy Ticket" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ color: T.chalk, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            You're about to buy a ticket from a pod member for{" "}
            <strong style={{ color: T.lime }}>${amount.toFixed(2)}</strong>.
            Net proceeds (after 8% fee) are shared with all pod members.
          </p>
          <div style={{ background: T.forest, border: `1px solid ${T.green}`,
            borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Game",       gameName],
              ["Ask price",  `$${amount.toFixed(2)}`],
              ["Platform fee", "8%"],
              ["Net to pod", `$${(amount * 0.92).toFixed(2)}`],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: T.mist }}>{label}</span>
                <span style={{ color: T.white, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
              borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button onClick={handleConfirm} disabled={loading}
            style={{ background: T.lime, color: T.dark, border: "none", borderRadius: 12,
              padding: "14px 0", fontWeight: 700, fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Loading payment form…" : "Continue to payment →"}
          </button>
          <button onClick={onClose}
            style={{ background: "transparent", color: T.mist, border: "none",
              fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  // ── Checkout (Stripe Elements) ─────────────────────────────────────────────
  if (phase === "checkout" && clientSecret) {
    return (
      <Modal title="Payment details" onClose={onClose}>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
          <CheckoutForm
            amount={amount}
            gameName={gameName}
            onSuccess={pi => { onSuccess?.(pi); setPhase("done"); }}
            onCancel={() => setPhase("confirm")}
          />
        </Elements>
      </Modal>
    );
  }

  // Loading between confirm → checkout
  return (
    <Modal title="Buy Ticket" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "40px 0", color: T.mist }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%",
          border: `3px solid ${T.green}`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Preparing payment…
      </div>
    </Modal>
  );
}
