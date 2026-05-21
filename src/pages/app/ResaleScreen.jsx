import { useState } from "react";
import { T } from "../../tokens";
import Badge from "../../components/Badge";
import Card from "../../components/Card";

export default function ResaleScreen({ state, dispatch }) {
  const [price, setPrice] = useState(200);

  const myGames = state.allocationDone
    ? Object.entries(state.assignments)
        .filter(([, mid]) => mid === "m1")
        .map(([gid]) => state.games.find(g => g.id === Number(gid)))
        .filter(Boolean)
    : [];

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: T.dark, padding: "20px 16px 14px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Resale ♻️</div>
        <div style={{ fontSize: 12, color: T.mist }}>List unused games · Profits shared with your pod</div>
      </div>

      <div style={{ padding: 14 }}>
        {myGames.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎟️</div>
            <div style={{ fontSize: 13, color: T.mist }}>
              Run allocation first to see your games here.
            </div>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
              style={{ marginTop: 12, padding: "9px 20px", background: T.lime,
                color: T.dark, border: "none", borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Go to Allocation →
            </button>
          </Card>
        ) : (
          myGames.map(game => {
            const isListed = state.resaleListing?.gameId === game.id;
            const isSold = state.resaleSold[game.id];
            const faceVal = game.val;
            const netShare = Math.round(price * 0.25 * 0.92);

            return (
              <Card key={game.id} style={{ marginBottom: 12 }} glow={isListed}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                      fontFamily: "Georgia,serif" }}>{game.sport} vs. {game.opp}</div>
                    <div style={{ fontSize: 10, color: T.mist }}>{game.date} · {game.time}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                      fontFamily: "Georgia,serif" }}>${faceVal} face</div>
                    {isSold && <Badge color={T.teal}>Sold ${isSold.price}</Badge>}
                    {isListed && !isSold && (
                      <Badge color={T.amber}>Listed ${state.resaleListing.askPrice}</Badge>
                    )}
                  </div>
                </div>

                {!isSold && !isListed && (
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: T.mist }}>Ask price:</span>
                      <input type="range"
                        min={Math.round(faceVal * 0.5)} max={Math.round(faceVal * 2)}
                        value={price} onChange={e => setPrice(Number(e.target.value))}
                        style={{ flex: 1, accentColor: T.lime }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                        fontFamily: "Georgia,serif", minWidth: 40 }}>${price}</span>
                    </div>
                    <div style={{ background: "#1A4A2E", borderRadius: 8,
                      padding: "8px 10px", marginBottom: 10, fontSize: 11, color: T.mist }}>
                      Platform fee: 8% (${Math.round(price * 0.08)}) · Your share (25%):
                      <strong style={{ color: T.lime }}> ${netShare}</strong>
                    </div>
                    <button
                      onClick={() => dispatch({ type: "LIST_RESALE", gameId: game.id, price })}
                      style={{ width: "100%", padding: "9px", background: T.lime, color: T.dark,
                        border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      List for ${price}
                    </button>
                  </div>
                )}

                {isListed && !isSold && (
                  <div>
                    <div style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`,
                      borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: T.amber }}>
                        🔴 Live listing · ${state.resaleListing.askPrice} · Matching buyers…
                      </div>
                    </div>
                    <button
                      onClick={() => dispatch({
                        type: "COMPLETE_RESALE",
                        gameId: game.id,
                        price: state.resaleListing.askPrice,
                      })}
                      style={{ width: "100%", padding: "9px", background: T.teal, color: T.dark,
                        border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Simulate Sale ✓
                    </button>
                  </div>
                )}

                {isSold && (
                  <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
                    borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: T.teal }}>
                      ✓ Sold for ${isSold.price} · Your cut:
                      +${Math.round(isSold.price * 0.25 * 0.92)} deposited
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
