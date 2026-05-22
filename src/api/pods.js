// ─── Pods API ─────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";

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
  return data;
}

/** Create a new pod (caller becomes captain) */
export async function createPod(podData) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Must be signed in to create a pod");

  const { data: pod, error: podError } = await supabase
    .from("pods")
    .insert({ ...podData, captain_id: user.id })
    .select()
    .single();

  if (podError) throw podError;

  // Auto-add captain as first member
  const { error: memberError } = await supabase
    .from("pod_members")
    .insert({
      pod_id:       pod.id,
      user_id:      user.id,
      share_pct:    podData.captainShare || 25,
      cost:         (pod.season_cost * (podData.captainShare || 25)) / 100,
      tier:         "captain",
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
  const cost     = (parseFloat(pod.season_cost) * sharePct) / 100;

  const { error: joinErr } = await supabase
    .from("pod_members")
    .insert({ pod_id: podId, user_id: user.id, share_pct: sharePct, cost, tier: "starter" });

  if (joinErr) throw joinErr;
}

/** Get the escrow balance for a pod (sum of succeeded payments) */
export async function getPodEscrowBalance(podId) {
  const { data, error } = await supabase
    .from("escrow_payments")
    .select("amount")
    .eq("pod_id", podId)
    .eq("status", "succeeded");

  if (error) throw error;
  return data.reduce((sum, p) => sum + Number(p.amount), 0);
}
