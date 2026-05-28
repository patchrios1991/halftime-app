// ─── Friendly error messages ───────────────────────────────────────────────────
// Maps raw Supabase / network error strings to human-readable, actionable text.

const MAP = [
  // Auth errors
  ["Invalid login credentials",          "Wrong email or password. Try again or use a magic link."],
  ["Email not confirmed",                 "Check your inbox for a confirmation email before signing in."],
  ["User already registered",             "An account with that email already exists — sign in instead."],
  ["Password should be at least",         "Password must be at least 6 characters long."],
  ["Email address is invalid",            "Enter a valid email address."],
  ["Signup is disabled",                  "New sign-ups are currently invite-only. Use your invite code."],
  ["Token has expired",                   "That link has expired. Request a new magic link."],
  ["JWT expired",                         "Your session expired — please sign in again."],

  // RLS / permissions
  ["new row violates row-level security", "You don't have permission to do that right now."],
  ["violates row-level security policy",  "You don't have permission to do that right now."],
  ["insufficient_privilege",             "You don't have permission to perform this action."],

  // DB constraints
  ["duplicate key value",                "That already exists — try a different value."],
  ["violates not-null constraint",        "A required field is missing."],
  ["violates foreign key constraint",     "Related record not found. Try refreshing the page."],

  // Network
  ["Failed to fetch",                    "Can't connect. Check your internet and try again."],
  ["NetworkError",                        "Network error — check your connection and try again."],
  ["Load failed",                         "Can't reach the server. Check your connection."],

  // Stripe
  ["card_declined",                       "Card declined. Try a different payment method."],
  ["insufficient_funds",                  "Insufficient funds. Try a different card."],
  ["incorrect_cvc",                       "CVC code is incorrect. Double-check and try again."],
  ["expired_card",                        "That card has expired. Use a different card."],
];

/**
 * Return a friendly, human-readable error string.
 * Falls back to the original message if no mapping matches.
 * @param {Error|string|null} err
 * @returns {string}
 */
export function friendlyError(err) {
  if (!err) return "Something went wrong. Please try again.";
  const raw = (err instanceof Error ? err.message : String(err)) || "";

  for (const [key, friendly] of MAP) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return friendly;
  }

  // Trim boilerplate Supabase prefixes
  return raw
    .replace(/^AuthApiError:\s*/i, "")
    .replace(/^PostgrestError:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    || "Something went wrong. Please try again.";
}
