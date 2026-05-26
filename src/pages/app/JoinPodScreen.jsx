// ─── JoinPodScreen ────────────────────────────────────────────────────────────
// Public page shown when someone opens an invite link: /join/:code
// Works for logged-in and logged-out users alike.
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { supabase } from "../../lib/supabase";
import { getPodByInviteCode, joinPod } from "../../api/pods";

const SPORT_EMOJI = { basketball: "🏀", football: "🏈", baseball: "⚾", hockey: "🏒", soccer: "⚽" };

export default function JoinPodScreen() {
  const { code }   = useParams();
  const navigate   = useNavigate();

  const [pod,       setPod]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState(null);
  const [user,      setUser]      = useState(undefined); // undefined = not yet checked
  const [joining,   setJoining]   = useState(false);
  const [joined,    setJoined]    = useState(false);
  const [joinErr,   setJoinErr]   = useState(null);

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
      setTimeout(() => navigate("/app"), 2500);
    } catch (e) {
      setJoinErr(e.message);
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
              <div style={{ marginTop: 5, display: "inline-block",
                background: isRecruiting ? `${T.lime}22` : `${T.amber}22`,
                border: `1px solid ${isRecruiting ? T.lime : T.amber}44`,
                borderRadius: 20, padding: "2px 10px",
                fontSize: 10, fontWeight: 700,
                color: isRecruiting ? T.lime : T.amber }}>
                {isRecruiting ? "Open for members" : "Pod active"}
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
      </div>

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
        <div style={{ width: "100%", maxWidth: 360, background: `${T.amber}12`,
          border: `1px solid ${T.amber}33`, borderRadius: 12,
          padding: "14px 16px", textAlign: "center" }}>
          <div style={{ color: T.amber, fontWeight: 700, fontSize: 14 }}>Pod is full</div>
          <div style={{ color: T.mist, fontSize: 12, marginTop: 4 }}>
            All spots have been claimed.
          </div>
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
