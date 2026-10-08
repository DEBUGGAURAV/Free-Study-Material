import React, { useState, useEffect } from "react";
import { X, Shield, Key, Trash2, Eye, EyeOff, Server, HardDrive, RefreshCw } from "lucide-react";
import { api } from "../api";

export default function AdminModal({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  notes,
  onRefreshNotes,
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [activeTab, setActiveTab] = useState("vault"); // 'vault' or 'health'

  const isAdmin = currentUser?.role === "admin" || currentUser?.email === "jnplotus@gmail.com";

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadAdminData();
    }
  }, [isOpen, isAdmin]);

  const loadAdminData = async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        api.getStats().catch(() => ({ stats: null })),
        api.getHealth().catch(() => null),
      ]);
      setStats(statsRes.stats);
      setHealth(healthRes);
    } catch (err) {
      console.warn("[ADMIN] Data load warning:", err.message);
    }
  };

  if (!isOpen) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await api.login(identifier, password);
      onLoginSuccess(res.user);
    } catch (err) {
      setLoginError(err.message || "Invalid credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleToggleVisibility = async (noteId, currentStatus) => {
    try {
      await api.toggleVisibility(noteId, !currentStatus);
      onRefreshNotes();
    } catch (err) {
      alert("Failed to toggle visibility: " + err.message);
    }
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm("Permanently delete this note from the vault?")) return;
    try {
      await api.deleteNote(noteId);
      onRefreshNotes();
      loadAdminData();
    } catch (err) {
      alert("Failed to delete note: " + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "880px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(99, 102, 241, 0.15)",
                color: "var(--accent-indigo)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={20} />
            </div>
            <div className="modal-title">
              {isAdmin ? "Admin Studio & Vault Center" : "Admin Vault Login"}
            </div>
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {!isAdmin ? (
          /* Login Form */
          <form onSubmit={handleLogin} style={{ maxWidth: "420px", margin: "20px auto" }}>
            {loginError && (
              <div
                style={{
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "#f43f5e",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "16px",
                  fontSize: "0.85rem",
                }}
              >
                {loginError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Admin Email or Alias</label>
              <input
                type="text"
                className="form-input"
                placeholder="jnplotus@gmail.com or admin"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={loginLoading}
              style={{ width: "100%", justifyContent: "center", marginTop: "12px" }}
            >
              {loginLoading ? "Authenticating..." : "Access Admin Studio"}
            </button>
          </form>
        ) : (
          /* Admin Dashboard */
          <div>
            {/* Quick Analytics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Total Vault Notes</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>
                  {stats?.totalNotes ?? notes.length}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Storage Saved</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>
                  {stats?.formattedSaved || "0.00 MB"}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>0s Duplicates Prevented</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "4px" }}>
                  {stats?.totalDuplicates || 0}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Server RAM Usage</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fbbf24", marginTop: "4px" }}>
                  {health?.memoryUsageMB ? `${health.memoryUsageMB} MB` : "Active"}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                className={`filter-tab ${activeTab === "vault" ? "active" : ""}`}
                onClick={() => setActiveTab("vault")}
              >
                Manage Vault Notes ({notes.length})
              </button>
              <button
                className={`filter-tab ${activeTab === "health" ? "active" : ""}`}
                onClick={() => setActiveTab("health")}
              >
                System & Cloudflare Diagnostics
              </button>
            </div>

            {activeTab === "vault" ? (
              <div
                style={{
                  maxHeight: "360px",
                  overflowY: "auto",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255, 255, 255, 0.02)", textAlign: "left", color: "var(--text-dim)" }}>
                      <th style={{ padding: "10px 14px" }}>Title</th>
                      <th style={{ padding: "10px 14px" }}>Branch</th>
                      <th style={{ padding: "10px 14px" }}>Size</th>
                      <th style={{ padding: "10px 14px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n) => (
                      <tr
                        key={n.id}
                        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
                      >
                        <td style={{ padding: "10px 14px", color: "#fff", fontWeight: 600 }}>
                          {n.title}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                          {n.branch} ({n.semester})
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>
                          {n.compressedSize
                            ? (n.compressedSize / (1024 * 1024)).toFixed(1) + " MB"
                            : "PDF"}
                        </td>
                        <td style={{ padding: "10px 14px", display: "flex", gap: "8px" }}>
                          <button
                            className="btn-icon"
                            style={{ width: "32px", height: "32px" }}
                            onClick={() => handleToggleVisibility(n.id, n.isVisible)}
                            title={n.isVisible ? "Hide from Students" : "Publish Note"}
                          >
                            {n.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>

                          <button
                            className="btn-icon"
                            style={{ width: "32px", height: "32px", color: "#f43f5e" }}
                            onClick={() => handleDelete(n.id)}
                            title="Delete Permanently"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Health Tab */
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  padding: "18px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.82rem",
                  color: "#cbd5e1",
                }}
              >
                <div><strong>Service:</strong> freestudymaterial.onrender.com</div>
                <div><strong>Status:</strong> {health?.status || "online"}</div>
                <div><strong>RAM Cache Hit Ratio:</strong> {health?.cacheStats?.hitRatio || "0%"}</div>
                <div><strong>Uptime:</strong> {health?.uptime || "0s"}</div>
                <div style={{ marginTop: "12px", color: "#34d399" }}>
                  <strong>Active Engine Features:</strong>
                  <ul style={{ paddingLeft: "20px", marginTop: "6px" }}>
                    {(health?.features || []).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
