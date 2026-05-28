// ─── send-push Edge Function ──────────────────────────────────────────────────
// Sends web push notifications to one user or all members of a pod.
// Requires env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//
// Body: { userId?: string, podId?: string, title: string, body: string, url?: string }
// Set either userId (one person) or podId (everyone in the pod).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Minimal Web Push implementation (avoids npm:web-push Deno quirks) ────────
// Sends an encrypted push notification per RFC 8291 using Deno's built-in crypto.
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  // Import web-push via npm (Deno npm compatibility)
  const webpush = await import("npm:web-push@3.6.7");
  webpush.default.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  await webpush.default.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    payload,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@halftimedemo.com";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { userId, podId, title, body, url } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: "title is required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ── Determine target user IDs ──────────────────────────────────────────
    let targetUserIds: string[] = [];

    if (userId) {
      targetUserIds = [userId];
    } else if (podId) {
      const { data: members, error: membErr } = await supabase
        .from("pod_members")
        .select("user_id")
        .eq("pod_id", podId);
      if (membErr) throw membErr;
      targetUserIds = (members || []).map((m: { user_id: string }) => m.user_id);
    } else {
      return new Response(
        JSON.stringify({ error: "userId or podId required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });
    }

    // ── Fetch subscriptions ────────────────────────────────────────────────
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", targetUserIds);
    if (subsErr) throw subsErr;

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: corsHeaders,
      });
    }

    const payload = JSON.stringify({ title, body: body || "", url: url || "/app" });
    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await sendWebPush(sub, payload, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!, VAPID_SUBJECT);
          sent++;
        } catch (e: unknown) {
          // 410 = subscription expired/unsubscribed
          if ((e as { statusCode?: number }).statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
          console.error("push send error:", (e as Error).message);
        }
      }),
    );

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({ sent, expired: expiredEndpoints.length }),
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
