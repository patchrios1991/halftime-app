// ─── useNotifications ─────────────────────────────────────────────────────────
// Loads notifications from Supabase and subscribes to realtime inserts,
// so a webhook-triggered notification appears instantly without a page refresh.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getNotifications, markAllRead as apiMarkAllRead } from "../api/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const channelRef = useRef(null);

  // ── Initial fetch ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (e) {
      console.error("[useNotifications] fetch failed:", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Realtime: new notification inserted (e.g. by webhook) ────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          // Prepend the new row so it appears at the top immediately
          setNotifications(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // ── Mark all read ────────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      await apiMarkAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error("[useNotifications] markAllRead failed:", e.message);
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAllRead, refresh: load };
}
