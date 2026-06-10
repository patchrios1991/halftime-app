// ─── Guest Passes API ─────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { getCurrentUserId } from "../lib/auth";

export async function createGuestPass(gameId, podId, note = "") {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");

  const { data, error } = await supabase
    .from("guest_passes")
    .insert({ game_id: gameId, pod_id: podId, issued_by: userId, note: note.trim() || null })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Public lookup — works for anonymous guests. Uses a security-definer RPC
// because RLS on games/pods blocks non-members from the embedded join.
export async function getGuestPass(code) {
  const { data, error } = await supabase
    .rpc("get_guest_pass_public", { pass_code: code });

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Pass not found");
  return data[0];
}

export async function getMyGuestPasses(gameId) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data } = await supabase
    .from("guest_passes")
    .select("*")
    .eq("game_id", gameId)
    .eq("issued_by", userId)
    .order("created_at", { ascending: false });

  return data ?? [];
}
