// ─── PodScreen ────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import EscrowPaymentScreen from "./EscrowPaymentScreen";
import { useMyPods, usePod } from "../../hooks/usePod";
import { deletePod, leavePod } from "../../api/pods";
import { getPodPerks, createPerk, placePerkBid, awardPerk, flagMissingPerk } from "../../api/perks";
import { fileDispute, getPodDisputes, DISPUTE_TYPES } from "../../api/disputes";
import { useActivePod } from "../../context/ActivePodContext";
import { usePodChat } from "../../hooks/usePodChat";
import { findTeamTicketUrl } from "../../lib/teamTicketUrls";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { notify } from "../../lib/notify";
import { awardBidCredits } from "../../api/bids";

// Deterministic color per member slot
const MEMBER_COLORS = ["#C8F135", "#34D399", "#A78BFA", "#FBBF24", "#F87171", "#60A5FA"];
function slotColor(idx) { return MEMBER_COLORS[idx % MEMBER_COLORS.length]; }

export default function PodScreen({ state, dispatch }) {
  const [tab, setTab]               = useState("members");
  const [showPayment, setShowPayment] = useState(false);
  const [showInvite,  setShowInvite]  = useState(false);
  const [chatInput,   setChatInput]   = useState("");
  const chatBottomRef = useRef(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError]     = useState(null);

  // Captain admin state
  const [announcement,  setAnnouncement]  = useState("");
  const [announceBusy,  setAnnounceBusy]  = useState(false);
  const [announceOk,    setAnnounceOk]    = useState(false);
  const [statusBusy,    setStatusBusy]    = useState(false);
  const [removingId,    setRemovingId]    = useState(null); // user_id being removed
  const [removeConfirm, setRemoveConfirm] = useState(null); // user_id to confirm remove
  const [editShareFor,  setEditShareFor]  = useState(null); // user_id whose share is being edited
  const [editShareVal,  setEditShareVal]  = useState("");
  const [regenBusy,     setRegenBusy]     = useState(false);
  const [linkCopied,    setLinkCopied]    = useState(false);

  // Pod settings edit state (captain only)
  const [editPodSettings, setEditPodSettings] = useState(false);
  const [podSettingsForm,  setPodSettingsForm]  = useState({});
  const [savingSettings,   setSavingSettings]   = useState(false);
  const [settingsErr,      setSettingsErr]      = useState(null);

  // Bid credit award state (captain only)
  const [awardCreditsFor,  setAwardCreditsFor]  = useState(null); // member id
  const [awardAmount,      setAwardAmount]      = useState("10");
  const [awardBusy,        setAwardBusy]        = useState(false);

  // Delete pod state (captain only)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy,        setDeleteBusy]        = useState(false);
  const [deleteErr,         setDeleteErr]         = useState(null);

  // Leave pod state (members only)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveBusy,        setLeaveBusy]        = useState(false);
  const [leaveErr,         setLeaveErr]         = useState(null);

  // Dispute state
  const [showDisputeModal,  setShowDisputeModal]  = useState(false);
  const [disputeType,       setDisputeType]       = useState("ticket_not_delivered");
  const [disputeDesc,       setDisputeDesc]       = useState("");
  const [disputeBusy,       setDisputeBusy]       = useState(false);
  const [disputeDone,       setDisputeDone]       = useState(false);
  const [disputeErr,        setDisputeErr]        = useState(null);
  const [podDisputes,       setPodDisputes]       = useState([]);

  // Perks tab state
  const [perks,         setPerks]        = useState([]);
  const [perksLoading,  setPerksLoading] = useState(false);
  const [perksError,    setPerksError]   = useState(null);
  const [showPerkForm,  setShowPerkForm] = useState(false);
  const [perkForm,      setPerkForm]     = useState({ title: "", description: "", eventDate: "", spots: "1" });
  const [postingPerk,   setPostingPerk]  = useState(false);
  const [perkBidInput,  setPerkBidInput] = useState({});  // perkId → string
  const [perkBidBusy,   setPerkBidBusy] = useState(null); // perkId in flight
  const [awardingPerk,  setAwardingPerk] = useState(null);// perkId in flight
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagNote,      setFlagNote]     = useState("");
  const [flagBusy,      setFlagBusy]     = useState(false);
  const [flagDone,      setFlagDone]     = useState(false);

  // Current user
  const currentUserId = useCurrentUserId();

  // My pods → find the active one
  const { pods, loading: podsLoading } = useMyPods();
  const { activePodId: selectedPodId, setActivePodId, refresh: refreshPodContext } = useActivePod();
  const myPodRow      = pods.find(p => p.id === selectedPodId) ?? pods?.[0] ?? null;
  const activePodId   = myPodRow?.id ?? null;
  const myMemberRow   = myPodRow?.pod_members?.[0] ?? null;

  // Full pod with ALL members (requires SECURITY DEFINER RLS policy)
  const { pod: fullPod, escrowBalance: realEscrowBalance, refresh: refreshPod } = usePod(activePodId);
  const { messages, sending, sendMessage } = usePodChat(activePodId);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (tab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, tab]);

  useEffect(() => {
    if (tab !== "perks" || !activePodId) return;
    setPerksLoading(true);
    setPerksError(null);
    getPodPerks(activePodId)
      .then(setPerks)
      .catch(() => setPerksError("Could not load perks."))
      .finally(() => setPerksLoading(false));
  }, [tab, activePodId]);

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
    // Notify the captain that a member funded their escrow share
    // (skip if the captain is funding their own share)
    if (fullPod?.captain_id && fullPod.captain_id !== currentUserId) {
      notify({
        userId: fullPod.captain_id,
        type:   "escrow_funded",
        title:  "💰 Escrow funded",
        body:   `A member just funded their escrow share for ${fullPod.name ?? "your pod"}. Check escrow status.`,
        url:    "/app",
      });
    }
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
    // Open window BEFORE any await — Safari blocks window.open inside async chains
    const stripeWindow = window.open("", "_blank");
    try {
      const { data, error } = await supabase.functions.invoke("create-connect-account", {
        method: "POST",
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No onboarding URL returned");
      if (stripeWindow) {
        stripeWindow.location.href = data.url;
      } else {
        window.location.href = data.url;
      }
      setConnectLoading(false);
    } catch (e) {
      if (stripeWindow) stripeWindow.close();
      const msg = e?.context?.message || e?.context?.error || e?.message || "Unknown error";
      setConnectError(msg);
      setConnectLoading(false);
    }
  }

  // ── Captain admin handlers ───────────────────────────────────────────────────
  async function handleSendAnnouncement() {
    if (!announcement.trim() || !activePodId) return;
    setAnnounceBusy(true);
    try {
      await supabase.from("pod_messages").insert({
        pod_id:  activePodId,
        user_id: currentUserId,
        content: `📢 ${announcement.trim()}`,
      });
      setAnnouncement("");
      setAnnounceOk(true);
      setTimeout(() => setAnnounceOk(false), 2000);
    } catch (e) { console.error(e); }
    finally { setAnnounceBusy(false); }
  }

  async function handleLeavePod() {
    if (!activePodId) return;
    setLeaveErr(null);
    setLeaveBusy(true);
    try {
      await leavePod(activePodId);
      setShowLeaveConfirm(false);
      // Switch to another pod or return to onboarding
      await refreshPodContext();
      const { getMyPods } = await import("../../api/pods");
      const remaining = await getMyPods();
      if (remaining.length > 0) {
        setActivePodId(remaining[0].id);
        dispatch({ type: "SET_SCREEN", screen: "dashboard" });
      } else {
        localStorage.removeItem("ht_active_pod");
        localStorage.removeItem("ht_onboarded");
        dispatch({ type: "SET_SCREEN", screen: "onboarding" });
      }
    } catch (e) {
      setLeaveErr(e?.message || "Failed to leave pod. Please try again.");
    } finally {
      setLeaveBusy(false);
    }
  }

  async function handleDeletePod() {
    if (!activePodId) return;
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      // 1. Refund any funded members via Stripe before deleting
      const { data, error: refundErr } = await supabase.functions.invoke("refund-pod", {
        body: { podId: activePodId },
      });
      if (refundErr) {
        // Extract the real error message from the edge function response body
        let msg = refundErr.message;
        try {
          const body = await refundErr.context?.json();
          if (body?.error) msg = body.error;
        } catch { /* ignore parse errors */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      // 2. Delete the pod (cascades to members, games, assignments)
      await deletePod(activePodId);

      // 3. Refresh the context so pod switcher + all screens see updated list
      await refreshPodContext();
      setShowDeleteConfirm(false);

      // 4. Fetch live pods directly — React state won't update until next render
      const { getMyPods } = await import("../../api/pods");
      const remaining = await getMyPods();
      if (remaining.length > 0) {
        setActivePodId(remaining[0].id);
        dispatch({ type: "SET_SCREEN", screen: "dashboard" });
      } else {
        localStorage.removeItem("ht_active_pod");
        localStorage.removeItem("ht_onboarded");
        dispatch({ type: "SET_SCREEN", screen: "onboarding" });
      }
    } catch (e) {
      setDeleteErr(e?.message || "Failed to delete pod. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleTogglePodStatus() {
    if (!fullPod || !activePodId) return;
    const next = fullPod.status === "active" ? "recruiting" : "active";
    setStatusBusy(true);
    try {
      await supabase.from("pods").update({ status: next }).eq("id", activePodId);
      await refreshPod();
    } catch (e) { console.error(e); }
    finally { setStatusBusy(false); }
  }

  async function handleRemoveMember(userId) {
    if (!activePodId) return;
    setRemovingId(userId);
    try {
      await supabase.from("pod_members")
        .delete()
        .eq("pod_id", activePodId)
        .eq("user_id", userId);
      setRemoveConfirm(null);
      await refreshPod();
    } catch (e) { console.error(e); }
    finally { setRemovingId(null); }
  }

  async function handleRegenInviteCode() {
    if (!activePodId) return;
    setRegenBusy(true);
    try {
      await supabase.rpc("regenerate_pod_invite_code", { p_pod_id: activePodId });
      await refreshPod();
    } catch (e) { console.error(e); }
    finally { setRegenBusy(false); }
  }

  async function handleCopyInviteLink() {
    const url = `${window.location.origin}/join/${fullPod?.invite_code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }

  async function handleSaveShare(userId) {
    const pct = parseFloat(editShareVal);
    if (isNaN(pct) || pct <= 0 || pct > 100 || !activePodId) return;
    const newCost = totalCost * (pct / 100);
    try {
      await supabase.from("pod_members")
        .update({ share_pct: pct, cost: newCost.toFixed(2) })
        .eq("pod_id", activePodId)
        .eq("user_id", userId);
      setEditShareFor(null);
      await refreshPod();
    } catch (e) { console.error(e); }
  }

  async function handleSavePodSettings() {
    if (!activePodId) return;
    setSavingSettings(true);
    setSettingsErr(null);
    try {
      const updates = {};
      if (podSettingsForm.name?.trim())      updates.name        = podSettingsForm.name.trim();
      if (podSettingsForm.venue?.trim() !== undefined) updates.venue = podSettingsForm.venue?.trim() || null;
      if (podSettingsForm.season_cost)       updates.season_cost = parseFloat(podSettingsForm.season_cost) || totalCost;
      if (podSettingsForm.max_members)       updates.max_members = parseInt(podSettingsForm.max_members) || maxMembers;
      const { error } = await supabase.from("pods").update(updates).eq("id", activePodId);
      if (error) throw error;
      setEditPodSettings(false);
      await refreshPod();
    } catch (e) {
      setSettingsErr(e.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAwardCredits(memberId) {
    const amount = parseInt(awardAmount, 10);
    if (!amount || amount < 1 || !activePodId) return;
    setAwardBusy(true);
    try {
      await awardBidCredits(activePodId, memberId, amount);
      setAwardCreditsFor(null);
      setAwardAmount("10");
      await refreshPod();
    } catch (e) {
      console.error("Award credits:", e.message);
    } finally {
      setAwardBusy(false);
    }
  }

  // Still loading — show spinner so user doesn't think creation failed
  if (isSupabaseConfigured && podsLoading && !activePodId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: `3px solid #1A4A2E`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite",
        }} />
        <div style={{ fontSize: 12, color: T.mist }}>Loading your pod…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
        {[
          ["members", "👥 Members"],
          ["chat",    "💬 Chat"   ],
          ["perks",   "🎁 Perks"  ],
          ["escrow",  "💳 Escrow" ],
          ["rules",   "📋 Rules"  ],
          ...(isCaptain ? [["admin", "⚙️ Admin"]] : []),
        ].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "11px 0", textAlign: "center", fontSize: 10, fontWeight: 700,
            color: tab === k ? T.lime : T.mist,
            borderBottom: `2px solid ${tab === k ? T.lime : "transparent"}`, cursor: "pointer",
          }}>{lbl}</div>
        ))}
      </div>

      {/* ── Group Buy: Purchasing Banner ─────────────────────────────────────── */}
      {fullPod?.pod_type === "group_buy" && fullPod?.status === "purchasing" && (() => {
        const deadline   = fullPod.purchase_deadline ? new Date(fullPod.purchase_deadline) : null;
        const msLeft     = deadline ? Math.max(0, deadline - Date.now()) : 0;
        const hoursLeft  = Math.floor(msLeft / 3_600_000);
        const minsLeft   = Math.floor((msLeft % 3_600_000) / 60_000);
        const isPast     = msLeft === 0;
        const ticketUrl  = findTeamTicketUrl(fullPod.team_name, fullPod.sport);

        return (
          <div style={{ margin: "0 14px 4px" }}>
            <div style={{
              background:   isPast ? `${T.red}12`  : `${T.teal}10`,
              border:       `1px solid ${isPast ? T.red : T.teal}44`,
              borderRadius: 14, padding: "16px 16px 14px",
            }}>
              {isCaptain ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isPast ? T.red : T.teal,
                    fontFamily: "Georgia,serif", marginBottom: 6 }}>
                    {isPast ? "⚠️ Purchase window expired" : "🛒 Time to buy the tickets!"}
                  </div>
                  {!isPast && (
                    <div style={{ fontSize: 12, color: T.mist, marginBottom: 12, lineHeight: 1.6 }}>
                      All members have funded. Purchase the{" "}
                      <strong style={{ color: T.white }}>{fullPod.team_name}</strong> season tickets,
                      then upload your receipt below.{" "}
                      <span style={{ color: T.amber, fontWeight: 700 }}>
                        {hoursLeft}h {minsLeft}m remaining.
                      </span>
                    </div>
                  )}
                  {isPast && (
                    <div style={{ fontSize: 12, color: T.mist, marginBottom: 12, lineHeight: 1.6 }}>
                      The 48-hour purchase window has passed without a receipt.
                      Cancel the pod to automatically refund all members.
                    </div>
                  )}

                  {!isPast && ticketUrl && (
                    <>
                      <a href={ticketUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", width: "100%", padding: "11px 0",
                          background: T.teal, color: T.dark, borderRadius: 10,
                          textAlign: "center", fontWeight: 700, fontSize: 13,
                          textDecoration: "none", marginBottom: 4 }}>
                        🎟️ {fullPod.team_name} Season Ticket Page →
                      </a>
                      <div style={{ fontSize: 10, color: T.mist, textAlign: "center",
                        marginBottom: 10 }}>
                        Availability depends on the team's schedule — if tickets aren't on sale
                        yet, check back closer to the season.
                      </div>
                    </>
                  )}
                  {!isPast && (
                    <div style={{ fontSize: 10, color: T.mist, textAlign: "center",
                      lineHeight: 1.5 }}>
                      After purchasing, go to the <strong style={{ color: T.chalk }}>Admin tab → Pod Settings</strong> to
                      upload your receipt. Once HalfTime verifies it, your escrow will be released.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.teal,
                    fontFamily: "Georgia,serif", marginBottom: 6 }}>
                    🛒 Organizer is purchasing tickets
                  </div>
                  <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
                    The pod is fully funded. The organizer has{" "}
                    <span style={{ color: T.amber, fontWeight: 700 }}>
                      {hoursLeft}h {minsLeft}m
                    </span>{" "}
                    to purchase the tickets and upload a receipt.
                    Your escrow is safe — if they miss the deadline, you'll be automatically refunded.
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Group Buy: Cancelled Banner ───────────────────────────────────────── */}
      {fullPod?.pod_type === "group_buy" && fullPod?.status === "cancelled" && (
        <div style={{ margin: "0 14px 4px", background: `${T.red}10`,
          border: `1px solid ${T.red}33`, borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.red,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>
            ❌ Pod cancelled
          </div>
          <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
            This pod was cancelled. All funded members have been automatically refunded.
          </div>
        </div>
      )}

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
                <button onClick={() => setShowInvite(true)}
                  style={{ padding: "9px 20px", background: "transparent", color: T.lime,
                  border: `1px solid ${T.lime}44`, borderRadius: 8, fontSize: 12,
                  fontWeight: 700, cursor: "pointer" }}>
                  + Invite a Member
                </button>
              </div>
            )}

            {/* Leave pod — non-captains only, while pod isn't fully funded */}
            {!isCaptain && fullPod && escrowFundedCount < members.length && (
              <div style={{ paddingTop: 20, textAlign: "center",
                borderTop: "1px solid #1A4A2E", marginTop: 8 }}>
                <button
                  onClick={() => { setLeaveErr(null); setShowLeaveConfirm(true); }}
                  style={{ padding: "9px 20px", background: "transparent",
                    color: T.red, border: `1px solid ${T.red}44`,
                    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Leave Pod
                </button>
                {myEscrowFunded && (
                  <div style={{ fontSize: 10, color: T.mist, marginTop: 5 }}>
                    Your escrow will be refunded if you leave
                  </div>
                )}
              </div>
            )}

            {/* Dispute button — all members */}
            {fullPod && (
              <div style={{ paddingTop: 16, textAlign: "center",
                borderTop: !isCaptain && escrowFundedCount < members.length ? "none" : "1px solid #1A4A2E",
                marginTop: !isCaptain && escrowFundedCount < members.length ? 0 : 8 }}>
                {disputeDone ? (
                  <div style={{ fontSize: 12, color: T.lime }}>
                    ✓ Dispute filed — HalfTime will review within 48 hours. Your escrow is protected.
                  </div>
                ) : (
                  <button
                    onClick={() => { setDisputeErr(null); setShowDisputeModal(true); }}
                    style={{ background: "none", border: `1px solid rgba(148,163,184,0.2)`,
                      borderRadius: 8, color: T.mist, fontSize: 11,
                      cursor: "pointer", padding: "7px 16px" }}>
                    ⚠️ Report an Issue
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Perks tab ── */}
        {tab === "perks" && (
          <div style={{ padding: "14px 14px 120px" }}>

            {/* Perks not included in this pod */}
            {fullPod?.perks_included === false && (
              <div style={{ background: `${T.teal}08`, border: `1px solid ${T.teal}33`,
                borderRadius: 12, padding: "18px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.teal,
                  fontFamily: "Georgia,serif", marginBottom: 6 }}>
                  Perks not included in this pod
                </div>
                <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.7 }}>
                  The captain retains all team member perks. In exchange, members
                  pay <strong style={{ color: T.teal }}>5% less</strong> than their
                  standard share — already reflected in your escrow amount.
                </div>
              </div>
            )}

            {/* Perk commitment banner — only when perks are included */}
            {fullPod?.perks_included !== false && fullPod?.perk_commitment ? (
              <div style={{ background: `${T.lime}08`, border: `1px solid ${T.lime}22`,
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                <span style={{ color: T.lime, fontWeight: 700 }}>✓ Perk commitment active</span>
                {" "}— The captain is committed to posting all team member perks within 48 hours
                of notice so members can bid fairly.
              </div>
            ) : (
              <div style={{ background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                ℹ️ Ask your captain to post any team member perks (events, postseason seats, etc.)
                here so everyone can bid on them fairly.
              </div>
            )}

            {fullPod?.perks_included !== false && perksLoading && (
              <div style={{ textAlign: "center", padding: "30px 0", color: T.mist, fontSize: 12 }}>
                Loading perks…
              </div>
            )}
            {fullPod?.perks_included !== false && perksError && (
              <div style={{ color: T.red, fontSize: 12, marginBottom: 12 }}>{perksError}</div>
            )}

            {/* Captain: post perk form */}
            {fullPod?.perks_included !== false && isCaptain && !showPerkForm && (
              <button
                onClick={() => setShowPerkForm(true)}
                style={{ width: "100%", padding: "12px 0", background: T.lime,
                  color: T.dark, border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
                + Post a Perk
              </button>
            )}

            {fullPod?.perks_included !== false && isCaptain && showPerkForm && (
              <div style={{ background: T.forest, border: "1px solid #1A4A2E",
                borderRadius: 12, padding: "16px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 12 }}>🎁 New Perk</div>

                {[
                  { label: "PERK TITLE *", key: "title", placeholder: "e.g. Player Meet-and-Greet" },
                  { label: "DESCRIPTION",  key: "description", placeholder: "Details about the event…" },
                  { label: "EVENT DATE",   key: "eventDate", placeholder: "", type: "date" },
                  { label: "SPOTS AVAILABLE", key: "spots", placeholder: "1", type: "number" },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.mist,
                      letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                    <input
                      type={type || "text"}
                      placeholder={placeholder}
                      value={perkForm[key]}
                      min={type === "number" ? 1 : undefined}
                      onChange={e => setPerkForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", background: "#0D1F12",
                        border: "1px solid #1A4A2E", borderRadius: 8, color: T.white,
                        fontSize: 13, fontFamily: "Calibri,sans-serif",
                        outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => { setShowPerkForm(false); setPerkForm({ title: "", description: "", eventDate: "", spots: "1" }); }}
                    style={{ flex: 1, padding: "10px 0", background: "transparent",
                      border: "1px solid #1A4A2E", borderRadius: 8,
                      color: T.mist, fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button
                    disabled={postingPerk || !perkForm.title.trim()}
                    onClick={async () => {
                      if (!perkForm.title.trim()) return;
                      setPostingPerk(true);
                      try {
                        await createPerk(activePodId, perkForm);
                        const updated = await getPodPerks(activePodId);
                        setPerks(updated);
                        setShowPerkForm(false);
                        setPerkForm({ title: "", description: "", eventDate: "", spots: "1" });
                        // Notify all members
                        members.filter(m => !m.isMe).forEach(m => {
                          notify({ userId: m.id, type: "bid_credits_awarded",
                            title: "🎁 New perk posted!",
                            body: `"${perkForm.title.trim()}" — open for bids in the ${podName} pod.`,
                            url: "/app" });
                        });
                      } catch (e) { setPerksError(e.message); }
                      finally { setPostingPerk(false); }
                    }}
                    style={{ flex: 2, padding: "10px 0", background: postingPerk ? T.mist : T.lime,
                      color: T.dark, border: "none", borderRadius: 8,
                      fontSize: 12, fontWeight: 700, cursor: postingPerk ? "not-allowed" : "pointer" }}>
                    {postingPerk ? "Posting…" : "Post Perk →"}
                  </button>
                </div>
              </div>
            )}

            {/* Perk list */}
            {fullPod?.perks_included !== false && !perksLoading && perks.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎟️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 6 }}>No perks yet</div>
                <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
                  {isCaptain
                    ? "Post a perk when your team announces an event — your members can bid on it."
                    : "When your captain posts team perks here, you'll be able to bid on them using your credits."}
                </div>
              </div>
            )}

            {fullPod?.perks_included !== false && perks.map(perk => {
              const bids      = (perk.perk_bids ?? []).sort((a, b) => b.credits - a.credits);
              const myBid     = bids.find(b => b.user_id === currentUserId);
              const isOpen    = perk.status === "open";
              const winners   = bids.filter(b => b.won);
              const myCredits = members.find(m => m.isMe)?.credits ?? 0;

              return (
                <div key={perk.id} style={{ background: T.forest,
                  border: `1px solid ${isOpen ? "#1A4A2E" : T.lime + "33"}`,
                  borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>

                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                        fontFamily: "Georgia,serif" }}>{perk.title}</div>
                      {perk.event_date && (
                        <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                          📅 {new Date(perk.event_date + "T12:00:00").toLocaleDateString("en-US",
                            { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      )}
                    </div>
                    <div style={{ background: isOpen ? `${T.lime}22` : `${T.teal}22`,
                      border: `1px solid ${isOpen ? T.lime : T.teal}44`,
                      borderRadius: 20, padding: "2px 10px",
                      fontSize: 10, fontWeight: 700,
                      color: isOpen ? T.lime : T.teal, flexShrink: 0, marginLeft: 8 }}>
                      {isOpen ? "Open" : "Awarded"}
                    </div>
                  </div>

                  {perk.description && (
                    <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6, marginBottom: 10 }}>
                      {perk.description}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
                    {perk.spots} spot{perk.spots > 1 ? "s" : ""} · {bids.length} bid{bids.length !== 1 ? "s" : ""}
                    {isOpen && bids.length > 0 && (
                      <> · Top bid: <span style={{ color: T.lime, fontWeight: 700 }}>{bids[0].credits} credits</span></>
                    )}
                  </div>

                  {/* Awarded: show winners */}
                  {!isOpen && winners.length > 0 && (
                    <div style={{ background: `${T.lime}08`, border: `1px solid ${T.lime}22`,
                      borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.lime,
                        letterSpacing: 1, marginBottom: 6 }}>WINNERS</div>
                      {winners.map(w => (
                        <div key={w.id} style={{ display: "flex", justifyContent: "space-between",
                          fontSize: 12, color: T.white, marginBottom: 4 }}>
                          <span>{w.profiles?.display_name ?? "Member"}{w.user_id === currentUserId ? " (you)" : ""}</span>
                          <span style={{ color: T.lime }}>{w.credits} credits</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Open: captain sees all bids + award button */}
                  {isOpen && isCaptain && bids.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.mist,
                        letterSpacing: 1, marginBottom: 6 }}>ALL BIDS</div>
                      {bids.map((b, i) => (
                        <div key={b.id} style={{ display: "flex", justifyContent: "space-between",
                          fontSize: 12, marginBottom: 4,
                          color: i < perk.spots ? T.lime : T.mist }}>
                          <span>{b.profiles?.display_name ?? "Member"}{i < perk.spots ? " ✓" : ""}</span>
                          <span style={{ fontWeight: 700 }}>{b.credits} credits</span>
                        </div>
                      ))}
                      <button
                        disabled={!!awardingPerk}
                        onClick={async () => {
                          setAwardingPerk(perk.id);
                          try {
                            await awardPerk(perk.id, activePodId);
                            const updated = await getPodPerks(activePodId);
                            setPerks(updated);
                          } catch (e) { setPerksError(e.message); }
                          finally { setAwardingPerk(null); }
                        }}
                        style={{ width: "100%", marginTop: 8, padding: "9px 0",
                          background: awardingPerk === perk.id ? T.mist : T.teal,
                          color: T.dark, border: "none", borderRadius: 8,
                          fontSize: 12, fontWeight: 700,
                          cursor: awardingPerk ? "not-allowed" : "pointer" }}>
                        {awardingPerk === perk.id ? "Awarding…" : `Close Bids & Award Top ${perk.spots} →`}
                      </button>
                    </div>
                  )}

                  {/* Open: member bid input */}
                  {isOpen && !isCaptain && (
                    <div>
                      <div style={{ fontSize: 10, color: T.mist, marginBottom: 6 }}>
                        You have <span style={{ color: T.lime, fontWeight: 700 }}>{myCredits} credits</span>
                        {myBid && <> · Your current bid: <span style={{ color: T.lime, fontWeight: 700 }}>{myBid.credits}</span></>}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number" min="1" max={myCredits}
                          placeholder={myBid ? `${myBid.credits}` : "Credits"}
                          value={perkBidInput[perk.id] ?? ""}
                          onChange={e => setPerkBidInput(v => ({ ...v, [perk.id]: e.target.value }))}
                          style={{ flex: 1, padding: "9px 12px", background: "#0D1F12",
                            border: "1px solid #1A4A2E", borderRadius: 8, color: T.white,
                            fontSize: 13, fontFamily: "Calibri,sans-serif",
                            outline: "none", boxSizing: "border-box" }}
                        />
                        <button
                          disabled={perkBidBusy === perk.id || !perkBidInput[perk.id]}
                          onClick={async () => {
                            const credits = parseInt(perkBidInput[perk.id]);
                            if (!credits || credits < 1) return;
                            setPerkBidBusy(perk.id);
                            try {
                              await placePerkBid(perk.id, activePodId, credits);
                              const updated = await getPodPerks(activePodId);
                              setPerks(updated);
                              setPerkBidInput(v => ({ ...v, [perk.id]: "" }));
                            } catch (e) { setPerksError(e.message); }
                            finally { setPerkBidBusy(null); }
                          }}
                          style={{ padding: "9px 16px", background: perkBidBusy === perk.id ? T.mist : T.lime,
                            color: T.dark, border: "none", borderRadius: 8,
                            fontSize: 12, fontWeight: 700,
                            cursor: perkBidBusy === perk.id ? "not-allowed" : "pointer" }}>
                          {perkBidBusy === perk.id ? "…" : myBid ? "Update" : "Bid →"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Flag undisclosed perk — non-captain members only, only when perks included */}
            {fullPod?.perks_included !== false && !isCaptain && (
              <div style={{ marginTop: 8, textAlign: "center" }}>
                {flagDone ? (
                  <div style={{ fontSize: 12, color: T.lime }}>
                    ✓ Flag submitted — the captain has been notified.
                  </div>
                ) : (
                  <button
                    onClick={() => setShowFlagModal(true)}
                    style={{ background: "none", border: `1px solid ${T.red}33`,
                      borderRadius: 8, color: T.red, fontSize: 11, fontWeight: 700,
                      cursor: "pointer", padding: "8px 18px" }}>
                    ⚠️ Flag Undisclosed Perk
                  </button>
                )}
                <div style={{ fontSize: 10, color: T.mist, marginTop: 6, lineHeight: 1.5 }}>
                  Believe a team perk wasn't posted? Flag it — the captain is notified
                  and HalfTime will review.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Flag perk modal */}
        {showFlagModal && (
          <div onClick={() => setShowFlagModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
              zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 430, background: T.dark,
                borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
                borderBottom: "none",
                padding: "24px 20px calc(env(safe-area-inset-bottom,0px) + 32px)" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 20px" }} />
              <div style={{ fontSize: 22, textAlign: "center", marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 6 }}>
                Flag an Undisclosed Perk
              </div>
              <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6,
                textAlign: "center", marginBottom: 16 }}>
                Your captain will receive a formal warning. Only flag if you have reason
                to believe a team perk wasn't disclosed. False flags may affect your account.
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.mist,
                letterSpacing: 1, marginBottom: 6 }}>
                WHAT PERK DO YOU BELIEVE WASN'T POSTED? (optional)
              </div>
              <textarea
                value={flagNote}
                onChange={e => setFlagNote(e.target.value)}
                placeholder="e.g. Player meet-and-greet announced on the team's Instagram on June 3rd…"
                rows={3}
                style={{ width: "100%", padding: "10px 12px", background: "#0D1F12",
                  border: "1px solid #1A4A2E", borderRadius: 8, color: T.white,
                  fontSize: 12, fontFamily: "Calibri,sans-serif",
                  outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 14 }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowFlagModal(false); setFlagNote(""); }}
                  style={{ flex: 1, padding: "12px 0", background: "transparent",
                    border: "1px solid #1A4A2E", borderRadius: 10,
                    color: T.mist, fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  disabled={flagBusy}
                  onClick={async () => {
                    setFlagBusy(true);
                    try {
                      await flagMissingPerk(
                        activePodId, podName,
                        fullPod?.captain_id,
                        flagNote.trim()
                      );
                      setShowFlagModal(false);
                      setFlagNote("");
                      setFlagDone(true);
                    } catch { /* non-fatal */ }
                    finally { setFlagBusy(false); }
                  }}
                  style={{ flex: 2, padding: "12px 0",
                    background: flagBusy ? T.mist : T.red,
                    color: T.white, border: "none", borderRadius: 10,
                    fontSize: 13, fontWeight: 700, cursor: flagBusy ? "not-allowed" : "pointer" }}>
                  {flagBusy ? "Submitting…" : "Submit Flag →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Chat tab ── */}
        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 230px)" }}>
            {/* Message list */}
            <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
                    fontFamily: "Georgia,serif", marginBottom: 6 }}>Pod group chat</div>
                  <div style={{ fontSize: 12, color: T.mist }}>
                    Be the first to send a message!
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.user_id === currentUserId;
                  const showName = i === 0 || messages[i - 1]?.user_id !== msg.user_id;
                  return (
                    <div key={msg.id} style={{
                      display: "flex", flexDirection: isMe ? "row-reverse" : "row",
                      gap: 8, marginBottom: 8, alignItems: "flex-end",
                    }}>
                      {!isMe && (
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: T.green, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: T.lime,
                        }}>
                          {(msg.profiles?.avatar_initials || "??").slice(0, 2)}
                        </div>
                      )}
                      <div style={{ maxWidth: "72%" }}>
                        {showName && !isMe && (
                          <div style={{ fontSize: 9, color: T.mist, marginBottom: 3, marginLeft: 4 }}>
                            {msg.profiles?.display_name || "Member"}
                          </div>
                        )}
                        <div style={{
                          background: isMe ? T.lime : T.forest,
                          color: isMe ? T.dark : T.chalk,
                          padding: "8px 12px", borderRadius: 14,
                          borderBottomRightRadius: isMe ? 4 : 14,
                          borderBottomLeftRadius: isMe ? 14 : 4,
                          fontSize: 13, lineHeight: 1.4,
                          wordBreak: "break-word",
                        }}>
                          {msg.content}
                        </div>
                        <div style={{ fontSize: 9, color: T.mist,
                          textAlign: isMe ? "right" : "left", marginTop: 2, marginLeft: 4 }}>
                          {new Date(msg.created_at).toLocaleTimeString("en-US",
                            { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {/* Scroll anchor — auto-scrolls to latest message */}
              <div ref={chatBottomRef} />
            </div>

            {/* Input bar */}
            {!isSupabaseConfigured ? (
              <div style={{ textAlign: "center", fontSize: 11, color: T.mist, padding: "12px 0" }}>
                Chat requires Supabase
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, paddingTop: 10,
                borderTop: "1px solid #1A4A2E" }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                      e.preventDefault();
                      sendMessage(chatInput);
                      setChatInput("");
                    }
                  }}
                  placeholder="Say something to your pod…"
                  style={{ flex: 1, padding: "10px 12px", background: T.forest,
                    border: `1px solid #1A4A2E`, borderRadius: 20, color: T.white,
                    fontSize: 13, outline: "none", fontFamily: "Calibri,sans-serif" }}
                />
                <button
                  onClick={() => { if (chatInput.trim()) { sendMessage(chatInput); setChatInput(""); } }}
                  disabled={sending || !chatInput.trim()}
                  style={{ width: 38, height: 38, borderRadius: "50%",
                    background: chatInput.trim() ? T.lime : T.green,
                    border: "none", color: T.dark, fontSize: 18, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "background 0.15s" }}>
                  ↑
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

        {/* ── Captain Admin tab ── */}
        {tab === "admin" && isCaptain && (
          <div>
            {/* ── Pod Settings ── */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
                  ⚙️ Pod Settings
                </div>
                <button
                  onClick={() => {
                    setEditPodSettings(v => !v);
                    setPodSettingsForm({ name: podName, venue: fullPod?.venue || "", season_cost: String(totalCost), max_members: String(maxMembers) });
                    setSettingsErr(null);
                  }}
                  style={{ padding: "4px 10px", background: "transparent",
                    border: `1px solid ${T.lime}55`, borderRadius: 6,
                    color: T.lime, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  {editPodSettings ? "✕ Cancel" : "Edit"}
                </button>
              </div>

              {editPodSettings ? (
                <div>
                  {[
                    { label: "Pod Name",      key: "name",         type: "text",   placeholder: podName },
                    { label: "Venue",         key: "venue",        type: "text",   placeholder: "e.g. United Center" },
                    { label: "Season Cost ($)",key: "season_cost", type: "number", placeholder: String(totalCost) },
                    { label: "Max Members",   key: "max_members",  type: "number", placeholder: String(maxMembers) },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: T.mist, marginBottom: 4, letterSpacing: 0.5 }}>
                        {label.toUpperCase()}
                      </div>
                      <input
                        type={type}
                        value={podSettingsForm[key] ?? ""}
                        placeholder={placeholder}
                        onChange={e => setPodSettingsForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", background: T.forest,
                          border: `1px solid #1A4A2E`, borderRadius: 8, color: T.white,
                          fontSize: 13, outline: "none", fontFamily: "Calibri,sans-serif",
                          boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                  {settingsErr && (
                    <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>{settingsErr}</div>
                  )}
                  <button
                    onClick={handleSavePodSettings}
                    disabled={savingSettings}
                    style={{ width: "100%", padding: "11px", background: T.lime,
                      border: "none", borderRadius: 8, color: T.dark,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      opacity: savingSettings ? 0.6 : 1 }}>
                    {savingSettings ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              ) : (
                <div>
                  {[
                    { l: "Pod Name",    v: podName },
                    { l: "Team",        v: teamName },
                    { l: "Venue",       v: fullPod?.venue || "—" },
                    { l: "Season Cost", v: totalCost > 0 ? `$${totalCost.toLocaleString()}` : "—" },
                    { l: "Max Members", v: maxMembers },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between",
                      padding: "7px 0", borderBottom: "1px solid #1A4A2E", fontSize: 12 }}>
                      <span style={{ color: T.mist }}>{l}</span>
                      <span style={{ color: T.chalk, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Invite Link ── */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 6 }}>🔗 Pod Invite Link</div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
                Share this link with anyone you want to invite. They'll see your pod details and can join in one tap.
              </div>

              {fullPod?.invite_code ? (
                <>
                  {/* URL display */}
                  <div style={{ background: "#0D1F12", borderRadius: 8, padding: "9px 12px",
                    marginBottom: 10, fontFamily: "monospace", fontSize: 11,
                    color: T.lime, wordBreak: "break-all", border: "1px solid #1A4A2E" }}>
                    {window.location.origin}/join/{fullPod.invite_code}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleCopyInviteLink}
                      style={{ flex: 1, padding: "10px", background: linkCopied ? T.teal : T.lime,
                        border: "none", borderRadius: 8, color: T.dark,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        transition: "background 0.2s" }}>
                      {linkCopied ? "✓ Copied!" : "📋 Copy Link"}
                    </button>

                    {navigator.share && (
                      <button
                        onClick={() => navigator.share({
                          title: `Join ${podName} on HalfTime`,
                          text: `I'm inviting you to my season ticket pod. Tap to join:`,
                          url: `${window.location.origin}/join/${fullPod.invite_code}`,
                        })}
                        style={{ flex: 1, padding: "10px", background: "transparent",
                          border: `1px solid ${T.lime}55`, borderRadius: 8,
                          color: T.lime, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ↗ Share
                      </button>
                    )}

                    <button
                      onClick={handleRegenInviteCode}
                      disabled={regenBusy}
                      title="Generate a new link — old link stops working"
                      style={{ padding: "10px 12px", background: "transparent",
                        border: `1px solid ${T.amber}44`, borderRadius: 8,
                        color: T.amber, fontSize: 11, fontWeight: 700,
                        cursor: regenBusy ? "not-allowed" : "pointer",
                        opacity: regenBusy ? 0.6 : 1 }}>
                      {regenBusy ? "…" : "🔄 New Link"}
                    </button>
                  </div>

                  <div style={{ fontSize: 10, color: T.mist, marginTop: 8 }}>
                    Code: <strong style={{ color: T.lime, fontFamily: "monospace",
                      letterSpacing: 1 }}>{fullPod.invite_code}</strong> ·
                    "New Link" revokes this code and generates a fresh one.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: T.mist }}>
                  No invite code yet — run the 010 migration in Supabase.
                </div>
              )}
            </Card>

            {/* ── Pod status ── */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 10 }}>🏟️ Pod Status</div>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: T.chalk }}>
                    Currently <strong style={{ color: fullPod?.status === "active" ? T.lime : T.amber }}>
                      {fullPod?.status === "active" ? "Active" : "Recruiting"}
                    </strong>
                  </div>
                  <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                    {fullPod?.status === "active"
                      ? "Members can't join unless you switch to Recruiting"
                      : "Pod is accepting new members"}
                  </div>
                </div>
                <button
                  onClick={handleTogglePodStatus}
                  disabled={statusBusy}
                  style={{
                    padding: "7px 14px", background: "transparent",
                    border: `1px solid ${fullPod?.status === "active" ? T.amber + "66" : T.lime + "66"}`,
                    borderRadius: 8, color: fullPod?.status === "active" ? T.amber : T.lime,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>
                  {statusBusy ? "…" : fullPod?.status === "active" ? "Set Recruiting" : "Set Active"}
                </button>
              </div>
            </Card>

            {/* ── Send announcement ── */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 10 }}>📢 Send Announcement</div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
                Broadcasts a pinned message to the pod chat.
              </div>
              <textarea
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                placeholder="e.g. Reminder: playoff tickets go on sale Friday — check your email!"
                rows={3}
                style={{
                  width: "100%", padding: "10px 12px", background: T.forest,
                  border: `1px solid #1A4A2E`, borderRadius: 8, color: T.white,
                  fontSize: 12, outline: "none", fontFamily: "Calibri,sans-serif",
                  resize: "none", boxSizing: "border-box", marginBottom: 10,
                }}
              />
              <button
                onClick={handleSendAnnouncement}
                disabled={!announcement.trim() || announceBusy}
                style={{
                  width: "100%", padding: "11px", background: announceOk ? T.teal : T.lime,
                  border: "none", borderRadius: 8, color: T.dark,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  opacity: (!announcement.trim() || announceBusy) ? 0.6 : 1,
                  transition: "background 0.2s",
                }}>
                {announceBusy ? "Sending…" : announceOk ? "✓ Sent!" : "Send to Pod Chat →"}
              </button>
            </Card>

            {/* ── Playoff Bid Auction ── */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 6 }}>🏆 Playoff Bid Auction</div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 12, lineHeight: 1.6 }}>
                For marquee and playoff games, run a bid-credits auction. Members spend credits
                to compete for the seat — the highest bid wins. Losers keep their credits.
              </div>
              <button
                onClick={() => dispatch({ type: "SET_SCREEN", screen: "bids" })}
                style={{
                  width: "100%", padding: "12px",
                  background: "transparent",
                  border: `1px solid ${T.amber}55`,
                  borderRadius: 8, color: T.amber,
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                🏆 Manage Bid Auctions →
              </button>
            </Card>

            {/* ── Member management ── */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 12 }}>👥 Member Management</div>

              {members.map((m, idx) => {
                const isEditing  = editShareFor === m.id;
                const isRemoving = removingId   === m.id;
                const isConfirm  = removeConfirm === m.id;
                return (
                  <div key={m.id ?? idx} style={{
                    padding: "10px 0",
                    borderBottom: idx < members.length - 1 ? "1px solid #1A4A2E" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Avatar initials={m.initials} size={32} color={m.color} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700,
                            color: m.isMe ? T.lime : T.white }}>
                            {m.name}{m.isMe ? " (You)" : ""}
                          </div>
                          <div style={{ fontSize: 10, color: T.mist }}>
                            {m.share}% · {m.credits} credits · {m.escrowFunded ? "✓ Funded" : "⏳ Pending"}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons — don't show for self */}
                      {!m.isMe && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => {
                              setEditShareFor(isEditing ? null : m.id);
                              setEditShareVal(String(m.share));
                            }}
                            style={{
                              padding: "4px 10px", background: "transparent",
                              border: `1px solid ${T.teal}55`, borderRadius: 6,
                              color: T.teal, fontSize: 10, fontWeight: 700, cursor: "pointer",
                            }}>
                            {isEditing ? "✕" : "Edit %"}
                          </button>
                          <button
                            onClick={() => setAwardCreditsFor(awardCreditsFor === m.id ? null : m.id)}
                            style={{
                              padding: "4px 10px", background: "transparent",
                              border: `1px solid ${T.lime}55`, borderRadius: 6,
                              color: T.lime, fontSize: 10, fontWeight: 700, cursor: "pointer",
                            }}>
                            🎯 Credits
                          </button>
                          {!isConfirm && (
                            <button
                              onClick={() => setRemoveConfirm(m.id)}
                              style={{
                                padding: "4px 10px", background: "transparent",
                                border: `1px solid ${T.red}55`, borderRadius: 6,
                                color: T.red, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              }}>
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Share % editor */}
                    {isEditing && (
                      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, display: "flex", alignItems: "center",
                          background: T.forest, border: `1px solid #1A4A2E`,
                          borderRadius: 8, padding: "6px 10px" }}>
                          <input
                            type="number"
                            value={editShareVal}
                            onChange={e => setEditShareVal(e.target.value)}
                            min="1" max="99" step="0.5"
                            style={{ flex: 1, background: "transparent", border: "none",
                              color: T.white, fontSize: 13, outline: "none",
                              fontFamily: "Georgia,serif", fontWeight: 700, width: "100%" }}
                          />
                          <span style={{ fontSize: 11, color: T.mist }}>%</span>
                        </div>
                        <button onClick={() => handleSaveShare(m.id)}
                          style={{ padding: "8px 14px", background: T.lime, border: "none",
                            borderRadius: 8, color: T.dark, fontSize: 12,
                            fontWeight: 700, cursor: "pointer" }}>
                          Save
                        </button>
                      </div>
                    )}

                    {/* Award bid credits panel */}
                    {awardCreditsFor === m.id && (
                      <div style={{ marginTop: 10, background: `${T.lime}08`,
                        border: `1px solid ${T.lime}33`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: T.lime, fontWeight: 700, marginBottom: 8 }}>
                          🎯 Award bid credits to {m.name}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginBottom: 8 }}>
                          Current balance: <strong style={{ color: T.chalk }}>{m.credits} credits</strong>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          {[5, 10, 25, 50].map(amt => (
                            <button key={amt} onClick={() => setAwardAmount(String(amt))}
                              style={{
                                flex: 1, padding: "6px", background: awardAmount === String(amt) ? T.lime : "transparent",
                                border: `1px solid ${T.lime}44`, borderRadius: 6,
                                color: awardAmount === String(amt) ? T.dark : T.lime,
                                fontSize: 11, fontWeight: 700, cursor: "pointer",
                              }}>
                              +{amt}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setAwardCreditsFor(null)}
                            style={{ flex: 1, padding: "8px", background: "transparent",
                              border: `1px solid #1A4A2E`, borderRadius: 6, color: T.mist,
                              fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Cancel
                          </button>
                          <button onClick={() => handleAwardCredits(m.id)} disabled={awardBusy}
                            style={{ flex: 2, padding: "8px", background: T.lime,
                              border: "none", borderRadius: 6, color: T.dark,
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                              opacity: awardBusy ? 0.6 : 1 }}>
                            {awardBusy ? "Awarding…" : `Award +${awardAmount} credits`}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Remove confirmation */}
                    {isConfirm && (
                      <div style={{ marginTop: 10, background: `${T.red}10`,
                        border: `1px solid ${T.red}33`, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 11, color: T.red, fontWeight: 700, marginBottom: 8 }}>
                          Remove {m.name} from the pod?
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setRemoveConfirm(null)}
                            style={{ flex: 1, padding: "7px", background: "transparent",
                              border: `1px solid #1A4A2E`, borderRadius: 6, color: T.mist,
                              fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Cancel
                          </button>
                          <button onClick={() => handleRemoveMember(m.id)}
                            disabled={isRemoving}
                            style={{ flex: 1, padding: "7px", background: T.red,
                              border: "none", borderRadius: 6, color: T.white,
                              fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            {isRemoving ? "Removing…" : "Yes, Remove"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* ── Danger Zone ── */}
            {fullPod?.status !== "active" && (
              <Card style={{ marginBottom: 12, border: `1px solid ${T.red}33` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.red,
                  fontFamily: "Georgia,serif", marginBottom: 6 }}>🗑️ Danger Zone</div>
                <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6, marginBottom: 14 }}>
                  Permanently deletes this pod and removes all members, games, and assignments.
                  This cannot be undone.{" "}
                  {members.some(m => m.escrowFunded) && (
                    <span style={{ color: T.teal }}>
                      HalfTime will automatically refund all funded members before deleting.
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setDeleteErr(null); setShowDeleteConfirm(true); }}
                  style={{ width: "100%", padding: "11px", background: "transparent",
                    border: `1px solid ${T.red}66`, borderRadius: 8,
                    color: T.red, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Delete Pod
                </button>
              </Card>
            )}
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

    {/* ── Dispute modal ── */}
    {showDisputeModal && (
      <div onClick={() => setShowDisputeModal(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
            borderBottom: "none",
            padding: "24px 20px calc(env(safe-area-inset-bottom,0px) + 32px)",
            maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: T.green, margin: "0 auto 20px" }} />

          <div style={{ fontSize: 22, textAlign: "center", marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 4 }}>
            Report an Issue
          </div>
          <div style={{ fontSize: 11, color: T.mist, textAlign: "center",
            lineHeight: 1.6, marginBottom: 20 }}>
            HalfTime will review within 48 hours.
            Your escrow is always protected — if an issue can't be resolved, you'll be refunded.
          </div>

          {/* Escrow protection banner */}
          <div style={{ background: `${T.lime}08`, border: `1px solid ${T.lime}22`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 18,
            fontSize: 11, color: T.lime, lineHeight: 1.6, textAlign: "center" }}>
            🔒 Escrow protected — your funds are held securely by HalfTime until the issue is resolved.
          </div>

          {/* Issue type */}
          <div style={{ fontSize: 10, fontWeight: 700, color: T.mist,
            letterSpacing: 1, marginBottom: 8 }}>ISSUE TYPE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {DISPUTE_TYPES.map(({ value, label }) => (
              <button key={value}
                onClick={() => setDisputeType(value)}
                style={{ padding: "10px 14px", borderRadius: 10, textAlign: "left",
                  background: disputeType === value ? `${T.lime}15` : "#0D1F12",
                  border: `1px solid ${disputeType === value ? T.lime : "#1A4A2E"}`,
                  color: disputeType === value ? T.lime : T.mist,
                  fontSize: 12, fontWeight: disputeType === value ? 700 : 400,
                  cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Description */}
          <div style={{ fontSize: 10, fontWeight: 700, color: T.mist,
            letterSpacing: 1, marginBottom: 6 }}>DESCRIBE THE ISSUE</div>
          <textarea
            value={disputeDesc}
            onChange={e => setDisputeDesc(e.target.value)}
            placeholder="What happened? Be as specific as possible — dates, amounts, what was promised vs. what occurred."
            rows={4}
            style={{ width: "100%", padding: "10px 12px", background: "#0D1F12",
              border: "1px solid #1A4A2E", borderRadius: 8, color: T.white,
              fontSize: 12, fontFamily: "Calibri,sans-serif",
              outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 6 }}
          />
          {disputeErr && (
            <div style={{ fontSize: 11, color: T.red, marginBottom: 10 }}>{disputeErr}</div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={() => { setShowDisputeModal(false); setDisputeDesc(""); setDisputeErr(null); }}
              style={{ flex: 1, padding: "12px 0", background: "transparent",
                border: "1px solid #1A4A2E", borderRadius: 10,
                color: T.mist, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              disabled={disputeBusy}
              onClick={async () => {
                setDisputeErr(null);
                setDisputeBusy(true);
                try {
                  await fileDispute(activePodId, disputeType, disputeDesc);
                  setShowDisputeModal(false);
                  setDisputeDesc("");
                  setDisputeDone(true);
                } catch (e) {
                  setDisputeErr(e.message);
                } finally {
                  setDisputeBusy(false);
                }
              }}
              style={{ flex: 2, padding: "12px 0",
                background: disputeBusy ? T.mist : T.red,
                color: T.white, border: "none", borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: disputeBusy ? "not-allowed" : "pointer" }}>
              {disputeBusy ? "Submitting…" : "Submit Dispute →"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Leave pod confirmation modal ── */}
    {showLeaveConfirm && (
      <div
        onClick={() => setShowLeaveConfirm(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.red}44`,
            borderBottom: "none",
            padding: "24px 20px calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: "#1A4A2E", margin: "0 auto 20px" }} />

          <div style={{ fontSize: 24, textAlign: "center", marginBottom: 8 }}>🚪</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 8 }}>
            Leave "{podName}"?
          </div>
          <div style={{ fontSize: 12, color: T.mist, textAlign: "center",
            lineHeight: 1.6, marginBottom: 20 }}>
            You'll be removed from the pod and lose your seat allocation.
            {myEscrowFunded ? (
              <div style={{ marginTop: 10, background: `${T.teal}12`,
                border: `1px solid ${T.teal}33`, borderRadius: 8,
                padding: "10px 14px", textAlign: "left" }}>
                <div style={{ fontSize: 11, color: T.teal, fontWeight: 700, marginBottom: 4 }}>
                  💰 Escrow refund
                </div>
                <div style={{ fontSize: 11, color: T.teal, opacity: 0.85, lineHeight: 1.5 }}>
                  Your escrow payment of ${myAmount.toFixed(2)} will be refunded to your
                  original payment method via Stripe within 5–10 business days.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, background: "#ffffff06",
                border: "1px solid #1A4A2E", borderRadius: 8,
                padding: "10px 14px", textAlign: "left" }}>
                <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.5 }}>
                  You haven't funded your escrow yet, so there's nothing to refund.
                </div>
              </div>
            )}
          </div>

          {leaveErr && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
              borderRadius: 8, padding: "10px 14px", color: T.red,
              fontSize: 12, textAlign: "center", marginBottom: 14 }}>
              {leaveErr}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setShowLeaveConfirm(false)}
              style={{ flex: 1, padding: "13px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Stay
            </button>
            <button
              onClick={handleLeavePod}
              disabled={leaveBusy}
              style={{ flex: 1, padding: "13px", background: T.red,
                border: "none", borderRadius: 10, color: T.white,
                fontSize: 13, fontWeight: 700,
                cursor: leaveBusy ? "not-allowed" : "pointer",
                opacity: leaveBusy ? 0.6 : 1 }}>
              {leaveBusy
                ? (myEscrowFunded ? "Refunding…" : "Leaving…")
                : "Yes, Leave Pod"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Delete pod confirmation modal ── */}
    {showDeleteConfirm && (
      <div
        onClick={() => setShowDeleteConfirm(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
          zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 430, background: T.dark,
            borderRadius: "20px 20px 0 0", border: `1px solid ${T.red}44`,
            borderBottom: "none",
            padding: "24px 20px calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: "#1A4A2E", margin: "0 auto 20px" }} />

          <div style={{ fontSize: 24, textAlign: "center", marginBottom: 8 }}>🗑️</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", textAlign: "center", marginBottom: 8 }}>
            Delete "{podName}"?
          </div>
          <div style={{ fontSize: 12, color: T.mist, textAlign: "center",
            lineHeight: 1.6, marginBottom: 20 }}>
            This permanently deletes the pod, removes all members, and
            wipes all games and assignments.{" "}
            <strong style={{ color: T.red }}>This cannot be undone.</strong>
            {members.some(m => m.escrowFunded) && (
              <div style={{ marginTop: 10, background: `${T.teal}12`,
                border: `1px solid ${T.teal}33`, borderRadius: 8,
                padding: "10px 14px", textAlign: "left" }}>
                <div style={{ fontSize: 11, color: T.teal, fontWeight: 700, marginBottom: 4 }}>
                  💰 Automatic refunds
                </div>
                <div style={{ fontSize: 11, color: T.teal, opacity: 0.85, lineHeight: 1.5 }}>
                  {members.filter(m => m.escrowFunded).length} member
                  {members.filter(m => m.escrowFunded).length !== 1 ? "s have" : " has"} funded
                  escrow. HalfTime will automatically issue Stripe refunds to{" "}
                  {members.filter(m => m.escrowFunded).length !== 1 ? "all of them" : "them"} before
                  deleting. Funds appear within 5–10 business days.
                </div>
              </div>
            )}
          </div>

          {deleteErr && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
              borderRadius: 8, padding: "10px 14px", color: T.red,
              fontSize: 12, textAlign: "center", marginBottom: 14 }}>
              {deleteErr}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{ flex: 1, padding: "13px", background: "transparent",
                border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={handleDeletePod}
              disabled={deleteBusy}
              style={{ flex: 1, padding: "13px", background: T.red,
                border: "none", borderRadius: 10, color: T.white,
                fontSize: 13, fontWeight: 700,
                cursor: deleteBusy ? "not-allowed" : "pointer",
                opacity: deleteBusy ? 0.6 : 1 }}>
              {deleteBusy
                ? (members.some(m => m.escrowFunded) ? "Refunding & Deleting…" : "Deleting…")
                : "Yes, Delete Pod"}
            </button>
          </div>
        </div>
      </div>
    )}

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

    {/* Invite modal */}
    {showInvite && fullPod?.invite_code && (
      <InviteModal
        podName={podName}
        inviteCode={fullPod.invite_code}
        onClose={() => setShowInvite(false)}
      />
    )}
    </>
  );
}

// ── Invite Modal ───────────────────────────────────────────────────────────────
function InviteModal({ podName, inviteCode, onClose }) {
  const [copied, setCopied] = useState(false);
  const appUrl = window.location.origin;
  const url    = `${appUrl}/join/${inviteCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${podName} on HalfTime`,
          text:  `I'm inviting you to join my season ticket pod. Use code ${inviteCode} or tap the link:`,
          url,
        });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.88)",
      zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 430, background: T.dark,
        borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
        borderBottom: "none", padding: "20px 20px 36px" }}>

        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2,
          background: T.green, margin: "0 auto 18px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ color: T.white, fontSize: 17, fontWeight: 700,
            fontFamily: "Georgia,serif", margin: 0 }}>Invite a Member</h3>
          <button onClick={onClose}
            style={{ background: T.forest, border: "none", color: T.mist,
              width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>

        {/* Invite code */}
        <div style={{ background: T.forest, border: `1px solid ${T.green}`,
          borderRadius: 14, padding: "16px 20px",
          textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.mist, textTransform: "uppercase",
            letterSpacing: "0.1em", marginBottom: 8 }}>Pod invite code</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: T.lime,
            fontFamily: "Georgia,serif", letterSpacing: "0.15em" }}>{inviteCode}</div>
          <div style={{ fontSize: 11, color: T.mist, marginTop: 6 }}>
            Share the code or the link below
          </div>
        </div>

        {/* Link preview */}
        <div style={{ background: "#ffffff08", borderRadius: 10,
          padding: "10px 14px", marginBottom: 16,
          fontSize: 12, color: T.mist, wordBreak: "break-all",
          fontFamily: "monospace" }}>
          {url}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleCopy}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10,
              border: `1.5px solid ${copied ? T.teal : T.lime}`,
              background: "transparent",
              color: copied ? T.teal : T.lime,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              transition: "all 0.2s" }}>
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
          <button onClick={handleShare}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10,
              border: "none", background: T.lime, color: T.dark,
              fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Share →
          </button>
        </div>

        <p style={{ color: T.mist, fontSize: 11, textAlign: "center",
          margin: "14px 0 0", lineHeight: 1.5 }}>
          Anyone with this link can request to join your pod.
          They'll need to fund their escrow share to be fully active.
        </p>
      </div>
    </div>
  );
}
