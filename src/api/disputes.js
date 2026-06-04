// ─── Disputes API ─────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify }   from "../lib/notify";
import { getCurrentUserId } from "../lib/auth";

export const DISPUTE_TYPES = [
  { value: "ticket_not_delivered", label: "Ticket not delivered" },
  { value: "captain_unresponsive", label: "Captain is unresponsive" },
  { value: "payment_issue",        label: "Payment / escrow issue" },
  { value: "member_conduct",       label: "Member conduct issue" },
  { value: "other",                label: "Other" },
];

/** File a new dispute for a pod */
export async function fileDispute(podId, type, description) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");
  if (!description?.trim()) throw new Error("Please describe the issue.");

  const { data, error } = await supabase
    .from("disputes")
    .insert({ pod_id: podId, filed_by: userId, type, description: description.trim() })
    .select()
    .single();

  if (error) throw error;

  // Warn the captain (unless they filed it themselves)
  const { data: pod } = await supabase
    .from("pods").select("captain_id, name").eq("id", podId).single();

  if (pod?.captain_id && pod.captain_id !== userId) {
    notify({
      userId: pod.captain_id,
      type:   "perk_flag",
      title:  "⚠️ Dispute filed",
      body:   `A member of ${pod.name} filed a dispute: "${DISPUTE_TYPES.find(t => t.value === type)?.label}". HalfTime will review within 48 hours.`,
      url:    "/app",
    });
  }

  return data;
}

/** Get open disputes for a pod (captain + admin visibility) */
export async function getPodDisputes(podId) {
  const { data, error } = await supabase
    .from("disputes")
    .select("*, profiles(display_name, avatar_initials)")
    .eq("pod_id", podId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
