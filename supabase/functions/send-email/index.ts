// ─── Edge Function: send-email ─────────────────────────────────────────────────
// Called by a Supabase Database Webhook on INSERT to public.notifications.
// Sends an email via Resend when a new notification is created.
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "HalfTime <no-reply@halftime.app>";
const APP_URL        = Deno.env.get("APP_URL")    ?? "https://halftime-app-hyxh.vercel.app";

// ── Icon per notification type ─────────────────────────────────────────────────
function notifIcon(type: string): string {
  switch (type) {
    case "escrow_funded":  return "✅";
    case "escrow_failed":  return "❌";
    case "pod_active":     return "🎉";
    case "game_allocated": return "🎟️";
    case "resale_sold":    return "💰";
    case "resale_listing": return "♻️";
    default:               return "🔔";
  }
}

// ── HTML email template ────────────────────────────────────────────────────────
function buildEmail(title: string, body: string, type: string): string {
  const icon = notifIcon(type);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;font-family:Calibri,Arial,sans-serif;">

    <!-- Logo -->
    <div style="margin-bottom:24px;">
      <span style="color:#C8F135;font-size:22px;font-weight:700;font-family:Georgia,serif;letter-spacing:-0.5px;">
        Half<span style="color:#34D399;">Time</span>
      </span>
    </div>

    <!-- Card -->
    <div style="background:#060F08;border:1px solid #1A4A2E;border-radius:16px;padding:24px;">
      <div style="font-size:36px;margin-bottom:12px;">${icon}</div>
      <h2 style="color:#ffffff;font-family:Georgia,serif;font-size:20px;margin:0 0 10px;font-weight:700;">
        ${title}
      </h2>
      <p style="color:#7A9E82;font-size:14px;line-height:1.65;margin:0 0 24px;">
        ${body}
      </p>
      <a href="${APP_URL}"
         style="display:inline-block;background:#C8F135;color:#060F08;padding:13px 28px;
                border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;
                font-family:Calibri,Arial,sans-serif;">
        Open HalfTime →
      </a>
    </div>

    <!-- Footer -->
    <p style="color:#1A4A2E;font-size:11px;text-align:center;margin-top:20px;">
      Payments secured by Stripe · You received this because you're a HalfTime pod member.
    </p>
  </div>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  try {
    // Database Webhook sends the record in this format
    const payload = await req.json() as {
      type:   string;   // "INSERT"
      table:  string;   // "notifications"
      record: {
        user_id: string;
        type:    string;
        title:   string;
        body:    string;
      };
    };

    if (!payload.record?.user_id) {
      return new Response("No record", { status: 200 }); // Non-fatal
    }

    const { user_id, type, title, body } = payload.record;

    // Skip if no Resend key
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set — skipping email");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get user's email from Supabase Auth
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user_id);
    const email = authUser?.email;

    if (!email) {
      console.log(`No email found for user ${user_id}`);
      return new Response(JSON.stringify({ skipped: "no email" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Send email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [email],
        subject: title || "HalfTime notification",
        html:    buildEmail(title || "", body || "", type || ""),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response("Email failed", { status: 500 });
    }

    const result = await res.json();
    console.log(`✉️ Email sent to ${email} — id: ${result.id}`);

    return new Response(JSON.stringify({ sent: true, id: result.id }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
