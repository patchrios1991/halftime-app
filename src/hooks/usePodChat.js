// ─── usePodChat ───────────────────────────────────────────────────────────────
// Real-time chat for a pod. Loads history and subscribes to new messages.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export function usePodChat(podId) {
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);
  const [error,     setError]     = useState(null);
  const channelRef = useRef(null);

  // ── Load history ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!podId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("pod_messages")
        .select("*, profiles!user_id(display_name, avatar_initials)")
        .eq("pod_id", podId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (err) throw err;
      setMessages(data || []);
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
          if (data) {
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

  return { messages, loading, sending, error, sendMessage, refresh: load };
}
