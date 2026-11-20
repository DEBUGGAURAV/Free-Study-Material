import { useState, useEffect } from "react";
import { Trash2, Clock, Save, RefreshCw, Download, ShieldAlert, Database, Zap, Server, ShieldCheck, Activity, HardDrive, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../../api";
import "../../../utils/formatUtils";
import "../../../utils/hardwareAdaptiveEngine";
import "../../VirtualPdfReader";

export default function TabDatabase(props) {
  const {
    botTesting,
    chatBotLoading,
    chatBotSettings,
    collectionItems,
    collectionLoading,
    dbOverview,
    dbRetentionDays,
    formatSyncTime,
    handleBulkPurgeCollection,
    handleDeleteCollectionDoc,
    handlePruneRetentionMessages,
    handleRunInactivityPurge,
    handleTelegramSync,
    handleTursoPruneAudits,
    handleUpdateGlobalInactivityDays,
    handleUpdateRetention,
    isHalfAdmin,
    lastSyncInfo,
    loadCollectionItems,
    notes,
    retentionDays,
    selectedCollection,
    setActiveTab,
    setChatBotSettings,
    setRetentionDays,
    setSelectedCollection,
    setTursoPruneDays,
    setVaultRetentionDays,
    stats,
    syncingTelegram,
    tursoPruneDays,
    tursoPruning,
    vaultRetentionDays,
  } = props;

  const [mongoFlushing, setMongoFlushing] = useState(false);
  const [mongoFlushMsg, setMongoFlushMsg] = useState(null);
  const [chatTelemetry, setChatTelemetry] = useState(null);

  useEffect(() => {
    let isMounted = true;
    api.getChatBotTelemetry().then((res) => {
      if (isMounted && res?.success) {
        setChatTelemetry(res);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleFlushMongoBuffer = async () => {
    setMongoFlushing(true);
    setMongoFlushMsg(null);
    try {
      const res = await api.flushMongoChatBuffer();
      if (res?.success) {
        setMongoFlushMsg({
          type: "success",
          text: `⚡ Flushed ${res.flushedCount || 0} messages from MongoDB Chat Cluster into Turso LibSQL Chat Vault.`,
        });
        const fresh = await api.getChatBotTelemetry().catch(() => null);
        if (fresh?.success) setChatTelemetry(fresh);
      } else {
        setMongoFlushMsg({
          type: "error",
          text: res?.message || "Failed to flush MongoDB buffer",
        });
      }
    } catch (err) {
      setMongoFlushMsg({ type: "error", text: err.message || "Flush failed" });
    } finally {
      setMongoFlushing(false);
    }
  };

  

  return (
            isHalfAdmin ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 24px",
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: "16px",
                  margin: "10px 0 20px",
                }}
              >
                <div
                  style={{
                    width: "68px",
                    height: "68px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 18px",
                    color: "#f87171",
                  }}
                >
                  <ShieldAlert size={36} />
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f87171", margin: "0 0 10px" }}>
                  Database Studio Access Restricted
                </h3>
                <p
                  style={{
                    maxWidth: "560px",
                    margin: "0 auto 18px",
                    fontSize: "0.88rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  Your account is configured as a <strong>Half Admin (Sub-Administrator)</strong>. For system security and raw record protection, direct access to Google Cloud Firestore raw collections, dynamic document explorer, DB JSON backup export, and batch purge controls are exclusively reserved for the <strong>Full Administrator (Master Admin)</strong>.
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    gap: "8px",
                    textAlign: "left",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "16px 22px",
                    borderRadius: "12px",
                    fontSize: "0.82rem",
                    color: "var(--text-dim)",
                    maxWidth: "520px",
                  }}
                >
                  <div style={{ color: "#34d399", fontWeight: 700 }}>✅ Half Admin Allowed Capabilities:</div>
                  <div>• 📚 Notes Vault: Edit study notes, toggle visibility &amp; soft-delete to Restore Vault.</div>
                  <div>• 👥 Student Registry: View registered students, edit profiles &amp; toggle block/unblock.</div>
                  <div>• 🖥️ Telemetry &amp; CDN: Monitor server health, RAM usage &amp; edge cached speeds.</div>
                  <div style={{ marginTop: "6px", color: "#f87171", fontWeight: 700 }}>🔒 Database Restrictions:</div>
                  <div>• Direct database studio, raw collection drops, JSON export, and student bulk-wipe are disabled.</div>
                </div>
              </div>
            ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                    Google Cloud Firestore Dynamic Studio
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "2px 0 0" }}>
                    Live collection inspector, document explorer, batch purge, and full backup export.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    href={api.getDatabaseExportUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <Download size={14} />
                    <span>Export DB JSON</span>
                  </a>

                  <button
                    onClick={handleTelegramSync}
                    className="btn-primary"
                    disabled={syncingTelegram}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <RefreshCw size={14} className={syncingTelegram ? "spinner" : ""} />
                    <span>Sync Channel</span>
                  </button>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.75rem",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      color: "var(--text-dim)",
                    }}
                    title="Real-Time Event-Driven Sync Status"
                  >
                    <Clock size={13} style={{ color: "var(--accent-cyan)" }} />
                    <span>Last Synced:</span>
                    <strong style={{ color: "#fff" }}>
                      {formatSyncTime(lastSyncInfo || stats?.lastSync)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* DATABASE RETENTION & INACTIVITY AUTO-DELETE MANAGER */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.55)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: "var(--radius-lg)",
                  padding: "16px 18px",
                  marginBottom: "20px",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "#fff", fontSize: "0.95rem" }}>
                        Database Lifecycle, Inactivity &amp; Auto-Delete Policy Hub
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                        Configure days before inactive accounts, recycle records, pod audits, and cache entries are auto-purged
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      padding: "3px 9px",
                      borderRadius: "6px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    ● AUTO-PURGE ENFORCEMENT ACTIVE
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
                  {/* Card 1: Student Account Inactivity */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fbbf24" }}>👥 Student Inactivity Purge</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <input
                          type="number"
                          min="1"
                          max="3650"
                          value={dbRetentionDays}
                          onChange={(e) => setDbRetentionDays(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdateGlobalInactivityDays(dbRetentionDays);
                            }
                          }}
                          placeholder="Days"
                          style={{
                            width: "55px",
                            padding: "4px 6px",
                            borderRadius: "6px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1.5px solid rgba(255, 255, 255, 0.2)",
                            color: "#fff",
                            fontSize: "0.82rem",
                            textAlign: "center",
                            fontWeight: 750,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>days</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateGlobalInactivityDays(dbRetentionDays)}
                          style={{
                            padding: "4px 9px",
                            fontSize: "0.72rem",
                            borderRadius: "6px",
                            background: "linear-gradient(135deg, #2563eb, #06b6d4)",
                            color: "#fff",
                            border: "none",
                            fontWeight: 750,
                            cursor: "pointer",
                          }}
                          title="Save & Enforce this exact limit"
                        >
                          💾 Save
                        </button>
                      </div>
                    </div>

                    {/* Quick Adjustment Controls for All Users */}
                    <div style={{ display: "flex", gap: "4px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(30)}
                        title="Set limit to 30 Days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: Number(dbRetentionDays) === 30 ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.06)", border: `1px solid ${Number(dbRetentionDays) === 30 ? "#10b981" : "rgba(255, 255, 255, 0.12)"}`, color: Number(dbRetentionDays) === 30 ? "#34d399" : "var(--text-dim)", cursor: "pointer", fontWeight: 700 }}
                      >
                        30d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(60)}
                        title="Set limit to 60 Days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: Number(dbRetentionDays) === 60 ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.06)", border: `1px solid ${Number(dbRetentionDays) === 60 ? "#10b981" : "rgba(255, 255, 255, 0.12)"}`, color: Number(dbRetentionDays) === 60 ? "#34d399" : "var(--text-dim)", cursor: "pointer", fontWeight: 700 }}
                      >
                        60d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(90)}
                        title="Reset global threshold to Default 90 Days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: Number(dbRetentionDays) === 90 ? "rgba(245, 158, 11, 0.3)" : "rgba(255, 255, 255, 0.06)", border: `1px solid ${Number(dbRetentionDays) === 90 ? "#f59e0b" : "rgba(255, 255, 255, 0.12)"}`, color: Number(dbRetentionDays) === 90 ? "#fbbf24" : "var(--text-dim)", cursor: "pointer", fontWeight: 700 }}
                      >
                        90d (Default)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(180)}
                        title="Set global threshold to 180 Days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: Number(dbRetentionDays) === 180 ? "rgba(56, 189, 248, 0.3)" : "rgba(255, 255, 255, 0.06)", border: `1px solid ${Number(dbRetentionDays) === 180 ? "#38bdf8" : "rgba(255, 255, 255, 0.12)"}`, color: Number(dbRetentionDays) === 180 ? "#38bdf8" : "var(--text-dim)", cursor: "pointer", fontWeight: 700 }}
                      >
                        180d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(365)}
                        title="Set global threshold to 365 Days (1 Year)"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: Number(dbRetentionDays) === 365 ? "rgba(168, 85, 247, 0.3)" : "rgba(255, 255, 255, 0.06)", border: `1px solid ${Number(dbRetentionDays) === 365 ? "#a855f7" : "rgba(255, 255, 255, 0.12)"}`, color: Number(dbRetentionDays) === 365 ? "#c084fc" : "var(--text-dim)", cursor: "pointer", fontWeight: 700 }}
                      >
                        365d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(Math.max(1, (parseInt(dbRetentionDays, 10) || 90) - 15))}
                        title="Reduce global inactivity limit by 15 days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}
                      >
                        -15d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateGlobalInactivityDays(Math.min(3650, (parseInt(dbRetentionDays, 10) || 90) + 15))}
                        title="Extend global inactivity limit by 15 days"
                        style={{ padding: "3px 7px", fontSize: "0.68rem", borderRadius: "5px", background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.3)", color: "#86efac", cursor: "pointer", fontWeight: 700 }}
                      >
                        +15d
                      </button>
                    </div>

                    <div style={{ fontSize: "0.71rem", color: "var(--text-dim)", marginBottom: "4px", lineHeight: "1.3" }}>
                      Accounts with 0 logins for <b>{dbRetentionDays} consecutive days</b> are archived with dossier sent to Telegram Topic 8.
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#34d399", marginBottom: "8px", lineHeight: "1.2", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>🛡️</span>
                      <span><b>Daily Login Shield:</b> Daily active students are NEVER purged (Inactivity = 0 days).</span>
                    </div>

                    <button
                      onClick={handleRunInactivityPurge}
                      disabled={botTesting}
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderColor: "rgba(245, 158, 11, 0.35)",
                        color: "#fbbf24",
                      }}
                    >
                      <span>{botTesting ? "Checking..." : `⚡ Run ${dbRetentionDays}-Day Purge Check`}</span>
                    </button>
                  </div>

                  {/* Card 2: Restore Vault Retention */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#818cf8" }}>♻️ Restore Vault Retention</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={vaultRetentionDays}
                          onChange={(e) => setVaultRetentionDays(Number(e.target.value) || 30)}
                          style={{
                            width: "55px",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>days</span>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "var(--text-dim)", marginBottom: "8px", lineHeight: "1.3" }}>
                      Soft-deleted notes &amp; records held safely in Tab 8. Permanently wiped after {vaultRetentionDays} days.
                    </div>
                    <button
                      onClick={() => setActiveTab("recycle_bin")}
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderColor: "rgba(99, 102, 241, 0.35)",
                        color: "#a5b4fc",
                      }}
                    >
                      <span>📂 Open Restore Vault ({
                        typeof dbOverview?.collections?.deleted_records === "number"
                          ? dbOverview.collections.deleted_records
                          : (dbOverview?.collections?.deleted_records?.count ?? 0)
                      })</span>
                    </button>
                  </div>

                  {/* Card 4: Turso Chat Messages Retention */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(6, 182, 212, 0.25)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8" }}>💬 Chat Retention (Turso)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={chatBotSettings.chatRetentionDays || 7}
                          onChange={(e) => setChatBotSettings((prev) => ({ ...prev, chatRetentionDays: Number(e.target.value) || 7 }))}
                          style={{
                            width: "55px",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(6, 182, 212, 0.35)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>days</span>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "var(--text-dim)", marginBottom: "8px", lineHeight: "1.3" }}>
                      Public &amp; private chat messages in Turso LibSQL table wiped after {chatBotSettings.chatRetentionDays || 7} days.
                    </div>
                    <button
                      onClick={handlePruneRetentionMessages}
                      disabled={chatBotLoading}
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderColor: "rgba(6, 182, 212, 0.35)",
                        color: "#38bdf8",
                      }}
                    >
                      <span>{chatBotLoading ? "Pruning..." : `🧹 Prune Turso Msgs (${chatBotSettings.chatRetentionDays || 7}d)`}</span>
                    </button>
                  </div>

                  {/* Card 3: Turso Pod Audits Retention */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f87171" }}>⚡ Pod Audits (Turso)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={tursoPruneDays}
                          onChange={(e) => setTursoPruneDays(Number(e.target.value) || 30)}
                          style={{
                            width: "55px",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>days</span>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "var(--text-dim)", marginBottom: "8px", lineHeight: "1.3" }}>
                      Private room closed transcripts deleted once exceeding {tursoPruneDays} days retention.
                    </div>
                    <button
                      onClick={() => handleTursoPruneAudits(tursoPruneDays)}
                      disabled={tursoPruning}
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderColor: "rgba(239, 68, 68, 0.35)",
                        color: "#f87171",
                      }}
                    >
                      <Trash2 size={12} />
                      <span>{tursoPruning ? "Pruning..." : `Prune Audits (>${tursoPruneDays}d)`}</span>
                    </button>
                  </div>

                  {/* Card 4: Edge CDN & RAM Retention */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-cyan)" }}>🌐 CDN Edge Cache</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={retentionDays}
                          onChange={(e) => setRetentionDays(Number(e.target.value) || 7)}
                          style={{
                            width: "55px",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>days</span>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.71rem", color: "var(--text-dim)", marginBottom: "8px", lineHeight: "1.3" }}>
                      Fast RAM memory &amp; edge disk files purged after {retentionDays} days of inactivity.
                    </div>
                    <button
                      onClick={() => handleUpdateRetention(retentionDays)}
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        padding: "5px 10px",
                        fontSize: "0.74rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderColor: "rgba(6, 182, 212, 0.35)",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      <Save size={12} />
                      <span>Save CDN Retention</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 🍃 DUAL MONGODB ATLAS DATABASE CLUSTERS ARCHITECTURE */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)",
                  border: "1.5px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px",
                  marginBottom: "20px",
                  boxShadow: "0 6px 24px rgba(0, 0, 0, 0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Database size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.02rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>Dual MongoDB Atlas Clusters (Architecture &amp; Status)</span>
                        <span style={{ fontSize: "0.68rem", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.4)", fontWeight: 800, padding: "2px 8px", borderRadius: "999px" }}>
                          2 CLUSTERS ACTIVE
                        </span>
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                        Isolated Workloads: Primary Academic Core Cluster (fsm_db) &amp; Dedicated High-Velocity Chat Cluster (fsmchat)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        padding: "3px 10px",
                        borderRadius: "999px",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      ● 100% DATABASE WORKLOAD ISOLATION
                    </span>
                  </div>
                </div>

                {mongoFlushMsg && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      marginBottom: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: mongoFlushMsg.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                      border: mongoFlushMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
                      color: mongoFlushMsg.type === "success" ? "#34d399" : "#f87171",
                    }}
                  >
                    <span>{mongoFlushMsg.text}</span>
                    <button
                      onClick={() => setMongoFlushMsg(null)}
                      style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px" }}
                    >
                      ×
                    </button>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
                  {/* Cluster 1: Primary Academic Core Cluster */}
                  <div
                    style={{
                      background: "rgba(11, 19, 43, 0.65)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      borderRadius: "10px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <HardDrive size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: "#fff", fontSize: "0.9rem" }}>
                              Cluster 1: Primary Academic Core (fsm_db)
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                              Academic Notes, Students, Notices &amp; Recycle Vault
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: "rgba(16, 185, 129, 0.2)",
                            color: "#34d399",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                          }}
                        >
                          ● CONNECTED
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "0.78rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Database Name:</span>
                          <span style={{ color: "#34d399", fontWeight: 700 }}>fsm_db (Primary Storage)</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Active Collections:</span>
                          <span style={{ color: "#fff", fontWeight: 600 }}>notes, users, notices, deleted_records</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Storage Engine:</span>
                          <span style={{ color: "#a78bfa", fontWeight: 600 }}>MongoDB WiredTiger NVMe SSD</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-dim)" }}>Chat Decoupling:</span>
                          <span style={{ color: "#34d399", fontWeight: 700 }}>100% Zero Chat Load (Offloaded to Cluster 2)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cluster 2: Dedicated Chat Ingestion Cluster */}
                  <div
                    style={{
                      background: "rgba(11, 19, 43, 0.65)",
                      border: "1.5px solid rgba(56, 189, 248, 0.35)",
                      borderRadius: "10px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Zap size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: "#fff", fontSize: "0.9rem" }}>
                              Cluster 2: Dedicated Chat Ingestion (fsmchat)
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                              High-Velocity Chat Hot Buffer &amp; Media Ingestion Stream
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: "rgba(56, 189, 248, 0.2)",
                            color: "#38bdf8",
                            border: "1px solid rgba(56, 189, 248, 0.4)",
                          }}
                        >
                          ● ISOLATED CLUSTER
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "0.78rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Cluster Host:</span>
                          <code style={{ fontSize: "0.72rem", color: "#38bdf8", background: "rgba(0,0,0,0.3)", padding: "1px 5px", borderRadius: "4px" }}>
                            fsmchat.kilhriu.mongodb.net
                          </code>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Database / Ingest Collection:</span>
                          <span style={{ color: "#a78bfa", fontWeight: 600 }}>fsm_chat / chat_hot_buffer</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Active Hot Buffer Count:</span>
                          <span style={{ color: "#34d399", fontWeight: 800 }}>
                            {(dbOverview?.mongoChatCluster?.hotBufferCount ?? chatTelemetry?.mongoStatus?.hotBufferCount ?? 0)} Messages Buffered
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                          <span style={{ color: "var(--text-dim)" }}>Connection Pool:</span>
                          <span style={{ color: "#34d399", fontWeight: 700 }}>maxPoolSize: 20 (Strict Connection Pooling)</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--text-dim)" }}>Auto-Flush Migration:</span>
                          <span style={{ color: "#fbbf24", fontWeight: 700 }}>Auto-migrates to Turso Chat Vault at 30,000 items</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Manual Sync:</span>
                      <button
                        type="button"
                        onClick={handleFlushMongoBuffer}
                        disabled={mongoFlushing}
                        className="btn-primary"
                        style={{
                          fontSize: "0.74rem",
                          padding: "5px 12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                          border: "none",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: mongoFlushing ? "not-allowed" : "pointer",
                        }}
                        title="Flush all hot buffer messages from MongoDB into Turso LibSQL Chat Vault"
                      >
                        <Zap size={12} className={mongoFlushing ? "spin" : ""} />
                        <span>{mongoFlushing ? "Flushing..." : "Flush Buffer to Turso Chat Vault"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collections Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                {["notes", "users", "notices", "deleted_notes", "deleted_records"].map((col) => {
                  const rawCol = dbOverview?.collections?.[col];
                  const count = typeof rawCol === "number"
                    ? rawCol
                    : (rawCol?.count ?? rawCol?.size ?? (col === "notes" ? notes.length : 0));
                  const isSelected = selectedCollection === col;

                  return (
                    <div
                      key={col}
                      onClick={() => {
                        setSelectedCollection(col);
                        loadCollectionItems(col);
                      }}
                      style={{
                        background: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(15, 23, 42, 0.4)",
                        border: `1px solid ${isSelected ? "var(--accent-indigo)" : "var(--border-subtle)"}`,
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontSize: "0.72rem", color: isSelected ? "var(--accent-indigo)" : "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                        {col}
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", marginTop: "2px" }}>
                        {count} docs
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Collection Explorer */}
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff" }}>
                    Documents in collection: <span style={{ color: "var(--accent-cyan)" }}>{selectedCollection}</span> ({collectionItems.length})
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleBulkPurgeCollection(selectedCollection)}
                      className="btn-danger"
                      style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                    >
                      Move Collection to Restore Vault
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: "360px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                        <th style={{ padding: "10px 16px" }}>DOCUMENT ID</th>
                        <th style={{ padding: "10px 16px" }}>DATA SUMMARY</th>
                        <th style={{ padding: "10px 16px", textAlign: "right" }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectionLoading ? (
                        <tr>
                          <td colSpan={3} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                            <div className="spinner" style={{ width: "24px", height: "24px", margin: "0 auto 8px" }} />
                            Loading collection documents...
                          </td>
                        </tr>
                      ) : collectionItems.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                            No documents in "{selectedCollection}" collection.
                          </td>
                        </tr>
                      ) : (
                        collectionItems.map((doc) => (
                          <tr key={doc.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                            <td style={{ padding: "10px 16px", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.id}
                            </td>
                            <td style={{ padding: "10px 16px", color: "#334155", maxWidth: "450px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.title || doc.name || doc.email || JSON.stringify(doc)}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <button
                                onClick={() => handleDeleteCollectionDoc(doc.id)}
                                className="btn-danger"
                                style={{ padding: "4px 10px", fontSize: "0.72rem" }}
                              >
                                Delete to Vault
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            )
  );
}
