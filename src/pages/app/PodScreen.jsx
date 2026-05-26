// ─── PodScreen ────────────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import EscrowPaymentScreen from "./EscrowPaymentScreen";
import { useMyPods, usePod } from "../../hooks/usePod";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

// Deterministic color per member slot
const MEMBER_COLORS = ["#C8F135", "#34D399", "#A78BFA", "#FBBF24", "#F87171", "#60A5FA"];
function slotColor(idx) { return MEMBER_COLORS[idx % MEMBER_COLORS.length]; }

export default function PodScreen({ state, dispatch }) {
  const [tab, setTab]               = useState("members");
  const [showPayment, setShowPayment] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError]     = useState(null);

  // Current user
  const [currentUserId, setCurrentUserId] = useState(null);
  if (!currentUserId && isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setCurrentUserId(session.user.id);
    });
  }

  // My pods → find the first one
  const { pods } = useMyPods();
  const myPodRow      = pods?.[0] ?? null;
  const activePodId   = myPodRow?.id ?? null;
  const myMemberRow   = myPodRow?.pod_members?.[0] ?? null;

  // Full pod with ALL members (requires SECURITY DEFINER RLS policy)
  const { pod: fullPod, escrowBalance: realEscrowBalance, refresh: refreshPod } = usePod(activePodId);

  // Current user's membership info
  const myEscrowFunded = Boolean(myMemberRow?.escrow_funded);
  const myAmount       = parseFloat(myMemberRow?.cost) || 0;
  const mySharePct     = parseFloat(myMemberRow?.share_pct) || 25;

  // Map real DB members to display format
  const realMembers = (fullPod?.pod_members ?? []).map((m, idx) => ({
    id:           m.user_id,
    name:         m.user_id === currentUserId ? "You" : (m.profiles?.display_name || "Member"),
    initials:     m.profiles?.avatar_initials || "??",
    share:        parseFloat(m.share_pct) || 0,
    credits:      m.bid_credits || 0,
    color:        slotColor(idx),
    verified:     m.profiles?.verified || false,
    escrowFunded: m.escrow_funded || false,
    isMe:         m.user_id === currentUserId,
  }));

  // Fall back to mock members when no real data yet
  const members = realMembers.length > 0 ? realMembers : state.members;

  // Pod display info
  const podName    = fullPod?.name    ?? myPodRow?.name    ?? "My Pod";
  const teamName   = fullPod?.team_name ?? myPodRow?.team_name ?? "Team";
  const sportEmoji = fullPod?.sport_emoji ?? "🏀";
  const season     = fullPod?.season  ?? "2025-26";
  const maxMembers = fullPod?.max_members ?? 6;
  const totalCost  = parseFloat(fullPod?.season_cost ?? myPodRow?.season_cost ?? 0);

  // Escrow totals — use totalCost as ground truth; cap display at 100%
  const escrowRequired = totalCost > 0 ? totalCost
    : (myAmount > 0 ? myAmount / (mySharePct / 100) : 0);
  const escrowFundedCount = members.filter(m => m.escrowFunded).length;
  const escrowPct = escrowRequired > 0
    ? Math.min(100, Math.round((realEscrowBalance / escrowRequired) * 100))
    : 0;

  function handlePaymentSuccess() {
    setShowPayment(false);
    refreshPod();
    dispatch({ type: "FUND_ESCROW" });
  }

  // ── Captain detection + payout info ─────────────────────────────────────────
  const isCaptain = fullPod?.captain_id === currentUserId;
  const captainMember = (fullPod?.pod_members ?? []).find(m => m.user_id === fullPod?.captain_id);
  const captainProfile = captainMember?.profiles;
  const captainHasConnect   = Boolean(captainProfile?.connect_account_id);
  const captainIsOnboarded  = Boolean(captainProfile?.connect_onboarded);
  const payoutStatus        = fullPod?.payout_status ?? "pending";
  const payoutAmount        = fullPod?.payout_amount ?? 0;

  async function handleSetupPayouts() {
    setConnectLoading(true);
    setConnectError(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        method: "POST",
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Open Stripe's hosted onboarding in the same tab
      window.location.href = data.url;
    } catch (e) {
      setConnectError(e.message);
      setConnectLoading(false);
    }
  }

  // No pod yet → prompt to get one
  if (isSupabaseConfigured && !activePodId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32, minHeight: "60vh", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏟️</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 8 }}>You're not in a pod yet</div>
        <div style={{ fontSize: 12, color: T.mist, marginBottom: 24, lineHeight: 1.6 }}>
          Create your own pod as captain, or browse open pods looking for members.
        </div>
        <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "create_pod" })}
          style={{ marginBottom: 10, width: "100%", maxWidth: 280, padding: "13px",
            background: T.lime, color: T.dark, border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          🏆 Create a Pod
        </button>
        <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "browse_pods" })}
          style={{ width: "100%", maxWidth: 280, padding: "13px",
            background: "transparent", color: T.white, border: `1.5px solid ${T.green}`,
            borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          🔍 Find a Pod
        </button>
      </div>
    );
  }

  return (
    <>
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px 20px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 40 }}>{sportEmoji}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif" }}>{podName}</div>
            <div style={{ fontSize: 11, color: T.mist }}>{teamName} · Season {season}</div>
            <div style={{ marginTop: 4 }}>
              <Badge color={fullPod?.status === "active" ? T.lime : T.amber}>
                {fullPod?.status === "active" ? "Active Pod" : "Recruiting"}
              </Badge>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {[
            { l: "Members",  v: `${members.length}/${maxMembers}` },
            { l: "My Share", v: `${mySharePct}%` },
            { l: "My Cost",  v: myAmount > 0 ? `$${myAmount.toFixed(0)}` : "—" },
            { l: "Escrow",   v: `${escrowPct}%` },
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

        {/* ── Members tab ── */}
        {tab === "members" && (
          <div>
            {/* My escrow card */}
            {myAmount > 0 && (
              <Card style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Your escrow</div>
                    <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                      ${myAmount.toFixed(2)} · {mySharePct}% share
                    </div>
                  </div>
                  {myEscrowFunded
                    ? <Badge color={T.lime}>💳 Funded</Badge>
                    : (
                      <div onClick={() => setShowPayment(true)}
                        style={{ background: `${T.lime}22`, color: T.lime,
                          border: `1px solid ${T.lime}44`, borderRadius: 20,
                          padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Fund →
                      </div>
                    )}
                </div>
              </Card>
            )}

            {/* Member cards */}
            {members.map((m, idx) => {
              const count = Object.values(state.assignments).filter(id => id === m.id).length;
              return (
                <Card key={m.id ?? idx} style={{ marginBottom: 10 }} glow={m.isMe || m.id === "m1"}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: state.allocationDone ? 10 : 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar initials={m.initials} size={42} color={m.color} verified={m.verified} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700,
                          color: (m.isMe || m.id === "m1") ? T.lime : T.white,
                          fontFamily: "Georgia,serif" }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: T.mist }}>
                          {m.share}% ownership · {m.credits} bid credits
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      {m.verified
                        ? <Badge color={T.teal}>✓ Verified</Badge>
                        : <Badge color={T.amber}>⏳ Unverified</Badge>
                      }
                      {m.escrowFunded
                        ? <Badge color={T.lime}>💳 Funded</Badge>
                        : <div style={{ background: `${T.amber}22`, color: T.amber,
                            border: `1px solid ${T.amber}44`, borderRadius: 20,
                            padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>Pending</div>
                      }
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

            {/* Invite prompt if spots remain */}
            {members.length < maxMembers && (
              <div style={{ padding: "12px 0", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: T.mist, marginBottom: 8 }}>
                  {maxMembers - members.length} spot{maxMembers - members.length !== 1 ? "s" : ""} remaining in this pod
                </div>
                <button style={{ padding: "9px 20px", background: "transparent", color: T.lime,
                  border: `1px solid ${T.lime}44`, borderRadius: 8, fontSize: 12,
                  fontWeight: 700, cursor: "pointer" }}>
                  + Invite a Member
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Escrow tab ── */}
        {tab === "escrow" && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 14 }}>Pod Escrow Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[
                  { l: "Total Season Cost", v: `$${totalCost.toLocaleString()}`,         c: T.white },
                  { l: `My Share (${mySharePct}%)`, v: `$${myAmount.toFixed(2)}`,        c: T.lime  },
                  { l: "Funded So Far",     v: `$${realEscrowBalance.toFixed(2)}`,       c: T.teal  },
                  { l: "Outstanding",       v: `$${Math.max(0, escrowRequired - realEscrowBalance).toFixed(2)}`, c: T.amber },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ background: "#ffffff06", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: c,
                      fontFamily: "Georgia,serif" }}>{v}</div>
                  </div>
                ))}
              </div>
              <Bar value={realEscrowBalance} max={escrowRequired || 1} h={8} />
              <div style={{ fontSize: 10, color: T.mist, marginTop: 5 }}>
                {escrowPct}% funded · Protected by Stripe (FDIC-insured)
              </div>
              {!myEscrowFunded && myAmount > 0 && (
                <button onClick={() => setShowPayment(true)}
                  style={{ marginTop: 14, width: "100%", padding: "13px 0",
                    background: T.lime, color: T.dark, border: "none",
                    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Fund my escrow share — ${myAmount.toFixed(2)}
                </button>
              )}
            </Card>

            {/* ── Captain payout setup ── */}
            {isCaptain && (
              <Card style={{ marginBottom: 12, border: `1px solid ${payoutStatus === "paid" ? T.teal + "44" : T.lime + "22"}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 10 }}>💰 Captain Payout</div>

                {/* Already paid out */}
                {payoutStatus === "paid" && (
                  <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
                    borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, color: T.teal, fontWeight: 700, marginBottom: 4 }}>
                      ✅ Payout sent — ${payoutAmount.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: T.mist }}>
                      Funds transferred to your bank account. Check your Stripe Express Dashboard for details.
                    </div>
                  </div>
                )}

                {/* Onboarded, waiting for full funding */}
                {payoutStatus !== "paid" && captainIsOnboarded && (
                  <div>
                    <div style={{ background: `${T.lime}10`, border: `1px solid ${T.lime}33`,
                      borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: T.lime, fontWeight: 700, marginBottom: 2 }}>
                        ✓ Bank account connected
                      </div>
                      <div style={{ fontSize: 11, color: T.mist }}>
                        Once all {members.length} members fund their escrow, ${(escrowRequired * (1 - 0.03)).toFixed(2)} will be automatically transferred to your bank account.
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: T.mist }}>
                      {escrowFundedCount}/{members.length} members funded · 3% platform fee applies
                    </div>
                  </div>
                )}

                {/* Has account ID but not finished onboarding */}
                {payoutStatus !== "paid" && captainHasConnect && !captainIsOnboarded && (
                  <div>
                    <div style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}33`,
                      borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: T.amber, fontWeight: 700, marginBottom: 2 }}>
                        ⚠ Setup incomplete
                      </div>
                      <div style={{ fontSize: 11, color: T.mist }}>
                        Your Stripe onboarding wasn't finished. Tap below to complete it.
                      </div>
                    </div>
                    <button onClick={handleSetupPayouts} disabled={connectLoading}
                      style={{ width: "100%", padding: "11px", background: T.amber,
                        color: T.dark, border: "none", borderRadius: 8,
                        fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {connectLoading ? "Loading…" : "Complete payout setup →"}
                    </button>
                  </div>
                )}

                {/* No connect account yet */}
                {payoutStatus !== "paid" && !captainHasConnect && (
                  <div>
                    <p style={{ fontSize: 12, color: T.mist, margin: "0 0 12px", lineHeight: 1.6 }}>
                      Connect your bank account so members' escrow payments are automatically transferred to you once the pod is fully funded.
                    </p>
                    {connectError && (
                      <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>{connectError}</div>
                    )}
                    <button onClick={handleSetupPayouts} disabled={connectLoading}
                      style={{ width: "100%", padding: "13px", background: T.lime,
                        color: T.dark, border: "none", borderRadius: 10,
                        fontSize: 14, fontWeight: 700, cursor: "pointer",
                        opacity: connectLoading ? 0.6 : 1 }}>
                      {connectLoading ? "Opening Stripe…" : "💳 Set up payouts →"}
                    </button>
                    <div style={{ fontSize: 10, color: T.mist, textAlign: "center", marginTop: 8 }}>
                      Powered by Stripe · Bank-level security · Takes ~2 min
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Non-captain: show payout info */}
            {!isCaptain && payoutStatus !== "paid" && captainIsOnboarded && (
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
                  💡 Once all members fund, <strong style={{ color: T.white }}>${(escrowRequired * 0.97).toFixed(2)}</strong> will be automatically sent to {captainProfile?.display_name || "your captain"} to cover the season tickets.
                </div>
              </Card>
            )}

            {/* Per-member escrow */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 12 }}>Per-Member Escrow</div>
              {members.map((m, idx) => (
                <div key={m.id ?? idx} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1A4A2E" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Avatar initials={m.initials} size={28} color={m.color} />
                    <span style={{ fontSize: 12, color: T.white }}>{m.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.lime,
                      fontFamily: "Georgia,serif" }}>
                      {totalCost > 0
                        ? `$${((totalCost * m.share) / 100).toFixed(2)}`
                        : `${m.share}%`}
                    </span>
                    {m.escrowFunded
                      ? <Badge color={T.teal}>✓ Funded</Badge>
                      : <span style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>Pending</span>}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ── Rules tab ── */}
        {tab === "rules" && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 12 }}>Pod Agreement</div>
              {[
                ["Allocation method",  fullPod?.allocation_method ?? "Snake Draft"],
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
              All rules recorded on-chain · Last updated {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Escrow payment modal */}
    {showPayment && activePodId && (
      <EscrowPaymentScreen
        podId={activePodId}
        podName={podName}
        amount={myAmount}
        onSuccess={handlePaymentSuccess}
        onClose={() => setShowPayment(false)}
      />
    )}
    </>
  );
}
