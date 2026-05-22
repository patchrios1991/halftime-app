import { useState } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import EscrowPaymentScreen from "./EscrowPaymentScreen";
import { useMyPods } from "../../hooks/usePod";
import { isSupabaseConfigured } from "../../lib/supabase";

export default function PodScreen({ state, dispatch }) {
  const [tab, setTab] = useState("members");
  const [showPayment, setShowPayment] = useState(false);

  // Real pod data — pod_members is filtered to current user only by getMyPods()
  const { pods, loading: podsLoading } = useMyPods();
  const realPod        = pods?.[0] ?? null;
  const activePodId    = realPod?.id ?? null;
  const podDisplayName = realPod?.name ?? "Section 114 Squad";
  const realMyMember   = realPod?.pod_members?.[0] ?? null;

  // Escrow funded status — real DB when connected, mock state otherwise
  const myEscrowFunded = isSupabaseConfigured
    ? Boolean(realMyMember?.escrow_funded)
    : Boolean(state.members.find(m => m.id === "m1")?.escrowFunded);

  // Amount — real cost from DB or fallback to mock share%
  const myAmount = parseFloat(realMyMember?.cost) || (((realMyMember?.share_pct ?? 25) / 100) * 1850);

  function handlePaymentSuccess() {
    setShowPayment(false);
    dispatch({ type: "FUND_ESCROW" });
  }

  return (
    <>
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 20px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 40 }}>🏀</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif" }}>Section 114 Squad</div>
            <div style={{ fontSize: 11, color: T.mist }}>Chicago Bulls · Season 2025–26</div>
            <div style={{ marginTop: 4 }}><Badge color={T.lime}>Active Pod</Badge></div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {[
            { l: "Members", v: `${state.members.length}/6` },
            { l: "My Share", v: "25%" },
            { l: "My Cost",  v: "$1,850" },
            { l: "Renewal",  v: "94%" },
          ].map(({ l, v }) => (
            <div key={l} style={{ background: "#ffffff08", borderRadius: 8,
              padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                fontFamily: "Georgia,serif" }}>{v}</div>
              <div style={{ fontSize: 8, color: T.mist }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: T.dark, borderBottom: "1px solid #1A4A2E" }}>
        {[["members", "👥 Members"], ["escrow", "💳 Escrow"], ["rules", "📋 Rules"]].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "11px 0", textAlign: "center", fontSize: 11, fontWeight: 700,
            color: tab === k ? T.lime : T.mist,
            borderBottom: `2px solid ${tab === k ? T.lime : "transparent"}`, cursor: "pointer",
          }}>{lbl}</div>
        ))}
      </div>

      <div style={{ padding: 14 }}>
        {/* Members tab */}
        {tab === "members" && (
          <div>
            {/* Real-data escrow status for the current user */}
            {isSupabaseConfigured && (
              <Card style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Your escrow</div>
                    <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                      ${myAmount.toFixed(2)} · {realMyMember?.share_pct ?? 25}% share
                    </div>
                  </div>
                  {myEscrowFunded
                    ? <Badge color={T.lime}>💳 Funded</Badge>
                    : (
                      <div
                        onClick={() => setShowPayment(true)}
                        style={{ background: `${T.lime}22`, color: T.lime,
                          border: `1px solid ${T.lime}44`, borderRadius: 20,
                          padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Fund →
                      </div>
                    )}
                </div>
              </Card>
            )}
            {state.members.map(m => {
              const count = Object.values(state.assignments).filter(id => id === m.id).length;
              return (
                <Card key={m.id} style={{ marginBottom: 10 }} glow={m.id === "m1"}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar initials={m.initials} size={42} color={m.color} verified={m.verified} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700,
                          color: m.id === "m1" ? T.lime : T.white,
                          fontFamily: "Georgia,serif" }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: T.mist }}>
                          {m.share}% ownership · {m.credits} bid credits
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {m.verified
                        ? <Badge color={T.teal}>✓ Verified</Badge>
                        : (
                          <div
                            onClick={() => dispatch({ type: "VERIFY_MEMBER", memberId: m.id })}
                            style={{ background: `${T.amber}22`, color: T.amber,
                              border: `1px solid ${T.amber}44`, borderRadius: 20,
                              padding: "2px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            ⚠ Verify →
                          </div>
                        )}
                      {m.escrowFunded
                        ? <Badge color={T.lime}>💳 Funded</Badge>
                        : (
                          <div style={{ background: `${T.amber}22`, color: T.amber,
                            border: `1px solid ${T.amber}44`, borderRadius: 20,
                            padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>
                            Pending
                          </div>
                        )}
                    </div>
                  </div>
                  {state.allocationDone && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: T.mist }}>Games allocated</span>
                        <span style={{ fontSize: 10, color: T.mist }}>
                          {count} / {((m.share / 100) * state.games.length).toFixed(1)} fair
                        </span>
                      </div>
                      <Bar value={count} max={state.games.length} color={m.color} h={4} />
                    </div>
                  )}
                </Card>
              );
            })}
            <div style={{ padding: "12px 0", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 8 }}>
                {6 - state.members.length} spots remaining in this pod
              </div>
              <button style={{ padding: "9px 20px", background: "transparent", color: T.lime,
                border: `1px solid ${T.lime}44`, borderRadius: 8, fontSize: 12,
                fontWeight: 700, cursor: "pointer" }}>
                + Invite a Member
              </button>
            </div>
          </div>
        )}

        {/* Escrow tab */}
        {tab === "escrow" && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 14 }}>Pod Escrow Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[
                  { l: "Total Season Cost", v: "$7,400",                          c: T.white },
                  { l: "My Share (25%)",    v: "$1,850",                          c: T.lime  },
                  { l: "Funded So Far",     v: `$${state.escrowBalance}`,         c: T.teal  },
                  { l: "Outstanding",       v: `$${state.escrowRequired - state.escrowBalance}`, c: T.amber },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ background: "#ffffff06", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: c,
                      fontFamily: "Georgia,serif" }}>{v}</div>
                  </div>
                ))}
              </div>
              <Bar value={state.escrowBalance} max={state.escrowRequired} h={8} />
              <div style={{ fontSize: 10, color: T.mist, marginTop: 5 }}>
                {Math.round((state.escrowBalance / state.escrowRequired) * 100)}% funded
                · Protected by Stripe Treasury (FDIC-insured)
              </div>
              {!myEscrowFunded && (
                <button
                  onClick={() => setShowPayment(true)}
                  style={{
                    marginTop: 14, width: "100%", padding: "13px 0",
                    background: T.lime, color: T.dark, border: "none",
                    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}
                >
                  Fund my escrow share — ${myAmount?.toFixed(2)}
                </button>
              )}
            </Card>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 12 }}>Per-Member Escrow</div>
              {state.members.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1A4A2E" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Avatar initials={m.initials} size={28} color={m.color} />
                    <span style={{ fontSize: 12, color: T.white }}>{m.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.lime,
                      fontFamily: "Georgia,serif" }}>$462.50</span>
                    {m.escrowFunded
                      ? <Badge color={T.teal}>✓ Funded</Badge>
                      : <span style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>Pending</span>}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Rules tab */}
        {tab === "rules" && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 12 }}>Pod Agreement</div>
              {[
                ["Allocation method",  "Snake Draft (voted by pod)"],
                ["Playoff rule",       "Bid credits auction, min 24h notice"],
                ["Resale policy",      "Any member may resell; profits split by share"],
                ["No-show policy",     "72h notice required to release game back to pod"],
                ["Default penalty",    "Security deposit forfeited; ejected from pod"],
                ["Dispute resolution", "HalfTime mediation → binding arbitration"],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: "8px 0", borderBottom: "1px solid #1A4A2E",
                  display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: T.mist }}>{k}</span>
                  <span style={{ fontSize: 11, color: T.chalk, fontWeight: 600,
                    textAlign: "right", maxWidth: "55%" }}>{v}</span>
                </div>
              ))}
            </Card>
            <div style={{ fontSize: 11, color: T.mist, textAlign: "center", padding: "8px 0" }}>
              All rules recorded on-chain · Last updated Jan 2026
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Escrow payment modal */}
    {showPayment && (
      <EscrowPaymentScreen
        podId={activePodId}
        podName={podDisplayName}
        amount={myAmount}
        onSuccess={handlePaymentSuccess}
        onClose={() => setShowPayment(false)}
      />
    )}
    </>
  );
}
