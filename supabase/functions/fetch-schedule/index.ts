// ─── Edge Function: fetch-schedule ────────────────────────────────────────────
// Proxies ESPN's public API server-side to avoid CORS restrictions in the PWA.
// Actions:
//   { action: "search",   sport, query }          → returns matching teams[]
//   { action: "schedule", sport, teamId }          → returns future home games[]
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_PATHS: Record<string, string> = {
  // ── Pro leagues — current UI values (lowercase) ──────────────────────────────
  "nba":              "basketball/nba",
  "nfl":              "football/nfl",
  "mlb":              "baseball/mlb",
  "nhl":              "hockey/nhl",
  "mls":              "soccer/usa.1",
  "wnba":             "basketball/wnba",
  // ── Pro leagues — legacy string values (kept for backward compat) ────────────
  "basketball":       "basketball/nba",
  "football":         "football/nfl",
  "baseball":         "baseball/mlb",
  "hockey":           "hockey/nhl",
  "soccer":           "soccer/usa.1",
  // ── NCAA ────────────────────────────────────────────────────────────────────
  "ncaa-football":    "football/college-football",
  "ncaa-basketball":  "basketball/mens-college-basketball",
  "ncaa-wbasketball": "basketball/womens-college-basketball",
  "ncaa-baseball":    "baseball/college-baseball",
  "ncaa-hockey":      "hockey/college-hockey",
};

// Map UI sport values → MARQUEE/PREMIUM key
function toMarqueeKey(sport: string): string {
  switch (sport) {
    case "nba":  return "basketball";
    case "nfl":  return "football";
    case "mlb":  return "baseball";
    case "nhl":  return "hockey";
    case "mls":  return "soccer";
    case "wnba": return "wnba";
    default:     return sport; // ncaa-* and legacy values pass through
  }
}

const MARQUEE: Record<string, string[]> = {
  basketball:         ["Lakers","Celtics","Warriors","Heat","Bucks","76ers","Knicks","Suns","Nuggets","Clippers"],
  football:           ["Cowboys","Patriots","Chiefs","Eagles","49ers","Packers","Rams","Ravens","Bills"],
  baseball:           ["Yankees","Red Sox","Dodgers","Cubs","Giants","Mets","Astros","Braves"],
  hockey:             ["Blackhawks","Maple Leafs","Rangers","Canadiens","Bruins","Penguins","Capitals"],
  soccer:             ["Galaxy","LAFC","Atlanta","Seattle"],
  wnba:               ["Fever","Liberty","Sky","Aces","Lynx","Storm"],
  // NCAA marquee = nationally recognizable blue-blood programs
  "ncaa-football":    ["Alabama","Ohio State","Michigan","Georgia","Clemson","Notre Dame","Texas","Oklahoma","LSU","USC"],
  "ncaa-basketball":  ["Duke","Kentucky","Kansas","North Carolina","UConn","Villanova","Gonzaga","Louisville"],
  "ncaa-wbasketball": ["UConn","South Carolina","Iowa","LSU","Stanford","Tennessee","Notre Dame","Baylor"],
  "ncaa-baseball":    ["LSU","Vanderbilt","Florida","Texas","Arkansas","Arizona","Stanford","Miami"],
  "ncaa-hockey":      ["Minnesota","North Dakota","Boston University","Michigan","Wisconsin","Denver"],
};

const PREMIUM: Record<string, string[]> = {
  basketball:         ["Cavaliers","Rockets","Thunder","Spurs","Nets","Magic","Pelicans","Kings"],
  football:           ["Giants","Steelers","Seahawks","Broncos","Chargers","Raiders","Bears"],
  baseball:           ["Cardinals","Phillies","Blue Jays","Twins","Tigers","Mariners"],
  hockey:             ["Flyers","Sabres","Senators","Sharks","Kings","Jets"],
  soccer:             [],
  wnba:               ["Sun","Dream","Wings","Mercury","Mystics","Sparks"],
  "ncaa-football":    ["Oregon","Penn State","Tennessee","Miami","Auburn","Florida","Wisconsin","Iowa","Utah","Michigan State"],
  "ncaa-basketball":  ["Michigan State","UCLA","Arizona","Purdue","Indiana","Marquette","Houston","Creighton"],
  "ncaa-wbasketball": ["Texas","Virginia Tech","Ohio State","NC State","Oklahoma","Maryland","Indiana","Colorado"],
  "ncaa-baseball":    ["Texas A&M","Ole Miss","Oklahoma State","Georgia","North Carolina","TCU","Oregon State"],
  "ncaa-hockey":      ["Minnesota State","Quinnipiac","Boston College","Cornell","Maine","Northeastern"],
};

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { action, sport, query, teamId } = await req.json() as AnyObj;
    const path    = SPORT_PATHS[String(sport ?? "basketball").toLowerCase()] ?? "basketball/nba";
    const sportKey = toMarqueeKey(String(sport ?? "basketball").toLowerCase());

    // ── Search teams ─────────────────────────────────────────────────────────
    if (action === "search") {
      const res  = await fetch(`${ESPN}/${path}/teams?limit=200`);
      if (!res.ok) throw new Error("ESPN teams endpoint failed");
      const data = await res.json();
      const all: AnyObj[] = (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t: AnyObj) => t.team);

      if (!String(query ?? "").trim()) return json(all.slice(0, 8));

      const q = String(query).toLowerCase();
      const filtered = all.filter(t =>
        t.displayName?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q)    ||
        t.name?.toLowerCase().includes(q)        ||
        t.abbreviation?.toLowerCase() === q
      );
      return json(filtered.slice(0, 6));
    }

    // ── Fetch schedule ────────────────────────────────────────────────────────
    if (action === "schedule") {
      if (!teamId) throw new Error("teamId is required");

      const res  = await fetch(`${ESPN}/${path}/teams/${teamId}/schedule`);
      if (!res.ok) throw new Error("ESPN schedule endpoint failed");
      const data = await res.json();

      const marqueeList = MARQUEE[sportKey] ?? [];
      const premiumList = PREMIUM[sportKey]  ?? [];
      const now         = new Date();
      const teamIdStr   = String(teamId);

      const games = (data.events ?? [])
        // Home games only
        .filter((e: AnyObj) => {
          const home = e.competitions?.[0]?.competitors?.find((c: AnyObj) => c.homeAway === "home");
          return home?.team?.id === teamIdStr;
        })
        // Future only
        .filter((e: AnyObj) => new Date(e.date) >= now)
        .map((e: AnyObj) => {
          const comp     = e.competitions?.[0];
          const awayTeam = comp?.competitors?.find((c: AnyObj) => c.homeAway === "away");
          const opponent = awayTeam?.team?.displayName ?? "TBD";

          // Keep UTC ISO date — client converts to local time
          const tier = marqueeList.some((m: string) => opponent.includes(m)) ? "marquee"
            : premiumList.some((m: string) => opponent.includes(m))          ? "premium"
            : "standard";

          return {
            opponent,
            utc_date:   e.date,          // ISO string — client handles timezone
            face_value: "",
            tier,
            venue: comp?.venue?.fullName ?? "",
          };
        });

      return json({ games, teamName: data.team?.displayName ?? "" });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("fetch-schedule error:", msg);
    return json({ error: msg }, 500);
  }
});
