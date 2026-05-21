// ─── usePod ───────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  getPodById,
  getMyPods,
  getRecruitingPods,
  createPod as apiCreatePod,
  updatePod as apiUpdatePod,
  getPodEscrowBalance,
} from "../api/pods";

/**
 * Hook for a single pod — loads pod data + subscribes to realtime changes.
 *
 * Usage:
 *   const { pod, members, escrowBalance, loading, refresh } = usePod(podId);
 */
export function usePod(podId) {
  const [pod, setPod]                   = useState(null);
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!podId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [podData, balance] = await Promise.all([
        getPodById(podId),
        getPodEscrowBalance(podId),
      ]);
      setPod(podData);
      setEscrowBalance(balance);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Realtime subscription (pods + pod_members tables)
  useEffect(() => {
    if (!podId || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel(`pod:${podId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pods", filter: `id=eq.${podId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pod_members", filter: `pod_id=eq.${podId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "escrow_payments", filter: `pod_id=eq.${podId}` },
        () => load()
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [podId, load]);

  return {
    pod,
    members: pod?.pod_members ?? [],
    games:   pod?.games ?? [],
    escrowBalance,
    loading,
    error,
    refresh: load,
  };
}

/**
 * Hook for the list of pods the current user belongs to.
 *
 * Usage:
 *   const { pods, loading, refresh } = useMyPods();
 */
export function useMyPods() {
  const [pods, setPods]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getMyPods();
      setPods(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { pods, loading, error, refresh: load };
}

/**
 * Hook for the recruiting/browse page.
 *
 * Usage:
 *   const { pods, loading, refresh } = useRecruitingPods({ sport: "nba" });
 */
export function useRecruitingPods(filters = {}) {
  const [pods, setPods]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecruitingPods(filters);
      setPods(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters.sport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const createPod = useCallback(async (podData) => {
    const pod = await apiCreatePod(podData);
    await load();
    return pod;
  }, [load]);

  const updatePod = useCallback(async (podId, updates) => {
    const pod = await apiUpdatePod(podId, updates);
    await load();
    return pod;
  }, [load]);

  return { pods, loading, error, refresh: load, createPod, updatePod };
}
