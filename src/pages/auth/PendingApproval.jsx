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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState(null);

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

  // Account deletion — required by Apple (5.1.1(v)) even before approval,
  // since the account already exists. Unapproved users have no pods, so
  // delete_my_account() always proceeds cleanly.
  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      try { await signOut?.(); } catch { /* deleted either way */ }
      localStorage.removeItem("ht_active_pod");
      localStorage.removeItem("ht_onboarded");
      window.location.assign("/");
    } catch (e) {
      setDeleteErr(e.message || "Couldn't delete your account. Please try again.");
      setDeleteBusy(false);
    }
  }

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

      {/* Account deletion (Apple 5.1.1(v)) — the account exists even while
          pending, so it must be deletable from here. */}
      {!confirmingDelete ? (
        <button onClick={() => { setConfirmingDelete(true); setDeleteErr(null); }}
          style={{
            background: "transparent", border: "none", color: "#4A7A5A",
            fontSize: 12.5, fontWeight: 600, padding: "16px 12px 0",
            cursor: "pointer", fontFamily: "Calibri,sans-serif",
            textDecoration: "underline",
          }}>
          Delete my account
        </button>
      ) : (
        <div style={{ marginTop: 22, maxWidth: 320, width: "100%",
          background: "#1A0E0E", border: `1px solid ${T.red}`,
          borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ color: T.white, fontSize: 13.5, fontWeight: 700,
            marginBottom: 6 }}>Delete your account?</div>
          <p style={{ color: T.mist, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 14px" }}>
            This permanently removes your HalfTime account and waitlist
            request. This can't be undone.
          </p>
          {deleteErr && (
            <p style={{ color: T.red, fontSize: 12, margin: "0 0 12px" }}>{deleteErr}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmingDelete(false)} disabled={deleteBusy}
              style={{ flex: 1, padding: "11px", background: "transparent",
                border: `1.5px solid ${T.green}`, borderRadius: 10, color: T.mist,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "Calibri,sans-serif" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleteBusy}
              style={{ flex: 1, padding: "11px", background: T.red, border: "none",
                borderRadius: 10, color: T.white, fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: deleteBusy ? 0.7 : 1,
                fontFamily: "Calibri,sans-serif" }}>
              {deleteBusy ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
