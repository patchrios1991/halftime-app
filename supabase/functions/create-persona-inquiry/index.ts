// ─── create-persona-inquiry ───────────────────────────────────────────────────
// Creates a Persona inquiry for identity verification.
// Returns: { inquiry_id, session_token }
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PERSONA_API_KEY    = Deno.env.get("PERSONA_API_KEY") ?? "";
const PERSONA_TEMPLATE   = Deno.env.get("PERSONA_TEMPLATE_ID") ?? "";
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("authorization") ?? "";
    const supabase   = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Unauthorized");

    if (!PERSONA_API_KEY) throw new Error("PERSONA_API_KEY not configured");
    if (!PERSONA_TEMPLATE) throw new Error("PERSONA_TEMPLATE_ID not configured");

    // Create a Persona inquiry via their REST API
    const personaResp = await fetch("https://withpersona.com/api/v1/inquiries", {
      method: "POST",
      headers: {
        "Authorization":   `Bearer ${PERSONA_API_KEY}`,
        "Content-Type":    "application/json",
        "Persona-Version": "2023-01-05",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": PERSONA_TEMPLATE,
            "reference-id":        user.id,  // ties the inquiry back to our user
          },
        },
      }),
    });

    if (!personaResp.ok) {
      const err = await personaResp.text();
      throw new Error(`Persona API error: ${err}`);
    }

    const personaData = await personaResp.json();
    const inquiryId    = personaData.data?.id;
    const sessionToken = personaData.data?.attributes?.["session-token"];

    if (!inquiryId) throw new Error("No inquiry ID returned from Persona");

    // Store inquiry ID on the profile so we can track it
    await supabase
      .from("profiles")
      .update({ persona_inquiry_id: inquiryId })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ inquiry_id: inquiryId, session_token: sessionToken }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
