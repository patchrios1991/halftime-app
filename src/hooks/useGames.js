// ─── useGames ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  getGamesForPod,
  getMyGames,
  addGame as apiAddGame,
  addGames as apiAddGames,
  runAndSaveAllocation as apiRunAndSaveAllocation,
  confirmAttendance as apiConfirmAttendance,
} from "../api/games";

/**
 * Hook for all games in a pod + realtime assignment updates.
 *
 * Usage:
 *   const { games, loading, addGame, runAllocation } = useGames(podId);
 */
export function useGames(podId) {
  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [error, setError]     = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!podId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getGamesForPod(podId);
      setGames(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refire when any assignment changes for this pod
  useEffect(() => {
    if (!podId || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel(`games:${podId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `pod_id=eq.${podId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments", filter: `pod_id=eq.${podId}` },
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

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addGame = useCallback(async (gameData) => {
    const game = await apiAddGame(podId, gameData);
    await load();
    return game;
  }, [podId, load]);

  const addGames = useCallback(async (gamesArray) => {
    const inserted = await apiAddGames(podId, gamesArray);
    await load();
    return inserted;
  }, [podId, load]);

  /**
   * Run allocation algorithm and persist results.
   * @param {object} pod        - Full pod record
   * @param {object[]} members  - pod_members with share_pct
   * @param {"snake"|"lottery"|"ai"} method
   */
  const runAllocation = useCallback(async (pod, members, method) => {
    setAllocating(true);
    setError(null);
    try {
      const assignmentMap = await apiRunAndSaveAllocation(pod, games, members, method);
      await load();
      return assignmentMap;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setAllocating(false);
    }
  }, [games, load]);

  const confirmAttendance = useCallback(async (gameId) => {
    await apiConfirmAttendance(gameId);
    await load();
  }, [load]);

  return {
    games,
    loading,
    allocating,
    error,
    refresh: load,
    addGame,
    addGames,
    runAllocation,
    confirmAttendance,
  };
}

/**
 * Hook for just the current user's allocated games in a pod.
 *
 * Usage:
 *   const { games, loading } = useMyGames(podId, userId);
 */
export function useMyGames(podId, userId) {
  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!podId || !userId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getMyGames(podId, userId);
      setGames(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [podId, userId]);

  useEffect(() => { load(); }, [load]);

  return { games, loading, error, refresh: load };
}
