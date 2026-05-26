// ─── ActivePodContext ─────────────────────────────────────────────────────────
// Tracks which pod is currently active across all screens.
// Persists to localStorage so the selection survives page refreshes.
// When the user has only one pod, it's always selected automatically.
import { createContext, useContext, useState, useEffect } from "react";
import { useMyPods } from "../hooks/usePod";

const ActivePodCtx = createContext(null);

export function ActivePodProvider({ children }) {
  const { pods, loading } = useMyPods();

  const [activePodId, setActivePodIdRaw] = useState(
    () => localStorage.getItem("ht_active_pod") || null,
  );

  // When pods load, ensure the stored ID is still valid
  useEffect(() => {
    if (!loading && pods.length > 0) {
      const stillValid = pods.some(p => p.id === activePodId);
      if (!stillValid) {
        const first = pods[0].id;
        setActivePodIdRaw(first);
        localStorage.setItem("ht_active_pod", first);
      }
    }
  }, [pods, loading, activePodId]);

  function setActivePodId(id) {
    setActivePodIdRaw(id);
    localStorage.setItem("ht_active_pod", id);
  }

  return (
    <ActivePodCtx.Provider value={{ activePodId, setActivePodId, pods, loading }}>
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
