// ─── Edge Function: verify-tickets ────────────────────────────────────────────
// Verifies ticket availability for group-buy pods, and purchase receipts for
// standard pods.
//   action "url"        → HEAD-fetches ticket_url, stores live/dead result
//   action "screenshot" → downloads group-buy availability screenshot, sends to Claude Vision, stores result
//   action "both"       → runs both (group-buy only)
//   action "receipt"    → downloads a standard pod's purchase receipt, sends to Claude Vision;
//                         a clear, high-confidence match auto-sets receipt_verified = true
//                         (same effect as an admin manually verifying) — anything less
//                         confident is left pending for manual review in BetaDashboard
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
      action?: "url" | "screenshot" | "both" | "receipt";
    };
    if (!podId) throw new Error("podId is required");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: pod, error: podErr } = await supabase
      .from("pods")
      .select("id, name, ticket_url, receipt_url, pod_type, venue, section, row, seat, team_name, season, season_cost, captain_id")
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
                      text: (() => {
                        const hasSeats = pod.section && pod.row && pod.seat;
                        if (hasSeats) {
                          const loc = [
                            pod.venue ? `at ${pod.venue}` : "",
                            `Section ${pod.section}`,
                            `Row ${pod.row}`,
                            `Seat(s) ${pod.seat}`,
                          ].filter(Boolean).join(", ");
                          return `The organizer of a group season ticket pod on HalfTime claims that ${loc} are available for purchase. Does this screenshot clearly show those specific seats highlighted as available on an arena seat map or official ticketing platform page (Ticketmaster, AXS, SeatGeek, NBA/NFL/MLB/NHL team site, etc.)? Reply ONLY with valid JSON, no markdown: {"valid": true or false, "note": "one sentence describing what you see — specifically state whether the claimed section, row, and seat appear available or not"}`;
                        }
                        return 'This image was uploaded by someone creating a group season ticket pod on HalfTime (a ticket co-ownership app). They claim it shows available season tickets for purchase. Does this image clearly show EITHER: (a) an interactive arena or stadium seat map with available seats highlighted in color, OR (b) a page from an official ticketing platform (Ticketmaster, AXS, SeatGeek, NBA/NFL/MLB/NHL team site, etc.) showing season ticket packages or memberships currently available for purchase? Reply ONLY with valid JSON, no markdown: {"valid": true or false, "note": "one sentence explaining your assessment"}';
                      })(),
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

    // ── AI receipt analysis (standard pods only) ──────────────────────────────
    if (action === "receipt" && pod.pod_type !== "group_buy" && pod.receipt_url && ANTHROPIC_API_KEY) {
      try {
        const imgRes = await fetch(pod.receipt_url);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

          if (contentType.includes("pdf")) {
            updates.receipt_ai_status = "unchecked";
            updates.receipt_ai_note   = "PDF files cannot be analyzed automatically. An admin will review.";
          } else {
            const mediaType =
              contentType.includes("png")  ? "image/png"  :
              contentType.includes("webp") ? "image/webp" :
              contentType.includes("gif")  ? "image/gif"  : "image/jpeg";

            const buf    = await imgRes.arrayBuffer();
            const base64 = toBase64(buf);

            const claimedCost = pod.season_cost ? `$${Number(pod.season_cost).toLocaleString()}` : "an unknown amount";
            const prompt = `This image is a receipt uploaded by someone who created a season-ticket cost-splitting pod on HalfTime (a ticket co-ownership app). They claim it proves they purchased a season ticket package for the ${pod.team_name || "listed team"}${pod.season ? ` (${pod.season} season)` : ""}, totaling approximately ${claimedCost}. Carefully check: (1) does this clearly look like a real purchase confirmation or receipt (not a cart page, a price estimate, a seat map, or an unrelated screenshot), (2) if a team or league is visible, does it match the claim, (3) is the total amount shown reasonably close to the claimed cost (roughly within 25%)? Only use "high" confidence if the receipt clearly and unambiguously satisfies all of this — use "low" confidence for anything illegible, cropped, ambiguous, or only partially matching. Reply ONLY with valid JSON, no markdown: {"valid": true or false, "confidence": "high" or "low", "note": "one sentence summarizing what you see and why"}`;

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
                    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
                    { type: "text", text: prompt },
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
                const parsed = JSON.parse(jsonMatch[0]) as {
                  valid?: boolean; confidence?: "high" | "low"; note?: string;
                };
                updates.receipt_ai_note = parsed.note ?? null;

                if (parsed.valid && parsed.confidence === "high") {
                  updates.receipt_ai_status = "auto_approved";
                  updates.receipt_verified  = true;
                  updates.receipt_rejected  = false;
                  updates.receipt_note      = null;
                } else if (parsed.valid) {
                  updates.receipt_ai_status = "needs_review";
                } else {
                  updates.receipt_ai_status = "flagged";
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Receipt AI analysis failed:", err);
        // Non-fatal — leave receipt_ai_status as 'unchecked', fully manual review still applies
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("pods").update(updates).eq("id", podId);

      // Auto-approval is the same gating event as an admin manually verifying
      // (migration 046) — let the captain know their pod is now recruitable.
      if (updates.receipt_verified === true && pod.captain_id) {
        await supabase.from("notifications").insert({
          user_id: pod.captain_id,
          type:    "receipt_verified",
          title:   "✅ Receipt verified!",
          body:    `Your ticket receipt for ${pod.name} is verified — the pod is now open for members to join.`,
          pod_id:  podId,
        });
      }
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
