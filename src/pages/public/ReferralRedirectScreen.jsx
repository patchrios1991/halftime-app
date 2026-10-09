// ─── Referral redirect page ────────────────────────────────────────────────────
// A referrer's shareable link lands here (/r/:code). Stashes the code for
// useAuth to claim once a session exists (works for a brand-new signup,
// an existing user signing back in, or an OAuth round-trip through
// /auth/callback — all of them eventually call loadProfile()), then sends
// the visitor straight into sign-up.
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";

export default function ReferralRedirectScreen() {
  const { code }   = useParams();
  const navigate   = useNavigate();

  useEffect(() => {
    if (code) {
      try { localStorage.setItem("ht_referral_code", code); } catch { /* ignore */ }
    }
    navigate("/auth/signin?mode=signup", { replace: true });
  }, [code, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: T.dark, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Wordmark size={24} />
      <div style={{ width: 32, height: 32, borderRadius: "50%",
        border: `3px solid #1A4A2E`, borderTopColor: T.lime,
        animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
