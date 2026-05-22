// ─── ScheduleScreen ───────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import Pill from "../../components/Pill";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useGames } from "../../hooks/useGames";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function ScheduleScreen({ state, dispatch }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "unassigned"

  if (!currentUserId && isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) =>
      session?.user?.id && setCurrentUserId(session.user.id));
  }

  const { pods }    = useMyPods();
  const activePodId = pods?.[0]?.id ?? null;
  const { pod: fullPod, members: rawMembers } = usePod(activePodId);
  const { games, loading } = useGames(activePodId);

  // Build a userId → display name map
  const memberMap = {};
  rawMembers.forEach(m => {
    memberMap[m.user_id] = m.user_id === currentUserId
      ? "You"
      : (m.profiles?.display_name || "Member");
  });

  const allocationDone = fullPod?.allocation_done || false;

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function fmtDay(dateStr) {
    if (!dateStr) return "";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const [y, m, d] = dateStr.split("-").map(Number);
    return days[new Date(y, m - 1, d).getDay()];
  }
  function fmtTime(timeStr) {
    if (!timeStr) return "";
    const [h, min] = timeStr.split(":");
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? "PM" : "AM"}`;
  }

  // Filter games
  const filteredGames = games.filter(g => {
    const assignedTo = g.assignments?.[0]?.user_id;
    if (filter === "mine")       return assignedTo === currentUserId;
    if (filter === "unassigned") return !assignedTo;
    return true;
  });

  const myGameCount = games.filter(g => g.assignments?.[0]?.user_id === currentUserId).length;

  // ── No pod ──────────────────────────────────────────────────────────────────
  if (isSupabaseConfigured && !activePodId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32, minHeight: "60vh", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎟️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 8 }}>No pod yet</div>
        <div style={{ fontSize: 12, color: T.mist, marginBottom: 20 }}>
          Join or create a pod to see your season schedule.
        </div>
        <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })}
          style={{ padding: "12px 24px", background: T.lime, color: T.dark, border: "none",
            borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Go to Pod →
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: T.dark, padding: "20px 16px 14px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Schedule 🎟️</div>
        <div style={{ fontSize: 12, color: T.mist }}>
          {fullPod?.name || "—"} · {games.length} games
          {allocationDone ? ` · ${myGameCount} yours` : " · Allocation pending"}
        </div>
      </div>

      <div style={{ padding: 14 }}>

        {/* ── No allocation yet ── */}
        {!allocationDone && games.length > 0 && (
          <div style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`,
            borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: T.amber, fontWeight: 700, marginBottom: 4 }}>
              ⏳ Allocation not run yet
            </div>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
              Games are loaded but haven't been distributed to members.
            </div>
            <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
              style={{ padding: "8px 16px", background: T.lime, color: T.dark, border: "none",
                borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Run Allocation →
            </button>
          </div>
        )}

        {/* ── No games yet ── */}
        {games.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 6 }}>No games added yet</div>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 16 }}>
              The pod captain needs to add the season schedule.
            </div>
            <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
              style={{ padding: "10px 20px", background: T.lime, color: T.dark, border: "none",
                borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Add Games →
            </button>
          </div>
        )}

        {/* ── Filter tabs ── */}
        {games.length > 0 && allocationDone && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["all", "All Games"], ["mine", "Mine"], ["unassigned", "Unassigned"]].map(([k, lbl]) => (
              <div key={k} onClick={() => setFilter(k)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: "pointer",
                  background: filter === k ? T.lime : "#1A4A2E",
                  color: filter === k ? T.dark : T.mist,
                }}>
                {lbl}
              </div>
            ))}
          </div>
        )}

        {/* ── Game list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: T.mist }}>
            Loading schedule…
          </div>
        ) : (
          filteredGames.map(game => {
            const assignedTo = game.assignments?.[0]?.user_id;
            const isMine     = assignedTo === currentUserId;
            const assigneeName = assignedTo ? memberMap[assignedTo] : null;

            return (
              <div key={game.id} style={{
                background: T.forest, borderRadius: 12, padding: "12px 14px", marginBottom: 8,
                border: `1px solid ${isMine ? T.lime + "55" : "#1A4A2E"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                      fontFamily: "Georgia,serif" }}>
                      {fullPod?.sport_emoji || "🏀"} vs. {game.opponent}
                    </div>
                    <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                      {fmtDay(game.game_date)}, {fmtDate(game.game_date)} · {fmtTime(game.game_time)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                      fontFamily: "Georgia,serif" }}>${game.face_value}</div>
                    <Pill label={game.tier}
                      color={game.tier === "marquee" ? T.lime : game.tier === "premium" ? T.teal : T.mist} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  {!allocationDone
                    ? <Badge color={T.amber}>⏳ Not allocated</Badge>
                    : isMine
                      ? <Badge color={T.lime}>✓ Yours</Badge>
                      : assigneeName
                        ? <Badge color={T.mist}>→ {assigneeName}</Badge>
                        : <Badge color={T.amber}>🔥 Unassigned</Badge>
                  }
                  {isMine && (
                    <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "resale" })}
                      style={{ marginLeft: "auto", fontSize: 10, color: T.lime, cursor: "pointer" }}>
                      Can't go? Resell →
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
