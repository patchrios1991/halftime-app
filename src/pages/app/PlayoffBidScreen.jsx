// ─── PlayoffBidScreen ─────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import { SkeletonCard } from "../../components/Skeleton";
import { useActivePod } from "../../context/ActivePodContext";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { getBiddableGames, placeBid, resolveAuction } from "../../api/bids";
import { friendlyError } from "../../lib/friendlyError";

const TIER_COLOR = { marquee: T.amber, playoff: "#EF4444" };
const TIER_LABEL = { marquee: "Marquee", playoff: "Playoff" };

export default function PlayoffBidScreen({ dispatch }) {
  const { activePodId, pods } = useActivePod();
  const activePod = pods.find(p => p.id === activePodId) ?? pods[0];
  const podId = activePod?.id;

  const [userId,   setUserId]   = useState(null);
  const [games,    setGames]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [myCredits, setMyCredits] = useState(0);

  // Per-game state
  const [bidInputs,      setBidInputs]      = useState({});  // gameId → string
  const [bidBusy,        setBidBusy]        = useState({});  // gameId → bool
  const [bidErrors,      setBidErrors]      = useState({});  // gameId → string | null
  const [resolveBusy,    setResolveBusy]    = useState({});  // gameId → bool
  const [resolveResults, setResolveResults] = useState({});  // gameId → { winnerId, credits }

  const isCaptain = !!(activePod?.captain_id && activePod.captain_id === userId);

  // Fetch current user ID once
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!podId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getBiddableGames(podId);
      setGames(data);

      // Refresh my credit balance
      if (userId) {
        const { data: member } = await supabase
          .from("pod_members")
          .select("bid_credits")
          .eq("pod_id", podId)
          .eq("user_id", userId)
          .single();
        setMyCredits(member?.bid_credits ?? 0);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [podId, userId]);

  useEffect(() => { load(); }, [load]);

  // Real-time: refresh whenever any bid changes in this pod
  useEffect(() => {
    if (!podId || !isSupabaseConfigured) return;
    const ch = supabase
      .channel(`bids_pod_${podId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `pod_id=eq.${podId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [podId, load]);

  async function handlePlaceBid(game) {
    const raw     = bidInputs[game.id] ?? "";
    const credits = parseInt(raw, 10);
    if (!credits || credits < 1) {
      setBidErrors(e => ({ ...e, [game.id]: "Enter a whole number ≥ 1" }));
      return;
    }
    if (credits > myCredits) {
      setBidErrors(e => ({ ...e, [game.id]: `You only have ${myCredits} credits` }));
      return;
    }
    setBidErrors(e => ({ ...e, [game.id]: null }));
    setBidBusy(b => ({ ...b, [game.id]: true }));
    try {
      await placeBid(game.id, podId, credits);
      setBidInputs(b => ({ ...b, [game.id]: "" }));
      await load();
    } catch (e) {
      setBidErrors(er => ({ ...er, [game.id]: friendlyError(e) }));
    } finally {
      setBidBusy(b => ({ ...b, [game.id]: false }));
    }
  }

  async function handleResolve(game) {
    setResolveBusy(b => ({ ...b, [game.id]: true }));
    setBidErrors(e => ({ ...e, [game.id]: null }));
    try {
      const result = await resolveAuction(game.id, podId);
      setResolveResults(r => ({ ...r, [game.id]: result }));
      await load();
    } catch (e) {
      setBidErrors(er => ({ ...er, [game.id]: friendlyError(e) }));
    } finally {
      setResolveBusy(b => ({ ...b, [game.id]: false }));
    }
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 16px",
        borderBottom: "1px solid #1A4A2E",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })}
            style={{
              color: T.mist, fontSize: 22, cursor: "pointer", lineHeight: 1,
              padding: "4px 8px 4px 0", minWidth: 44, minHeight: 44,
              display: "flex", alignItems: "center",
            }}
          >‹</div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
              🏆 Playoff Bid Auction
            </div>
            {activePod && (
              <div style={{ fontSize: 10, color: T.mist, marginTop: 1 }}>
                {activePod.name}
              </div>
            )}
          </div>

          {/* Bid credit balance */}
          <div style={{
            textAlign: "center", background: `${T.lime}12`,
            border: `1px solid ${T.lime}33`, borderRadius: 10, padding: "6px 12px",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>
              {myCredits}
            </div>
            <div style={{ fontSize: 8, color: T.mist, letterSpacing: 0.8 }}>CREDITS</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {/* How it works callout */}
        <div style={{
          background: `${T.lime}08`, border: `1px solid ${T.lime}20`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: T.lime, fontWeight: 700, marginBottom: 4 }}>
            💡 How it works
          </div>
          <div style={{ fontSize: 10, color: T.mist, lineHeight: 1.7 }}>
            Members start with <strong style={{ color: T.chalk }}>100 credits</strong>.
            For marquee &amp; playoff games, bid credits to compete for the seat.
            The highest bid wins — losers keep their credits. Captain resolves the auction.
          </div>
        </div>

        {/* Global error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
            borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13, marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : !podId ? (
          /* No pod */
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 38, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontSize: 14, color: T.mist }}>Join a pod to access bid auctions.</div>
          </div>
        ) : games.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 42, marginBottom: 14 }}>🏆</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 8 }}>
              No auction games yet
            </div>
            <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6,
              maxWidth: 260, margin: "0 auto" }}>
              {isCaptain
                ? "Add marquee or playoff games to your schedule to enable bid auctions."
                : "Your captain hasn't set up any marquee or playoff games yet. Check back once the schedule is loaded."}
            </div>
          </div>
        ) : (
          /* Game cards */
          games.map(game => {
            const allBids    = game.bids ?? [];
            const activeBids = allBids
              .filter(b => b.status === "active")
              .sort((a, b) => b.credits - a.credits);
            const myBid      = allBids.find(b => b.user_id === userId && b.status === "active");
            const wonBid     = allBids.find(b => b.status === "won");
            const isResolved = !!wonBid || (game.assignments?.[0]?.user_id ?? null) !== null;
            const assignment = game.assignments?.[0];

            return (
              <Card key={game.id} style={{ marginBottom: 14 }}>
                {/* Game info row */}
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                      fontFamily: "Georgia,serif" }}>
                      {game.sport_emoji} vs {game.opponent}
                    </div>
                    <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                      {new Date(game.game_date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                      {game.game_time ? ` · ${game.game_time.slice(0, 5)}` : ""}
                    </div>
                  </div>
                  <Badge color={TIER_COLOR[game.tier] ?? T.amber}>
                    {TIER_LABEL[game.tier] ?? game.tier}
                  </Badge>
                </div>

                {/* Resolved state banner */}
                {isResolved && (
                  <div style={{
                    background: `${T.teal}10`, border: `1px solid ${T.teal}30`,
                    borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 12, color: T.teal, fontWeight: 700, marginBottom: 2 }}>
                      ✅ Auction resolved
                    </div>
                    <div style={{ fontSize: 11, color: T.mist }}>
                      {wonBid?.user_id === userId
                        ? `🎉 You won with ${wonBid.credits} credits!`
                        : wonBid
                          ? `Another member won · ${wonBid.credits} credits`
                          : assignment?.user_id === userId
                            ? "🎉 This game is assigned to you"
                            : "Assigned to another member"}
                    </div>
                  </div>
                )}

                {/* Active bids leaderboard */}
                {activeBids.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      fontSize: 9, color: T.mist, fontWeight: 700,
                      letterSpacing: 1.1, marginBottom: 8,
                    }}>
                      CURRENT BIDS
                    </div>
                    {activeBids.map((bid, i) => {
                      const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
                      const isMe  = bid.user_id === userId;
                      return (
                        <div key={bid.id} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "7px 0",
                          borderBottom: i < activeBids.length - 1 ? "1px solid #1A4A2E" : "none",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{medal}</span>
                            <span style={{
                              fontSize: 12,
                              color: isMe ? T.lime : T.chalk,
                              fontWeight: isMe ? 700 : 400,
                            }}>
                              {isMe ? "You" : "Member"}
                            </span>
                            {i === 0 && (
                              <span style={{ fontSize: 9, color: T.lime, fontWeight: 700,
                                background: `${T.lime}15`, borderRadius: 4, padding: "1px 5px" }}>
                                WINNING
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 14, fontWeight: 700, fontFamily: "Georgia,serif",
                            color: i === 0 ? T.lime : T.mist,
                          }}>
                            {bid.credits} cr
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isResolved && activeBids.length === 0 && (
                  <div style={{ fontSize: 11, color: T.mist, marginBottom: 10, fontStyle: "italic" }}>
                    No bids yet — be the first to bid!
                  </div>
                )}

                {/* Bid input (only if not resolved) */}
                {!isResolved && (
                  <div>
                    {bidErrors[game.id] && (
                      <div style={{ fontSize: 11, color: T.red, marginBottom: 6 }}>
                        {bidErrors[game.id]}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {/* Credits input */}
                      <div style={{
                        flex: 1, display: "flex", alignItems: "center",
                        background: T.forest, border: `1px solid #1A4A2E`,
                        borderRadius: 8, padding: "8px 12px",
                      }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max={myCredits}
                          value={bidInputs[game.id] ?? ""}
                          onChange={e => {
                            setBidInputs(b => ({ ...b, [game.id]: e.target.value }));
                            setBidErrors(er => ({ ...er, [game.id]: null }));
                          }}
                          placeholder={
                            myBid
                              ? `Current: ${myBid.credits} — enter new amount`
                              : `1 – ${myCredits} credits`
                          }
                          style={{
                            flex: 1, background: "transparent", border: "none",
                            color: T.white, fontSize: 13, outline: "none",
                            fontFamily: "Georgia,serif", fontWeight: 700, minWidth: 0,
                          }}
                        />
                        <span style={{ fontSize: 10, color: T.mist, flexShrink: 0, marginLeft: 4 }}>cr</span>
                      </div>

                      {/* Place bid button */}
                      <button
                        onClick={() => handlePlaceBid(game)}
                        disabled={bidBusy[game.id] || myCredits === 0}
                        style={{
                          padding: "8px 16px", flexShrink: 0,
                          background: myCredits === 0 ? "transparent" : T.lime,
                          border: myCredits === 0 ? `1px solid ${T.mist}33` : "none",
                          borderRadius: 8,
                          color: myCredits === 0 ? T.mist : T.dark,
                          fontSize: 12, fontWeight: 700,
                          cursor: (bidBusy[game.id] || myCredits === 0) ? "not-allowed" : "pointer",
                          opacity: bidBusy[game.id] ? 0.6 : 1,
                        }}
                      >
                        {bidBusy[game.id] ? "…" : myBid ? "Update" : "Bid →"}
                      </button>
                    </div>

                    {myBid && (
                      <div style={{ fontSize: 10, color: T.mist, marginBottom: 8 }}>
                        Your current bid: <strong style={{ color: T.lime }}>{myBid.credits} credits</strong> ·
                        Enter a new amount to update it
                      </div>
                    )}

                    {/* Captain resolve button */}
                    {isCaptain && activeBids.length > 0 && (
                      <button
                        onClick={() => handleResolve(game)}
                        disabled={resolveBusy[game.id]}
                        style={{
                          width: "100%", padding: "10px",
                          background: "transparent",
                          border: `1px solid ${T.amber}55`,
                          borderRadius: 8, color: T.amber,
                          fontSize: 12, fontWeight: 700,
                          cursor: resolveBusy[game.id] ? "not-allowed" : "pointer",
                          opacity: resolveBusy[game.id] ? 0.6 : 1,
                        }}
                      >
                        {resolveBusy[game.id] ? "Resolving…" : "⚡ Resolve Auction (Captain)"}
                      </button>
                    )}
                  </div>
                )}

                {/* Face value footnote */}
                <div style={{ fontSize: 9, color: T.mist, marginTop: 10 }}>
                  Face value: ${parseFloat(game.face_value || 0).toLocaleString()}
                  {game.seat_info ? ` · ${game.seat_info}` : ""}
                </div>
              </Card>
            );
          })
        )}

        {/* Tip for captain if no games but has pod */}
        {!loading && games.length === 0 && isCaptain && podId && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
              style={{
                padding: "12px 24px", background: "transparent",
                border: `1px solid ${T.lime}44`, borderRadius: 10,
                color: T.lime, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Go to Schedule → Add Playoff Games
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
