// ─── Stripe Client ────────────────────────────────────────────────────────────
import { loadStripe } from "@stripe/stripe-js";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.warn(
    "[HalfTime] VITE_STRIPE_PUBLISHABLE_KEY not set — Stripe payments disabled.\n" +
    "Add your Stripe publishable key to .env to enable escrow payments."
  );
}

// Singleton promise — Stripe.js loads once
export const stripePromise = publishableKey
  ? loadStripe(publishableKey)
  : null;

export const isStripeConfigured = !!publishableKey;
