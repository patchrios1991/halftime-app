import { useEffect } from "react";
import { T } from "../tokens";

export default function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
      background: T.forest, border: `1px solid ${T.lime}55`,
      borderRadius: 12, padding: "12px 20px",
      fontSize: 13, color: T.white, fontFamily: "Calibri,sans-serif",
      zIndex: 9999, boxShadow: "0 8px 32px #00000055",
      maxWidth: 320, textAlign: "center",
      animation: "fadeInToast .25s ease",
    }}>
      {message}
    </div>
  );
}
