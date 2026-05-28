// ─── Bids API ──────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify } from "../lib/notify";
import { getCurrentUserId } from "../lib/auth";

/**
 * Get all marquee + playoff games for a pod, with their bids attached.
 * These are the games eligible for the bid-credits auction mechanic.
 */
export async function getBiddableGames(podId) {
  const { data, error } = await supabase
    .from("games")
    .select("*, assignments(user_id, method, confirmed), bids(id, user_id, credits, status, placed_at)")
    .eq("pod_id", podId)
    .in("tier", ["marquee", "playoff"])
    .order("game_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Get all bids for a specific game, with profile data for display.
 */
export async function getBidsForGame(gameId) {
  const { data, error } = await supabase
    .from("bids")
    .select("*, profiles(display_name, avatar_initials)")
    .eq("game_id", gameId)
    .order("credits", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Place or update a bid for a game. Uses upsert (one bid per user per game).
 * Does NOT deduct credits yet — credits are only deducted when the auction resolves.
 */
export async function placeBid(gameId, podId, credits) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in to bid");

  if (!credits || credits < 1) throw new Error("Bid must be at least 1 credit");

  // Verify the user has enough credits in this pod
  const { data: member, error: memberErr } = await supabase
    .from("pod_members")
    .select("bid_credits")
    .eq("pod_id", podId)
    .eq("user_id", userId)
    .single();
  if (memberErr) throw memberErr;

  const available = member?.bid_credits ?? 0;
  if (available < credits) throw new Error(`You only have ${available} bid credits`);

  const { data, error } = await supabase
    .from("bids")
    .upsert(
      {
        game_id:    gameId,
        pod_id:     podId,
        user_id:    userId,
        credits,
        status:     "active",
        placed_at:  new Date().toISOString(),
      },
      { onConflict: "game_id,user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Captain resolves an auction:
 *  1. Highest active bid wins
 *  2. Winner's credits are deducted from pod_members
 *  3. Losing bids are marked "refunded" (credits kept)
 *  4. Game is assigned to the winner via the assignments table
 */
export async function resolveAuction(gameId, podId) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");

  // Verify caller is the pod captain
  const { data: pod, error: podErr } = await supabase
    .from("pods")
    .select("captain_id")
    .eq("id", podId)
    .single();
  if (podErr) throw podErr;
  if (pod.captain_id !== userId) throw new Error("Only the pod captain can resolve auctions");

  // Fetch all active bids, sorted high → low
  const { data: bids, error: bidErr } = await supabase
    .from("bids")
    .select("id, user_id, credits")
    .eq("game_id", gameId)
    .eq("pod_id", podId)
    .eq("status", "active")
    .order("credits", { ascending: false });
  if (bidErr) throw bidErr;
  if (!bids?.length) throw new Error("No active bids to resolve");

  const winner = bids[0];
  const losers = bids.slice(1);
  const now    = new Date().toISOString();

  // Mark winner, mark losers, fetch winner credits — run concurrently
  const [wonRes, lossRes, creditsRes] = await Promise.all([
    supabase.from("bids").update({ status: "won", resolved_at: now }).eq("id", winner.id),
    losers.length > 0
      ? supabase.from("bids").update({ status: "refunded", resolved_at: now }).in("id", losers.map(b => b.id))
      : Promise.resolve({ error: null }),
    supabase.from("pod_members").select("bid_credits").eq("pod_id", podId).eq("user_id", winner.user_id).single(),
  ]);
  if (wonRes.error)  throw wonRes.error;
  if (lossRes.error) throw lossRes.error;

  // Deduct winner's bid credits and assign game + fetch opponent — concurrently
  const deduct = creditsRes.data
    ? supabase
        .from("pod_members")
        .update({ bid_credits: Math.max(0, creditsRes.data.bid_credits - winner.credits) })
        .eq("pod_id", podId)
        .eq("user_id", winner.user_id)
    : Promise.resolve({ error: null });

  const [, assignRes, gameRow] = await Promise.all([
    deduct,
    supabase.from("assignments").upsert(
      {
        game_id:     gameId,
        pod_id:      podId,
        user_id:     winner.user_id,
        method:      "bidding",
        assigned_at: now,
        confirmed:   true,
      },
      { onConflict: "game_id" }
    ),
    supabase.from("games").select("opponent").eq("id", gameId).single(),
  ]);
  if (assignRes.error) throw assignRes.error;

  const opponent = gameRow.data?.opponent ?? "the game";

  notify({
    userId: winner.user_id,
    type:   "bid_won",
    title:  "🏆 You won the bid!",
    body:   `You got the seat for vs. ${opponent} with ${winner.credits} credits. Check your schedule.`,
    url:    "/app",
  });
  notify({
    podId,
    type:  "bid_resolved",
    title: "⚡ Playoff bid resolved",
    body:  `The auction for vs. ${opponent} has been settled. Check the bid screen for results.`,
    url:   "/app",
  });

  return { winnerId: winner.user_id, credits: winner.credits };
}

/**
 * Get the current user's bid credit balance for a specific pod.
 */
export async function getMyBidCredits(podId) {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("pod_members")
    .select("bid_credits")
    .eq("pod_id", podId)
    .eq("user_id", userId)
    .single();
  if (error) return 0;
  return data?.bid_credits ?? 0;
}

/**
 * Check if the current user has ever won a bid (used for achievements).
 */
export async function getMyWonBids() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from("bids")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "won");
  return data ?? [];
}

/**
 * Captain awards bonus bid credits to a specific pod member.
 */
export async function awardBidCredits(podId, memberId, amount) {
  const captainId = await getCurrentUserId();
  if (!captainId) throw new Error("Must be signed in");

  const [podRes, memberRes] = await Promise.all([
    supabase.from("pods").select("captain_id").eq("id", podId).single(),
    supabase.from("pod_members").select("bid_credits").eq("pod_id", podId).eq("user_id", memberId).single(),
  ]);
  if (podRes.error) throw podRes.error;
  if (podRes.data.captain_id !== captainId) throw new Error("Only the captain can award credits");
  if (memberRes.error) throw memberRes.error;

  const newTotal = (memberRes.data?.bid_credits ?? 0) + amount;
  const { error } = await supabase
    .from("pod_members")
    .update({ bid_credits: newTotal })
    .eq("pod_id", podId)
    .eq("user_id", memberId);
  if (error) throw error;

  notify({
    userId: memberId,
    type:   "bid_credits_awarded",
    title:  "🎯 Bid credits awarded!",
    body:   `Your captain awarded you ${amount} bid credit${amount !== 1 ? "s" : ""}. Use them in the bid auction!`,
    url:    "/app",
  });

  return newTotal;
}
