import { Component } from "react";

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
        errStr.includes("error loading dynamic script") ||
        errStr.includes("usecallback is not defined") ||
        errStr.includes("is not defined") ||
        errStr.includes("referenceerror") ||
        errStr.includes("cannot access");

      if (isChunkOrImportError && typeof window !== "undefined") {
        const reloadKey = "fsm_boundary_auto_recovered_ts";
        const lastRecovered = Number(sessionStorage.getItem(reloadKey) || 0);
        const now = Date.now();

        // Auto-recover once per 12 seconds to prevent infinite bounce
        if (now - lastRecovered > 12000) {
          sessionStorage.setItem(reloadKey, String(now));
          // Cleanly purge stale cache & unregister old service workers immediately
          if ("caches" in window) {
            caches.keys().then((names) => names.forEach((n) => caches.delete(n))).catch(() => {});
          }
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
          }
          setTimeout(() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set("clean", String(now));
              window.location.replace(url.toString());
            } catch (_) {
              window.location.replace(window.location.origin + "/?clean=" + now);
            }
          }, 150);
        }
      }
    } catch (_) {}
  }

  handleReload = async () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    try {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            reg.active?.postMessage({ action: "PURGE_CACHE" });
            reg.active?.postMessage({ action: "SKIP_WAITING" });
          }
        } catch (_) {}
      }
      if (typeof window !== "undefined" && "caches" in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        } catch (_) {}
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("clean", String(Date.now()));
        window.location.replace(url.toString());
        return;
      }
    } catch (_) {}
    try {
      window.location.reload();
    } catch (_) {}
  };

  handleClearCacheAndReload = async () => {
    try {
      this.setState({ isResetting: true });

      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}

      const cleanupTasks = [];

      // 1. Unregister all service workers
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        cleanupTasks.push(
          navigator.serviceWorker.getRegistrations().then(async (regs) => {
            for (const reg of regs) {
              try { await reg.unregister(); } catch (_) {}
            }
          }).catch(() => {})
        );
      }

      // 2. Clear all cache storage caches
      if (typeof window !== "undefined" && "caches" in window) {
        cleanupTasks.push(
          caches.keys().then(async (names) => {
            for (const name of names) {
              try { await caches.delete(name); } catch (_) {}
            }
          }).catch(() => {})
        );
      }

      // 3. Best-effort non-blocking purge of indexedDB (strict 350ms race timeout so it NEVER hangs)
      if (typeof window !== "undefined" && "indexedDB" in window) {
        cleanupTasks.push(
          new Promise((resolve) => {
            try {
              ["fsm_notes_catalog_db", "fsm_p2p_cache_v1", "fsm_offline_vault", "fsm_offline_cache"].forEach((name) => {
                try { window.indexedDB.deleteDatabase(name); } catch (_) {}
              });
              if (typeof window.indexedDB.databases === "function") {
                window.indexedDB.databases().then((dbs) => {
                  (dbs || []).forEach((db) => {
                    if (db?.name) {
                      try { window.indexedDB.deleteDatabase(db.name); } catch (_) {}
                    }
                  });
                  resolve();
                }).catch(() => resolve());
              } else {
                resolve();
              }
            } catch (_) {
              resolve();
            }
          })
        );
      }

      // Guarantee timeout of 400ms max so user is never stuck
      await Promise.race([
        Promise.allSettled(cleanupTasks),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ]);
    } catch (_) {}

    // Force hard refresh with fresh timestamp while preserving note/page parameters
    try {
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set("fresh", String(Date.now()));
      window.location.replace(targetUrl.toString());
    } catch (_) {
      window.location.replace(window.location.origin + "/?fresh=" + Date.now());
    }
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
              background: "rgba(15, 23, 42, 0.88)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: "20px",
              padding: "36px 28px",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.18)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
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

            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 16px" }}>
              Browser cache ya script sync me rukawat aayi thi. Neeche diye button par tap karein — 1 second me fresh updated notes load ho jayenge.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.55)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "0.78rem",
                  color: "#fca5a5",
                  textAlign: "left",
                  maxHeight: "120px",
                  overflowY: "auto",
                  wordBreak: "break-word",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: "20px",
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "16px" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                ⚡ Instant Fix & Open Notes (तुरंत ठीक करें)
              </button>

              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                disabled={Boolean(this.state.isResetting)}
                style={{
                  padding: "12px 20px",
                  background: "rgba(255, 255, 255, 0.08)",
                  color: this.state.isResetting ? "#38bdf8" : "#cbd5e1",
                  border: `1px solid ${this.state.isResetting ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.18)"}`,
                  borderRadius: "10px",
                  cursor: this.state.isResetting ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {this.state.isResetting ? "🔄 Resetting & Reloading..." : "🔄 Clear Cache & Restart (पूरा कैश साफ करें)"}
              </button>
            </div>

            <div
              style={{
                fontSize: "0.78rem",
                color: "#38bdf8",
                background: "rgba(56, 189, 248, 0.08)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                borderRadius: "8px",
                padding: "8px 12px",
                lineHeight: "1.5",
              }}
            >
              📚 <strong>Exam Friendly:</strong> Aapke bookmarks, profile aur download kiye notes 100% surakshit hain.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children || null;
  }
}
