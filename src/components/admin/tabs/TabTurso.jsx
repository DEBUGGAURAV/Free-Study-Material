import React, { useState, useEffect, useRef } from "react";
import {
  X, Mail, Shield, Trash2, Eye, EyeOff, Edit3, UserCheck, UserX, Activity,
  Search, CheckCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Save, RefreshCw,
  Database, Cpu, Server, HardDrive, Globe, Code, Cloud, Send, Download,
  Upload, Zap, Inbox, Key, Monitor, ShieldCheck, ShieldAlert, Filter, Bot,
  Bell, BellOff, Power, AlertTriangle, Flame, Check, Share2, Wifi, Sparkles,
  FileText, Sliders, Layers, Scissors, RotateCcw, Megaphone, Plus, Lock,
  MessageSquare, Crown, Paperclip, Volume2, Radio, Bug, Smartphone
} from "lucide-react";
import { api, getAuthToken } from "../../../api";
import { formatFileSize, formatMB } from "../../../utils/formatUtils";
import { detectClientHardwareProfile } from "../../../utils/hardwareAdaptiveEngine";
import VirtualPdfReader from "../../VirtualPdfReader";

export default function TabTurso(props) {
  const {
    chatMessages,
    handleDeleteSingleAudit,
    handleTursoPruneAudits,
    handleTursoPruneCache,
    handleTursoPruneMessages,
    handleTursoRefreshCache,
    handleTursoSync,
    loadTursoAudits,
    loadTursoData,
    notes,
    setTursoActionMsg,
    setTursoAuditSearch,
    setTursoCachePruneDays,
    setTursoCacheTarget,
    setTursoPruneDays,
    softwareInfo,
    tursoActionMsg,
    tursoAuditSearch,
    tursoAudits,
    tursoAuditsLoading,
    tursoCachePruneDays,
    tursoCachePruning,
    tursoCacheTarget,
    tursoLoading,
    tursoPruneDays,
    tursoPruning,
    tursoRefreshing,
    tursoStatus,
    tursoSyncing,
  } = props;

  // 🤖 Dedicated AI Search Logs Retention & Pruning State (100% Isolated)
  const [aiRetentionDays, setAiRetentionDays] = useState("30");
  const [isAiPruning, setIsAiPruning] = useState(false);
  const [aiPruneMsg, setAiPruneMsg] = useState(null);
  const [aiSearchLogs, setAiSearchLogs] = useState([]);
  const [aiLogsLoading, setAiLogsLoading] = useState(false);
  const [aiSearchFilter, setAiSearchFilter] = useState("");
  const [showAiLogsTable, setShowAiLogsTable] = useState(false);

  // 🎫 Dedicated Support Desk Tickets Retention & Auto-Purge State (help_tickets)
  const [helpRetentionDays, setHelpRetentionDays] = useState("5");
  const [helpStats, setHelpStats] = useState({
    retentionDays: 5,
    totalTickets: 0,
    activeTickets: 0,
    closedTickets: 0,
    expiredTickets: 0,
  });
  const [isHelpUpdating, setIsHelpUpdating] = useState(false);
  const [helpActionMsg, setHelpActionMsg] = useState(null);

  // ⚡ Dedicated Chat Messages Retention & MongoDB Hot Buffer Studio State
  const [chatRetentionDays, setChatRetentionDays] = useState("7");
  const [chatBotSettings, setChatBotSettings] = useState(null);
  const [chatTelemetry, setChatTelemetry] = useState(null);
  const [isChatUpdating, setIsChatUpdating] = useState(false);
  const [chatActionMsg, setChatActionMsg] = useState(null);
  const [showAuditsTable, setShowAuditsTable] = useState(true);

  const loadChatRetentionData = async () => {
    try {
      const [settingsRes, telemetryRes] = await Promise.allSettled([
        api.getChatBotSettings(),
        api.getChatBotTelemetry(),
      ]);
      if (settingsRes.status === "fulfilled" && settingsRes.value?.success) {
        setChatBotSettings(settingsRes.value.settings);
        if (settingsRes.value.settings?.chatRetentionDays) {
          setChatRetentionDays(String(settingsRes.value.settings.chatRetentionDays));
        }
      }
      if (telemetryRes.status === "fulfilled" && telemetryRes.value?.success) {
        setChatTelemetry(telemetryRes.value);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadChatRetentionData();
  }, []);

  const handleSaveChatRetentionPolicy = async (daysOverride) => {
    const targetDays = daysOverride !== undefined ? daysOverride : (chatRetentionDays === "never" ? 365 : parseInt(chatRetentionDays, 10));
    setIsChatUpdating(true);
    setChatActionMsg(null);
    try {
      const res = await api.updateChatBotSettings({ chatRetentionDays: targetDays });
      if (res?.success) {
        setChatRetentionDays(String(targetDays));
        setChatActionMsg({
          type: "success",
          text: `✅ Chat retention policy updated to ${targetDays} day(s). Messages older than ${targetDays}d will auto-expire from Turso & memory.`,
        });
        await loadChatRetentionData();
      }
    } catch (err) {
      setChatActionMsg({ type: "error", text: err.message || "Failed to update chat retention policy" });
    } finally {
      setIsChatUpdating(false);
    }
  };

  const handleSingleClickPruneChat = async (days) => {
    const isWipeAll = days === 0;
    const confirmPrompt = isWipeAll
      ? "⚠️ DANGER: Wipe ENTIRE active chat buffer immediately (0 Days / All messages will be purged from Turso and memory)?"
      : `Purge all chat messages older than ${days} day(s) immediately from Turso and memory?`;
    if (!window.confirm(confirmPrompt)) return;

    setIsChatUpdating(true);
    setChatActionMsg(null);
    try {
      const res = await api.pruneOldChatMessages(days);
      if (res?.success) {
        setChatActionMsg({
          type: "success",
          text: isWipeAll
            ? `🧹 Instant Wipe Complete: All ${res.totalPruned || res.deletedCount || 0} chat messages cleared from Turso & active buffer.`
            : `🧹 Prune Complete: ${res.totalPruned || res.deletedCount || 0} message(s) older than ${days}d permanently purged.`,
        });
        await loadChatRetentionData();
      }
    } catch (err) {
      setChatActionMsg({ type: "error", text: err.message || "Failed to prune chat messages" });
    } finally {
      setIsChatUpdating(false);
    }
  };

  const handleFlushMongoBuffer = async () => {
    setIsChatUpdating(true);
    setChatActionMsg(null);
    try {
      const res = await api.flushMongoChatBuffer();
      if (res?.success) {
        setChatActionMsg({
          type: "success",
          text: `⚡ MongoDB Hot Buffer Synchronized: ${res.flushedCount || 0} messages synced to Turso LibSQL warm tier.`,
        });
        await loadChatRetentionData();
      }
    } catch (err) {
      setChatActionMsg({ type: "error", text: err.message || "Failed to flush MongoDB buffer" });
    } finally {
      setIsChatUpdating(false);
    }
  };

  const handleTestChatBotPing = async () => {
    setIsChatUpdating(true);
    setChatActionMsg(null);
    try {
      const res = await api.testChatBotAlert();
      if (res?.success) {
        setChatActionMsg({
          type: "success",
          text: "🚀 Diagnostic ping dispatched to @fsm_chat_bot Telegram topic & Admin DM!",
        });
      }
    } catch (err) {
      setChatActionMsg({ type: "error", text: err.message || "Failed to send Telegram test ping" });
    } finally {
      setIsChatUpdating(false);
    }
  };

  const loadHelpRetention = async () => {
    try {
      const res = await api.getHelpRetentionConfig();
      if (res?.success) {
        setHelpStats(res);
        setHelpRetentionDays(res.retentionDays < 0 ? "never" : String(res.retentionDays));
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadHelpRetention();
  }, []);

  const handleUpdateHelpRetention = async (daysOverride) => {
    let targetDays;
    if (daysOverride !== undefined) {
      targetDays = daysOverride;
    } else if (helpRetentionDays === "never") {
      targetDays = -1;
    } else {
      targetDays = parseInt(helpRetentionDays, 10);
    }

    setIsHelpUpdating(true);
    setHelpActionMsg(null);
    try {
      const res = await api.updateHelpRetentionConfig(targetDays);
      if (res?.success) {
        if (res.stats) setHelpStats(res.stats);
        setHelpRetentionDays(targetDays < 0 ? "never" : String(targetDays));
        setHelpActionMsg({
          type: "success",
          text: targetDays < 0
            ? "♾️ Support Desk Retention set to NEVER (Tickets kept indefinitely)."
            : `⏳ Support Desk Retention updated to ${targetDays} day(s). Closed tickets auto-purge after ${targetDays}d.`,
        });
      }
    } catch (err) {
      setHelpActionMsg({ type: "error", text: err.message || "Failed to update retention policy" });
    } finally {
      setIsHelpUpdating(false);
    }
  };

  const handlePurgeExpiredHelpTickets = async () => {
    if (!window.confirm("Purge all expired closed support tickets whose retention period has ended?")) return;
    setIsHelpUpdating(true);
    setHelpActionMsg(null);
    try {
      const res = await api.adminPurgeExpiredTickets();
      if (res?.success) {
        if (res.stats) setHelpStats(res.stats);
        setHelpActionMsg({
          type: "success",
          text: `🧹 Purge complete: ${res.purgedCount || 0} expired ticket(s) permanently removed.`,
        });
      }
    } catch (err) {
      setHelpActionMsg({ type: "error", text: err.message || "Failed to purge expired tickets" });
    } finally {
      setIsHelpUpdating(false);
    }
  };

  const loadAiLogs = async () => {
    setAiLogsLoading(true);
    try {
      const res = await api.getAiRecentSearches({ limit: 15, search: aiSearchFilter });
      if (res?.success && Array.isArray(res?.logs)) {
        setAiSearchLogs(res.logs);
      }
    } catch (_) {
    } finally {
      setAiLogsLoading(false);
    }
  };

  const handlePruneAiLogs = async (daysOverride) => {
    let targetDays;
    if (daysOverride !== undefined) {
      targetDays = daysOverride;
    } else if (aiRetentionDays === "never") {
      targetDays = -1;
    } else {
      targetDays = parseInt(aiRetentionDays, 10);
    }

    if (targetDays === 0) {
      if (!window.confirm("⚠️ DANGER: Permanently wipe ALL AI search logs from Turso? This cannot be undone and will delete all student query history.")) {
        return;
      }
    } else if (targetDays === -1 || targetDays === "never") {
      // Set to never
    } else {
      if (!window.confirm(`Prune Turso AI search logs older than ${targetDays} days?`)) {
        return;
      }
    }

    setIsAiPruning(true);
    setAiPruneMsg(null);
    try {
      const res = await api.pruneTursoAiSearchLogs(targetDays);
      if (res?.success) {
        setAiPruneMsg({
          type: "success",
          text: res.message || `AI Search Logs updated successfully (Deleted: ${res.deletedCount || 0} rows).`,
        });
        if (targetDays === -1 || targetDays === "never") {
          setAiRetentionDays("never");
        } else if (targetDays === 0) {
          setAiRetentionDays("0");
        }
        if (typeof loadTursoData === "function") loadTursoData();
        if (showAiLogsTable) loadAiLogs();
      } else {
        setAiPruneMsg({ type: "error", text: res?.error || res?.message || "Failed to prune AI search logs." });
      }
    } catch (err) {
      setAiPruneMsg({ type: "error", text: "Error: " + err.message });
    } finally {
      setIsAiPruning(false);
    }
  };

  return (
            <div>
              {/* Header / Control Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "18px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 800,
                        color: "#fff",
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Zap size={20} color="#38bdf8" />
                      <span>Turso LibSQL Database &amp; Edge Cache</span>
                    </h3>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontWeight: 700,
                        border: tursoStatus?.connected
                          ? "1px solid rgba(16, 185, 129, 0.4)"
                          : "1px solid rgba(239, 68, 68, 0.4)",
                        background: tursoStatus?.connected
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(239, 68, 68, 0.15)",
                        color: tursoStatus?.connected ? "#34d399" : "#f87171",
                      }}
                    >
                      {tursoStatus?.connected ? (tursoStatus?.isCloud ? "🟢 Cloud LibSQL" : "🟡 Local Standby Vault") : "🔴 Disconnected"}
                    </span>
                    {tursoStatus?.latencyMs !== undefined && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontWeight: 600,
                          background: "rgba(56, 189, 248, 0.12)",
                          color: "#38bdf8",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                        }}
                      >
                        ⚡ {tursoStatus.latencyMs}ms Latency
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                    High-performance distributed SQLite at the edge. Automatic dual-mode cloud replication and local fallback vault.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={loadTursoData}
                    disabled={tursoLoading}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    title="Refresh Turso database stats"
                  >
                    <RefreshCw size={13} className={tursoLoading ? "spin" : ""} />
                    <span>{tursoLoading ? "Checking..." : "Refresh Status"}</span>
                  </button>

                  <button
                    onClick={handleTursoSync}
                    disabled={tursoSyncing}
                    className="btn-primary"
                    style={{
                      fontSize: "0.78rem",
                      padding: "7px 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
                      border: "none",
                      color: "#fff",
                      fontWeight: 700,
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                    title="Replicate all notes and users from Firestore into Turso"
                  >
                    <Database size={13} className={tursoSyncing ? "spin" : ""} />
                    <span>{tursoSyncing ? "Syncing..." : "Sync All From Firestore"}</span>
                  </button>

                  <button
                    onClick={handleTursoRefreshCache}
                    disabled={tursoRefreshing}
                    className="btn-secondary"
                    style={{
                      fontSize: "0.78rem",
                      padding: "7px 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      borderColor: "rgba(56, 189, 248, 0.35)",
                      color: "#38bdf8",
                    }}
                    title="Flush and reload Edge Notes Cache"
                  >
                    <Zap size={13} className={tursoRefreshing ? "spin" : ""} />
                    <span>{tursoRefreshing ? "Reloading..." : "Flush Edge Cache"}</span>
                  </button>

                  <button
                    onClick={() => handleTursoPruneCache(tursoCachePruneDays, tursoCacheTarget)}
                    disabled={tursoCachePruning}
                    className="btn-danger"
                    style={{
                      fontSize: "0.78rem",
                      padding: "7px 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(239, 68, 68, 0.18)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#fca5a5",
                      cursor: "pointer",
                      borderRadius: "6px",
                      fontWeight: 700,
                    }}
                    title={`Delete Turso cache older than ${tursoCachePruneDays} days`}
                  >
                    <Trash2 size={13} className={tursoCachePruning ? "spin" : ""} />
                    <span>{tursoCachePruning ? "Deleting..." : `Delete Turso Cache (>${tursoCachePruneDays}d)`}</span>
                  </button>
                </div>
              </div>

              {/* Action Notification Banner */}
              {tursoActionMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "0.82rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: tursoActionMsg.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    border: tursoActionMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                    color: tursoActionMsg.type === "success" ? "#34d399" : "#f87171",
                  }}
                >
                  <span>{tursoActionMsg.text}</span>
                  <button
                    onClick={() => setTursoActionMsg(null)}
                    style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "2px 4px" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Relational Tables KPI Metrics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  marginBottom: "20px",
                }}
              >
                {/* Users Count */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Users Table
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.users ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <UserCheck size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#38bdf8", marginTop: "6px" }}>
                    Active &amp; Verified Student Profiles
                  </div>
                </div>

                {/* Notes Vault Count */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Notes Vault
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#34d399", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.notes ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Database size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#34d399", marginTop: "6px" }}>
                    Indexed Academic Documents
                  </div>
                </div>

                {/* Chat Messages Count */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(168, 85, 247, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Chat Messages
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#c084fc", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.chatMessages ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Activity size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#c084fc", marginTop: "6px" }}>
                    Persistent Room Transcripts
                  </div>
                </div>

                {/* Chat User Profiles */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Chat Handles &amp; DPs
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fbbf24", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.chatProfiles ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Shield size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#fbbf24", marginTop: "6px" }}>
                    Custom User Handles &amp; Avatars
                  </div>
                </div>

                {/* Forensic Audits */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Pod Forensic Audits
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f87171", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.privateRoomAudits ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ShieldCheck size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#f87171", marginTop: "6px" }}>
                    Private Study Pod Sealed Dossiers
                  </div>
                </div>

                {/* Edge Notes Cache Stats */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(6, 182, 212, 0.2)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Edge RAM Cache
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "4px" }}>
                        {tursoStatus?.cacheStats?.totalCachedInRam ?? 0}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Zap size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--accent-cyan)", marginTop: "6px" }}>
                    Hit Ratio: {tursoStatus?.cacheStats?.hitRatio || "100%"} | TTL: {tursoStatus?.cacheStats?.ramTtlRemainingSeconds || 0}s
                  </div>
                </div>

                {/* Support Help Tickets Vault */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        Help Tickets Vault
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#34d399", marginTop: "4px" }}>
                        {(tursoStatus?.helpVault?.ticketCount ?? softwareInfo?.tursoHelp?.ticketCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Bot size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#34d399", marginTop: "6px" }}>
                    @fsm_help_bot • Turso Support DB
                  </div>
                </div>

                {/* AI Search & Queries Vault */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                        AI Search Logs
                      </div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>
                        {(tursoStatus?.counts?.aiSearchLogs ?? softwareInfo?.tursoAi?.aiSearchCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={18} />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#38bdf8", marginTop: "6px" }}>
                    Groq &amp; Gemini Student Queries
                  </div>
                </div>
              </div>

              {/* Database Connection & Architectural Specs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                  gap: "16px",
                  marginBottom: "20px",
                }}
              >
                {/* Connection & Failover Specs */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Server size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>LibSQL Infrastructure &amp; Failover</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>High-Availability Database Cluster Configuration</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Engine Protocol:</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>LibSQL over HTTP / WebSocket RPC</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Database URL:</span>
                      <code style={{ fontSize: "0.74rem", color: "#38bdf8", background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: "4px" }}>
                        {tursoStatus?.url || "libsql://...turso.io"}
                      </code>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Storage Allocation:</span>
                      <span style={{ color: "#34d399", fontWeight: 600 }}>{tursoStatus?.storageTier || "9 GB Free Tier"}</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Active Failover State:</span>
                      <span style={{ color: tursoStatus?.isCloud ? "#34d399" : "#fbbf24", fontWeight: 700 }}>
                        {tursoStatus?.isCloud ? "🟢 Primary AWS Cloud Node" : "🟡 Local Standby Engine Active (cache/turso_vault.db)"}
                      </span>
                    </div>

                    {tursoStatus?.diskSizeBytes && (
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                        <span style={{ color: "var(--text-dim)" }}>Local DB File Size:</span>
                        <span style={{ color: "#fff", fontWeight: 600 }}>
                          {(tursoStatus.diskSizeBytes / 1024).toFixed(1)} KB ({tursoStatus.diskSizeBytes.toLocaleString()} bytes)
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-dim)" }}>Auto-Cascade Deletion:</span>
                      <span style={{ color: "#34d399", fontWeight: 600 }}>✅ Enabled across 5 tables</span>
                    </div>
                  </div>
                </div>

                {/* Maintenance & Prune Operations */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>Database Retention &amp; Pruner</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Scheduled Maintenance and Storage Optimization</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
                    <p style={{ color: "var(--text-dim)", margin: 0, fontSize: "0.76rem", lineHeight: 1.5 }}>
                      Clean aged chat history from Turso to optimize query execution and maintain minimal disk consumption without touching active rooms.
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-dim)", fontSize: "0.78rem" }}>Retention Window:</span>
                      <select
                        value={tursoPruneDays}
                        onChange={(e) => setTursoPruneDays(Number(e.target.value))}
                        style={{
                          background: "rgba(0,0,0,0.4)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          color: "#fff",
                          borderRadius: "6px",
                          padding: "5px 10px",
                          fontSize: "0.78rem",
                        }}
                      >
                        <option value={7}>Older than 7 Days</option>
                        <option value={14}>Older than 14 Days</option>
                        <option value={30}>Older than 30 Days (Recommended)</option>
                        <option value={60}>Older than 60 Days</option>
                        <option value={90}>Older than 90 Days</option>
                      </select>

                      <button
                        onClick={() => handleTursoPruneMessages(tursoPruneDays)}
                        disabled={tursoPruning}
                        className="btn-danger"
                        style={{ fontSize: "0.76rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      >
                        <Trash2 size={13} />
                        <span>{tursoPruning ? "Pruning..." : `Prune >${tursoPruneDays}d Messages`}</span>
                      </button>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "10px", marginTop: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-cyan)", fontSize: "0.75rem", fontWeight: 700, marginBottom: "4px" }}>
                        <ShieldCheck size={14} />
                        <span>Zero-Loss Architecture</span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                        When any student account is removed from Firebase, our backend cascade engine removes all their associated Turso records and automatically dispatches a verified Dossier to Telegram Security Supergroup.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Turso Edge Cache Delete Day Controller */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>Turso Cache Deletion (By Days)</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Delete cached notes, messages & transcripts by days threshold</div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#fca5a5",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        fontWeight: 700,
                      }}
                    >
                      🗑️ Cache Delete Controller
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
                    <p style={{ color: "var(--text-dim)", margin: 0, fontSize: "0.76rem", lineHeight: 1.5 }}>
                      Permanently clean cached entries older than the selected day threshold from the Turso LibSQL <code style={{ color: "#38bdf8" }}>notes_cache</code>, chat messages, and pod audits, resetting RAM buffers.
                    </p>

                    {/* Quick Presets & Day Input */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-dim)", fontSize: "0.76rem", fontWeight: 600 }}>Quick Presets:</span>
                      {[1, 7, 15, 30, 60].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setTursoCachePruneDays(d)}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            background: tursoCachePruneDays === d ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.04)",
                            border: tursoCachePruneDays === d ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                            color: tursoCachePruneDays === d ? "#fff" : "var(--text-muted)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {d}d
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTursoCachePruneDays(0)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          background: tursoCachePruneDays === 0 ? "rgba(239, 68, 68, 0.3)" : "rgba(239, 68, 68, 0.1)",
                          border: tursoCachePruneDays === 0 ? "1px solid #ef4444" : "1px solid rgba(239, 68, 68, 0.3)",
                          color: tursoCachePruneDays === 0 ? "#fff" : "#fca5a5",
                          transition: "all 0.15s ease",
                        }}
                      >
                        0d (All)
                      </button>

                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.76rem" }}>Days:</span>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          value={tursoCachePruneDays}
                          onChange={(e) => setTursoCachePruneDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          style={{
                            width: "55px",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            background: "rgba(0, 0, 0, 0.5)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        />
                      </div>
                    </div>

                    {/* Target Scope & Action Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "2px" }}>
                      <select
                        value={tursoCacheTarget}
                        onChange={(e) => setTursoCacheTarget(e.target.value)}
                        style={{
                          background: "rgba(0, 0, 0, 0.5)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#38bdf8",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                        }}
                      >
                        <option value="all">⚡ All Turso Caches (Notes + Messages + Audits)</option>
                        <option value="notes_cache">📄 Notes Cache Only (notes_cache table)</option>
                        <option value="messages">💬 Chat Messages Only</option>
                        <option value="audits">🔒 Pod Audits Only</option>
                      </select>

                      <button
                        onClick={() => handleTursoPruneCache(tursoCachePruneDays, tursoCacheTarget)}
                        disabled={tursoCachePruning}
                        className="btn-danger"
                        style={{
                          fontSize: "0.78rem",
                          padding: "7px 14px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontWeight: 700,
                        }}
                        title={`Delete Turso cache older than ${tursoCachePruneDays} days`}
                      >
                        <Trash2 size={13} className={tursoCachePruning ? "spin" : ""} />
                        <span>
                          {tursoCachePruning
                            ? "Deleting..."
                            : tursoCachePruneDays <= 0
                            ? "Clear Entire Turso Cache Now"
                            : `Delete Turso Cache Older Than ${tursoCachePruneDays} Days`}
                        </span>
                      </button>

                      {tursoCachePruneDays !== 0 && (
                        <button
                          onClick={() => handleTursoPruneCache(0, tursoCacheTarget)}
                          disabled={tursoCachePruning}
                          className="btn-secondary"
                          style={{
                            fontSize: "0.74rem",
                            padding: "6px 11px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            borderColor: "rgba(239, 68, 68, 0.35)",
                            color: "#fca5a5",
                          }}
                          title="Clear all Turso cached rows immediately"
                        >
                          <Flame size={12} />
                          <span>Wipe All (0d)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 🤖 AI Search Logs Retention & Pruner (100% Dedicated & Isolated - Never Mixed) */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1.5px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Bot size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>
                          AI Search Query Retention &amp; Pruner (ai_search_logs)
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                          Independent retention policy, Clear All, and Never settings for AI logs
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: "999px",
                        background: aiRetentionDays === "never" ? "rgba(16, 185, 129, 0.15)" : "rgba(56, 189, 248, 0.12)",
                        color: aiRetentionDays === "never" ? "#34d399" : "#38bdf8",
                        border: aiRetentionDays === "never" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(56, 189, 248, 0.3)",
                        fontWeight: 700,
                      }}
                    >
                      {aiRetentionDays === "never" ? "♾️ Retention: NEVER" : `⏳ Retention: ${aiRetentionDays}d`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
                    <p style={{ color: "var(--text-dim)", margin: 0, fontSize: "0.76rem", lineHeight: 1.5 }}>
                      Manage student AI academic doubt query logs, tokens used, and latency audits. Kept completely isolated from chat messages and edge cache.
                    </p>

                    {/* Quick Presets & Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-dim)", fontSize: "0.76rem", fontWeight: 600 }}>Presets:</span>
                      {[1, 7, 15, 30, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAiRetentionDays(String(d))}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            background: aiRetentionDays === String(d) ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.04)",
                            border: aiRetentionDays === String(d) ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                            color: aiRetentionDays === String(d) ? "#fff" : "var(--text-muted)",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {d}d
                        </button>
                      ))}

                      {/* NEVER (Keep Forever) Preset Button */}
                      <button
                        type="button"
                        onClick={() => handlePruneAiLogs("never")}
                        style={{
                          padding: "3px 10px",
                          borderRadius: "6px",
                          fontSize: "0.74rem",
                          fontWeight: 800,
                          cursor: "pointer",
                          background: aiRetentionDays === "never" ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.1)",
                          border: aiRetentionDays === "never" ? "1px solid #10b981" : "1px solid rgba(16, 185, 129, 0.3)",
                          color: aiRetentionDays === "never" ? "#fff" : "#34d399",
                          transition: "all 0.15s ease",
                        }}
                        title="Set retention to Never (Preserve all AI queries forever)"
                      >
                        ♾️ Never (Keep Forever)
                      </button>

                      {/* Clear All (0d) Button */}
                      <button
                        type="button"
                        onClick={() => handlePruneAiLogs(0)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          color: "#fca5a5",
                          transition: "all 0.15s ease",
                        }}
                        title="Wipe all AI search logs immediately"
                      >
                        🗑️ Clear All (0d)
                      </button>

                      {aiRetentionDays !== "never" && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}>
                          <span style={{ color: "var(--text-dim)", fontSize: "0.76rem" }}>Days:</span>
                          <input
                            type="number"
                            min="0"
                            max="365"
                            value={aiRetentionDays === "never" ? "" : aiRetentionDays}
                            onChange={(e) => setAiRetentionDays(String(Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            style={{
                              width: "55px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "rgba(0, 0, 0, 0.5)",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                              color: "#fff",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              textAlign: "center",
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Retention Dropdown & Main Action Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                      <select
                        value={aiRetentionDays}
                        onChange={(e) => setAiRetentionDays(e.target.value)}
                        style={{
                          background: "rgba(0, 0, 0, 0.5)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: aiRetentionDays === "never" ? "#34d399" : "#38bdf8",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <option value="never">♾️ Never (Keep Forever - No Auto-Delete)</option>
                        <option value="1">Older than 1 Day (&gt;1d)</option>
                        <option value="7">Older than 7 Days (&gt;7d)</option>
                        <option value="15">Older than 15 Days (&gt;15d)</option>
                        <option value="30">Older than 30 Days (&gt;30d - Recommended)</option>
                        <option value="60">Older than 60 Days (&gt;60d)</option>
                        <option value="90">Older than 90 Days (&gt;90d)</option>
                      </select>

                      {aiRetentionDays !== "never" ? (
                        <button
                          onClick={() => handlePruneAiLogs()}
                          disabled={isAiPruning}
                          className="btn-danger"
                          style={{
                            fontSize: "0.78rem",
                            padding: "7px 14px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: 700,
                          }}
                          title={`Delete AI search logs older than ${aiRetentionDays} days`}
                        >
                          <Trash2 size={13} className={isAiPruning ? "spin" : ""} />
                          <span>
                            {isAiPruning
                              ? "Pruning..."
                              : aiRetentionDays === "0"
                              ? "Clear All AI Logs Now"
                              : `Prune >${aiRetentionDays}d AI Logs`}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePruneAiLogs("never")}
                          disabled={isAiPruning}
                          style={{
                            fontSize: "0.78rem",
                            padding: "7px 14px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: 700,
                            background: "rgba(16, 185, 129, 0.2)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            color: "#34d399",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          <ShieldCheck size={14} />
                          <span>Retention Active: Never (Safe)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handlePruneAiLogs(0)}
                        disabled={isAiPruning}
                        className="btn-danger"
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#fca5a5",
                        }}
                        title="Permanently wipe all AI search logs from Turso immediately"
                      >
                        <Trash2 size={12} />
                        <span>Clear All</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAiLogsTable(!showAiLogsTable);
                          if (!showAiLogsTable) loadAiLogs();
                        }}
                        className="btn-secondary"
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          borderColor: "rgba(56, 189, 248, 0.35)",
                          color: "#38bdf8",
                        }}
                      >
                        <Eye size={12} />
                        <span>{showAiLogsTable ? "Hide Logs Preview" : "View Recent Logs"}</span>
                      </button>

                      {/* Export AI Search History (Excel & PDF) */}
                      <button
                        type="button"
                        onClick={() => window.open(api.getAiReportDownloadUrl("excel"), "_blank")}
                        className="btn-secondary"
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(16, 185, 129, 0.12)",
                          borderColor: "rgba(16, 185, 129, 0.35)",
                          color: "#34d399",
                        }}
                        title="Download AI search query history as Excel CSV"
                      >
                        <Download size={12} />
                        <span>Excel History</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => window.open(api.getAiReportDownloadUrl("pdf"), "_blank")}
                        className="btn-secondary"
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(239, 68, 68, 0.12)",
                          borderColor: "rgba(239, 68, 68, 0.35)",
                          color: "#f87171",
                        }}
                        title="Download formatted AI search query history as PDF"
                      >
                        <FileText size={12} />
                        <span>PDF Report</span>
                      </button>
                    </div>

                    {/* Action Feedback Banner */}
                    {aiPruneMsg && (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          fontSize: "0.76rem",
                          background: aiPruneMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          border: aiPruneMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                          color: aiPruneMsg.type === "success" ? "#34d399" : "#f87171",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{aiPruneMsg.text}</span>
                        <button
                          onClick={() => setAiPruneMsg(null)}
                          style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px" }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    {/* Strict Cascade Purge Guarantee Notice */}
                    <div style={{ background: "rgba(56, 189, 248, 0.04)", border: "1px solid rgba(56, 189, 248, 0.15)", borderRadius: "6px", padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontSize: "0.75rem", fontWeight: 700, marginBottom: "4px" }}>
                        <ShieldCheck size={14} />
                        <span>Zero-Risk Firebase ➔ Turso Cascade Guarantee</span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                        Even if Retention is configured to <strong>"Never"</strong>, when a student account is removed or purged from Firebase, their associated AI search queries in Turso are <strong>ALWAYS permanently cascade-deleted</strong> in real-time, leaving zero orphan records.
                      </div>
                    </div>

                    {/* Recent AI Search Logs Preview Panel */}
                    {showAiLogsTable && (
                      <div style={{ marginTop: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                          <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#fff" }}>
                            Recent Turso AI Search Logs ({aiSearchLogs.length})
                          </span>
                          <button
                            onClick={loadAiLogs}
                            disabled={aiLogsLoading}
                            className="btn-secondary"
                            style={{ fontSize: "0.7rem", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <RefreshCw size={11} className={aiLogsLoading ? "spin" : ""} />
                            <span>{aiLogsLoading ? "Loading..." : "Refresh"}</span>
                          </button>
                        </div>

                        {aiSearchLogs.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "14px", color: "var(--text-dim)", fontSize: "0.74rem" }}>
                            {aiLogsLoading ? "Fetching recent AI logs..." : "No recent AI search logs in Turso."}
                          </div>
                        ) : (
                          <div style={{ overflowX: "auto", maxHeight: "200px" }}>
                            <table style={{ width: "100%", fontSize: "0.72rem", borderCollapse: "collapse", color: "#fff" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "var(--text-dim)" }}>
                                  <th style={{ padding: "4px 8px" }}>Time</th>
                                  <th style={{ padding: "4px 8px" }}>Student</th>
                                  <th style={{ padding: "4px 8px" }}>Query</th>
                                  <th style={{ padding: "4px 8px" }}>Provider</th>
                                  <th style={{ padding: "4px 8px" }}>Latency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {aiSearchLogs.slice(0, 10).map((l) => (
                                  <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                    <td style={{ padding: "4px 8px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                                      {l.createdAt ? new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                                    </td>
                                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                                      {l.userName || l.userEmail || "Student"}
                                    </td>
                                    <td style={{ padding: "4px 8px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.query}>
                                      {l.query}
                                    </td>
                                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                                      <span style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "0.68rem", background: l.provider === "groq" ? "rgba(56, 189, 248, 0.2)" : "rgba(168, 85, 247, 0.2)", color: l.provider === "groq" ? "#38bdf8" : "#c084fc", fontWeight: 700 }}>
                                        {l.provider ? l.provider.toUpperCase() : "AI"}
                                      </span>
                                    </td>
                                    <td style={{ padding: "4px 8px", color: "#34d399", whiteSpace: "nowrap" }}>
                                      {l.latencyMs != null ? `${l.latencyMs}ms` : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 🎫 Support Desk Ticket Retention & Auto-Purge (help_tickets) */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.18)", color: "#818cf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>
                        Support Help Desk Ticket Retention &amp; Auto-Purge (help_tickets)
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                        Closed tickets remain visible for 5 days before auto-purging. Increase/decrease retention globally or per user in Tab 13.
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: "0.72rem",
                      padding: "3px 9px",
                      borderRadius: "999px",
                      background: helpRetentionDays === "never" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                      color: helpRetentionDays === "never" ? "#34d399" : "#a5b4fc",
                      border: helpRetentionDays === "never" ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(99, 102, 241, 0.35)",
                      fontWeight: 700,
                    }}
                  >
                    {helpRetentionDays === "never" ? "♾️ Retention: NEVER" : `⏳ Retention: ${helpRetentionDays}d`}
                  </span>
                </div>

                {/* Live Stats Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Total Tickets</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{helpStats.totalTickets}</div>
                  </div>
                  <div style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "#38bdf8", textTransform: "uppercase" }}>🟢 Active Tickets</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8" }}>{helpStats.activeTickets}</div>
                  </div>
                  <div style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "8px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "#a5b4fc", textTransform: "uppercase" }}>🔒 Closed (Grace Period)</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#c7d2fe" }}>{helpStats.closedTickets}</div>
                  </div>
                  <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "8px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "#f87171", textTransform: "uppercase" }}>⚠️ Expired (Purgeable)</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fca5a5" }}>{helpStats.expiredTickets}</div>
                  </div>
                </div>

                {/* Presets & Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-dim)", fontSize: "0.76rem", fontWeight: 600 }}>Presets:</span>
                  {[1, 3, 5, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleUpdateHelpRetention(d)}
                      disabled={isHelpUpdating}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: helpRetentionDays === String(d) ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.04)",
                        border: helpRetentionDays === String(d) ? "1px solid #818cf8" : "1px solid rgba(255, 255, 255, 0.1)",
                        color: helpRetentionDays === String(d) ? "#fff" : "var(--text-muted)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {d}d{d === 5 ? " (Default)" : ""}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleUpdateHelpRetention("never")}
                    disabled={isHelpUpdating}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "6px",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      background: helpRetentionDays === "never" ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.1)",
                      border: helpRetentionDays === "never" ? "1px solid #10b981" : "1px solid rgba(16, 185, 129, 0.3)",
                      color: helpRetentionDays === "never" ? "#fff" : "#34d399",
                      transition: "all 0.15s ease",
                    }}
                    title="Keep closed tickets forever"
                  >
                    ♾️ Never (Keep Forever)
                  </button>
                </div>

                {/* Custom Stepper & Purge Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = helpRetentionDays === "never" ? 5 : parseInt(helpRetentionDays, 10);
                        const next = Math.max(1, cur - 1);
                        handleUpdateHelpRetention(next);
                      }}
                      disabled={isHelpUpdating || helpRetentionDays === "never"}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        background: "rgba(255, 255, 255, 0.07)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title="Decrease retention days"
                    >
                      -
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={helpRetentionDays === "never" ? "" : helpRetentionDays}
                        placeholder={helpRetentionDays === "never" ? "∞" : "5"}
                        onChange={(e) => setHelpRetentionDays(e.target.value)}
                        disabled={helpRetentionDays === "never" || isHelpUpdating}
                        style={{
                          width: "56px",
                          textAlign: "center",
                          padding: "5px 4px",
                          borderRadius: "6px",
                          background: "rgba(0, 0, 0, 0.4)",
                          border: "1px solid rgba(99, 102, 241, 0.4)",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          outline: "none",
                        }}
                      />
                      <span style={{ color: "var(--text-dim)", fontSize: "0.76rem" }}>days</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const cur = helpRetentionDays === "never" ? 5 : parseInt(helpRetentionDays, 10);
                        const next = Math.min(365, cur + 1);
                        handleUpdateHelpRetention(next);
                      }}
                      disabled={isHelpUpdating || helpRetentionDays === "never"}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        background: "rgba(255, 255, 255, 0.07)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title="Increase retention days"
                    >
                      +
                    </button>

                    {helpRetentionDays !== "never" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateHelpRetention(helpRetentionDays)}
                        disabled={isHelpUpdating}
                        className="btn-primary"
                        style={{
                          fontSize: "0.74rem",
                          padding: "5px 12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <Save size={12} />
                        <span>Save Policy</span>
                      </button>
                    )}
                  </div>

                  <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={handlePurgeExpiredHelpTickets}
                      disabled={isHelpUpdating || helpStats.expiredTickets === 0}
                      style={{
                        fontSize: "0.74rem",
                        padding: "6px 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        background: helpStats.expiredTickets > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.04)",
                        border: helpStats.expiredTickets > 0 ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: helpStats.expiredTickets > 0 ? "#fca5a5" : "var(--text-muted)",
                        borderRadius: "6px",
                        cursor: helpStats.expiredTickets > 0 ? "pointer" : "not-allowed",
                        fontWeight: 700,
                      }}
                      title="Purge expired tickets now"
                    >
                      <Trash2 size={12} />
                      <span>Purge Expired Closed Tickets Now ({helpStats.expiredTickets})</span>
                    </button>

                    <button
                      type="button"
                      onClick={loadHelpRetention}
                      disabled={isHelpUpdating}
                      className="btn-secondary"
                      style={{ fontSize: "0.74rem", padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      title="Refresh metrics"
                    >
                      <RefreshCw size={12} className={isHelpUpdating ? "spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Action Feedback Message */}
                {helpActionMsg && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "0.76rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: helpActionMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      border: helpActionMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                      color: helpActionMsg.type === "success" ? "#34d399" : "#fca5a5",
                    }}
                  >
                    <span>{helpActionMsg.text}</span>
                    <button
                      onClick={() => setHelpActionMsg(null)}
                      style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px" }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* 5-Day Auto-Purge Lifecycle Notice */}
                <div style={{ background: "rgba(99, 102, 241, 0.04)", border: "1px solid rgba(99, 102, 241, 0.15)", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a5b4fc", fontSize: "0.75rem", fontWeight: 700, marginBottom: "4px" }}>
                    <Clock size={14} />
                    <span>Autonomous 5-Day Closed Ticket Lifecycle</span>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                    When a ticket is closed, it remains visible for exactly <strong>{helpRetentionDays === "never" ? "indefinitely" : `${helpRetentionDays} days`}</strong> in Turso and Student Portals. Admin can adjust individual ticket retention or trigger <strong>Instant Purge</strong> in <strong>Tab 13 (Support Desk)</strong> at any time.
                  </div>
                </div>
              </div>

              {/* ⚡ Cloudflare Edge, MongoDB Hot Buffer & Turso Chat Stream Hub */}
              <div
                style={{
                  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 30, 0.9) 100%)",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                }}
              >
                {/* Hub Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(99, 102, 241, 0.25) 100%)", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Zap size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "#fff", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>⚡ Cloudflare Edge, MongoDB Buffer & Turso Chat Hub</span>
                        <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "999px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)", fontWeight: 700 }}>
                          0% SERVER LOAD
                        </span>
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                        Edge WebSockets ➔ MongoDB Hot Ingest ➔ Turso LibSQL Warm Stream ➔ @fsm_chat_bot Vault
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={handleTestChatBotPing}
                      disabled={isChatUpdating}
                      className="btn-secondary"
                      style={{ fontSize: "0.75rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      title="Dispatch test alert to @fsm_chat_bot supergroup and Admin DM"
                    >
                      <Send size={13} />
                      <span>Ping Telegram Bot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        loadChatRetentionData();
                        if (typeof loadTursoAudits === "function") loadTursoAudits();
                      }}
                      disabled={isChatUpdating}
                      className="btn-secondary"
                      style={{ fontSize: "0.75rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      title="Refresh Edge & Buffer Telemetry"
                    >
                      <RefreshCw size={13} className={isChatUpdating ? "spin" : ""} />
                      <span>Refresh Hub</span>
                    </button>
                  </div>
                </div>

                {/* Hub Action Feedback Banner */}
                {chatActionMsg && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: chatActionMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      border: chatActionMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(239, 68, 68, 0.35)",
                      color: chatActionMsg.type === "success" ? "#34d399" : "#fca5a5",
                    }}
                  >
                    <span>{chatActionMsg.text}</span>
                    <button
                      onClick={() => setChatActionMsg(null)}
                      style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Architecture 4-Pillar Status Ribbon */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
                  {/* Pillar 1: Cloudflare Edge */}
                  <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontWeight: 700, fontSize: "0.76rem" }}>
                        <Globe size={14} />
                        <span>Cloudflare Edge</span>
                      </div>
                      <span style={{ fontSize: "0.66rem", color: "#38bdf8", background: "rgba(56, 189, 248, 0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        ~12ms Latency
                      </span>
                    </div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff" }}>0% Server Load</div>
                    <div style={{ fontSize: "0.69rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      Direct WebSockets Edge bypasses Render server
                    </div>
                  </div>

                  {/* Pillar 2: MongoDB Hot Buffer */}
                  <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#34d399", fontWeight: 700, fontSize: "0.76rem" }}>
                        <Database size={14} />
                        <span>MongoDB Hot Buffer</span>
                      </div>
                      <span style={{ fontSize: "0.66rem", color: "#34d399", background: "rgba(16, 185, 129, 0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        {chatTelemetry?.mongoStatus?.configured ? "Active" : "Standby"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff" }}>
                      {chatTelemetry?.mongoStatus?.hotBufferCount ?? chatMessages?.length ?? 0} Messages
                    </div>
                    <div style={{ fontSize: "0.69rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      Ultra-fast write buffer for burst throughput
                    </div>
                  </div>

                  {/* Pillar 3: Turso LibSQL */}
                  <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(168, 85, 247, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#c084fc", fontWeight: 700, fontSize: "0.76rem" }}>
                        <HardDrive size={14} />
                        <span>Turso LibSQL Stream</span>
                      </div>
                      <span style={{ fontSize: "0.66rem", color: "#c084fc", background: "rgba(168, 85, 247, 0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        {chatRetentionDays}d Policy
                      </span>
                    </div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff" }}>Warm Tier DB</div>
                    <div style={{ fontSize: "0.69rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      Encrypted edge SQLite with auto-pruning
                    </div>
                  </div>

                  {/* Pillar 4: Telegram Vault */}
                  <div style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#fbbf24", fontWeight: 700, fontSize: "0.76rem" }}>
                        <Bot size={14} />
                        <span>@fsm_chat_bot Vault</span>
                      </div>
                      <span style={{ fontSize: "0.66rem", color: "#fbbf24", background: "rgba(245, 158, 11, 0.12)", padding: "1px 6px", borderRadius: "4px" }}>
                        4 Topics Active
                      </span>
                    </div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fff" }}>Supergroup Mirror</div>
                    <div style={{ fontSize: "0.69rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      Topics 1 (Chat), 33 (Media), 35 (Alerts), 31 (Pods)
                    </div>
                  </div>
                </div>

                {/* Dual Control Modules: MongoDB Hot Buffer & Turso Retention */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
                  {/* Module 1: MongoDB Hot Buffer Card */}
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.03)",
                      border: "1px solid rgba(16, 185, 129, 0.2)",
                      borderRadius: "8px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <div style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Database size={14} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>MongoDB Hot Buffer (High Throughput)</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                            Status: <strong style={{ color: chatTelemetry?.mongoStatus?.configured ? "#34d399" : "#fbbf24" }}>{chatTelemetry?.mongoStatus?.status || "Standby Mode"}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", lineHeight: 1.45, background: "rgba(0, 0, 0, 0.25)", padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        During student peak traffic, chat messages, PDFs, and images stream directly into the MongoDB Hot Buffer with <strong>unlimited write velocity</strong>. When the buffer reaches 30,000 items, it automatically flushes into Turso LibSQL warm tier.
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                        URI: {chatTelemetry?.mongoStatus?.maskedUri || "Direct LibSQL Warm Mode"}
                      </div>

                      <button
                        type="button"
                        onClick={handleFlushMongoBuffer}
                        disabled={isChatUpdating}
                        className="btn-primary"
                        style={{
                          fontSize: "0.75rem",
                          padding: "6px 12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                          border: "none",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: isChatUpdating ? "not-allowed" : "pointer",
                        }}
                        title="Synchronize all buffer messages from MongoDB into Turso LibSQL"
                      >
                        <Zap size={13} />
                        <span>Flush Buffer to Turso Now</span>
                      </button>
                    </div>
                  </div>

                  {/* Module 2: Turso Retention Policy & Single-Click Purge Card */}
                  <div
                    style={{
                      background: "rgba(56, 189, 248, 0.03)",
                      border: "1px solid rgba(56, 189, 248, 0.2)",
                      borderRadius: "8px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Clock size={14} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>Turso Retention Policy & Single-Click Purge</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                            Auto-expires old messages from Turso table <code>chat_messages</code>
                          </div>
                        </div>
                      </div>

                      {/* Day Retention Presets & Stepper */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                        {["1", "3", "7", "14", "30", "never"].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setChatRetentionDays(preset);
                              handleSaveChatRetentionPolicy(preset === "never" ? 365 : Number(preset));
                            }}
                            disabled={isChatUpdating}
                            style={{
                              padding: "4px 9px",
                              fontSize: "0.72rem",
                              borderRadius: "4px",
                              border: chatRetentionDays === preset ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                              background: chatRetentionDays === preset ? "rgba(56, 189, 248, 0.2)" : "rgba(0, 0, 0, 0.3)",
                              color: chatRetentionDays === preset ? "#38bdf8" : "var(--text-dim)",
                              cursor: "pointer",
                              fontWeight: chatRetentionDays === preset ? 700 : 500,
                            }}
                          >
                            {preset === "never" ? "Never (365d)" : `${preset} Day${preset === "1" ? "" : "s"}`}
                          </button>
                        ))}

                        {/* Stepper Controls */}
                        <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(0,0,0,0.4)", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)", marginLeft: "4px" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = chatRetentionDays === "never" ? 30 : Math.max(1, parseInt(chatRetentionDays, 10) - 1);
                              setChatRetentionDays(String(cur));
                            }}
                            disabled={isChatUpdating || chatRetentionDays === "1"}
                            style={{ background: "none", border: "none", color: "#fff", padding: "3px 8px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700 }}
                            title="Decrease days"
                          >
                            -
                          </button>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#38bdf8", padding: "0 6px" }}>
                            {chatRetentionDays === "never" ? "∞" : `${chatRetentionDays}d`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = chatRetentionDays === "never" ? 1 : Math.min(365, parseInt(chatRetentionDays, 10) + 1);
                              setChatRetentionDays(String(cur));
                            }}
                            disabled={isChatUpdating}
                            style={{ background: "none", border: "none", color: "#fff", padding: "3px 8px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700 }}
                            title="Increase days"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSaveChatRetentionPolicy()}
                          disabled={isChatUpdating}
                          className="btn-secondary"
                          style={{ fontSize: "0.72rem", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}
                        >
                          <Save size={11} />
                          <span>Save Policy</span>
                        </button>
                      </div>
                    </div>

                    {/* Single-Click Instant Delete Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <button
                        type="button"
                        onClick={() => handleSingleClickPruneChat(chatRetentionDays === "never" ? 365 : Number(chatRetentionDays))}
                        disabled={isChatUpdating}
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#fca5a5",
                          borderRadius: "6px",
                          cursor: isChatUpdating ? "not-allowed" : "pointer",
                          fontWeight: 700,
                        }}
                        title={`Single-click purge all messages older than ${chatRetentionDays} days`}
                      >
                        <Trash2 size={12} />
                        <span>Purge Expired Messages ({chatRetentionDays === "never" ? ">365d" : `>${chatRetentionDays}d`})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSingleClickPruneChat(0)}
                        disabled={isChatUpdating}
                        style={{
                          fontSize: "0.74rem",
                          padding: "6px 11px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "rgba(220, 38, 38, 0.25)",
                          border: "1px solid rgba(239, 68, 68, 0.6)",
                          color: "#f87171",
                          borderRadius: "6px",
                          cursor: isChatUpdating ? "not-allowed" : "pointer",
                          fontWeight: 700,
                          marginLeft: "auto",
                        }}
                        title="Danger: Instantly wipe ALL chat messages from Turso and active memory buffer"
                      >
                        <Flame size={12} />
                        <span>Single-Click Wipe All (0-Day Clean)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Telegram @fsm_chat_bot Topic Status Preview */}
                <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "8px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Bot size={15} style={{ color: "#fbbf24" }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff" }}>
                        Telegram Live Compliance Vault: <code>@fsm_chat_bot</code>
                      </span>
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                      Supergroup ID: <code>{chatBotSettings?.supergroupId || "-1002931405908"}</code>
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px" }}>
                    <div style={{ background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.04)", fontSize: "0.72rem" }}>
                      <div style={{ color: "#38bdf8", fontWeight: 700 }}>💬 Topic 1 (Unified Feed)</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.68rem" }}>Real-time chat & public messages mirror</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.04)", fontSize: "0.72rem" }}>
                      <div style={{ color: "#34d399", fontWeight: 700 }}>📎 Topic 33 (Media Vault)</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.68rem" }}>Images, PDFs, and study attachments</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.04)", fontSize: "0.72rem" }}>
                      <div style={{ color: "#f87171", fontWeight: 700 }}>🚨 Topic 35 (Security & Alerts)</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.68rem" }}>Deleted message alerts & moderation</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.04)", fontSize: "0.72rem" }}>
                      <div style={{ color: "#c084fc", fontWeight: 700 }}>🛡️ Topic 31 (Pod Forensic Audits)</div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.68rem" }}>Permanent transcripts of closed pods</div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Private Study Pod Forensic Audits Table */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "8px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showAuditsTable ? "12px" : "0", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "30px", height: "30px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShieldAlert size={15} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>Private Study Pod Forensic Audits (Turso Vault)</span>
                          <span style={{ fontSize: "0.68rem", padding: "1px 7px", borderRadius: "999px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                            {tursoAudits.length} Records
                          </span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>Permanent compliance transcripts of closed study pods</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setShowAuditsTable(!showAuditsTable)}
                        className="btn-secondary"
                        style={{ fontSize: "0.74rem", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      >
                        {showAuditsTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        <span>{showAuditsTable ? "Collapse Table" : "Expand Table"}</span>
                      </button>

                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.74rem",
                          color: "var(--text-dim)",
                          background: "rgba(255, 255, 255, 0.03)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          padding: "3px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        <span>Retention:</span>
                        <select
                          value={tursoPruneDays}
                          onChange={(e) => setTursoPruneDays(Number(e.target.value))}
                          style={{
                            background: "rgba(0, 0, 0, 0.5)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#38bdf8",
                            borderRadius: "4px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            cursor: "pointer",
                          }}
                        >
                          <option value={0}>All Audits (0 Days / Clear Everything)</option>
                          <option value={1}>Older than 1 Day (&gt;1d)</option>
                          <option value={3}>Older than 3 Days (&gt;3d)</option>
                          <option value={7}>Older than 7 Days (&gt;7d)</option>
                          <option value={30}>Older than 30 Days (&gt;30d)</option>
                        </select>
                      </div>

                      <button
                        onClick={() => handleTursoPruneAudits(tursoPruneDays)}
                        disabled={tursoPruning}
                        className="btn-danger"
                        style={{ fontSize: "0.74rem", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        title={tursoPruneDays === 0 ? "Delete all pod transcripts immediately" : `Delete transcripts older than ${tursoPruneDays} days`}
                      >
                        <Trash2 size={12} />
                        <span>{tursoPruning ? "Pruning..." : tursoPruneDays === 0 ? "Wipe All Audits" : `Prune >${tursoPruneDays}d Audits`}</span>
                      </button>

                      {tursoPruneDays !== 0 && (
                        <button
                          onClick={() => handleTursoPruneAudits(0)}
                          disabled={tursoPruning || tursoAudits.length === 0}
                          className="btn-danger"
                          style={{
                            fontSize: "0.74rem",
                            padding: "5px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "rgba(239, 68, 68, 0.2)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            color: "#fca5a5",
                          }}
                          title="Delete all pod transcripts right now"
                        >
                          <Trash2 size={12} />
                          <span>Clear All</span>
                        </button>
                      )}

                      <button
                        onClick={loadTursoAudits}
                        disabled={tursoAuditsLoading}
                        className="btn-secondary"
                        style={{ fontSize: "0.74rem", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <RefreshCw size={12} className={tursoAuditsLoading ? "spin" : ""} />
                        <span>{tursoAuditsLoading ? "Loading..." : "Refresh"}</span>
                      </button>
                    </div>
                  </div>

                  {showAuditsTable && (
                    <>
                      {/* Audit Search Bar */}
                      <div style={{ marginBottom: "12px", position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                        <input
                          type="text"
                          value={tursoAuditSearch}
                          onChange={(e) => setTursoAuditSearch(e.target.value)}
                          placeholder="Search pod audits by room name, pod ID, secret code, creator, or timestamp..."
                          style={{
                            width: "100%",
                            padding: "8px 12px 8px 32px",
                            fontSize: "0.78rem",
                            borderRadius: "6px",
                            background: "rgba(0, 0, 0, 0.35)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#fff",
                            boxSizing: "border-box",
                          }}
                        />
                        {tursoAuditSearch && (
                          <button
                            onClick={() => setTursoAuditSearch("")}
                            style={{
                              position: "absolute",
                              right: "8px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {tursoAuditsLoading ? (
                        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "0.82rem" }}>
                          <RefreshCw size={18} className="spin" style={{ marginBottom: "8px", color: "var(--accent-cyan)" }} />
                          <div>Retrieving forensic audits from Turso...</div>
                        </div>
                      ) : tursoAudits.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "28px", color: "var(--text-dim)", fontSize: "0.8rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                          No private room forensic records stored yet. When private study pods close, their encrypted forensic transcripts are automatically archived here.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "var(--text-dim)", textAlign: "left" }}>
                                <th style={{ padding: "8px 10px" }}>Room Name / ID</th>
                                <th style={{ padding: "8px 10px" }}>Creator</th>
                                <th style={{ padding: "8px 10px" }}>Duration</th>
                                <th style={{ padding: "8px 10px" }}>Participants</th>
                                <th style={{ padding: "8px 10px" }}>Messages</th>
                                <th style={{ padding: "8px 10px" }}>Archived At</th>
                                <th style={{ padding: "8px 10px" }}>Telegram Audit</th>
                                <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tursoAudits
                                .filter((a) => {
                                  if (!tursoAuditSearch.trim()) return true;
                                  const q = tursoAuditSearch.toLowerCase().trim();
                                  const dStr = a.closedAt ? new Date(a.closedAt).toLocaleString("en-IN").toLowerCase() : "";
                                  return (
                                    (a.name || "").toLowerCase().includes(q) ||
                                    (a.roomId || "").toLowerCase().includes(q) ||
                                    (a.secretCode || "").toLowerCase().includes(q) ||
                                    (a.creatorName || "").toLowerCase().includes(q) ||
                                    (a.createdBy || "").toLowerCase().includes(q) ||
                                    dStr.includes(q)
                                  );
                                })
                                .map((a, idx) => (
                                <tr
                                  key={a.roomId || idx}
                                  style={{
                                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                                    background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                                  }}
                                >
                                  <td style={{ padding: "10px", fontWeight: 600, color: "#fff" }}>
                                    <div>{a.name || "Private Study Room"}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "monospace" }}>
                                      ID: {a.roomId} {a.secretCode ? `• Code: ${a.secretCode}` : ""}
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px", color: "#e2e8f0" }}>
                                    <div>{a.creatorName || a.createdBy || "Student"}</div>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{a.createdBy}</div>
                                  </td>
                                  <td style={{ padding: "10px", color: "#38bdf8" }}>
                                    {a.durationMins || 0} mins
                                  </td>
                                  <td style={{ padding: "10px", color: "#e2e8f0" }}>
                                    {a.participantsCount || 0} students
                                  </td>
                                  <td style={{ padding: "10px", color: "#e2e8f0" }}>
                                    <div>{a.messagesCount || 0} msgs</div>
                                    {a.attachmentsCount > 0 && (
                                      <div style={{ fontSize: "0.7rem", color: "var(--accent-cyan)" }}>
                                        {a.attachmentsCount} files
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: "10px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                                    {a.closedAt ? new Date(a.closedAt).toLocaleString("en-IN") : "N/A"}
                                  </td>
                                  <td style={{ padding: "10px" }}>
                                    <span
                                      style={{
                                        padding: "2px 7px",
                                        borderRadius: "4px",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        background: a.telegramSent ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                        color: a.telegramSent ? "#34d399" : "#fbbf24",
                                        border: a.telegramSent ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
                                      }}
                                    >
                                      {a.telegramSent ? "✅ Sent (@fsm_chat_bot)" : "🕒 Stored in LibSQL"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "10px", textAlign: "right" }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSingleAudit(a.roomId, a.name)}
                                      className="btn-icon"
                                      style={{
                                        width: "28px",
                                        height: "28px",
                                        background: "rgba(239, 68, 68, 0.15)",
                                        color: "#f87171",
                                        border: "1px solid rgba(239, 68, 68, 0.35)",
                                        borderRadius: "6px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                      }}
                                      title={`Delete audit transcript for "${a.name || a.roomId}"`}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
  );
}
