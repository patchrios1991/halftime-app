// ─── ProfileScreen ────────────────────────────────────────────────────────────
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Badge from "../../components/Badge";
import Card from "../../components/Card";
import { useMyPods } from "../../hooks/usePod";

export default function ProfileScreen({ profile, dispatch, signOut }) {
  const navigate = useNavigate();
  const { pods } = useMyPods();

  const displayName    = profile?.display_name    ?? "—";
  const avatarInitials = profile?.avatar_initials ?? "YO";
  const trustScore     = profile?.trust_score     ?? 0;
  const bidCredits     = profile?.bid_credits     ?? 0;
  const isVerified     = profile?.verified        ?? false;

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long", year: "numeric",
      })
    : "—";

  async function handleSignOut() {
    try { await signOut?.(); } catch {}
    navigate("/auth/signin", { replace: true });
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: T.dark, padding: "28px 16px 20px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
          <Avatar initials={avatarInitials} size={58} color={T.lime} verified={isVerified} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif" }}>{displayName}</div>
            <div style={{ fontSize: 11, color: T.mist, marginBottom: 5 }}>
              Member since {memberSince}
            </div>
            {isVerified
              ? <Badge color={T.teal}>✓ Fully Verified</Badge>
              : <Badge color={T.amber}>⏳ Pending Verification</Badge>
            }
          </div>
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
        {/* ── Account settings ───────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 12 }}>⚙️ Account</div>
          {[
            "Payment Methods",
            "Identity Documents",
            "Notification Preferences",
            "Playoff Rights Manager",
            "Pod Agreements",
            "Help & Support",
          ].map((item, i, arr) => (
            <div key={item} style={{
              padding: "11px 0",
              borderBottom: i < arr.length - 1 ? "1px solid #1A4A2E" : "none",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 12, color: T.chalk, cursor: "pointer",
            }}>
              {item}<span style={{ color: T.mist }}>›</span>
            </div>
          ))}
        </Card>

        {/* ── Achievements ───────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 12 }}>🏆 Achievements</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              ["🎯", "Bid Winner"],
              ["🤝", "Pod Founder"],
              ["♻️", "Resale Pro"],
              ["🎖️", "Loyal Fan"],
            ].map(([icon, title]) => (
              <div key={title} style={{ background: "#ffffff06", borderRadius: 10,
                padding: "8px 10px", textAlign: "center", minWidth: 72 }}>
                <div style={{ fontSize: 20, marginBottom: 3 }}>{icon}</div>
                <div style={{ fontSize: 9, color: T.lime, fontWeight: 700 }}>{title}</div>
              </div>
            ))}
          </div>
        </Card>

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
