// ─── useResale ────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  listGameForResale,
  cancelListing,
  getResaleListings,
  getMyPayouts,
} from "../api/resale";

/**
 * Hook for resale listings in a pod + realtime updates.
 *
 * Usage:
 *   const { listings, payouts, loading, listGame, cancel } = useResale(podId);
 */
export function useResale(podId) {
  const [listings, setListings] = useState([]);
  const [payouts,  setPayouts]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!podId || !isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [listingData, payoutData] = await Promise.all([
        getResaleListings(podId),
        getMyPayouts(),
      ]);
      setListings(listingData || []);
      setPayouts(payoutData  || []);
    } catch (e) {
      // Table may not exist yet — show empty state instead of crashing
      console.warn("useResale load:", e.message);
      setListings([]);
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription on resale_listings
  useEffect(() => {
    if (!podId || !isSupabaseConfigured) return;

    channelRef.current = supabase
      .channel(`resale:${podId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resale_listings", filter: `pod_id=eq.${podId}` },
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

  const listGame = useCallback(async ({ gameId, askPrice }) => {
    const result = await listGameForResale({ gameId, podId, askPrice });
    await load();
    return result;
  }, [podId, load]);

  const cancel = useCallback(async (listingId) => {
    await cancelListing(listingId);
    await load();
  }, [load]);

  return { listings, payouts, loading, error, refresh: load, listGame, cancel };
}
