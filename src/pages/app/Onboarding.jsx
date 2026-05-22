// ─── Onboarding / Get Started ─────────────────────────────────────────────────
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";

export default function Onboarding({ dispatch }) {
  return (
    <div style={{
      minHeight: "100vh", background: T.dark, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 28, fontFamily: "Calibri,sans-serif",
    }}>
      <Wordmark size={28} />

      <div style={{ marginTop: 40, textAlign: "center", maxWidth: 340 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🏟️</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 8 }}>
          Welcome to HalfTime
        </div>
        <div style={{ fontSize: 14, color: T.mist, lineHeight: 1.7, marginBottom: 40 }}>
          Co-own professional sports season tickets with a verified group of fans.
          Split the cost, split the games — the AI handles the rest.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Create a Pod */}
          <button
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "create_pod" })}
            style={{
              width: "100%", padding: "16px", background: T.lime, color: T.dark,
              border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700,
              fontFamily: "Georgia,serif", cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <div>🏆 Create a Pod</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.75 }}>
                You're the captain — set it up &amp; invite members
              </div>
            </div>
            <span style={{ fontSize: 20 }}>›</span>
          </button>

          {/* Find a Pod */}
          <button
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "browse_pods" })}
            style={{
              width: "100%", padding: "16px", background: "transparent", color: T.white,
              border: `1.5px solid ${T.green}`, borderRadius: 12, fontSize: 15, fontWeight: 700,
              fontFamily: "Georgia,serif", cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <div>🔍 Find a Pod</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: T.mist, marginTop: 2 }}>
                Browse open pods looking for members
              </div>
            </div>
            <span style={{ fontSize: 20, color: T.mist }}>›</span>
          </button>
        </div>

        <div style={{ fontSize: 11, color: T.mist, marginTop: 28, lineHeight: 1.6 }}>
          Already in a pod? Your pod will appear automatically after signing in.
        </div>
      </div>
    </div>
  );
}
