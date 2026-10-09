// ─── Pod Waitlist API ─────────────────────────────────────────────────────────
// Legacy anonymous email-capture waitlist (pod_waitlist table) — joining a
// full pod now always uses the real, authenticated waitlist instead
// (pod_members.is_waitlisted, see migration 048 + joinPod() in api/pods.js).
// getWaitlist() is kept so captains can still see entries collected before
// that existed; nothing writes new pod_waitlist rows anymore.
import { supabase } from "../lib/supabase";

export async function getWaitlist(podId) {
  const { data, error } = await supabase
    .from("pod_waitlist")
    .select("id, email, created_at")
    .eq("pod_id", podId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
