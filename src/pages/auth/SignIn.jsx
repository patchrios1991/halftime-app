// ─── SignIn / SignUp ───────────────────────────────────────────────────────────
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { useAuth } from "../../hooks/useAuth";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { friendlyError } from "../../lib/friendlyError";

// ── Tiny field wrapper ─────────────────────────────────────────────────────────
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
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          background:    T.forest,
          border:        `1.5px solid ${borderColor}`,
          borderRadius:  10,
          padding:       "12px 14px",
          color:         T.white,
          fontSize:      15,
          outline:       "none",
          width:         "100%",
          boxSizing:     "border-box",
          transition:    "border-color 0.15s",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && (
        <div style={{ fontSize: 11, color: T.red, marginTop: 1 }}>{error}</div>
      )}
      {!error && hint && (
        <div style={{ fontSize: 11, color: T.mist, marginTop: 1 }}>{hint}</div>
      )}
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
function Divider({ label = "or" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: T.green }} />
      <span style={{ color: T.mist, fontSize: 12, fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.green }} />
    </div>
  );
}

// ── Primary button ─────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = "primary", style: extra }) {
  const base = {
    width:        "100%",
    padding:      "14px 0",
    borderRadius: 12,
    border:       "none",
    fontSize:     15,
    fontWeight:   700,
    cursor:       disabled ? "not-allowed" : "pointer",
    opacity:      disabled ? 0.5 : 1,
    transition:   "transform 0.1s, opacity 0.15s",
    ...extra,
  };
  const styles = {
    primary: { background: T.lime, color: T.dark },
    ghost:   { background: "transparent", color: T.chalk, border: `1.5px solid ${T.green}` },
    google:  { background: T.white, color: "#1f1f1f", display: "flex",
               alignItems: "center", justifyContent: "center", gap: 10 },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...styles[variant] }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e   => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SignIn() {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, signInWithMagicLink } = useAuth();

  const [mode, setMode]           = useState("signin"); // "signin" | "signup" | "magic"
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setDisplay] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [feedback, setFeedback]   = useState(null); // { type: "error"|"success", msg }
  const [fieldErrors, setFieldErrors] = useState({}); // { email, password, displayName, inviteCode }

  const fb = (type, msg) => setFeedback({ type, msg });

  function clearFieldErrors() { setFieldErrors({}); }

  /** Returns false if any validation fails; sets fieldErrors state */
  function validateForm() {
    const errs = {};
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      errs.email = "Email is required.";
    } else if (!emailRx.test(email)) {
      errs.email = "Enter a valid email address.";
    }

    if (mode !== "magic") {
      if (!password) {
        errs.password = "Password is required.";
      } else if (mode === "signup" && password.length < 8) {
        errs.password = "Password must be at least 8 characters.";
      }
    }

    if (mode === "signup") {
      if (!inviteCode.trim()) errs.inviteCode = "Invite code is required.";
      if (!displayName.trim()) errs.displayName = "Display name is required.";
      if (!agreedToTos) errs.tos = "You must agree to the Terms of Service.";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit handler ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    if (!validateForm()) return; // show inline field errors instead

    setBusy(true);
    try {
      if (mode === "magic") {
        await signInWithMagicLink(email);
        fb("success", `Magic link sent to ${email} — check your inbox!`);
      } else if (mode === "signup") {
        // Validate invite code before creating account
        if (isSupabaseConfigured) {
          const { data: valid } = await supabase.rpc("check_invite_code", {
            p_code: inviteCode.trim(),
          });
          if (!valid) {
            setFieldErrors(f => ({ ...f, inviteCode: "Invalid or expired invite code." }));
            fb("error", "That invite code isn't valid. Need one? Join the waitlist at halftime-app.com");
            return;
          }
        }
        await signUp({ email, password, displayName });
        // Atomically consume the code after successful signup
        if (isSupabaseConfigured && inviteCode.trim()) {
          await supabase.rpc("redeem_invite_code", { p_code: inviteCode.trim() });
        }
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

  async function handleGoogle() {
    setFeedback(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // OAuth redirect — page will reload via AuthCallback
    } catch (err) {
      fb("error", err.message);
      setBusy(false);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const titles = {
    signin: { head: "Welcome back", sub: "Sign in to your HalfTime account" },
    signup: { head: "Create account", sub: "Join a pod and own your seat" },
    magic:  { head: "Magic link",    sub: "We'll email you a one-click sign-in" },
  };
  const { head, sub } = titles[mode];

  return (
    <div style={{
      minHeight:       "100vh",
      background:      T.dark,
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      padding:         "24px 16px",
    }}>
      <div style={{
        width:        "100%",
        maxWidth:     400,
        display:      "flex",
        flexDirection:"column",
        gap:          24,
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <Wordmark size={28} />
          <p style={{ color: T.mist, fontSize: 13, marginTop: 6 }}>
            Fractional season ticket co-ownership
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:   T.forest,
          borderRadius: 18,
          padding:      "28px 24px",
          border:       `1px solid ${T.green}`,
          display:      "flex",
          flexDirection:"column",
          gap:          20,
        }}>

          {/* Heading */}
          <div>
            <h2 style={{ color: T.white, fontSize: 20, fontWeight: 700, margin: 0 }}>
              {head}
            </h2>
            <p style={{ color: T.mist, fontSize: 13, margin: "4px 0 0" }}>{sub}</p>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div style={{
              background:   feedback.type === "error"
                ? "rgba(239,68,68,0.15)"
                : "rgba(52,211,153,0.15)",
              border:       `1px solid ${feedback.type === "error" ? T.red : T.teal}`,
              borderRadius: 10,
              padding:      "10px 14px",
              color:        feedback.type === "error" ? T.red : T.teal,
              fontSize:     13,
              lineHeight:   1.4,
            }}>
              {feedback.msg}
            </div>
          )}

          {/* Google OAuth — sign-in only; signup requires invite code via email flow */}
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

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <>
                <Field
                  label="Invite Code"
                  value={inviteCode}
                  onChange={v => { setInviteCode(v.toUpperCase()); setFieldErrors(f => ({ ...f, inviteCode: null })); }}
                  placeholder="Enter your invite code"
                  autoComplete="off"
                  error={fieldErrors.inviteCode}
                />
                <Field
                  label="Display name"
                  value={displayName}
                  onChange={v => { setDisplay(v); setFieldErrors(f => ({ ...f, displayName: null })); }}
                  placeholder="Jordan K."
                  autoComplete="name"
                  error={fieldErrors.displayName}
                />
              </>
            )}

            <Field
              label="Email"
              type="email"
              value={email}
              onChange={v => { setEmail(v); setFieldErrors(f => ({ ...f, email: null })); }}
              placeholder="you@example.com"
              autoComplete="email"
              error={fieldErrors.email}
            />

            {mode !== "magic" && (
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={v => { setPassword(v); setFieldErrors(f => ({ ...f, password: null })); }}
                placeholder={mode === "signup" ? "Create a password (min 8 chars)" : "Enter your password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                error={fieldErrors.password}
                hint={mode === "signup" && !fieldErrors.password && password.length > 0 && password.length < 8
                  ? `${8 - password.length} more character${8 - password.length !== 1 ? "s" : ""} needed`
                  : null}
              />
            )}

            {/* ToS agreement — signup only */}
            {mode === "signup" && (
              <div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10,
                  cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={agreedToTos}
                    onChange={e => { setAgreedToTos(e.target.checked); setFieldErrors(f => ({ ...f, tos: null })); }}
                    style={{ marginTop: 2, accentColor: T.lime, width: 16, height: 16,
                      flexShrink: 0, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 12, color: T.mist, lineHeight: 1.5 }}>
                    I agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer"
                      style={{ color: T.lime, textDecoration: "none" }}>
                      Terms of Service
                    </a>
                    {" "}and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer"
                      style={{ color: T.lime, textDecoration: "none" }}>
                      Privacy Policy
                    </a>
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

          {/* Mode switchers */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signin" && (
              <button
                onClick={() => { setMode("signup"); setFeedback(null); clearFieldErrors(); }}
                style={linkStyle}
              >
                Don't have an account? Sign up
              </button>
            )}
            {mode === "signup" && (
              <button
                onClick={() => { setMode("signin"); setFeedback(null); clearFieldErrors(); }}
                style={linkStyle}
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const linkStyle = {
  background:  "none",
  border:      "none",
  color:       T.mist,
  fontSize:    13,
  cursor:      "pointer",
  textAlign:   "center",
  padding:     0,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};
