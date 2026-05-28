// ─── HalfTime Mobile App Shell ────────────────────────────────────────────────
import { useReducer, useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "./tokens";
import { reducer } from "./store/reducer";
import { initialState } from "./store/initialState";
import { useAuth } from "./hooks/useAuth";
import { useMyPods } from "./hooks/usePod";
import { useNotifications } from "./hooks/useNotifications";
import { isSupabaseConfigured } from "./lib/supabase";
import { ActivePodProvider, useActivePod } from "./context/ActivePodContext";

// Pages
import Onboarding        from "./pages/app/Onboarding";
import Dashboard         from "./pages/app/Dashboard";
import AllocationScreen  from "./pages/app/AllocationScreen";
import ScheduleScreen    from "./pages/app/ScheduleScreen";
import PodScreen         from "./pages/app/PodScreen";
import ResaleScreen      from "./pages/app/ResaleScreen";
import ProfileScreen     from "./pages/app/ProfileScreen";
import CreatePodScreen    from "./pages/app/CreatePodScreen";
import BrowsePodsScreen  from "./pages/app/BrowsePodsScreen";
import PlayoffBidScreen  from "./pages/app/PlayoffBidScreen";

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
        <div key={key} onClick={() => dispatch({ type: "SET_SCREEN", screen: key })}
          style={{ flex: 1, padding: "10px 0 8px", textAlign: "center", cursor: "pointer",
            minHeight: 56 /* ensures ≥44px tap target + safe area */ }}>
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

// ─── Pod switcher ─────────────────────────────────────────────────────────────
function PodSwitcher({ dispatch }) {
  const { pods, activePodId, setActivePodId } = useActivePod();
  const [open, setOpen] = useState(false);

  const activePod = pods.find(p => p.id === activePodId) ?? pods[0];

  return (
    <>
      <div onClick={() => setOpen(true)} style={{
        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
        background: "#ffffff10", borderRadius: 20, padding: "3px 10px",
        border: "1px solid #1A4A2E", maxWidth: 140,
      }}>
        <span style={{ fontSize: 13 }}>{activePod?.sport_emoji || "🏟️"}</span>
        <span style={{ fontSize: 10, color: T.white, fontWeight: 700,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
          {activePod?.name || "My Pod"}
        </span>
        <span style={{ fontSize: 8, color: T.mist }}>▼</span>
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.88)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setOpen(false)}>
          <div style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none", padding: "20px 20px 40px" }}
            onClick={e => e.stopPropagation()}>

            <div style={{ width: 40, height: 4, borderRadius: 2,
              background: T.green, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 14 }}>My Pods</div>

            {pods.map(pod => (
              <div key={pod.id} onClick={() => { setActivePodId(pod.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  padding: "12px 14px", borderRadius: 12, marginBottom: 8,
                  background: pod.id === activePodId ? `${T.lime}15` : T.forest,
                  border: `1px solid ${pod.id === activePodId ? T.lime + "44" : "#1A4A2E"}`,
                }}>
                <span style={{ fontSize: 28 }}>{pod.sport_emoji || "🏟️"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700,
                    color: pod.id === activePodId ? T.lime : T.white }}>
                    {pod.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.mist }}>
                    {pod.team_name} · Season {pod.season || "—"}
                  </div>
                </div>
                {pod.id === activePodId && (
                  <span style={{ color: T.lime, fontSize: 18 }}>✓</span>
                )}
              </div>
            ))}

            {/* Browse open pods */}
            <button onClick={() => { setOpen(false); dispatch({ type: "SET_SCREEN", screen: "browse_pods" }); }}
              style={{ width: "100%", marginTop: 8, padding: "13px",
                background: "transparent", border: `1.5px solid ${T.teal}44`,
                borderRadius: 12, color: T.teal, fontSize: 13,
                fontWeight: 700, cursor: "pointer" }}>
              🔍 Browse Open Pods
            </button>

            {/* Create new pod */}
            <button onClick={() => { setOpen(false); dispatch({ type: "SET_SCREEN", screen: "create_pod" }); }}
              style={{ width: "100%", marginTop: 8, padding: "13px",
                background: "transparent", border: `1.5px solid ${T.lime}44`,
                borderRadius: 12, color: T.lime, fontSize: 13,
                fontWeight: 700, cursor: "pointer" }}>
              + Create New Pod
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Notification helpers ─────────────────────────────────────────────────────
function notifIcon(type) {
  switch (type) {
    case "escrow_funded":   return "✅";
    case "escrow_failed":   return "❌";
    case "pod_active":      return "🎉";
    case "game_allocated":  return "🎟️";
    case "game_released":   return "📤";
    case "resale":          return "♻️";
    case "resale_sold":     return "💸";
    case "bid_won":              return "🏆";
    case "bid_resolved":         return "⚡";
    case "bid_credits_awarded":  return "🎯";
    case "member_joined":        return "👥";
    case "attendance":           return "📅";
    case "trade_offer":          return "🔄";
    case "trade_accepted":       return "✅";
    case "trade_rejected":       return "❌";
    default:                     return "🔔";
  }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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

// ─── Inner app shell (needs context) ─────────────────────────────────────────
function AppShell({ state, dispatch, profile, signOut }) {
  const noNav = ["onboarding", "create_pod", "browse_pods", "bids"];
  const clearToast = useCallback(() => dispatch({ type: "CLEAR_TOAST" }), [dispatch]);
  const isVerified     = profile?.verified ?? true;
  const avatarInitials = profile?.avatar_initials || "YO";

  // ── Keyboard avoidance via visualViewport ─────────────────────────────────
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onResize() {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-height", `${kb}px`);
    }
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const { notifications, unreadCount, markAllRead, refresh: refreshNotifs } = useNotifications();

  function handleBellClick() {
    const opening = !showNotifPanel;
    setShowNotifPanel(opening);
    if (opening && isSupabaseConfigured) {
      refreshNotifs();
      markAllRead();
    }
  }

  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(clearToast, 3500);
      return () => clearTimeout(t);
    }
  }, [state.toast, clearToast]);

  // Close notif panel on screen change
  useEffect(() => {
    setShowNotifPanel(false);
  }, [state.screen]);

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

          {/* Pod switcher */}
          <PodSwitcher dispatch={dispatch} />

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{
              fontSize: 9, color: isSupabaseConfigured ? T.teal : T.mist,
              letterSpacing: 1,
              background: isSupabaseConfigured ? "rgba(52,211,153,0.12)" : "#1A4A2E",
              padding: "2px 6px", borderRadius: 6,
              border: isSupabaseConfigured ? `1px solid ${T.teal}44` : "none",
            }}>
              {isSupabaseConfigured ? "● LIVE" : "DEMO"}
            </div>

            {/* Bell */}
            <div onClick={handleBellClick} style={{
              position: "relative", width: 30, height: 30, borderRadius: "50%",
              background: showNotifPanel ? T.green : "#1A4A2E",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, cursor: "pointer", transition: "background 0.15s",
              flexShrink: 0,
            }}>
              🔔
              {unreadCount > 0 && (
                <div style={{
                  position: "absolute", top: 0, right: 0,
                  width: 14, height: 14, borderRadius: "50%",
                  background: T.red, fontSize: 8, color: T.white,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700,
                }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </div>
              )}
            </div>

            {/* Avatar → Profile */}
            <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "profile" })}
              style={{ cursor: "pointer" }}>
              <Avatar initials={avatarInitials} size={28} verified={isVerified} />
            </div>
          </div>
        </div>
      )}

      {/* ── Notification panel (fixed overlay below top bar) ─────────────── */}
      {showNotifPanel && !noNav.includes(state.screen) && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 48 }}
            onClick={() => setShowNotifPanel(false)}
          />
          {/* Panel */}
          <div style={{
            position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 430, zIndex: 49,
            background: T.forest,
            borderBottom: `2px solid ${T.green}44`,
            maxHeight: 340, overflowY: "auto",
            padding: "12px 14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.mist, letterSpacing: 1.5 }}>
                NOTIFICATIONS
              </div>
              {unreadCount > 0 && (
                <div style={{ fontSize: 9, color: T.lime, cursor: "pointer" }}
                  onClick={markAllRead}>Mark all read</div>
              )}
            </div>

            {notifications.length === 0 ? (
              <div style={{ color: T.mist, fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((n, i) => (
                <div key={n.id ?? i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "9px 0", borderBottom: "1px solid #1A4A2E",
                  opacity: n.read ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 16, flexShrink: 0 }}>{notifIcon(n.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 700,
                      color: T.white, marginBottom: 1 }}>
                      {n.title ?? n.text}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 10, color: T.mist, lineHeight: 1.4 }}>{n.body}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: T.mist, flexShrink: 0, marginTop: 2 }}>
                    {n.created_at ? timeAgo(n.created_at) : n.time}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Screen content */}
      <div style={{
        minHeight: noNav.includes(state.screen) ? "100vh" : "calc(100vh - 112px)",
        overflowY: "auto",
      }}>
        {state.screen === "onboarding"   && <Onboarding dispatch={dispatch} />}
        {state.screen === "create_pod"   && <CreatePodScreen dispatch={dispatch} />}
        {state.screen === "browse_pods"  && <BrowsePodsScreen dispatch={dispatch} />}
        {state.screen === "dashboard"    && <Dashboard state={state} dispatch={dispatch} profile={profile} />}
        {state.screen === "allocate"     && <AllocationScreen state={state} dispatch={dispatch} />}
        {state.screen === "schedule"     && <ScheduleScreen state={state} dispatch={dispatch} />}
        {state.screen === "pod"          && <PodScreen state={state} dispatch={dispatch} />}
        {state.screen === "resale"       && <ResaleScreen state={state} dispatch={dispatch} />}
        {state.screen === "profile"      && <ProfileScreen state={state} dispatch={dispatch} profile={profile} signOut={signOut} />}
        {state.screen === "bids"         && <PlayoffBidScreen dispatch={dispatch} profile={profile} />}
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
        /* Keyboard avoidance: forms use padding-bottom: var(--kb-height,0px) */
        :root { --kb-height: 0px; }
      `}</style>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function HalfTimeApp() {
  const navigate = useNavigate();
  const { profile, loading: authLoading, isAuthenticated, signOut } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    screen: localStorage.getItem("ht_onboarded") ? "dashboard" : "onboarding",
  });
  const { pods, loading: podsLoading } = useMyPods();

  // Auth gate
  useEffect(() => {
    if (!authLoading && !isAuthenticated && isSupabaseConfigured) {
      navigate("/auth/signin", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Auto-skip onboarding for users who already have a pod
  useEffect(() => {
    if (!podsLoading && isAuthenticated && isSupabaseConfigured) {
      if (pods.length > 0 && state.screen === "onboarding") {
        localStorage.setItem("ht_onboarded", "1");
        dispatch({ type: "SET_SCREEN", screen: "dashboard" });
      }
    }
  }, [podsLoading, pods.length, isAuthenticated, state.screen]);

  if (authLoading && isSupabaseConfigured) return <LoadingScreen />;

  return (
    <ActivePodProvider>
      <AppShell state={state} dispatch={dispatch} profile={profile} signOut={signOut} />
    </ActivePodProvider>
  );
}
