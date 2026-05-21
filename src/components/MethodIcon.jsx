import { T } from "../tokens";
import Badge from "./Badge";

const METHOD_MAP = {
  snake:   [T.teal,   "🐍", "Snake"],
  lottery: [T.purple, "🎲", "Lottery"],
  bidding: [T.lime,   "💎", "Bid"],
  ai:      [T.mist,   "🤖", "AI Fair"],
};

export default function MethodIcon({ m }) {
  const [c, icon, label] = METHOD_MAP[m] || [T.mist, "?", m];
  return <Badge color={c}>{icon} {label}</Badge>;
}
