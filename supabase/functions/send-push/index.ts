// ─── send-push Edge Function ──────────────────────────────────────────────────
// Sends push notifications to one user or all members of a pod — over Web
// Push (browser subscriptions) and, separately, native iOS/Android devices
// via Firebase Cloud Messaging (FCM bridges to APNs on iOS, talks to FCM
// directly on Android — see migration 043 for why these are two separate
// delivery paths with two separate token tables).
//
// Env vars:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  — required, web push
//   FIREBASE_SERVICE_ACCOUNT_JSON                       — optional, native push
//     (the full JSON key downloaded from Firebase Console → Project Settings
//     → Service Accounts → Generate new private key, pasted as one secret
//     value). If unset, native push sends are skipped — web push still works.
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

// ─── FCM (native iOS/Android) ──────────────────────────────────────────────────
// FCM's HTTP v1 API needs an OAuth2 access token minted from the service
// account's private key — google-auth-library handles that JWT-signing +
// token-exchange so we don't hand-roll RS256 signing in Deno.
async function getFcmAccessToken(serviceAccountJson: string): Promise<{ token: string; projectId: string }> {
  const { GoogleAuth } = await import("npm:google-auth-library@9");
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Failed to obtain FCM access token");
  return { token, projectId: credentials.project_id };
}

async function sendFcmPush(
  fcmToken: string,
  title: string,
  body: string,
  url: string,
  accessToken: string,
  projectId: string,
) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body: body || "" },
          data: { url: url || "/app" },
          apns: { payload: { aps: { sound: "default" } } },
        },
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const status = errBody?.error?.status; // e.g. "UNREGISTERED", "NOT_FOUND"
    throw Object.assign(new Error(`FCM send failed: ${res.status} ${JSON.stringify(errBody)}`), { fcmStatus: status });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@halftimedemo.com";
    const webPushConfigured = !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;

    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    if (!webPushConfigured && !FIREBASE_SERVICE_ACCOUNT_JSON) {
      return new Response(
        JSON.stringify({ error: "Neither VAPID keys nor Firebase credentials are configured" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { userId, podId, type, title, body, url } = await req.json();

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

    // ── Persist in-app notifications ───────────────────────────────────────
    // Insert a notifications row for each target user. This:
    //   1. Shows up in the in-app bell panel immediately
    //   2. Triggers the Supabase DB webhook → send-email edge function
    // Uses the service-role client so it can bypass RLS.
    const notifRows = targetUserIds.map((uid: string) => ({
      user_id: uid,
      pod_id:  podId ?? null,
      type:    type  ?? "general",
      title,
      body:    body  ?? "",
    }));
    const { error: notifErr } = await supabase.from("notifications").insert(notifRows);
    if (notifErr) {
      // Non-fatal — log but continue so the push still goes out
      console.error("notifications insert error:", notifErr.message);
    }

    // ── Fetch subscriptions / device tokens ────────────────────────────────
    const [{ data: subs, error: subsErr }, { data: devices, error: devicesErr }] = await Promise.all([
      webPushConfigured
        ? supabase.from("push_subscriptions").select("*").in("user_id", targetUserIds)
        : Promise.resolve({ data: [], error: null }),
      FIREBASE_SERVICE_ACCOUNT_JSON
        ? supabase.from("device_push_tokens").select("*").in("user_id", targetUserIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subsErr) throw subsErr;
    if (devicesErr) throw devicesErr;

    if ((!subs || subs.length === 0) && (!devices || devices.length === 0)) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: corsHeaders,
      });
    }

    let sent = 0;
    const expiredEndpoints: string[] = [];
    const invalidFcmTokens: string[] = [];

    // ── Web Push ────────────────────────────────────────────────────────────
    const webPushPayload = JSON.stringify({ title, body: body || "", url: url || "/app" });
    const webPushSends = (subs || []).map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await sendWebPush(sub, webPushPayload, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!, VAPID_SUBJECT);
        sent++;
      } catch (e: unknown) {
        // 410 = subscription expired/unsubscribed
        if ((e as { statusCode?: number }).statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
        console.error("web push send error:", (e as Error).message);
      }
    });

    // ── Native (FCM) ────────────────────────────────────────────────────────
    const fcmSends: Promise<void>[] = [];
    if (devices && devices.length > 0 && FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const { token: accessToken, projectId } = await getFcmAccessToken(FIREBASE_SERVICE_ACCOUNT_JSON);
        fcmSends.push(
          ...devices.map(async (device: { token: string }) => {
            try {
              await sendFcmPush(device.token, title, body, url, accessToken, projectId);
              sent++;
            } catch (e: unknown) {
              const fcmStatus = (e as { fcmStatus?: string }).fcmStatus;
              if (fcmStatus === "UNREGISTERED" || fcmStatus === "NOT_FOUND" || fcmStatus === "INVALID_ARGUMENT") {
                invalidFcmTokens.push(device.token);
              }
              console.error("FCM push send error:", (e as Error).message);
            }
          }),
        );
      } catch (e: unknown) {
        // Couldn't even mint an access token (bad/missing credentials) —
        // non-fatal, web push (if configured) still goes out.
        console.error("FCM auth error:", (e as Error).message);
      }
    }

    await Promise.allSettled([...webPushSends, ...fcmSends]);

    // Clean up expired/invalid subscriptions and tokens
    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }
    if (invalidFcmTokens.length > 0) {
      await supabase.from("device_push_tokens").delete().in("token", invalidFcmTokens);
    }

    return new Response(
      JSON.stringify({
        sent,
        expired: expiredEndpoints.length,
        invalidTokens: invalidFcmTokens.length,
      }),
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
