import React, { Component } from "react";

export default class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("[APP RECOVERY GUARD]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#f87171", background: "#0b101b", borderRadius: "14px", margin: "20px" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>⚠️ Component Recovery Shield Active</h3>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 16px" }}>
            An unexpected error was intercepted cleanly to prevent a full page crash.
          </p>
          {this.state.error && (
            <div style={{ color: "#fca5a5", fontSize: "0.78rem", background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "8px", margin: "10px auto 16px", maxWidth: "520px", wordBreak: "break-all" }}>
              {this.state.error.toString()}
            </div>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 18px",
              background: "linear-gradient(135deg, #0284c7, #3b82f6)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.82rem",
            }}
          >
            Reload Component
          </button>
        </div>
      );
    }
    return this.props.children || null;
  }
}
