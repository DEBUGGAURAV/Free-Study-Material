import React, { useState, useEffect, useRef } from "react";
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, Lock, Unlock,
  RefreshCw, Power, Globe, Server, Ban, Clock, CheckCircle,
  AlertCircle, Eye, Search, Copy, Check, Filter, Trash2, Cpu
} from "lucide-react";
import { api } from "../../../api";

export default function TabWebSecurity(props) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Manual IP Jail Form State
  const [manualIp, setManualIp] = useState("");
  const [manualReason, setManualReason] = useState("Abusive Scraping / Bot Activity");
  const [customReason, setCustomReason] = useState("");
  const [manualDuration, setManualDuration] = useState(1440); // 24 hours in mins

  // Filter / Search in Jailed IPs & Incidents
  const [ipSearch, setIpSearch] = useState("");
  const [copiedIp, setCopiedIp] = useState(null);

  const fetchThreatData = async (isManual = false) => {
    if (isManual) setScanning(true);
    try {
      const res = await api.getRealtimeThreats();
      if (res && res.success) {
        setData(res);
      }
    } catch (err) {
      console.warn("[WEB-SECURITY-TAB] Fetch error:", err.message);
    } finally {
      setLoading(false);
      if (isManual) setScanning(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchThreatData();
  }, []);

  // 3-Second Real-Time Ticker Pulse
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchThreatData();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoSync]);

  const showToast = (msg, type = "success") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // 1. Unjail single IP
  const handleUnjail = async (ip) => {
    setActionLoading(true);
    try {
      const res = await api.unjailThreatIp(ip, false);
      if (res.success) {
        showToast(res.message || `IP ${ip} released from security detention.`);
        fetchThreatData();
      } else {
        showToast(res.message || "Failed to unjail IP.", "error");
      }
    } catch (err) {
      showToast(err.message || "Unjail error.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Clear all jailed IPs
  const handleClearAllJails = async () => {
    if (!window.confirm("⚠️ EMERGENCY OVERRIDE: Are you sure you want to release ALL currently detained IPs from security quarantine?")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.unjailThreatIp(null, true);
      if (res.success) {
        showToast(res.message || "All detained IPs released from quarantine.");
        fetchThreatData();
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Manual IP Jail
  const handleManualJail = async (e) => {
    e.preventDefault();
    if (!manualIp || !manualIp.trim()) {
      showToast("Please enter a valid IP address.", "error");
      return;
    }
    const cleanIp = manualIp.trim();
    const finalReason = manualReason === "Other" ? (customReason.trim() || "Manual Admin Security Ban") : manualReason;

    setActionLoading(true);
    try {
      const res = await api.jailThreatIp(cleanIp, finalReason, manualDuration);
      if (res.success) {
        showToast(res.message || `IP ${cleanIp} detained successfully.`);
        setManualIp("");
        setCustomReason("");
        fetchThreatData();
      } else {
        showToast(res.message || "Failed to detain IP.", "error");
      }
    } catch (err) {
      showToast(err.message || "Manual detention error.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Unlock Brute-Force Locked Account
  const handleUnlockAccount = async (identifier) => {
    setActionLoading(true);
    try {
      const res = await api.unlockAccount(identifier);
      if (res.success) {
        showToast(res.message || `Account ${identifier} unlocked.`);
        fetchThreatData();
      } else {
        showToast(res.message || "Failed to unlock account.", "error");
      }
    } catch (err) {
      showToast(err.message || "Unlock error.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const activeJails = data?.activeJailedIps || [];
  const lockedAccounts = data?.lockedAccounts || [];
  const incidents = data?.recentIncidents || [];
  const shields = data?.webSecurityShields || {};

  const filteredJails = activeJails.filter((j) =>
    (j.ip || "").toLowerCase().includes(ipSearch.toLowerCase()) ||
    (j.reason || "").toLowerCase().includes(ipSearch.toLowerCase())
  );

  const threatLevel = data?.threatLevel || "DEFCON 5 (ALL CLEAR • 100% SECURE)";
  const isElevated = threatLevel.includes("DEFCON 2") || threatLevel.includes("DEFCON 4");

  return (
    <div style={{ color: "#e2e8f0", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 99999,
          background: toastMsg.type === "error" ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)",
          color: "#fff",
          padding: "12px 20px",
          borderRadius: "10px",
          fontWeight: 700,
          fontSize: "0.88rem",
          boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backdropFilter: "blur(8px)",
        }}>
          {toastMsg.type === "error" ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield style={{ color: "var(--accent-cyan, #06b6d4)" }} size={22} />
              Real-Time Web Security &amp; IP Jail Defense Hub
            </h3>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: autoSync ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
              border: `1px solid ${autoSync ? "rgba(16, 185, 129, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
              padding: "3px 10px",
              borderRadius: "20px",
              fontSize: "0.74rem",
              fontWeight: 700,
              color: autoSync ? "#34d399" : "#fbbf24",
            }}>
              <span style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: autoSync ? "#10b981" : "#f59e0b",
                boxShadow: autoSync ? "0 0 8px #10b981" : "none",
                display: "inline-block",
              }}></span>
              {autoSync ? "Live Auto-Sync Active (3s)" : "Auto-Sync Paused"}
            </div>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-dim, #94a3b8)" }}>
            Autonomous military-grade firewall, IP detention jail, brute-force lockouts, deep MIME verification &amp; anti-tamper sensors.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            style={{
              padding: "6px 14px",
              background: autoSync ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
              border: `1px solid ${autoSync ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              color: autoSync ? "#fbbf24" : "#34d399",
              borderRadius: "8px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Power size={14} />
            {autoSync ? "Pause Pulse" : "Resume Pulse"}
          </button>

          <button
            type="button"
            disabled={scanning || actionLoading}
            onClick={() => fetchThreatData(true)}
            style={{
              padding: "6px 14px",
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              color: "#38bdf8",
              borderRadius: "8px",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={14} className={scanning ? "spin-animate" : ""} />
            {scanning ? "Auditing Network..." : "Deep Threat Scan"}
          </button>
        </div>
      </div>

      {/* Top 5 Critical Metric Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "12px",
        marginBottom: "22px",
      }}>
        {/* DEFCON Status */}
        <div style={{
          background: isElevated ? "linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(15, 23, 42, 0.8))" : "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.8))",
          border: `1px solid ${isElevated ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.3)"}`,
          borderRadius: "12px",
          padding: "14px 16px",
          boxShadow: isElevated ? "0 0 15px rgba(239, 68, 68, 0.2)" : "none",
        }}>
          <div style={{ fontSize: "0.72rem", color: isElevated ? "#fca5a5" : "#6ee7b7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Network Threat Level
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: isElevated ? "#ef4444" : "#10b981", marginTop: "4px" }}>
            {threatLevel}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)", marginTop: "4px" }}>
            Audit Score: {data?.systemAuditScore || 100}% Integrity
          </div>
        </div>

        {/* Active Jailed IPs */}
        <div style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "12px",
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 700, textTransform: "uppercase" }}>
              Active Jailed IPs
            </span>
            <Ban size={16} color="#f87171" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: activeJails.length > 0 ? "#ef4444" : "#f1f5f9", marginTop: "4px" }}>
            {activeJails.length}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)", marginTop: "2px" }}>
            Total Detained: {data?.totalJailedCount || 0}
          </div>
        </div>

        {/* Active Account Lockouts */}
        <div style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "12px",
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "#fbbf24", fontWeight: 700, textTransform: "uppercase" }}>
              Locked Accounts (Brute Force)
            </span>
            <Lock size={16} color="#fbbf24" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: lockedAccounts.length > 0 ? "#f59e0b" : "#f1f5f9", marginTop: "4px" }}>
            {lockedAccounts.length}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)", marginTop: "2px" }}>
            5 Failed Attempts Lockout (20m)
          </div>
        </div>

        {/* Scrubbed Malicious Payloads */}
        <div style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(168, 85, 247, 0.3)",
          borderRadius: "12px",
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "#c084fc", fontWeight: 700, textTransform: "uppercase" }}>
              Injections Scrubbed
            </span>
            <ShieldCheck size={16} color="#c084fc" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#c084fc", marginTop: "4px" }}>
            {data?.totalInjectionsScrubbed || 0}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)", marginTop: "2px" }}>
            XSS &amp; Prototype Protections
          </div>
        </div>

        {/* Total Threats Detected */}
        <div style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: "12px",
          padding: "14px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase" }}>
              Total Blocked Attacks
            </span>
            <Server size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>
            {data?.totalThreatsDetected || 0}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)", marginTop: "2px" }}>
            Zero-Cost Edge Mitigation
          </div>
        </div>
      </div>

      {/* Grid: Left Column (IP Jail Table & Form) | Right Column (Locked Accounts & Shields) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        
        {/* SECTION 1: Active IP Jail Quarantine Matrix */}
        <div style={{
          background: "rgba(15, 23, 42, 0.7)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderRadius: "14px",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#f87171", display: "flex", alignItems: "center", gap: "8px" }}>
                <Ban size={18} />
                IP Jail Detention Quarantine ({activeJails.length} Active)
              </h4>
              <span style={{ fontSize: "0.74rem", color: "var(--text-dim, #94a3b8)" }}>
                Blocked traffic receives instant HTTP 429 &amp; Retry-After response. Zero CPU load.
              </span>
            </div>

            {activeJails.length > 0 && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleClearAllJails}
                style={{
                  padding: "5px 12px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Trash2 size={13} />
                Release All ({activeJails.length})
              </button>
            )}
          </div>

          {/* Search Box */}
          <div style={{ position: "relative", marginBottom: "12px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--text-dim, #64748b)" }} />
            <input
              type="text"
              placeholder="Search by IP address or detention reason..."
              value={ipSearch}
              onChange={(e) => setIpSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                background: "rgba(30, 41, 59, 0.7)",
                border: "1px solid rgba(51, 65, 85, 0.8)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "0.8rem",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {/* Table Container */}
          <div style={{ maxHeight: "280px", overflowY: "auto", borderRadius: "8px", border: "1px solid rgba(51, 65, 85, 0.6)" }}>
            {filteredJails.length === 0 ? (
              <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--text-dim, #94a3b8)" }}>
                <CheckCircle size={32} style={{ color: "#10b981", margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>Zero Detained IPs in Jail</div>
                <div style={{ fontSize: "0.76rem", marginTop: "4px" }}>
                  {ipSearch ? "No matching IP found for query." : "All client connections are verified and within safe operating limits."}
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "rgba(30, 41, 59, 0.9)", textAlign: "left", color: "#94a3b8" }}>
                    <th style={{ padding: "10px 12px" }}>IP Address</th>
                    <th style={{ padding: "10px 12px" }}>Detention Reason</th>
                    <th style={{ padding: "10px 12px" }}>Remaining</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJails.map((j) => (
                    <tr key={j.ip} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.4)", background: "rgba(15, 23, 42, 0.4)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono, monospace)", color: "#f87171", fontWeight: 700 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{j.ip}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(j.ip)}
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "2px" }}
                            title="Copy IP"
                          >
                            {copiedIp === j.ip ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#cbd5e1" }}>
                        {j.reason || "High Traffic Surge"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#fbbf24", fontWeight: 700, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} />
                          <span>{j.remainingSec > 60 ? `${Math.ceil(j.remainingSec / 60)} mins` : `${j.remainingSec}s`}</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleUnjail(j.ip)}
                          style={{
                            padding: "4px 10px",
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            color: "#34d399",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Unlock size={12} />
                          Release
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* SECTION 2: Manual IP Quarantine Form */}
          <form onSubmit={handleManualJail} style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(51, 65, 85, 0.5)" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>⛔</span>
              <span>Manual IP Quarantine Console (Lockout Any Abusive IP)</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Target IP (e.g. 203.0.113.195)"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                required
                style={{
                  padding: "8px 10px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(51, 65, 85, 0.8)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              />

              <select
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                style={{
                  padding: "8px 10px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(51, 65, 85, 0.8)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.78rem",
                }}
              >
                <option value="Abusive Scraping / Bot Activity">Abusive Scraping / Bot</option>
                <option value="Brute-Force Credential Stuffing">Brute-Force Credential Stuffing</option>
                <option value="Malicious File Upload Attempt">Malicious File Upload Attempt</option>
                <option value="Client Script Tampering / DevTools">Client Script Tampering / DevTools</option>
                <option value="DDoS Traffic Spike">DDoS Traffic Spike</option>
                <option value="Other">Custom Reason...</option>
              </select>

              <select
                value={manualDuration}
                onChange={(e) => setManualDuration(Number(e.target.value))}
                style={{
                  padding: "8px 10px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(51, 65, 85, 0.8)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.78rem",
                }}
              >
                <option value={15}>15 Mins</option>
                <option value={60}>1 Hour</option>
                <option value={1440}>24 Hours</option>
                <option value={10080}>7 Days</option>
                <option value={525600}>Permanent</option>
              </select>

              <button
                type="submit"
                disabled={actionLoading || !manualIp.trim()}
                style={{
                  padding: "8px 14px",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {actionLoading ? "Detaining..." : "Quarantine IP"}
              </button>
            </div>

            {manualReason === "Other" && (
              <input
                type="text"
                placeholder="Enter specific detention justification..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "8px 10px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(51, 65, 85, 0.8)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.78rem",
                  boxSizing: "border-box",
                }}
              />
            )}
          </form>
        </div>

        {/* SECTION 3: Active Account Lockouts (Brute Force Defense) */}
        <div style={{
          background: "rgba(15, 23, 42, 0.7)",
          border: "1px solid rgba(245, 158, 11, 0.25)",
          borderRadius: "14px",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#fbbf24", display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={18} />
                Brute-Force Account Lockouts ({lockedAccounts.length} Locked)
              </h4>
              <span style={{ fontSize: "0.74rem", color: "var(--text-dim, #94a3b8)" }}>
                Accounts temporarily frozen for 20 minutes across ALL IPs after 5 failed password/OTP attempts.
              </span>
            </div>
          </div>

          <div style={{ flex: 1, maxHeight: "350px", overflowY: "auto", borderRadius: "8px", border: "1px solid rgba(51, 65, 85, 0.6)" }}>
            {lockedAccounts.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-dim, #94a3b8)" }}>
                <ShieldCheck size={36} style={{ color: "#10b981", margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>Zero Active Account Lockouts</div>
                <div style={{ fontSize: "0.76rem", marginTop: "4px" }}>
                  All registered student and administrator credentials are secure and verified.
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "rgba(30, 41, 59, 0.9)", textAlign: "left", color: "#94a3b8" }}>
                    <th style={{ padding: "10px 12px" }}>Account Identifier</th>
                    <th style={{ padding: "10px 12px" }}>Failed Strikes</th>
                    <th style={{ padding: "10px 12px" }}>Remaining</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedAccounts.map((acc) => (
                    <tr key={acc.identifier} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.4)", background: "rgba(15, 23, 42, 0.4)" }}>
                      <td style={{ padding: "8px 12px", color: "#f87171", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
                        {acc.identifier}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#fbbf24" }}>
                        {acc.attempts} of 5 attempts
                      </td>
                      <td style={{ padding: "8px 12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} color="#fbbf24" />
                          <span>{acc.remainingMinutes} mins</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleUnlockAccount(acc.identifier)}
                          style={{
                            padding: "4px 10px",
                            background: "rgba(56, 189, 248, 0.15)",
                            border: "1px solid rgba(56, 189, 248, 0.4)",
                            color: "#38bdf8",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Unlock size={12} />
                          Unlock Account
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 4: 12 Live Web Security Shields Status (Categories 1 & 2) */}
      <div style={{
        background: "rgba(15, 23, 42, 0.7)",
        border: "1px solid rgba(56, 189, 248, 0.2)",
        borderRadius: "14px",
        padding: "18px 20px",
        marginBottom: "24px",
      }}>
        <div style={{ marginBottom: "14px" }}>
          <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={18} color="#10b981" />
            Active Platform Web Security Infrastructure (Categories 1 &amp; 2)
          </h4>
          <span style={{ fontSize: "0.74rem", color: "var(--text-dim, #94a3b8)" }}>
            Real-time status of all active security layers safeguarding students, exams, database, and bare-metal server.
          </span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "10px",
        }}>
          {Object.entries(shields).map(([key, s]) => (
            <div
              key={key}
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(51, 65, 85, 0.6)",
                borderRadius: "10px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f1f5f9" }}>
                  {s.icon || "🛡️"} {s.name}
                </span>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  color: "#34d399",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  padding: "1px 6px",
                  borderRadius: "4px",
                }}>
                  {s.status}
                </span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim, #94a3b8)" }}>
                {s.type}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5: Real-Time Incident Stream / Threat Audit Log */}
      <div style={{
        background: "rgba(15, 23, 42, 0.7)",
        border: "1px solid rgba(51, 65, 85, 0.6)",
        borderRadius: "14px",
        padding: "18px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock size={18} color="var(--accent-cyan, #06b6d4)" />
              Real-Time Security Incident Stream &amp; Audit Trail
            </h4>
            <span style={{ fontSize: "0.74rem", color: "var(--text-dim, #94a3b8)" }}>
              Circular log of all blocked threats, brute-force lockouts, AST injections scrubbed, and IP detentions.
            </span>
          </div>
          <span style={{ fontSize: "0.74rem", color: "var(--accent-cyan, #06b6d4)", fontWeight: 700 }}>
            {incidents.length} Event(s) Captured
          </span>
        </div>

        <div style={{ maxHeight: "260px", overflowY: "auto", borderRadius: "8px", border: "1px solid rgba(51, 65, 85, 0.6)" }}>
          {incidents.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--text-dim, #94a3b8)", fontSize: "0.82rem" }}>
              Zero security incidents recorded in current session. Platform running clean.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ background: "rgba(30, 41, 59, 0.9)", textAlign: "left", color: "#94a3b8" }}>
                  <th style={{ padding: "8px 12px" }}>Timestamp</th>
                  <th style={{ padding: "8px 12px" }}>Severity</th>
                  <th style={{ padding: "8px 12px" }}>Origin IP</th>
                  <th style={{ padding: "8px 12px" }}>Incident Vector</th>
                  <th style={{ padding: "8px 12px" }}>Action Enforced</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((ev, idx) => {
                  const isCrit = ev.severity === "CRITICAL";
                  const isHigh = ev.severity === "HIGH";
                  return (
                    <tr key={ev.id || idx} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.3)", background: "rgba(15, 23, 42, 0.3)" }}>
                      <td style={{ padding: "7px 12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "Live"}
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{
                          fontSize: "0.66rem",
                          fontWeight: 800,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: isCrit ? "rgba(239, 68, 68, 0.2)" : isHigh ? "rgba(245, 158, 11, 0.2)" : "rgba(56, 189, 248, 0.2)",
                          color: isCrit ? "#ef4444" : isHigh ? "#fbbf24" : "#38bdf8",
                        }}>
                          {ev.severity || "HIGH"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono, monospace)", color: "#cbd5e1" }}>
                        {ev.ip || "Unknown"}
                      </td>
                      <td style={{ padding: "7px 12px", color: "#f1f5f9" }}>
                        {ev.detail || ev.type}
                      </td>
                      <td style={{ padding: "7px 12px", color: "#34d399", fontWeight: 700 }}>
                        {ev.actionTaken || "BLOCKED"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
