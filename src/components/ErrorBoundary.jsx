// ─── ErrorBoundary ────────────────────────────────────────────────────────────
// Catches React render errors so one crashed screen doesn't take down the app.
import { Component } from "react";
import { T } from "../tokens";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, showDetail: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[HalfTime] Uncaught error:", error, info.componentStack);
  }

  handleTryAgain = () => {
    this.setState({ error: null, showDetail: false });
  };

  render() {
    if (this.state.error) {
      const { error, showDetail } = this.state;
      // Friendly, actionable message derived from the raw error
      const raw = error?.message || "";
      let friendly = "Something went wrong on this screen.";
      if (raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("Load failed")) {
        friendly = "Can't reach the server. Check your internet connection.";
      } else if (raw.includes("JWT") || raw.includes("session")) {
        friendly = "Your session expired. Please sign in again.";
      } else if (raw.includes("permission") || raw.includes("policy")) {
        friendly = "You don't have permission to view this page.";
      }

      return (
        <div style={{
          maxWidth: 430, margin: "0 auto", background: T.dark,
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 28, fontFamily: "Calibri,sans-serif", textAlign: "center",
        }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🏚️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 8 }}>
            Oops — something broke
          </div>
          <div style={{ fontSize: 13, color: T.chalk, marginBottom: 6,
            lineHeight: 1.6, maxWidth: 300 }}>
            {friendly}
          </div>
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 28, lineHeight: 1.5 }}>
            Try going back or refreshing. If the issue persists,{" "}
            <a href="mailto:support@halftime-app.com"
              style={{ color: T.lime, textDecoration: "none" }}>
              contact support
            </a>
            .
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap",
            justifyContent: "center" }}>
            <button
              onClick={this.handleTryAgain}
              style={{
                padding: "12px 24px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 10, fontSize: 13,
                fontWeight: 700, cursor: "pointer", minWidth: 120,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = "/app"}
              style={{
                padding: "12px 24px", background: "transparent", color: T.chalk,
                border: `1.5px solid ${T.green}`, borderRadius: 10, fontSize: 13,
                fontWeight: 700, cursor: "pointer", minWidth: 120,
              }}
            >
              Go Home
            </button>
          </div>

          {/* Collapsible error detail for debugging */}
          <button
            onClick={() => this.setState(s => ({ showDetail: !s.showDetail }))}
            style={{ background: "none", border: "none", color: T.mist,
              fontSize: 11, cursor: "pointer", textDecoration: "underline",
              textUnderlineOffset: 3, marginBottom: 8 }}
          >
            {showDetail ? "Hide" : "Show"} error detail
          </button>
          {showDetail && (
            <div style={{
              background: "#080d09", border: "1px solid #1A4A2E",
              borderRadius: 8, padding: "10px 14px", maxWidth: "100%",
              textAlign: "left", overflowX: "auto",
            }}>
              <pre style={{ fontSize: 10, color: T.mist, margin: 0,
                whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {raw || "No error message available"}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
