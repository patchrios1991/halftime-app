// ─── Terms of Service ─────────────────────────────────────────────────────────
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using HalfTime ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.`,
  },
  {
    title: "2. What HalfTime Does",
    body: `HalfTime is a platform that helps groups of people ("pods") co-own season tickets to professional sports events. HalfTime facilitates coordination, payment escrow, game allocation, and ticket-transfer communication between pod members. HalfTime is not a ticket broker or reseller.`,
  },
  {
    title: "3. Eligibility",
    body: `You must be at least 18 years old and legally able to enter into contracts to use this Service. By creating an account you confirm this.`,
  },
  {
    title: "4. Pod Membership & Payments",
    body: `When you join or create a pod you agree to pay your agreed share of the season ticket cost. Funds are held in escrow via Stripe and released according to pod terms. HalfTime does not guarantee that all tickets will be available or that all pod members will fulfil their obligations.`,
  },
  {
    title: "5. Ticket Transfers",
    body: `HalfTime helps coordinate ticket delivery and transfer between pod members. The responsibility for fulfilling ticket transfers lies with individual members. HalfTime is not liable for failed transfers or team/venue policy changes.`,
  },
  {
    title: "6. Prohibited Conduct",
    body: `You may not use HalfTime to: (a) violate any law or regulation; (b) infringe the rights of others; (c) transmit spam or malicious content; (d) resell tickets above face value where prohibited; or (e) impersonate another person or entity.`,
  },
  {
    title: "7. Limitation of Liability",
    body: `To the fullest extent permitted by law, HalfTime and its operators shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.`,
  },
  {
    title: "8. Changes to Terms",
    body: `We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms. We will notify you of material changes via email or in-app notification.`,
  },
  {
    title: "9. Contact",
    body: `Questions about these Terms? Email us at legal@halftime-app.com`,
  },
];

export default function TermsScreen() {
  const navigate = useNavigate();

  return (
    <div style={{
      background: T.dark, minHeight: "100vh", fontFamily: "Calibri,sans-serif",
      color: T.white, maxWidth: 700, margin: "0 auto", padding: "40px 24px 80px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: T.mist,
            fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 16 }}>
          ← Back
        </button>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: 700,
          color: T.white, marginBottom: 6 }}>
          Terms of Service
        </div>
        <div style={{ fontSize: 12, color: T.mist }}>Last updated: May 2026</div>
      </div>

      {/* Introduction */}
      <div style={{ fontSize: 14, color: T.chalk, lineHeight: 1.7, marginBottom: 28,
        background: T.forest, borderRadius: 12, padding: "16px 20px",
        border: "1px solid #1A4A2E" }}>
        Please read these Terms carefully before using HalfTime. They govern your access to and use of our platform.
      </div>

      {/* Sections */}
      {SECTIONS.map(({ title, body }) => (
        <div key={title} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.lime,
            fontFamily: "Georgia,serif", marginBottom: 8 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: T.chalk, lineHeight: 1.7 }}>{body}</div>
        </div>
      ))}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1A4A2E", marginTop: 40, paddingTop: 24,
        fontSize: 12, color: T.mist, textAlign: "center" }}>
        <span style={{ color: T.lime, fontFamily: "Georgia,serif", fontWeight: 700 }}>HalfTime</span>
        {" "}· Fractional season ticket co-ownership ·{" "}
        <a href="/privacy" style={{ color: T.mist }}>Privacy Policy</a>
      </div>
    </div>
  );
}
