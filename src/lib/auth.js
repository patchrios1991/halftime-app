// ─── Auth helpers ─────────────────────────────────────────────────────────────
// Shared async helpers for API layer — avoids repeating getSession() in every
// API function (trades, bids, games, etc.).
import { supabase } from "./supabase";

/** Returns the current authenticated user's UUID, or null. */
export async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Returns the full session (for token-based calls like notify). */
export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
