import { useState } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import Pill from "../../components/Pill";

export default function ScheduleScreen({ state, dispatch }) {
  const [bidAmt, setBidAmt] = useState(50);
  const bidGame = state.games.find(g => g.tier === "marquee" && !state.assignments[g.id]);

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: T.dark, padding: "20px 16px 14px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Schedule 🎟️</div>
        <div style={{ fontSize: 12, color: T.mist }}>All games · Section 114 Squad · 2025–26</div>
      </div>

      <div style={{ padding: 14 }}>
        {/* Live bid banner */}
        {bidGame && (
          <div style={{ background: `${T.lime}14`, border: `1px solid ${T.lime}44`,
            borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.lime,
              letterSpacing: 1.5, marginBottom: 6 }}>🔥 LIVE BIDDING · ENDS IN 18:32:45</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 3 }}>
              {bidGame.sport} Bulls vs. {bidGame.opp}
            </div>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 12 }}>
              {bidGame.date} · {bidGame.time} · Face: ${bidGame.val}
            </div>

            {state.activeBid === bidGame.id ? (
              <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: T.lime, fontWeight: 700 }}>
                  ✓ Bid of {state.myBid} pts placed! You're currently leading.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: T.mist }}>
                    Your credits: <strong style={{ color: T.lime }}>{state.members[0].credits} pts</strong>
                  </span>
                  <span style={{ fontSize: 11, color: T.mist }}>
                    Min bid: <strong style={{ color: T.white }}>10 pts</strong>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="range" min={10} max={state.members[0].credits} value={bidAmt}
                    onChange={e => setBidAmt(Number(e.target.value))}
                    style={{ flex: 1, accentColor: T.lime }} />
                  <span style={{ minWidth: 50, textAlign: "center", fontSize: 16,
                    fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>{bidAmt}</span>
                  <button
                    onClick={() => dispatch({ type: "PLACE_BID", gameId: bidGame.id, amount: bidAmt })}
                    style={{ padding: "8px 14px", background: T.lime, color: T.dark,
                      border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    Bid →
                  </button>
                </div>
                <button
                  onClick={() => dispatch({ type: "RESOLVE_BID", gameId: bidGame.id })}
                  style={{ width: "100%", marginTop: 8, padding: "7px", background: "transparent",
                    border: "1px solid #1A4A2E", color: T.mist, borderRadius: 8,
                    fontSize: 11, cursor: "pointer" }}>
                  Resolve Bid (simulate end)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Game list */}
        {state.games.map(game => {
          const assignedTo = state.assignments[game.id];
          const member = state.members.find(m => m.id === assignedTo);
          const isMine = assignedTo === "m1";
          const isResold = state.resaleSold[game.id];

          return (
            <div key={game.id} style={{ background: T.forest, borderRadius: 12,
              padding: "12px 14px", marginBottom: 8,
              border: `1px solid ${isMine ? T.lime + "44" : "#1A4A2E"}`,
              opacity: isResold ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                    fontFamily: "Georgia,serif" }}>{game.sport} vs. {game.opp}</div>
                  <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                    {game.day}, {game.date} · {game.time}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                    fontFamily: "Georgia,serif" }}>${game.val}</div>
                  <Pill label={game.tier}
                    color={game.tier === "marquee" ? T.lime : game.tier === "premium" ? T.teal : T.mist} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {assignedTo ? (
                  isMine
                    ? <Badge color={T.lime}>✓ Yours</Badge>
                    : <Badge color={T.mist}>→ {member?.name || "TBD"}</Badge>
                ) : <Badge color={T.amber}>🔥 Unassigned</Badge>}
                {isResold && <Badge color={T.mist}>Resold ${state.resaleSold[game.id].price}</Badge>}
                {isMine && !isResold && (
                  <div
                    onClick={() => dispatch({ type: "SET_SCREEN", screen: "resale" })}
                    style={{ marginLeft: "auto", fontSize: 10, color: T.lime, cursor: "pointer" }}>
                    Can't go? Resell →
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
