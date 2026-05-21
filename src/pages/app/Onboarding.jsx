import { T } from "../../tokens";
import Card from "../../components/Card";
import Bar from "../../components/Bar";
import Wordmark from "../../components/Wordmark";

const STEPS = [
  {
    icon: "🏟️",
    title: "Welcome to HalfTime",
    sub: "Own half. Play every game.",
    body: "HalfTime lets you co-own professional sports season tickets with a verified group of fans — called a pod. Buy a fraction of the cost, and our AI engine allocates games fairly.",
    cta: "Get Started",
  },
  {
    icon: "🪪",
    title: "Verify Your Identity",
    sub: "Secure · Verified · Protected",
    body: "Every pod member completes a government ID + biometric liveness check. This protects everyone in the pod and ensures full compliance with team policies.",
    cta: "I'm Verified ✓",
    isKYC: true,
  },
  {
    icon: "🏦",
    title: "Fund Your Escrow",
    sub: "FDIC-insured · Stripe Treasury",
    body: "Your fractional cost is auto-calculated. Funds are held in secure escrow until each game day — you're never at risk. Full refund if a game is cancelled.",
    cta: "Fund Escrow ($1,850)",
    isEscrow: true,
  },
  {
    icon: "🏀",
    title: "Choose Your Pod",
    sub: "Section 114 · Chicago Bulls",
    body: "You're joining a 4-member pod co-owning Row 8 of Section 114 at the United Center. Your stake: 25% ownership ≈ 11 games this season.",
    cta: "Join Section 114 Squad →",
    complete: true,
  },
];

export default function Onboarding({ state, dispatch }) {
  const step = STEPS[state.onboardingStep];

  return (
    <div style={{ minHeight: "100vh", background: T.dark, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Wordmark size={28} />
      <div style={{ marginTop: 40, width: "100%", maxWidth: 360 }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === state.onboardingStep ? 24 : 8, height: 8, borderRadius: 4,
              background: i <= state.onboardingStep ? T.lime : "#1A4A2E",
              transition: "all .3s",
            }} />
          ))}
        </div>

        <Card style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{step.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 6 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: T.lime, fontFamily: "Calibri,sans-serif",
            fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>{step.sub}</div>
          <div style={{ fontSize: 13, color: T.mist, fontFamily: "Calibri,sans-serif",
            lineHeight: 1.6, marginBottom: 24 }}>{step.body}</div>

          {step.isKYC && (
            <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}33`,
              borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: T.lime, fontFamily: "Calibri,sans-serif" }}>
                ✓ ID uploaded · ✓ Liveness check passed · ✓ AML clear
              </div>
            </div>
          )}

          {step.isEscrow && (
            <div style={{ background: "#1A4A2E", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.mist }}>Your share (25%)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                  fontFamily: "Georgia,serif" }}>$1,850</span>
              </div>
              <Bar value={0} max={1850} h={6} />
              <div style={{ fontSize: 10, color: T.mist, marginTop: 4 }}>Ready to fund via Stripe</div>
            </div>
          )}

          <button
            onClick={() =>
              step.complete
                ? dispatch({ type: "COMPLETE_ONBOARDING" })
                : dispatch({ type: "NEXT_ONBOARDING" })
            }
            style={{
              width: "100%", padding: "13px", background: T.lime, color: T.dark,
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
              fontFamily: "Georgia,serif", cursor: "pointer",
            }}
          >
            {step.cta}
          </button>
        </Card>
      </div>
    </div>
  );
}
