// ─── Notify Admin on New Signup ───────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!;
const SUPA_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPA_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WH_SECRET   = Deno.env.get("SIGNUP_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  // Verify the request is from our database webhook
  if (WH_SECRET && req.headers.get("x-webhook-secret") !== WH_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { record } = await req.json();
  const userId      = record?.id;
  const displayName = (record?.display_name ?? "").trim();

  if (!userId) return new Response("No user id", { status: 400 });

  // Look up the email from auth.users using the service role
  const admin = createClient(SUPA_URL, SUPA_SVC);
  const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
  if (error || !user) return new Response("User not found", { status: 404 });

  const email = user.email ?? "(unknown)";
  const when  = new Date().toLocaleString("en-US", {
    timeZone:  "America/New_York",
    dateStyle: "long",
    timeStyle: "short",
  });

  const nameRow = displayName
    ? `<tr>
        <td style="padding:8px 0;font-size:13px;color:#94A3B8;width:90px;">Name</td>
        <td style="padding:8px 0;font-size:13px;color:#FFFFFF;font-weight:600;">${displayName}</td>
       </tr>`
    : "";

  const html = `<!DOCTYPE html>
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
            <a href="https://www.halftime-app.com/admin"
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

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    "noreply@halftime-app.com",
      to:      ADMIN_EMAIL,
      subject: `🙋 New HalfTime signup: ${email}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response("Email failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
