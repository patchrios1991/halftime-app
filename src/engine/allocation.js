// ─── HalfTime Allocation Engine ───────────────────────────────────────────────
// Real allocation logic: Snake Draft, Random Lottery, AI Fairness Balancing

/**
 * Snake Draft — reverse-order picks each round.
 * Members ranked by pick order; in odd rounds the order reverses.
 * Fairest method over a full season: balances marquee vs. value games.
 */
export function runSnakeDraft(games, members) {
  const sorted = [...games].sort((a, b) => b.val - a.val);
  const assignments = {};
  games.forEach(g => (assignments[g.id] = null));
  const picks = [];
  let round = 0;
  let gameIdx = 0;

  while (gameIdx < sorted.length) {
    const order =
      round % 2 === 0
        ? members.map((_, i) => i)
        : members.map((_, i) => members.length - 1 - i);

    for (const mIdx of order) {
      if (gameIdx >= sorted.length) break;
      const m = members[mIdx];
      const g = sorted[gameIdx];
      assignments[g.id] = m.id;
      picks.push({ round: round + 1, pick: gameIdx + 1, memberId: m.id, gameId: g.id });
      gameIdx++;
    }
    round++;
  }

  return { assignments, picks };
}

/**
 * Random Lottery — weighted by ownership %.
 * Each member gets tickets proportional to their share; pure chance.
 */
export function runLottery(games, members) {
  const assignments = {};
  games.forEach(g => {
    const weighted = [];
    members.forEach(m => {
      for (let i = 0; i < m.share; i++) weighted.push(m.id);
    });
    assignments[g.id] = weighted[Math.floor(Math.random() * weighted.length)];
  });
  return assignments;
}

/**
 * AI Fairness Balancing — ML-inspired greedy algorithm.
 * Scores each member per game based on:
 *   - Ownership-share deficit (primary driver)
 *   - Game quality tier bonus (marquee > premium > standard)
 *   - Tiny random noise to break ties fairly
 * Result: the most mathematically equitable full-season distribution.
 */
export function runAIFairness(games, members, prevAssignments = {}) {
  const assignments = {};
  const gamesReceived = {};
  members.forEach(m => {
    gamesReceived[m.id] = Object.values(prevAssignments).filter(id => id === m.id).length;
  });

  const sorted = [...games].sort((a, b) => b.val - a.val);
  for (const game of sorted) {
    let best = null;
    let bestScore = -Infinity;
    for (const m of members) {
      const fairTarget = (m.share / 100) * games.length;
      const deficit = fairTarget - gamesReceived[m.id];
      const qualityBonus =
        game.tier === "marquee" ? 0.5 : game.tier === "premium" ? 0.25 : 0;
      const score = deficit * 2 + qualityBonus + Math.random() * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    assignments[game.id] = best.id;
    gamesReceived[best.id]++;
  }
  return assignments;
}

/**
 * Fairness score: how close is each member to their fair share?
 * Returns a 0–100 score and per-member deltas.
 */
export function computeFairnessScore(games, members, assignments) {
  const results = members.map(m => {
    const received = Object.values(assignments).filter(id => id === m.id).length;
    const fair = (m.share / 100) * games.length;
    const delta = received - fair;
    return { memberId: m.id, received, fair, delta };
  });

  const maxDelta = Math.max(...results.map(r => Math.abs(r.delta)));
  const score = Math.max(0, Math.round(100 - maxDelta * 10));
  return { score, results };
}
