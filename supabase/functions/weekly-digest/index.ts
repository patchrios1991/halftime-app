// ─── Edge Function: weekly-digest ────────────────────────────────────────────
// Sends a weekly email digest to every active pod member.
// Triggered by pg_cron every Monday at 9 AM UTC.
// Deploy: npx supabase functions deploy weekly-digest --project-ref ewcipqfcqyoqtpqzoazx
import { serve }       from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL")     ?? "HalfTime <noreply@halftime-app.com>";
const APP_URL        = Deno.env.get("APP_URL")        ?? "https://app.halftime-app.com";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TIER_LABEL: Record<string, string> = {
  standard: "🎟️ Standard",
  premium:  "⭐ Premium",
  marquee:  "🔥 Marquee",
  playoff:  "🏆 Playoff",
};

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function buildDigestHtml(params: {
  memberName: string;
  podName:    string;
  podStatus:  string;
  myGames:    { opponent: string; game_date: string; tier: string }[];
  unassigned: { opponent: string; game_date: string; tier: string }[];
  escrowFunded: boolean;
  sharePercent: number;
}): string {
  const { memberName, podName, podStatus, myGames, unassigned, escrowFunded, sharePercent } = params;

  const myGamesHtml = myGames.length > 0
    ? myGames.map(g => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1A4A2E;color:#C8F135;font-weight:700;font-size:13px;">
            ${fmtDate(g.game_date)} vs ${g.opponent}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #1A4A2E;text-align:right;color:#7A9E82;font-size:12px;">
            ${TIER_LABEL[g.tier] ?? g.tier}
          </td>
        </tr>`).join("")
    : `<tr><td colspan="2" style="padding:10px 0;color:#7A9E82;font-size:13px;">No games assigned to you this week.</td></tr>`;

  const unassignedHtml = unassigned.length > 0
    ? `<div style="margin-top:20px;">
        <p style="color:#7A9E82;font-size:12px;margin:0 0 8px;font-weight:700;letter-spacing:0.5px;">
          UNASSIGNED THIS WEEK
        </p>
        ${unassigned.map(g => `
          <div style="padding:6px 0;border-bottom:1px solid #1A4A2E;color:#94A3B8;font-size:12px;">
            ${fmtDate(g.game_date)} vs ${g.opponent}
          </div>`).join("")}
      </div>`
    : "";

  const escrowBanner = !escrowFunded
    ? `<div style="background:#7A3D0020;border:1px solid #7A3D0055;border-radius:10px;padding:12px 16px;margin-top:16px;">
        <p style="color:#FCD34D;font-size:13px;font-weight:700;margin:0 0 4px;">⚠️ Escrow not funded</p>
        <p style="color:#94A3B8;font-size:12px;margin:0;">
          Fund your ${sharePercent}% share to secure your spot in the pod.
        </p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#060F08;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;font-family:Calibri,Arial,sans-serif;">

    <div style="margin-bottom:20px;">
      <span style="color:#C8F135;font-size:22px;font-weight:700;font-family:Georgia,serif;letter-spacing:-0.5px;">
        Half<span style="color:#34D399;">Time</span>
      </span>
    </div>

    <div style="background:#060F08;border:1px solid #1A4A2E;border-radius:16px;padding:24px;">
      <p style="color:#7A9E82;font-size:12px;letter-spacing:0.5px;margin:0 0 6px;">WEEKLY DIGEST</p>
      <h2 style="color:#ffffff;font-family:Georgia,serif;font-size:20px;margin:0 0 4px;font-weight:700;">
        ${podName}
      </h2>
      <p style="color:#7A9E82;font-size:12px;margin:0 0 20px;">
        Hey ${memberName} — here's your week in the pod.
      </p>

      <p style="color:#7A9E82;font-size:12px;font-weight:700;letter-spacing:0.5px;margin:0 0 8px;">
        YOUR GAMES THIS WEEK
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${myGamesHtml}
      </table>

      ${unassignedHtml}
      ${escrowBanner}

      <div style="margin-top:24px;">
        <a href="${APP_URL}"
           style="display:inline-block;background:#C8F135;color:#060F08;padding:13px 28px;
                  border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;">
          Open HalfTime →
        </a>
      </div>
    </div>

    <p style="color:#1A4A2E;font-size:11px;text-align:center;margin-top:20px;">
      You received this because you're a member of ${podName} on HalfTime.
    </p>
  </div>
</body>
</html>`;
}

serve(async (req: Request) => {
  // Allow both cron (service role key) and manual test calls
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.replace("Bearer ", "") !== SERVICE_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ skipped: "no RESEND_API_KEY" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 1. Find games in the next 7 days across all active pods ──────────────────
  const today   = new Date();
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);

  const todayStr   = today.toISOString().slice(0, 10);
  const weekOutStr = weekOut.toISOString().slice(0, 10);

  const { data: games, error: gErr } = await supabase
    .from("games")
    .select("id, pod_id, opponent, game_date, tier")
    .gte("game_date", todayStr)
    .lte("game_date", weekOutStr)
    .order("game_date");

  if (gErr) {
    console.error("games query error:", gErr);
    return new Response(JSON.stringify({ error: gErr.message }), { status: 500 });
  }

  if (!games || games.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no games this week" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 2. Load assignments for those games ──────────────────────────────────────
  const gameIds = games.map((g: any) => g.id);
  const { data: assignments } = await supabase
    .from("assignments")
    .select("game_id, user_id")
    .in("game_id", gameIds);

  const assignMap = new Map<string, string | null>(); // game_id → user_id | null
  (assignments ?? []).forEach((a: any) => assignMap.set(a.game_id, a.user_id));

  // ── 3. Load active pods that have games this week ────────────────────────────
  const podIds = [...new Set(games.map((g: any) => g.pod_id))];
  const { data: pods } = await supabase
    .from("pods")
    .select("id, name, status, pod_members(user_id, share_pct, escrow_funded, profiles(display_name))")
    .in("id", podIds)
    .in("status", ["recruiting", "active", "funded"]);

  if (!pods || pods.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no active pods" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 4. Send one digest per member ────────────────────────────────────────────
  let sent = 0;
  const errors: string[] = [];

  for (const pod of pods as any[]) {
    const podGames = games.filter((g: any) => g.pod_id === pod.id);

    for (const member of (pod.pod_members ?? []) as any[]) {
      const userId = member.user_id;

      // Fetch auth email
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.email;
      if (!email) continue;

      const memberName  = member.profiles?.display_name || "there";
      const sharePercent = Math.round(parseFloat(member.share_pct) || 25);

      const myGames    = podGames.filter((g: any) => assignMap.get(g.id) === userId);
      const unassigned = podGames.filter((g: any) => assignMap.get(g.id) === null || assignMap.get(g.id) === undefined);

      // Skip if nothing relevant to show
      if (myGames.length === 0 && unassigned.length === 0) continue;

      const html = buildDigestHtml({
        memberName,
        podName:     pod.name,
        podStatus:   pod.status,
        myGames,
        unassigned,
        escrowFunded: Boolean(member.escrow_funded),
        sharePercent,
      });

      const subject = myGames.length > 0
        ? `🎟️ You have ${myGames.length} game${myGames.length > 1 ? "s" : ""} this week — ${pod.name}`
        : `📅 Weekly digest — ${pod.name}`;

      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject, html }),
      });

      if (res.ok) {
        sent++;
        console.log(`✉️ Digest sent to ${email} for pod ${pod.name}`);
      } else {
        const errText = await res.text();
        errors.push(`${email}: ${errText}`);
        console.error(`Failed to send to ${email}:`, errText);
      }
    }
  }

  return new Response(JSON.stringify({ sent, errors: errors.length > 0 ? errors : undefined }), {
    headers: { "Content-Type": "application/json" },
  });
});
