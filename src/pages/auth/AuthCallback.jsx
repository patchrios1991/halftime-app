// ─── AuthCallback ─────────────────────────────────────────────────────────────
// Handles the redirect after email confirmation or OAuth (Google) sign-in.
// With implicit flow, Supabase automatically processes the token in the URL
// and fires onAuthStateChange — we just wait for that and redirect to /app.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const navigate    = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // Timeout — if no session fires within 10s, show an error
    const timeout = setTimeout(() => {
      setError("Sign-in timed out. Please try again.");
    }, 10000);

    // Supabase processes the URL token automatically on load and fires this
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          navigate("/app", { replace: true });
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div style={{
      minHeight:      "100vh",
      background:     T.dark,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            24,
      padding:        24,
    }}>
      <Wordmark size={26} />

      {error ? (
        <div style={{
          background:   "rgba(239,68,68,0.12)",
          border:       `1px solid ${T.red}`,
          borderRadius: 12,
          padding:      "16px 20px",
          color:        T.red,
          fontSize:     14,
          maxWidth:     320,
          textAlign:    "center",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sign-in failed</div>
          <div style={{ opacity: 0.8 }}>{error}</div>
          <button
            onClick={() => navigate("/auth/signin")}
            style={{
              marginTop:    12,
              background:   T.red,
              color:        T.white,
              border:       "none",
              borderRadius: 8,
              padding:      "8px 18px",
              cursor:       "pointer",
              fontWeight:   700,
              fontSize:     13,
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div style={{
            width:        40,
            height:       40,
            borderRadius: "50%",
            border:       `3px solid ${T.green}`,
            borderTopColor: T.lime,
            animation:    "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: T.mist, fontSize: 14, margin: 0 }}>
            Completing sign-in…
          </p>
        </>
      )}
    </div>
  );
}
