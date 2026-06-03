// ─── ActivePodContext ─────────────────────────────────────────────────────────
// Tracks which pod is currently active across all screens.
// Persists to localStorage so the selection survives page refreshes.
// When the user has only one pod, it's always selected automatically.
import { createContext, useContext, useState, useEffect } from "react";
import { useMyPods } from "../hooks/usePod";

const ActivePodCtx = createContext(null);

export function ActivePodProvider({ children }) {
  const { pods, loading, refresh } = useMyPods();

  const [activePodId, setActivePodIdRaw] = useState(
    () => localStorage.getItem("ht_active_pod") || null,
  );

  // When pods load, ensure the stored ID is still valid.
  // Only resets to the first pod when the ID is genuinely gone (deleted/left),
  // NOT during a brief window where pods are refreshing after a new pod was created.
  useEffect(() => {
    if (!loading && pods.length > 0) {
      const stored = localStorage.getItem("ht_active_pod");
      const stillValid = pods.some(p => p.id === stored);
      if (!stillValid) {
        // Stored ID not found in pods — fall back to first pod
        const first = pods[0].id;
        setActivePodIdRaw(first);
        localStorage.setItem("ht_active_pod", first);
      } else if (stored !== activePodId) {
        // localStorage was updated (e.g. new pod created) — sync state
        setActivePodIdRaw(stored);
      }
    }
  }, [pods, loading]); // intentionally omits activePodId to avoid re-triggering

  function setActivePodId(id) {
    setActivePodIdRaw(id);
    localStorage.setItem("ht_active_pod", id);
  }

  return (
    <ActivePodCtx.Provider value={{ activePodId, setActivePodId, pods, loading, refresh }}>
      {children}
    </ActivePodCtx.Provider>
  );
}

export function useActivePod() {
  const ctx = useContext(ActivePodCtx);
  // Fallback so screens don't crash if used outside the provider
  if (!ctx) return { activePodId: null, setActivePodId: () => {}, pods: [], loading: false };
  return ctx;
}
