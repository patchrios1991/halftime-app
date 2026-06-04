import { useEffect } from "react";
import { T } from "../tokens";

export default function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
      background: "#0F2617",
      border: `1px solid ${T.lime}44`,
      borderRadius: 26, padding: "11px 22px",
      fontSize: 13, fontWeight: 600, color: T.white,
      fontFamily: "Calibri,sans-serif",
      zIndex: 9999,
      boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,241,53,0.12)",
      maxWidth: 310, textAlign: "center",
      animation: "fadeInToast .25s cubic-bezier(0.34,1.56,0.64,1)",
      whiteSpace: "nowrap",
    }}>
      {message}
    </div>
  );
}
