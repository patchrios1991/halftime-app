// ─── Notify Admin + Send Welcome Email on New Signup ─────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!;
const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPA_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WH_SECRET   = Deno.env.get("SIGNUP_WEBHOOK_SECRET") ?? "";

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from: "noreply@halftime-app.com", to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Resend error sending to ${to}:`, err);
  }
}

Deno.serve(async (req) => {
  // Verify the request is from our database webhook
  if (WH_SECRET && req.headers.get("x-webhook-secret") !== WH_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { record } = await req.json();
  const userId      = record?.id;
  const displayName = (record?.display_name ?? "").trim();
  const firstName   = displayName.split(" ")[0] || "there";

  if (!userId) return new Response("No user id", { status: 400 });

  // Look up email from auth.users using service role
  const admin = createClient(SUPA_URL, SUPA_SVC);
  const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
  if (error || !user) return new Response("User not found", { status: 404 });

  const email = user.email ?? "(unknown)";
  const when  = new Date().toLocaleString("en-US", {
    timeZone:  "America/New_York",
    dateStyle: "long",
    timeStyle: "short",
  });

  // ── Admin notification ────────────────────────────────────────────────────
  const nameRow = displayName
    ? `<tr>
        <td style="padding:8px 0;font-size:13px;color:#94A3B8;width:90px;">Name</td>
        <td style="padding:8px 0;font-size:13px;color:#FFFFFF;font-weight:600;">${displayName}</td>
       </tr>`
    : "";

  const adminHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A1A0E;font-family:Calibri,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A1A0E;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-family:Georgia,serif;font-size:32px;font-weight:900;">
            <span style="color:#FFFFFF;">Half</span><span style="color:#84CC16;">Time</span>
          </span>
        </td></tr>
        <tr><td style="background:#122A18;border:1px solid #1A4A2E;border-radius:16px;padding:28px 24px;">
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:20px;font-weight:700;color:#FFFFFF;">
            🙋 New signup
          </p>
          <p style="margin:0 0 20px;font-size:12px;color:#64748B;">${when}</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94A3B8;width:90px;">Email</td>
              <td style="padding:8px 0;font-size:13px;color:#FFFFFF;font-weight:600;">${email}</td>
            </tr>
            ${nameRow}
          </table>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid #1A4A2E;">
            <a href="https://app.halftime-app.com/admin"
               style="display:inline-block;background:#84CC16;color:#0A1A0E;text-decoration:none;
                      font-family:Georgia,serif;font-size:13px;font-weight:700;
                      padding:10px 24px;border-radius:8px;">
              View in Admin →
            </a>
          </div>
        </td></tr>
        <tr><td align="center" style="padding-top:20px;">
          <p style="margin:0;font-size:11px;color:#64748B;">© 2025 HalfTime</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // ── Welcome email to new user ─────────────────────────────────────────────
  const welcomeHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A1A0E;font-family:Calibri,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A1A0E;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <span style="font-family:Georgia,serif;font-size:36px;font-weight:900;">
            <span style="color:#FFFFFF;">Half</span><span style="color:#84CC16;">Time</span>
          </span>
        </td></tr>

        <!-- Hero card -->
        <tr><td style="background:#122A18;border:1px solid #1A4A2E;border-radius:16px;padding:32px 28px 28px;">

          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;font-weight:700;color:#FFFFFF;">
            Welcome to HalfTime, ${firstName}! 🏆
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#94A3B8;line-height:1.6;">
            You're in. Here's everything you need to know to get the most out of the app.
          </p>

          <!-- Divider -->
          <div style="border-top:1px solid #1A4A2E;margin-bottom:28px;"></div>

          <!-- Section 1 -->
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#84CC16;">
            🏟️ What is HalfTime?
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#CBD5E1;line-height:1.7;">
            HalfTime lets a group of people co-own season tickets together. Instead of one person
            paying full price for an entire season — and scrambling to use or sell every game —
            your group splits the cost and the games. Everyone pays their share, and everyone
            gets their games. Simple.
          </p>

          <!-- Section 2 -->
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#84CC16;">
            👥 What's a Pod?
          </p>
          <p style="margin:0 0 12px;font-size:14px;color:#CBD5E1;line-height:1.7;">
            A <strong style="color:#FFFFFF;">pod</strong> is your group of co-owners — typically 2 to 8 people.
            Each member owns a percentage of the season tickets. The bigger your share, the more
            games you receive.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#CBD5E1;line-height:1.7;">
            For example: a pod of 4 people with equal shares each gets roughly 25% of the season's games.
          </p>

          <!-- Section 3 -->
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#84CC16;">
            🤖 How Are Games Distributed?
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#CBD5E1;line-height:1.7;">
            Once the pod is funded, our system automatically allocates games across members based
            on each person's ownership percentage and preferences. It's fair, transparent, and
            done for you — no spreadsheets, no arguments.
          </p>

          <!-- Section 4 -->
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#84CC16;">
            ♻️ Can't Make a Game?
          </p>
          <p style="margin:0 0 8px;font-size:14px;color:#CBD5E1;line-height:1.7;">No problem. You have two options:</p>
          <table style="width:100%;margin-bottom:24px;">
            <tr>
              <td style="padding:8px 12px;background:#0A1A0E;border-radius:8px 8px 0 0;
                         border:1px solid #1A4A2E;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <strong style="color:#FFFFFF;">List it in the marketplace</strong> — post your ticket
                for sale inside the pod. A teammate buys it and funds go straight to you.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#0A1A0E;border-radius:0 0 8px 8px;
                         border:1px solid #1A4A2E;border-top:none;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <strong style="color:#FFFFFF;">Trade with a teammate</strong> — swap your game for
                one of theirs. Both parties agree in the app and it settles instantly.
              </td>
            </tr>
          </table>

          <!-- Section 5 — Captain -->
          <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;color:#84CC16;">
            ⚡ The Captain Role
          </p>
          <p style="margin:0 0 12px;font-size:14px;color:#CBD5E1;line-height:1.7;">
            Every pod has one <strong style="color:#FFFFFF;">Captain</strong> — the person who
            organizes and manages the pod. Being a Captain is straightforward:
          </p>

          <!-- Captain responsibilities -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #1A4A2E;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <span style="color:#84CC16;font-weight:700;">Create the pod</span> — set ownership
                percentages and invite your members.
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #1A4A2E;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <span style="color:#84CC16;font-weight:700;">Manage the payment pool</span> — collect
                each member's share through the app. Funds are held in secure escrow (powered by Stripe)
                until the pod is fully committed.
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #1A4A2E;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <span style="color:#84CC16;font-weight:700;">Distribute tickets</span> — before each
                game, mark the ticket as sent in the app. The member gets a notification to check
                their email or Ticketmaster.
              </td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:13px;color:#CBD5E1;line-height:1.5;">
                <span style="color:#84CC16;font-weight:700;">Oversee trades &amp; resales</span> —
                the app handles everything automatically; you just keep an eye on the pod.
              </td>
            </tr>
          </table>
          <p style="margin:0 0 28px;font-size:13px;color:#64748B;line-height:1.6;font-style:italic;">
            Being a Captain takes about 5 minutes per game — mostly just forwarding a ticket through the app.
          </p>

          <!-- CTA -->
          <div style="border-top:1px solid #1A4A2E;padding-top:24px;text-align:center;">
            <p style="margin:0 0 16px;font-size:14px;color:#94A3B8;">
              Ready to get started? Open the app and join or create your pod.
            </p>
            <a href="https://app.halftime-app.com/app"
               style="display:inline-block;background:#84CC16;color:#0A1A0E;text-decoration:none;
                      font-family:Georgia,serif;font-size:15px;font-weight:700;
                      padding:14px 40px;border-radius:10px;">
              Open HalfTime →
            </a>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#64748B;line-height:2;">
            🔒 Payments secured by Stripe · Data encrypted at rest · No spam ever<br>
            © 2025 HalfTime
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Send both emails in parallel
  await Promise.all([
    sendEmail(ADMIN_EMAIL, `🙋 New HalfTime signup: ${email}`, adminHtml),
    sendEmail(email, `Welcome to HalfTime, ${firstName}! 🏆`, welcomeHtml),
  ]);

  return new Response("OK", { status: 200 });
});
