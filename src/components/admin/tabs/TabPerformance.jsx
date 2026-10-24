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

export default function TabPerformance(props) {
  const {
    cdnFiles,
    cdnSearch,
    cdnStats,
    handlePurgeCdn,
    handlePurgeEdgeOnly,
    handlePurgeNoteCdn,
    handlePurgeRamOnly,
    handlePurgeSingleCdnFile,
    handleSaveRetention,
    manualNoteIdToPurge,
    retentionDays,
    setActiveTab,
    setCdnSearch,
    setManualNoteIdToPurge,
    setRetentionDays,
    setShowAllCdnFiles,
    showAllCdnFiles,
  } = props;

  

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                    Cloudflare CDN &amp; Memory Acceleration
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "2px 0 0" }}>
                    Global edge caching, cache invalidation, and memory garbage collection.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={handlePurgeRamOnly}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "rgba(16, 185, 129, 0.4)", color: "#34d399", fontWeight: 700 }}
                    title="Purge only Node.js in-memory LRU RAM buffer"
                  >
                    <Trash2 size={13} />
                    <span>🧹 Purge RAM Only</span>
                  </button>

                  <button
                    onClick={handlePurgeEdgeOnly}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "rgba(6, 182, 212, 0.4)", color: "var(--accent-cyan)", fontWeight: 700 }}
                    title="Purge Cloudflare Edge CDN & Worker cache across all PoPs"
                  >
                    <Zap size={13} />
                    <span>⚡ Purge Edge CDN &amp; Worker</span>
                  </button>

                  <button
                    onClick={handlePurgeCdn}
                    className="btn-danger"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 14px", fontWeight: 800 }}
                    title="Purge All Keys globally across Cloudflare Edge, Worker & RAM Cache"
                  >
                    <Flame size={14} />
                    <span>🔥 Purge All (RAM + Edge)</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab("turso");
                    }}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "rgba(239, 68, 68, 0.4)", color: "#fca5a5", fontWeight: 700 }}
                    title="Open Turso Cache Delete Controller by Days"
                  >
                    <Trash2 size={13} />
                    <span>🗑️ Turso Cache (By Days)</span>
                  </button>
                </div>
              </div>

              {/* Cloudflare CDN Storage & Retention Policy Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                {/* Storage Breakdown Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(6, 182, 212, 0.25)", borderRadius: "var(--radius-lg)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <HardDrive size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>CDN &amp; RAM Storage Breakdown</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 700 }}>Live Capacity Utilization &amp; Allocation</div>
                      </div>
                    </div>

                    <button
                      onClick={handlePurgeCdn}
                      className="btn-danger"
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.74rem", padding: "5px 10px" }}
                      title="Empty and clear all cache entries immediately"
                    >
                      <Trash2 size={13} />
                      <span>Empty Cache Pool</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
                    {/* In-Memory RAM Cache */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text-dim)" }}>In-Memory RAM Cache Pool:</span>
                        <span style={{ color: "#34d399", fontWeight: 700 }}>
                          {(cdnStats?.ramUsedMB ?? 0).toFixed(1)} MB / 500 MB ({Math.min(100, Math.round(((cdnStats?.ramUsedMB ?? 0) / 500) * 100))}% used)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, Math.max((cdnStats?.ramUsedMB ?? 0) > 0 ? 3 : 0, (((cdnStats?.ramUsedMB ?? 0) / 500) * 100)))}%`, height: "100%", background: "#10b981", borderRadius: "999px" }} />
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "2px" }}>
                        Dedicated 500 MB high-speed memory pool for microsecond document streaming without disk access.
                      </div>
                    </div>

                    {/* Cloudflare Edge CDN Storage Used */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text-dim)" }}>Cloudflare Edge CDN Space Used:</span>
                        <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                          {cdnStats?.edgeCdn?.formattedUsed || "0.0 MB"} Cached (Indian Anycast: BOM / DEL)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${(cdnStats?.edgeCdn?.storageUsedMB || 0) > 0 ? "99.4%" : "0%"}`, height: "100%", background: "linear-gradient(90deg, #06b6d4, #3b82f6)", borderRadius: "999px" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "3px" }}>
                        <span>Capacity: Unlimited Dynamic NVMe SSD Pool ({cdnStats?.edgeCdn?.pdfCount ?? cdnStats?.edgeCdn?.cachedFilesCount ?? 0} Vault PDFs • {cdnStats?.edgeCdn?.imgCount ?? 0} Images / Media)</span>
                        <span style={{ color: "#34d399", fontWeight: 700 }}>Bandwidth Offload: {cdnStats?.edgeCdn?.totalBandwidthSaved || "0.00 MB"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cache Retention & Purge Policy Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(139, 92, 246, 0.25)", borderRadius: "var(--radius-lg)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>Retention Policy &amp; Eviction Lifecycle</div>
                      <div style={{ fontSize: "0.72rem", color: "#a78bfa", fontWeight: 700 }}>Automated &amp; Configurable Cache Lifetime</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "8px 10px", borderRadius: "8px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Automated Retention:</span>
                      <span style={{ color: "#34d399", fontWeight: 800, background: "rgba(16,185,129,0.15)", padding: "2px 8px", borderRadius: "999px", border: "1px solid rgba(16,185,129,0.3)" }}>
                        365 Days Rolling (1 Year Edge TTL)
                      </span>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ color: "var(--text-dim)" }}>Configurable Retention Slider:</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: "0.86rem" }}>
                            {retentionDays >= 365
                              ? "365 Days (1 Full Year 🌟)"
                              : retentionDays >= 30
                              ? `${retentionDays} Days (~${Math.round(retentionDays / 30)} Mo)`
                              : `${retentionDays} Days`}
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={retentionDays}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setRetentionDays(Math.max(1, Math.min(365, val)));
                            }}
                            style={{
                              width: "60px",
                              padding: "2px 6px",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              textAlign: "center",
                              background: "rgba(0,0,0,0.4)",
                              border: "1px solid rgba(167, 139, 250, 0.4)",
                              borderRadius: "6px",
                              color: "#fbbf24",
                            }}
                            title="Enter exact retention days (1-365)"
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="range"
                          min="1"
                          max="365"
                          value={retentionDays}
                          onChange={(e) => setRetentionDays(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#a78bfa", cursor: "pointer" }}
                        />
                        <button
                          onClick={() => handleSaveRetention()}
                          className="btn-secondary"
                          style={{
                            padding: "5px 14px",
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            background: "rgba(139, 92, 246, 0.2)",
                            border: "1px solid #8b5cf6",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Apply Retention
                        </button>
                      </div>

                      {/* Fast Preset Option Chips */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px" }}>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginRight: "2px" }}>Quick Presets:</span>
                        {[
                          { days: 7, label: "7 Days" },
                          { days: 30, label: "30 Days (1 Mo)" },
                          { days: 90, label: "90 Days (3 Mo)" },
                          { days: 180, label: "180 Days (6 Mo)" },
                          { days: 365, label: "365 Days (1 Year 🌟)" },
                        ].map((preset) => {
                          const isSelected = retentionDays === preset.days;
                          return (
                            <button
                              key={preset.days}
                              type="button"
                              onClick={() => {
                                setRetentionDays(preset.days);
                              }}
                              style={{
                                padding: "3px 9px",
                                fontSize: "0.72rem",
                                fontWeight: isSelected ? 800 : 600,
                                borderRadius: "6px",
                                border: isSelected
                                  ? "1px solid #a78bfa"
                                  : "1px solid rgba(255,255,255,0.1)",
                                background: isSelected
                                  ? "rgba(167, 139, 250, 0.28)"
                                  : "rgba(255,255,255,0.04)",
                                color: isSelected ? "#fff" : "var(--text-dim)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "8px" }}>
                        Adjustable from <strong>1 to 365 Days (1 Full Year)</strong>. Recommended: <strong>365 Days</strong> for permanent campus edge persistence, or <strong>7 to 30 Days</strong> for rapid rotation.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CDN KPIs - 4 Columns Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                {/* Edge CDN Storage Used Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(6, 182, 212, 0.35)", borderRadius: "var(--radius-md)", padding: "14px" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 700, textTransform: "uppercase" }}>Edge CDN Space Used</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "2px" }}>
                    {cdnStats?.edgeCdn?.formattedUsed || "0.0 MB"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#34d399", marginTop: "4px", fontWeight: 600 }}>
                    Bandwidth Saved: {cdnStats?.edgeCdn?.totalBandwidthSaved || "0.00 MB"}
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "14px" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Edge Hit Ratio</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#34d399", marginTop: "2px" }}>
                    {cdnStats?.hitRatio || "0%"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
                    Hits: {cdnStats?.hits ?? 0} • Misses: {cdnStats?.misses ?? 0}
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "14px" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Cached Vault Documents</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#a78bfa", marginTop: "2px" }}>
                    {cdnStats?.edgeCdn?.cachedFilesCount ?? (cdnStats?.edgeCdn?.isPurged ? 0 : cdnFiles.length)}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "4px" }}>
                    Active Across 300+ Edge Cities
                  </div>
                </div>

                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "14px" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Targeted Note Cache Purge</div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: "6px 10px", fontSize: "0.78rem", flex: 1 }}
                      placeholder="Enter Note ID..."
                      value={manualNoteIdToPurge}
                      onChange={(e) => setManualNoteIdToPurge(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        handlePurgeNoteCdn(manualNoteIdToPurge);
                        setManualNoteIdToPurge("");
                      }}
                      className="btn-primary"
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    >
                      Purge
                    </button>
                  </div>
                </div>
              </div>

              {/* Granular Cached Files Table with Search Bar & 10 Notes Limit */}
              {(() => {
                const filteredCdn = cdnFiles.filter((file) => {
                  if (!cdnSearch.trim()) return true;
                  const q = cdnSearch.toLowerCase().trim();
                  return (
                    (file.noteId && file.noteId.toLowerCase().includes(q)) ||
                    (file.title && file.title.toLowerCase().includes(q)) ||
                    (file.originalName && file.originalName.toLowerCase().includes(q))
                  );
                });
                const displayCdn = showAllCdnFiles ? filteredCdn : filteredCdn.slice(0, 10);

                return (
                  <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                    {/* Header Bar with Realtime Search */}
                    <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#fff", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>Cached Documents in Edge LRU RAM</span>
                        <span style={{ fontSize: "0.72rem", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)", border: "1px solid rgba(6, 182, 212, 0.3)", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>
                          📄 {cdnFiles.filter((f) => f.fileType !== "image").length} PDFs
                        </span>
                        <span style={{ fontSize: "0.72rem", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>
                          🖼️ {cdnFiles.filter((f) => f.fileType === "image").length} Images
                        </span>
                      </div>

                      <div style={{ position: "relative", minWidth: "260px" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                        <input
                          type="text"
                          value={cdnSearch}
                          onChange={(e) => setCdnSearch(e.target.value)}
                          placeholder="Search cached note by title or ID..."
                          style={{
                            width: "100%",
                            padding: "6px 12px 6px 32px",
                            borderRadius: "6px",
                            background: "rgba(0, 0, 0, 0.4)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            color: "#fff",
                            fontSize: "0.78rem",
                          }}
                        />
                      </div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                      <thead>
                        <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                          <th style={{ padding: "10px 16px" }}>KEY / NOTE ID</th>
                          <th style={{ padding: "10px 16px" }}>TYPE</th>
                          <th style={{ padding: "10px 16px" }}>DOCUMENT TITLE</th>
                          <th style={{ padding: "10px 16px" }}>CACHED SIZE</th>
                          <th style={{ padding: "10px 16px", textAlign: "right" }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayCdn.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                              {cdnSearch.trim() ? "No cached documents match your search query." : "No files currently cached in in-memory RAM pool."}
                            </td>
                          </tr>
                        ) : (
                          displayCdn.map((file) => (
                            <tr key={file.noteId} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                              <td style={{ padding: "10px 16px", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                                {file.noteId}
                              </td>
                              <td style={{ padding: "10px 16px" }}>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    padding: "2px 7px",
                                    borderRadius: "4px",
                                    fontWeight: 700,
                                    background: file.fileType === "image" ? "rgba(245, 158, 11, 0.18)" : "rgba(6, 182, 212, 0.18)",
                                    color: file.fileType === "image" ? "#fbbf24" : "var(--accent-cyan)",
                                    border: file.fileType === "image" ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(6, 182, 212, 0.35)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  {file.typeLabel || (file.fileType === "image" ? "🖼️ IMG" : "📄 PDF")}
                                </span>
                              </td>
                              <td style={{ padding: "10px 16px", color: "#fff", fontWeight: 600 }}>
                                {file.title || "Academic Material"}
                              </td>
                              <td style={{ padding: "10px 16px", color: "var(--text-dim)" }}>
                                {file.sizeFormatted || (file.size ? `${(file.size / 1048576).toFixed(2)} MB` : "Dynamic")}
                              </td>
                              <td style={{ padding: "10px 16px", textAlign: "right" }}>
                                <button
                                  onClick={() => handlePurgeSingleCdnFile(file.noteId)}
                                  className="btn-danger"
                                  style={{ padding: "4px 10px", fontSize: "0.72rem" }}
                                >
                                  Purge Key
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {/* Pagination / Expand Footer (10 Notes Default) */}
                    {filteredCdn.length > 10 && (
                      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>
                          Showing <strong>{displayCdn.length}</strong> of <strong>{filteredCdn.length}</strong> cached documents
                        </span>
                        <button
                          onClick={() => setShowAllCdnFiles(!showAllCdnFiles)}
                          className="btn-secondary"
                          style={{ padding: "5px 14px", fontSize: "0.76rem", fontWeight: 700 }}
                        >
                          {showAllCdnFiles ? "▲ Show Top 10 Only" : `▼ Show All (${filteredCdn.length} Cached Notes)`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
  );
}
