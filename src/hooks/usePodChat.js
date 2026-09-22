// ─── usePodChat ───────────────────────────────────────────────────────────────
// Real-time chat for a pod. Loads history and subscribes to new messages.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { reportMessage as apiReportMessage, blockUser as apiBlockUser, getBlockedUserIds } from "../api/moderation";

export function usePodChat(podId) {
  const [messages,   setMessages]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState(null);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const blockedIdsRef = useRef(blockedIds);
  const channelRef = useRef(null);

  useEffect(() => { blockedIdsRef.current = blockedIds; }, [blockedIds]);

  // ── Load history ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!podId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data, error: err }, blocked] = await Promise.all([
        supabase
          .from("pod_messages")
          .select("*, profiles!user_id(display_name, avatar_initials)")
          .eq("pod_id", podId)
          .order("created_at", { ascending: true })
          .limit(100),
        getBlockedUserIds(),
      ]);
      if (err) throw err;
      const blockedSet = new Set(blocked);
      setBlockedIds(blockedSet);
      setMessages((data || []).filter(m => !blockedSet.has(m.user_id)));
    } catch (e) {
      console.error("[usePodChat] load:", e.message);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!podId || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel(`pod-chat-${podId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "pod_messages",
          filter: `pod_id=eq.${podId}`,
        },
        async (payload) => {
          // Fetch the full row with profile join for the new message
          const { data } = await supabase
            .from("pod_messages")
            .select("*, profiles!user_id(display_name, avatar_initials)")
            .eq("id", payload.new.id)
            .single();
          if (data && !blockedIdsRef.current.has(data.user_id)) {
            setMessages(prev => {
              // Avoid duplicates if optimistic update already added it
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data];
            });
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [podId]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !podId || !isSupabaseConfigured) return;
    setSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { error: err } = await supabase
        .from("pod_messages")
        .insert({ pod_id: podId, user_id: userId, content: content.trim() });
      if (err) throw err;
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [podId]);

  // ── Report / block ──────────────────────────────────────────────────────────
  const reportMessage = useCallback(async (messageId) => {
    await apiReportMessage(messageId);
  }, []);

  const blockSender = useCallback(async (userId) => {
    await apiBlockUser(userId);
    setBlockedIds(prev => new Set(prev).add(userId));
    setMessages(prev => prev.filter(m => m.user_id !== userId));
  }, []);

  return {
    messages, loading, sending, error, sendMessage, refresh: load,
    reportMessage, blockSender,
  };
}
