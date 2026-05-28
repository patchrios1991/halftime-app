// ─── Privacy Policy ───────────────────────────────────────────────────────────
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";

const SECTIONS = [
  {
    title: "1. What We Collect",
    body: `We collect information you provide directly, including: name, email address, payment details (processed by Stripe — we never store raw card numbers), and any content you add to your pod (schedule, notes, messages). We also collect basic usage data such as device type, browser, and in-app actions to improve the product.`,
  },
  {
    title: "2. How We Use Your Data",
    body: `We use your data to: operate your account and pod memberships; process payments via Stripe; send transactional emails (game alerts, trade notifications, payment confirmations); improve the platform; and comply with legal obligations. We do not sell your personal data to third parties.`,
  },
  {
    title: "3. Sharing",
    body: `Your display name and relevant game data are shared with other members of your pod — this is core to how HalfTime works. We use Supabase for database hosting (EU/US regions) and Stripe for payments. Both are certified to industry security standards. We may disclose data if required by law.`,
  },
  {
    title: "4. Stripe Payments",
    body: `All payment processing is handled by Stripe, Inc. When you enter payment details, they go directly to Stripe — HalfTime only receives a tokenised reference. Stripe's privacy policy governs how they handle payment data: stripe.com/privacy`,
  },
  {
    title: "5. Data Retention",
    body: `We retain your account data for as long as your account is active. If you delete your account, we will remove your personal data within 30 days, except where retention is required by law (e.g. financial records for 7 years).`,
  },
  {
    title: "6. Your Rights",
    body: `You have the right to: access the data we hold about you; request correction of inaccurate data; request deletion of your account and data; opt out of non-essential communications. Contact us at privacy@halftime-app.com to exercise any of these rights.`,
  },
  {
    title: "7. Cookies",
    body: `HalfTime uses minimal cookies — primarily for authentication session management via Supabase. We do not use third-party advertising cookies.`,
  },
  {
    title: "8. Security",
    body: `We use industry-standard encryption (TLS in transit, AES-256 at rest), row-level security policies in our database, and regular security reviews. No system is 100% secure; please report any concerns to security@halftime-app.com.`,
  },
  {
    title: "9. Changes",
    body: `We may update this policy. We'll notify you of material changes via email or in-app notice. Continued use after changes means you accept the updated policy.`,
  },
  {
    title: "10. Contact",
    body: `Privacy questions? Email privacy@halftime-app.com`,
  },
];

export default function PrivacyScreen() {
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
          Privacy Policy
        </div>
        <div style={{ fontSize: 12, color: T.mist }}>Last updated: May 2026</div>
      </div>

      {/* Introduction */}
      <div style={{ fontSize: 14, color: T.chalk, lineHeight: 1.7, marginBottom: 28,
        background: T.forest, borderRadius: 12, padding: "16px 20px",
        border: "1px solid #1A4A2E" }}>
        Your privacy matters to us. This policy explains what we collect, how we use it, and the choices you have.
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
        <a href="/terms" style={{ color: T.mist }}>Terms of Service</a>
      </div>
    </div>
  );
}
