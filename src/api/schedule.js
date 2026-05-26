// ─── ESPN Schedule API ────────────────────────────────────────────────────────
// Uses ESPN's free public API (no key required).
// Fetches team schedules and filters to HOME games only
// (season ticket holders attend home games).

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

// Map HalfTime sport names → ESPN sport paths
export const SPORT_PATHS = {
  basketball: "basketball/nba",
  football:   "football/nfl",
  baseball:   "baseball/mlb",
  hockey:     "hockey/nhl",
  soccer:     "soccer/usa.1",
};

// Opponents that auto-get "marquee" tier (bigger games = higher demand)
const MARQUEE_OPPONENTS = {
  basketball: ["Lakers","Celtics","Warriors","Heat","Bucks","76ers","Knicks","Suns","Nuggets","Clippers"],
  football:   ["Cowboys","Patriots","Chiefs","Eagles","49ers","Packers","Rams","Ravens","Bills"],
  baseball:   ["Yankees","Red Sox","Dodgers","Cubs","Giants","Mets","Astros","Braves"],
  hockey:     ["Blackhawks","Maple Leafs","Rangers","Canadiens","Bruins","Penguins","Capitals"],
  soccer:     ["Galaxy","LAFC","Atlanta","Seattle","Portland","NYC"],
};

// Opponents that auto-get "premium" tier
const PREMIUM_OPPONENTS = {
  basketball: ["Cavaliers","Rockets","Thunder","Spurs","Pistons","Nets","Magic","Pelicans"],
  football:   ["Giants","Steelers","Seahawks","Broncos","Chargers","Raiders","Bears"],
  baseball:   ["Cardinals","Phillies","Blue Jays","Twins","Tigers","Mariners"],
  hockey:     ["Flyers","Sabres","Senators","Coyotes","Sharks","Kings"],
  soccer:     [],
};

/** Search ESPN for teams matching a query string */
export async function searchESPNTeams(sport, query) {
  const path = SPORT_PATHS[sport?.toLowerCase()] ?? "basketball/nba";
  const res  = await fetch(`${ESPN}/${path}/teams?limit=200`);
  if (!res.ok) throw new Error("Could not reach ESPN — check your connection");
  const json = await res.json();

  const all = (json.sports?.[0]?.leagues?.[0]?.teams ?? []).map(t => t.team);
  if (!query?.trim()) return all;

  const q = query.toLowerCase().replace(/^(the\s+)?/i, "");
  return all.filter(t =>
    t.displayName?.toLowerCase().includes(q) ||
    t.location?.toLowerCase().includes(q)    ||
    t.name?.toLowerCase().includes(q)        ||
    t.abbreviation?.toLowerCase() === q
  );
}

/**
 * Fetch home-game schedule for a team from ESPN.
 * Returns game objects shaped for HalfTime's `games` table.
 *
 * @param {string} sport       - "basketball" | "football" | "baseball" | "hockey" | "soccer"
 * @param {string|number} teamId - ESPN team ID
 * @param {string} defaultPrice  - default face_value (captain can override)
 */
export async function fetchESPNSchedule(sport, teamId, defaultPrice = "") {
  const path = SPORT_PATHS[sport?.toLowerCase()] ?? "basketball/nba";
  const res  = await fetch(`${ESPN}/${path}/teams/${teamId}/schedule`);
  if (!res.ok) throw new Error("Could not fetch schedule from ESPN");
  const json = await res.json();

  const marqueeList = MARQUEE_OPPONENTS[sport?.toLowerCase()] ?? [];
  const premiumList = PREMIUM_OPPONENTS[sport?.toLowerCase()] ?? [];
  const now         = new Date();
  const teamIdStr   = String(teamId);

  return (json.events ?? [])
    // ── Home games only ────────────────────────────────────────────────────
    .filter(e => {
      const comp     = e.competitions?.[0];
      const homeTeam = comp?.competitors?.find(c => c.homeAway === "home");
      return homeTeam?.team?.id === teamIdStr;
    })
    // ── Future games only ─────────────────────────────────────────────────
    .filter(e => new Date(e.date) >= now)
    // ── Shape to HalfTime format ──────────────────────────────────────────
    .map(e => {
      const comp     = e.competitions?.[0];
      const awayTeam = comp?.competitors?.find(c => c.homeAway === "away");
      const opponent = awayTeam?.team?.displayName ?? "TBD";

      // Convert UTC → local browser timezone (correct for fans in home-market)
      const dt        = new Date(e.date);
      const game_date = dt.toLocaleDateString("en-CA");               // YYYY-MM-DD
      const game_time = dt.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false,
      });                                                              // HH:MM

      // Auto-classify tier by opponent fame
      const tier = marqueeList.some(m => opponent.includes(m)) ? "marquee"
        : premiumList.some(m => opponent.includes(m)) ? "premium"
        : "standard";

      return {
        opponent,
        game_date,
        game_time,
        face_value: defaultPrice || "",
        tier,
        _espn_id:  e.id,
        _venue:    comp?.venue?.fullName ?? "",
      };
    });
}
