import { useState } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Bar from "../../components/Bar";
import Pill from "../../components/Pill";

const METHOD_INFO = {
  snake:   { icon: "🐍", name: "Snake Draft",    desc: "Reverse-order picks each round. Fairest over a full season." },
  lottery: { icon: "🎲", name: "Random Lottery", desc: "Weighted by ownership %. Pure chance — great for casual pods." },
  ai:      { icon: "🤖", name: "AI Fairness",    desc: "ML model balances quality, recency, preferences & conflicts." },
};

export default function AllocationScreen({ state, dispatch }) {
  const [running, setRunning] = useState(false);

  const runIt = () => {
    setRunning(true);
    setTimeout(() => {
      dispatch({ type: "RUN_ALLOCATION", method: state.allocationMethod });
      setRunning(false);
    }, 1800);
  };

  const myGames = Object.entries(state.assignments)
    .filter(([, mid]) => mid === "m1")
    .map(([gid]) => state.games.find(g => g.id === Number(gid)))
    .filter(Boolean);

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: T.dark, padding: "20px 16px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Allocation Engine ⚡</div>
        <div style={{ fontSize: 12, color: T.mist }}>
          Distribute {state.games.length} games across {state.members.length} pod members
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {/* Method picker */}
        <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 10 }}>Choose Allocation Method</div>

        {Object.entries(METHOD_INFO).map(([key, { icon, name, desc }]) => (
          <div
            key={key}
            onClick={() => !state.allocationDone && dispatch({ type: "SET_METHOD", method: key })}
            style={{
              background: state.allocationMethod === key ? `${T.lime}18` : T.forest,
              border: `1px solid ${state.allocationMethod === key ? T.lime + "55" : "#1A4A2E"}`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 8,
              cursor: state.allocationDone ? "default" : "pointer",
              display: "flex", gap: 12, alignItems: "center",
            }}>
            <div style={{ fontSize: 28 }}>{icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700,
                color: state.allocationMethod === key ? T.lime : T.white }}>{name}</div>
              <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>{desc}</div>
            </div>
            {state.allocationMethod === key && <div style={{ color: T.lime, fontSize: 18 }}>✓</div>}
          </div>
        ))}

        {/* Run button */}
        {!state.allocationDone && (
          <button
            onClick={runIt}
            disabled={running}
            style={{
              width: "100%", padding: "14px",
              background: running ? "#1A4A2E" : T.lime,
              color: T.dark, border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 700, fontFamily: "Georgia,serif",
              cursor: running ? "not-allowed" : "pointer",
              marginTop: 8, marginBottom: 16,
            }}>
            {running ? "🤖 Running allocation…" : `Run ${METHOD_INFO[state.allocationMethod].name} →`}
          </button>
        )}

        {/* Results */}
        {state.allocationDone && (
          <div>
            <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: T.lime, fontWeight: 700, marginBottom: 4 }}>
                ✓ Allocation complete — {METHOD_INFO[state.allocationMethod].name}
              </div>
              <div style={{ fontSize: 11, color: T.mist }}>
                {myGames.length} games assigned to you · All results logged on-chain
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 10 }}>Results Summary</div>
            {state.members.map(m => {
              const count = Object.values(state.assignments).filter(id => id === m.id).length;
              const fair = (m.share / 100) * state.games.length;
              const diff = count - fair;
              return (
                <div key={m.id} style={{ background: T.forest, borderRadius: 10,
                  padding: "10px 12px", marginBottom: 8,
                  border: `1px solid ${m.id === "m1" ? T.lime + "44" : "#1A4A2E"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Avatar initials={m.initials} size={28} color={m.color} verified={m.verified} />
                      <span style={{ fontSize: 12, color: m.id === "m1" ? T.lime : T.white,
                        fontWeight: 700 }}>{m.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                        fontFamily: "Georgia,serif" }}>{count}</span>
                      <span style={{ fontSize: 10, color: T.mist }}>games</span>
                      <span style={{ fontSize: 10, color: Math.abs(diff) <= 0.5 ? T.teal : T.amber }}>
                        ({diff >= 0 ? "+" : ""}{diff.toFixed(1)} vs fair)
                      </span>
                    </div>
                  </div>
                  <Bar value={count} max={state.games.length} color={m.color} h={4} />
                </div>
              );
            })}

            <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 10, marginTop: 14 }}>
              Your {myGames.length} Games
            </div>
            {myGames.map(g => (
              <div key={g.id} style={{ background: T.forest, borderRadius: 10,
                padding: "10px 12px", marginBottom: 6,
                border: `1px solid ${T.lime}33`,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
                    {g.sport} vs. {g.opp}
                  </div>
                  <div style={{ fontSize: 10, color: T.mist }}>{g.date} · {g.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                    fontFamily: "Georgia,serif" }}>${g.val}</div>
                  <Pill label={g.tier}
                    color={g.tier === "marquee" ? T.lime : g.tier === "premium" ? T.teal : T.mist} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
