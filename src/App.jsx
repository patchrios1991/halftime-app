// ─── HalfTime Router Root ─────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import HalfTimeApp    from "./HalfTimeApp";
import BetaDashboard  from "./pages/admin/BetaDashboard";
import SignIn         from "./pages/auth/SignIn";
import AuthCallback   from "./pages/auth/AuthCallback";
import JoinPodScreen  from "./pages/app/JoinPodScreen";
import GuestPassScreen from "./pages/public/GuestPassScreen";
import TermsScreen    from "./pages/legal/TermsScreen";
import PrivacyScreen  from "./pages/legal/PrivacyScreen";
import ErrorBoundary  from "./components/ErrorBoundary";
import { T } from "./tokens";
import { supabase, isSupabaseConfigured } from "./lib/supabase";

// ─── Admin-only route guard ───────────────────────────────────────────────────
function AdminRoute({ children }) {
  const [status, setStatus] = useState("checking"); // "checking" | "allowed" | "denied"

  useEffect(() => {
    async function check() {
      if (!isSupabaseConfigured) { setStatus("denied"); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("denied"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();
      setStatus(profile?.is_admin ? "allowed" : "denied");
    }
    check();
  }, []);

  if (status === "checking") {
    return (
      <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%",
          border: `3px solid #1A4A2E`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return status === "allowed" ? children : <Navigate to="/" replace />;
}

function Landing() {
  const navigate = useNavigate();
  const [email,        setEmail]        = useState("");
  const [submitted,    setSubmitted]    = useState(false);
  const [wlBusy,       setWlBusy]       = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If already signed in, skip the landing page and go straight to the app
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/app", { replace: true });
      } else {
        setCheckingAuth(false);
      }
    });
  }, [navigate]);

  if (checkingAuth) {
    return (
      <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%",
          border: `3px solid #1A4A2E`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  async function handleWaitlist(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setWlBusy(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.from("waitlist").insert({ email: email.trim() });
      }
      setSubmitted(true);
    } catch { setSubmitted(true); } // show success even if table doesn't exist yet
    finally { setWlBusy(false); }
  }

  return (
    <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
      flexDirection: "column", alignItems: "center",
      fontFamily: "Calibri,sans-serif", color: T.white, padding: "40px 24px 60px" }}>

      {/* Logo */}
      <div style={{ fontFamily: "Georgia,serif", fontSize: 52, fontWeight: 900, marginBottom: 8 }}>
        <span style={{ color: T.white }}>Half</span>
        <span style={{ color: T.lime }}>Time</span>
      </div>

      {/* Tagline */}
      <div style={{ fontSize: 19, color: T.mist, textAlign: "center",
        maxWidth: 420, lineHeight: 1.65, marginBottom: 8 }}>
        Own half. Play every game.
      </div>
      <div style={{ fontSize: 13, color: T.mist, textAlign: "center",
        maxWidth: 380, lineHeight: 1.65, marginBottom: 32 }}>
        Fractional season ticket co-ownership — split costs, share games, trade & resell with your pod.
      </div>

      {/* Primary CTA */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap",
        justifyContent: "center", marginBottom: 40 }}>
        <Link to="/app" style={{
          background: T.lime, color: T.dark, padding: "15px 36px", borderRadius: 12,
          fontWeight: 700, fontSize: 16, textDecoration: "none", fontFamily: "Georgia,serif",
          boxShadow: `0 4px 24px ${T.lime}33`,
        }}>
          Open App →
        </Link>
      </div>

      {/* Feature bullets */}
      <div style={{ maxWidth: 420, width: "100%", marginBottom: 40 }}>
        {[
          ["🤖", "AI-powered fair allocation",     "Games distributed by ownership share + preferences"],
          ["♻️", "In-pod resale marketplace",       "Can't make it? List your ticket in seconds"],
          ["💳", "Stripe-secured escrow",           "Funds protected until the pod is fully committed"],
          ["🔄", "Trade games with pod members",    "Swap any game, any time — instant settlement"],
        ].map(([icon, title, sub]) => (
          <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start",
            marginBottom: 16 }}>
            <div style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{title}</div>
              <div style={{ fontSize: 12, color: T.mist, marginTop: 1 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Waitlist */}
      <div style={{ maxWidth: 420, width: "100%", background: T.forest,
        border: "1px solid #1A4A2E", borderRadius: 16, padding: "24px 20px",
        marginBottom: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>
          🏆 Get early access
        </div>
        <div style={{ fontSize: 12, color: T.mist, marginBottom: 16 }}>
          We're onboarding new pods by invite. Drop your email and we'll reach out.
        </div>
        {submitted ? (
          <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
            borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
            <div style={{ fontSize: 13, color: T.lime, fontWeight: 700 }}>You're on the list!</div>
            <div style={{ fontSize: 11, color: T.mist, marginTop: 4 }}>
              We'll reach out soon. Invite a friend to move up faster.
            </div>
          </div>
        ) : (
          <form onSubmit={handleWaitlist}
            style={{ display: "flex", gap: 8 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                flex: 1, padding: "11px 14px", background: T.dark,
                border: "1px solid #1A4A2E", borderRadius: 8, color: T.white,
                fontSize: 13, outline: "none", fontFamily: "Calibri,sans-serif",
              }}
            />
            <button type="submit" disabled={wlBusy}
              style={{
                padding: "11px 18px", background: T.lime, border: "none",
                borderRadius: 8, color: T.dark, fontSize: 13,
                fontWeight: 700, cursor: "pointer",
                opacity: wlBusy ? 0.7 : 1, flexShrink: 0,
              }}>
              {wlBusy ? "…" : "Join →"}
            </button>
          </form>
        )}
      </div>

      <div style={{ fontSize: 11, color: T.mist, textAlign: "center", lineHeight: 2 }}>
        🔒 Payments secured by Stripe · Data encrypted at rest · No spam ever
        <br />
        <Link to="/terms" style={{ color: T.mist, marginRight: 12 }}>Terms of Service</Link>
        <Link to="/privacy" style={{ color: T.mist }}>Privacy Policy</Link>
      </div>
    </div>
  );
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────
function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{
      background: T.dark, minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", fontFamily: "Calibri,sans-serif",
      color: T.white, padding: "40px 24px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "Georgia,serif", fontSize: 72, fontWeight: 900,
        color: T.lime, lineHeight: 1, marginBottom: 16 }}>404</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
        fontFamily: "Georgia,serif", marginBottom: 8 }}>Page not found</div>
      <div style={{ fontSize: 13, color: T.mist, maxWidth: 320, lineHeight: 1.6, marginBottom: 28 }}>
        That page doesn't exist — looks like a bad bounce pass. Head back to the app.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => navigate(-1)}
          style={{ padding: "12px 24px", background: "transparent",
            border: `1.5px solid ${T.green}`, borderRadius: 10,
            color: T.chalk, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ← Go Back
        </button>
        <Link to="/app" style={{
          padding: "12px 28px", background: T.lime, color: T.dark,
          borderRadius: 10, fontWeight: 700, fontSize: 13,
          textDecoration: "none", fontFamily: "Georgia,serif",
        }}>
          Open App →
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/"                element={<Landing />} />
          <Route path="/app"             element={<HalfTimeApp />} />
          <Route path="/admin"           element={<AdminRoute><BetaDashboard /></AdminRoute>} />
          <Route path="/auth/signin"     element={<SignIn />} />
          <Route path="/auth/callback"   element={<AuthCallback />} />
          <Route path="/join/:code"      element={<JoinPodScreen />} />
          <Route path="/guest/:code"     element={<GuestPassScreen />} />
          <Route path="/terms"           element={<TermsScreen />} />
          <Route path="/privacy"         element={<PrivacyScreen />} />
          <Route path="*"                element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
