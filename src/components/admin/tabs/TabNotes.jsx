import React, { useState, useEffect, useRef } from "react";
import {
  X, Mail, Shield, Trash2, Eye, EyeOff, Edit3, UserCheck, UserX, Activity,
  Search, CheckCircle, Clock, ChevronLeft, ChevronRight, Save, RefreshCw,
  Database, Cpu, Server, HardDrive, Globe, Code, Cloud, Send, Download,
  Upload, Zap, Inbox, Key, Monitor, ShieldCheck, ShieldAlert, Filter, Bot,
  Bell, BellOff, Power, AlertTriangle, Flame, Check, Share2, Wifi, Sparkles,
  FileText, Sliders, Layers, Scissors, RotateCcw, Megaphone, Plus, Lock,
  MessageSquare, Crown, Paperclip, Volume2, Radio, Bug
} from "lucide-react";
import { api, getAuthToken } from "../../../api";
import { formatFileSize, formatMB } from "../../../utils/formatUtils";
import { detectClientHardwareProfile } from "../../../utils/hardwareAdaptiveEngine";
import VirtualPdfReader from "../../VirtualPdfReader";

export default function TabNotes(props) {
  const {
    activeDownloadsCount,
    adminNoteSearch,
    bulkDownloadLoading,
    currentAllowNotesDownload,
    downloadGateLoading,
    filteredNotes,
    formatSyncTime,
    handleBulkToggleDownload,
    handleDeleteNote,
    handleStartEditNote,
    handleTelegramSync,
    handleToggleCompleteNotesDownload,
    handleToggleNoteDownload,
    handleToggleVisibility,
    isHalfAdmin,
    lastSyncInfo,
    lockedDownloadsCount,
    noteDownloadFilter,
    noteOverrides,
    notes,
    setAdminNoteSearch,
    setNoteDownloadFilter,
    setPreviewNoteInAdmin,
    setShowDeleteAllModal,
    stats,
    syncingTelegram,
  } = props;

  

  return (
            <div>
              {/* Complete Notes Download Master Gate Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: (currentAllowNotesDownload) ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  border: `1.5px solid ${(currentAllowNotesDownload) ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
                  borderRadius: "10px",
                  padding: "12px 18px",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: (currentAllowNotesDownload) ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                      color: (currentAllowNotesDownload) ? "#34d399" : "#f87171",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Download size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span>Complete Notes Download Gate:</span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          padding: "3px 9px",
                          borderRadius: "4px",
                          background: (currentAllowNotesDownload) ? "#10b981" : "#ef4444",
                          color: "#000",
                        }}
                      >
                        {(currentAllowNotesDownload) ? "✅ COMPLETE NOTES DOWNLOAD ENABLED" : "⛔ ALL NOTES DOWNLOAD DISABLED (PAUSED)"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "3px" }}>
                      {(currentAllowNotesDownload)
                        ? "Platform-wide notes are active for student download. Individual notes can also be specifically paused in the table below."
                        : "Complete platform notes download is paused. Students can only study in the Online PDF Reader; direct download is locked."}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleToggleCompleteNotesDownload}
                  disabled={downloadGateLoading}
                  style={{
                    padding: "8px 18px",
                    fontSize: "0.82rem",
                    fontWeight: 800,
                    borderRadius: "8px",
                    background: (currentAllowNotesDownload) ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)",
                    border: `1.5px solid ${(currentAllowNotesDownload) ? "#ef4444" : "#10b981"}`,
                    color: (currentAllowNotesDownload) ? "#f87171" : "#34d399",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Power size={15} />
                  <span>
                    {downloadGateLoading
                      ? "Updating Gate..."
                      : currentAllowNotesDownload
                      ? "⛔ Pause Complete Notes Download"
                      : "✅ Enable Complete Notes Download"}
                  </span>
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", minWidth: "280px", flex: 1 }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: "9px 12px 9px 36px", fontSize: "0.85rem" }}
                    placeholder="Search note vault by title, subject, branch, or course..."
                    value={adminNoteSearch}
                    onChange={(e) => setAdminNoteSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={handleTelegramSync}
                    className="btn-secondary"
                    disabled={syncingTelegram}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                    title="Two-way sync between Telegram MTProto storage channel and Firestore"
                  >
                    {syncingTelegram ? <RefreshCw size={14} className="spinner" /> : <RefreshCw size={14} />}
                    <span>{syncingTelegram ? "Syncing..." : "Sync Telegram Channel"}</span>
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
                    {(lastSyncInfo?.trigger || stats?.lastSync?.trigger) && (
                      <span style={{ color: "#34d399", fontWeight: 600, fontSize: "0.72rem" }}>
                        • {lastSyncInfo?.trigger || stats?.lastSync?.trigger}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleTelegramSync}
                      disabled={syncingTelegram}
                      style={{
                        background: "rgba(6, 182, 212, 0.15)",
                        border: "1px solid rgba(6, 182, 212, 0.35)",
                        color: "var(--accent-cyan)",
                        borderRadius: "6px",
                        padding: "2px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        marginLeft: "6px",
                      }}
                      title="Run Two-Way Sync Now"
                    >
                      {syncingTelegram ? "Syncing..." : "🔄 Sync Now"}
                    </button>
                  </div>

                  {!isHalfAdmin && (
                    <button
                      onClick={() => setShowDeleteAllModal(true)}
                      className="btn-danger"
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                    >
                      <Trash2 size={14} />
                      <span>Move All Notes to Restore Vault</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Note Download Permissions Filter & Bulk Actions Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                  padding: "10px 14px",
                  background: "rgba(15, 23, 42, 0.65)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "14px",
                }}
              >
                {/* Download Filter Pills */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Filter By Download:
                  </span>
                  <button
                    type="button"
                    onClick={() => setNoteDownloadFilter("all")}
                    style={{
                      background: noteDownloadFilter === "all" ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.04)",
                      border: `1px solid ${noteDownloadFilter === "all" ? "#818cf8" : "rgba(255, 255, 255, 0.08)"}`,
                      color: noteDownloadFilter === "all" ? "#c7d2fe" : "var(--text-muted)",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    All ({notes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteDownloadFilter("active")}
                    style={{
                      background: noteDownloadFilter === "active" ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.04)",
                      border: `1px solid ${noteDownloadFilter === "active" ? "#34d399" : "rgba(255, 255, 255, 0.08)"}`,
                      color: noteDownloadFilter === "active" ? "#6ee7b7" : "var(--text-muted)",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399" }}></span>
                    Downloads Active ({activeDownloadsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteDownloadFilter("locked")}
                    style={{
                      background: noteDownloadFilter === "locked" ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.04)",
                      border: `1px solid ${noteDownloadFilter === "locked" ? "#f87171" : "rgba(255, 255, 255, 0.08)"}`,
                      color: noteDownloadFilter === "locked" ? "#fca5a5" : "var(--text-muted)",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Lock size={11} style={{ color: "#f87171" }} />
                    Downloads Locked ({lockedDownloadsCount})
                  </button>
                </div>

                {/* Bulk Actions for Filtered Notes */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => handleBulkToggleDownload(false)}
                    disabled={bulkDownloadLoading || filteredNotes.length === 0}
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      color: "#f87171",
                      padding: "5px 12px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: (bulkDownloadLoading || filteredNotes.length === 0) ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      opacity: (bulkDownloadLoading || filteredNotes.length === 0) ? 0.5 : 1,
                    }}
                    title={`Lock/Pause downloads for all ${filteredNotes.length} matching notes`}
                  >
                    <Lock size={12} />
                    <span>{bulkDownloadLoading ? "Updating..." : `Lock Filtered (${filteredNotes.length})`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkToggleDownload(true)}
                    disabled={bulkDownloadLoading || filteredNotes.length === 0}
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      color: "#34d399",
                      padding: "5px 12px",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: (bulkDownloadLoading || filteredNotes.length === 0) ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      opacity: (bulkDownloadLoading || filteredNotes.length === 0) ? 0.5 : 1,
                    }}
                    title={`Enable downloads for all ${filteredNotes.length} matching notes`}
                  >
                    <Download size={12} />
                    <span>{bulkDownloadLoading ? "Updating..." : `Enable Filtered (${filteredNotes.length})`}</span>
                  </button>
                </div>
              </div>

              {/* Notes Table */}
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                      <th style={{ padding: "12px 16px" }}>DOCUMENT TITLE &amp; SUBJECT</th>
                      <th style={{ padding: "12px 16px" }}>BRANCH &amp; COURSE</th>
                      <th style={{ padding: "12px 16px" }}>COMPRESSED SIZE</th>
                      <th style={{ padding: "12px 16px" }}>DOWNLOADS</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotes.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                          No notes found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredNotes.map((rawNote) => {
                        const override = noteOverrides[rawNote.id];
                        const note = override ? { ...rawNote, ...override } : rawNote;
                        return (
                        <tr key={note.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <td style={{ padding: "12px 16px", maxWidth: "340px" }}>
                            <div style={{ fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={note.title}>
                              {note.title}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <span>{note.subject || "General Academic"}</span>
                              {note.telegramMessageId && (
                                <span style={{ color: "#38bdf8", fontWeight: 700 }}>• ✈️ #{note.telegramMessageId}</span>
                              )}
                              {note.isDuplicate && (
                                <span className="tech-pill dedup" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>⚡ Dedup</span>
                              )}
                              {note.foundViaOcr && (
                                <span className="tech-pill compress" style={{ fontSize: "0.65rem", padding: "1px 5px" }}>🔍 OCR</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span className="tech-pill branch">{note.branch || "CSE"}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "6px" }}>
                              {note.course || "B.Tech"} • {note.year || note.semester || "All"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>
                            {formatFileSize(note.compressedSize || note.fileSize)}
                            {note.savingsPercent > 0 && (
                              <span style={{ color: "#34d399", fontSize: "0.72rem", marginLeft: "6px", fontWeight: 700 }}>
                                (-{note.savingsPercent}%)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ color: "var(--text-dim)", fontWeight: 700 }}>{note.downloadsCount || 0}</span>
                              {(() => {
                                const currentAllow = noteOverrides[note.id]?.allowDownload !== undefined ? noteOverrides[note.id].allowDownload : note.allowDownload;
                                const isLocked = currentAllow === false || String(currentAllow) === "false" || currentAllow === 0 || String(currentAllow) === "0";
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleNoteDownload(note)}
                                    style={{
                                      fontSize: "0.68rem",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                      background: isLocked ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.15)",
                                      color: isLocked ? "#f87171" : "#34d399",
                                      border: isLocked ? "1px solid rgba(239, 68, 68, 0.45)" : "1px solid rgba(34, 197, 94, 0.35)",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                      transition: "all 0.15s ease",
                                    }}
                                    title={isLocked ? "Downloads Locked for this note. Click to Enable!" : "Downloads Active for this note. Click to Lock!"}
                                  >
                                    {isLocked ? (
                                      <>
                                        <Lock size={10} />
                                        <span>Locked</span>
                                      </>
                                    ) : (
                                      <>
                                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#34d399" }}></span>
                                        <span>Active</span>
                                      </>
                                    )}
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              {(() => {
                                const currentAllow = noteOverrides[note.id]?.allowDownload !== undefined ? noteOverrides[note.id].allowDownload : note.allowDownload;
                                const isLocked = currentAllow === false || String(currentAllow) === "false" || currentAllow === 0 || String(currentAllow) === "0";
                                return (
                                  <button
                                    onClick={() => handleToggleNoteDownload(note)}
                                    className="btn-icon"
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      background: isLocked ? "rgba(239, 68, 68, 0.18)" : "rgba(34, 197, 94, 0.14)",
                                      color: isLocked ? "#f87171" : "#34d399",
                                      border: `1px solid ${isLocked ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.3)"}`,
                                    }}
                                    title={isLocked ? "Downloads Paused for this note. Click to Enable." : "Downloads Active for this note. Click to Pause."}
                                  >
                                    {isLocked ? <Lock size={14} /> : <Download size={14} />}
                                  </button>
                                );
                              })()}

                              <button
                                onClick={() => handleToggleVisibility(note.id, note.isVisible !== false)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(255, 255, 255, 0.05)" }}
                                title={note.isVisible !== false ? "Hide Note" : "Show Note"}
                              >
                                {note.isVisible !== false ? <Eye size={15} style={{ color: "var(--accent-cyan)" }} /> : <EyeOff size={15} style={{ color: "#f87171" }} />}
                              </button>

                              <button
                                onClick={() => setPreviewNoteInAdmin(note)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}
                                title="Inspect Document with Mozilla PDF Engine"
                              >
                                <Eye size={15} />
                              </button>

                              <button
                                onClick={() => handleStartEditNote(note)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(255, 255, 255, 0.05)" }}
                                title="Edit Metadata"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(244, 63, 94, 0.1)", color: "#f43f5e" }}
                                title="Move to Restore Vault"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  </tbody>
                </table>
              </div>
            </div>
  );
}
