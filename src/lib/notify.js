// ─── Notification helper ───────────────────────────────────────────────────────
// Fire-and-forget wrapper around the send-push edge function.
// Never throws — notifications are best-effort and should never break the
// main user flow if the edge function is unreachable or VAPID is unconfigured.
//
// Usage:
//   notify({ userId: "...", type: "bid_won", title: "Hello", body: "World" })
//   notify({ podId:  "...", type: "game_allocated", title: "Update", body: "..." })
//
// type values (used by HalfTimeApp's notifIcon for the bell panel):
//   game_allocated | game_released | bid_won | bid_resolved
//   escrow_funded | resale_sold | member_joined | attendance
//
import { supabase, isSupabaseConfigured } from "./supabase";

export async function notify({ userId, podId, type = "general", title, body = "", url = "/app" }) {
  if (!isSupabaseConfigured) return; // no-op in demo mode

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    // supabase.functions.invoke handles the base URL — we just pass the name
    await supabase.functions.invoke("send-push", {
      headers: { Authorization: `Bearer ${token}` },
      body: { userId, podId, type, title, body, url },
    });
  } catch (e) {
    // Silently swallow — push is non-critical
    console.warn("[notify]", e?.message ?? e);
  }
}
