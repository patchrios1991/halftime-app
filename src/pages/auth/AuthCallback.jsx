// ─── AuthCallback ─────────────────────────────────────────────────────────────
// Handles:
//   1. Email confirmation / OAuth redirect from Supabase
//   2. Return from Stripe Connect onboarding (?connect=success or ?connect=refresh)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  const navigate    = useNavigate();
  const [phase, setPhase] = useState("loading"); // "loading" | "connect_success" | "connect_refresh" | "error"
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");

    // ── Stripe Connect return ────────────────────────────────────────────────
    if (connect === "success") {
      // Mark captain as onboarded in profiles
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user) {
          await supabase
            .from("profiles")
            .update({ connect_onboarded: true })
            .eq("id", session.user.id);
        }
        setPhase("connect_success");
        // Auto-redirect after 3s
        setTimeout(() => navigate("/app", { replace: true }), 3000);
      });
      return;
    }

    if (connect === "refresh") {
      // Onboarding link expired — send back to app to regenerate
      setPhase("connect_refresh");
      setTimeout(() => navigate("/app", { replace: true }), 2500);
      return;
    }

    // ── Normal Supabase auth callback ────────────────────────────────────────
    const timeout = setTimeout(() => {
      setError("Sign-in timed out. Please try again.");
      setPhase("error");
    }, 10000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          // Honour pending redirect (e.g. /join/:code saved before sign-in)
          const returnTo = sessionStorage.getItem("auth_return") || "/app";
          sessionStorage.removeItem("auth_return");
          navigate(returnTo, { replace: true });
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  // ── Connect success ────────────────────────────────────────────────────────
  if (phase === "connect_success") {
    return (
      <Center>
        <Wordmark size={26} />
        <div style={{ fontSize: 52, marginBottom: 4 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.lime,
          fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 8 }}>
          Payouts set up!
        </div>
        <p style={{ color: T.mist, fontSize: 14, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
          Your bank account is connected. Once all pod members fund their escrow, your payout will be sent automatically.
        </p>
        <div style={{ marginTop: 16, fontSize: 11, color: T.mist }}>Returning to app…</div>
      </Center>
    );
  }

  // ── Connect refresh (link expired) ────────────────────────────────────────
  if (phase === "connect_refresh") {
    return (
      <Center>
        <Wordmark size={26} />
        <div style={{ fontSize: 52, marginBottom: 4 }}>🔄</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.amber,
          fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 8 }}>
          Setup link expired
        </div>
        <p style={{ color: T.mist, fontSize: 14, textAlign: "center", margin: 0 }}>
          Your onboarding link expired. Tap "Set up payouts" again in the app to get a fresh link.
        </p>
        <div style={{ marginTop: 16, fontSize: 11, color: T.mist }}>Returning to app…</div>
      </Center>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <Center>
        <Wordmark size={26} />
        <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
          borderRadius: 12, padding: "16px 20px", color: T.red,
          fontSize: 14, maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sign-in failed</div>
          <div style={{ opacity: 0.8 }}>{error}</div>
          <button onClick={() => navigate("/auth/signin")}
            style={{ marginTop: 12, background: T.red, color: T.white, border: "none",
              borderRadius: 8, padding: "8px 18px", cursor: "pointer",
              fontWeight: 700, fontSize: 13 }}>
            Try again
          </button>
        </div>
      </Center>
    );
  }

  // ── Loading / completing sign-in ──────────────────────────────────────────
  return (
    <Center>
      <Wordmark size={26} />
      <div style={{ width: 40, height: 40, borderRadius: "50%",
        border: `3px solid ${T.green}`, borderTopColor: T.lime,
        animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: T.mist, fontSize: 14, margin: 0 }}>Completing sign-in…</p>
    </Center>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: T.dark,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20, padding: 24 }}>
      {children}
    </div>
  );
}
