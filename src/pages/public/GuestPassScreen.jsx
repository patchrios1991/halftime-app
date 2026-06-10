// ─── Public Guest Pass Page ───────────────────────────────────────────────────
// Anyone with a pass link (/guest/:code) can view it — no account needed.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { getGuestPass } from "../../api/guestPasses";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0",
      borderBottom: `1px solid ${T.green}33` }}>
      <span style={{ fontSize: 12, color: T.mist, letterSpacing: 0.5, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: T.white, fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function GuestPassScreen() {
  const { code } = useParams();
  const [pass, setPass]       = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getGuestPass(code)
      .then(p => { if (alive) setPass(p); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code]);

  return (
    <div style={{
      minHeight: "100dvh", background: T.dark,
      fontFamily: "Calibri,sans-serif", color: T.white,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 20px",
    }}>
      {/* Header */}
      <div style={{ padding: "26px 0 8px" }}>
        <Wordmark size={24} />
      </div>
      <div style={{ fontSize: 10, letterSpacing: 2.5, color: T.mist, marginBottom: 28 }}>
        GUEST PASS
      </div>

      {loading && (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", marginTop: 60,
          border: `3px solid ${T.green}`, borderTopColor: T.lime,
          animation: "spin 0.8s linear infinite",
        }} />
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", marginTop: 40, maxWidth: 320 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🎟️</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            Pass not found
          </div>
          <div style={{ fontSize: 14, color: T.mist, lineHeight: 1.5 }}>
            This guest pass doesn't exist or may have been revoked.
            Double-check the link with whoever sent it to you.
          </div>
        </div>
      )}

      {!loading && pass && (
        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* Ticket card */}
          <div style={{
            background: T.forest, border: `1px solid ${T.green}`,
            borderRadius: 22, overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}>
            {/* Top: matchup */}
            <div style={{
              textAlign: "center", padding: "30px 24px 24px",
              background: `linear-gradient(180deg, ${T.lime}12, transparent)`,
            }}>
              <div style={{ fontSize: 46, marginBottom: 12 }}>{pass.sport_emoji || "🎟️"}</div>
              {pass.issued_by_name && (
                <div style={{ fontSize: 12, color: T.teal, fontWeight: 700, marginBottom: 6 }}>
                  {pass.issued_by_name} invited you
                </div>
              )}
              <div style={{ fontFamily: "Georgia,serif", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
                {pass.team_name} vs {pass.opponent}
              </div>
              <div style={{ fontSize: 13, color: T.mist, marginTop: 8 }}>
                {formatDate(pass.game_date)}{pass.game_time ? ` · ${formatTime(pass.game_time)}` : ""}
              </div>
            </div>

            {/* Perforation */}
            <div style={{ display: "flex", alignItems: "center", padding: "0 0" }}>
              <div style={{ width: 13, height: 26, borderRadius: "0 13px 13px 0", background: T.dark, marginRight: 8 }} />
              <div style={{ flex: 1, borderTop: `2px dashed ${T.green}66` }} />
              <div style={{ width: 13, height: 26, borderRadius: "13px 0 0 13px", background: T.dark, marginLeft: 8 }} />
            </div>

            {/* Details */}
            <div style={{ padding: "14px 24px 24px" }}>
              <Row label="VENUE"   value={pass.venue} />
              <Row label="SECTION" value={pass.section} />
              <Row label="ROW"     value={pass.seat_row} />
              <Row label="SEAT"    value={pass.seat_info} />
              <Row label="POD"     value={pass.pod_name} />
              {pass.note && (
                <div style={{
                  marginTop: 16, padding: "12px 14px", borderRadius: 12,
                  background: `${T.lime}0D`, border: `1px solid ${T.lime}33`,
                  fontSize: 13, color: T.chalk, lineHeight: 1.5,
                }}>
                  💬 {pass.note}
                </div>
              )}
              <div style={{
                marginTop: 18, textAlign: "center",
                fontSize: 11, color: T.mist, letterSpacing: 1.5,
              }}>
                PASS CODE
                <div style={{
                  fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700,
                  color: T.lime, letterSpacing: 4, marginTop: 4,
                }}>
                  {pass.code.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* How it works for the guest */}
          <div style={{
            marginTop: 18, padding: "14px 18px", borderRadius: 14,
            border: `1px solid ${T.green}55`, fontSize: 12.5, color: T.mist, lineHeight: 1.55,
          }}>
            Show this pass to your host at the game — the actual tickets are
            transferred by them through the team's ticketing app.
          </div>

          {/* Footer CTA */}
          <div style={{ textAlign: "center", padding: "26px 0 40px" }}>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 10 }}>
              Want to split season tickets with your own crew?
            </div>
            <a href="https://www.halftime-app.com" style={{
              display: "inline-block", background: T.lime, color: T.dark,
              fontWeight: 700, fontSize: 13, padding: "11px 26px",
              borderRadius: 12, textDecoration: "none",
            }}>
              Discover HalfTime
            </a>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
