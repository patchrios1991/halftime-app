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
        border: `1px solid ${hov && onClick ? T.lime + "55" : glow ? T.lime + "44" : "#1A4A2E"}`,
        borderRadius: 14, padding: 16,
        transition: "all .2s",
        cursor: onClick ? "pointer" : "default",
        transform: hov && onClick ? "translateY(-1px)" : "none",
        boxShadow: glow ? `0 0 20px ${T.lime}22` : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
