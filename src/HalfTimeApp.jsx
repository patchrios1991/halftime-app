// ─── HalfTime Mobile App Shell ────────────────────────────────────────────────
import { useReducer, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens";
import { reducer } from "./store/reducer";
import { initialState } from "./store/initialState";
import { useAuth } from "./hooks/useAuth";
import { useMyPods } from "./hooks/usePod";
import { isSupabaseConfigured } from "./lib/supabase";

// Pages
import Onboarding        from "./pages/app/Onboarding";
import Dashboard         from "./pages/app/Dashboard";
import AllocationScreen  from "./pages/app/AllocationScreen";
import ScheduleScreen    from "./pages/app/ScheduleScreen";
import PodScreen         from "./pages/app/PodScreen";
import ResaleScreen      from "./pages/app/ResaleScreen";
import ProfileScreen     from "./pages/app/ProfileScreen";
import CreatePodScreen   from "./pages/app/CreatePodScreen";
import BrowsePodsScreen  from "./pages/app/BrowsePodsScreen";

// Components
import Wordmark from "./components/Wordmark";
import Toast    from "./components/Toast";
import Avatar   from "./components/Avatar";

// ─── Nav tabs ────────────────────────────────────────────────────────────────
const TABS = [
  { key: "dashboard", icon: "🏠", label: "Home"     },
  { key: "allocate",  icon: "⚡", label: "Allocate" },
  { key: "schedule",  icon: "🎟️", label: "Games"    },
  { key: "resale",    icon: "♻️",  label: "Resale"   },
  { key: "pod",       icon: "👥", label: "Pod"      },
];

function NavBar({ screen, dispatch }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430, background: T.forest,
      borderTop: "1px solid #1A4A2E", display: "flex", zIndex: 100,
    }}>
      {TABS.map(({ key, icon, label }) => (
        <div
          key={key}
          onClick={() => dispatch({ type: "SET_SCREEN", screen: key })}
          style={{ flex: 1, padding: "9px 0 7px", textAlign: "center", cursor: "pointer" }}
        >
          <div style={{ fontSize: 19, marginBottom: 1 }}>{icon}</div>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 0.5, fontFamily: "Calibri,sans-serif",
            color: screen === key ? T.lime : T.mist,
          }}>
            {label.toUpperCase()}
          </div>
          {screen === key && (
            <div style={{ width: 3, height: 3, borderRadius: "50%",
              background: T.lime, margin: "2px auto 0" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Full-screen loading spinner ──────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      maxWidth: 430, margin: "0 auto", background: T.dark,
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20,
    }}>
      <Wordmark size={26} />
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: `3px solid ${T.green}`, borderTopColor: T.lime,
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function HalfTimeApp() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, isAuthenticated, signOut } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { pods, loading: podsLoading } = useMyPods();
  const noNav = ["onboarding", "create_pod", "browse_pods"];

  const clearToast = useCallback(() => dispatch({ type: "CLEAR_TOAST" }), []);

  // ── Auth gate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated && isSupabaseConfigured) {
      navigate("/auth/signin", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // ── Auto-skip onboarding for users who already have a pod ────────────────────
  useEffect(() => {
    if (!podsLoading && isAuthenticated && isSupabaseConfigured) {
      if (pods.length > 0 && state.screen === "onboarding") {
        dispatch({ type: "SET_SCREEN", screen: "dashboard" });
      }
    }
  }, [podsLoading, pods.length, isAuthenticated, state.screen]);

  // ── Auto-clear toast ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(clearToast, 3500);
      return () => clearTimeout(t);
    }
  }, [state.toast, clearToast]);

  // Show spinner while auth is resolving (only when Supabase is configured)
  if (authLoading && isSupabaseConfigured) return <LoadingScreen />;

  // Derive avatar initials: prefer real profile, fall back to demo "YO"
  const avatarInitials = profile?.avatar_initials || "YO";
  const isVerified     = profile?.verified ?? true;

  return (
    <div style={{
      maxWidth: 430, margin: "0 auto",
      background: T.dark, minHeight: "100vh",
      fontFamily: "Calibri,sans-serif", color: T.white,
      overflowX: "hidden", position: "relative",
    }}>
      {/* Sticky top bar */}
      {!noNav.includes(state.screen) && (
        <div style={{
          background: T.dark, padding: "12px 16px 10px",
          borderBottom: "1px solid #1A4A2E",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <Wordmark size={20} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Show LIVE badge when connected to real Supabase */}
            <div style={{
              fontSize: 10, color: isSupabaseConfigured ? T.teal : T.mist,
              letterSpacing: 1.5,
              background: isSupabaseConfigured ? "rgba(52,211,153,0.12)" : "#1A4A2E",
              padding: "2px 8px", borderRadius: 6,
              border: isSupabaseConfigured ? `1px solid ${T.teal}44` : "none",
            }}>
              {isSupabaseConfigured ? "● LIVE" : "MVP DEMO"}
            </div>
            <div
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "profile" })}
              style={{ cursor: "pointer" }}>
              <Avatar initials={avatarInitials} size={28} verified={isVerified} />
            </div>
          </div>
        </div>
      )}

      {/* Screen content */}
      <div style={{
        minHeight: noNav.includes(state.screen) ? "100vh" : "calc(100vh - 112px)",
        overflowY: "auto",
      }}>
        {state.screen === "onboarding" && (
          <Onboarding dispatch={dispatch} />
        )}
        {state.screen === "create_pod" && (
          <CreatePodScreen dispatch={dispatch} />
        )}
        {state.screen === "browse_pods" && (
          <BrowsePodsScreen dispatch={dispatch} />
        )}
        {state.screen === "dashboard" && (
          <Dashboard state={state} dispatch={dispatch} profile={profile} />
        )}
        {state.screen === "allocate" && (
          <AllocationScreen state={state} dispatch={dispatch} />
        )}
        {state.screen === "schedule" && (
          <ScheduleScreen state={state} dispatch={dispatch} />
        )}
        {state.screen === "pod" && (
          <PodScreen state={state} dispatch={dispatch} />
        )}
        {state.screen === "resale" && (
          <ResaleScreen state={state} dispatch={dispatch} />
        )}
        {state.screen === "profile" && (
          <ProfileScreen state={state} dispatch={dispatch} profile={profile} signOut={signOut} />
        )}
      </div>

      {/* Bottom nav */}
      {!noNav.includes(state.screen) && (
        <NavBar screen={state.screen} dispatch={dispatch} />
      )}

      {/* Toast notification */}
      {state.toast && <Toast message={state.toast} onClose={clearToast} />}

      <style>{`
        @keyframes fadeInToast {
          from { opacity:0; transform:translateX(-50%) translateY(-8px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=range] { height: 4px; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
}
