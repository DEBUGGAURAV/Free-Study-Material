import React, { useState, useEffect, useRef } from "react";
import {
  X, Mail, Shield, Trash2, Eye, EyeOff, Edit3, UserCheck, UserX, Activity,
  Search, CheckCircle, Clock, ChevronLeft, ChevronRight, Save, RefreshCw,
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

  const [studentPruning, setStudentPruning] = useState(false);
  const [studentPruneDays, setStudentPruneDays] = useState(7);
  const [studentActionMsg, setStudentActionMsg] = useState(null);

  const handlePruneStudent = async (days, target) => {
    if (!window.confirm(`Clean student session & telemetry data (${target}) older than ${days} days?`)) return;
    setStudentPruning(true);
    setStudentActionMsg(null);
    try {
      const res = await api.pruneStudentTursoSessions(days, target);
      if (res?.success) {
        setStudentActionMsg({ type: "success", text: res.message || "Cleaned successfully." });
        if (typeof loadTursoData === "function") loadTursoData();
      } else {
        setStudentActionMsg({ type: "error", text: res?.message || "Failed to prune student telemetry." });
      }
    } catch (err) {
      setStudentActionMsg({ type: "error", text: "Error: " + err.message });
    } finally {
      setStudentPruning(false);
    }
  };

  const handleWipeRevoked = async () => {
    if (!window.confirm("Instantly delete all revoked session records from the student Turso database?")) return;
    setStudentPruning(true);
    setStudentActionMsg(null);
    try {
      const res = await api.cleanRevokedStudentSessions();
      if (res?.success) {
        setStudentActionMsg({ type: "success", text: res.message || "All revoked sessions wiped cleanly." });
        if (typeof loadTursoData === "function") loadTursoData();
      } else {
        setStudentActionMsg({ type: "error", text: res?.message || "Failed to wipe revoked sessions." });
      }
    } catch (err) {
      setStudentActionMsg({ type: "error", text: "Error: " + err.message });
    } finally {
      setStudentPruning(false);
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
              </div>

              {/* 🎓 Student Sessions & Telemetry Edge Vault (New Turso Database) */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.55)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px",
                  marginBottom: "20px",
                }}
              >
                {studentActionMsg && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginBottom: "12px",
                      fontSize: "0.8rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: studentActionMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      border: studentActionMsg.type === "success" ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(239, 68, 68, 0.35)",
                      color: studentActionMsg.type === "success" ? "#34d399" : "#fca5a5",
                    }}
                  >
                    <span>{studentActionMsg.text}</span>
                    <button
                      onClick={() => setStudentActionMsg(null)}
                      style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <h4 style={{ fontWeight: 800, color: "#fff", fontSize: "0.98rem", margin: 0 }}>
                          Student Sessions &amp; Security Telemetry Vault (New Turso DB)
                        </h4>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontWeight: 700,
                            background: tursoStatus?.studentVault?.connected
                              ? "rgba(16, 185, 129, 0.15)"
                              : "rgba(245, 158, 11, 0.15)",
                            color: tursoStatus?.studentVault?.connected ? "#34d399" : "#fbbf24",
                            border: tursoStatus?.studentVault?.connected
                              ? "1px solid rgba(16, 185, 129, 0.35)"
                              : "1px solid rgba(245, 158, 11, 0.35)",
                          }}
                        >
                          {tursoStatus?.studentVault?.isCloud ? "🟢 Cloud LibSQL (Student Vault)" : "🟡 Local Standby Engine"}
                        </span>
                        {tursoStatus?.studentVault?.latencyMs !== undefined && (
                          <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 600 }}>
                            ⚡ {tursoStatus.studentVault.latencyMs}ms Latency
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                        Tracks active multi-device logins, remote session kills, and 10-log rolling security events with zero Firestore read bloat.
                      </div>
                    </div>
                  </div>

                  <code style={{ fontSize: "0.74rem", color: "#38bdf8", background: "rgba(0,0,0,0.35)", padding: "4px 8px", borderRadius: "6px" }}>
                    {tursoStatus?.studentVault?.databaseUrl || "TURSO_STUDENT_DATABASE_URL"}
                  </code>
                </div>

                {/* Metrics Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "14px" }}>
                  <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                      Active Student Sessions
                    </div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#34d399", marginTop: "2px" }}>
                      {(tursoStatus?.studentVault?.activeSessionsCount ?? 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#34d399", marginTop: "2px" }}>
                      Active Devices / Browsers
                    </div>
                  </div>

                  <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                      Revoked Sessions
                    </div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#f87171", marginTop: "2px" }}>
                      {(tursoStatus?.studentVault?.revokedSessionsCount ?? 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#f87171", marginTop: "2px" }}>
                      Terminated / Killed Devices
                    </div>
                  </div>

                  <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
                      Security Activity Logs
                    </div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#c084fc", marginTop: "2px" }}>
                      {(tursoStatus?.studentVault?.securityLogsCount ?? 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#c084fc", marginTop: "2px" }}>
                      Rolling Ring-Buffer Events
                    </div>
                  </div>
                </div>

                {/* Maintenance & Clean Controls */}
                <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>Retention:</span>
                    <select
                      value={studentPruneDays}
                      onChange={(e) => setStudentPruneDays(Number(e.target.value))}
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        borderRadius: "6px",
                        padding: "5px 8px",
                        fontSize: "0.76rem",
                      }}
                    >
                      <option value={3}>Older than 3 Days</option>
                      <option value={7}>Older than 7 Days (Recommended)</option>
                      <option value={14}>Older than 14 Days</option>
                      <option value={30}>Older than 30 Days</option>
                    </select>

                    <button
                      type="button"
                      disabled={studentPruning}
                      onClick={() => handlePruneStudent(studentPruneDays, "sessions")}
                      className="btn-secondary"
                      style={{
                        fontSize: "0.76rem",
                        padding: "6px 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        borderColor: "rgba(56, 189, 248, 0.35)",
                        color: "#38bdf8",
                        cursor: studentPruning ? "not-allowed" : "pointer",
                      }}
                      title="Clean stale active sessions older than retention days"
                    >
                      <Trash2 size={13} className={studentPruning ? "spin" : ""} />
                      <span>{studentPruning ? "Cleaning..." : `Clean Sessions (>${studentPruneDays}d)`}</span>
                    </button>

                    <button
                      type="button"
                      disabled={studentPruning}
                      onClick={() => handlePruneStudent(studentPruneDays, "logs")}
                      className="btn-secondary"
                      style={{
                        fontSize: "0.76rem",
                        padding: "6px 12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        borderColor: "rgba(168, 85, 247, 0.35)",
                        color: "#c084fc",
                        cursor: studentPruning ? "not-allowed" : "pointer",
                      }}
                      title="Prune security logs older than retention days"
                    >
                      <Activity size={13} className={studentPruning ? "spin" : ""} />
                      <span>{studentPruning ? "Pruning..." : `Prune Logs (>${studentPruneDays}d)`}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={studentPruning}
                    onClick={handleWipeRevoked}
                    className="btn-danger"
                    style={{
                      fontSize: "0.76rem",
                      padding: "6px 14px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(239, 68, 68, 0.18)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#fca5a5",
                      cursor: studentPruning ? "not-allowed" : "pointer",
                      borderRadius: "6px",
                      fontWeight: 700,
                    }}
                    title="Instantly wipe all revoked sessions from the student database"
                  >
                    <Flame size={13} className={studentPruning ? "spin" : ""} />
                    <span>Clean All Revoked Sessions</span>
                  </button>
                </div>
              </div>

              {/* Forensic Audits Table for Private Study Pods */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.5)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ShieldAlert size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>Private Study Pod Forensic Audits (Turso Vault)</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Permanent compliance transcripts of closed private study rooms</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                      style={{ fontSize: "0.76rem", padding: "5px 11px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    >
                      <RefreshCw size={12} className={tursoAuditsLoading ? "spin" : ""} />
                      <span>{tursoAuditsLoading ? "Loading..." : "Refresh Audits"}</span>
                    </button>
                  </div>
                </div>

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
              </div>
            </div>
  );
}
