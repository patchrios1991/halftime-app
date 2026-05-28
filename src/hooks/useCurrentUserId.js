// ─── useCurrentUserId ─────────────────────────────────────────────────────────
// Returns the authenticated user's UUID. Runs the session fetch once inside an
// effect (not in the render body) to avoid duplicate requests on every render.
import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export function useCurrentUserId() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setUserId(session.user.id);
    });
  }, []);

  return userId;
}
