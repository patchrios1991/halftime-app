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
      pod_members(*, profiles(id, display_name, avatar_initials, verified, trust_score)),
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
