// ─── PostgREST embed normalizer ───────────────────────────────────────────────
// PostgREST returns a to-one embed as a bare OBJECT (not a one-element array)
// when it detects a unique constraint on the FK — which is the case for
// assignments.game_id. The app treats game.assignments as an array everywhere
// (g.assignments?.[0]), so normalize the shape at every query site that embeds
// assignments inside games.
export function embedArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Normalize game.assignments on a list of game rows (in place, returns list). */
export function normalizeGames(games) {
  if (!games) return games;
  for (const g of games) g.assignments = embedArray(g.assignments);
  return games;
}
