import React, { useState, useEffect, useRef } from "react";
import {
  X, Shield, Trash2, Search, Clock, Save, RefreshCw,
  Database, Cpu, Server, HardDrive, Globe, Cloud, Download,
  Upload, Zap, ShieldCheck, Flame, Check, Share2, Wifi, Sparkles,
  FileText, Sliders, Layers, Scissors, RotateCcw, Lock, QrCode, Camera
} from "lucide-react";
import { api } from "../../../api";
import { detectClientHardwareProfile } from "../../../utils/hardwareAdaptiveEngine";

export default function TabTechNexus(props) {
  const {
    handlePrewarmPopular,
    handlePurgeMemoryCache,
    handleToggleTechSetting,
    handleUpdateTechValue,
    loadTechNexus,
    maintenanceMode,
    renderMaintenanceControlCard,
    saveTechSettings,
    setTechActionMsg,
    setTechSettings,
    techActionMsg,
    techLoading,
    techSaving,
    techSettings,
    techTelemetry,
  } = props;

  const [sweepLoading, setSweepLoading] = useState(false);

  const handleVarianceMbChange = (val) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const bytes = Math.round(num * 1024 * 1024);
      setTechSettings((prev) => ({
        ...prev,
        dedupMaxVarianceMB: num,
        dedupMaxVarianceBytes: bytes,
      }));
    } else {
      setTechSettings((prev) => ({
        ...prev,
        dedupMaxVarianceMB: val,
      }));
    }
  };

  const handleVarianceBytesChange = (val) => {
    const bytes = parseInt(val, 10);
    if (!isNaN(bytes) && bytes >= 0) {
      const mb = parseFloat((bytes / (1024 * 1024)).toFixed(2));
      setTechSettings((prev) => ({
        ...prev,
        dedupMaxVarianceMB: mb,
        dedupMaxVarianceBytes: bytes,
      }));
    } else {
      setTechSettings((prev) => ({
        ...prev,
        dedupMaxVarianceBytes: val,
      }));
    }
  };

  const handleRunDedupSweep = async () => {
    if (
      !window.confirm(
        "Run Automated Database Deduplication Sweep?\n\nThis will scan all study materials in Firestore and archive redundant duplicate copies based on your configured size variance tolerance limit."
      )
    )
      return;
    setSweepLoading(true);
    try {
      const res = await api.runDeduplicationSweep();
      if (res && res.success) {
        setTechActionMsg(
          `✅ Deduplication sweep complete! ${res.cleanedCount || 0} duplicate files consolidated & storage reclaimed.`
        );
        if (typeof loadTechNexus === "function") loadTechNexus();
      } else {
        setTechActionMsg("Sweep notice: " + (res?.message || "Finished"));
      }
    } catch (err) {
      setTechActionMsg("❌ Deduplication sweep error: " + err.message);
    } finally {
      setSweepLoading(false);
      setTimeout(() => setTechActionMsg(""), 6000);
    }
  };

  const currentDedupMB = Number(techSettings.dedupMaxVarianceMB ?? 3);
  const currentDedupBytes = Number(techSettings.dedupMaxVarianceBytes ?? (currentDedupMB * 1024 * 1024));

  const isAirDropOn = techSettings.enableP2pAirDrop !== false;
  const isQrMeshOn = techSettings.enableQrMeshConnect !== false;

  return (
            <div>
              {/* Header Bar */}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--accent-cyan)" }}>🧬</span> Next-Gen Technology Nexus (Mission Control)
                    </h3>
                    <span
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        color: "#10b981",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      ⚡ 15 Technologies Integrated
                    </span>
                    <span
                      style={{
                        background: "rgba(6, 182, 212, 0.15)",
                        border: "1px solid rgba(6, 182, 212, 0.4)",
                        color: "var(--accent-cyan)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      🚀 Edge CDN 1ms Ready
                    </span>
                    {maintenanceMode && (
                      <span
                        style={{
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid rgba(239, 68, 68, 0.5)",
                          color: "#f87171",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: "999px",
                        }}
                      >
                        🛑 MAINTENANCE ENGAGED
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                    Real-time operational cockpit for Edge CDN caching, P2P AirDrop mesh, In-Browser Neural AI, Client WASM OCR, and Database Quota Shields.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      const hw = detectClientHardwareProfile();
                      const autoProfile = {
                        enableCdnAutoPrewarm: true,
                        cdnMaxRamItems: "auto",
                        enableP2pAirDrop: true,
                        p2pMaxPeers: "auto",
                        autoP2pHardwareGuard: true,
                        enableClientAi: true,
                        aiQuantization: "auto",
                        aiMaxContextChunks: "auto",
                        enableClientOcr: true,
                        ocrMaxPages: "auto",
                        ocrBinarization: true,
                        enableClientCompression: true,
                        compressionQuality: "auto",
                        autoNetworkAdaptive: true,
                        removeUnusedXrefs: true,
                        enableOfflineQueue: true,
                        inactivityTimeoutMinutes: "auto",
                        enableInactivityWarning: true,
                        enableDbWriteShield: true,
                        dbWriteShieldMode: "auto",
                        enableFormulaClipper: true,
                        enableStudyRoom: true,
                        studyRoomMaxUsers: "auto",
                        enableSmartDeduplication: true,
                        dedupMaxVarianceMB: 3,
                        dedupMaxVarianceBytes: 3 * 1024 * 1024,
                      };

                      setTechSettings((prev) => ({
                        ...prev,
                        ...autoProfile,
                      }));

                      saveTechSettings(autoProfile);
                      setTechActionMsg(`🤖 100% Automatic Adaptive Mode Enabled! All technologies will dynamically scale down on old/budget phones and scale up on fast PCs.`);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.82rem",
                      fontWeight: 800,
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      boxShadow: "0 2px 10px rgba(139, 92, 246, 0.3)",
                    }}
                    title="Set all settings to 100% Automatic so they dynamically adapt to each student's phone/PC specs"
                  >
                    <Cpu size={15} />
                    <span>⚡ Set 100% Automatic (Device Adaptive)</span>
                  </button>

                  <button
                    onClick={loadTechNexus}
                    disabled={techLoading}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <RefreshCw size={14} className={techLoading ? "spin" : ""} />
                    <span>Refresh Telemetry</span>
                  </button>

                  <button
                    onClick={() => saveTechSettings()}
                    disabled={techSaving}
                    className="btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 16px" }}
                  >
                    <Save size={14} />
                    <span>{techSaving ? "Saving..." : "Save Settings"}</span>
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {techActionMsg && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    background: techActionMsg.includes("❌") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                    border: techActionMsg.includes("❌") ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                    color: techActionMsg.includes("❌") ? "#fca5a5" : "#6ee7b7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{techActionMsg}</span>
                  <button onClick={() => setTechActionMsg("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Hardware Anti-Crash & Auto-Adaptation Banner */}
              {(() => {
                const hw = detectClientHardwareProfile();
                return (
                  <div
                    style={{
                      background: "linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(139, 92, 246, 0.12))",
                      border: "1px solid rgba(6, 182, 212, 0.35)",
                      borderRadius: "12px",
                      padding: "14px 18px",
                      marginBottom: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: "rgba(6, 182, 212, 0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--accent-cyan)",
                        }}
                      >
                        <ShieldCheck size={22} />
                      </div>
                      <div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>🛡️ Client Device Auto-Protection Engine (Anti-Crash Hardware Guard)</span>
                          <span style={{ fontSize: "0.68rem", background: "rgba(16, 185, 129, 0.2)", color: "#6ee7b7", padding: "2px 6px", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.4)" }}>ACTIVE</span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#cbd5e1", marginTop: "3px" }}>
                          Prevents old/budget phones from freezing or running out of memory. If you set High parameters, client devices automatically clamp workloads to safe thresholds.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0, 0, 0, 0.3)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: "0.74rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>This Device:</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>{hw.label}</span>
                      <span style={{ color: "#64748b" }}>•</span>
                      <span style={{ color: "#a78bfa" }}>{hw.cores} Cores</span>
                      <span style={{ color: "#64748b" }}>•</span>
                      <span style={{ color: "#34d399" }}>{hw.memoryGB ? `${hw.memoryGB} GB RAM` : "Standard RAM"}</span>
                      <span style={{ color: "#64748b" }}>•</span>
                      <span style={{ color: "#fbbf24", textTransform: "uppercase" }}>{hw.effectiveType}</span>
                    </div>
                  </div>
                );
              })()}

              {/* 🛠️ SERVER MAINTENANCE MODE EMERGENCY CONTROL CARD (PURE ENGLISH - MIRRORED FROM TAB 4) */}
              {renderMaintenanceControlCard("Tab 10")}

              {/* Top 4 Live Telemetry HUD Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "20px",
                }}
              >
                {/* HUD 1: Edge CDN RAM Cache */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    borderRadius: "12px",
                    padding: "14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                      Edge CDN In-Memory
                    </span>
                    <Globe size={16} color="var(--accent-cyan)" />
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                    {techTelemetry?.memoryCache?.itemCount ?? 0} <span style={{ fontSize: "0.85rem", color: "var(--accent-cyan)", fontWeight: 600 }}>Notes ({techTelemetry?.memoryCache?.totalMB ?? "0.00"} MB)</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                    1ms instant stream • Max limit: {techSettings.cdnMaxRamItems === "auto" ? "🤖 Auto (Device Adaptive)" : `${techSettings.cdnMaxRamItems || 50} Notes`}
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                    <button
                      onClick={handlePurgeMemoryCache}
                      disabled={techLoading}
                      className="btn-secondary"
                      style={{ fontSize: "0.7rem", padding: "4px 8px", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}
                      title="Purge all items from server memory"
                    >
                      <Trash2 size={11} style={{ marginRight: "3px" }} /> Purge RAM
                    </button>
                    <button
                      onClick={handlePrewarmPopular}
                      disabled={techLoading}
                      className="btn-secondary"
                      style={{ fontSize: "0.7rem", padding: "4px 8px", borderColor: "rgba(6, 182, 212, 0.3)", color: "var(--accent-cyan)" }}
                      title="Pre-warm Top 10 most viewed notes into memory"
                    >
                      <Flame size={11} style={{ marginRight: "3px" }} /> Prewarm Top 10
                    </button>
                  </div>
                </div>

                {/* HUD 2: Database Writes Saved */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(160, 185, 129, 0.3)",
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                      DB Writes Prevented
                    </span>
                    <ShieldCheck size={16} color="#10b981" />
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#10b981", lineHeight: 1.1 }}>
                    {techTelemetry?.dbWritesSaved ?? 0} <span style={{ fontSize: "0.85rem", color: "#6ee7b7", fontWeight: 600 }}>Writes</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                    Range stream storm blocked • 95%+ Firestore quota saved
                  </div>
                  <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#34d399", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                    <Check size={12} /> Strict Download Gating Active
                  </div>
                </div>

                {/* HUD 3: P2P Campus Mesh */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                      P2P Campus AirDrop
                    </span>
                    <Share2 size={16} color="#c084fc" />
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: techSettings.enableP2pAirDrop ? "#c084fc" : "#94a3b8", lineHeight: 1.1 }}>
                    {techSettings.enableP2pAirDrop ? "Mesh Ready" : "Disabled"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                    WebRTC Local Swarm • Max {techSettings.p2pMaxPeers === "auto" ? "🤖 Auto (Adaptive)" : `${techSettings.p2pMaxPeers || 10} peers`}
                  </div>
                  <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#c084fc", background: "rgba(168, 85, 247, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                    <Wifi size={12} /> College WiFi 0ms Sharing
                  </div>
                </div>

                {/* HUD 4: Client Neural AI */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                      Client Neural AI &amp; WASM
                    </span>
                    <Sparkles size={16} color="#f59e0b" />
                  </div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 800, color: techSettings.enableClientAi ? "#fbbf24" : "#94a3b8", lineHeight: 1.1 }}>
                    {techSettings.enableClientAi ? "Neural RAG Active" : "Disabled"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                    In-Browser Vector Search • Tesseract OCR
                  </div>
                  <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#fbbf24", background: "rgba(245, 158, 11, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                    <Zap size={12} /> ₹0 Server AI / GPU Cost
                  </div>
                </div>
              </div>

              {/* Main 2-Column Controls Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                  gap: "16px",
                  marginBottom: "24px",
                }}
              >
                {/* CARD 1: Edge CDN & RAM Cache Settings */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Globe size={18} color="var(--accent-cyan)" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        1. Edge CDN In-Memory Buffer Cache
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableCdnAutoPrewarm ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableCdnAutoPrewarm)}
                        onChange={() => handleToggleTechSetting("enableCdnAutoPrewarm")}
                        style={{ accentColor: "var(--accent-cyan)", width: "16px", height: "16px" }}
                      />
                      Auto Pre-warm
                    </label>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Automatically warms and caches document buffers into Edge CDN memory on the first preview or download, serving subsequent requests at 1ms.
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", fontSize: "0.8rem", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Max Notes in RAM Buffer:</span>
                    <select
                      value={techSettings.cdnMaxRamItems ?? "auto"}
                      onChange={(e) => handleUpdateTechValue("cdnMaxRamItems", e.target.value)}
                      style={{ background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.8rem" }}
                    >
                      <option value="auto">🤖 Automatic (Adaptive to Available RAM)</option>
                      <option value="20">20 Notes (~150 MB RAM)</option>
                      <option value="30">30 Notes (~220 MB RAM)</option>
                      <option value="50">50 Notes (~380 MB RAM - Recommended)</option>
                      <option value="100">100 Notes (~750 MB RAM)</option>
                    </select>
                  </div>

                  {/* Resident Items List Preview */}
                  {techTelemetry?.memoryCache?.items && techTelemetry.memoryCache.items.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase" }}>
                        Currently Resident Notes ({techTelemetry.memoryCache.items.length}):
                      </div>
                      <div style={{ maxHeight: "110px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {techTelemetry.memoryCache.items.slice(0, 5).map((item, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", padding: "4px 8px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", color: "#cbd5e1" }}>
                            <span style={{ fontFamily: "monospace", color: "var(--accent-cyan)" }}>ID: {item.id.slice(0, 14)}...</span>
                            <span>{item.sizeMB} MB • {item.ageSeconds}s ago</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CARD 2: Air-Drop Campus Swarm (Zero-Internet BitTorrent Mesh) */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Share2 size={18} color="#c084fc" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        2. ⚡ Air-Drop Campus Swarm (BitTorrent Mesh)
                      </h4>
                    </div>
                    {/* Dedicated ON/OFF Button Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleTechSetting("enableP2pAirDrop")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "5px 12px",
                        borderRadius: "20px",
                        border: isAirDropOn ? "1px solid #10b981" : "1px solid rgba(239, 68, 68, 0.4)",
                        background: isAirDropOn ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.12)",
                        color: isAirDropOn ? "#34d399" : "#f87171",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      title={isAirDropOn ? "Click to Turn OFF Air-Drop Swarm" : "Click to Turn ON Air-Drop Swarm"}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: isAirDropOn ? "#10b981" : "#ef4444",
                          boxShadow: isAirDropOn ? "0 0 8px #10b981" : "none",
                        }}
                      />
                      <span>{isAirDropOn ? "ON (ACTIVE)" : "OFF (DISABLED)"}</span>
                    </button>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Enables BitTorrent-like direct browser-to-browser P2P chunk transfer between students on the same campus WiFi network or Mobile Hotspot at 0ms latency with zero internet consumption.
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", fontSize: "0.8rem", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Max Peer Swarm Connections:</span>
                    <select
                      value={techSettings.p2pMaxPeers ?? "auto"}
                      onChange={(e) => handleUpdateTechValue("p2pMaxPeers", e.target.value)}
                      style={{ background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.8rem" }}
                    >
                      <option value="auto">🤖 Automatic (Adaptive to Cores & Battery)</option>
                      <option value="3">3 Peers (Conservative - Budget Device Safe)</option>
                      <option value="5">5 Peers (Standard)</option>
                      <option value="10">10 Peers (High Speed Mesh)</option>
                      <option value="20">20 Peers (Campus Swarm Max)</option>
                    </select>
                  </div>

                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "rgba(168, 85, 247, 0.06)", borderRadius: "8px", border: "1px solid rgba(168, 85, 247, 0.15)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.76rem", color: "#e2e8f0" }}>
                      <input
                        type="checkbox"
                        checked={techSettings.autoP2pHardwareGuard !== false}
                        onChange={() => handleToggleTechSetting("autoP2pHardwareGuard")}
                        style={{ accentColor: "#c084fc", width: "15px", height: "15px" }}
                      />
                      <span>🛡️ <strong>Hardware Anti-Crash Guard</strong> (Clamp to 3 peers on budget devices even if high is chosen)</span>
                    </label>
                  </div>

                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.74rem", color: "#94a3b8" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isAirDropOn ? "#10b981" : "#64748b" }}></span>
                    Status: {isAirDropOn ? "BitTorrent Swarm Active (₹0 Server Cost)" : "AirDrop Swarm Paused"}
                  </div>
                </div>

                {/* CARD 2B: 1-Tap QR Mesh Connect (Camera/QR Zero-Server Handshake) */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <QrCode size={18} color="#38bdf8" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        2B. 📱 1-Tap QR Mesh Connect
                      </h4>
                    </div>
                    {/* Dedicated ON/OFF Button Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleTechSetting("enableQrMeshConnect")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "5px 12px",
                        borderRadius: "20px",
                        border: isQrMeshOn ? "1px solid #38bdf8" : "1px solid rgba(239, 68, 68, 0.4)",
                        background: isQrMeshOn ? "rgba(56, 189, 248, 0.15)" : "rgba(239, 68, 68, 0.12)",
                        color: isQrMeshOn ? "#38bdf8" : "#f87171",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      title={isQrMeshOn ? "Click to Turn OFF QR Mesh Connect" : "Click to Turn ON QR Mesh Connect"}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: isQrMeshOn ? "#38bdf8" : "#ef4444",
                          boxShadow: isQrMeshOn ? "0 0 8px #38bdf8" : "none",
                        }}
                      />
                      <span>{isQrMeshOn ? "ON (ACTIVE)" : "OFF (DISABLED)"}</span>
                    </button>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Replaces central server signaling with 1-Tap Camera &amp; Animated QR handshake. Allows students to establish peer connections even in dead-zones (0% mobile network/jammers).
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", fontSize: "0.8rem", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Signaling Channel:</span>
                    <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.78rem" }}>
                      📷 Optical Camera &amp; Screen Barcode
                    </span>
                  </div>

                  <div style={{ marginTop: "10px", padding: "8px 10px", background: "rgba(56, 189, 248, 0.06)", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)" }}>
                    <div style={{ fontSize: "0.76rem", color: "#bae6fd", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Camera size={14} />
                      <span><strong>Native BarcodeDetector:</strong> Instant 0.1s scanning without uploading frames to cloud.</span>
                    </div>
                  </div>

                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.74rem", color: "#94a3b8" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isQrMeshOn ? "#38bdf8" : "#64748b" }}></span>
                    Status: {isQrMeshOn ? "1-Tap QR Mesh Ready (Zero-Server Handshake)" : "QR Handshake Disabled"}
                  </div>
                </div>

                {/* CARD 3: Client-Side Neural AI & PDF RAG */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sparkles size={18} color="#f59e0b" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        3. In-Browser Neural AI &amp; Vector RAG
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableClientAi ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableClientAi)}
                        onChange={() => handleToggleTechSetting("enableClientAi")}
                        style={{ accentColor: "#f59e0b", width: "16px", height: "16px" }}
                      />
                      Neural AI Active
                    </label>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Executes lightweight semantic embeddings and question-answering directly in the student's browser. Eliminates API costs while maintaining 100% data privacy.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Quantization Mode:</div>
                      <select
                        value={techSettings.aiQuantization || "auto"}
                        onChange={(e) => handleUpdateTechValue("aiQuantization", e.target.value)}
                        style={{ width: "100%", background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (int4 on Mobile / int8 on PC)</option>
                        <option value="int4">Int4 (Fastest, Ultra-Low RAM ~150MB)</option>
                        <option value="int8">Int8 (Standard, Balanced ~350MB)</option>
                        <option value="float32">Float32 (High Accuracy ~800MB)</option>
                      </select>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Max RAG Context Chunks:</div>
                      <select
                        value={techSettings.aiMaxContextChunks ?? "auto"}
                        onChange={(e) => handleUpdateTechValue("aiMaxContextChunks", e.target.value)}
                        style={{ width: "100%", background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (3 on Mobile / 10 on PC)</option>
                        <option value="3">3 Chunks (Ultra-fast, Budget Phones)</option>
                        <option value="5">5 Chunks (Fast)</option>
                        <option value="10">10 Chunks (Balanced)</option>
                        <option value="20">20 Chunks (Deep Survey)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* CARD 4: Client-Side WASM OCR Engine */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FileText size={18} color="#38bdf8" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        4. Client-Side WASM OCR Engine
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableClientOcr ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableClientOcr)}
                        onChange={() => handleToggleTechSetting("enableClientOcr")}
                        style={{ accentColor: "#38bdf8", width: "16px", height: "16px" }}
                      />
                      WASM OCR
                    </label>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Canvas-based Tesseract.js WebAssembly engine extracting searchable text from handwritten notes and camera scans on student devices.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Max Pages per Document:</div>
                      <select
                        value={techSettings.ocrMaxPages ?? "auto"}
                        onChange={(e) => handleUpdateTechValue("ocrMaxPages", e.target.value)}
                        style={{ width: "100%", background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (2 on Mobile / 5 on PC)</option>
                        <option value="2">2 Pages (Budget Phone Safe)</option>
                        <option value="3">3 Pages (Low Mobile Load)</option>
                        <option value="5">5 Pages (Recommended)</option>
                        <option value="10">10 Pages (Thorough)</option>
                      </select>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", display: "flex", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.76rem", color: "#e2e8f0" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(techSettings.ocrBinarization)}
                          onChange={() => handleToggleTechSetting("ocrBinarization")}
                          style={{ accentColor: "#38bdf8", width: "15px", height: "15px" }}
                        />
                        Auto Contrast &amp; Otsu Binarization
                      </label>
                    </div>
                  </div>
                </div>

                {/* CARD 5: Client-Side Adaptive PDF Compressor */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sliders size={18} color="#ec4899" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        5. Client-Side Adaptive PDF Compressor
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableClientCompression ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableClientCompression)}
                        onChange={() => handleToggleTechSetting("enableClientCompression")}
                        style={{ accentColor: "#ec4899", width: "16px", height: "16px" }}
                      />
                      Pre-Upload Compress
                    </label>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Downsamples high-DPI scans and purges redundant object cross-references in the user's browser before transmission, cutting upload bandwidth up to 70%.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Compression Quality:</div>
                      <select
                        value={techSettings.compressionQuality ?? "auto"}
                        onChange={(e) => handleUpdateTechValue("compressionQuality", e.target.value)}
                        style={{ width: "100%", background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (Adaptive to 2G/3G/4G & Device)</option>
                        <option value="0.50">0.50 (Maximum Shrink - Fast Upload)</option>
                        <option value="0.65">0.65 (Balanced - Recommended)</option>
                        <option value="0.80">0.80 (High Detail Preservation)</option>
                      </select>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.76rem", color: "#e2e8f0" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(techSettings.removeUnusedXrefs)}
                          onChange={() => handleToggleTechSetting("removeUnusedXrefs")}
                          style={{ accentColor: "#ec4899", width: "15px", height: "15px" }}
                        />
                        Purge Orphan XRefs &amp; Metadata
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.76rem", color: "#cbd5e1" }}>
                        <input
                          type="checkbox"
                          checked={techSettings.autoNetworkAdaptive !== false}
                          onChange={() => handleToggleTechSetting("autoNetworkAdaptive")}
                          style={{ accentColor: "#ec4899", width: "15px", height: "15px" }}
                        />
                        <span>🌐 Auto Boost on Slow 2G/3G</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* CARD 6: Inactivity Auto-Lock & Session Guardian */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Clock size={18} color="#eab308" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        6. Inactivity Session Guardian
                      </h4>
                    </div>
                    <span style={{ fontSize: "0.74rem", color: "#eab308", background: "rgba(234, 179, 8, 0.15)", padding: "2px 8px", borderRadius: "4px" }}>
                      Lab Protection
                    </span>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Detects idle mouse, keyboard, and touch events on college lab terminals, automatically locking the account to protect student data.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>Auto-Logout Timeout:</div>
                      <select
                        value={techSettings.inactivityTimeoutMinutes ?? "auto"}
                        onChange={(e) => handleUpdateTechValue("inactivityTimeoutMinutes", e.target.value)}
                        style={{ width: "100%", background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (15m Mobile / 30m Desktop Lab)</option>
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes (Default)</option>
                        <option value="60">60 Minutes</option>
                        <option value="0">Disabled (Never Auto-Lock)</option>
                      </select>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", display: "flex", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.76rem", color: "#e2e8f0" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(techSettings.enableInactivityWarning)}
                          onChange={() => handleToggleTechSetting("enableInactivityWarning")}
                          style={{ accentColor: "#eab308", width: "15px", height: "15px" }}
                        />
                        Show 2-Min Countdown Warning Dialog
                      </label>
                    </div>
                  </div>
                </div>

                {/* CARD 7: Database Write Shield & Multi-Tab Synchronization */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <ShieldCheck size={18} color="#10b981" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        7. Database Write Shield &amp; Multi-Tab Lock
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableDbWriteShield ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableDbWriteShield)}
                        onChange={() => handleToggleTechSetting("enableDbWriteShield")}
                        style={{ accentColor: "#10b981", width: "16px", height: "16px" }}
                      />
                      Write Shield
                    </label>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Throttles download counting strictly to full download requests. Prevents byte-range PDF readers from spamming Firestore updates on every chunk.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Write Shield Protection Mode:</span>
                      <select
                        value={techSettings.dbWriteShieldMode || "auto"}
                        onChange={(e) => handleUpdateTechValue("dbWriteShieldMode", e.target.value)}
                        style={{ background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "0.78rem" }}
                      >
                        <option value="auto">🤖 Automatic (Strict on Mobile / Adaptive)</option>
                        <option value="strict">Strict (Block Range Request Counter Loops)</option>
                        <option value="balanced">Balanced (Count Completed Downloads)</option>
                        <option value="permissive">Permissive (Log Full Preview Stream)</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Total Writes Prevented:</span>
                      <span style={{ fontWeight: 800, color: "#10b981" }}>{techTelemetry?.dbWritesSaved ?? 0} operations</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Tab Leader Election:</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>BroadcastChannel + Web Locks API</span>
                    </div>
                  </div>
                </div>

                {/* CARD 8: Auxiliary Modern Features */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <Layers size={18} color="#a855f7" />
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                      8. Formula Clipper, Study Room &amp; Offline Queue
                    </h4>
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px" }}>
                    Toggle specific UI tools and collaboration micro-services across the platform.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Formula Clipper Toggle */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Scissors size={15} color="#38bdf8" />
                        <span style={{ fontSize: "0.78rem", color: "#e2e8f0" }}>1-Click Formula &amp; Diagram Clipper</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableFormulaClipper)}
                        onChange={() => handleToggleTechSetting("enableFormulaClipper")}
                        style={{ accentColor: "#38bdf8", width: "16px", height: "16px" }}
                      />
                    </div>

                    {/* Offline Queue Toggle */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <RotateCcw size={15} color="#10b981" />
                        <span style={{ fontSize: "0.78rem", color: "#e2e8f0" }}>IndexedDB PWA Offline Queue &amp; Sync</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(techSettings.enableOfflineQueue)}
                        onChange={() => handleToggleTechSetting("enableOfflineQueue")}
                        style={{ accentColor: "#10b981", width: "16px", height: "16px" }}
                      />
                    </div>

                    {/* Remote Client Storage & Cache Purge Controller */}
                    <div style={{ padding: "12px", background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <HardDrive size={16} color="#c084fc" />
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>Student Device Cache &amp; Storage Controller</span>
                        </div>
                        <span style={{ fontSize: "0.68rem", color: "#34d399", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                          ⚡ 0 DB Reads/Writes
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                        Remotely purges client IndexedDB tables (<code style={{ color: "#c084fc" }}>fsm_offline_vault</code>, <code style={{ color: "#c084fc" }}>fsm_p2p_cache_v1</code>) and Service Worker caches across student devices via real-time WebSocket or CDN epoch headers. 0.0% Server CPU overhead.
                      </p>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm("⚠️ Force an offline storage reset on ALL student devices platform-wide?\n\nThis bumps the global cache epoch and triggers an immediate local cache wipe on all student devices with 0 database reads and 0 database writes.")) return;
                            try {
                              const res = await api.resetAllUsersStorageCache();
                              alert(`✅ ${res.message || "Global storage reset dispatched."}`);
                            } catch (err) {
                              alert(`❌ Global reset failed: ${err.message}`);
                            }
                          }}
                          style={{
                            flex: 1,
                            minWidth: "160px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            background: "rgba(168, 85, 247, 0.2)",
                            border: "1px solid rgba(168, 85, 247, 0.5)",
                            color: "#c084fc",
                            fontWeight: 700,
                            fontSize: "0.74rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          <RotateCcw size={13} />
                          <span>Reset All Student Caches</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const query = window.prompt("Enter student email or ID to remotely wipe their device offline cache:");
                            if (!query) return;
                            try {
                              const res = await api.resetSingleUserStorageCache(query, query);
                              alert(`✅ ${res.message || "Targeted storage reset dispatched."}`);
                            } catch (err) {
                              alert(`❌ Reset failed: ${err.message}`);
                            }
                          }}
                          style={{
                            flex: 1,
                            minWidth: "160px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            background: "rgba(56, 189, 248, 0.15)",
                            border: "1px solid rgba(56, 189, 248, 0.4)",
                            color: "#38bdf8",
                            fontWeight: 700,
                            fontSize: "0.74rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          <Search size={13} />
                          <span>Target Single Student Reset</span>
                        </button>
                      </div>
                    </div>

                    {/* Collaborative Study Room Toggle */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Zap size={15} color="#f59e0b" />
                          <span style={{ fontSize: "0.78rem", color: "#e2e8f0" }}>WebRTC Collaborative Study Rooms</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(techSettings.enableStudyRoom)}
                          onChange={() => handleToggleTechSetting("enableStudyRoom")}
                          style={{ accentColor: "#f59e0b", width: "16px", height: "16px" }}
                        />
                      </div>
                      {techSettings.enableStudyRoom && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", paddingTop: "6px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Room Capacity:</span>
                          <select
                            value={techSettings.studyRoomMaxUsers ?? "auto"}
                            onChange={(e) => handleUpdateTechValue("studyRoomMaxUsers", e.target.value)}
                            style={{ background: "#0b0f19", color: "#fff", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.76rem" }}
                          >
                            <option value="auto">🤖 Automatic (4 Mobile / 8 PC)</option>
                            <option value="4">4 Users (Mobile Safe Mesh)</option>
                            <option value="8">8 Users (Standard Pod)</option>
                            <option value="12">12 Users (Classroom Group)</option>
                            <option value="20">20 Users (Large Room)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CARD 9: Smart File Deduplication & Size Variance Shield */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(6, 182, 212, 0.35)",
                    borderRadius: "12px",
                    padding: "18px",
                    boxShadow: "0 8px 24px rgba(6, 182, 212, 0.06)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Database size={18} color="var(--accent-cyan)" />
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                        9. Smart File Deduplication &amp; Size Variance Shield
                      </h4>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.8rem", color: techSettings.enableSmartDeduplication !== false ? "#10b981" : "var(--text-dim)", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={techSettings.enableSmartDeduplication !== false}
                        onChange={() => handleToggleTechSetting("enableSmartDeduplication")}
                        style={{ accentColor: "var(--accent-cyan)", width: "16px", height: "16px" }}
                      />
                      Smart Dedup Active
                    </label>
                  </div>

                  <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginBottom: "14px", lineHeight: 1.5 }}>
                    Prevents redundant duplicate uploads. If a student uploads a <strong>1.0 MB</strong> document and another uploads the same document at <strong>1.2 MB</strong> (variance &le; configured tolerance limit), the system automatically detects it as a duplicate, avoids wasting cloud storage, and reuses the existing encrypted cloud reference at 0s latency.
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {/* Dual Controller: Megabytes (MB) & Exact Bytes */}
                    <div
                      style={{
                        padding: "14px",
                        background: "rgba(15, 23, 42, 0.7)",
                        border: "1px solid rgba(51, 65, 85, 0.6)",
                        borderRadius: "10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                        <div>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>
                            Max File Size Variance Tolerance
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8", display: "block", marginTop: "2px" }}>
                            Maximum size difference permitted between duplicate versions of the same document
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 700, background: "rgba(56, 189, 248, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                            {currentDedupMB} MB
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#a78bfa", fontWeight: 700, background: "rgba(167, 139, 250, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                            {currentDedupBytes.toLocaleString()} Bytes
                          </span>
                        </div>
                      </div>

                      {/* Slider Control for MB */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "0.74rem", color: "#94a3b8", minWidth: "40px" }}>0.1 MB</span>
                        <input
                          type="range"
                          min="0.1"
                          max="20.0"
                          step="0.1"
                          value={currentDedupMB}
                          onChange={(e) => handleVarianceMbChange(e.target.value)}
                          style={{
                            flex: 1,
                            accentColor: "var(--accent-cyan)",
                            cursor: "pointer",
                          }}
                        />
                        <span style={{ fontSize: "0.74rem", color: "#94a3b8", minWidth: "45px" }}>20.0 MB</span>
                      </div>

                      {/* Dual Numeric Input Fields (MB & Bytes) */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "10px",
                          marginTop: "4px",
                        }}
                      >
                        {/* MB Controller Input */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <label style={{ fontSize: "0.72rem", color: "#cbd5e1", fontWeight: 600 }}>
                            Tolerance in Megabytes (MB):
                          </label>
                          <div style={{ position: "relative" }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={techSettings.dedupMaxVarianceMB ?? 3}
                              onChange={(e) => handleVarianceMbChange(e.target.value)}
                              style={{
                                width: "100%",
                                padding: "7px 32px 7px 10px",
                                background: "#080c16",
                                border: "1px solid rgba(6, 182, 212, 0.5)",
                                borderRadius: "6px",
                                color: "#38bdf8",
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                            <span style={{ position: "absolute", right: "8px", top: "7px", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>
                              MB
                            </span>
                          </div>
                        </div>

                        {/* Exact Bytes Controller Input */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <label style={{ fontSize: "0.72rem", color: "#cbd5e1", fontWeight: 600 }}>
                            Tolerance in Exact Bytes (B):
                          </label>
                          <div style={{ position: "relative" }}>
                            <input
                              type="number"
                              step="1024"
                              min="0"
                              value={techSettings.dedupMaxVarianceBytes ?? 3145728}
                              onChange={(e) => handleVarianceBytesChange(e.target.value)}
                              style={{
                                width: "100%",
                                padding: "7px 42px 7px 10px",
                                background: "#080c16",
                                border: "1px solid rgba(167, 139, 250, 0.5)",
                                borderRadius: "6px",
                                color: "#a78bfa",
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                outline: "none",
                                fontFamily: "var(--font-mono, monospace)",
                                boxSizing: "border-box",
                              }}
                            />
                            <span style={{ position: "absolute", right: "8px", top: "7px", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>
                              Bytes
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick 1-Tap Presets */}
                      <div style={{ marginTop: "6px" }}>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600, marginBottom: "5px" }}>
                          ⚡ Quick Preset Tolerances:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {[
                            { label: "0.5 MB (512 KB)", mb: 0.5 },
                            { label: "1.0 MB", mb: 1.0 },
                            { label: "2.0 MB", mb: 2.0 },
                            { label: "3.0 MB (Default 🟢)", mb: 3.0, isDefault: true },
                            { label: "4.0 MB", mb: 4.0 },
                            { label: "5.0 MB", mb: 5.0 },
                            { label: "10.0 MB", mb: 10.0 },
                          ].map((p, idx) => {
                            const isSelected = Math.abs(currentDedupMB - p.mb) < 0.05;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleVarianceMbChange(p.mb)}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.7rem",
                                  fontWeight: isSelected ? 800 : 600,
                                  cursor: "pointer",
                                  background: isSelected
                                    ? "rgba(6, 182, 212, 0.25)"
                                    : p.isDefault
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : "rgba(255, 255, 255, 0.04)",
                                  border: isSelected
                                    ? "1px solid var(--accent-cyan)"
                                    : p.isDefault
                                    ? "1px solid rgba(16, 185, 129, 0.4)"
                                    : "1px solid rgba(255, 255, 255, 0.08)",
                                  color: isSelected ? "var(--accent-cyan)" : p.isDefault ? "#34d399" : "#cbd5e1",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Interactive Live Simulation / Example Card */}
                    <div
                      style={{
                        padding: "12px",
                        background: "rgba(6, 182, 212, 0.06)",
                        border: "1px dashed rgba(6, 182, 212, 0.35)",
                        borderRadius: "8px",
                        fontSize: "0.74rem",
                        color: "#cbd5e1",
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "var(--accent-cyan)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🧪</span> Live Upload Scenario Simulation:
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", margin: "6px 0", background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "6px" }}>
                        <div>
                          <span style={{ color: "#94a3b8" }}>Existing File:</span>{" "}
                          <strong style={{ color: "#fff" }}>1.0 MB (1,048,576 B)</strong>
                        </div>
                        <div>
                          <span style={{ color: "#94a3b8" }}>New Upload:</span>{" "}
                          <strong style={{ color: "#fff" }}>1.2 MB (1,258,291 B)</strong>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                        <span>
                          Difference: <strong style={{ color: "#fcd34d" }}>0.20 MB (209,715 Bytes)</strong> &le; Limit (
                          <strong style={{ color: "var(--accent-cyan)" }}>{currentDedupMB} MB / {currentDedupBytes.toLocaleString()} B</strong>)
                        </span>
                        <span style={{ color: "#34d399", fontWeight: 800, background: "rgba(16, 185, 129, 0.15)", padding: "2px 8px", borderRadius: "4px" }}>
                          ✅ DUPLICATE DETECTED (0s Dedup Hit)
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons: Run Sweep & Save */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={handleRunDedupSweep}
                        disabled={sweepLoading}
                        style={{
                          flex: 1,
                          minWidth: "180px",
                          padding: "8px 14px",
                          borderRadius: "8px",
                          background: "rgba(6, 182, 212, 0.15)",
                          border: "1px solid rgba(6, 182, 212, 0.45)",
                          color: "var(--accent-cyan)",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <RefreshCw size={13} className={sweepLoading ? "spin" : ""} />
                        <span>{sweepLoading ? "Scanning Redundant Files..." : "Run Database Deduplication Sweep Now"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => saveTechSettings()}
                        disabled={techSaving}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "8px",
                          background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                          border: "none",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Save size={13} />
                        <span>{techSaving ? "Saving..." : "Save Dedup Setting"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Commit Action Toolbar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  padding: "16px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
                    Commit Configuration to Platform Core
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                    Settings are saved to single Firestore document (<code>settings/tech_controls</code>) with zero recurrent read costs.
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => saveTechSettings()}
                    disabled={techSaving}
                    className="btn-primary"
                    style={{ fontSize: "0.85rem", padding: "10px 22px", display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <Save size={15} />
                    <span>{techSaving ? "Saving to Cloud..." : "Save All Next-Gen Controls"}</span>
                  </button>
                </div>
              </div>
            </div>
  );
}
