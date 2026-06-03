// ─── Ticket Delivery API ───────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify }   from "../lib/notify";

/**
 * Captain: mark a ticket as forwarded for an assignment.
 * Writes to the notifications table (in-app bell) AND fires a push to the member's device.
 */
export async function markTicketDelivered(assignmentId, note = "", ticketUrl = "") {
  const { error } = await supabase
    .from("assignments")
    .update({
      delivery_status: "delivered",
      delivery_note:   note       || null,
      ticket_url:      ticketUrl  || null,
      delivered_at:    new Date().toISOString(),
    })
    .eq("id", assignmentId);

  if (error) throw error;

  // Fetch assignment details to build the notification
  const { data: assignment } = await supabase
    .from("assignments")
    .select("user_id, pod_id, game_id, games(opponent, game_date)")
    .eq("id", assignmentId)
    .single();

  if (assignment?.user_id) {
    const opponent = assignment.games?.opponent || "upcoming game";
    const title    = "🎟️ Your ticket is ready!";
    const body     = ticketUrl
      ? `Your captain forwarded your ticket for vs. ${opponent}. Tap "Claim Ticket" in the app to get it.`
      : note
      ? `Your captain forwarded your ticket for vs. ${opponent}. ${note}`
      : `Your captain forwarded your ticket for vs. ${opponent}. Check your email or Ticketmaster.`;

    // In-app bell notification
    await supabase.from("notifications").insert({
      user_id: assignment.user_id,
      type:    "ticket_delivered",
      title,
      body,
      data:    { assignment_id: assignmentId, screen: "schedule" },
    });

    // Device push notification
    notify({ userId: assignment.user_id, type: "ticket_delivered", title, body, url: "/app" });
  }
}

/**
 * Member: confirm they received their ticket.
 */
export async function confirmTicketReceipt(assignmentId) {
  const { error } = await supabase
    .from("assignments")
    .update({
      delivery_status: "confirmed",
      confirmed_at:    new Date().toISOString(),
      confirmed:       true,
    })
    .eq("id", assignmentId);

  if (error) throw error;
}

/**
 * Load delivery status for all assignments in a pod.
 * Returns a map of game_id → assignment row with delivery columns.
 */
export async function getPodDeliveryStatus(podId) {
  if (!podId) return {};
  const { data, error } = await supabase
    .from("assignments")
    .select("id, game_id, user_id, delivery_status, delivery_note, ticket_url, delivered_at, confirmed_at")
    .eq("pod_id", podId);

  if (error) throw error;

  const map = {};
  (data || []).forEach(a => { map[a.game_id] = a; });
  return map;
}
