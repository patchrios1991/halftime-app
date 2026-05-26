// ─── Schedule API ─────────────────────────────────────────────────────────────
// Calls the fetch-schedule Edge Function which proxies ESPN server-side
// (avoids CORS issues when calling ESPN directly from the browser/PWA).
import { supabase } from "../lib/supabase";

async function invoke(payload) {
  const { data, error } = await supabase.functions.invoke("fetch-schedule", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Search ESPN for teams matching a sport + query string */
export async function searchESPNTeams(sport, query) {
  return invoke({ action: "search", sport, query });
}

// Marquee opponents for tier auto-classification (mirrors Edge Function)
const MARQUEE = {
  basketball: ["Lakers","Celtics","Warriors","Heat","Bucks","76ers","Knicks","Suns","Nuggets","Clippers"],
  football:   ["Cowboys","Patriots","Chiefs","Eagles","49ers","Packers","Rams","Ravens","Bills"],
  baseball:   ["Yankees","Red Sox","Dodgers","Cubs","Giants","Mets","Astros","Braves"],
  hockey:     ["Blackhawks","Maple Leafs","Rangers","Canadiens","Bruins","Penguins","Capitals"],
  soccer:     ["Galaxy","LAFC","Atlanta","Seattle"],
};
const PREMIUM = {
  basketball: ["Cavaliers","Rockets","Thunder","Spurs","Nets","Magic","Pelicans","Kings"],
  football:   ["Giants","Steelers","Seahawks","Broncos","Chargers","Raiders","Bears"],
  baseball:   ["Cardinals","Phillies","Blue Jays","Twins","Tigers","Mariners"],
  hockey:     ["Flyers","Sabres","Senators","Sharks","Kings","Jets"],
  soccer:     [],
};

/**
 * Fetch home-game schedule for a team via the Edge Function.
 * Returns game objects shaped for HalfTime's `games` table.
 */
export async function fetchESPNSchedule(sport, teamId, defaultPrice = "") {
  const result = await invoke({ action: "schedule", sport, teamId });
  const games  = result.games ?? [];

  return games.map(g => {
    // Convert UTC ISO → local browser timezone
    const dt        = new Date(g.utc_date);
    const game_date = dt.toLocaleDateString("en-CA");        // YYYY-MM-DD
    const game_time = dt.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });                                                       // HH:MM

    return {
      opponent:   g.opponent,
      game_date,
      game_time,
      face_value: defaultPrice || "",
      tier:       g.tier,
      _venue:     g.venue,
    };
  });
}
