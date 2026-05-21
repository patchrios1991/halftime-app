import { T } from "../tokens";

export default function Badge({ children, color = T.lime }) {
  return (
    <span style={{
      background: `${color}18`, color,
      border: `1px solid ${color}35`,
      borderRadius: 20, padding: "2px 9px",
      fontSize: 11, fontWeight: 700, fontFamily: "Calibri,sans-serif",
    }}>
      {children}
    </span>
  );
}
