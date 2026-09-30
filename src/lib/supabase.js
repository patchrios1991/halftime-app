// ─── Supabase Client ──────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

// TEMP: diagnosing setSession() hanging on native — enables gotrue-js's own
// internal navigator-lock debug logging. Must be set before createClient()
// runs, since it's read once at module import time. Remove once fixed.
try { localStorage.setItem("supabase.gotrue-js.locks.debug", "true"); } catch { /* ignore */ }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[HalfTime] Supabase env vars not set — running in offline/demo mode.\n" +
    "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-key",
  {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      flowType:          "implicit", // avoids PKCE code-verifier issues with email links
      debug:             true, // TEMP: diagnosing setSession() hanging on native — remove once fixed
    },
  }
);

// True when real credentials are present
export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl !== "https://placeholder.supabase.co";
