import React, { Component } from "react";

export default class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[GLOBAL SHIELD RECOVERY]", error, errorInfo);
    this.setState({ errorInfo });

    try {
      const errStr = (error?.toString() || "").toLowerCase();
      const isChunkOrImportError =
        errStr.includes("failed to fetch dynamically imported module") ||
        errStr.includes("loading chunk") ||
        errStr.includes("dynamically imported module") ||
        errStr.includes("error loading dynamic script");

      if (isChunkOrImportError && typeof window !== "undefined") {
        const reloadKey = "fsm_boundary_chunk_reload";
        const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
        const now = Date.now();
        // Auto-reload once within 12 seconds to recover cleanly from stale chunks / dev restarts
        if (now - lastReload > 12000) {
          sessionStorage.setItem(reloadKey, String(now));
          console.warn("[GlobalErrorBoundary] Auto-recovering from dynamic chunk error...");
          setTimeout(() => {
            window.location.reload();
          }, 350);
        }
      }
    } catch (_) {}
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    try {
      window.location.reload();
    } catch (_) {}
  };

  handleClearCacheAndReload = () => {
    try {
      localStorage.removeItem("fsm_offline_flags");
      localStorage.removeItem("fsm_cached_notes_index");
      sessionStorage.clear();
      if ("caches" in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.update());
        });
      }
    } catch (_) {}
    window.location.href = window.location.origin + "/?fresh=" + Date.now();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            width: "100%",
            background: "radial-gradient(ellipse at top, #0f172a 0%, #060911 100%)",
            color: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: "560px",
              width: "100%",
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              borderRadius: "20px",
              padding: "36px 28px",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.2)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.4)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.8rem",
                marginBottom: "16px",
              }}
            >
              🛡️
            </div>

            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: "0 0 10px", color: "#fff" }}>
              Academic Vault Recovery Shield
            </h2>

            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 20px" }}>
              An unexpected render anomaly was caught cleanly to safeguard your academic workspace and prevent a blank screen.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.5)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "0.78rem",
                  color: "#fca5a5",
                  textAlign: "left",
                  maxHeight: "140px",
                  overflowY: "auto",
                  wordBreak: "break-word",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: "24px",
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "11px 22px",
                  background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
                }}
              >
                ⚡ Reload Vault
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                style={{
                  padding: "11px 20px",
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                🧹 Purge Stale Cache &amp; Restart
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children || null;
  }
}
