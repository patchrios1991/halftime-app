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
import { isNative } from "./lib/native";
import { setNavigateFn } from "./lib/routerBridge";

// Hands this router's navigate() function to routerBridge so code outside
// React (native.js's OAuth deep-link handler) can trigger real navigation.
function NavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => { setNavigateFn(navigate); }, [navigate]);
  return null;
}

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
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If already signed in, skip the landing page and go straight to the app.
  // In the native app there's no reason to show a marketing page with an
  // "Open App" button — go straight to sign in/create account instead. The
  // marketing landing page still shows for web visitors.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/app", { replace: true });
      } else if (isNative) {
        navigate("/auth/signin", { replace: true });
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
        <NavigateBridge />
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
