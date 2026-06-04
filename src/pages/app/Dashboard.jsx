// ─── Dashboard ────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import { SkeletonCard } from "../../components/Skeleton";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useActivePod } from "../../context/ActivePodContext";
import { useGames } from "../../hooks/useGames";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { fmtDate, fmtTime, daysUntil, daysLabel } from "../../lib/dateUtils";
import { TIER_COLOR } from "../../lib/tierUtils";

export default function Dashboard({ state, dispatch, profile }) {
  const currentUserId = useCurrentUserId();

  // Pull-to-refresh
  const [pullY,          setPullY]          = useState(0);
  const [refreshing,     setRefreshing]     = useState(false);
  const [resaleEarnings, setResaleEarnings] = useState(0);
  const touchStartY = useRef(null);
  const scrollRef   = useRef(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const { pods, loading: podsLoading, refresh: refreshPods } = useMyPods();
  const { activePodId: selectedPodId } = useActivePod();
  const activePodId  = pods.find(p => p.id === selectedPodId)?.id ?? pods?.[0]?.id ?? null;
  const { pod: fullPod, members, escrowBalance } = usePod(activePodId);
  const { games, loading: gamesLoading } = useGames(activePodId);
  const dataLoading = podsLoading || (activePodId && gamesLoading);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const firstName      = profile?.display_name?.split(" ")[0] || "there";
  const isCaptain      = !!fullPod && fullPod.captain_id === currentUserId;

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // My upcoming games, sorted ascending
  const myGames = useMemo(() =>
    games
      .filter(g => g.assignments?.[0]?.user_id === currentUserId)
      .filter(g => {
        if (!g.game_date) return false;
        const [y, m, d] = g.game_date.split("-").map(Number);
        return new Date(y, m - 1, d) >= today;
      }),
    [games, currentUserId, today]
  );

  // All games assigned to me (past + upcoming) — used for season stats
  const allMyGames = useMemo(() =>
    games.filter(g => g.assignments?.[0]?.user_id === currentUserId),
    [games, currentUserId]
  );

  const attendedCount = useMemo(() =>
    allMyGames.filter(g => {
      if (!g.game_date) return false;
      const [y, m, d] = g.game_date.split("-").map(Number);
      return new Date(y, m - 1, d) < today;
    }).length,
    [allMyGames, today]
  );

  const totalFaceValue = useMemo(() =>
    allMyGames.reduce((sum, g) => sum + (parseFloat(g.face_value) || 0), 0),
    [allMyGames]
  );

  // End-of-season stats
  const costPerGame    = attendedCount > 0 && myCost > 0
    ? Math.round(myCost / attendedCount)
    : null;
  const savingsVsRetail = myCost > 0 && totalFaceValue > 0
    ? Math.round(totalFaceValue - myCost)
    : null;
  const savingsPct     = savingsVsRetail !== null && totalFaceValue > 0
    ? Math.round((savingsVsRetail / totalFaceValue) * 100)
    : null;
  const seasonWrapped  = allocationDone && myGames.length === 0 && allMyGames.length > 0;

  // Fetch resale earnings once user + pod are known
  useEffect(() => {
    if (!currentUserId || !isSupabaseConfigured) return;
    supabase
      .from("resale_payouts")
      .select("amount")
      .eq("user_id", currentUserId)
      .then(({ data }) => {
        if (data) setResaleEarnings(data.reduce((s, p) => s + (p.amount || 0), 0));
      });
  }, [currentUserId]);

  const nextGame      = myGames[0] ?? null;
  const upcomingRest  = myGames.slice(1, 4);        // next 2-3 after the primary card
  const myMember      = members.find(m => m.user_id === currentUserId);
  const bidCredits    = myMember?.bid_credits ?? 0;
  const myShare       = myMember?.share_pct  || 0;
  const myCost        = fullPod ? Math.round((parseFloat(fullPod.season_cost) || 0) * myShare / 100) : 0;
  const escrowTarget  = parseFloat(fullPod?.season_cost) || 1;
  const escrowPct     = Math.min(100, Math.round((escrowBalance / escrowTarget) * 100));
  const unfundedCount = members.filter(m => !m.escrow_funded).length;
  const allocationDone = fullPod?.allocation_done || false;
  const myEscrowFunded = myMember?.escrow_funded ?? true;

  // Unconfirmed upcoming mine games
  const unconfirmedGames = myGames.filter(g => !g.assignments?.[0]?.confirmed);

  // ── Computed alert items ─────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    if (!isSupabaseConfigured || !activePodId || !fullPod) return [];
    const items = [];

    if (!myEscrowFunded && myCost > 0) {
      items.push({
        key:    "escrow",
        icon:   "💰",
        title:  `Fund your escrow share — $${myCost.toLocaleString()}`,
        body:   "Pod members are waiting. Your share isn't funded yet.",
        color:  T.amber,
        screen: "pod",
        tab:    "escrow",
      });
    }

    if (unconfirmedGames.length > 0) {
      const g = unconfirmedGames[0];
      items.push({
        key:    "confirm",
        icon:   "✅",
        title:  `Confirm attendance — vs. ${g.opponent}`,
        body:   `${fmtDate(g.game_date)} · Let your pod know you're going.`,
        color:  T.lime,
        screen: "schedule",
      });
    }

    if (!allocationDone && games.length > 0 && isCaptain) {
      items.push({
        key:    "allocate",
        icon:   "⚡",
        title:  "Run game allocation",
        body:   `${games.length} games loaded — distribute them to members.`,
        color:  T.teal,
        screen: "allocate",
      });
    }

    return items;
  }, [myEscrowFunded, myCost, unconfirmedGames, allocationDone, games.length, isCaptain, activePodId, fullPod]);

  // ── Pull-to-refresh ──────────────────────────────────────────────────────────
  function onTouchStart(e) { touchStartY.current = e.touches[0].clientY; }
  function onTouchMove(e) {
    if (!scrollRef.current || scrollRef.current.scrollTop > 0) { setPullY(0); return; }
    const delta = e.touches[0].clientY - (touchStartY.current || 0);
    if (delta > 0) setPullY(Math.min(delta, 80));
  }
  async function onTouchEnd() {
    if (pullY >= 60 && !refreshing) {
      setRefreshing(true); setPullY(0);
      try { await refreshPods(); } finally { setRefreshing(false); }
    } else { setPullY(0); }
  }

  return (
    <div
      ref={scrollRef}
      style={{ padding: "0 0 80px", overflowY: "auto", height: "100%" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      {(pullY > 10 || refreshing) && (
        <div style={{
          textAlign: "center", padding: "8px 0",
          transform: `translateY(${refreshing ? 0 : pullY - 40}px)`,
          transition: refreshing ? "none" : "transform 0.1s",
          fontSize: 10, color: T.lime, fontWeight: 700, letterSpacing: 1,
        }}>
          {refreshing ? "↻ Refreshing…" : pullY >= 60 ? "↑ Release to refresh" : "↓ Pull to refresh"}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 20px", borderBottom: "1px solid #1A4A2E",
      }}>
        <div style={{ fontSize: 11, color: T.mist, letterSpacing: 2, marginBottom: 4 }}>
          WELCOME BACK
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 16 }}>
          Hey, {firstName} 👋
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            {
              i: fullPod?.sport_emoji || "🏟️",
              v: fullPod ? (fullPod.name?.split(" ").slice(0, 2).join(" ") || "Pod") : "No Pod",
              s: fullPod ? `${members.length}/${fullPod.max_members} members` : "create one",
            },
            {
              i: "🎟️",
              v: `${myGames.length} Game${myGames.length !== 1 ? "s" : ""}`,
              s: allocationDone ? "this season" : "pending allocation",
            },
            {
              i: "🎯",
              v: `${bidCredits} pts`,
              s: "bid credits",
            },
          ].map(({ i, v, s }) => (
            <div key={s} style={{
              background: "#ffffff08", borderRadius: 10, padding: "10px 8px",
              textAlign: "center", border: "1px solid #1A4A2E",
            }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{i}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                fontFamily: "Georgia,serif", lineHeight: 1.2 }}>{v}</div>
              <div style={{ fontSize: 9, color: T.mist }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 14px 0" }}>

        {/* ── Loading skeletons ──────────────────────────────────────────── */}
        {dataLoading && !fullPod && (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
          </>
        )}

        {/* ── Alert strip ────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {alerts.map(alert => (
              <div
                key={alert.key}
                onClick={() => alert.screen && dispatch({ type: "SET_SCREEN", screen: alert.screen })}
                style={{
                  background: `${alert.color}10`,
                  border: `1px solid ${alert.color}33`,
                  borderRadius: 10, padding: "11px 14px", marginBottom: 8,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: alert.screen ? "pointer" : "default",
                  minHeight: 44,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 2 }}>
                    {alert.icon} {alert.title}
                  </div>
                  <div style={{ fontSize: 10, color: T.mist, lineHeight: 1.4 }}>{alert.body}</div>
                </div>
                {alert.screen && (
                  <div style={{ color: T.mist, fontSize: 18, marginLeft: 10, flexShrink: 0 }}>›</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Getting Started checklist (captain, not fully set up) ──────── */}
        {isSupabaseConfigured && fullPod && isCaptain && (() => {
          const steps = [
            { done: true,                label: "Pod created",         hint: null,           screen: null       },
            { done: games.length > 0,    label: "Schedule imported",   hint: "Add games →",  screen: "allocate" },
            { done: members.length > 1,  label: "Members joined",      hint: "Manage pod →", screen: "pod"      },
            { done: escrowPct >= 100,    label: "Escrow fully funded", hint: "View pod →",   screen: "pod"      },
            { done: allocationDone,      label: "Allocation complete", hint: "Run now →",    screen: "allocate" },
          ];
          const doneCount = steps.filter(s => s.done).length;
          if (doneCount === steps.length) return null;
          const pct = Math.round((doneCount / steps.length) * 100);
          return (
            <Card style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif" }}>🚀 Getting Started</div>
                <div style={{ fontSize: 11, color: T.lime, fontWeight: 700 }}>{pct}%</div>
              </div>
              <Bar value={doneCount} max={steps.length} h={4} />
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
                {steps.map(step => (
                  <div
                    key={step.label}
                    onClick={() => step.screen && !step.done && dispatch({ type: "SET_SCREEN", screen: step.screen })}
                    style={{ display: "flex", alignItems: "center", gap: 10,
                      cursor: step.screen && !step.done ? "pointer" : "default" }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: step.done ? T.lime : "transparent",
                      border: `2px solid ${step.done ? T.lime : "#1A4A2E"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: T.dark, fontWeight: 700,
                    }}>
                      {step.done ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1, fontSize: 12,
                      color: step.done ? T.mist : T.white,
                      textDecoration: step.done ? "line-through" : "none" }}>
                      {step.label}
                    </div>
                    {!step.done && step.hint && (
                      <div style={{ fontSize: 11, color: T.lime, fontWeight: 700 }}>{step.hint}</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* ── No pod CTA ─────────────────────────────────────────────────── */}
        {isSupabaseConfigured && !activePodId && !dataLoading && (
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

        {/* ── Game day banner ─────────────────────────────────────────────── */}
        {nextGame && daysUntil(nextGame.game_date) === 0 && (
          <div style={{ background: `linear-gradient(135deg,${T.lime}22,${T.teal}14)`,
            border: `1.5px solid ${T.lime}66`, borderRadius: 14,
            padding: "16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.lime,
                letterSpacing: 2 }}>🏟️ GAME DAY</div>
              <div style={{ background: T.lime, color: T.dark, borderRadius: 20,
                padding: "3px 10px", fontSize: 10, fontWeight: 700 }}>TODAY</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 4 }}>
              {fullPod?.sport_emoji || "🎟️"} vs. {nextGame.opponent}
            </div>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 12 }}>
              {fmtTime(nextGame.game_time)}{fullPod?.venue ? ` · ${fullPod.venue}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {nextGame.assignments?.[0]?.user_id === currentUserId ? (
                nextGame.assignments[0].confirmed ? (
                  <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                    borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700,
                    color: T.lime }}>✅ You're confirmed</div>
                ) : (
                  <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
                    style={{ background: `${T.amber}18`, border: `1px solid ${T.amber}44`,
                      borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700,
                      color: T.amber, cursor: "pointer" }}>⏳ Confirm attendance →</div>
                )
              ) : (
                <div style={{ fontSize: 12, color: T.mist }}>Assigned to another member</div>
              )}
              <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
                style={{ fontSize: 11, color: T.teal, fontWeight: 700, cursor: "pointer" }}>
                View tickets →
              </div>
            </div>
          </div>
        )}

        {/* ── Primary next game card ──────────────────────────────────────── */}
        {nextGame ? (
          <div
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
            style={{
              background: `linear-gradient(135deg,${T.lime}18,${T.teal}0a)`,
              border: `1px solid ${T.lime}44`, borderRadius: 14,
              padding: "14px 16px", marginBottom: 8, cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: T.lime, fontWeight: 700, letterSpacing: 1.5 }}>
                YOUR NEXT GAME
              </div>
              {/* Countdown badge */}
              {(() => {
                const n = daysUntil(nextGame.game_date);
                const label = daysLabel(n);
                const color = n === 0 ? T.red : n === 1 ? T.amber : T.teal;
                return (
                  <div style={{
                    background: `${color}18`, border: `1px solid ${color}44`,
                    borderRadius: 20, padding: "2px 10px",
                    fontSize: 10, fontWeight: 700, color,
                  }}>
                    {label}
                  </div>
                );
              })()}
            </div>

            <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 4 }}>
              {fullPod?.sport_emoji || "🏀"} vs. {nextGame.opponent}
            </div>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 8 }}>
              {fmtDate(nextGame.game_date)} · {fmtTime(nextGame.game_time)}
              {fullPod?.venue ? ` · ${fullPod.venue}` : ""}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {nextGame.assignments?.[0]?.confirmed
                ? <Badge color={T.teal}>✅ Attending</Badge>
                : <Badge color={T.amber}>⏳ Confirm attendance →</Badge>
              }
              {(nextGame.tier === "marquee" || nextGame.tier === "playoff") && (
                <Badge color={TIER_COLOR[nextGame.tier]}>
                  {nextGame.tier === "playoff" ? "🏆 Playoff" : "⭐ Marquee"}
                </Badge>
              )}
            </div>
          </div>
        ) : isSupabaseConfigured && activePodId && !dataLoading ? (
          // ── No-games state: differentiate captain vs. member ────────────
          isCaptain ? (
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
          ) : (
            // First-time member experience — allocation hasn't run yet
            <Card style={{ marginBottom: 14, textAlign: "center", padding: 24,
              border: `1px solid ${T.teal}33` }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 6 }}>
                {allocationDone ? "Season's wrapped 🏁" : "Waiting on allocation"}
              </div>
              <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6, marginBottom: 14 }}>
                {allocationDone
                  ? "All your games from this season are done. Check the schedule for history."
                  : "Your captain is setting things up. Once they run allocation, your games will appear here."}
              </div>
              <button
                onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
                style={{ padding: "9px 20px", background: "transparent",
                  border: `1px solid ${T.teal}55`, color: T.teal,
                  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                View Schedule →
              </button>
            </Card>
          )
        ) : null}

        {/* ── Upcoming games mini-list ────────────────────────────────────── */}
        {upcomingRest.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {upcomingRest.map((game, i) => {
              const n = daysUntil(game.game_date);
              return (
                <div
                  key={game.id}
                  onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
                  style={{
                    background: T.forest, border: "1px solid #1A4A2E",
                    borderRadius: 10, padding: "10px 14px",
                    marginBottom: i < upcomingRest.length - 1 ? 6 : 0,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.white }}>
                      {fullPod?.sport_emoji || "🏀"} vs. {game.opponent}
                    </div>
                    <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                      {fmtDate(game.game_date)} · {fmtTime(game.game_time)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: T.mist }}>{daysLabel(n)}</div>
                    {game.assignments?.[0]?.confirmed && (
                      <div style={{ fontSize: 9, color: T.teal, marginTop: 2 }}>✅ confirmed</div>
                    )}
                  </div>
                </div>
              );
            })}
            {myGames.length > 4 && (
              <div
                onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
                style={{ textAlign: "center", fontSize: 11, color: T.lime,
                  cursor: "pointer", padding: "6px 0", fontWeight: 700 }}
              >
                +{myGames.length - 4} more games → View All
              </div>
            )}
          </div>
        )}

        {/* ── Pod summary card ─────────────────────────────────────────────── */}
        {fullPod && (
          <Card
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })}
            style={{ marginBottom: 14 }}
          >
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
                <span style={{ fontSize: 10, color: escrowPct >= 100 ? T.teal : T.lime, fontWeight: 700 }}>
                  {escrowPct}%
                </span>
              </div>
              <Bar value={escrowBalance} max={escrowTarget} h={5} color={escrowPct >= 100 ? T.teal : T.lime} />
            </div>
            {unfundedCount > 0 && (
              <div style={{ fontSize: 10, color: T.amber, marginTop: 6 }}>
                ⚠ {unfundedCount} member{unfundedCount > 1 ? "s" : ""} haven't funded yet
              </div>
            )}
            {escrowPct >= 100 && (
              <div style={{ fontSize: 10, color: T.teal, marginTop: 6 }}>
                ✅ All members funded — season tickets secured!
              </div>
            )}
          </Card>
        )}

        {/* ── End-of-season wrap banner ─────────────────────────────────────── */}
        {isSupabaseConfigured && seasonWrapped && (
          <div style={{
            background: `linear-gradient(135deg,${T.lime}18,${T.teal}12)`,
            border: `1px solid ${T.lime}44`, borderRadius: 14,
            padding: "18px 16px", marginBottom: 14, textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏁</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 4 }}>
              Season Wrapped!
            </div>
            <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6, marginBottom: 14 }}>
              Another season in the books with {fullPod?.name || "your pod"}.
              Here's how it went:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                {
                  label: "Games attended",
                  value: `${attendedCount} / ${allMyGames.length}`,
                  color: T.lime,
                },
                {
                  label: "Cost per game",
                  value: costPerGame ? `$${costPerGame}` : "—",
                  color: T.lime,
                },
                {
                  label: "Saved vs. retail",
                  value: savingsVsRetail !== null && savingsVsRetail > 0
                    ? `$${savingsVsRetail.toLocaleString()}`
                    : "—",
                  color: T.teal,
                },
                {
                  label: "Savings %",
                  value: savingsPct !== null && savingsPct > 0 ? `${savingsPct}%` : "—",
                  color: T.teal,
                },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#ffffff08", borderRadius: 10,
                  padding: "10px 8px", border: "1px solid #1A4A2E" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color,
                    fontFamily: "Georgia,serif" }}>{value}</div>
                  <div style={{ fontSize: 9, color: T.mist, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {resaleEarnings > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: T.teal, fontWeight: 700 }}>
                ♻️ +${resaleEarnings.toFixed(0)} earned from resale
              </div>
            )}
          </div>
        )}

        {/* ── Season Stats ─────────────────────────────────────────────────── */}
        {isSupabaseConfigured && activePodId && allocationDone && allMyGames.length > 0 && !seasonWrapped && (
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif" }}>📊 Season at a Glance</div>
              <div style={{ fontSize: 10, color: T.mist }}>
                {attendedCount} played · {myGames.length} upcoming
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: T.mist }}>Games attended</span>
                <span style={{ fontSize: 10, color: T.lime, fontWeight: 700 }}>
                  {attendedCount} / {allMyGames.length}
                </span>
              </div>
              <Bar value={attendedCount} max={allMyGames.length || 1} h={4} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { l: "Face Value",     v: totalFaceValue > 0 ? `$${Math.round(totalFaceValue).toLocaleString()}` : "—", emoji: "🎟️", color: T.lime },
                { l: "Resale Earned",  v: resaleEarnings > 0 ? `+$${resaleEarnings.toFixed(0)}` : "—",                  emoji: "♻️", color: T.teal },
                { l: "Cost per Game",  v: costPerGame ? `$${costPerGame}` : "—",                                         emoji: "📉", color: T.lime },
                { l: "Saved vs Retail",v: savingsVsRetail !== null && savingsVsRetail > 0 ? `$${savingsVsRetail.toLocaleString()}` : "—", emoji: "💚", color: T.teal },
              ].map(({ l, v, emoji, color }) => (
                <div key={l} style={{ background: "#ffffff06", borderRadius: 8,
                  padding: "9px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color,
                      fontFamily: "Georgia,serif" }}>{v}</div>
                    <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
                  </div>
                </div>
              ))}
            </div>
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
                {isCaptain && (
                  <button
                    onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SCREEN", screen: "allocate" }); }}
                    style={{ padding: "9px 20px", background: T.lime, color: T.dark,
                      border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Run Allocation →
                  </button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "📅 Schedule",       screen: "schedule" },
            { label: "♻️ Resale",         screen: "resale"   },
            { label: "🏆 Bid Auctions",   screen: "bids"     },
            { label: "👤 Profile",        screen: "profile"  },
          ].map(({ label, screen }) => (
            <div
              key={label}
              onClick={() => dispatch({ type: "SET_SCREEN", screen })}
              style={{
                background: T.forest, border: "1px solid #1A4A2E", borderRadius: 12,
                padding: "13px 10px", textAlign: "center", cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: T.chalk,
                minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {label}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
