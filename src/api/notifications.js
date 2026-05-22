// ─── Notifications API ────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";

/** Fetch the current user's notifications, newest first */
export async function getNotifications(limit = 30) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/** Mark all unread notifications as read */
export async function markAllRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) throw error;
}
