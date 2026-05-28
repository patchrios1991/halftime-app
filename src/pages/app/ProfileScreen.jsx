// ─── ProfileScreen ────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Card from "../../components/Card";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useActivePod } from "../../context/ActivePodContext";
import { useCurrentUserId } from "../../hooks/useCurrentUserId";
import { usePushSubscription } from "../../hooks/usePushSubscription";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

// ─── Achievement definitions ──────────────────────────────────────────────────
const ACHIEVEMENT_DEFS = [
  { key: "bidWinner",  icon: "🎯", title: "Bid Winner",  desc: "Won a playoff bid auction"  },
  { key: "podFounder", icon: "🤝", title: "Pod Founder", desc: "Created a season ticket pod" },
  { key: "resalePro",  icon: "♻️", title: "Resale Pro",  desc: "Completed a ticket resale"   },
  { key: "loyalFan",   icon: "🎖️", title: "Loyal Fan",   desc: "HalfTime member for 30+ days" },
];

// Auto-compute initials from display name
function computeInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0] || "YO").toUpperCase();
}

export default function ProfileScreen({ profile, dispatch, signOut }) {
  const navigate = useNavigate();
  const { pods } = useMyPods();
  const currentUserId = useCurrentUserId();
  const { activePodId } = useActivePod();
  const { members } = usePod(activePodId);
  const push = usePushSubscription();

  // ── View values ──────────────────────────────────────────────────────────────
  const [displayName,    setDisplayName]    = useState(profile?.display_name    ?? "");
  const [avatarInitials, setAvatarInitials] = useState(profile?.avatar_initials ?? "YO");

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const [editing,   setEditing]   = useState(false);
  const [editName,  setEditName]  = useState(displayName);
  const [editInits, setEditInits] = useState(avatarInitials);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState(null); // { ok: bool, text: string }

  // ── Dynamic achievements ─────────────────────────────────────────────────────
  const [userId,       setUserId]       = useState(null);
  const [achievements, setAchievements] = useState({
    bidWinner: false, podFounder: false, resalePro: false, loyalFan: false,
  });

  // ── Account modals ───────────────────────────────────────────────────────────
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [showPodAgreements,  setShowPodAgreements]  = useState(false);
  const [showHelp,           setShowHelp]           = useState(false);

  const trustScore = profile?.trust_score ?? 0;
  const bidCredits = members.find(m => m.user_id === currentUserId)?.bid_credits ?? 0;
  const isVerified = profile?.verified    ?? false;

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long", year: "numeric",
      })
    : "—";

  // Sync edit fields when edit mode opens
  function openEdit() {
    setEditName(displayName);
    setEditInits(avatarInitials);
    setSaveMsg(null);
    setEditing(true);
  }

  // Auto-compute initials when name changes in edit mode
  function handleEditNameChange(val) {
    setEditName(val);
    if (val.trim()) setEditInits(computeInitials(val));
  }

  async function handleSave() {
    if (!isSupabaseConfigured) {
      setDisplayName(editName || displayName);
      setAvatarInitials(editInits || avatarInitials);
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: editName.trim(), avatar_initials: editInits.trim() })
        .eq("id", user.id);
      if (error) throw error;
      // Update local display
      setDisplayName(editName.trim());
      setAvatarInitials(editInits.trim());
      setSaveMsg({ ok: true, text: "Profile updated!" });
      setTimeout(() => { setSaveMsg(null); setEditing(false); }, 1200);
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try { await signOut?.(); } catch {}
    navigate("/auth/signin", { replace: true });
  }

  // ── Load userId + compute achievements ──────────────────────────────────────
  useEffect(() => {
    async function loadAchievements() {
      if (!isSupabaseConfigured) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? null;
        setUserId(uid);
        if (!uid) return;

        // Bid Winner — any won bid
        const { data: wonBids } = await supabase
          .from("bids")
          .select("id")
          .eq("user_id", uid)
          .eq("status", "won");

        // Resale Pro — any completed payout
        const { data: payouts } = await supabase
          .from("resale_payouts")
          .select("id")
          .eq("user_id", uid);

        // Loyal Fan — account created > 30 days ago
        const loyalFan = profile?.created_at
          ? Date.now() - new Date(profile.created_at).getTime() > 30 * 24 * 60 * 60 * 1000
          : false;

        setAchievements(a => ({
          ...a,
          bidWinner: (wonBids?.length ?? 0) > 0,
          resalePro: (payouts?.length ?? 0) > 0,
          loyalFan,
        }));
      } catch (e) {
        // Non-critical — achievements are cosmetic
        console.warn("achievements fetch:", e.message);
      }
    }
    loadAchievements();
  }, [profile?.created_at]);

  // Pod Founder depends on pods list + userId — update when either changes
  useEffect(() => {
    if (!userId || !pods) return;
    setAchievements(a => ({
      ...a,
      podFounder: pods.some(p => p.captain_id === userId),
    }));
  }, [pods, userId]);

  // ── Stripe Identity KYC ─────────────────────────────────────────────────────
  const [kycBusy,    setKycBusy]    = useState(false);
  const [kycError,   setKycError]   = useState(null);
  const [kycPending, setKycPending] = useState(false);

  async function handleStartVerification() {
    if (isVerified || !isSupabaseConfigured) return;
    setKycBusy(true);
    setKycError(null);

    // Open window BEFORE any await — browsers block window.open inside async chains
    const verifyWindow = window.open("", "_blank");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await supabase.functions.invoke("create-identity-session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const { url } = res.data ?? {};
      if (!url) throw new Error("No verification URL returned");

      // Navigate the already-open window to the Stripe URL
      if (verifyWindow) {
        verifyWindow.location.href = url;
      } else {
        window.location.href = url;
      }
      setKycPending(true);
    } catch (e) {
      if (verifyWindow) verifyWindow.close();
      setKycError(e.message || "Verification failed — please try again");
    } finally {
      setKycBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: T.dark, padding: "28px 16px 20px",
        borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
          <Avatar initials={avatarInitials} size={58} color={T.lime} verified={isVerified} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif" }}>{displayName || "—"}</div>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 5 }}>
              Member since {memberSince}
            </div>
            {isVerified
              ? <Badge color={T.teal}>✓ Fully Verified</Badge>
              : <Badge color={T.amber}>⏳ Pending Verification</Badge>
            }
          </div>
          <button onClick={openEdit} style={{
            padding: "6px 14px", background: "transparent",
            border: `1px solid ${T.lime}55`, borderRadius: 8,
            color: T.lime, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>
            Edit
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[
            { l: "Trust Score", v: `${trustScore}/100` },
            { l: "Pods",        v: `${pods.length} active` },
            { l: "Bid Credits", v: `${bidCredits} pts` },
          ].map(({ l, v }) => (
            <div key={l} style={{ background: "#ffffff08", borderRadius: 8,
              padding: "8px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                fontFamily: "Georgia,serif" }}>{v}</div>
              <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 14 }}>

        {/* ── Edit modal ─────────────────────────────────────────────────── */}
        {editing && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
            zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => { if (!saving) setEditing(false); }}>
            <div style={{ width: "100%", maxWidth: 430, background: T.dark,
              borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
              borderBottom: "none", padding: "24px 20px 40px" }}
              onClick={e => e.stopPropagation()}>

              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 20px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 20 }}>Edit Profile</div>

              {/* Avatar preview */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <Avatar initials={editInits || "YO"} size={64} color={T.lime} />
              </div>

              {/* Display name */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: T.mist, letterSpacing: 1,
                  marginBottom: 6 }}>DISPLAY NAME</div>
                <input
                  value={editName}
                  onChange={e => handleEditNameChange(e.target.value)}
                  placeholder="Your full name"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    background: T.forest, border: `1px solid #1A4A2E`,
                    color: T.white, fontSize: 14, outline: "none",
                    fontFamily: "Calibri,sans-serif",
                  }}
                />
              </div>

              {/* Avatar initials */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: T.mist, letterSpacing: 1,
                  marginBottom: 6 }}>AVATAR INITIALS (2 letters)</div>
                <input
                  value={editInits}
                  onChange={e => setEditInits(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="YO"
                  maxLength={2}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    background: T.forest, border: `1px solid #1A4A2E`,
                    color: T.white, fontSize: 14, outline: "none",
                    fontFamily: "Calibri,sans-serif", letterSpacing: 4,
                  }}
                />
              </div>

              {/* Save message */}
              {saveMsg && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8,
                  background: saveMsg.ok ? `${T.lime}18` : `${T.red}18`,
                  border: `1px solid ${saveMsg.ok ? T.lime : T.red}44`,
                  fontSize: 12, color: saveMsg.ok ? T.lime : T.red }}>
                  {saveMsg.text}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditing(false)} disabled={saving}
                  style={{ flex: 1, padding: "12px", background: "transparent",
                    border: `1px solid #1A4A2E`, borderRadius: 10, color: T.mist,
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    opacity: saving ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !editName.trim()}
                  style={{ flex: 2, padding: "12px", background: T.lime,
                    border: "none", borderRadius: 10, color: T.dark,
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    opacity: (saving || !editName.trim()) ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Push notifications ─────────────────────────────────────────── */}
        {push.supported && (
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  marginBottom: 2 }}>🔔 Push Notifications</div>
                <div style={{ fontSize: 11, color: T.mist }}>
                  {push.subscribed
                    ? "Enabled — you'll get alerts for your pod"
                    : "Get game alerts, resale updates & more"}
                </div>
                {push.error && (
                  <div style={{ fontSize: 10, color: T.red, marginTop: 4 }}>
                    {push.error}
                  </div>
                )}
              </div>
              <button
                onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                disabled={push.loading}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  cursor: push.loading ? "not-allowed" : "pointer",
                  opacity: push.loading ? 0.6 : 1,
                  background: push.subscribed ? "transparent" : T.lime,
                  color: push.subscribed ? T.red : T.dark,
                  border: push.subscribed ? `1px solid ${T.red}55` : "none",
                  flexShrink: 0,
                }}>
                {push.loading ? "…" : push.subscribed ? "Turn Off" : "Enable"}
              </button>
            </div>
          </Card>
        )}

        {/* ── Identity Verification ──────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 10 }}>🪪 Identity Verification</div>

          {isVerified ? (
            <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
              borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: T.teal, fontWeight: 700 }}>
                ✅ Identity verified
              </div>
              <div style={{ fontSize: 10, color: T.mist, marginTop: 3 }}>
                Your identity has been confirmed. Trust score: {trustScore}/100
              </div>
            </div>
          ) : kycPending ? (
            <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
              borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: T.teal, fontWeight: 700, marginBottom: 4 }}>
                ⏳ Verification submitted
              </div>
              <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                Complete the steps in the tab that just opened. Your profile will update automatically once confirmed — usually within a minute.
              </div>
              <div onClick={() => setKycPending(false)}
                style={{ fontSize: 10, color: T.mist, marginTop: 8, cursor: "pointer",
                  textDecoration: "underline" }}>
                Didn't open? Try again →
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 10, lineHeight: 1.6 }}>
                Verify your identity to unlock full pod features, increase your trust score, and build confidence with co-owners.
              </div>
              {kycError && (
                <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>{kycError}</div>
              )}
              <button
                onClick={handleStartVerification}
                disabled={kycBusy || !isSupabaseConfigured}
                style={{
                  width: "100%", padding: "11px", background: T.lime, border: "none",
                  borderRadius: 8, color: T.dark, fontSize: 13, fontWeight: 700,
                  cursor: kycBusy ? "not-allowed" : "pointer",
                  opacity: kycBusy ? 0.6 : 1,
                }}>
                {kycBusy ? "Opening verification…" : "Verify My Identity →"}
              </button>
              <div style={{ fontSize: 10, color: T.mist, textAlign: "center", marginTop: 6 }}>
                Powered by Stripe Identity · Takes ~2 min · Bank-level secure
              </div>
            </div>
          )}
        </Card>

        {/* ── Account settings ───────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 12 }}>⚙️ Account</div>
          {[
            { label: "Payment Methods",        icon: "💳", onClick: () => setShowPaymentMethods(true) },
            { label: "Playoff Rights Manager", icon: "🏆", onClick: () => dispatch({ type: "SET_SCREEN", screen: "bids" }) },
            { label: "Pod Agreements",         icon: "📋", onClick: () => setShowPodAgreements(true) },
            { label: "Help & Support",         icon: "💬", onClick: () => setShowHelp(true) },
          ].map((item, i, arr) => (
            <div
              key={item.label}
              onClick={item.onClick}
              style={{
                padding: "13px 0",
                borderBottom: i < arr.length - 1 ? "1px solid #1A4A2E" : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 12, color: T.chalk, cursor: "pointer",
                minHeight: 44,
              }}
            >
              <span>{item.icon} {item.label}</span>
              <span style={{ color: T.mist, fontSize: 16 }}>›</span>
            </div>
          ))}
        </Card>

        {/* ── Achievements ───────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 4 }}>🏆 Achievements</div>
          <div style={{ fontSize: 10, color: T.mist, marginBottom: 12 }}>
            Earn badges by using HalfTime features
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ACHIEVEMENT_DEFS.map(({ key, icon, title, desc }) => {
              const unlocked = achievements[key];
              return (
                <div
                  key={key}
                  title={desc}
                  style={{
                    background: unlocked ? `${T.lime}12` : "#ffffff06",
                    border: `1px solid ${unlocked ? T.lime + "33" : "#1A4A2E"}`,
                    borderRadius: 10, padding: "10px 8px",
                    textAlign: "center", minWidth: 72, flex: "1 1 72px",
                    opacity: unlocked ? 1 : 0.45,
                    transition: "opacity 0.2s",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>
                    {unlocked ? icon : "🔒"}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 700,
                    color: unlocked ? T.lime : T.mist,
                  }}>
                    {title}
                  </div>
                  {unlocked && (
                    <div style={{ fontSize: 8, color: T.mist, marginTop: 2, lineHeight: 1.3 }}>
                      {desc}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Payment Methods modal ──────────────────────────────────────── */}
        {showPaymentMethods && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
              zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowPaymentMethods(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 430, background: T.dark,
                borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
                borderBottom: "none", padding: "24px 20px 44px" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 20px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 6 }}>💳 Payment Methods</div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 20, lineHeight: 1.7 }}>
                Your payment details are stored securely by Stripe. You can update or add a card
                when you fund your pod escrow — your card is never stored on HalfTime's servers.
              </div>
              <div style={{ background: `${T.lime}08`, border: `1px solid ${T.lime}22`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: T.lime, fontWeight: 700, marginBottom: 4 }}>
                  🔒 Bank-level security
                </div>
                <div style={{ fontSize: 10, color: T.mist, lineHeight: 1.6 }}>
                  Powered by Stripe · PCI DSS Level 1 Compliant · FDIC-insured escrow
                </div>
              </div>
              <button
                onClick={() => { setShowPaymentMethods(false); dispatch({ type: "SET_SCREEN", screen: "pod" }); }}
                style={{ width: "100%", padding: "12px", background: T.lime,
                  border: "none", borderRadius: 10, color: T.dark,
                  fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Manage via Escrow →
              </button>
            </div>
          </div>
        )}

        {/* ── Pod Agreements modal ───────────────────────────────────────── */}
        {showPodAgreements && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
              zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowPodAgreements(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 430, background: T.dark,
                borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
                borderBottom: "none", padding: "24px 20px 44px",
                maxHeight: "80vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 20px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 6 }}>📋 Pod Agreements</div>
              <div style={{ fontSize: 11, color: T.mist, marginBottom: 16, lineHeight: 1.6 }}>
                Standard HalfTime pod rules that apply to all members. Pod-specific rules
                are visible in your pod's Rules tab.
              </div>
              {[
                ["Playoff rule",       "Bid credits auction, minimum 24h notice"],
                ["Resale policy",      "Any member may resell; net proceeds split by share %"],
                ["No-show policy",     "72h notice required to release a game back to the pod"],
                ["Default penalty",    "Security deposit forfeited; member removed from pod"],
                ["Dispute resolution", "HalfTime mediation → binding arbitration"],
                ["Renewals",           "Pod has first right of refusal on season renewal"],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: "10px 0", borderBottom: "1px solid #1A4A2E",
                  display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 11, color: T.mist, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 11, color: T.chalk, fontWeight: 600,
                    textAlign: "right" }}>{v}</span>
                </div>
              ))}
              <div style={{ fontSize: 9, color: T.mist, textAlign: "center", marginTop: 16 }}>
                Rules recorded on-chain · Last updated {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
              <button
                onClick={() => setShowPodAgreements(false)}
                style={{ marginTop: 20, width: "100%", padding: "12px",
                  background: "transparent", border: `1px solid #1A4A2E`,
                  borderRadius: 10, color: T.mist, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Help & Support modal ───────────────────────────────────────── */}
        {showHelp && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.9)",
              zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowHelp(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 430, background: T.dark,
                borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
                borderBottom: "none", padding: "24px 20px 44px",
                maxHeight: "85vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 20px" }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif", marginBottom: 16 }}>💬 Help & Support</div>

              {/* FAQ */}
              {[
                {
                  q: "How does escrow work?",
                  a: "Each member funds their share of the season ticket cost into a Stripe-protected escrow account. Once the pod is fully funded, the captain receives the payout automatically.",
                },
                {
                  q: "What are bid credits?",
                  a: "Bid credits let members compete for marquee and playoff game seats. Everyone starts with 100 credits. Bid credits for the game you want most — the highest bid wins, and losers keep theirs.",
                },
                {
                  q: "How does resale work?",
                  a: "Any member can list an allocated game on the HalfTime marketplace. Proceeds (minus 8% platform fee) are distributed proportionally by share %.",
                },
                {
                  q: "What if I can't attend a game?",
                  a: "Give 72 hours notice in the pod chat so another member can take your seat. No-shows may result in penalty per your pod agreement.",
                },
                {
                  q: "How do I leave a pod?",
                  a: "Contact your pod captain or reach out to support. Leaving after escrow is funded may result in forfeiture of your deposit per the pod agreement.",
                },
              ].map(({ q, a }) => (
                <div key={q} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
                    marginBottom: 4 }}>{q}</div>
                  <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.7 }}>{a}</div>
                </div>
              ))}

              <div style={{ height: 1, background: "#1A4A2E", margin: "20px 0" }} />

              {/* Contact */}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 8 }}>
                Still need help?
              </div>
              <a
                href="mailto:support@halftime-app.com"
                style={{
                  display: "block", width: "100%", padding: "13px",
                  background: T.lime, border: "none", borderRadius: 10,
                  color: T.dark, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", textAlign: "center", textDecoration: "none",
                }}
              >
                ✉️ Email Support
              </a>
              <div style={{ fontSize: 10, color: T.mist, textAlign: "center", marginTop: 8 }}>
                support@halftime-app.com · We reply within 24h
              </div>
            </div>
          </div>
        )}

        {/* ── Sign out ───────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 0", textAlign: "center" }}>
          <div onClick={handleSignOut}
            style={{ fontSize: 12, color: T.red, cursor: "pointer", fontWeight: 600 }}>
            Log Out
          </div>
        </div>
      </div>
    </div>
  );
}
