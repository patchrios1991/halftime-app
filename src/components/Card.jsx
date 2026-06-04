import { useState } from "react";
import { T } from "../tokens";

export default function Card({ children, style = {}, onClick, glow }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: T.forest,
        border: `1px solid ${hov && onClick ? T.lime + "55" : glow ? T.lime + "44" : "#1E5235"}`,
        borderRadius: 16, padding: 16,
        transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
        cursor: onClick ? "pointer" : "default",
        transform: hov && onClick ? "translateY(-2px)" : "none",
        boxShadow: glow
          ? `0 0 24px ${T.lime}22, 0 4px 16px rgba(0,0,0,0.35)`
          : "0 2px 10px rgba(0,0,0,0.3)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
