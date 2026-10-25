import React, { Component } from "react";

export default class ModalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("[ModalErrorBoundary] Caught modal load error:", error?.message || error, errorInfo);
    if (typeof this.props.onError === "function") {
      this.props.onError(error);
    }
  }

  handleClose = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onClose === "function") {
      this.props.onClose();
    }
  };

  handleReload = () => {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.clear();
      }
      if ("caches" in window) {
        caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
    } catch (_) {}
    window.location.replace(window.location.origin + "/?fresh=" + Date.now());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(3, 7, 18, 0.8)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          }}
          onClick={this.handleClose}
        >
          <div
            style={{
              maxWidth: "440px",
              width: "100%",
              background: "#0f172a",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "18px",
              padding: "28px 24px",
              textAlign: "center",
              boxShadow: "0 25px 60px rgba(0,0,0,0.85), 0 0 25px rgba(56, 189, 248, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "14px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                marginBottom: "14px",
              }}
            >
              🛡️
            </div>

            <h3 style={{ margin: "0 0 8px", color: "#f8fafc", fontSize: "1.15rem", fontWeight: 800 }}>
              Dialog Notice
            </h3>

            <p style={{ margin: "0 0 20px", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.55 }}>
              Could not open this dialog due to updated assets or temporary network connection. Your notes, catalog, and workspace remain completely active.
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={this.handleClose}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  color: "#cbd5e1",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close Dialog
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)",
                  border: "none",
                  color: "#fff",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
                }}
              >
                ⚡ Refresh &amp; Reopen
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

