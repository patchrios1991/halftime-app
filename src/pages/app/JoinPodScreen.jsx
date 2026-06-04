// ─── JoinPodScreen ────────────────────────────────────────────────────────────
// Public page shown when someone opens an invite link: /join/:code
// Works for logged-in and logged-out users alike.
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { supabase } from "../../lib/supabase";
import { getPodByInviteCode, joinPod } from "../../api/pods";
import { notify } from "../../lib/notify";
import { friendlyError } from "../../lib/friendlyError";

const SPORT_EMOJI = { basketball: "🏀", football: "🏈", baseball: "⚾", hockey: "🏒", soccer: "⚽" };

export default function JoinPodScreen() {
  const { code }   = useParams();
  const navigate   = useNavigate();

  const [pod,               setPod]               = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [fetchErr,          setFetchErr]          = useState(null);
  const [user,              setUser]              = useState(undefined); // undefined = not yet checked
  const [joining,           setJoining]           = useState(false);
  const [joined,            setJoined]            = useState(false);
  const [joinErr,           setJoinErr]           = useState(null);
  const [showSeatMap,       setShowSeatMap]       = useState(false);

  // Waitlist state (when pod is full)
  const [waitlistEmail,     setWaitlistEmail]     = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistBusy,      setWaitlistBusy]      = useState(false);

  useEffect(() => {
    // Resolve auth + pod in parallel
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    getPodByInviteCode(code)
      .then(setPod)
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleJoin() {
    if (!user) {
      // Save return URL so AuthCallback redirects back here after sign-in
      sessionStorage.setItem("auth_return", `/join/${code}`);
      navigate("/auth/signin");
      return;
    }

    setJoining(true);
    setJoinErr(null);
    try {
      await joinPod(pod.id);
      setJoined(true);
      // Notify the captain a new member joined (skip if user IS the captain)
      if (pod.captain_id && pod.captain_id !== user?.id) {
        notify({
          userId: pod.captain_id,
          type:   "member_joined",
          title:  "🎉 New member joined!",
          body:   `Someone just joined ${pod.name} via your invite link. Open the Pod tab to review.`,
          url:    "/app",
        });
      }
      setTimeout(() => navigate("/app"), 2500);
    } catch (e) {
      setJoinErr(friendlyError(e));
      setJoining(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading || user === undefined) {
    return (
      <Screen>
        <Wordmark size={24} />
        <div style={{ width: 36, height: 36, borderRadius: "50%",
          border: `3px solid ${T.green}`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Screen>
    );
  }

  // ── Invalid code ───────────────────────────────────────────────────────────
  if (fetchErr || !pod) {
    return (
      <Screen>
        <Wordmark size={24} />
        <div style={{ fontSize: 48 }}>🤔</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif" }}>Pod not found</div>
        <p style={{ color: T.mist, fontSize: 14, textAlign: "center",
          lineHeight: 1.6, margin: 0, maxWidth: 280 }}>
          This invite link may have expired or the pod code is incorrect.
          Ask your captain to share a fresh link.
        </p>
        <button onClick={() => navigate("/")}
          style={{ padding: "12px 28px", background: T.lime, color: T.dark,
            border: "none", borderRadius: 10, fontWeight: 700,
            fontSize: 14, cursor: "pointer" }}>
          Go home
        </button>
      </Screen>
    );
  }

  // ── Joined successfully ────────────────────────────────────────────────────
  if (joined) {
    return (
      <Screen>
        <Wordmark size={24} />
        <div style={{ fontSize: 52 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.lime,
          fontFamily: "Georgia,serif" }}>You're in!</div>
        <p style={{ color: T.chalk, fontSize: 14, textAlign: "center",
          lineHeight: 1.6, margin: 0 }}>
          Welcome to <strong>{pod.name}</strong>. Taking you to your pod…
        </p>
      </Screen>
    );
  }

  // ── Pod preview ────────────────────────────────────────────────────────────
  const memberCount = pod.pod_members?.[0]?.count ?? 0;
  const spotsLeft   = (pod.max_members || 6) - memberCount;
  const usedPct     = memberCount === 0 ? 0 : (100 - (pod.captain_share || 25));
  const myEstimate  = spotsLeft > 0
    ? ((parseFloat(pod.season_cost || 0) * ((100 - (pod.captain_share || 25)) / spotsLeft)) / 100)
    : 0;
  const emoji = SPORT_EMOJI[pod.sport?.toLowerCase()] ?? pod.sport_emoji ?? "🏟️";
  const isFull = spotsLeft <= 0;
  const isRecruiting = pod.status === "recruiting";

  return (
    <Screen>
      <Wordmark size={24} />

      {/* Pod card */}
      <div style={{ width: "100%", maxWidth: 360, background: T.forest,
        border: `1px solid ${T.green}`, borderRadius: 18, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${T.dark}, #0D2B1A)`,
          padding: "22px 20px 16px", borderBottom: `1px solid ${T.green}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 40 }}>{emoji}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
                fontFamily: "Georgia,serif" }}>{pod.name}</div>
              <div style={{ fontSize: 11, color: T.mist }}>
                {pod.team_name} · Season {pod.season || "2025-26"}
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                <div style={{ display: "inline-block",
                  background: isRecruiting ? `${T.lime}22` : `${T.amber}22`,
                  border: `1px solid ${isRecruiting ? T.lime : T.amber}44`,
                  borderRadius: 20, padding: "2px 10px",
                  fontSize: 10, fontWeight: 700,
                  color: isRecruiting ? T.lime : T.amber }}>
                  {isRecruiting ? "Open for members" : "Pod active"}
                </div>
                {pod.pod_type === "group_buy" && (
                  <div style={{ display: "inline-block",
                    background: `${T.teal}22`, border: `1px solid ${T.teal}44`,
                    borderRadius: 20, padding: "2px 10px",
                    fontSize: 10, fontWeight: 700, color: T.teal }}>
                    🛒 Group Buy
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1, background: T.green }}>
          {[
            { l: "Members",   v: `${memberCount}/${pod.max_members || 6}` },
            { l: "Spots left", v: isFull ? "Full" : spotsLeft },
            { l: "Est. cost",  v: myEstimate > 0 ? `$${Math.round(myEstimate)}` : "—" },
          ].map(({ l, v }) => (
            <div key={l} style={{ background: T.forest, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.lime,
                fontFamily: "Georgia,serif" }}>{v}</div>
              <div style={{ fontSize: 9, color: T.mist, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* About */}
        <div style={{ padding: "14px 20px" }}>
          <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.7 }}>
            {pod.description
              ? pod.description
              : `Join this ${pod.sport || "sports"} pod to share the cost of a full season ticket package. Members split game attendance based on their ownership share.`}
          </div>
        </div>

        {/* ── Group Buy info ────────────────────────────────────────────────── */}
        {pod.pod_type === "group_buy" && (
          <div style={{ margin: "0 16px 16px", background: `${T.teal}08`,
            border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, marginBottom: 4 }}>
              🛒 Group Buy Pod
            </div>
            <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.5 }}>
              The organizer hasn't purchased the tickets yet. Once all members fund their share,
              the organizer has 48 hours to buy and upload a receipt. If they don't, the pod is
              cancelled and you're automatically refunded. Your money is safe in escrow until then.
            </div>
          </div>
        )}

        {/* ── Receipt verification banner ────────────────────────────────────── */}
        {pod.receipt_verified ? (
          <div style={{ margin: "0 16px 16px", background: "rgba(52,211,153,0.08)",
            border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", marginBottom: 2 }}>
              ✓ Receipt Verified
            </div>
            <div style={{ fontSize: 11, color: "#6EE7B7", opacity: 0.8, lineHeight: 1.5 }}>
              HalfTime has reviewed the captain's season ticket purchase receipt and confirmed the price is accurate.
            </div>
          </div>
        ) : pod.receipt_rejected ? (
          <div style={{ margin: "0 16px 16px", background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 2 }}>
              ⚠️ Receipt Flagged
            </div>
            <div style={{ fontSize: 11, color: "#F8A0A0", lineHeight: 1.5 }}>
              {pod.receipt_note
                ? pod.receipt_note
                : "HalfTime could not verify this pod's ticket receipt. Ask the captain for more details before joining."}
            </div>
          </div>
        ) : pod.receipt_url ? (
          <div style={{ margin: "0 16px 16px", background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#FCD34D", marginBottom: 2 }}>
              🔍 Receipt Under Review
            </div>
            <div style={{ fontSize: 11, color: "#FCD34D", opacity: 0.8, lineHeight: 1.5 }}>
              The captain submitted a ticket receipt and HalfTime is reviewing it. Check back soon.
            </div>
          </div>
        ) : (
          <div style={{ margin: "0 16px 16px", background: "rgba(148,163,184,0.06)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>
              📄 No receipt uploaded yet — ask the captain to share proof of their ticket purchase before you commit.
            </div>
          </div>
        )}
      </div>

      {/* Seat map button */}
      {pod.seat_map_url && (
        <button
          onClick={() => setShowSeatMap(true)}
          style={{
            width: "100%", maxWidth: 360, padding: "12px 0",
            background: "transparent", border: `1.5px solid ${T.teal}55`,
            borderRadius: 12, color: T.teal, fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🗺️ View Seat Map
        </button>
      )}

      {/* Invite code badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.mist }}>Invite code:</span>
        <span style={{ fontFamily: "Georgia,serif", fontWeight: 900,
          color: T.lime, fontSize: 16, letterSpacing: "0.1em" }}>{code.toUpperCase()}</span>
      </div>

      {/* Join error */}
      {joinErr && (
        <div style={{ width: "100%", maxWidth: 360, background: "rgba(239,68,68,0.12)",
          border: `1px solid ${T.red}`, borderRadius: 10,
          padding: "10px 14px", color: T.red, fontSize: 13, textAlign: "center" }}>
          {joinErr}
        </div>
      )}

      {/* CTA */}
      {!isRecruiting ? (
        <div style={{ width: "100%", maxWidth: 360, background: `${T.amber}12`,
          border: `1px solid ${T.amber}33`, borderRadius: 12,
          padding: "14px 16px", textAlign: "center" }}>
          <div style={{ color: T.amber, fontWeight: 700, fontSize: 14 }}>
            This pod is no longer recruiting
          </div>
          <div style={{ color: T.mist, fontSize: 12, marginTop: 4 }}>
            The pod is already full or has started its season.
          </div>
        </div>
      ) : isFull ? (
        // ── Waitlist form when pod is full ──────────────────────────────────
        <div style={{ width: "100%", maxWidth: 360 }}>
          {waitlistSubmitted ? (
            <div style={{ background: `${T.teal}12`, border: `1px solid ${T.teal}33`,
              borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
              <div style={{ color: T.teal, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                You're on the waitlist!
              </div>
              <div style={{ color: T.mist, fontSize: 12, lineHeight: 1.6 }}>
                We'll email <strong style={{ color: T.chalk }}>{waitlistEmail}</strong> if a spot opens up in{" "}
                <strong style={{ color: T.chalk }}>{pod.name}</strong>.
              </div>
            </div>
          ) : (
            <div style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}33`,
              borderRadius: 12, padding: "18px 16px" }}>
              <div style={{ color: T.amber, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Pod is full
              </div>
              <div style={{ color: T.mist, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                All spots have been claimed — but pods sometimes open up. Leave your email and we'll let you know if a seat becomes available.
              </div>
              <input
                type="email"
                value={waitlistEmail}
                onChange={e => setWaitlistEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ width: "100%", padding: "11px 12px", background: T.forest,
                  border: `1px solid #1A4A2E`, borderRadius: 8, color: T.white,
                  fontSize: 13, outline: "none", fontFamily: "Calibri,sans-serif",
                  boxSizing: "border-box", marginBottom: 10 }}
              />
              <button
                onClick={async () => {
                  if (!waitlistEmail.includes("@")) return;
                  setWaitlistBusy(true);
                  try {
                    await supabase.from("pod_waitlist").insert({
                      pod_id: pod.id,
                      email:  waitlistEmail.trim().toLowerCase(),
                    });
                    setWaitlistSubmitted(true);
                  } catch { /* ignore duplicate / RLS errors silently */ }
                  finally { setWaitlistBusy(false); }
                }}
                disabled={waitlistBusy || !waitlistEmail.includes("@")}
                style={{ width: "100%", padding: "12px", background: T.amber,
                  border: "none", borderRadius: 8, color: T.dark,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  opacity: !waitlistEmail.includes("@") ? 0.5 : 1 }}>
                {waitlistBusy ? "Joining waitlist…" : "Join Waitlist →"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 360 }}>
          <button onClick={handleJoin} disabled={joining}
            style={{ width: "100%", padding: "15px 0",
              background: joining ? T.mist : T.lime, color: T.dark,
              border: "none", borderRadius: 12, fontWeight: 700,
              fontSize: 16, cursor: joining ? "not-allowed" : "pointer",
              fontFamily: "Georgia,serif" }}>
            {joining ? "Joining…" : user ? "Join this pod →" : "Sign in to join →"}
          </button>
          {!user && (
            <p style={{ color: T.mist, fontSize: 11, textAlign: "center",
              margin: "8px 0 0", lineHeight: 1.5 }}>
              You'll create or sign into your account, then be added to the pod automatically.
            </p>
          )}
          {user && (
            <p style={{ color: T.mist, fontSize: 11, textAlign: "center",
              margin: "8px 0 0" }}>
              ~${Math.round(myEstimate)} season cost · 3% platform fee on escrow
            </p>
          )}
        </div>
      )}
      {/* Seat map modal */}
      {showSeatMap && pod.seat_map_url && (
        <div
          onClick={() => setShowSeatMap(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(6,15,8,0.95)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 430 }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif" }}>🗺️ Seat Map</div>
                <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                  {pod.venue || pod.team_name}
                  {(pod.section || pod.row) && (
                    <span style={{ color: T.lime, fontWeight: 700 }}>
                      {" · "}
                      {pod.section && `Section ${pod.section}`}
                      {pod.section && pod.row && ", "}
                      {pod.row && `Row ${pod.row}`}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowSeatMap(false)}
                style={{ background: "none", border: "none", color: T.mist,
                  fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Map image */}
            <div style={{ borderRadius: 14, overflow: "hidden",
              border: `1px solid ${T.green}`, background: T.forest }}>
              <img
                src={pod.seat_map_url}
                alt={`${pod.venue || pod.team_name} seat map`}
                style={{ width: "100%", display: "block" }}
              />
            </div>

            <div style={{ fontSize: 10, color: T.mist, textAlign: "center",
              marginTop: 10 }}>
              Tap anywhere outside to close
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: T.dark,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20, padding: "24px 16px", fontFamily: "Calibri,sans-serif" }}>
      {children}
    </div>
  );
}
