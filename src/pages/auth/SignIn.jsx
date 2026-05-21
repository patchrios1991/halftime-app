// ─── SignIn / SignUp ───────────────────────────────────────────────────────────
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../../tokens";
import Wordmark from "../../components/Wordmark";
import { useAuth } from "../../hooks/useAuth";
import { isSupabaseConfigured } from "../../lib/supabase";

// ── Tiny field wrapper ─────────────────────────────────────────────────────────
function Field({ label, type = "text", value, onChange, placeholder, autoComplete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                      color: T.mist, textTransform: "uppercase" }}>
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
          border:        `1.5px solid ${T.green}`,
          borderRadius:  10,
          padding:       "12px 14px",
          color:         T.white,
          fontSize:      15,
          outline:       "none",
          width:         "100%",
          boxSizing:     "border-box",
          transition:    "border-color 0.15s",
        }}
        onFocus={e  => (e.target.style.borderColor = T.lime)}
        onBlur={e   => (e.target.style.borderColor = T.green)}
      />
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
  const [busy, setBusy]           = useState(false);
  const [feedback, setFeedback]   = useState(null); // { type: "error"|"success", msg }

  const fb = (type, msg) => setFeedback({ type, msg });

  // ── Submit handler ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      if (mode === "magic") {
        await signInWithMagicLink(email);
        fb("success", `Magic link sent to ${email} — check your inbox!`);
      } else if (mode === "signup") {
        await signUp({ email, password, displayName });
        fb("success", "Account created! Check your email to confirm.");
      } else {
        await signIn({ email, password });
        navigate("/app");
      }
    } catch (err) {
      fb("error", err.message);
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

  // Demo mode bypass
  function handleDemo() {
    navigate("/app");
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

          {/* Google OAuth */}
          {mode !== "magic" && isSupabaseConfigured && (
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
              <Field
                label="Display name"
                value={displayName}
                onChange={setDisplay}
                placeholder="Jordan K."
                autoComplete="name"
              />
            )}

            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
            />

            {mode !== "magic" && (
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            )}

            <Btn disabled={busy || !email}>
              {busy ? "Please wait…" :
               mode === "magic"  ? "Send magic link" :
               mode === "signup" ? "Create account" : "Sign in"}
            </Btn>
          </form>

          {/* Mode switchers */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signin" && (
              <>
                <button
                  onClick={() => { setMode("magic"); setFeedback(null); }}
                  style={linkStyle}
                >
                  Sign in without a password →
                </button>
                <button
                  onClick={() => { setMode("signup"); setFeedback(null); }}
                  style={linkStyle}
                >
                  Don't have an account? Sign up
                </button>
              </>
            )}
            {mode === "signup" && (
              <button
                onClick={() => { setMode("signin"); setFeedback(null); }}
                style={linkStyle}
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === "magic" && (
              <button
                onClick={() => { setMode("signin"); setFeedback(null); }}
                style={linkStyle}
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        {/* Demo bypass */}
        <div style={{ textAlign: "center" }}>
          <button onClick={handleDemo} style={{ ...linkStyle, fontSize: 12 }}>
            {isSupabaseConfigured
              ? "Skip sign-in (demo mode)"
              : "⚡ Demo mode — Supabase not configured"}
          </button>
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
