// ─── ResaleScreen ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useGames } from "../../hooks/useGames";
import { useResale } from "../../hooks/useResale";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function ResaleScreen({ state, dispatch }) {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [tab, setTab]         = useState("mine"); // "mine" | "market"
  const [prices, setPrices]   = useState({});     // gameId → ask price
  const [busy, setBusy]       = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!currentUserId && isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) =>
      session?.user?.id && setCurrentUserId(session.user.id));
  }

  const { pods }     = useMyPods();
  const activePodId  = pods?.[0]?.id ?? null;
  const { pod: fullPod } = usePod(activePodId);
  const { games }    = useGames(activePodId);
  const { listings, payouts, loading, listGame, cancel } = useResale(activePodId);

  // My assigned games
  const myGames = games.filter(g => g.assignments?.[0]?.user_id === currentUserId);

  // Find active listing for a game
  const listingForGame = (gameId) =>
    listings.find(l => l.game_id === gameId && l.status === "active");

  // Marketplace: active listings from other pod members
  const marketListings = listings.filter(
    l => l.status === "active" && l.seller_id !== currentUserId
  );

  // Total resale payouts earned
  const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
  }

  async function handleList(gameId, faceVal) {
    const askPrice = prices[gameId] ?? Math.round(faceVal);
    setBusy(true);
    setActionError(null);
    try {
      await listGame({ gameId, askPrice });
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(listingId) {
    setBusy(true);
    setActionError(null);
    try {
      await cancel(listingId);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ── No pod ──────────────────────────────────────────────────────────────────
  if (isSupabaseConfigured && !activePodId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32, minHeight: "60vh", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>♻️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 8 }}>No pod yet</div>
        <div style={{ fontSize: 12, color: T.mist, marginBottom: 20 }}>
          Join a pod to access the resale marketplace.
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
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Resale ♻️</div>
        <div style={{ fontSize: 12, color: T.mist }}>
          List unused games · Pod marketplace
          {totalPayouts > 0 && (
            <span style={{ color: T.teal }}> · +${totalPayouts.toFixed(2)} earned</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1A4A2E", background: T.dark }}>
        {[["mine", "My Tickets"], ["market", "Marketplace"]].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{
              flex: 1, padding: "12px 0", textAlign: "center", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
              color: tab === k ? T.lime : T.mist,
              borderBottom: tab === k ? `2px solid ${T.lime}` : "2px solid transparent",
            }}>
            {lbl}
            {k === "market" && marketListings.length > 0 && (
              <span style={{ marginLeft: 6, background: T.lime, color: T.dark,
                borderRadius: 10, padding: "1px 6px", fontSize: 9 }}>
                {marketListings.length}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 14 }}>
        {/* Error banner */}
        {actionError && (
          <div style={{ background: `${T.red}15`, border: `1px solid ${T.red}44`,
            borderRadius: 8, padding: "10px 12px", marginBottom: 12,
            fontSize: 12, color: T.red }}>
            {actionError}
          </div>
        )}

        {/* ── My Tickets tab ── */}
        {tab === "mine" && (
          <>
            {myGames.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 6 }}>No tickets yet</div>
                <div style={{ fontSize: 12, color: T.mist, marginBottom: 16 }}>
                  Run allocation first to get your game assignments.
                </div>
                <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
                  style={{ padding: "10px 20px", background: T.lime, color: T.dark,
                    border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Go to Allocation →
                </button>
              </div>
            ) : (
              myGames.map(game => {
                const activeListing = listingForGame(game.id);
                const faceVal       = parseFloat(game.face_value) || 0;
                const currentPrice  = prices[game.id] ?? Math.round(faceVal);
                const netShare      = Math.round(currentPrice * 0.92 * 100) / 100;

                return (
                  <div key={game.id} style={{
                    background: T.forest, borderRadius: 12, padding: "12px 14px",
                    marginBottom: 10,
                    border: `1px solid ${activeListing ? T.amber + "55" : "#1A4A2E"}`,
                  }}>
                    {/* Game info */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                          fontFamily: "Georgia,serif" }}>
                          {fullPod?.sport_emoji || "🏀"} vs. {game.opponent}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                          {fmtDate(game.game_date)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                          fontFamily: "Georgia,serif" }}>${faceVal} face</div>
                        {activeListing
                          ? <Badge color={T.amber}>Listed ${activeListing.ask_price}</Badge>
                          : <Badge color={T.lime}>✓ Yours</Badge>
                        }
                      </div>
                    </div>

                    {/* Active listing controls */}
                    {activeListing && (
                      <div style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}33`,
                        borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: T.amber, marginBottom: 8 }}>
                          🔴 Live listing · ${activeListing.ask_price} · Waiting for buyer…
                        </div>
                        <button
                          onClick={() => handleCancel(activeListing.id)}
                          disabled={busy}
                          style={{ padding: "6px 14px", background: "transparent",
                            border: `1px solid ${T.red}55`, color: T.red, borderRadius: 6,
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            opacity: busy ? 0.6 : 1 }}>
                          Cancel Listing
                        </button>
                      </div>
                    )}

                    {/* List game controls */}
                    {!activeListing && (
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: T.mist, whiteSpace: "nowrap" }}>
                            Ask price:
                          </span>
                          <input
                            type="range"
                            min={Math.max(1, Math.round(faceVal * 0.5))}
                            max={Math.round(faceVal * 2.5)}
                            value={currentPrice}
                            onChange={e => setPrices(prev => ({ ...prev, [game.id]: Number(e.target.value) }))}
                            style={{ flex: 1, accentColor: T.lime }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                            fontFamily: "Georgia,serif", minWidth: 44 }}>
                            ${currentPrice}
                          </span>
                        </div>
                        <div style={{ background: "#1A4A2E", borderRadius: 8,
                          padding: "8px 10px", marginBottom: 8, fontSize: 11, color: T.mist }}>
                          Platform fee: 8% (${Math.round(currentPrice * 0.08)}) · Net to pod:{" "}
                          <strong style={{ color: T.lime }}>${netShare}</strong>
                        </div>
                        <button
                          onClick={() => handleList(game.id, faceVal)}
                          disabled={busy}
                          style={{ width: "100%", padding: "9px", background: T.lime,
                            color: T.dark, border: "none", borderRadius: 8,
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                            opacity: busy ? 0.6 : 1 }}>
                          {busy ? "Listing…" : `List for $${currentPrice}`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Payout history */}
            {payouts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                  letterSpacing: 1, marginBottom: 8 }}>RESALE EARNINGS</div>
                {payouts.map((p, i) => (
                  <div key={p.id ?? i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "10px 0", borderBottom: "1px solid #1A4A2E",
                    fontSize: 12, color: T.chalk,
                  }}>
                    <span>vs. {p.resale_listings?.games?.opponent || "—"}</span>
                    <span style={{ color: T.teal, fontWeight: 700 }}>
                      +${p.amount?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Marketplace tab ── */}
        {tab === "market" && (
          <>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.mist }}>
                Loading marketplace…
              </div>
            ) : marketListings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 6 }}>No listings yet</div>
                <div style={{ fontSize: 12, color: T.mist }}>
                  When pod members can't make a game, their tickets appear here.
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: T.mist, marginBottom: 12 }}>
                  📣 Interested in a ticket? Message your pod group chat to arrange the transfer.
                </div>
                {marketListings.map(listing => (
                  <div key={listing.id} style={{
                    background: T.forest, borderRadius: 12, padding: "12px 14px",
                    marginBottom: 10, border: "1px solid #1A4A2E",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                          fontFamily: "Georgia,serif" }}>
                          {fullPod?.sport_emoji || "🏀"} vs.{" "}
                          {listing.games?.opponent || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                          {fmtDate(listing.games?.game_date)} · Face ${listing.games?.face_value}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 1 }}>
                          Seller: {listing.profiles?.display_name || "Pod member"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.lime,
                          fontFamily: "Georgia,serif" }}>${listing.ask_price}</div>
                        <Badge color={T.teal}>Available</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
