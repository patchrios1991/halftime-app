// ─── SignIn / Waitlist / SignUp ────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import { T }                   from "../../tokens";
import Wordmark                from "../../components/Wordmark";
import { useAuth }             from "../../hooks/useAuth";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { friendlyError }       from "../../lib/friendlyError";

// ── Field ──────────────────────────────────────────────────────────────────────
function Field({ label, type = "text", value, onChange, placeholder, autoComplete, error, hint }) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? T.red : focused ? T.lime : T.green;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                      color: error ? T.red : T.mist, textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
        style={{ background: T.forest, border: `1.5px solid ${borderColor}`,
                 borderRadius: 10, padding: "12px 14px", color: T.white,
                 fontSize: 15, outline: "none", width: "100%",
                 boxSizing: "border-box", transition: "border-color 0.15s" }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      />
      {error && <div style={{ fontSize: 11, color: T.red, marginTop: 1 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 11, color: T.mist, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

function Divider({ label = "or" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: T.green }} />
      <span style={{ color: T.mist, fontSize: 12, fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.green }} />
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", style: extra }) {
  const base = { width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                 fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
                 opacity: disabled ? 0.5 : 1, transition: "transform 0.1s, opacity 0.15s", ...extra };
  const styles = {
    primary: { background: T.lime, color: T.dark },
    ghost:   { background: "transparent", color: T.chalk, border: `1.5px solid ${T.green}` },
    google:  { background: T.white, color: "#1f1f1f", display: "flex",
               alignItems: "center", justifyContent: "center", gap: 10 },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...styles[variant] }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}>
      {children}
    </button>
  );
}

// ── Social proof stats ─────────────────────────────────────────────────────────
function SocialProof() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Promise.all([
      supabase.from("pods").select("id", { count: "exact", head: true }).in("status", ["active","recruiting"]),
      supabase.from("pod_members").select("id", { count: "exact", head: true }),
    ]).then(([pods, members]) => {
      setStats({ pods: pods.count ?? 0, members: members.count ?? 0 });
    }).catch(() => {});
  }, []);

  if (!stats || (stats.pods === 0 && stats.members === 0)) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 4 }}>
      {[
        { v: stats.pods,    l: "active pods"  },
        { v: stats.members, l: "members"      },
        { v: "100%",        l: "escrow-backed" },
      ].map(({ v, l }) => (
        <div key={l} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.lime,
            fontFamily: "Georgia,serif" }}>{v}</div>
          <div style={{ fontSize: 10, color: T.mist }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, signInWithMagicLink } = useAuth();

  // mode: "signin" | "waitlist" | "signup" | "magic"
  // "signup" is hidden — only reachable from the approval email link or waitlist success screen
  const params   = new URLSearchParams(window.location.search);
  const initMode = params.get("mode") === "signup" ? "signup" : "signin";

  const [mode,        setMode]        = useState(initMode);
  const [email,       setEmail]       = useState(params.get("email") || "");
  const [password,    setPassword]    = useState("");
  const [displayName, setDisplay]     = useState("");
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [feedback,    setFeedback]    = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Waitlist-specific state
  const [wlName,  setWlName]  = useState("");
  const [wlEmail, setWlEmail] = useState("");
  const [wlDone,  setWlDone]  = useState(false);

  const fb = (type, msg) => setFeedback({ type, msg });
  function clearFieldErrors() { setFieldErrors({}); }

  function validateSignIn() {
    const errs = {};
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim())          errs.email    = "Email is required.";
    else if (!emailRx.test(email)) errs.email = "Enter a valid email address.";
    if (mode !== "magic") {
      if (!password)             errs.password = "Password is required.";
      else if (mode === "signup" && password.length < 8)
                                 errs.password = "Password must be at least 8 characters.";
    }
    if (mode === "signup") {
      if (!displayName.trim())   errs.displayName = "Display name is required.";
      if (!agreedToTos)          errs.tos = "You must agree to the Terms of Service.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    if (!validateSignIn()) return;
    setBusy(true);
    try {
      if (mode === "magic") {
        await signInWithMagicLink(email);
        fb("success", `Magic link sent to ${email} — check your inbox!`);
      } else if (mode === "signup") {
        await signUp({ email, password, displayName });
        fb("success", "Account created! Check your email to confirm your address.");
      } else {
        await signIn({ email, password });
        navigate("/app");
      }
    } catch (err) {
      fb("error", friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleWaitlist(e) {
    e.preventDefault();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const errs = {};
    if (!wlName.trim())            errs.wlName  = "Your name is required.";
    if (!wlEmail.trim())           errs.wlEmail = "Email is required.";
    else if (!emailRx.test(wlEmail)) errs.wlEmail = "Enter a valid email address.";
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setBusy(true);
    setFeedback(null);
    try {
      const { error } = await supabase.from("waitlist")
        .insert({ name: wlName.trim(), email: wlEmail.trim().toLowerCase() });
      if (error) {
        if (error.code === "23505") fb("error", "That email is already on the waitlist.");
        else throw error;
      } else {
        setWlDone(true);
      }
    } catch (err) {
      fb("error", friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setFeedback(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      fb("error", err.message);
      setBusy(false);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const titles = {
    signin:   { head: "Welcome back",       sub: "Sign in to your HalfTime account" },
    waitlist: { head: "Request access",     sub: "Join the waitlist — we'll reach out soon" },
    signup:   { head: "Create account",     sub: "You're approved — set up your account" },
    magic:    { head: "Magic link",         sub: "We'll email you a one-click sign-in" },
  };
  const { head, sub } = titles[mode];

  return (
    <div style={{ minHeight: "100vh", background: T.dark, display: "flex",
                  alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex",
                    flexDirection: "column", gap: 20 }}>

        {/* Logo + tagline */}
        <div style={{ textAlign: "center" }}>
          <Wordmark size={28} />
          <p style={{ color: T.mist, fontSize: 13, marginTop: 6 }}>
            Fractional season ticket co-ownership
          </p>
        </div>

        {/* Social proof */}
        <SocialProof />

        {/* Card */}
        <div style={{ background: T.forest, borderRadius: 18, padding: "28px 24px",
                      border: `1px solid ${T.green}`, display: "flex",
                      flexDirection: "column", gap: 20 }}>

          <div>
            <h2 style={{ color: T.white, fontSize: 20, fontWeight: 700, margin: 0 }}>{head}</h2>
            <p style={{ color: T.mist, fontSize: 13, margin: "4px 0 0" }}>{sub}</p>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div style={{ background: feedback.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)",
                          border: `1px solid ${feedback.type === "error" ? T.red : T.teal}`,
                          borderRadius: 10, padding: "10px 14px",
                          color: feedback.type === "error" ? T.red : T.teal,
                          fontSize: 13, lineHeight: 1.4 }}>
              {feedback.msg}
            </div>
          )}

          {/* ── Waitlist form ── */}
          {mode === "waitlist" && (
            wlDone ? (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 8 }}>You're on the list!</div>
                <div style={{ fontSize: 13, color: T.mist, lineHeight: 1.6 }}>
                  We'll review your request and send you an email when you're approved.
                  Usually within a few days.
                </div>
              </div>
            ) : (
              <form onSubmit={handleWaitlist} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Your name" value={wlName}
                  onChange={v => { setWlName(v); setFieldErrors(f => ({ ...f, wlName: null })); }}
                  placeholder="Jordan K." autoComplete="name" error={fieldErrors.wlName} />
                <Field label="Email" type="email" value={wlEmail}
                  onChange={v => { setWlEmail(v); setFieldErrors(f => ({ ...f, wlEmail: null })); }}
                  placeholder="you@example.com" autoComplete="email" error={fieldErrors.wlEmail} />

                {/* Why HalfTime */}
                <div style={{ background: "#0D1F12", borderRadius: 10, padding: "12px 14px",
                  border: "1px solid #1A4A2E" }}>
                  {[
                    "🎟️ Own a fraction of season tickets",
                    "💸 Pay only your share — nothing more",
                    "🔒 Funds held in Stripe escrow until confirmed",
                  ].map(line => (
                    <div key={line} style={{ fontSize: 12, color: T.mist, marginBottom: 5, lineHeight: 1.5 }}>
                      {line}
                    </div>
                  ))}
                </div>

                <Btn disabled={busy}>{busy ? "Submitting…" : "Request access →"}</Btn>
              </form>
            )
          )}

          {/* ── Sign in + Signup + Magic forms ── */}
          {mode !== "waitlist" && (
            <>
              {mode === "signin" && isSupabaseConfigured && (
                <>
                  <Btn variant="google" onClick={handleGoogle} disabled={busy}>
                    <svg width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Continue with Google
                  </Btn>
                  <Divider />
                </>
              )}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {mode === "signup" && (
                  <Field label="Display name" value={displayName}
                    onChange={v => { setDisplay(v); setFieldErrors(f => ({ ...f, displayName: null })); }}
                    placeholder="Jordan K." autoComplete="name" error={fieldErrors.displayName} />
                )}
                <Field label="Email" type="email" value={email}
                  onChange={v => { setEmail(v); setFieldErrors(f => ({ ...f, email: null })); }}
                  placeholder="you@example.com" autoComplete="email" error={fieldErrors.email} />
                {mode !== "magic" && (
                  <Field label="Password" type="password" value={password}
                    onChange={v => { setPassword(v); setFieldErrors(f => ({ ...f, password: null })); }}
                    placeholder={mode === "signup" ? "Create a password (min 8 chars)" : "Enter your password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    error={fieldErrors.password}
                    hint={mode === "signup" && !fieldErrors.password && password.length > 0 && password.length < 8
                      ? `${8 - password.length} more character${8 - password.length !== 1 ? "s" : ""} needed`
                      : null} />
                )}
                {mode === "signup" && (
                  <div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <input type="checkbox" checked={agreedToTos}
                        onChange={e => { setAgreedToTos(e.target.checked); setFieldErrors(f => ({ ...f, tos: null })); }}
                        style={{ marginTop: 2, accentColor: T.lime, width: 16, height: 16,
                          flexShrink: 0, cursor: "pointer" }} />
                      <span style={{ fontSize: 12, color: T.mist, lineHeight: 1.5 }}>
                        I agree to the{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer"
                          style={{ color: T.lime, textDecoration: "none" }}>Terms of Service</a>
                        {" "}and{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer"
                          style={{ color: T.lime, textDecoration: "none" }}>Privacy Policy</a>
                      </span>
                    </label>
                    {fieldErrors.tos && (
                      <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{fieldErrors.tos}</div>
                    )}
                  </div>
                )}
                <Btn disabled={busy}>
                  {busy ? "Please wait…" :
                   mode === "magic"  ? "Send magic link →" :
                   mode === "signup" ? "Create account →" : "Sign in →"}
                </Btn>
              </form>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {mode === "signin" && (
                  <button onClick={() => { setMode("waitlist"); setFeedback(null); clearFieldErrors(); }}
                    style={linkStyle}>
                    New here? Request access →
                  </button>
                )}
                {(mode === "signup" || mode === "waitlist") && (
                  <button onClick={() => { setMode("signin"); setFeedback(null); clearFieldErrors(); }}
                    style={linkStyle}>
                    Already have an account? Sign in
                  </button>
                )}
                {mode === "signin" && (
                  <button onClick={() => { setMode("magic"); setFeedback(null); clearFieldErrors(); }}
                    style={linkStyle}>
                    Sign in with magic link
                  </button>
                )}
                {mode === "magic" && (
                  <button onClick={() => { setMode("signin"); setFeedback(null); clearFieldErrors(); }}
                    style={linkStyle}>
                    ← Back to sign in
                  </button>
                )}
              </div>
            </>
          )}

          {mode === "waitlist" && !wlDone && (
            <button onClick={() => { setMode("signin"); setFeedback(null); clearFieldErrors(); }}
              style={linkStyle}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const linkStyle = {
  background: "none", border: "none", color: T.mist, fontSize: 13,
  cursor: "pointer", textAlign: "center", padding: 0,
  textDecoration: "underline", textUnderlineOffset: 3,
};
