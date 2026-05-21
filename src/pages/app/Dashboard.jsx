import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import Wordmark from "../../components/Wordmark";

export default function Dashboard({ state, dispatch, profile }) {
  // Use real profile name when available, fall back to demo "Jordan"
  const firstName = profile?.display_name?.split(" ")[0] || "Jordan";
  const avatarInitials = profile?.avatar_initials || "YO";
  const isVerified = profile?.verified ?? true;

  const myGames = Object.entries(state.assignments)
    .filter(([, mid]) => mid === "m1")
    .map(([gid]) => state.games.find(g => g.id === Number(gid)))
    .filter(Boolean);
  const nextGame = myGames[0];
  const unread = state.notifications.filter(n => !n.read).length;
  const escrowPct = Math.round((state.escrowBalance / state.escrowRequired) * 100);

  return (
    <div style={{ padding: "0 0 80px" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 20px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 16 }}>
          <Wordmark size={22} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              onClick={() => dispatch({ type: "MARK_NOTIFS_READ" })}
              style={{ position: "relative", width: 36, height: 36, borderRadius: "50%",
                background: "#1A4A2E", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16, cursor: "pointer" }}>
              🔔
              {unread > 0 && (
                <div style={{ position: "absolute", top: 0, right: 0, width: 14, height: 14,
                  borderRadius: "50%", background: T.red, fontSize: 8, color: T.white,
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                  {unread}
                </div>
              )}
            </div>
            <Avatar initials={avatarInitials} size={36} verified={isVerified} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.mist, letterSpacing: 2, marginBottom: 4 }}>WELCOME BACK</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif", marginBottom: 16 }}>
          Hey, {firstName} 👋
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { i: "🏟️", v: "1 Pod",  s: "Section 114" },
            { i: "🎟️", v: `${myGames.length} Games`, s: "this season" },
            { i: "💰", v: "$1,240", s: "saved vs. solo" },
          ].map(({ i, v, s }) => (
            <div key={v} style={{ background: "#ffffff08", borderRadius: 10, padding: "10px 8px",
              textAlign: "center", border: "1px solid #1A4A2E" }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{i}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>{v}</div>
              <div style={{ fontSize: 9, color: T.mist }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 14px 0" }}>
        {/* Next game */}
        {nextGame ? (
          <div
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "schedule" })}
            style={{ background: `linear-gradient(135deg,${T.lime}18,${T.teal}0a)`,
              border: `1px solid ${T.lime}44`, borderRadius: 14, padding: "14px 16px",
              marginBottom: 14, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: T.lime, fontWeight: 700,
                letterSpacing: 1.5, marginBottom: 4 }}>YOUR NEXT GAME</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif" }}>{nextGame.sport} Bulls vs. {nextGame.opp}</div>
              <div style={{ fontSize: 11, color: T.mist, marginTop: 3 }}>
                {nextGame.date} · {nextGame.time} · Sec 114 Row 8
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>→</div>
          </div>
        ) : (
          <Card style={{ marginBottom: 14, textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 13, color: T.mist }}>Run allocation to get your games assigned</div>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
              style={{ marginTop: 10, padding: "8px 20px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Run Allocation →
            </button>
          </Card>
        )}

        {/* Pod card */}
        <Card onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 32 }}>🏀</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif" }}>Section 114 Squad</div>
                <div style={{ fontSize: 11, color: T.mist }}>Chicago Bulls · {state.members.length}/6 members</div>
              </div>
            </div>
            <Badge color={T.lime}>Active</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { l: "My Share", v: "25%" },
              { l: "My Cost",  v: "$1,850" },
              { l: "My Games", v: `${myGames.length}/12` },
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
              <span style={{ fontSize: 10, color: T.lime, fontWeight: 700 }}>{escrowPct}%</span>
            </div>
            <Bar value={state.escrowBalance} max={state.escrowRequired} h={5} />
          </div>
          {state.members.some(m => !m.escrowFunded) && (
            <div style={{ fontSize: 10, color: T.amber, marginTop: 6 }}>
              ⚠ {state.members.filter(m => !m.escrowFunded).length} members haven't funded yet
            </div>
          )}
        </Card>

        {/* Allocation status */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 8 }}>🤖 Allocation Engine</div>
          {state.allocationDone ? (
            <div>
              <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
                borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: T.lime }}>
                  ✓ Season allocation complete · Method: <strong>{state.allocationMethod}</strong>
                </div>
              </div>
              {state.members.map(m => {
                const count = Object.values(state.assignments).filter(id => id === m.id).length;
                const fair = (m.share / 100) * state.games.length;
                return (
                  <div key={m.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: m.id === "m1" ? T.lime : T.white }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: T.mist }}>{count} games (fair: {fair})</span>
                    </div>
                    <Bar value={count} max={state.games.length} color={m.color} h={4} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 12, color: T.mist, marginBottom: 10 }}>
                Season allocation hasn't run yet
              </div>
              <button
                onClick={() => dispatch({ type: "SET_SCREEN", screen: "allocate" })}
                style={{ padding: "9px 20px", background: T.lime, color: T.dark,
                  border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Run Allocation →
              </button>
            </div>
          )}
        </Card>

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "📅 Schedule",      screen: "schedule" },
            { label: "💎 Bid on Games",  screen: "schedule" },
            { label: "♻️ Resale",        screen: "resale" },
            { label: "👤 Profile",       screen: "profile" },
          ].map(({ label, screen }) => (
            <div
              key={label}
              onClick={() => dispatch({ type: "SET_SCREEN", screen })}
              style={{ background: T.forest, border: "1px solid #1A4A2E", borderRadius: 12,
                padding: "12px 10px", textAlign: "center", cursor: "pointer",
                fontSize: 12, fontWeight: 700, color: T.chalk, fontFamily: "Calibri,sans-serif" }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
