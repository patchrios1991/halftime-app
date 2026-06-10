// ─── HomeHub ──────────────────────────────────────────────────────────────────
// Pod-agnostic home screen: all your pods, cross-pod alerts, this week's games,
// and quick actions. Tapping a pod sets it active and opens its dashboard.
import { useState, useEffect, useMemo } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import { SkeletonCard } from "../../components/Skeleton";
import { useActivePod } from "../../context/ActivePodContext";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { fmtDate } from "../../lib/dateUtils";

const STATUS_LABEL = {
  draft:      { text: "Draft — finish setup",  color: T.mist },
  recruiting: { text: "Recruiting members",     color: T.amber },
  funded:     { text: "Funded — ready to go",   color: T.teal },
  active:     { text: "Season underway",        color: T.teal },
  complete:   { text: "Season complete",        color: T.mist },
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysOut(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function HomeHub({ dispatch, profile }) {
  const currentUserId = useCurrentUserId();
  const { pods, loading: podsLoading, setActivePodId } = useActivePod();

  const firstName = profile?.display_name?.split(" ")[0] || "there";

  // ── Upcoming games across ALL pods (next 30 days, one query) ───────────────
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || pods.length === 0) {
      setGamesLoading(false);
      return;
    }
    let alive = true;
    supabase
      .from("games")
      .select("id, pod_id, opponent, game_date, game_time, sport_emoji, assignments(user_id)")
      .in("pod_id", pods.map(p => p.id))
      .gte("game_date", isoToday())
      .lte("game_date", isoDaysOut(30))
      .order("game_date")
      .order("game_time")
      .then(({ data }) => {
        if (alive) { setGames(data ?? []); setGamesLoading(false); }
      });
    return () => { alive = false; };
  }, [pods]);

  // First upcoming game per pod
  const nextGameByPod = useMemo(() => {
    const map = new Map();
    for (const g of games) {
      if (!map.has(g.pod_id)) map.set(g.pod_id, g);
    }
    return map;
  }, [games]);

  // Games in the next 7 days, across all pods
  const weekGames = useMemo(() => {
    const cutoff = isoDaysOut(7);
    return games.filter(g => g.game_date <= cutoff).slice(0, 5);
  }, [games]);

  const podById = useMemo(() => new Map(pods.map(p => [p.id, p])), [pods]);

  // ── Cross-pod attention items ───────────────────────────────────────────────
  const alerts = useMemo(() => {
    const items = [];
    for (const pod of pods) {
      const me = pod.pod_members?.[0];
      if (me && me.escrow_funded === false) {
        items.push({
          key:   `escrow-${pod.id}`,
          icon:  "💰",
          text:  `Fund your escrow share — ${pod.name}`,
          podId: pod.id,
          screen: "pod",
        });
      }
      if (pod.captain_id === currentUserId && pod.status === "active" && !pod.allocation_done) {
        items.push({
          key:   `alloc-${pod.id}`,
          icon:  "⚡",
          text:  `Run game allocation — ${pod.name}`,
          podId: pod.id,
          screen: "allocate",
        });
      }
    }
    return items;
  }, [pods, currentUserId]);

  function openPod(podId, screen = "dashboard") {
    setActivePodId(podId);
    dispatch({ type: "SET_SCREEN", screen });
  }

  const loading = podsLoading || (pods.length > 0 && gamesLoading);

  return (
    <div style={{ padding: "18px 16px 110px" }}>

      {/* Greeting */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 2.5, color: T.mist, marginBottom: 4 }}>
          WELCOME BACK
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
          Hey, {firstName} 👋
        </div>
      </div>

      {loading && (
        <>
          <SkeletonCard /><div style={{ height: 10 }} /><SkeletonCard />
        </>
      )}

      {!loading && (
        <>
          {/* Needs attention */}
          {alerts.length > 0 && (
            <div style={{
              border: `1px solid ${T.amber}44`, background: `${T.amber}0D`,
              borderRadius: 14, padding: "4px 14px", marginBottom: 20,
            }}>
              {alerts.map((a, i) => (
                <div key={a.key} onClick={() => openPod(a.podId, a.screen)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    padding: "11px 0",
                    borderTop: i > 0 ? `1px solid ${T.amber}22` : "none",
                  }}>
                  <span style={{ fontSize: 15 }}>{a.icon}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: T.amber, fontWeight: 700 }}>
                    {a.text}
                  </span>
                  <span style={{ color: T.amber, fontSize: 14 }}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* My pods */}
          <div style={{ fontSize: 10, letterSpacing: 2, color: T.mist, marginBottom: 10 }}>
            MY PODS
          </div>

          {pods.length === 0 && (
            <Card style={{ textAlign: "center", padding: "32px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.white, marginBottom: 6,
                fontFamily: "Georgia,serif" }}>
                No pods yet
              </div>
              <div style={{ fontSize: 12.5, color: T.mist, lineHeight: 1.5 }}>
                Join an open pod or start your own to split a season with your crew.
              </div>
            </Card>
          )}

          {pods.map(pod => {
            const me        = pod.pod_members?.[0];
            const nextGame  = nextGameByPod.get(pod.id);
            const status    = STATUS_LABEL[pod.status] ?? { text: pod.status, color: T.mist };
            const unfunded  = me && me.escrow_funded === false;

            let line, lineColor;
            if (unfunded) {
              line = "Escrow share unfunded";
              lineColor = T.amber;
            } else if (nextGame) {
              line = `Next: ${fmtDate(nextGame.game_date)} vs ${nextGame.opponent}`;
              lineColor = T.mist;
            } else {
              line = status.text;
              lineColor = status.color;
            }

            return (
              <Card key={pod.id} onClick={() => openPod(pod.id)}
                style={{ marginBottom: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 30 }}>{pod.sport_emoji || "🏟️"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.white,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pod.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: lineColor, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {line}
                    </div>
                  </div>
                  <span style={{ color: T.mist, fontSize: 18, flexShrink: 0 }}>›</span>
                </div>
              </Card>
            );
          })}

          {/* This week across pods */}
          {weekGames.length > 0 && (
            <>
              <div style={{ fontSize: 10, letterSpacing: 2, color: T.mist,
                margin: "22px 0 10px" }}>
                THIS WEEK — ALL PODS
              </div>
              <Card style={{ padding: "4px 16px" }}>
                {weekGames.map((g, i) => {
                  const mine = g.assignments?.[0]?.user_id === currentUserId;
                  const open = !g.assignments?.[0]?.user_id;
                  const pod  = podById.get(g.pod_id);
                  return (
                    <div key={g.id}
                      onClick={() => openPod(g.pod_id, "schedule")}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                        padding: "11px 0",
                        borderTop: i > 0 ? `1px solid ${T.green}33` : "none",
                      }}>
                      <span style={{ fontSize: 16 }}>{g.sport_emoji || pod?.sport_emoji || "🎟️"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.white,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fmtDate(g.game_date)} vs {g.opponent}
                        </div>
                        <div style={{ fontSize: 10.5, color: T.mist }}>{pod?.name}</div>
                      </div>
                      {mine && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.lime,
                          background: `${T.lime}1A`, borderRadius: 8, padding: "3px 9px",
                          flexShrink: 0 }}>
                          YOURS
                        </span>
                      )}
                      {open && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.mist,
                          border: `1px solid ${T.green}`, borderRadius: 8, padding: "2px 8px",
                          flexShrink: 0 }}>
                          OPEN
                        </span>
                      )}
                    </div>
                  );
                })}
              </Card>
            </>
          )}

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "browse_pods" })}
              style={{
                flex: 1, padding: "13px 8px", background: "transparent",
                border: `1.5px solid ${T.teal}44`, borderRadius: 12,
                color: T.teal, fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "Calibri,sans-serif",
              }}>
              🔍 Browse Open Pods
            </button>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "create_pod" })}
              style={{
                flex: 1, padding: "13px 8px", background: "transparent",
                border: `1.5px solid ${T.lime}44`, borderRadius: 12,
                color: T.lime, fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "Calibri,sans-serif",
              }}>
              + Create New Pod
            </button>
          </div>
        </>
      )}
    </div>
  );
}
