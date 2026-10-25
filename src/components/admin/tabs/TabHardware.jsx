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

export default function TabHardware(props) {
  const {
    cleaningUp,
    handleSystemCleanup,
    hardwareInfo,
    hardwareLoading,
    loadHardwareInfo,
  } = props;

  const [liveSeconds, setLiveSeconds] = useState(hardwareInfo?.process?.uptimeSeconds || 0);

  useEffect(() => {
    if (hardwareInfo?.process?.uptimeSeconds) {
      setLiveSeconds(hardwareInfo.process.uptimeSeconds);
    }
  }, [hardwareInfo?.process?.uptimeSeconds]);

  // Live second ticker: advances clock every 1 second continuously
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSeconds((prev) => (prev > 0 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format live seconds cleanly into d, h, m, s
  const formatUptimeLive = (sec) => {
    if (!sec || isNaN(sec) || sec <= 0) return hardwareInfo?.process?.uptimeFormatted || "Continuous";
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
  };

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                      Bare-Metal Server &amp; Host Telemetry
                    </h3>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      padding: "2px 8px",
                      borderRadius: "20px",
                      fontSize: "0.72rem",
                      color: "#34d399",
                      fontWeight: 700
                    }}>
                      <span style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "#10b981",
                        boxShadow: "0 0 8px #10b981",
                        display: "inline-block"
                      }}></span>
                      LIVE STREAMING (3s Auto-Sync)
                    </div>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                    Real-time host environment metrics, physical multi-core CPU, RAM allocator, and live uptime ticker.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSystemCleanup}
                    className="btn-secondary"
                    disabled={cleaningUp}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <Trash2 size={14} />
                    <span>{cleaningUp ? "Sweeping Buffers..." : "Clean Temp Buffers"}</span>
                  </button>
                  <button
                    onClick={loadHardwareInfo}
                    className="btn-primary"
                    disabled={hardwareLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <RefreshCw size={14} className={hardwareLoading ? "spinner" : ""} />
                    <span>Refresh Specs</span>
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                {/* CPU Telemetry Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(99, 102, 241, 0.15)", color: "var(--accent-indigo)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Cpu size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>CPU &amp; Architecture</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Compute Core Engine</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Processor Model:</span>
                      <span style={{ color: "#fff", fontWeight: 600, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={hardwareInfo?.cpu?.model}>
                        {hardwareInfo?.cpu?.model || "Intel / AMD x64"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Active Cores:</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>{hardwareInfo?.cpu?.cores || 4} Cores</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>CPU Utilization:</span>
                      <span style={{
                        color: (hardwareInfo?.cpu?.usagePercent || 12) > 80 ? "#f43f5e" : (hardwareInfo?.cpu?.usagePercent || 12) > 50 ? "#fbbf24" : "#34d399",
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}>
                        <span>{hardwareInfo?.cpu?.usagePercent ?? 12}% Load</span>
                        <span style={{
                          fontSize: "0.68rem",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: (hardwareInfo?.cpu?.usagePercent || 12) > 80 ? "rgba(244, 63, 94, 0.15)" : "rgba(16, 185, 129, 0.15)",
                        }}>
                          {(hardwareInfo?.cpu?.usagePercent || 12) > 80 ? "HIGH" : "NORMAL"}
                        </span>
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Clock Speed:</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{hardwareInfo?.cpu?.speedMHz ? `${hardwareInfo.cpu.speedMHz} MHz` : "Dynamic"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-dim)" }}>Architecture:</span>
                      <span style={{ color: "#34d399", fontWeight: 700 }}>{hardwareInfo?.cpu?.architecture || "x64"}</span>
                    </div>
                  </div>
                </div>

                {/* RAM Memory Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <HardDrive size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>RAM Memory Pool</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Dynamic Memory Allocation</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Total Physical RAM:</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{hardwareInfo?.memory?.totalGB ? `${hardwareInfo.memory.totalGB} GB` : "Available"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Allocated / Used RAM:</span>
                      <span style={{ color: "#fbbf24", fontWeight: 700 }}>{hardwareInfo?.memory?.usedGB ? `${hardwareInfo.memory.usedGB} GB (${hardwareInfo.memory.usagePercent}%)` : "Active"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Free Memory:</span>
                      <span style={{ color: "#34d399", fontWeight: 700 }}>{hardwareInfo?.memory?.freeGB ? `${hardwareInfo.memory.freeGB} GB` : "Normal"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-dim)" }}>Process RSS / Heap:</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                        {hardwareInfo?.v8ProcessMemory?.rssMB ? `${hardwareInfo.v8ProcessMemory.rssMB} MB RSS / ${hardwareInfo.v8ProcessMemory.heapUsedMB} MB Heap` : "Active"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Operating System & Process Card */}
                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Server size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.92rem" }}>Operating System &amp; Uptime</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Host Environment Specs</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>OS Platform:</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{hardwareInfo?.os?.platform || "Windows / Linux"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>System Hostname:</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{hardwareInfo?.os?.hostname || "localhost"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "6px" }}>
                      <span style={{ color: "var(--text-dim)" }}>Server Process PID:</span>
                      <span style={{ color: "#fbbf24", fontWeight: 700 }}>PID #{hardwareInfo?.process?.pid || 5000}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-dim)" }}>Server Uptime:</span>
                      <span style={{
                        color: "#34d399",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                        {formatUptimeLive(liveSeconds)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
  );
}
