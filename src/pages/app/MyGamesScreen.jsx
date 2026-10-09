// ─── MyGamesScreen ─────────────────────────────────────────────────────────────
// 1.0.7 item 6: a unified view of every upcoming allocated game across ALL of
// a user's pods — before this, each pod's schedule was only viewable one pod
// at a time via that pod's own Schedule tab. Low priority / nice-to-have, so
// this is a lightweight sub-screen (reached from HomeHub's "See all" link),
// not a new primary tab.
import { useState, useEffect, useMemo } from "react";
import { T } from "../../tokens";
import { useActivePod } from "../../context/ActivePodContext";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { normalizeGames } from "../../lib/embed";
import { fmtDate, fmtDay, fmtTime, daysUntil, daysLabel } from "../../lib/dateUtils";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function MyGamesScreen({ dispatch }) {
  const currentUserId = useCurrentUserId();
  const { pods, loading: podsLoading, setActivePodId } = useActivePod();

  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || pods.length === 0) { setLoading(false); return; }
    let alive = true;
    supabase
      .from("games")
      .select("id, pod_id, opponent, game_date, game_time, sport_emoji, tier, assignments(user_id, confirmed)")
      .in("pod_id", pods.map(p => p.id))
      .gte("game_date", isoToday())
      .order("game_date")
      .order("game_time")
      .limit(200)
      .then(({ data }) => {
        if (alive) { setGames(normalizeGames(data ?? [])); setLoading(false); }
      });
    return () => { alive = false; };
  }, [pods]);

  const podById = useMemo(() => new Map(pods.map(p => [p.id, p])), [pods]);

  // Group chronologically by date — each group header shows once
  const gamesByDate = useMemo(() => {
    const groups = [];
    let current = null;
    for (const g of games) {
      if (!current || current.date !== g.game_date) {
        current = { date: g.game_date, games: [] };
        groups.push(current);
      }
      current.games.push(g);
    }
    return groups;
  }, [games]);

  function openPod(podId) {
    setActivePodId(podId);
    dispatch({ type: "SET_SCREEN", screen: "schedule" });
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}
            style={{ color: T.mist, fontSize: 22, cursor: "pointer", lineHeight: 1,
              padding: "4px 8px 4px 0", minWidth: 44, minHeight: 44,
              display: "flex", alignItems: "center" }}>‹</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif" }}>📅 My Upcoming Games</div>
            <div style={{ fontSize: 11, color: T.mist, marginTop: 1 }}>
              Across all {pods.length} of your pod{pods.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 14px 0" }}>
        {(loading || podsLoading) ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", margin: "0 auto",
              border: `3px solid #1A4A2E`, borderTopColor: T.lime,
              animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏟️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 6 }}>No upcoming games yet</div>
            <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
              Once your pods allocate their schedules, every game will show up here.
            </div>
          </div>
        ) : (
          gamesByDate.map(({ date, games: dayGames }) => {
            const n = daysUntil(date);
            return (
              <div key={date} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                  letterSpacing: 0.5, marginBottom: 8 }}>
                  {fmtDate(date, { weekday: true }).toUpperCase()}
                  {n !== null && n <= 7 && (
                    <span style={{ color: n <= 0 ? T.lime : T.amber, marginLeft: 6 }}>
                      · {daysLabel(n)}
                    </span>
                  )}
                </div>
                {dayGames.map(g => {
                  const pod        = podById.get(g.pod_id);
                  const myAssign   = g.assignments?.find(a => a.user_id === currentUserId);
                  const isMine     = Boolean(myAssign);
                  return (
                    <div key={g.id} onClick={() => openPod(g.pod_id)}
                      style={{ display: "flex", alignItems: "center", gap: 12,
                        background: isMine ? `${T.lime}08` : "#ffffff05",
                        border: `1px solid ${isMine ? T.lime + "33" : "#1A4A2E"}`,
                        borderRadius: 12, padding: "12px 14px", marginBottom: 8,
                        cursor: "pointer" }}>
                      <div style={{ fontSize: 26 }}>{g.sport_emoji || pod?.sport_emoji || "🏟️"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          vs {g.opponent}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                          {pod?.name || pod?.team_name || "Pod"} · {fmtTime(g.game_time)}
                        </div>
                      </div>
                      {isMine ? (
                        <div style={{ fontSize: 9, fontWeight: 700, color: T.lime,
                          background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                          borderRadius: 20, padding: "3px 9px", flexShrink: 0 }}>
                          {myAssign.confirmed ? "✓ YOURS" : "YOURS"}
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: T.mist, flexShrink: 0 }}>
                          {g.assignments?.length ? "Allocated" : "Unassigned"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
