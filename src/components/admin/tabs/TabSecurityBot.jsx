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

export default function TabSecurityBot(props) {
  const {
    botLoading,
    botSaveMessage,
    botSaving,
    botSettings,
    botStats,
    botTesting,
    handleRunInactivityPurge,
    handleSaveTopicRouting,
    handleTestAllTopics,
    handleTestBotAlert,
    handleToggleBotSetting,
    loadSecurityBotSettings,
    setBotSettings,
  } = props;

  

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
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#c084fc" }}>🤖</span> Telegram Security Bot Studio
                    </h3>
                    <span
                      style={{
                        background: "rgba(192, 132, 252, 0.15)",
                        border: "1px solid rgba(192, 132, 252, 0.4)",
                        color: "#c084fc",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                      }}
                    >
                      @fsm_security_otp_bot
                    </span>
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
                      🛡️ Single-Doc Quota Protected
                    </span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                    Live control center for Telegram OTP verification and real-time security alerts. Settings commit to a single Firestore document (<code>settings/security_bot</code>) with zero DB reads on auth events.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={loadSecurityBotSettings}
                    disabled={botLoading}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                  >
                    <RefreshCw size={14} className={botLoading ? "spin" : ""} />
                    <span>{botLoading ? "Refreshing..." : "Refresh Settings"}</span>
                  </button>
                </div>
              </div>

              {/* Status Alert Banner if saved */}
              {botSaveMessage && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    background: botSaveMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                    border: `1px solid ${botSaveMessage.type === "success" ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"}`,
                    color: botSaveMessage.type === "success" ? "#34d399" : "#f43f5e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{botSaveMessage.text}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>In-Memory Synced</span>
                </div>
              )}

              {/* Architecture & Quota Telemetry Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "14px",
                  marginBottom: "20px",
                }}
              >
                {/* Card 1: Firestore Quota Protection */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#10b981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Database size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>Database Quota Engine</div>
                      <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 700 }}>Single-Doc Commit Active</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", lineHeight: "1.4" }}>
                    Event dispatches read from <strong>In-Memory RAM</strong>. Zero document reads/writes on login, logout, or register events. Prevents Firestore free quota exhaustion.
                  </div>
                </div>

                {/* Card 2: Active Telegram Sessions */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(192, 132, 252, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "rgba(192, 132, 252, 0.15)",
                        color: "#c084fc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Bot size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>Bot Engine &amp; Poller</div>
                      <div style={{ fontSize: "0.7rem", color: "#c084fc", fontWeight: 700 }}>@fsm_security_otp_bot</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", lineHeight: "1.4" }}>
                    In-Flight Registration OTPs: <strong style={{ color: "#fff" }}>{botStats?.pendingRegistrationsCount ?? 0}</strong><br />
                    In-Flight Reset OTPs: <strong style={{ color: "#fff" }}>{botStats?.pendingPasswordResetsCount ?? 0}</strong>
                  </div>
                </div>

                {/* Card 3: Storage Doc Details */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>Settings Target Doc</div>
                      <div style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 700 }}>settings/security_bot</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", lineHeight: "1.4" }}>
                    Bot Config Saved: <strong style={{ color: "#fff" }}>{(() => {
                      try {
                        const d = new Date(botSettings?.updatedAt);
                        return isNaN(d.getTime()) ? "Boot Time" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
                      } catch {
                        return "Boot Time";
                      }
                    })()}</strong><br />
                    Storage Footprint: <span style={{ color: "#34d399", fontWeight: 700 }}>1 Document (&lt; 1 KB)</span>
                    <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "3px" }}>
                      💡 <i>Bot settings config in Firestore. (Note: Telegram Notes 2-Way Sync is live in Tab 2 &amp; Tab 3).</i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Switches Grid */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                      Operational Switchboard (Individual Controls)
                    </h4>
                    <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "3px 0 0" }}>
                      Toggle any security event ON or OFF instantly. The update commits immediately to the database and takes effect in under 5ms.
                    </p>
                  </div>
                  {botSaving && (
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <RefreshCw size={12} className="spin" />
                      Committing to Firestore...
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                  {/* Switch 1: OTP Generation & Dispatch */}
                  <div
                    style={{
                      background: botSettings?.enableOtp ? "rgba(16, 185, 129, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableOtp ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Key size={18} style={{ color: botSettings?.enableOtp ? "#10b981" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>1. Telegram OTP Verification</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableOtp ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableOtp ? "#34d399" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableOtp ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Allows students to request 6-digit OTP codes via <code>@fsm_security_otp_bot</code> for registration &amp; password reset. Turn OFF if you want to pause bot OTP requests.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableOtp")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableOtp ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableOtp ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableOtp ? "#34d399" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Power size={14} />
                      {botSettings?.enableOtp ? "OTP is ON (Click to Pause)" : "OTP is MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 2: New User Registration Alert */}
                  <div
                    style={{
                      background: botSettings?.enableRegisterNotice ? "rgba(6, 182, 212, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableRegisterNotice ? "rgba(6, 182, 212, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <UserCheck size={18} style={{ color: botSettings?.enableRegisterNotice ? "var(--accent-cyan)" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>2. New Registration Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableRegisterNotice ? "rgba(6, 182, 212, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableRegisterNotice ? "var(--accent-cyan)" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableRegisterNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Sends an immediate Telegram alert with student details (name, email, method, photo) whenever any new user registers. Turn OFF if you do not want registration notices.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableRegisterNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableRegisterNotice ? "rgba(6, 182, 212, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableRegisterNotice ? "rgba(6, 182, 212, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableRegisterNotice ? "var(--accent-cyan)" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableRegisterNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 3: User Login Notice */}
                  <div
                    style={{
                      background: botSettings?.enableLoginNotice ? "rgba(129, 140, 248, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableLoginNotice ? "rgba(129, 140, 248, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <ShieldCheck size={18} style={{ color: botSettings?.enableLoginNotice ? "#818cf8" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>3. User Login Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableLoginNotice ? "rgba(129, 140, 248, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableLoginNotice ? "#a5b4fc" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableLoginNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Sends an instant security log to the bot whenever any student or admin signs in. Turn OFF if you do not want login notifications filling up your Telegram.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableLoginNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableLoginNotice ? "rgba(129, 140, 248, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableLoginNotice ? "rgba(129, 140, 248, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableLoginNotice ? "#a5b4fc" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableLoginNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 4: User Logout Notice */}
                  <div
                    style={{
                      background: botSettings?.enableLogoutNotice ? "rgba(245, 158, 11, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableLogoutNotice ? "rgba(245, 158, 11, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <UserX size={18} style={{ color: botSettings?.enableLogoutNotice ? "#fbbf24" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>4. User Logout Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableLogoutNotice ? "rgba(245, 158, 11, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableLogoutNotice ? "#fcd34d" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableLogoutNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Sends a notification whenever a student or admin logs out. Has its own dedicated topic so login and logout never mix.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableLogoutNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableLogoutNotice ? "rgba(245, 158, 11, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableLogoutNotice ? "rgba(245, 158, 11, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableLogoutNotice ? "#fcd34d" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <BellOff size={14} />
                      {botSettings?.enableLogoutNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 5: Security & Profile Updates Notice */}
                  <div
                    style={{
                      background: botSettings?.enableSecurityNotice ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableSecurityNotice ? "rgba(239, 68, 68, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <AlertTriangle size={18} style={{ color: botSettings?.enableSecurityNotice ? "#ef4444" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>5. Security &amp; Profile Updates</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableSecurityNotice ? "rgba(239, 68, 68, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableSecurityNotice ? "#f87171" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableSecurityNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Instant alert when a user changes their mobile number, fails 2FA, or triggers a security challenge.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableSecurityNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableSecurityNotice ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableSecurityNotice ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableSecurityNotice ? "#f87171" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <ShieldCheck size={14} />
                      {botSettings?.enableSecurityNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 6: OTP Audit Logs Notice */}
                  <div
                    style={{
                      background: botSettings?.enableOtpAuditNotice ? "rgba(168, 85, 247, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableOtpAuditNotice ? "rgba(168, 85, 247, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Key size={18} style={{ color: botSettings?.enableOtpAuditNotice ? "#c084fc" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>6. OTP Audit Logs</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableOtpAuditNotice ? "rgba(168, 85, 247, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableOtpAuditNotice ? "#c084fc" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableOtpAuditNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Administrative audit record when an OTP is dispatched. (Real 6-digit OTP remains strictly private in student 1-on-1 DM).
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableOtpAuditNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableOtpAuditNotice ? "rgba(168, 85, 247, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableOtpAuditNotice ? "rgba(168, 85, 247, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableOtpAuditNotice ? "#c084fc" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableOtpAuditNotice ? "Logs are ON (Click to Mute)" : "Logs MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 7: Note Upload Notice */}
                  <div
                    style={{
                      background: botSettings?.enableNoteUploadNotice ? "rgba(20, 184, 166, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableNoteUploadNotice ? "rgba(20, 184, 166, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Upload size={18} style={{ color: botSettings?.enableNoteUploadNotice ? "#14b8a6" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>7. Note Upload Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableNoteUploadNotice ? "rgba(20, 184, 166, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableNoteUploadNotice ? "#2dd4bf" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableNoteUploadNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Instant notification when study material is uploaded (uploader name, email, branch, title, size). Notice text only (zero PDF file attached).
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableNoteUploadNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableNoteUploadNotice ? "rgba(20, 184, 166, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableNoteUploadNotice ? "rgba(20, 184, 166, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableNoteUploadNotice ? "#2dd4bf" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableNoteUploadNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* Switch 8: Note Download Notice */}
                  <div
                    style={{
                      background: botSettings?.enableNoteDownloadNotice ? "rgba(59, 130, 246, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableNoteDownloadNotice ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Download size={18} style={{ color: botSettings?.enableNoteDownloadNotice ? "#3b82f6" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>8. Note Download Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableNoteDownloadNotice ? "rgba(59, 130, 246, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableNoteDownloadNotice ? "#60a5fa" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableNoteDownloadNotice ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Instant notification with complete student downloader and document details (student name, email, mobile, note title, count, CDN stream method).
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableNoteDownloadNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableNoteDownloadNotice ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableNoteDownloadNotice ? "rgba(59, 130, 246, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableNoteDownloadNotice ? "#60a5fa" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableNoteDownloadNotice ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* SWITCH 9: LIVE STUDENT OTP NOTICES */}
                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid rgba(236, 72, 153, 0.25)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Key size={18} style={{ color: botSettings?.enableUserOtpNotice !== false ? "#f472b6" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>9. Live Student OTP Feed</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableUserOtpNotice !== false ? "rgba(236, 72, 153, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableUserOtpNotice !== false ? "#f472b6" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableUserOtpNotice !== false ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Real-time feed of live 6-digit OTP codes in the dedicated 7th Supergroup topic so you can manually assist students.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableUserOtpNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableUserOtpNotice !== false ? "rgba(236, 72, 153, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableUserOtpNotice !== false ? "rgba(236, 72, 153, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableUserOtpNotice !== false ? "#f472b6" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableUserOtpNotice !== false ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>

                  {/* SWITCH 10: 90-DAY INACTIVE ACCOUNT PURGE NOTICES */}
                  <div
                    style={{
                      background: botSettings?.enableAccountPurgeNotice !== false ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${botSettings?.enableAccountPurgeNotice !== false ? "rgba(239, 68, 68, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Trash2 size={18} style={{ color: botSettings?.enableAccountPurgeNotice !== false ? "#f87171" : "var(--text-dim)" }} />
                          <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.88rem" }}>10. Inactive Account Purge Notice</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background: botSettings?.enableAccountPurgeNotice !== false ? "rgba(239, 68, 68, 0.2)" : "rgba(244, 63, 94, 0.2)",
                            color: botSettings?.enableAccountPurgeNotice !== false ? "#f87171" : "#f43f5e",
                          }}
                        >
                          {botSettings?.enableAccountPurgeNotice !== false ? "ENABLED" : "MUTED"}
                        </span>
                      </div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", margin: 0, lineHeight: "1.4" }}>
                        Automatically purges accounts inactive for over 90 days and sends their complete file history &amp; download dossier to Topic 8. Turn OFF if you do not want Telegram purge notices.
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleBotSetting("enableAccountPurgeNotice")}
                      disabled={botSaving}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        background: botSettings?.enableAccountPurgeNotice !== false ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${botSettings?.enableAccountPurgeNotice !== false ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                        color: botSettings?.enableAccountPurgeNotice !== false ? "#f87171" : "#cbd5e1",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Bell size={14} />
                      {botSettings?.enableAccountPurgeNotice !== false ? "Alerts are ON (Click to Mute)" : "Alerts MUTED (Click to Enable)"}
                    </button>
                  </div>
                </div>
              </div>

              {/* 8 DEDICATED FORUM TOPICS ROUTING CONFIGURATION CARD */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(192, 132, 252, 0.3)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ fontSize: "0.98rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🗂️</span> 7 Dedicated Telegram Forum Topics (Zero-Clutter Architecture)
                    </h4>
                    <p style={{ fontSize: "0.76rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                      Organize all security alerts into 7 separate tabs in your Telegram Supergroup. Each topic receives only its relevant event via <code>message_thread_id</code>.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveTopicRouting}
                    disabled={botSaving}
                    className="btn-primary"
                    style={{ fontSize: "0.82rem", padding: "8px 18px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <span>{botSaving ? "Saving..." : "💾 Save Topic Routing"}</span>
                  </button>
                </div>

                {/* Group Chat ID Input */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#e2e8f0", display: "block", marginBottom: "6px" }}>
                    Telegram Supergroup Chat ID (Starts with -100...)
                  </label>
                  <input
                    type="text"
                    value={botSettings?.topicGroupChatId || ""}
                    onChange={(e) => setBotSettings({ ...botSettings, topicGroupChatId: e.target.value })}
                    placeholder="e.g. -100xxxxxxxxxx (Leave empty to use default TELEGRAM_OTP_CHAT_ID)"
                    style={{
                      width: "100%",
                      padding: "9px 14px",
                      borderRadius: "8px",
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#fff",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                {/* 7 Topic Inputs Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                  {/* Topic 1: New Registration */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#34d399", marginBottom: "4px" }}>
                      🟢 1. New Registrations Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Student Name (with TG handle), College, Year, Mobile.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.newRegistration || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), newRegistration: e.target.value }
                      })}
                      placeholder="e.g. 2"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 2: Logins */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(129, 140, 248, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#a5b4fc", marginBottom: "4px" }}>
                      🔐 2. Logins Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Student and Admin active session logins.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.logins || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), logins: e.target.value }
                      })}
                      placeholder="e.g. 4"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(129, 140, 248, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 3: Logouts */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fbbf24", marginBottom: "4px" }}>
                      🚪 3. Logouts Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Dedicated thread for user session termination.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.logouts || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), logouts: e.target.value }
                      })}
                      placeholder="e.g. 6"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 4: Security & Profile Updates */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f87171", marginBottom: "4px" }}>
                      🚨 4. Security &amp; Profile Updates Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Mobile number edits, 2FA challenges, security alerts.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.securityUpdates || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), securityUpdates: e.target.value }
                      })}
                      placeholder="e.g. 8"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 5: OTP Audit Logs */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#c084fc", marginBottom: "4px" }}>
                      🔑 5. OTP Audit Logs Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Admin audit trail of OTP dispatches (Real OTP stays private in DM).
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.otpAudit || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), otpAudit: e.target.value }
                      })}
                      placeholder="e.g. 10"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 6: Notes Activity (Uploads & Downloads) */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(20, 184, 166, 0.25)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#2dd4bf", marginBottom: "4px" }}>
                      📚 6. Notes Activity Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Student uploads (notice only, zero PDF) and note download streams.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.notesActivity || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), notesActivity: e.target.value }
                      })}
                      placeholder="e.g. 12"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(20, 184, 166, 0.3)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 7: Live Student OTP Feed */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(236, 72, 153, 0.35)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f472b6", marginBottom: "4px" }}>
                      🔑 7. Live Student OTP Feed Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Real-time 6-digit OTP codes for manual student assistance &amp; sharing.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.userOtp || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), userOtp: e.target.value }
                      })}
                      placeholder="e.g. 14"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(236, 72, 153, 0.4)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>

                  {/* Topic 8: 90-Day Inactive Account Purge */}
                  <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(239, 68, 68, 0.35)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f87171", marginBottom: "4px" }}>
                      🗑️ 8. 90-Day Inactive Account Purge Topic ID
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      Full file upload history, download counts, and inactivity dossiers for auto-purged accounts.
                    </div>
                    <input
                      type="text"
                      value={botSettings?.topics?.accountPurge || ""}
                      onChange={(e) => setBotSettings({
                        ...botSettings,
                        topics: { ...(botSettings?.topics || {}), accountPurge: e.target.value }
                      })}
                      placeholder="e.g. 16"
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        color: "#fff",
                        fontSize: "0.82rem",
                      }}
                    />
                  </div>
                </div>

                {/* Automated Subject Topic Routing Banner */}
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    background: "rgba(99, 102, 241, 0.1)",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "1.2rem" }}>⚡</span>
                  <div style={{ fontSize: "0.74rem", color: "#cbd5e1", lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--accent-cyan)" }}>Smart Automated Subject Topic Routing:</strong>{" "}
                    When a note is uploaded for any subject (e.g. <i>Web Design</i>, <i>Machine Learning</i>), the Security Bot automatically checks your Telegram Supergroup, creates a dedicated topic with <code>📚 Subject Name</code> if not yet existing, and routes all future notes for that subject into it!
                  </div>
                </div>
              </div>

              {/* Bot Diagnostic & Test Trigger Section */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ fontSize: "0.92rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                      ⚡ Diagnostic Test Triggers (Instant Topic Verification)
                    </h4>
                    <p style={{ fontSize: "0.74rem", color: "var(--text-dim)", margin: "2px 0 0" }}>
                      Send an instant test alert to verify bot connectivity and verify that each message arrives in its designated topic.
                    </p>
                  </div>
                  <button
                    onClick={handleTestAllTopics}
                    disabled={botTesting}
                    className="btn-primary"
                    style={{ fontSize: "0.78rem", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px", background: "linear-gradient(135deg, #8b5cf6, #06b6d4)" }}
                  >
                    <span>🚀 Test All Topics at Once</span>
                  </button>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleTestBotAlert("REGISTER")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(16, 185, 129, 0.3)" }}
                  >
                    <span>🟢 Test 1. Registration Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("LOGIN")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(129, 140, 248, 0.3)" }}
                  >
                    <span>🔐 Test 2. Login Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("LOGOUT")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(245, 158, 11, 0.3)" }}
                  >
                    <span>🚪 Test 3. Logout Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("SECURITY_ALERT")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(239, 68, 68, 0.3)" }}
                  >
                    <span>🚨 Test 4. Security &amp; Profile Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("OTP_AUDIT")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(168, 85, 247, 0.3)" }}
                  >
                    <span>🔑 Test 5. OTP Audit Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("NOTE_UPLOAD")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(20, 184, 166, 0.3)" }}
                  >
                    <span>📤 Test 6. Note Upload Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("NOTE_DOWNLOAD")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(59, 130, 246, 0.3)" }}
                  >
                    <span>📥 Test 7. Note Download Notice</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("USER_OTP")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(236, 72, 153, 0.4)", color: "#f472b6" }}
                  >
                    <span>🔑 Test 8. Live Student OTP Feed</span>
                  </button>

                  <button
                    onClick={() => handleTestBotAlert("ACCOUNT_PURGE")}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(239, 68, 68, 0.4)", color: "#f87171" }}
                  >
                    <span>🗑️ Test 9. Inactive Account Purge Notice</span>
                  </button>

                  <button
                    onClick={handleRunInactivityPurge}
                    disabled={botTesting}
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px", borderColor: "rgba(245, 158, 11, 0.4)", color: "#fbbf24" }}
                  >
                    <span>⚡ Run 90-Day Inactive Account Check Now</span>
                  </button>
                </div>
              </div>
            </div>
  );
}
