import { T } from "../tokens";

export default function Avatar({ initials, size = 36, color = T.lime, verified = false }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center",
      justifyContent: "center", width: size, height: size, borderRadius: "50%",
      background: `${color}18`, border: `2px solid ${color}`,
      fontSize: size * 0.32, fontWeight: 700, color, fontFamily: "Georgia,serif", flexShrink: 0 }}>
      {initials}
      {verified && (
        <div style={{ position: "absolute", bottom: -2, right: -2, width: 13, height: 13,
          borderRadius: "50%", background: T.lime, border: `2px solid ${T.dark}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 7, color: T.dark, fontWeight: 900 }}>✓</div>
      )}
    </div>
  );
}
