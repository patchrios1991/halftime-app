import { T } from "../tokens";

export default function Wordmark({ size = 20 }) {
  return (
    <span style={{ fontFamily: "Georgia,serif", fontSize: size, fontWeight: 900, letterSpacing: -0.5 }}>
      <span style={{ color: T.white }}>Half</span>
      <span style={{ color: T.lime }}>Time</span>
    </span>
  );
}
