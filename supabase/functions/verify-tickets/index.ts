// ─── Edge Function: verify-tickets ────────────────────────────────────────────
// Verifies ticket availability for group-buy pods.
//   action "url"        → HEAD-fetches ticket_url, stores live/dead result
//   action "screenshot" → downloads receipt image, sends to Claude Vision, stores result
//   action "both"       → runs both
import { serve }        from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safe base64 encode for large ArrayBuffers (avoids call-stack overflow)
function toBase64(buffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check — any logged-in user can trigger a re-check
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { podId, action = "both" } = await req.json() as {
      podId:   string;
      action?: "url" | "screenshot" | "both";
    };
    if (!podId) throw new Error("podId is required");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: pod, error: podErr } = await supabase
      .from("pods")
      .select("id, ticket_url, receipt_url, pod_type")
      .eq("id", podId)
      .single();

    if (podErr || !pod) throw new Error("Pod not found");

    const updates: Record<string, unknown> = {};

    // ── URL liveness check ────────────────────────────────────────────────────
    if ((action === "url" || action === "both") && pod.ticket_url) {
      let live = false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const res = await fetch(pod.ticket_url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; HalfTimeBot/1.0)" },
          });
          live = res.status < 400;
          // Some servers reject HEAD — retry with GET on 4xx (except 404)
          if (!live && res.status !== 404) {
            const get = await fetch(pod.ticket_url, {
              method: "GET",
              signal: controller.signal,
              redirect: "follow",
              headers: { "User-Agent": "Mozilla/5.0 (compatible; HalfTimeBot/1.0)" },
            });
            live = get.status < 400;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        live = false;
      }
      updates.ticket_url_live       = live;
      updates.ticket_url_checked_at = new Date().toISOString();
    }

    // ── AI screenshot analysis ────────────────────────────────────────────────
    if ((action === "screenshot" || action === "both") && pod.receipt_url && ANTHROPIC_API_KEY) {
      try {
        const imgRes = await fetch(pod.receipt_url);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

          // Skip PDFs — Claude Vision accepts images only
          if (contentType.includes("pdf")) {
            updates.screenshot_ai_status = "unchecked";
            updates.screenshot_ai_note   = "PDF files cannot be analyzed automatically. An admin will review.";
          } else {
            const mediaType =
              contentType.includes("png")  ? "image/png"  :
              contentType.includes("webp") ? "image/webp" :
              contentType.includes("gif")  ? "image/gif"  : "image/jpeg";

            const buf    = await imgRes.arrayBuffer();
            const base64 = toBase64(buf);

            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
              },
              body: JSON.stringify({
                model:      "claude-haiku-4-5-20251001",
                max_tokens: 200,
                messages: [{
                  role: "user",
                  content: [
                    {
                      type:   "image",
                      source: { type: "base64", media_type: mediaType, data: base64 },
                    },
                    {
                      type: "text",
                      text: 'This image was uploaded by someone creating a group season ticket pod on HalfTime (a ticket co-ownership app). They claim it shows available season tickets for purchase. Does this image clearly show EITHER: (a) an interactive arena or stadium seat map with available seats highlighted in color, OR (b) a page from an official ticketing platform (Ticketmaster, AXS, SeatGeek, NBA/NFL/MLB/NHL team site, etc.) showing season ticket packages or memberships currently available for purchase? Reply ONLY with valid JSON, no markdown: {"valid": true or false, "note": "one sentence explaining your assessment"}',
                    },
                  ],
                }],
              }),
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json() as {
                content?: Array<{ type: string; text: string }>;
              };
              const text      = aiData.content?.[0]?.text ?? "";
              const jsonMatch = text.match(/\{[\s\S]*?\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { valid?: boolean; note?: string };
                updates.screenshot_ai_status = parsed.valid ? "valid" : "invalid";
                updates.screenshot_ai_note   = parsed.note ?? null;
              }
            }
          }
        }
      } catch (err) {
        console.error("AI analysis failed:", err);
        // Non-fatal — leave screenshot_ai_status as 'unchecked'
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("pods").update(updates).eq("id", podId);
    }

    return new Response(
      JSON.stringify({ success: true, ...updates }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("verify-tickets error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
