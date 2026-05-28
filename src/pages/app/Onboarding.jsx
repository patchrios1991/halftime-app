// ─── Onboarding / Get Started ─────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";

async function requestPushPermission() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied")  return "denied";
  const result = await Notification.requestPermission();
  return result;
}

const SLIDES = [
  {
    emoji: "🏟️",
    title: "Co-own season tickets",
    body: "Split the cost of a full season ticket package with a trusted group of fans — everyone gets their fair share of games.",
  },
  {
    emoji: "🤖",
    title: "AI-powered allocation",
    body: "Our engine distributes games fairly based on your preferences, ownership share, and bid credits. No more spreadsheets.",
  },
  {
    emoji: "♻️",
    title: "Resell, trade & earn",
    body: "Can't make a game? List it in the pod marketplace or trade with a teammate. Your share, your call.",
  },
  {
    emoji: "💳",
    title: "Secure escrow payments",
    body: "Funds are held in a Stripe-insured escrow until the pod is fully funded. Nobody pays until everyone commits.",
  },
];

const DONE_KEY = "ht_onboarded";

function completeOnboarding(dispatch, screen) {
  localStorage.setItem(DONE_KEY, "1");
  dispatch({ type: "SET_SCREEN", screen });
}

export default function Onboarding({ dispatch }) {
  const [slide,        setSlide]        = useState(0);
  const [notifStatus,  setNotifStatus]  = useState(null); // null | "granted" | "denied" | "unsupported"
  const [notifBusy,    setNotifBusy]    = useState(false);
  const isLast = slide === SLIDES.length - 1;

  async function handleEnableNotifications() {
    setNotifBusy(true);
    const result = await requestPushPermission();
    setNotifStatus(result);
    setNotifBusy(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: T.dark, display: "flex",
      flexDirection: "column", padding: "32px 24px 40px",
      fontFamily: "Calibri,sans-serif", position: "relative",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
        <Wordmark size={24} />
      </div>

      {/* Slide content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        maxWidth: 340, margin: "0 auto", width: "100%" }}>

        {/* Emoji */}
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          background: `${T.lime}12`, border: `2px solid ${T.lime}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 52, marginBottom: 28,
        }}>
          {SLIDES[slide].emoji}
        </div>

        {/* Text */}
        <div style={{ fontSize: 22, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 12, lineHeight: 1.3 }}>
          {SLIDES[slide].title}
        </div>
        <div style={{ fontSize: 14, color: T.mist, lineHeight: 1.7,
          marginBottom: isLast ? 20 : 36 }}>
          {SLIDES[slide].body}
        </div>

        {/* Push notification opt-in — shown on last slide */}
        {isLast && (
          <div style={{
            width: "100%", background: `${T.lime}08`,
            border: `1px solid ${T.lime}22`, borderRadius: 12,
            padding: "14px 16px", marginBottom: 24, textAlign: "left",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 4 }}>
              🔔 Stay in the loop
            </div>
            <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.6, marginBottom: 12 }}>
              Get notified when games are allocated, trades come in, and bid auctions settle.
            </div>
            {notifStatus === "granted" ? (
              <div style={{ fontSize: 12, color: T.lime, fontWeight: 700 }}>
                ✓ Notifications enabled!
              </div>
            ) : notifStatus === "denied" ? (
              <div style={{ fontSize: 11, color: T.amber }}>
                Notifications blocked — enable in browser settings to receive alerts.
              </div>
            ) : notifStatus === "unsupported" ? (
              <div style={{ fontSize: 11, color: T.mist }}>
                Push notifications aren't supported on this browser.
              </div>
            ) : (
              <button
                onClick={handleEnableNotifications}
                disabled={notifBusy}
                style={{
                  padding: "8px 18px", background: T.lime, border: "none",
                  borderRadius: 8, color: T.dark, fontSize: 12, fontWeight: 700,
                  cursor: notifBusy ? "not-allowed" : "pointer",
                  opacity: notifBusy ? 0.7 : 1,
                }}>
                {notifBusy ? "Requesting…" : "Enable Notifications →"}
              </button>
            )}
          </div>
        )}

        {/* Dots */}
        <div style={{ display: "flex", gap: 8, marginBottom: 36 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)}
              style={{
                width: i === slide ? 20 : 6, height: 6, borderRadius: 3,
                background: i === slide ? T.lime : T.green,
                transition: "all 0.25s", cursor: "pointer",
              }} />
          ))}
        </div>

        {/* Navigation */}
        {isLast ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => completeOnboarding(dispatch, "create_pod")}
              style={{
                width: "100%", padding: "16px",
                background: T.lime, color: T.dark, border: "none",
                borderRadius: 12, fontSize: 15, fontWeight: 700,
                fontFamily: "Georgia,serif", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div>🏆 Create a Pod</div>
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.75 }}>
                  You're the captain — set it up &amp; invite members
                </div>
              </div>
              <span style={{ fontSize: 20 }}>›</span>
            </button>

            <button
              onClick={() => completeOnboarding(dispatch, "browse_pods")}
              style={{
                width: "100%", padding: "16px",
                background: "transparent", color: T.white,
                border: `1.5px solid ${T.green}`, borderRadius: 12,
                fontSize: 15, fontWeight: 700, fontFamily: "Georgia,serif",
                cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div>🔍 Find a Pod</div>
                <div style={{ fontSize: 11, fontWeight: 400, color: T.mist, marginTop: 2 }}>
                  Browse open pods looking for members
                </div>
              </div>
              <span style={{ fontSize: 20, color: T.mist }}>›</span>
            </button>
          </div>
        ) : (
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between",
            alignItems: "center" }}>
            <button onClick={() => setSlide(s => Math.max(0, s - 1))}
              style={{ background: "transparent", border: "none",
                color: slide === 0 ? "transparent" : T.mist,
                fontSize: 14, cursor: "pointer", padding: "8px 16px",
                fontFamily: "Calibri,sans-serif" }}>
              ← Back
            </button>
            <button
              onClick={() => setSlide(s => Math.min(SLIDES.length - 1, s + 1))}
              style={{ padding: "12px 28px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: "pointer" }}>
              Next →
            </button>
          </div>
        )}

        {isLast && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 12, lineHeight: 1.6 }}>
              Already in a pod? It'll appear automatically after signing in.
            </div>
            <button
              onClick={() => completeOnboarding(dispatch, "dashboard")}
              style={{ background: "none", border: "none", color: T.mist,
                fontSize: 12, cursor: "pointer", textDecoration: "underline",
                textUnderlineOffset: 3 }}>
              Skip for now →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
