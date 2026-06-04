// ─── EscrowPaymentScreen ──────────────────────────────────────────────────────
// Stripe Payment Elements embedded in the HalfTime mobile shell.
// Shown when a pod member needs to fund their escrow share.
import { useState, useEffect } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { T } from "../../tokens";
import { stripePromise, isStripeConfigured } from "../../lib/stripe";
import { usePayments } from "../../hooks/usePayments";

// ── Stripe appearance theme matching HalfTime design ──────────────────────────
const stripeAppearance = {
  theme: "night",
  variables: {
    colorPrimary:          T.lime,
    colorBackground:       T.forest,
    colorText:             T.white,
    colorDanger:           T.red,
    colorTextSecondary:    T.mist,
    borderRadius:          "10px",
    fontFamily:            "Calibri, system-ui, sans-serif",
    spacingUnit:           "4px",
  },
  rules: {
    ".Input": {
      border:      `1.5px solid ${T.green}`,
      boxShadow:   "none",
      padding:     "12px 14px",
    },
    ".Input:focus": {
      border:      `1.5px solid ${T.lime}`,
      boxShadow:   "none",
    },
    ".Label": {
      fontSize:    "11px",
      fontWeight:  "700",
      letterSpacing: "0.07em",
    },
  },
};

// ── Inner form (needs to be inside <Elements>) ─────────────────────────────────
function CheckoutForm({ amount, podName, onSuccess, onCancel }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [ready, setReady]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    setError(null);

    // Confirm the payment — Stripe handles 3DS, redirects, etc.
    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Stripe redirects here on 3DS; AuthCallback will re-route to /app
        return_url: `${window.location.origin}/auth/callback`,
      },
      redirect: "if_required", // stay on page when redirect is not needed
    });

    if (stripeErr) {
      setError(stripeErr.message);
      setBusy(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess(paymentIntent);
    } else {
      // Payment requires redirect — handled by return_url
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Amount summary */}
      <div style={{
        background:   "rgba(200,241,53,0.08)",
        border:       `1px solid ${T.lime}`,
        borderRadius: 12,
        padding:      "14px 16px",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ color: T.mist, fontSize: 11, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Escrow deposit
          </div>
          <div style={{ color: T.chalk, fontSize: 13, marginTop: 2 }}>{podName}</div>
        </div>
        <div style={{ color: T.lime, fontSize: 24, fontWeight: 800,
                      fontFamily: "Georgia,serif" }}>
          ${amount.toFixed(2)}
        </div>
      </div>

      {/* Stripe Payment Element */}
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ layout: "tabs" }}
      />

      {/* Error */}
      {error && (
        <div style={{
          background:   "rgba(239,68,68,0.12)",
          border:       `1px solid ${T.red}`,
          borderRadius: 10,
          padding:      "10px 14px",
          color:        T.red,
          fontSize:     13,
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            flex:         1,
            padding:      "13px 0",
            borderRadius: 10,
            border:       `1.5px solid ${T.green}`,
            background:   "transparent",
            color:        T.chalk,
            fontSize:     14,
            fontWeight:   600,
            cursor:       "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !ready || !stripe}
          style={{
            flex:         2,
            padding:      "13px 0",
            borderRadius: 10,
            border:       "none",
            background:   busy ? T.mist : T.lime,
            color:        T.dark,
            fontSize:     14,
            fontWeight:   700,
            cursor:       busy ? "not-allowed" : "pointer",
            transition:   "background 0.15s",
          }}
        >
          {busy ? "Processing…" : `Pay $${amount.toFixed(2)}`}
        </button>
      </div>

      {/* Trust signals */}
      <div style={{ background: "#0D1F12", border: "1px solid #1A4A2E",
        borderRadius: 10, padding: "12px 14px" }}>
        {[
          "🔒 Payment secured by Stripe — PCI-compliant",
          "🏦 Funds held in escrow, not released until tickets are confirmed",
          "↩️ Full refund if the pod doesn't fund or captain fails to deliver",
          "⚠️ Disputes reviewed by HalfTime within 48 hours",
        ].map(line => (
          <div key={line} style={{ fontSize: 11, color: T.mist, marginBottom: 4, lineHeight: 1.5 }}>
            {line}
          </div>
        ))}
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main exported component
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Props:
 *   podId     — string
 *   podName   — string  (display label)
 *   amount    — number  (dollars, e.g. 462.50)
 *   onSuccess — fn(paymentIntent)
 *   onClose   — fn()
 */
export default function EscrowPaymentScreen({ podId, podName, amount, onSuccess, onClose }) {
  const { startPayment, clientSecret, paying, error: hookErr } = usePayments(podId);
  const [phase, setPhase] = useState("confirm"); // "confirm" | "checkout" | "done"
  const [error, setError] = useState(null);

  // Pre-fetch client secret when user confirms
  async function handleConfirm() {
    setError(null);
    try {
      await startPayment(amount);
      setPhase("checkout");
    } catch (e) {
      setError(e.message);
    }
  }

  function handleSuccess(pi) {
    setPhase("done");
    onSuccess?.(pi);
  }

  // ── Demo mode (no Stripe configured) ────────────────────────────────────────
  if (!isStripeConfigured) {
    return (
      <Screen title="Fund Escrow" onClose={onClose}>
        <div style={{
          background:   "rgba(167,139,250,0.1)",
          border:       `1px solid ${T.purple}`,
          borderRadius: 12,
          padding:      "18px 16px",
          textAlign:    "center",
          color:        T.chalk,
          lineHeight:   1.6,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚡</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Demo mode</div>
          <div style={{ fontSize: 13, color: T.mist }}>
            Stripe is not configured.<br />
            Add <code style={{ color: T.lime }}>VITE_STRIPE_PUBLISHABLE_KEY</code> to{" "}
            <code style={{ color: T.lime }}>.env</code> to enable real payments.
          </div>
          <button
            onClick={() => { onSuccess?.({ id: "demo_pi", status: "succeeded" }); setPhase("done"); }}
            style={{
              marginTop: 16, background: T.lime, color: T.dark, border: "none",
              borderRadius: 10, padding: "12px 24px", fontWeight: 700, cursor: "pointer",
            }}
          >
            Simulate payment ✓
          </button>
        </div>
      </Screen>
    );
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <Screen title="Escrow Funded!" onClose={onClose}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h3 style={{ color: T.lime, margin: "12px 0 6px", fontFamily: "Georgia,serif" }}>
            You're in!
          </h3>
          <p style={{ color: T.chalk, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            Your ${amount.toFixed(2)} escrow deposit was received.<br />
            Game allocations will run once all members fund.
          </p>
          <button
            onClick={onClose}
            style={{
              background: T.lime, color: T.dark, border: "none", borderRadius: 10,
              padding: "13px 32px", fontWeight: 700, fontSize: 15, cursor: "pointer",
            }}
          >
            Back to pod
          </button>
        </div>
      </Screen>
    );
  }

  // ── Confirm screen (before charging card) ────────────────────────────────────
  if (phase === "confirm") {
    return (
      <Screen title="Fund Escrow" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ color: T.chalk, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            You're about to deposit your escrow share for{" "}
            <strong style={{ color: T.white }}>{podName}</strong>.
            Funds are held securely and released at season end.
          </p>

          <div style={{
            background:   T.forest,
            border:       `1px solid ${T.green}`,
            borderRadius: 14,
            padding:      "16px",
            display:      "flex",
            flexDirection:"column",
            gap:          10,
          }}>
            {[
              ["Your deposit",   `$${amount.toFixed(2)}`],
              ["Platform fee",   "Included"],
              ["Held by",        "Stripe Escrow"],
              ["Released",       "End of season"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between",
                                        fontSize: 13 }}>
                <span style={{ color: T.mist }}>{label}</span>
                <span style={{ color: T.white, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {(error || hookErr) && (
            <div style={{
              background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
              borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13,
            }}>
              {error || hookErr}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={paying}
            style={{
              background: T.lime, color: T.dark, border: "none", borderRadius: 12,
              padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: paying ? "not-allowed" : "pointer",
              opacity: paying ? 0.6 : 1,
            }}
          >
            {paying ? "Loading payment form…" : `Continue to payment →`}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent", color: T.mist, border: "none",
              fontSize: 13, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Cancel
          </button>
        </div>
      </Screen>
    );
  }

  // ── Checkout screen (Stripe Elements) ────────────────────────────────────────
  if (phase === "checkout" && clientSecret) {
    return (
      <Screen title="Payment details" onClose={onClose}>
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: stripeAppearance }}
        >
          <CheckoutForm
            amount={amount}
            podName={podName}
            onSuccess={handleSuccess}
            onCancel={() => setPhase("confirm")}
          />
        </Elements>
      </Screen>
    );
  }

  // Loading state between confirm → checkout
  return (
    <Screen title="Fund Escrow" onClose={onClose}>
      <div style={{ textAlign: "center", padding: "40px 0", color: T.mist }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: `3px solid ${T.green}`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite", margin: "0 auto 14px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Preparing payment form…
      </div>
    </Screen>
  );
}

// ── Shared modal shell ─────────────────────────────────────────────────────────
function Screen({ title, onClose, children }) {
  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      background:     "rgba(6,15,8,0.85)",
      zIndex:         200,
      display:        "flex",
      alignItems:     "flex-end",
      justifyContent: "center",
    }}>
      <div style={{
        width:        "100%",
        maxWidth:     430,
        background:   T.dark,
        borderRadius: "20px 20px 0 0",
        border:       `1px solid ${T.green}`,
        borderBottom: "none",
        padding:      "20px 20px 32px",
        maxHeight:    "90vh",
        overflowY:    "auto",
      }}>
        {/* Handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: T.green, margin: "0 auto 18px",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center",
                      justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ color: T.white, fontSize: 17, fontWeight: 700,
                       fontFamily: "Georgia,serif", margin: 0 }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: T.forest, border: "none", color: T.mist,
              width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
