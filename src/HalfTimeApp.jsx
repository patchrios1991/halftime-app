// ─── HalfTime Mobile App Shell ────────────────────────────────────────────────
import { useReducer, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
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
import HomeHub           from "./pages/app/HomeHub";
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
import PendingApproval from "./pages/auth/PendingApproval";

// ─── Nav tabs ────────────────────────────────────────────────────────────────
const TABS = [
  { key: "home",      icon: "🏠", label: "Home"     },
  { key: "schedule",  icon: "🎟️", label: "Games"    },
  { key: "resale",    icon: "♻️",  label: "Resale"   },
  { key: "pod",       icon: "👥", label: "Pod"      },
];

// Screens that are drill-downs of a tab (highlight that tab while on them)
const TAB_OF_SCREEN = { dashboard: "home", allocate: "home" };

function NavBar({ screen, dispatch }) {
  const activeKey = TAB_OF_SCREEN[screen] ?? screen;
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: "rgba(9,20,11,0.97)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderTop: "1px solid #1A4A2E",
      display: "flex", zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {TABS.map(({ key, icon, label }) => {
        const active = activeKey === key;
        return (
          <div key={key} onClick={() => dispatch({ type: "SET_SCREEN", screen: key })}
            style={{ flex: 1, padding: "8px 4px 6px", textAlign: "center", cursor: "pointer",
              minHeight: 54, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3 }}>
            <div style={{
              width: 44, height: 28, borderRadius: 9,
              background: active ? `${T.lime}1A` : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}>
              <div style={{ fontSize: 18, lineHeight: 1,
                filter: active ? "none" : "opacity(0.55)",
                transition: "filter 0.2s" }}>
                {icon}
              </div>
            </div>
            <div style={{
              fontSize: 9, fontWeight: active ? 700 : 500,
              letterSpacing: 0.4, fontFamily: "Calibri,sans-serif",
              color: active ? T.lime : "#4A7A5A",
              transition: "color 0.2s",
            }}>
              {label.toUpperCase()}
            </div>
          </div>
        );
      })}
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

      {open && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.88)",
          zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setOpen(false)}>
          <div style={{
            width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none",
            maxHeight: "85dvh",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
            onClick={e => e.stopPropagation()}>

            {/* Drag handle + title — fixed, never scrolls away */}
            <div style={{ flexShrink: 0, padding: "16px 20px 10px" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 14px" }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif" }}>My Pods</div>
            </div>

            {/* Scrollable pod list */}
            <div style={{
              flex: 1, overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              padding: "0 20px",
            }}>
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
            </div>

            {/* Pinned footer — Browse + Create always visible */}
            <div style={{
              flexShrink: 0,
              padding: "12px 20px",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
              borderTop: `1px solid ${T.green}33`,
            }}>
              <button onClick={() => { setOpen(false); dispatch({ type: "SET_SCREEN", screen: "browse_pods" }); }}
                style={{ width: "100%", padding: "13px",
                  background: "transparent", border: `1.5px solid ${T.teal}44`,
                  borderRadius: 12, color: T.teal, fontSize: 13,
                  fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                🔍 Browse Open Pods
              </button>
              <button onClick={() => { setOpen(false); dispatch({ type: "SET_SCREEN", screen: "create_pod" }); }}
                style={{ width: "100%", padding: "13px",
                  background: "transparent", border: `1.5px solid ${T.lime}44`,
                  borderRadius: 12, color: T.lime, fontSize: 13,
                  fontWeight: 700, cursor: "pointer" }}>
                + Create New Pod
              </button>
            </div>
          </div>
        </div>,
        document.body
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
      background: T.dark, minHeight: "100dvh",
      fontFamily: "Calibri,sans-serif", color: T.white,
      overflowX: "hidden", position: "relative",
    }}>
      {/* Sticky top bar */}
      {!noNav.includes(state.screen) && (
        <div style={{
          background: "#060F08",
          padding: "11px 14px 9px",
          borderBottom: "1px solid #1A4A2E",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <Wordmark size={20} />

          {/* Pod switcher (hidden on the hub — it IS the pod list) */}
          {state.screen !== "home" ? <PodSwitcher dispatch={dispatch} /> : <div />}

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

      {/* ── Notification panel ───────────────────────────────────────────── */}
      {showNotifPanel && !noNav.includes(state.screen) && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 48,
              background: "rgba(4,10,5,0.65)",
              backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
              animation: "fadein 0.18s ease",
            }}
            onClick={() => setShowNotifPanel(false)}
          />
          {/* Panel */}
          <div style={{
            position: "fixed", top: 56, left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 20px)", maxWidth: 410, zIndex: 49,
            background: "#0A1A0D",
            border: `1px solid ${T.green}`,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(26,74,46,0.3)",
            animation: "slideDown 0.2s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            {/* Panel header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "13px 16px 12px",
              borderBottom: `1px solid ${T.green}55`,
              background: "rgba(13,27,16,0.8)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>🔔</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif" }}>Notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    background: T.lime, color: T.dark, borderRadius: 20,
                    padding: "1px 8px", fontSize: 10, fontWeight: 700,
                    lineHeight: "18px",
                  }}>{unreadCount}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {unreadCount > 0 && (
                  <span onClick={markAllRead}
                    style={{ fontSize: 11, color: T.lime, cursor: "pointer", fontWeight: 600 }}>
                    Mark read
                  </span>
                )}
                <span onClick={() => setShowNotifPanel(false)}
                  style={{ fontSize: 22, color: T.mist, cursor: "pointer",
                    lineHeight: 1, marginTop: -1 }}>×</span>
              </div>
            </div>

            {/* Notification list */}
            <div style={{
              overflowY: "auto", maxHeight: "60vh",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔕</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                    marginBottom: 4 }}>All caught up</div>
                  <div style={{ fontSize: 11, color: T.mist }}>No notifications yet</div>
                </div>
              ) : (
                notifications.slice(0, 20).map((n, i) => (
                  <div key={n.id ?? i} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "12px 16px",
                    borderBottom: `1px solid rgba(26,74,46,0.35)`,
                    background: !n.read ? `${T.lime}07` : "transparent",
                    transition: "background 0.15s",
                  }}>
                    {/* Icon bubble */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 11,
                        background: !n.read ? `${T.lime}1A` : "#1A4A2E44",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 17,
                      }}>
                        {notifIcon(n.type)}
                      </div>
                      {!n.read && (
                        <div style={{
                          position: "absolute", top: -2, right: -2,
                          width: 9, height: 9, borderRadius: "50%",
                          background: T.lime, border: "2px solid #0A1A0D",
                        }} />
                      )}
                    </div>
                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: n.read ? 500 : 700,
                        color: n.read ? "#8AAA90" : T.white,
                        marginBottom: 2, lineHeight: 1.35,
                      }}>
                        {n.title ?? n.text}
                      </div>
                      {n.body && (
                        <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.45,
                          marginBottom: 4 }}>{n.body}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#4A7A5A", fontWeight: 500 }}>
                        {n.created_at ? timeAgo(n.created_at) : n.time}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Screen content */}
      <div style={{
        minHeight: noNav.includes(state.screen) ? "100dvh" : "calc(100dvh - 112px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}>
        {state.screen === "onboarding"   && <Onboarding dispatch={dispatch} />}
        {state.screen === "create_pod"   && <CreatePodScreen dispatch={dispatch} />}
        {state.screen === "browse_pods"  && <BrowsePodsScreen dispatch={dispatch} />}
        {state.screen === "home"         && <HomeHub dispatch={dispatch} profile={profile} />}
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
          from { opacity:0; transform:translateX(-50%) translateY(8px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown {
          from { opacity:0; transform:translateX(-50%) translateY(-10px) scale(0.98); }
          to   { opacity:1; transform:translateX(-50%) translateY(0)  scale(1); }
        }
        @keyframes fadein {
          from { opacity:0; }
          to   { opacity:1; }
        }
        input[type=range] { height: 4px; }
        select, input, textarea { font-size: 16px !important; }
        :root { --kb-height: 0px; }
      `}</style>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function HalfTimeApp() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, isAuthenticated, signOut } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    screen: localStorage.getItem("ht_onboarded") ? "home" : "onboarding",
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
        dispatch({ type: "SET_SCREEN", screen: "home" });
      }
    }
  }, [podsLoading, pods.length, isAuthenticated, state.screen]);

  if (authLoading && isSupabaseConfigured) return <LoadingScreen />;

  // Approval gate — unapproved accounts (e.g. fresh Google sign-ups) wait here.
  // Gates only on an explicit false so a transient profile-load failure can't
  // lock out an approved user.
  if (isSupabaseConfigured && isAuthenticated && profile?.approved === false) {
    return <PendingApproval user={user} profile={profile} signOut={signOut} />;
  }

  return (
    <ActivePodProvider>
      <AppShell state={state} dispatch={dispatch} profile={profile} signOut={signOut} />
    </ActivePodProvider>
  );
}
