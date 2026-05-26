// ─── Dashboard ────────────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import Wordmark from "../../components/Wordmark";
import { useNotifications } from "../../hooks/useNotifications";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useActivePod } from "../../context/ActivePodContext";
import { useGames } from "../../hooks/useGames";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

function notifIcon(type) {
  switch (type) {
    case "escrow_funded":  return "✅";
    case "escrow_failed":  return "❌";
    case "pod_active":     return "🎉";
    case "game_allocated": return "🎟️";
    case "resale":         return "💰";
    default:               return "🔔";
  }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Dashboard({ state, dispatch, profile }) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  if (!currentUserId && isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) =>
      session?.user?.id && setCurrentUserId(session.user.id));
  }

  // ── Notifications ───────────────────────────────────────────────────────────
  const { notifications: realNotifs, unreadCount: realUnread, markAllRead, refresh: refreshNotifs } = useNotifications();
  const notifications = isSupabaseConfigured ? realNotifs : (state.notifications || []);
  const unread        = isSupabaseConfigured ? realUnread  : (state.notifications || []).filter(n => !n.read).length;

  // ── Real pod / games data ───────────────────────────────────────────────────
  const { pods }    = useMyPods();
  const { activePodId: selectedPodId } = useActivePod();
  const activePodId = pods.find(p => p.id === selectedPodId)?.id ?? pods?.[0]?.id ?? null;
  const { pod: fullPod, members, escrowBalance } = usePod(activePodId);
  const { games } = useGames(activePodId);

  function handleBellClick() {
    setShowNotifs(v => !v);
    if (!showNotifs) {
      if (isSupabaseConfigured) { refreshNotifs(); markAllRead(); }
      else dispatch({ type: "MARK_NOTIFS_READ" });
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const firstName      = profile?.display_name?.split(" ")[0] || "there";
  const avatarInitials = profile?.avatar_initials || "YO";
  const isVerified     = profile?.verified ?? true;

  const myGames      = games.filter(g => g.assignments?.[0]?.user_id === currentUserId);
  const nextGame     = myGames[0];
  const myMember     = members.find(m => m.user_id === currentUserId);
  const myShare      = myMember?.share_pct  || 0;
  const myCost       = fullPod ? Math.round((parseFloat(fullPod.season_cost) || 0) * myShare / 100) : 0;
  const escrowTarget = parseFloat(fullPod?.season_cost) || 1;
  const escrowPct    = Math.min(100, Math.round((escrowBalance / escrowTarget) * 100));
  const unfundedCount = members.filter(m => !m.escrow_funded).length;
  const allocationDone = fullPod?.allocation_done || false;

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }
  function fmtTime(timeStr) {
    if (!timeStr) return "";
    const [h, min] = timeStr.split(":");
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? "PM" : "AM"}`;
  }

  return (
    <div style={{ padding: "0 0 80px" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 20px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 16 }}>
          <Wordmark size={22} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              onClick={handleBellClick}
              style={{ position: "relative", width: 36, height: 36, borderRadius: "50%",
                background: showNotifs ? T.green : "#1A4A2E", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer",
                transition: "background 0.15s" }}>
              🔔
              {unread > 0 && (
                <div style={{ position: "absolute", top: 0, right: 0, width: 14, height: 14,
                  borderRadius: "50%", background: T.red, fontSize: 8, color: T.white,
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                  {unread}
                </div>
              )}
            </div>
            <Avatar initials={avatarInitials} size={36} verified={isVerified} />
          </div>
        </div>

        <div style={{ fontSize: 11, color: T.mist, letterSpacing: 2, marginBottom: 4 }}>WELCOME BACK</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif", marginBottom: 16 }}>
          Hey, {firstName} 👋
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { i: "🏟️", v: fullPod ? "1 Pod"              : "0 Pods",   s: fullPod?.name?.split(" ")[0] || "—" },
            { i: "🎟️", v: `${myGames.length} Game${myGames.length !== 1 ? "s" : ""}`, s: "this season" },
            { i: "💰", v: myCost > 0 ? `$${myCost.toLocaleString()}` : "—", s: "my share" },
          ].map(({ i, v, s }) => (
            <div key={v} style={{ background: "#ffffff08", borderRadius: 10, padding: "10px 8px",
              textAlign: "center", border: "1px solid #1A4A2E" }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{i}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>{v}</div>
              <div style={{ fontSize: 9, color: T.mist }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Notifications panel ─────────────────────────────────────────────── */}
      {showNotifs && (
        <div style={{ background: T.forest, borderBottom: `1px solid ${T.green}`,
          padding: "12px 14px", maxHeight: 320, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
            letterSpacing: 1.5, marginBottom: 10 }}>NOTIFICATIONS</div>

          {notifications.length === 0 ? (
            <div style={{ color: T.mist, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              No notifications yet
            </div>
          ) : (
            notifications.map((n, i) => (
              <div key={n.id ?? i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 0", borderBottom: "1px solid #1A4A2E",
                opacity: n.read ? 0.55 : 1,
              }}>
                <div style={{ fontSize: 18, flexShrink: 0 }}>{notifIcon(n.type)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 700, color: T.white, marginBottom: 2 }}>
                    {n.title ?? n.text}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.5 }}>{n.body}</div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: T.mist, flexShrink: 0, marginTop: 2 }}>
                  {n.created_at ? timeAgo(n.created_at) : n.time}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ padding: "14px 14px 0" }}>

        {/* ── No pod CTA ─────────────────────────────────────────────────── */}
        {isSupabaseConfigured && !activePodId && (
          <Card style={{ marginBottom: 14, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏟️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 6 }}>No pod yet</div>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 14 }}>
              Create or join a pod to start sharing season tickets.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "create_pod" })}
                style={{ padding: "9px 16px", background: T.lime, color: T.dark,
                  border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Create Pod
              </button>
              <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "browse_pods" })}
                style={{ padding: "9px 16px", background: "transparent",
                  border: `1px solid ${T.lime}44`, color: T.lime,
                  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Browse Pods
              </button>
            </div>
          </Card>
        )}

        {/* ── Next game card ──────────────────────────────────────────────── */}
        {nextGame ? (
          <div
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
            style={{ background: `linear-gradient(135deg,${T.lime}18,${T.teal}0a)`,
              border: `1px solid ${T.lime}44`, borderRadius: 14, padding: "14px 16px",
              marginBottom: 14, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: T.lime, fontWeight: 700,
                letterSpacing: 1.5, marginBottom: 4 }}>YOUR NEXT GAME</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
                {fullPod?.sport_emoji || "🏀"} vs. {nextGame.opponent}
              </div>
              <div style={{ fontSize: 11, color: T.mist, marginTop: 3 }}>
                {fmtDate(nextGame.game_date)} · {fmtTime(nextGame.game_time)}
                {fullPod?.venue ? ` · ${fullPod.venue}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>→</div>
          </div>
        ) : isSupabaseConfigured && activePodId ? (
          <Card style={{ marginBottom: 14, textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 13, color: T.mist, marginBottom: 10 }}>
              {allocationDone
                ? "All your games are in the books 🏁"
                : "Run allocation to get your games assigned"}
            </div>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: allocationDone ? "schedule" : "allocate" })}
              style={{ padding: "8px 20px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {allocationDone ? "View Schedule →" : "Run Allocation →"}
            </button>
          </Card>
        ) : null}

        {/* ── Pod card ────────────────────────────────────────────────────── */}
        {fullPod && (
          <Card onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })}
            style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 32 }}>{fullPod.sport_emoji || "🏀"}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                    fontFamily: "Georgia,serif" }}>{fullPod.name}</div>
                  <div style={{ fontSize: 11, color: T.mist }}>
                    {fullPod.team_name} · {members.length}/{fullPod.max_members} members
                  </div>
                </div>
              </div>
              <Badge color={fullPod.status === "active" ? T.lime : T.amber}>
                {fullPod.status === "active" ? "Active" : fullPod.status}
              </Badge>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { l: "My Share", v: `${myShare}%` },
                { l: "My Cost",  v: myCost > 0 ? `$${myCost.toLocaleString()}` : "—" },
                { l: "My Games", v: `${myGames.length}/${games.length}` },
              ].map(({ l, v }) => (
                <div key={l} style={{ background: "#ffffff06", borderRadius: 8, padding: "8px 6px" }}>
                  <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                    fontFamily: "Georgia,serif" }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: T.mist }}>Escrow funded</span>
                <span style={{ fontSize: 10, color: T.lime, fontWeight: 700 }}>{escrowPct}%</span>
              </div>
              <Bar value={escrowBalance} max={escrowTarget} h={5} />
            </div>
            {unfundedCount > 0 && (
              <div style={{ fontSize: 10, color: T.amber, marginTop: 6 }}>
                ⚠ {unfundedCount} member{unfundedCount > 1 ? "s" : ""} haven't funded yet
              </div>
            )}
          </Card>
        )}

        {/* ── Allocation status ────────────────────────────────────────────── */}
        {isSupabaseConfigured && activePodId && (
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 8 }}>🤖 Allocation Engine</div>
            {allocationDone ? (
              <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
                borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, color: T.lime }}>
                  ✓ Season allocation complete · Method:{" "}
                  <strong>{fullPod?.allocation_method || "—"}</strong>
                </div>
                <div style={{ fontSize: 11, color: T.mist, marginTop: 4 }}>
                  {games.length} games distributed across {members.length} members
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ fontSize: 12, color: T.mist, marginBottom: 10 }}>
                  Season allocation hasn't run yet
                </div>
                <button
                  onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
                  style={{ padding: "9px 20px", background: T.lime, color: T.dark,
                    border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Run Allocation →
                </button>
              </div>
            )}
          </Card>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "📅 Schedule", screen: "schedule" },
            { label: "♻️ Resale",   screen: "resale"   },
            { label: "👥 My Pod",   screen: "pod"      },
            { label: "👤 Profile",  screen: "profile"  },
          ].map(({ label, screen }) => (
            <div key={label}
              onClick={() => dispatch({ type: "SET_SCREEN", screen })}
              style={{ background: T.forest, border: "1px solid #1A4A2E", borderRadius: 12,
                padding: "12px 10px", textAlign: "center", cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: T.chalk, fontFamily: "Calibri,sans-serif" }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
