// ─── Content moderation ───────────────────────────────────────────────────────
// Report a chat message and block a sender (Apple Guideline 1.2).
import { supabase } from "../lib/supabase";

const DEFAULT_REASON = "Reported from pod chat";

/** Report a pod chat message for review. */
export async function reportMessage(messageId, reason = DEFAULT_REASON) {
  const { data: { session } } = await supabase.auth.getSession();
  const reporterId = session?.user?.id;
  if (!reporterId) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("message_reports")
    .insert({ message_id: messageId, reporter_id: reporterId, reason });
  if (error) throw error;
}

/** Block a user — their pod chat messages stop showing for the blocker. */
export async function blockUser(blockedId) {
  const { data: { session } } = await supabase.auth.getSession();
  const blockerId = session?.user?.id;
  if (!blockerId) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("blocked_users")
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

/** IDs of users the current viewer has blocked. */
export async function getBlockedUserIds() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", session.user.id);
  if (error) throw error;
  return (data || []).map(row => row.blocked_id);
}
