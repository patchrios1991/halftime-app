// ─── persona-webhook ─────────────────────────────────────────────────────────
// Receives Persona completion webhooks and sets profiles.verified = true.
// Configure in Persona dashboard: Events → inquiry.completed → your webhook URL
// Webhook URL: https://<project>.supabase.co/functions/v1/persona-webhook
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PERSONA_WEBHOOK_SECRET = Deno.env.get("PERSONA_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // Verify Persona signature (optional but strongly recommended in production)
    // Persona sends: Persona-Signature header as t=<ts>,v1=<hmac>
    if (PERSONA_WEBHOOK_SECRET) {
      const sigHeader = req.headers.get("Persona-Signature") ?? "";
      const ts  = sigHeader.match(/t=([^,]+)/)?.[1] ?? "";
      const sig = sigHeader.match(/v1=([^,]+)/)?.[1] ?? "";
      const signedPayload = `${ts}.${body}`;
      const encoder = new TextEncoder();
      const key    = await crypto.subtle.importKey(
        "raw", encoder.encode(PERSONA_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
      const expectedHex = [...new Uint8Array(expected)]
        .map(b => b.toString(16).padStart(2, "0")).join("");
      if (expectedHex !== sig) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const eventType = payload.data?.type;
    // Handle inquiry.completed events
    if (
      payload.name === "inquiry.completed" ||
      (eventType === "inquiry" && payload.data?.attributes?.status === "completed")
    ) {
      const userId = payload.data?.attributes?.["reference-id"];
      if (userId) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
        await supabase
          .from("profiles")
          .update({ verified: true, trust_score: 80 })
          .eq("id", userId);

        // Send a notification
        await supabase.from("notifications").insert({
          user_id: userId,
          type:    "verification_complete",
          title:   "✅ Identity verified!",
          body:    "Your identity has been verified. Your trust score is now 80.",
          data:    { screen: "profile" },
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[persona-webhook]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
