// ─── Supabase Client ──────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

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
    },
  }
);

// True when real credentials are present
export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl !== "https://placeholder.supabase.co";
