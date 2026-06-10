// ─── PendingApproval ──────────────────────────────────────────────────────────
// Shown to authenticated users whose profile isn't approved yet (e.g. they
// signed in with Google before being approved). Adds them to the waitlist
// automatically so the admin sees the request.
import { useEffect, useState } from "react";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { supabase } from "../../lib/supabase";

export default function PendingApproval({ user, profile, signOut }) {
  const [listed, setListed] = useState(false);

  // Make sure they're on the waitlist so the admin sees the request
  useEffect(() => {
    if (!user?.email) return;
    let alive = true;
    supabase
      .from("waitlist")
      .insert({ email: user.email, name: profile?.display_name || null })
      .then(({ error }) => {
        // 23505 = already on the waitlist, which is fine
        if (alive && (!error || error.code === "23505")) setListed(true);
      });
    return () => { alive = false; };
  }, [user?.email, profile?.display_name]);

  return (
    <div style={{
      minHeight: "100dvh", background: T.dark,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 0, padding: 28,
      fontFamily: "Calibri,sans-serif", textAlign: "center",
    }}>
      <Wordmark size={26} />
      <div style={{ fontSize: 52, margin: "28px 0 16px" }}>⏳</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: T.white,
        fontFamily: "Georgia,serif", marginBottom: 12 }}>
        You're on the list
      </div>
      <p style={{ color: T.mist, fontSize: 14.5, lineHeight: 1.6,
        maxWidth: 320, margin: "0 0 8px" }}>
        HalfTime is in early access and new accounts are approved by our team.
        {listed ? " Your request is in — " : " "}
        we'll email you at{" "}
        <span style={{ color: T.chalk, fontWeight: 700 }}>{user?.email}</span>{" "}
        as soon as you're approved.
      </p>
      <p style={{ color: "#4A7A5A", fontSize: 12.5, margin: "0 0 32px" }}>
        Already approved? Approval can take a minute to reach your account —
        try closing and reopening the app.
      </p>
      <button onClick={signOut}
        style={{
          background: "transparent", border: `1.5px solid ${T.green}`,
          borderRadius: 12, color: T.mist, fontSize: 13, fontWeight: 700,
          padding: "12px 28px", cursor: "pointer", fontFamily: "Calibri,sans-serif",
        }}>
        Sign out
      </button>
    </div>
  );
}
