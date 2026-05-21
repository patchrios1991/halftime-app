import { T } from "../tokens";

export default function Bar({ value, max, color = T.lime, h = 5 }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ background: "#1A4A2E", borderRadius: h, height: h, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: `linear-gradient(90deg,${color},${color}bb)`,
        borderRadius: h, transition: "width .6s ease",
      }} />
    </div>
  );
}
