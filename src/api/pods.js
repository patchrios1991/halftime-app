// ─── Pods API ─────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { normalizeGames } from "../lib/embed";

/** Fetch all pods the current user is a member of */
export async function getMyPods() {
  // Use getSession (local storage) instead of getUser (network call) for reliability
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return [];

  // Step 1: get this user's pod memberships
  const { data: memberships, error: memberErr } = await supabase
    .from("pod_members")
    .select("pod_id, share_pct, cost, escrow_funded, bid_credits, games_allocated, games_attended")
    .eq("user_id", user.id);

  if (memberErr) throw memberErr;
  if (!memberships?.length) return [];

  const podIds = memberships.map(m => m.pod_id);

  // Step 2: fetch those pods
  const { data: pods, error: podErr } = await supabase
    .from("pods")
    .select("*")
    .in("id", podIds)
    .order("created_at", { ascending: false });

  if (podErr) throw podErr;

  // Attach member rows to each pod so PodScreen can read them
  return (pods ?? []).map(pod => ({
    ...pod,
    pod_members: memberships.filter(m => m.pod_id === pod.id),
  }));
}

/** Fetch all pods open for recruiting (browse/explore) */
export async function getRecruitingPods({ sport } = {}) {
  let query = supabase
    .from("pods")
    .select("*, pod_members(count)")
    .eq("status", "recruiting")
    .order("created_at", { ascending: false });

  if (sport) query = query.eq("sport", sport);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Fetch a single pod with all members and games */
export async function getPodById(podId) {
  const { data, error } = await supabase
    .from("pods")
    .select(`
      *,
      pod_members(*, profiles(id, display_name, avatar_initials, verified, trust_score, connect_account_id, connect_onboarded)),
      games(*, assignments(user_id, method, confirmed))
    `)
    .eq("id", podId)
    .single();

  if (error) throw error;
  normalizeGames(data?.games);
  return data;
}

/** Generate a unique 8-char pod invite code */
function generateInviteCode() {
  // Unambiguous chars (no 0/O, 1/I/L)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr   = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}

/** Create a new pod (caller becomes captain) */
export async function createPod(podData) {
  // getSession() reads local storage — no network round-trip, can't hang
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Must be signed in to create a pod");

  // Pull out captainShare — it's a UI helper, not a pods column
  const { captainShare, ...podColumns } = podData;

  const { data: pod, error: podError } = await supabase
    .from("pods")
    .insert({ ...podColumns, captain_id: user.id, invite_code: generateInviteCode() })
    .select()
    .single();

  if (podError) throw podError;

  // Auto-add captain as first member.
  // If perks are not shared, captain pays slightly more to cover the 5% member discounts —
  // total collected across all members still equals season_cost.
  const shareToUse = captainShare || 25;
  const perksIncluded = podData.perks_included !== false;
  const captainCost = perksIncluded
    ? (pod.season_cost * shareToUse) / 100
    : pod.season_cost * (1 - ((100 - shareToUse) / 100) * 0.95);

  const { error: memberError } = await supabase
    .from("pod_members")
    .insert({
      pod_id:    pod.id,
      user_id:   user.id,
      share_pct: shareToUse,
      cost:      captainCost,
      tier:      "captain",
    });

  if (memberError) throw memberError;
  return pod;
}

/** Update pod status or allocation method */
export async function updatePod(podId, updates) {
  const { data, error } = await supabase
    .from("pods")
    .update(updates)
    .eq("id", podId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Mark allocation complete and persist method used */
export async function markAllocationDone(podId, method) {
  return updatePod(podId, { allocation_done: true, allocation_method: method });
}

/** Join a recruiting pod as a member (equal share of remaining %) */
export async function joinPod(podId) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Must be signed in to join a pod");

  const { data: pod, error: podErr } = await supabase
    .from("pods")
    .select("season_cost, max_members, status")
    .eq("id", podId)
    .single();
  if (podErr) throw podErr;
  if (pod.status !== "recruiting") throw new Error("This pod is no longer recruiting");

  const { data: members, error: memberErr } = await supabase
    .from("pod_members")
    .select("share_pct, user_id")
    .eq("pod_id", podId);
  if (memberErr) throw memberErr;

  if (members.some(m => m.user_id === user.id))
    throw new Error("You are already a member of this pod");

  const usedPct       = members.reduce((sum, m) => sum + parseFloat(m.share_pct || 0), 0);
  const remainingSpots = (pod.max_members || 6) - members.length;
  if (remainingSpots <= 0) throw new Error("This pod is full");

  const sharePct = Math.round((100 - usedPct) / remainingSpots);
  const baseCost = (parseFloat(pod.season_cost) * sharePct) / 100;
  // Members pay 5% less when perks are not shared — captain absorbs the difference
  const cost = pod.perks_included === false ? baseCost * 0.95 : baseCost;

  const { error: joinErr } = await supabase
    .from("pod_members")
    .insert({ pod_id: podId, user_id: user.id, share_pct: sharePct, cost, tier: "starter" });

  if (joinErr) throw joinErr;
}

/** Fetch a pod by its invite code (public — no auth required) */
export async function getPodByInviteCode(code) {
  const { data, error } = await supabase
    .from("pods")
    .select("*, pod_members(count)")
    .eq("invite_code", code.toUpperCase().trim())
    .single();

  if (error) throw error;
  return data;
}

/**
 * Leave a pod as a member.
 * Calls the leave-pod edge function which handles Stripe refund (if funded),
 * removes the member row, and notifies the captain.
 */
export async function leavePod(podId) {
  const { data, error } = await supabase.functions.invoke("leave-pod", {
    body: { podId },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Delete a pod entirely (captain only, pod must not be fully funded/active).
 * Cascades to pod_members, games, assignments, etc. via DB constraints.
 */
export async function deletePod(podId) {
  const { error } = await supabase
    .from("pods")
    .delete()
    .eq("id", podId);
  if (error) throw error;
}

/**
 * Verify ticket availability for a group-buy pod.
 * action: 'url' | 'screenshot' | 'both'
 * Results are stored on the pod record — call is non-blocking from the UI.
 */
export async function verifyTickets(podId, action = "both") {
  const { data, error } = await supabase.functions.invoke("verify-tickets", {
    body: { podId, action },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Get the escrow balance for a pod (sum of succeeded payments).
 *  Uses an RPC because escrow_payments RLS only exposes the caller's own
 *  rows — summing client-side undercounts for everyone else's payments. */
export async function getPodEscrowBalance(podId) {
  const { data, error } = await supabase
    .rpc("get_pod_escrow_balance", { p_pod_id: podId });

  if (error) throw error;
  return Number(data) || 0;
}
