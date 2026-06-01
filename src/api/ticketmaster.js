// ─── Ticketmaster Discovery API ───────────────────────────────────────────────
// Free public API — no partnership required.
// Sign up for a key at: https://developer.ticketmaster.com/
// Add VITE_TICKETMASTER_API_KEY to your .env.local and Vercel env vars.

const BASE = "https://app.ticketmaster.com/discovery/v2";
const KEY  = import.meta.env.VITE_TICKETMASTER_API_KEY;

// Typical home games per sport per season (used to project total cost)
const HOME_GAMES = {
  // Pro
  NBA: 41, NFL: 9, MLB: 81, NHL: 41, MLS: 17, WNBA: 20,
  // NCAA (regular season home games only)
  "ncaa-football":    7,
  "ncaa-basketball":  17,
  "ncaa-wbasketball": 17,
  "ncaa-baseball":    25,
  "ncaa-hockey":      18,
  other: 25,
};

/**
 * Fetches events for a team from Ticketmaster and returns a per-seat market estimate.
 *
 * @param {string} teamName  e.g. "Chicago Bulls"
 * @param {string} sport     e.g. "NBA"
 * @returns {Promise<{ avgGamePrice: number, totalEstimate: number,
 *                     eventsFound: number, gamesEstimated: number } | null>}
 */
export async function fetchTeamMarketEstimate(teamName, sport) {
  if (!KEY || !teamName?.trim()) return null;

  try {
    const params = new URLSearchParams({
      keyword:            teamName.trim(),
      classificationName: "Sports",
      size:               50,
      apikey:             KEY,
    });

    const res = await fetch(`${BASE}/events.json?${params}`);
    if (!res.ok) return null;

    const json   = await res.json();
    const events = json?._embedded?.events ?? [];

    // Only keep events that have price data
    const priced = events.filter(e => e.priceRanges?.length > 0);
    if (priced.length === 0) return null;

    // Use the minimum price from each event (closest to face value)
    const avgMin = priced.reduce((sum, e) => sum + (e.priceRanges[0]?.min ?? 0), 0) / priced.length;
    const games  = HOME_GAMES[sport] ?? HOME_GAMES.other;

    return {
      avgGamePrice:   Math.round(avgMin),
      totalEstimate:  Math.round(avgMin * games),  // per-seat total for full season
      eventsFound:    events.length,
      gamesEstimated: games,
    };
  } catch {
    // Network errors, CORS issues, etc. — fail silently
    return null;
  }
}
