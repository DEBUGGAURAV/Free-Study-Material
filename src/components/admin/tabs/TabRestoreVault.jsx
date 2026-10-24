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

export default function TabRestoreVault(props) {
  const {
    filteredRecycleItems,
    handleBatchPurge,
    handleBatchRestore,
    handlePermanentDeleteAllItems,
    handlePermanentDeleteItem,
    handleRestoreAllItems,
    handleRestoreItem,
    isHalfAdmin,
    recycleBinItems,
    recycleBinLoading,
    recycleFilter,
    recycleSearch,
    selectedRecycleIds,
    setPreviewNoteInAdmin,
    setRecycleFilter,
    setRecycleSearch,
    setSelectedRecycleIds,
    toggleSelectRecycleItem,
  } = props;

  

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                    Restore Vault (Zero Data Loss Archive)
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "2px 0 0" }}>
                    Safely recover or permanently delete archived study notes, student accounts, and notices.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {selectedRecycleIds.length > 0 && (
                    <>
                      <button
                        onClick={handleBatchRestore}
                        className="btn-primary"
                        style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                      >
                        Restore Selected ({selectedRecycleIds.length})
                      </button>
                      {!isHalfAdmin && (
                        <button
                          onClick={handleBatchPurge}
                          className="btn-danger"
                          style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                        >
                          Purge Selected ({selectedRecycleIds.length})
                        </button>
                      )}
                    </>
                  )}

                  <button
                    onClick={handleRestoreAllItems}
                    className="btn-primary"
                    style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                    disabled={recycleBinItems.length === 0}
                  >
                    ♻️ Restore All Items
                  </button>

                  {!isHalfAdmin && (
                    <button
                      onClick={handlePermanentDeleteAllItems}
                      className="btn-danger"
                      style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                      disabled={recycleBinItems.length === 0}
                    >
                      🗑️ Empty Restore Vault
                    </button>
                  )}
                </div>
              </div>

              {/* Filters & Search */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", minWidth: "260px", flex: 1 }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: "8px 12px 8px 32px", fontSize: "0.82rem" }}
                    placeholder="Search deleted documents by title or subject..."
                    value={recycleSearch}
                    onChange={(e) => setRecycleSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  {["all", "notes", "users", "notices"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setRecycleFilter(f)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        background: recycleFilter === f ? "var(--accent-indigo)" : "rgba(255, 255, 255, 0.05)",
                        color: "#fff",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        cursor: "pointer",
                      }}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recycle Bin Table */}
              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                      <th style={{ padding: "12px 16px", width: "40px" }}>
                        <input
                          type="checkbox"
                          checked={filteredRecycleItems.length > 0 && selectedRecycleIds.length === filteredRecycleItems.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedRecycleIds(filteredRecycleItems.map((x) => x.id));
                            else setSelectedRecycleIds([]);
                          }}
                        />
                      </th>
                      <th style={{ padding: "12px 16px" }}>TYPE &amp; TITLE</th>
                      <th style={{ padding: "12px 16px" }}>ORIGINAL SUBJECT / INFO</th>
                      <th style={{ padding: "12px 16px" }}>DELETION TIMESTAMP</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>RECOVERY ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleBinLoading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                          <div className="spinner" style={{ width: "24px", height: "24px", margin: "0 auto 8px" }} />
                          Loading Restore Vault records...
                        </td>
                      </tr>
                    ) : filteredRecycleItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                          Restore Vault is empty. No deleted records found.
                        </td>
                      </tr>
                    ) : (
                      filteredRecycleItems.map((item) => {
                        const isNote = item.originalCollection === "notes" || item.fileSize || item.compressedSize || item.telegramMessageId;
                        const isSelected = selectedRecycleIds.includes(item.id);

                        return (
                          <tr key={item.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)", background: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent" }}>
                            <td style={{ padding: "12px 16px" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRecycleItem(item.id)}
                              />
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    background: isNote ? "rgba(99, 102, 241, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                    color: isNote ? "#818cf8" : "#fbbf24",
                                  }}
                                >
                                  {isNote ? "NOTE" : (item.originalCollection || "ITEM").toUpperCase()}
                                </span>
                                <span style={{ fontWeight: 700, color: "#fff" }}>
                                  {item.title || item.name || item.id}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                              {item.subject || item.email || item.branch || "Archived Data"}
                            </td>
                            <td style={{ padding: "12px 16px", color: "var(--text-dim)" }}>
                              {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : "Recently Archived"}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "6px" }}>
                                {isNote && (
                                  <button
                                    onClick={() => setPreviewNoteInAdmin(item)}
                                    className="btn-icon"
                                    style={{ width: "32px", height: "32px", background: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}
                                    title="Preview Document with Mozilla PDF Engine"
                                  >
                                    <Eye size={15} />
                                  </button>
                                )}

                                <button
                                  onClick={() => handleRestoreItem(item.id)}
                                  className="btn-primary"
                                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                                  title="Restore to Live Database"
                                >
                                  ♻️ Restore
                                </button>

                                {!isHalfAdmin && (
                                  <button
                                    onClick={() => handlePermanentDeleteItem(item.id)}
                                    className="btn-danger"
                                    style={{ padding: "6px 10px", fontSize: "0.78rem" }}
                                    title="Purge Forever"
                                  >
                                    ✕
                                  </button>
                                )}
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
