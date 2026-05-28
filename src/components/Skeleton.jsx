// ─── Skeleton ────────────────────────────────────────────────────────────────
// Animated shimmer placeholder for loading states.
import { T } from "../tokens";

const shimmerStyle = `
  @keyframes ht-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
`;

const base = {
  background: `linear-gradient(90deg, ${T.forest} 25%, #1a3a24 50%, ${T.forest} 75%)`,
  backgroundSize: "800px 100%",
  animation: "ht-shimmer 1.4s infinite linear",
  borderRadius: 6,
};

export default function Skeleton({ width = "100%", height = 14, style = {} }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div style={{ ...base, width, height, ...style }} />
    </>
  );
}

/** A card-shaped skeleton for list items */
export function SkeletonCard({ lines = 2 }) {
  return (
    <div style={{
      background: T.forest, borderRadius: 12, padding: "14px",
      border: "1px solid #1A4A2E", marginBottom: 10,
    }}>
      <Skeleton height={16} width="60%" style={{ marginBottom: 10 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={11}
          width={i === lines - 1 ? "40%" : "100%"}
          style={{ marginBottom: i < lines - 1 ? 6 : 0 }} />
      ))}
    </div>
  );
}

/** Inline text placeholder */
export function SkeletonText({ width = "80%", height = 12 }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <span style={{ ...base, display: "inline-block", width, height, verticalAlign: "middle" }} />
    </>
  );
}

/** A compact game-row skeleton for ScheduleScreen */
export function SkeletonGameRow() {
  return (
    <div style={{
      background: T.forest, borderRadius: 12, padding: "12px 14px",
      marginBottom: 8, border: "1px solid #1A4A2E",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        <Skeleton height={13} width="55%" />
        <Skeleton height={10} width="35%" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end" }}>
        <Skeleton height={13} width={40} />
        <Skeleton height={10} width={50} />
      </div>
    </div>
  );
}

/** Pull-to-refresh spinner indicator */
export function PullIndicator({ pulling, pct }) {
  const size = 28;
  const r = 11;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 1);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "10px 0", opacity: pulling ? 1 : 0.6,
      transition: "opacity 0.2s",
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="#1A4A2E" strokeWidth={2.5} />
        {pulling ? (
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="#A3E635" strokeWidth={2.5}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size/2} ${size/2})`} />
        ) : (
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="#A3E635" strokeWidth={2.5}
            style={{ animation: "ht-shimmer 0.7s linear infinite" }} />
        )}
      </svg>
      <span style={{ fontSize: 10, color: "#A3E635", marginLeft: 6, fontWeight: 700 }}>
        {pulling ? "Release to refresh" : "Refreshing…"}
      </span>
    </div>
  );
}
