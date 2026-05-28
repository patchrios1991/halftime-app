// ─── Games & Assignments API ──────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify } from "../lib/notify";
import { runSnakeDraft, runLottery, runAIFairness } from "../engine/allocation";

/** Fetch all games for a pod, including assignment info */
export async function getGamesForPod(podId) {
  const { data, error } = await supabase
    .from("games")
    .select("*, assignments(user_id, method, confirmed, no_show)")
    .eq("pod_id", podId)
    .order("game_date", { ascending: true });

  if (error) throw error;
  return data;
}

/** Add a game to a pod (captain only) */
export async function addGame(podId, gameData) {
  const { data, error } = await supabase
    .from("games")
    .insert({ pod_id: podId, ...gameData })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Bulk-insert games for a pod (e.g. full season schedule) */
export async function addGames(podId, gamesArray) {
  const rows = gamesArray.map(g => ({ pod_id: podId, ...g }));
  const { data, error } = await supabase
    .from("games")
    .insert(rows)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Run the allocation engine and persist assignments to the database.
 * This is the real "commit" step — the engine runs client-side,
 * then we upsert all assignments in a single batch.
 */
export async function runAndSaveAllocation(pod, games, members, method) {
  // Map real DB format to engine format
  const engineGames   = games.map(g => ({
    id:   g.id,
    val:  parseFloat(g.face_value) || 0,
    tier: g.tier || "standard",
  }));
  const engineMembers = members.map(m => ({
    id:    m.user_id,
    share: parseFloat(m.share_pct) || 0,
  }));

  // Run the selected algorithm
  let assignmentMap; // { gameId: memberId }
  if (method === "snake") {
    const { assignments } = runSnakeDraft(engineGames, engineMembers);
    assignmentMap = assignments;
  } else if (method === "lottery") {
    assignmentMap = runLottery(engineGames, engineMembers);
  } else {
    assignmentMap = runAIFairness(engineGames, engineMembers);
  }

  // Build rows for DB (game UUIDs → profile UUIDs)
  const rows = Object.entries(assignmentMap)
    .filter(([, userId]) => userId !== null)
    .map(([gameId, userId]) => ({
      game_id:   gameId,
      pod_id:    pod.id,
      user_id:   userId,
      method,
    }));

  const { error } = await supabase
    .from("assignments")
    .upsert(rows, { onConflict: "game_id" });

  if (error) throw error;

  // Update games_allocated count on pod_members
  const counts = {};
  rows.forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  for (const [userId, count] of Object.entries(counts)) {
    await supabase
      .from("pod_members")
      .update({ games_allocated: count })
      .eq("pod_id", pod.id)
      .eq("user_id", userId);
  }

  // Mark pod allocation done
  await supabase
    .from("pods")
    .update({ allocation_done: true, allocation_method: method })
    .eq("id", pod.id);

  // Notify all pod members that games have been distributed
  const methodLabel = method === "snake" ? "Snake Draft"
    : method === "lottery" ? "Random Lottery"
    : "AI Fairness";
  notify({
    podId: pod.id,
    type:  "game_allocated",
    title: "🎟️ Games allocated!",
    body:  `Your ${methodLabel} is done. Open the Schedule tab to see your games.`,
    url:   "/app",
  });

  return assignmentMap;
}

/** Delete a game (captain only) */
export async function deleteGame(gameId) {
  const { error } = await supabase.from("games").delete().eq("id", gameId);
  if (error) throw error;
}

/** Confirm attendance for a game */
export async function confirmAttendance(gameId) {
  const { error } = await supabase
    .from("assignments")
    .update({ confirmed: true })
    .eq("game_id", gameId);

  if (error) throw error;
}

/**
 * Captain manually assigns an unassigned game to a specific pod member.
 * Safe to call on already-assigned games (it'll just change the assignee).
 */
export async function assignGame(gameId, podId, userId) {
  const { error } = await supabase
    .from("assignments")
    .upsert(
      { game_id: gameId, pod_id: podId, user_id: userId, method: "manual", confirmed: false },
      { onConflict: "game_id" }
    );
  if (error) throw error;
}

/**
 * Release a game back to the pod — nullifies the assignment so it shows
 * as unassigned and becomes available for re-allocation or trade.
 */
export async function releaseGame(gameId) {
  const { error } = await supabase
    .from("assignments")
    .update({ user_id: null, confirmed: false })
    .eq("game_id", gameId);

  if (error) throw error;
}

/**
 * Update a game's tier (captain only — no RLS check here, enforced by DB policy).
 */
export async function updateGameTier(gameId, tier) {
  const { error } = await supabase
    .from("games")
    .update({ tier })
    .eq("id", gameId);

  if (error) throw error;
}

/** Get my allocated games for a pod */
export async function getMyGames(podId, userId) {
  const { data, error } = await supabase
    .from("assignments")
    .select("*, games(*)")
    .eq("pod_id", podId)
    .eq("user_id", userId)
    .order("games(game_date)", { ascending: true });

  if (error) throw error;
  return data?.map(a => ({ ...a.games, assignment: a })) || [];
}
