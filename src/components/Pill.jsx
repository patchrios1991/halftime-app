import { T } from "../tokens";

export default function Pill({ label, color = T.lime }) {
  return (
    <span style={{
      background: `${color}22`, color,
      border: `1px solid ${color}33`,
      borderRadius: 6, padding: "1px 7px",
      fontSize: 10, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}
