// ─── Pod Waitlist API ─────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify }   from "../lib/notify";

export async function joinWaitlist(podId, email) {
  if (!email?.trim()) throw new Error("Email is required.");

  const { error } = await supabase
    .from("pod_waitlist")
    .insert({ pod_id: podId, email: email.trim().toLowerCase() });

  if (error) {
    if (error.code === "23505") throw new Error("You're already on this waitlist.");
    throw error;
  }

  // Notify captain that someone joined the waitlist
  const { data: pod } = await supabase
    .from("pods").select("captain_id, name").eq("id", podId).single();

  if (pod?.captain_id) {
    notify({
      userId: pod.captain_id,
      type:   "member_joined",
      title:  "📋 New waitlist sign-up",
      body:   `${email.trim()} joined the waitlist for ${pod.name}. If a spot opens, reach out to them.`,
      url:    "/app",
    });
  }
}

export async function getWaitlist(podId) {
  const { data, error } = await supabase
    .from("pod_waitlist")
    .select("id, email, created_at")
    .eq("pod_id", podId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
