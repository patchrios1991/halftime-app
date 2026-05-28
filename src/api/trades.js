// ─── Game Trades API ──────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify } from "../lib/notify";
import { getCurrentUserId } from "../lib/auth";

/** Fetch all pending trades for the current user (incoming + outgoing) */
export async function getMyTrades(podId) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("game_trades")
    .select(`
      *,
      from_game:games!from_game_id(id, opponent, game_date, game_time, face_value),
      to_game:games!to_game_id(id, opponent, game_date, game_time, face_value),
      from_profile:profiles!from_user_id(display_name, avatar_initials),
      to_profile:profiles!to_user_id(display_name, avatar_initials)
    `)
    .eq("pod_id", podId)
    .in("status", ["pending"])
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Propose a trade */
export async function proposeTrade({ podId, fromGameId, toGameId, toUserId, message }) {
  const fromUserId = await getCurrentUserId();
  if (!fromUserId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("game_trades")
    .insert({
      pod_id:       podId,
      from_user_id: fromUserId,
      to_user_id:   toUserId,
      from_game_id: fromGameId,
      to_game_id:   toGameId,
      message:      message || null,
      status:       "pending",
    })
    .select()
    .single();

  if (error) throw error;

  notify({
    userId: toUserId,
    type:   "trade_offer",
    title:  "🔄 Trade offer received",
    body:   "A pod member wants to swap games with you. Open the Schedule tab to review.",
    url:    "/app",
  });

  return data;
}

/** Accept a trade — swaps assignments then marks trade accepted */
export async function acceptTrade(tradeId) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const { data: trade, error: fetchErr } = await supabase
    .from("game_trades")
    .select("*")
    .eq("id", tradeId)
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .single();

  if (fetchErr || !trade) throw new Error("Trade not found or already resolved");

  // Swap assignments and mark accepted concurrently
  const [r1, r2, updateRes] = await Promise.all([
    supabase.from("assignments").update({ user_id: trade.to_user_id }).eq("game_id", trade.from_game_id),
    supabase.from("assignments").update({ user_id: trade.from_user_id }).eq("game_id", trade.to_game_id),
    supabase.from("game_trades").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", tradeId),
  ]);

  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;
  if (updateRes.error) throw updateRes.error;

  notify({
    userId: trade.from_user_id,
    type:   "trade_accepted",
    title:  "🔄 Trade accepted!",
    body:   "Your trade offer was accepted. Check your updated schedule.",
    url:    "/app",
  });
}

/** Reject a trade */
export async function rejectTrade(tradeId) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  // Fetch trade metadata and update status concurrently
  const [tradeRes, updateRes] = await Promise.all([
    supabase.from("game_trades").select("from_user_id").eq("id", tradeId).single(),
    supabase.from("game_trades")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", tradeId)
      .eq("to_user_id", userId),
  ]);

  if (updateRes.error) throw updateRes.error;

  if (tradeRes.data?.from_user_id) {
    notify({
      userId: tradeRes.data.from_user_id,
      type:   "trade_rejected",
      title:  "❌ Trade offer declined",
      body:   "Your trade offer was not accepted. You can try trading with another pod member.",
      url:    "/app",
    });
  }
}

/** Cancel / withdraw a trade offer (as the proposer) */
export async function cancelTrade(tradeId) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("game_trades")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("from_user_id", userId);

  if (error) throw error;
}
