// ─── ScheduleScreen ───────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import Pill from "../../components/Pill";
import { SkeletonGameRow } from "../../components/Skeleton";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useActivePod } from "../../context/ActivePodContext";
import { useGames } from "../../hooks/useGames";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { isSupabaseConfigured } from "../../lib/supabase";
import { notify } from "../../lib/notify";
import { fmtDate, fmtDay, fmtTime, getToday } from "../../lib/dateUtils";
import { getMyTrades, proposeTrade, acceptTrade, rejectTrade, cancelTrade } from "../../api/trades";
import { markTicketDelivered, confirmTicketReceipt, getPodDeliveryStatus } from "../../api/delivery";

export default function ScheduleScreen({ state, dispatch }) {
  const currentUserId = useCurrentUserId();
  const [filter,        setFilter]        = useState("all"); // "all" | "mine" | "unassigned"
  const [showShareCard, setShowShareCard] = useState(false);

  // Pull-to-refresh
  const [pullY,         setPullY]         = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);
  const touchStartY = useRef(null);
  const scrollRef   = useRef(null);

  // Trade state
  const [trades,       setTrades]       = useState([]);
  const [showTradeFor, setShowTradeFor] = useState(null); // game obj to offer trade for
  const [tradeTarget,  setTradeTarget]  = useState(null); // { game, member } selected by user
  const [tradeMsg,     setTradeMsg]     = useState("");
  const [tradeBusy,    setTradeBusy]    = useState(false);
  const [tradeErr,     setTradeErr]     = useState(null);
  const [showIncoming, setShowIncoming] = useState(false);

  // Delivery state
  const [deliveryMap,      setDeliveryMap]      = useState({}); // game_id → assignment row
  const [deliverFor,       setDeliverFor]        = useState(null); // game being marked delivered
  const [deliveryNote,     setDeliveryNote]      = useState("");
  const [deliveryBusy,     setDeliveryBusy]      = useState(false);
  const [confirmBusy,      setConfirmBusy]       = useState(null); // assignmentId being confirmed

  // Attendance state
  const [attendanceBusy,   setAttendanceBusy]   = useState(null); // gameId being confirmed
  const [showReleaseFor,   setShowReleaseFor]   = useState(null); // game being released
  const [releaseBusy,      setReleaseBusy]      = useState(false);

  // Captain reassign state
  const [showAssignFor,    setShowAssignFor]    = useState(null); // game to reassign
  const [assignBusy,       setAssignBusy]       = useState(false);

  const { pods }    = useMyPods();
  const { activePodId: selectedPodId } = useActivePod();
  const activePodId = pods.find(p => p.id === selectedPodId)?.id ?? pods?.[0]?.id ?? null;
  const { pod: fullPod, members: rawMembers } = usePod(activePodId);
  const { games, loading, confirmAttendance, releaseGame, assignGame, refresh: refreshGames } = useGames(activePodId);

  const isCaptain = !!fullPod && fullPod.captain_id === currentUserId;

  // Build userId → display name map (memoized — rawMembers and currentUserId change infrequently)
  const memberMap = useMemo(() => {
    const map = {};
    rawMembers.forEach(m => {
      map[m.user_id] = m.user_id === currentUserId
        ? "You"
        : (m.profiles?.display_name || "Member");
    });
    return map;
  }, [rawMembers, currentUserId]);

  const today = useMemo(() => getToday(), []);

  const allocationDone = fullPod?.allocation_done || false;

  // Load trades
  const loadTrades = useCallback(async () => {
    if (!activePodId || !isSupabaseConfigured) return;
    try { setTrades(await getMyTrades(activePodId)); } catch {}
  }, [activePodId]);

  // Load delivery status
  const loadDelivery = useCallback(async () => {
    if (!activePodId || !isSupabaseConfigured) return;
    try { setDeliveryMap(await getPodDeliveryStatus(activePodId)); } catch {}
  }, [activePodId]);

  useEffect(() => { loadTrades(); loadDelivery(); }, [loadTrades, loadDelivery]);

  // ── Pull-to-refresh handlers ─────────────────────────────────────────────────
  function onTouchStart(e) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchMove(e) {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    if (scrollTop > 0) { setPullY(0); return; }
    const delta = e.touches[0].clientY - (touchStartY.current || 0);
    if (delta > 0) setPullY(Math.min(delta, 80));
  }
  async function onTouchEnd() {
    if (pullY >= 60 && !refreshing) {
      setRefreshing(true);
      setPullY(0);
      try { await Promise.all([loadTrades(), loadDelivery(), refreshGames()]); } finally { setRefreshing(false); }
    } else {
      setPullY(0);
    }
  }

  const incomingTrades = trades.filter(t => t.to_user_id === currentUserId);
  const outgoingTrades = trades.filter(t => t.from_user_id === currentUserId);

  // ── Filter games ─────────────────────────────────────────────────────────────
  const filteredGames = games.filter(g => {
    const assignedTo = g.assignments?.[0]?.user_id;
    if (filter === "mine")       return assignedTo === currentUserId;
    if (filter === "unassigned") return !assignedTo;
    return true;
  });

  const myGameCount = games.filter(g => g.assignments?.[0]?.user_id === currentUserId).length;

  // ── Other members' assigned games (for trade selection) ──────────────────────
  const otherMemberGames = games.filter(g => {
    const uid = g.assignments?.[0]?.user_id;
    return uid && uid !== currentUserId;
  });

  // ── Trade handlers ───────────────────────────────────────────────────────────
  async function handleProposeTrade() {
    if (!showTradeFor || !tradeTarget) return;
    setTradeBusy(true);
    setTradeErr(null);
    try {
      await proposeTrade({
        podId:      activePodId,
        fromGameId: showTradeFor.id,
        toGameId:   tradeTarget.game.id,
        toUserId:   tradeTarget.game.assignments[0].user_id,
        message:    tradeMsg,
      });
      setShowTradeFor(null);
      setTradeTarget(null);
      setTradeMsg("");
      await loadTrades();
    } catch (e) {
      setTradeErr(e.message);
    } finally {
      setTradeBusy(false);
    }
  }

  async function handleAccept(tradeId) {
    setTradeBusy(true);
    try { await acceptTrade(tradeId); await loadTrades(); } catch (e) { setTradeErr(e.message); }
    finally { setTradeBusy(false); }
  }

  async function handleReject(tradeId) {
    setTradeBusy(true);
    try { await rejectTrade(tradeId); await loadTrades(); } catch (e) { setTradeErr(e.message); }
    finally { setTradeBusy(false); }
  }

  async function handleCancel(tradeId) {
    setTradeBusy(true);
    try { await cancelTrade(tradeId); await loadTrades(); } catch (e) { setTradeErr(e.message); }
    finally { setTradeBusy(false); }
  }

  // ── Delivery handlers ────────────────────────────────────────────────────────
  async function handleMarkDelivered() {
    if (!deliverFor) return;
    const assignment = deliveryMap[deliverFor.id];
    if (!assignment) return;
    setDeliveryBusy(true);
    try {
      await markTicketDelivered(assignment.id, deliveryNote);
      setDeliverFor(null);
      setDeliveryNote("");
      await loadDelivery();
    } catch (e) {
      console.error("Delivery error:", e);
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleConfirmReceipt(gameId) {
    const assignment = deliveryMap[gameId];
    if (!assignment) return;
    setConfirmBusy(assignment.id);
    try {
      await confirmTicketReceipt(assignment.id);
      await loadDelivery();
    } catch (e) {
      console.error("Confirm error:", e);
    } finally {
      setConfirmBusy(null);
    }
  }

  // ── Attendance handlers ──────────────────────────────────────────────────────
  async function handleConfirmAttendance(game) {
    setAttendanceBusy(game.id);
    try {
      await confirmAttendance(game.id);
    } catch (e) {
      console.error("Confirm attendance:", e);
    } finally {
      setAttendanceBusy(null);
    }
  }

  async function handleReleaseGame(game) {
    setReleaseBusy(true);
    try {
      await releaseGame(game.id);
      setShowReleaseFor(null);
      await refreshGames();
      // Notify the captain (unless the captain is releasing their own game)
      if (fullPod?.captain_id && fullPod.captain_id !== currentUserId) {
        notify({
          userId: fullPod.captain_id,
          type:   "game_released",
          title:  "📤 Game released back to pod",
          body:   `A member released their vs. ${game.opponent} seat. You can reassign it from the schedule.`,
          url:    "/app",
        });
      }
    } catch (e) {
      console.error("Release game:", e);
    } finally {
      setReleaseBusy(false);
    }
  }

  // ── Captain: manually assign a game to a member ─────────────────────────────
  async function handleAssignGame(game, memberId) {
    setAssignBusy(true);
    try {
      await assignGame(game.id, memberId);
      setShowAssignFor(null);
      // Notify the newly assigned member
      if (memberId !== currentUserId) {
        const assigneeName = memberMap[memberId] || "You";
        notify({
          userId: memberId,
          type:   "game_allocated",
          title:  "🎟️ Game assigned to you",
          body:   `The captain assigned vs. ${game.opponent} (${fmtDate(game.game_date)}) to you. Check your schedule.`,
          url:    "/app",
        });
      }
    } catch (e) {
      console.error("Assign game:", e);
    } finally {
      setAssignBusy(false);
    }
  }

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
    <>
    <div
      ref={scrollRef}
      style={{ paddingBottom: 80, overflowY: "auto", height: "100%" }}
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
      {/* Header */}
      <div style={{ background: T.dark, padding: "20px 16px 14px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 4 }}>Schedule 🎟️</div>
            <div style={{ fontSize: 12, color: T.mist }}>
              {fullPod?.name || "—"} · {games.length} games
              {allocationDone ? ` · ${myGameCount} yours` : " · Allocation pending"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Share schedule button */}
            {allocationDone && myGameCount > 0 && (
              <div onClick={() => setShowShareCard(true)}
                style={{ cursor: "pointer", background: `${T.lime}18`,
                  border: `1px solid ${T.lime}44`, borderRadius: 20, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700, color: T.lime }}>
                ↗ Share
              </div>
            )}
            {/* Incoming trade alerts */}
            {incomingTrades.length > 0 && (
              <div onClick={() => setShowIncoming(true)}
                style={{ position: "relative", cursor: "pointer",
                  background: T.amber, borderRadius: 20, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700, color: T.dark }}>
                🔄 {incomingTrades.length} trade{incomingTrades.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
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

        {/* ── Outgoing trade status ── */}
        {outgoingTrades.length > 0 && (
          <div style={{ background: `${T.teal}10`, border: `1px solid ${T.teal}33`,
            borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.teal, marginBottom: 6 }}>
              🔄 Pending trade offers
            </div>
            {outgoingTrades.map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: T.chalk }}>
                  Your <strong>{t.from_game?.opponent}</strong> ↔ {t.to_profile?.display_name || "Member"}'s <strong>{t.to_game?.opponent}</strong>
                </div>
                <button onClick={() => handleCancel(t.id)} disabled={tradeBusy}
                  style={{ fontSize: 10, color: T.red, background: "transparent",
                    border: `1px solid ${T.red}44`, borderRadius: 6,
                    padding: "3px 8px", cursor: "pointer" }}>
                  Withdraw
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter tabs ── */}
        {games.length > 0 && allocationDone && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["all", "All Games"], ["mine", "Mine"], ["unassigned", "Unassigned"]].map(([k, lbl]) => (
              <div key={k} onClick={() => setFilter(k)}
                style={{
                  padding: "10px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center",
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
          <>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonGameRow key={i} />)}
          </>
        ) : (
          filteredGames.map(game => {
            const assignedTo    = game.assignments?.[0]?.user_id;
            const isMine        = assignedTo === currentUserId;
            const assigneeName  = assignedTo ? memberMap[assignedTo] : null;
            const hasPendingOut = outgoingTrades.some(t => t.from_game_id === game.id);
            const delivery      = deliveryMap[game.id];  // assignment row with delivery cols
            const dlvStatus     = delivery?.delivery_status || "pending";

            // Is this game upcoming (today or future)?
            const [gy, gm, gd] = (game.game_date || "").split("-").map(Number);
            const isUpcoming = new Date(gy, gm - 1, gd) >= today;

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
                    <Pill label={game.tier} color={
                      game.tier === "playoff"  ? "#EF4444" :
                      game.tier === "marquee"  ? T.lime    :
                      game.tier === "premium"  ? T.teal    : T.mist
                    } />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center",
                  flexWrap: "wrap" }}>
                  {!allocationDone
                    ? <Badge color={T.amber}>⏳ Not allocated</Badge>
                    : isMine
                      ? <Badge color={T.lime}>✓ Yours</Badge>
                      : assigneeName
                        ? <Badge color={T.mist}>→ {assigneeName}</Badge>
                        : <>
                            <Badge color={T.amber}>🔥 Unassigned</Badge>
                            {isCaptain && isUpcoming && (
                              <button
                                onClick={() => setShowAssignFor(game)}
                                style={{
                                  padding: "2px 10px", background: "transparent",
                                  border: `1px solid ${T.lime}55`, borderRadius: 20,
                                  fontSize: 10, fontWeight: 700, color: T.lime, cursor: "pointer",
                                }}>
                                Reassign →
                              </button>
                            )}
                          </>
                  }

                  {/* ── Delivery status badge (member view) ── */}
                  {isMine && allocationDone && isUpcoming && delivery && (
                    <>
                      {dlvStatus === "confirmed" && (
                        <Badge color={T.teal}>✅ Ticket confirmed</Badge>
                      )}
                      {dlvStatus === "delivered" && (
                        <button
                          onClick={() => handleConfirmReceipt(game.id)}
                          disabled={confirmBusy === delivery.id}
                          style={{
                            padding: "3px 10px", background: T.teal, border: "none",
                            borderRadius: 20, fontSize: 10, fontWeight: 700,
                            color: T.dark, cursor: "pointer",
                          }}>
                          {confirmBusy === delivery.id ? "…" : "📬 Confirm receipt →"}
                        </button>
                      )}
                      {dlvStatus === "pending" && (
                        <Badge color={T.amber}>⏳ Awaiting ticket</Badge>
                      )}
                    </>
                  )}

                  {/* ── Captain: mark delivered (for other members' upcoming games) ── */}
                  {isCaptain && !isMine && assignedTo && isUpcoming && allocationDone && delivery && dlvStatus === "pending" && (
                    <button
                      onClick={() => setDeliverFor(game)}
                      style={{
                        marginLeft: "auto", padding: "3px 10px",
                        background: "transparent", border: `1px solid ${T.lime}55`,
                        borderRadius: 20, fontSize: 10, fontWeight: 700,
                        color: T.lime, cursor: "pointer",
                      }}>
                      📤 Mark Delivered
                    </button>
                  )}
                  {isCaptain && !isMine && assignedTo && isUpcoming && allocationDone && delivery && dlvStatus === "delivered" && (
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.teal }}>
                      📬 Sent · awaiting confirm
                    </span>
                  )}
                  {isCaptain && !isMine && assignedTo && isUpcoming && allocationDone && delivery && dlvStatus === "confirmed" && (
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.lime }}>
                      ✅ Confirmed by member
                    </span>
                  )}

                  {/* My game trade/resell actions */}
                  {isMine && allocationDone && (
                    <>
                      {hasPendingOut ? (
                        <div style={{ marginLeft: "auto", fontSize: 10, color: T.teal }}>
                          Trade pending…
                        </div>
                      ) : dlvStatus !== "confirmed" ? (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                          <div onClick={() => setShowTradeFor(game)}
                            style={{ fontSize: 10, color: T.teal, cursor: "pointer" }}>
                            🔄 Trade →
                          </div>
                          <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "resale" })}
                            style={{ fontSize: 10, color: T.lime, cursor: "pointer" }}>
                            Resell →
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {/* ── Attendance confirmation row (my games only) ── */}
                {isMine && allocationDone && isUpcoming && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1A4A2E",
                    display: "flex", alignItems: "center", gap: 10 }}>
                    {game.assignments?.[0]?.confirmed ? (
                      <Badge color={T.teal}>✅ Attending</Badge>
                    ) : (
                      <>
                        <button
                          onClick={() => handleConfirmAttendance(game)}
                          disabled={attendanceBusy === game.id}
                          style={{
                            padding: "5px 12px", background: T.lime, border: "none",
                            borderRadius: 20, fontSize: 10, fontWeight: 700,
                            color: T.dark, cursor: "pointer",
                            opacity: attendanceBusy === game.id ? 0.6 : 1,
                          }}
                        >
                          {attendanceBusy === game.id ? "…" : "Confirm I'm Going ✓"}
                        </button>
                        <div
                          onClick={() => setShowReleaseFor(game)}
                          style={{ fontSize: 10, color: T.mist, cursor: "pointer",
                            textDecoration: "underline" }}
                        >
                          Can't make it?
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div> {/* end scrollRef */}

    {/* ── Captain: Mark Delivered modal ── */}
    {deliverFor && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
        zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) { setDeliverFor(null); setDeliveryNote(""); } }}>
        <div style={{ width: "100%", maxWidth: 430, background: T.dark,
          borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
          borderBottom: "none", padding: "20px 20px 44px" }}
          onClick={e => e.stopPropagation()}>

          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 18px" }} />

          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>📤 Mark Ticket Delivered</div>
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 16 }}>
            Confirm you've forwarded the ticket to the member. They'll be notified to confirm receipt.
          </div>

          {/* Game summary */}
          <div style={{ background: `${T.lime}10`, border: `1px solid ${T.lime}22`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
              {fullPod?.sport_emoji || "🏀"} vs. {deliverFor.opponent}
            </div>
            <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
              {fmtDay(deliverFor.game_date)}, {fmtDate(deliverFor.game_date)} · {fmtTime(deliverFor.game_time)}
            </div>
            <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
              Assigned to: <strong style={{ color: T.chalk }}>
                {memberMap[deliverFor.assignments?.[0]?.user_id] || "Member"}
              </strong>
            </div>
          </div>

          {/* Optional note */}
          <div style={{ fontSize: 10, color: T.mist, marginBottom: 6, letterSpacing: 1 }}>
            ADD A NOTE (OPTIONAL)
          </div>
          <input
            value={deliveryNote}
            onChange={e => setDeliveryNote(e.target.value)}
            placeholder="e.g. Transferred via Ticketmaster — check your email"
            style={{ width: "100%", padding: "10px 12px", background: T.forest,
              border: `1px solid #1A4A2E`, borderRadius: 8, color: T.white,
              fontSize: 12, outline: "none", fontFamily: "Calibri,sans-serif",
              marginBottom: 16, boxSizing: "border-box" }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setDeliverFor(null); setDeliveryNote(""); }}
              style={{ flex: 1, padding: "12px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleMarkDelivered} disabled={deliveryBusy}
              style={{ flex: 2, padding: "12px", background: T.lime, border: "none",
                borderRadius: 10, color: T.dark, fontSize: 13, fontWeight: 700,
                cursor: deliveryBusy ? "not-allowed" : "pointer",
                opacity: deliveryBusy ? 0.6 : 1 }}>
              {deliveryBusy ? "Saving…" : "✓ Confirm Delivery"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Trade offer modal ── */}
    {showTradeFor && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
        zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) { setShowTradeFor(null); setTradeTarget(null); } }}>
        <div style={{ width: "100%", maxWidth: 430, background: T.dark,
          borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
          borderBottom: "none", padding: "20px 20px 40px",
          maxHeight: "85vh", overflowY: "auto" }}
          onClick={e => e.stopPropagation()}>

          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 18px" }} />

          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>Propose a Trade 🔄</div>
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 16 }}>
            You're offering your game. Pick one to swap for.
          </div>

          {/* My game */}
          <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
            borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: T.lime, fontWeight: 700, marginBottom: 3 }}>YOUR GAME</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white }}>
              {fullPod?.sport_emoji} vs. {showTradeFor.opponent}
            </div>
            <div style={{ fontSize: 10, color: T.mist }}>
              {fmtDate(showTradeFor.game_date)} · ${showTradeFor.face_value}
            </div>
          </div>

          {/* Pick a game from another member */}
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
            letterSpacing: 1, marginBottom: 8 }}>PICK A GAME TO SWAP FOR</div>

          {otherMemberGames.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: T.mist, fontSize: 12 }}>
              No other assigned games available
            </div>
          ) : (
            otherMemberGames.map(g => {
              const ownerId   = g.assignments[0].user_id;
              const ownerName = memberMap[ownerId] || "Member";
              const isSelected = tradeTarget?.game?.id === g.id;
              return (
                <div key={g.id} onClick={() => setTradeTarget({ game: g, member: ownerName })}
                  style={{
                    background: isSelected ? `${T.teal}18` : T.forest,
                    border: `1px solid ${isSelected ? T.teal + "55" : "#1A4A2E"}`,
                    borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700,
                        color: isSelected ? T.teal : T.white }}>
                        vs. {g.opponent}
                      </div>
                      <div style={{ fontSize: 10, color: T.mist }}>
                        {ownerName} · {fmtDate(g.game_date)} · ${g.face_value}
                      </div>
                    </div>
                    {isSelected && <span style={{ color: T.teal, fontSize: 18 }}>✓</span>}
                  </div>
                </div>
              );
            })
          )}

          {/* Optional message */}
          {tradeTarget && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: T.mist, marginBottom: 6, letterSpacing: 1 }}>
                ADD A NOTE (OPTIONAL)
              </div>
              <input
                value={tradeMsg}
                onChange={e => setTradeMsg(e.target.value)}
                placeholder={`Hey ${tradeTarget.member}, want to swap?`}
                style={{ width: "100%", padding: "10px 12px", background: T.forest,
                  border: `1px solid #1A4A2E`, borderRadius: 8, color: T.white,
                  fontSize: 12, outline: "none", fontFamily: "Calibri,sans-serif" }}
              />
            </div>
          )}

          {tradeErr && (
            <div style={{ marginTop: 12, fontSize: 12, color: T.red }}>{tradeErr}</div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => { setShowTradeFor(null); setTradeTarget(null); setTradeMsg(""); }}
              style={{ flex: 1, padding: "12px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleProposeTrade}
              disabled={!tradeTarget || tradeBusy}
              style={{ flex: 2, padding: "12px", background: T.teal, border: "none",
                borderRadius: 10, color: T.dark, fontSize: 13, fontWeight: 700,
                cursor: (!tradeTarget || tradeBusy) ? "not-allowed" : "pointer",
                opacity: (!tradeTarget || tradeBusy) ? 0.6 : 1 }}>
              {tradeBusy ? "Sending…" : "Send Trade Offer →"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Release game modal ── */}
    {showReleaseFor && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) setShowReleaseFor(null); }}
      >
        <div
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none", padding: "24px 20px 44px" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 20px" }} />

          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 6 }}>
            📤 Release Game Back to Pod
          </div>
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 16, lineHeight: 1.7 }}>
            Releasing gives up your seat and makes the game available again.
            Your captain will be able to reassign it. <strong style={{ color: T.white }}>This can't be undone.</strong>
          </div>

          {/* Game summary */}
          <div style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}33`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
              {fullPod?.sport_emoji || "🏀"} vs. {showReleaseFor.opponent}
            </div>
            <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
              {fmtDay(showReleaseFor.game_date)}, {fmtDate(showReleaseFor.game_date)} · {fmtTime(showReleaseFor.game_time)}
            </div>
            <div style={{ fontSize: 10, color: T.amber, marginTop: 4, fontWeight: 700 }}>
              ⚠ You will lose this seat
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setShowReleaseFor(null)}
              style={{ flex: 1, padding: "12px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Keep My Seat
            </button>
            <button
              onClick={() => handleReleaseGame(showReleaseFor)}
              disabled={releaseBusy}
              style={{ flex: 2, padding: "12px", background: T.red, border: "none",
                borderRadius: 10, color: T.white, fontSize: 13, fontWeight: 700,
                cursor: releaseBusy ? "not-allowed" : "pointer",
                opacity: releaseBusy ? 0.6 : 1 }}
            >
              {releaseBusy ? "Releasing…" : "Yes, Release My Seat"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Captain: reassign game bottom sheet ── */}
    {showAssignFor && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) setShowAssignFor(null); }}
      >
        <div
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none", padding: "20px 20px 40px" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 18px" }} />

          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>
            🎟️ Reassign Game
          </div>
          <div style={{ fontSize: 12, color: T.mist, marginBottom: 16 }}>
            {fullPod?.sport_emoji || "🏀"} vs. {showAssignFor.opponent} ·{" "}
            {fmtDate(showAssignFor.game_date)} — pick a pod member to assign this seat to.
          </div>

          {rawMembers.map(member => {
            const name = member.user_id === currentUserId
              ? "You (Captain)"
              : (member.profiles?.display_name || "Member");
            return (
              <div
                key={member.user_id}
                onClick={() => !assignBusy && handleAssignGame(showAssignFor, member.user_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, cursor: assignBusy ? "not-allowed" : "pointer",
                  padding: "12px 14px", borderRadius: 12, marginBottom: 8,
                  background: T.forest, border: "1px solid #1A4A2E",
                  opacity: assignBusy ? 0.6 : 1,
                  transition: "border-color 0.15s",
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: T.green, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 13, fontWeight: 700, color: T.lime,
                }}>
                  {(member.profiles?.avatar_initials || "??").slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{name}</div>
                  <div style={{ fontSize: 10, color: T.mist }}>
                    {member.share_pct}% share · {member.games_allocated || 0} games
                  </div>
                </div>
                <div style={{ color: T.lime, fontSize: 18 }}>›</div>
              </div>
            );
          })}

          <button
            onClick={() => setShowAssignFor(null)}
            style={{ width: "100%", marginTop: 8, padding: "13px",
              background: "transparent", border: `1px solid #1A4A2E`,
              borderRadius: 12, color: T.mist, fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* ── Share My Schedule card ── */}
    {showShareCard && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) setShowShareCard(false); }}
      >
        <div
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none", padding: "20px 20px 44px" }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 18px" }} />

          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>↗ Share My Schedule</div>
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 18 }}>
            Your upcoming {myGameCount} game{myGameCount !== 1 ? "s" : ""} this season
          </div>

          {/* Schedule card preview */}
          <div style={{
            background: `linear-gradient(135deg,${T.dark},${T.forest})`,
            border: `1px solid ${T.lime}44`, borderRadius: 16, padding: "18px 16px",
            marginBottom: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 28 }}>{fullPod?.sport_emoji || "🏀"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                  fontFamily: "Georgia,serif" }}>My Season Schedule</div>
                <div style={{ fontSize: 10, color: T.mist }}>{fullPod?.name} · {fullPod?.team_name}</div>
              </div>
            </div>
            {games
              .filter(g => g.assignments?.[0]?.user_id === currentUserId)
              .filter(g => { const [y, m, d] = (g.game_date || "").split("-").map(Number); return new Date(y, m-1, d) >= today; })
              .slice(0, 5)
              .map((g, i) => (
                <div key={g.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: i < 4 ? "1px solid #1A4A2E" : "none",
                }}>
                  <div style={{ fontSize: 12, color: T.white, fontWeight: 600 }}>
                    vs. {g.opponent}
                  </div>
                  <div style={{ fontSize: 10, color: T.mist }}>
                    {fmtDate(g.game_date)} · {fmtTime(g.game_time)}
                  </div>
                </div>
              ))}
            {myGameCount > 5 && (
              <div style={{ fontSize: 10, color: T.mist, paddingTop: 6 }}>
                +{myGameCount - 5} more games
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 9, color: T.lime, letterSpacing: 1 }}>
              HALFTIME · Season Ticket Pod
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                const lines = [
                  `🏀 My ${fullPod?.team_name || "Season"} Schedule — ${fullPod?.name}`,
                  ...games
                    .filter(g => g.assignments?.[0]?.user_id === currentUserId)
                    .filter(g => { const [y, m, d] = (g.game_date || "").split("-").map(Number); return new Date(y, m-1, d) >= today; })
                    .map(g => `• vs. ${g.opponent} — ${fmtDate(g.game_date)} ${fmtTime(g.game_time)}`),
                  `\nManaged via HalfTime (halftime-app.com)`,
                ];
                if (navigator.share) {
                  navigator.share({ title: "My Season Schedule", text: lines.join("\n") });
                } else {
                  navigator.clipboard.writeText(lines.join("\n"));
                  alert("Schedule copied to clipboard!");
                }
              }}
              style={{ flex: 2, padding: "12px", background: T.lime, border: "none",
                borderRadius: 10, color: T.dark, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ↗ Share Schedule
            </button>
            <button onClick={() => setShowShareCard(false)}
              style={{ flex: 1, padding: "12px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Incoming trades panel ── */}
    {showIncoming && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
        zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={e => { if (e.target === e.currentTarget) setShowIncoming(false); }}>
        <div style={{ width: "100%", maxWidth: 430, background: T.dark,
          borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
          borderBottom: "none", padding: "20px 20px 40px",
          maxHeight: "80vh", overflowY: "auto" }}
          onClick={e => e.stopPropagation()}>

          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 18px" }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 16 }}>Incoming Trade Offers</div>

          {incomingTrades.map(t => (
            <div key={t.id} style={{ background: T.forest, borderRadius: 12,
              padding: "14px", marginBottom: 12,
              border: `1px solid ${T.amber}44` }}>
              <div style={{ fontSize: 12, color: T.amber, fontWeight: 700, marginBottom: 8 }}>
                {t.from_profile?.display_name || "Pod member"} wants to swap
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center",
                marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
                  borderRadius: 8, padding: "6px 10px", fontSize: 11, color: T.lime }}>
                  Their: vs. {t.from_game?.opponent} ({fmtDate(t.from_game?.game_date)})
                </div>
                <span style={{ color: T.mist, fontSize: 14 }}>↔</span>
                <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
                  borderRadius: 8, padding: "6px 10px", fontSize: 11, color: T.teal }}>
                  Your: vs. {t.to_game?.opponent} ({fmtDate(t.to_game?.game_date)})
                </div>
              </div>
              {t.message && (
                <div style={{ fontSize: 11, color: T.mist, fontStyle: "italic",
                  marginBottom: 10 }}>"{t.message}"</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { handleReject(t.id); setShowIncoming(false); }}
                  disabled={tradeBusy}
                  style={{ flex: 1, padding: "9px", background: "transparent",
                    border: `1px solid ${T.red}44`, borderRadius: 8,
                    color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Decline
                </button>
                <button onClick={() => { handleAccept(t.id); setShowIncoming(false); }}
                  disabled={tradeBusy}
                  style={{ flex: 2, padding: "9px", background: T.teal, border: "none",
                    borderRadius: 8, color: T.dark, fontSize: 12,
                    fontWeight: 700, cursor: "pointer" }}>
                  {tradeBusy ? "…" : "Accept Trade ✓"}
                </button>
              </div>
            </div>
          ))}

          <button onClick={() => setShowIncoming(false)}
            style={{ width: "100%", padding: "12px", background: "transparent",
              border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
              fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
            Close
          </button>
        </div>
      </div>
    )}
    </>
  );
}
