// ─── Tier constants ────────────────────────────────────────────────────────────
// Single source of truth for game tier values, ordering, and colors.
import { T } from "../tokens";

export const TIERS = ["standard", "premium", "marquee", "playoff"];

/** Canonical tier → color mapping. Marquee = lime (playoff = red). */
export const TIER_COLOR = {
  standard: T.mist,
  premium:  T.teal,
  marquee:  T.lime,
  playoff:  "#EF4444",
};

export function tierLabel(tier) {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "";
}
