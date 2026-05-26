// ─── HalfTime Router Root ─────────────────────────────────────────────────────
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import HalfTimeApp   from "./HalfTimeApp";
import BetaDashboard from "./pages/admin/BetaDashboard";
import SignIn        from "./pages/auth/SignIn";
import AuthCallback  from "./pages/auth/AuthCallback";
import JoinPodScreen from "./pages/app/JoinPodScreen";
import { T } from "./tokens";

function Landing() {
  return (
    <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "Calibri,sans-serif", color: T.white, gap: 24, padding: 24 }}>
      <div style={{ fontFamily: "Georgia,serif", fontSize: 48, fontWeight: 900 }}>
        <span style={{ color: T.white }}>Half</span>
        <span style={{ color: T.lime }}>Time</span>
      </div>
      <div style={{ fontSize: 18, color: T.mist, textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
        Own half. Play every game.<br />
        <span style={{ fontSize: 14 }}>Fractional season ticket co-ownership for modern fans.</span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <Link to="/app" style={{
          background: T.lime, color: T.dark, padding: "14px 32px", borderRadius: 10,
          fontWeight: 700, fontSize: 16, textDecoration: "none", fontFamily: "Georgia,serif",
        }}>
          Open App →
        </Link>
        <Link to="/admin" style={{
          background: "transparent", color: T.white, padding: "14px 32px", borderRadius: 10,
          fontWeight: 600, fontSize: 15, textDecoration: "none",
          border: "1px solid rgba(255,255,255,0.2)",
        }}>
          Beta Dashboard
        </Link>
      </div>
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 480 }}>
        {[
          { icon: "🏟️", v: "847",    l: "Active Pods" },
          { icon: "💰", v: "$2.1M",  l: "GMV Facilitated" },
          { icon: "⭐", v: "72 NPS", l: "Member Score" },
        ].map(({ icon, v, l }) => (
          <div key={l} style={{ background: T.forest, borderRadius: 12, padding: "14px 10px",
            textAlign: "center", border: "1px solid #1A4A2E" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>{v}</div>
            <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.mist, marginTop: 8 }}>
        🔒 Payments secured by Stripe · Data encrypted at rest
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/app"             element={<HalfTimeApp />} />
        <Route path="/admin"           element={<BetaDashboard />} />
        <Route path="/auth/signin"     element={<SignIn />} />
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="/join/:code"      element={<JoinPodScreen />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
