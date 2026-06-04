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

export async function getGuestPass(code) {
  const { data, error } = await supabase
    .from("guest_passes")
    .select("*, games(opponent, game_date, game_time, sport_emoji, seat_info), pods(name, venue, section, row)")
    .eq("code", code)
    .single();

  if (error) throw error;
  return data;
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
