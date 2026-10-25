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

const MASTER_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
const isMasterAdminSender = (sender) => {
  if (!sender) return false;
  if (sender.isMainAdmin || sender.isMasterAdmin) return true;
  if (MASTER_ADMIN_EMAIL && sender.email && sender.email.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return false;
};

export default function TabCommunityChat(props) {
  const {
    chatAttachment,
    chatBotActionMsg,
    chatBotLoading,
    chatBotSaving,
    chatBotSettings,
    chatFileInputRef,
    chatInputText,
    chatLoading,
    chatMessages,
    chatNoticeText,
    chatOnlineCount,
    chatRooms,
    chatScrollRef,
    chatSending,
    chatTelemetry,
    chatWsConnected,
    currentNotice,
    formatChatTime,
    getChatUserColor,
    handleAdjustStudentPurgeDaysByQuery,
    handleAdminBlockChatStudent,
    handleAdminCreatePod,
    handleAdminDeleteMessage,
    handleAdminPurgeRoom,
    handleAdminSendMessage,
    handleAdminUpdateNotice,
    handlePruneRetentionMessages,
    handlePurgeInactivePods,
    handleTestChatBotPing,
    isUpdatingNotice,
    loadAdminChat,
    loadChatBotTelemetry,
    newPodName,
    newPodSecret,
    purgeStudentDays,
    purgeStudentLoading,
    purgeStudentQuery,
    saveChatBotSettings,
    selectedChatRoomId,
    setChatAttachment,
    setChatBotSettings,
    setChatInputText,
    setChatNoticeText,
    setNewPodName,
    setNewPodSecret,
    setPurgeStudentDays,
    setPurgeStudentQuery,
    setSelectedChatRoomId,
    setShowChatBotPanel,
    setShowCreatePodModal,
    setShowNoticeEditor,
    showChatBotPanel,
    showCreatePodModal,
    showNoticeEditor,
  } = props;

  

  return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "680px", gap: "14px" }}>
              {/* Header Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  padding: "14px 18px",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#f472b6" }}>💬</span> Community Study Chat Hub & Real-Time Moderation
                    </h3>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: chatWsConnected ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: chatWsConnected ? "#4ade80" : "#f87171",
                        border: `1px solid ${chatWsConnected ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: chatWsConnected ? "#4ade80" : "#f87171" }} />
                      {chatWsConnected ? "Live WebSocket (0ms)" : "Connecting..."}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "rgba(56, 189, 248, 0.12)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.25)",
                      }}
                    >
                      👥 {chatOnlineCount || 1} Active in Room
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Monitor public community rooms, private student pods, delete offending content, ban spammers, and broadcast announcements.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      setShowChatBotPanel(true);
                      loadChatBotTelemetry();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(56, 189, 248, 0.25))",
                      border: "1.5px solid #38bdf8",
                      color: "#38bdf8",
                      cursor: "pointer",
                      boxShadow: "0 2px 10px rgba(6, 182, 212, 0.2)",
                    }}
                    title="Open Bot Controller & Turso Retention Settings Card"
                  >
                    <Bot size={14} />
                    <span>🤖 Bot Controller &amp; Turso Retention</span>
                  </button>

                  <button
                    onClick={() => setShowNoticeEditor(!showNoticeEditor)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      borderRadius: "8px",
                      background: showNoticeEditor ? "rgba(251, 191, 36, 0.25)" : "rgba(251, 191, 36, 0.12)",
                      border: "1px solid rgba(251, 191, 36, 0.35)",
                      color: "#fbbf24",
                      cursor: "pointer",
                    }}
                  >
                    <Megaphone size={14} />
                    <span>{showNoticeEditor ? "Close Notice" : "📢 Pinned Notice"}</span>
                  </button>

                  <button
                    onClick={() => setShowCreatePodModal(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      borderRadius: "8px",
                      background: "rgba(167, 139, 250, 0.15)",
                      border: "1px solid rgba(167, 139, 250, 0.3)",
                      color: "#c084fc",
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={14} />
                    <span>Create Study Pod</span>
                  </button>

                  <button
                    onClick={handleAdminPurgeRoom}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      borderRadius: "8px",
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      color: "#f87171",
                      cursor: "pointer",
                    }}
                    title="Clear all messages in the selected room"
                  >
                    <Trash2 size={14} />
                    <span>Purge Room</span>
                  </button>

                  <button
                    onClick={() => loadAdminChat(selectedChatRoomId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <RefreshCw size={14} className={chatLoading ? "spin" : ""} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Pinned Notice Editor Drawer */}
              {showNoticeEditor && (
                <div
                  style={{
                    background: "rgba(251, 191, 36, 0.08)",
                    border: "1px solid rgba(251, 191, 36, 0.25)",
                    borderRadius: "10px",
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Megaphone size={16} /> Broadcast Pinned Chat Notice (Visible to all students at top of chat)
                    </div>
                    {currentNotice?.updatedAt && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                        Last updated by {currentNotice.updatedBy || "Admin"} • {new Date(currentNotice.updatedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <input
                      type="text"
                      value={chatNoticeText}
                      onChange={(e) => setChatNoticeText(e.target.value)}
                      placeholder="e.g. Welcome students! Final semester notes have been uploaded to Notes Vault. Please maintain study decorum."
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(251, 191, 36, 0.3)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "0.85rem",
                      }}
                    />
                    <button
                      onClick={handleAdminUpdateNotice}
                      disabled={isUpdatingNotice || !chatNoticeText.trim()}
                      style={{
                        padding: "9px 18px",
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        border: "none",
                        borderRadius: "8px",
                        color: "#000",
                        fontWeight: 800,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Save size={14} />
                      <span>{isUpdatingNotice ? "Broadcasting..." : "Save & Broadcast"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Status & Turso Retention Indicator Bar (Always Visible) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(15, 23, 42, 0.65)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.8rem", color: "#38bdf8", fontWeight: 700 }}>
                    <Bot size={15} /> 🤖 Bot Controller: <code style={{ color: "#fff", background: "rgba(6, 182, 212, 0.2)", padding: "1px 6px", borderRadius: "4px" }}>@fsm_chat_bot</code>
                  </span>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>•</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.8rem", color: "#fbbf24", fontWeight: 700 }}>
                    <Clock size={14} /> 🗄️ Turso Retention: Messages auto-delete after <strong style={{ color: "#fff" }}>{chatBotSettings.chatRetentionDays || 7} Days</strong>
                  </span>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-dim)" }}>•</span>
                  <span style={{ fontSize: "0.76rem", color: "#34d399", fontWeight: 700 }}>
                    Messages in Turso: {chatTelemetry?.turso?.chatMessagesCount ?? 0}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setShowChatBotPanel(true);
                    loadChatBotTelemetry();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 16px",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #0284c7, #06b6d4)",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(6, 182, 212, 0.35)",
                  }}
                >
                  <Bot size={15} />
                  <span>⚙️ Open Bot Controller &amp; Turso Retention Card</span>
                </button>
              </div>

              {/* DEDICATED NEW MODAL CARD POPUP FOR BOT CONTROLLER & TURSO RETENTION */}
              {showChatBotPanel && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.8)",
                    backdropFilter: "blur(8px)",
                    zIndex: 999999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "20px",
                  }}
                  onClick={() => setShowChatBotPanel(false)}
                >
                  <div
                    style={{
                      background: "#0b1329",
                      border: "1.5px solid rgba(6, 182, 212, 0.5)",
                      borderRadius: "16px",
                      maxWidth: "940px",
                      width: "100%",
                      maxHeight: "92vh",
                      overflowY: "auto",
                      boxShadow: "0 25px 70px rgba(0, 0, 0, 0.85)",
                      padding: "24px 28px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "18px",
                      position: "relative",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Close 'X' Button at Top-Right */}
                    <button
                      onClick={() => setShowChatBotPanel(false)}
                      style={{
                        position: "absolute",
                        top: "16px",
                        right: "16px",
                        width: "34px",
                        height: "34px",
                        borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#fff",
                        fontSize: "16px",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Close Card"
                    >
                      ✕
                    </button>

                    {/* Card Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", paddingRight: "40px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "10px",
                            background: "rgba(6, 182, 212, 0.2)",
                            color: "var(--accent-cyan)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Bot size={24} />
                        </div>
                        <div>
                          <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>Dedicated Bot Controller &amp; Turso Retention Manager</span>
                            <code style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", background: "rgba(6, 182, 212, 0.15)", padding: "2px 8px", borderRadius: "4px" }}>
                              @fsm_chat_bot
                            </code>
                          </div>
                          <div style={{ fontSize: "0.76rem", color: "var(--text-dim)", marginTop: "2px" }}>
                            Turso LibSQL edge database message auto-delete retention, Supergroup forum topics, and real-time public community sync.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: "999px",
                            background: (chatTelemetry?.turso?.connected ?? true) ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                            color: (chatTelemetry?.turso?.connected ?? true) ? "#34d399" : "#f43f5e",
                            border: `1px solid ${(chatTelemetry?.turso?.connected ?? true) ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                          }}
                        >
                          TURSO: {(chatTelemetry?.turso?.connected ?? true) ? "SYNCED" : "OFFLINE"} ({chatTelemetry?.turso?.latencyMs ? `${chatTelemetry.turso.latencyMs}ms` : "< 10ms"})
                        </span>
                      </div>
                    </div>

                    {/* 🔥 1. PROMINENT TURSO CHAT RETENTION & AUTO-DELETE LIFECYCLE CARD */}
                    <div
                      style={{
                        background: "linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(245, 158, 11, 0.12))",
                        border: "1.5px solid rgba(6, 182, 212, 0.4)",
                        borderRadius: "12px",
                        padding: "16px 20px",
                        boxShadow: "0 4px 20px rgba(6, 182, 212, 0.15)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Clock size={18} />
                          </div>
                          <div>
                            <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>🗄️ Turso Database Retention &amp; Auto-Delete Policy Hub</span>
                              <span style={{ fontSize: "0.68rem", background: "#f59e0b", color: "#000", fontWeight: 800, padding: "2px 7px", borderRadius: "4px" }}>
                                ACTIVE POLICY
                              </span>
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "2px" }}>
                              Configure automated rolling retention policies for purging expired chat messages and inactive private study pods from the Turso Edge Database.
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "0.74rem", color: "#34d399", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 700 }}>
                            Turso Messages: {chatTelemetry?.turso?.chatMessagesCount ?? 0}
                          </span>
                          <span style={{ fontSize: "0.74rem", color: "#a78bfa", background: "rgba(167, 139, 250, 0.12)", border: "1px solid rgba(167, 139, 250, 0.25)", padding: "4px 10px", borderRadius: "6px", fontWeight: 700 }}>
                            Pod Audits: {chatTelemetry?.turso?.auditsCount ?? 0}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                        {/* Box 1: Chat Messages Retention Days */}
                        <div style={{ background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(6, 182, 212, 0.3)", borderRadius: "10px", padding: "14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#38bdf8" }}>
                              💬 Chat Messages Retention Days:
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={chatBotSettings.chatRetentionDays || 7}
                                onChange={(e) => setChatBotSettings((prev) => ({ ...prev, chatRetentionDays: Number(e.target.value) || 7 }))}
                                style={{
                                  width: "60px",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  background: "rgba(255, 255, 255, 0.1)",
                                  border: "1.5px solid #38bdf8",
                                  color: "#fff",
                                  fontSize: "0.85rem",
                                  textAlign: "center",
                                  fontWeight: 800,
                                }}
                              />
                              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8" }}>Days</span>
                            </div>
                          </div>
                          <p style={{ margin: "0 0 10px", fontSize: "0.74rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                            Public and private messages older than <strong>{chatBotSettings.chatRetentionDays || 7} days</strong> are permanently deleted from Turso LibSQL table <code>chat_messages</code> and server memory.
                          </p>
                          <button
                            onClick={handlePruneRetentionMessages}
                            disabled={chatBotLoading}
                            style={{
                              width: "100%",
                              padding: "7px 12px",
                              borderRadius: "8px",
                              background: "rgba(239, 68, 68, 0.18)",
                              border: "1px solid rgba(239, 68, 68, 0.4)",
                              color: "#f87171",
                              fontWeight: 800,
                              fontSize: "0.76rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <Trash2 size={13} />
                            <span>{chatBotLoading ? "Pruning..." : `🧹 Prune Turso Messages Older Than ${chatBotSettings.chatRetentionDays || 7} Days Now`}</span>
                          </button>
                        </div>

                        {/* Box 2: Private Pods Inactivity Days */}
                        <div style={{ background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "10px", padding: "14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#fbbf24" }}>
                              🔒 Private Pods Inactivity Days:
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="number"
                                min="1"
                                max="180"
                                value={chatBotSettings.privateRoomInactivityDays || 7}
                                onChange={(e) => setChatBotSettings((prev) => ({ ...prev, privateRoomInactivityDays: Number(e.target.value) || 7 }))}
                                style={{
                                  width: "60px",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  background: "rgba(255, 255, 255, 0.1)",
                                  border: "1.5px solid #fbbf24",
                                  color: "#fff",
                                  fontSize: "0.85rem",
                                  textAlign: "center",
                                  fontWeight: 800,
                                }}
                              />
                              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fbbf24" }}>Days</span>
                            </div>
                          </div>
                          <p style={{ margin: "0 0 10px", fontSize: "0.74rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                            Private study pods inactive for <strong>{chatBotSettings.privateRoomInactivityDays || 7} days</strong> have their forensic transcripts archived to Turso Vault before the room is permanently purged.
                          </p>
                          <button
                            onClick={handlePurgeInactivePods}
                            disabled={chatBotLoading}
                            style={{
                              width: "100%",
                              padding: "7px 12px",
                              borderRadius: "8px",
                              background: "rgba(245, 158, 11, 0.18)",
                              border: "1px solid rgba(245, 158, 11, 0.4)",
                              color: "#fbbf24",
                              fontWeight: 800,
                              fontSize: "0.76rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <Flame size={13} />
                            <span>{chatBotLoading ? "Purging..." : `🧹 Sweep Inactive Pods (${chatBotSettings.privateRoomInactivityDays || 7}d) Now`}</span>
                          </button>
                        </div>

                        {/* Box 3: Student Inactivity & Auto-Purge Days Controller */}
                        <div style={{ gridColumn: "1 / -1", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "10px", padding: "14px", marginTop: "4px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#38bdf8" }}>
                                ⚡ Student Account Inactivity &amp; Auto-Purge Days Controller
                              </span>
                              <span style={{ fontSize: "0.68rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                                Live Bot &amp; Admin Sync
                              </span>
                            </div>
                            <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                              Increase, decrease, or set purge retention for any specific student
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                            <div style={{ flex: 1, minWidth: "220px" }}>
                              <input
                                type="text"
                                placeholder="Enter student email, mobile, or student ID..."
                                value={purgeStudentQuery}
                                onChange={(e) => setPurgeStudentQuery(e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  background: "rgba(255, 255, 255, 0.08)",
                                  border: "1px solid rgba(56, 189, 248, 0.35)",
                                  color: "#fff",
                                  fontSize: "0.8rem",
                                }}
                              />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="number"
                                min="1"
                                max="3650"
                                value={purgeStudentDays}
                                onChange={(e) => setPurgeStudentDays(Number(e.target.value) || 15)}
                                style={{
                                  width: "55px",
                                  padding: "7px 6px",
                                  borderRadius: "6px",
                                  background: "rgba(255, 255, 255, 0.08)",
                                  border: "1px solid rgba(255, 255, 255, 0.2)",
                                  color: "#fff",
                                  fontSize: "0.8rem",
                                  textAlign: "center",
                                  fontWeight: 800,
                                }}
                                title="Days step"
                              />
                              <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Days</span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <button
                                onClick={() => handleAdjustStudentPurgeDaysByQuery(purgeStudentQuery, "increase", purgeStudentDays)}
                                disabled={purgeStudentLoading}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  background: "rgba(34, 197, 94, 0.2)",
                                  border: "1px solid rgba(34, 197, 94, 0.4)",
                                  color: "#4ade80",
                                  fontSize: "0.74rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                +{purgeStudentDays}d Extend
                              </button>

                              <button
                                onClick={() => handleAdjustStudentPurgeDaysByQuery(purgeStudentQuery, "decrease", purgeStudentDays)}
                                disabled={purgeStudentLoading}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  background: "rgba(239, 68, 68, 0.2)",
                                  border: "1px solid rgba(239, 68, 68, 0.4)",
                                  color: "#f87171",
                                  fontSize: "0.74rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                -{purgeStudentDays}d Reduce
                              </button>

                              <button
                                onClick={() => handleAdjustStudentPurgeDaysByQuery(purgeStudentQuery, "set", purgeStudentDays)}
                                disabled={purgeStudentLoading}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  background: "rgba(56, 189, 248, 0.2)",
                                  border: "1px solid rgba(56, 189, 248, 0.4)",
                                  color: "#38bdf8",
                                  fontSize: "0.74rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Set to {purgeStudentDays}d
                              </button>

                              <button
                                onClick={() => handleAdjustStudentPurgeDaysByQuery(purgeStudentQuery, "toggle_immunity", 9999)}
                                disabled={purgeStudentLoading}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  background: "rgba(167, 139, 250, 0.2)",
                                  border: "1px solid rgba(167, 139, 250, 0.4)",
                                  color: "#c084fc",
                                  fontSize: "0.74rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                                title="Toggle immunity (Student will never be purged)"
                              >
                                🛡️ Never Purge
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Software Telemetry Strip */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                        background: "rgba(15, 23, 42, 0.5)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        borderRadius: "10px",
                        padding: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>Turso Cloud Messages</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#34d399", marginTop: "2px" }}>
                          {chatTelemetry?.turso?.chatMessagesCount ?? 0}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Permanent Relational Table</div>
                      </div>

                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>Private Pod Audits</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#a78bfa", marginTop: "2px" }}>
                          {chatTelemetry?.turso?.auditsCount ?? 0}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Unredacted Transcripts Saved</div>
                      </div>

                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>Active Rooms &amp; Sockets</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", marginTop: "2px" }}>
                          {chatTelemetry?.chatStats?.totalRooms ?? chatRooms.length} <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-dim)" }}>({chatTelemetry?.chatStats?.connectedSocketsCount ?? 1} sockets)</span>
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>Sub-10ms In-Memory Cluster</div>
                      </div>

                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>Auto-Purge Guardians</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fbbf24", marginTop: "2px" }}>
                          Active (Turso)
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>{chatBotSettings.privateRoomInactivityDays || 7}-Day Inactive Pod Purge</div>
                      </div>
                    </div>

                    {/* 3. Bot Features & Telegram Forum Topics Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                      {/* Features */}
                      <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "10px", padding: "12px" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
                          🤖 Bot Features &amp; Telegram Mirroring
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e2e8f0" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(chatBotSettings.enablePublicChatSync)}
                              onChange={(e) => setChatBotSettings((prev) => ({ ...prev, enablePublicChatSync: e.target.checked }))}
                            />
                            <span>
                              Sync Public Hall messages to Telegram (@fsm_chat_bot){" "}
                              <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: chatBotSettings.enablePublicChatSync ? "rgba(34,197,94,0.2)" : "rgba(148,163,184,0.15)", color: chatBotSettings.enablePublicChatSync ? "#4ade80" : "#94a3b8" }}>
                                {chatBotSettings.enablePublicChatSync ? "🟢 Active" : "⏸️ Inactive (Click to Activate)"}
                              </span>
                            </span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e2e8f0" }}>
                            <input
                              type="checkbox"
                              checked={chatBotSettings.enableChatAudit !== false}
                              onChange={(e) => setChatBotSettings((prev) => ({ ...prev, enableChatAudit: e.target.checked }))}
                            />
                            <span>Send closed private pod forensic audits</span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e2e8f0" }}>
                            <input
                              type="checkbox"
                              checked={chatBotSettings.enableMediaVaultUpload !== false}
                              onChange={(e) => setChatBotSettings((prev) => ({ ...prev, enableMediaVaultUpload: e.target.checked }))}
                            />
                            <span>Archive student attachments in Telegram Media Vault</span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#e2e8f0" }}>
                            <input
                              type="checkbox"
                              checked={chatBotSettings.enableDeletedMessageAlerts !== false}
                              onChange={(e) => setChatBotSettings((prev) => ({ ...prev, enableDeletedMessageAlerts: e.target.checked }))}
                            />
                            <span>Send real-time deleted message forensic alerts</span>
                          </label>
                        </div>
                      </div>

                      {/* Supergroup Topics */}
                      <div style={{ background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "10px", padding: "12px" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
                          📢 Telegram Supergroup ID &amp; Forum Topics
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "var(--text-dim)" }}>Supergroup ID:</span>
                            <input
                              type="text"
                              value={chatBotSettings.supergroupId || ""}
                              placeholder="Configured in .env"
                              onChange={(e) => setChatBotSettings((prev) => ({ ...prev, supergroupId: e.target.value }))}
                              style={{ width: "135px", padding: "3px 6px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "0.72rem" }}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: chatBotSettings.topics?.publicChat === "1" ? "rgba(34, 197, 94, 0.12)" : "rgba(56, 189, 248, 0.08)", border: `1px solid ${chatBotSettings.topics?.publicChat === "1" ? "rgba(34, 197, 94, 0.4)" : "rgba(56, 189, 248, 0.3)"}`, borderRadius: "8px", padding: "10px 12px", marginTop: "4px" }}>
                            <div>
                              <div style={{ color: chatBotSettings.topics?.publicChat === "1" ? "#4ade80" : "#38bdf8", fontSize: "0.8rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>🎯 Target Public Chat Topic ID:</span>
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "2px" }}>
                                Subtopics &amp; Pods: <strong style={{ color: "#f87171" }}>🔇 Suppressed (Public Chat Only)</strong>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input
                                type="text"
                                value={chatBotSettings.topics?.publicChat || "1"}
                                onChange={(e) => setChatBotSettings((prev) => ({ ...prev, topics: { ...prev.topics, publicChat: e.target.value } }))}
                                placeholder="1"
                                style={{ width: "50px", padding: "4px 6px", borderRadius: "6px", background: "rgba(0,0,0,0.5)", border: `1.5px solid ${chatBotSettings.topics?.publicChat === "1" ? "#4ade80" : "#38bdf8"}`, color: chatBotSettings.topics?.publicChat === "1" ? "#4ade80" : "#38bdf8", fontSize: "0.85rem", textAlign: "center", fontWeight: 800 }}
                              />
                              <button
                                type="button"
                                onClick={() => setChatBotSettings((prev) => ({ ...prev, topics: { ...prev.topics, publicChat: "1" } }))}
                                style={{
                                  background: chatBotSettings.topics?.publicChat === "1" ? "rgba(34, 197, 94, 0.25)" : "rgba(255, 255, 255, 0.06)",
                                  border: `1px solid ${chatBotSettings.topics?.publicChat === "1" ? "#4ade80" : "rgba(255, 255, 255, 0.15)"}`,
                                  color: chatBotSettings.topics?.publicChat === "1" ? "#4ade80" : "#cbd5e1",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                                title="Switch to Unified Mode: sends messages, media and deleted logs directly to Topic 1"
                              >
                                ⚡ Use Topic 1
                              </button>
                              <button
                                type="button"
                                onClick={() => setChatBotSettings((prev) => ({ ...prev, topics: { ...prev.topics, publicChat: "39" } }))}
                                style={{
                                  background: chatBotSettings.topics?.publicChat === "39" ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.06)",
                                  border: `1px solid ${chatBotSettings.topics?.publicChat === "39" ? "#38bdf8" : "rgba(255, 255, 255, 0.15)"}`,
                                  color: chatBotSettings.topics?.publicChat === "39" ? "#38bdf8" : "#cbd5e1",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                                title="Separate Mode: sends public messages to Topic 39, deleted alerts to Topic 35"
                              >
                                🎯 Topic 39
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Topic Mode Banner */}
                          {chatBotSettings.topics?.publicChat === "1" ? (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                background: "rgba(34, 197, 94, 0.12)",
                                border: "1px solid rgba(34, 197, 94, 0.35)",
                                color: "#4ade80",
                                lineHeight: 1.45,
                              }}
                            >
                              <div>🟢 <strong>Topic 1 Unified Mode Active:</strong> Public Chat messages + Deleted Alerts + Media are all routed together to <strong>Topic 1</strong>!</div>
                            </div>
                          ) : (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                background: "rgba(56, 189, 248, 0.1)",
                                border: "1px solid rgba(56, 189, 248, 0.25)",
                                color: "#7dd3fc",
                                lineHeight: 1.45,
                              }}
                            >
                              <div>📡 <strong>Separated Topics Mode Active:</strong> Public Chat routes to <strong>Topic {chatBotSettings.topics?.publicChat || "39"}</strong>. Deleted alerts route to <strong>Topic 35</strong>.</div>
                            </div>
                          )}

                          {/* 4 Dedicated Forum Topics Breakdown */}
                          <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "0.68rem" }}>
                            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "6px 8px" }}>
                              <span style={{ color: "#fbbf24", fontWeight: 700 }}>⚠️ Topic 35:</span> ONLY Public Deleted Messages &amp; Tamper Log
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "6px 8px" }}>
                              <span style={{ color: "#38bdf8", fontWeight: 700 }}>📜 Topic 31:</span> Private Pod Vault &amp; Forensic Dossier
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "6px 8px" }}>
                              <span style={{ color: "#c084fc", fontWeight: 700 }}>📎 Topic 33:</span> Private Chat Media Vault (Permanent Retention)
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "6px 8px" }}>
                              <span style={{ color: "#34d399", fontWeight: 700 }}>👥 Topic 114:</span> Public Active Students &amp; Session Logs (Private Separate)
                            </div>
                          </div>

                          {/* Dynamic Topic Helper Banner */}
                          <div
                            style={{
                              marginTop: "6px",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              fontSize: "0.7rem",
                              background: "rgba(56, 189, 248, 0.1)",
                              border: "1px solid rgba(56, 189, 248, 0.25)",
                              color: "#7dd3fc",
                              lineHeight: 1.4,
                            }}
                          >
                            <div>💡 <strong>Telegram Topic Binding:</strong> Open any topic in your Telegram Supergroup and send <code>/set_topic</code> to immediately bind public chat and controller to that topic!</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", flexWrap: "wrap", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          onClick={handleTestChatBotPing}
                          disabled={chatBotLoading}
                          className="btn-secondary"
                          style={{ padding: "7px 14px", fontSize: "0.78rem" }}
                        >
                          {chatBotLoading ? "Sending..." : "🔔 Send Test Ping Alert"}
                        </button>
                        <span style={{ fontSize: "0.76rem", color: chatBotActionMsg ? (chatBotActionMsg.startsWith("❌") ? "#f87171" : "#34d399") : "var(--text-dim)", fontWeight: 700 }}>
                          {chatBotActionMsg || "Settings auto-synced with Telegram bot engine."}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          onClick={() => setShowChatBotPanel(false)}
                          className="btn-secondary"
                          style={{ padding: "7px 16px", fontSize: "0.78rem" }}
                        >
                          Close Card
                        </button>
                        <button
                          onClick={saveChatBotSettings}
                          disabled={chatBotSaving}
                          className="btn-primary"
                          style={{ padding: "7px 18px", fontSize: "0.8rem", fontWeight: 800 }}
                        >
                          {chatBotSaving ? "Saving..." : "💾 Save Bot & Retention Settings"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Room Selector Strip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  overflowX: "auto",
                  paddingBottom: "4px",
                }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", whiteSpace: "nowrap", marginRight: "4px" }}>
                  Active Rooms ({chatRooms.length || 1}):
                </div>

                <button
                  onClick={() => setSelectedChatRoomId("public")}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: selectedChatRoomId === "public" ? 800 : 600,
                    border: selectedChatRoomId === "public" ? "1.5px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                    background: selectedChatRoomId === "public" ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.03)",
                    color: selectedChatRoomId === "public" ? "#fff" : "var(--text-dim)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Globe size={14} color="#38bdf8" />
                  <span>🏛️ General Hall (Public)</span>
                </button>

                {chatRooms
                  .filter((r) => r.isPrivate)
                  .map((room) => {
                    const isSelected = selectedChatRoomId === room.id;
                    return (
                      <button
                        key={room.id}
                        onClick={() => setSelectedChatRoomId(room.id)}
                        style={{
                          padding: "7px 14px",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: isSelected ? 800 : 600,
                          border: isSelected ? "1.5px solid #c084fc" : "1px solid rgba(255, 255, 255, 0.08)",
                          background: isSelected ? "rgba(192, 132, 252, 0.2)" : "rgba(255, 255, 255, 0.03)",
                          color: isSelected ? "#fff" : "var(--text-dim)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Lock size={13} color="#c084fc" />
                        <span>{room.name}</span>
                        {room.secretCode && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              background: "rgba(0, 0, 0, 0.4)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "#fbbf24",
                              fontFamily: "monospace",
                            }}
                          >
                            Key: {room.secretCode}
                          </span>
                        )}
                        <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>({room.membersCount || 0})</span>
                      </button>
                    );
                  })}
              </div>

              {/* Main Chat Messages Stream Box */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  background: "rgba(7, 10, 19, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  minHeight: "420px",
                }}
              >
                {/* Chat Messages Body */}
                <div
                  ref={chatScrollRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {chatMessages.length === 0 ? (
                    <div style={{ margin: "auto", textAlign: "center", color: "var(--text-dim)", padding: "40px 20px" }}>
                      <MessageSquare size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
                      <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>No messages in this room yet</div>
                      <p style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>
                        Broadcast a message or announcement as Administrator below.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isAdminMsg =
                        msg.sender?.role === "admin" ||
                        msg.sender?.role === "half_admin" ||
                        isMasterAdminSender(msg.sender);
                      const userColor = getChatUserColor(msg.sender?.id, msg.sender?.name);

                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: isAdminMsg ? "flex-end" : "flex-start",
                            width: "100%",
                          }}
                        >
                          <div
                            style={{
                              maxWidth: "75%",
                              background: isAdminMsg
                                ? "linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(245, 158, 11, 0.18))"
                                : "rgba(30, 41, 59, 0.7)",
                              border: isAdminMsg
                                ? "1.5px solid rgba(245, 158, 11, 0.4)"
                                : "1px solid rgba(255, 255, 255, 0.08)",
                              borderRadius: isAdminMsg ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                              padding: "10px 14px",
                              boxShadow: isAdminMsg ? "0 4px 14px rgba(245, 158, 11, 0.15)" : "0 2px 8px rgba(0,0,0,0.2)",
                            }}
                          >
                            {/* Message Header (Sender Info) */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {isAdminMsg || msg.sender?.id?.startsWith("sys_admin_") || msg.sender?.isOfficialAdmin || (msg.sender?.name && /admin/i.test(msg.sender.name)) || msg.telegramMsgId ? (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 800,
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      background: "linear-gradient(135deg, #ef4444, #f59e0b)",
                                      color: "#000",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <Crown size={11} /> 👑 OFFICIAL ADMIN
                                  </span>
                                ) : (
                                  <>
                                    <span style={{ fontWeight: 800, fontSize: "0.82rem", color: userColor }}>
                                      {msg.sender?.name || "Student"}
                                    </span>
                                    <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
                                      {msg.sender?.branch || "General"} {msg.sender?.year ? `• ${msg.sender.year}` : ""}
                                    </span>
                                  </>
                                )}
                              </div>

                              <span style={{ fontSize: "0.68rem", color: "rgba(255, 255, 255, 0.4)" }}>
                                {formatChatTime(msg.createdAt)}
                              </span>
                            </div>

                            {/* Message Content */}
                            {msg.isDeleted ? (
                              <div style={{ fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.4)", fontStyle: "italic" }}>
                                🗑️ {msg.text || "This message was deleted by Administrator"}
                              </div>
                            ) : (
                              <div>
                                {msg.text && (
                                  <div style={{ fontSize: "0.86rem", color: "#f8fafc", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                    {msg.text}
                                  </div>
                                )}

                                {/* Attachments */}
                                {msg.fileUrl && (
                                  <div style={{ marginTop: "8px" }}>
                                    {msg.type === "image" || (msg.fileType === "image") ? (
                                      <a href={msg.fileUrl} target="_blank" rel="noreferrer">
                                        <img
                                          src={msg.fileUrl}
                                          alt="Attachment"
                                          style={{
                                            maxWidth: "280px",
                                            maxHeight: "200px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255, 255, 255, 0.1)",
                                            display: "block",
                                          }}
                                        />
                                      </a>
                                    ) : msg.type === "audio" || (msg.fileType === "audio") ? (
                                      <audio controls src={msg.fileUrl} style={{ width: "240px", height: "36px" }} />
                                    ) : (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "10px",
                                          padding: "8px 12px",
                                          background: "rgba(0, 0, 0, 0.3)",
                                          border: "1px solid rgba(255, 255, 255, 0.1)",
                                          borderRadius: "8px",
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                                          <FileText size={18} color="#38bdf8" />
                                          <div style={{ overflow: "hidden" }}>
                                            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                                              {msg.fileName || "Academic Note Document"}
                                            </div>
                                            {msg.fileSize && (
                                              <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
                                                {formatFileSize(msg.fileSize)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <a
                                          href={msg.fileUrl}
                                          download={msg.fileName || "Note.pdf"}
                                          style={{
                                            padding: "4px 8px",
                                            borderRadius: "6px",
                                            background: "rgba(56, 189, 248, 0.2)",
                                            color: "#38bdf8",
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            textDecoration: "none",
                                          }}
                                        >
                                          Download
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Moderation Controls for this message */}
                            {!msg.isDeleted && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  marginTop: "6px",
                                  paddingTop: "6px",
                                  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                                  fontSize: "0.7rem",
                                }}
                              >
                                <button
                                  onClick={() => handleAdminDeleteMessage(msg.id)}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#f87171",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    padding: "2px 4px",
                                    borderRadius: "4px",
                                  }}
                                  title="Delete Message"
                                >
                                  <Trash2 size={12} />
                                  <span>Delete</span>
                                </button>

                                {!isAdminMsg && msg.sender?.id && (
                                  <button
                                    onClick={() => handleAdminBlockChatStudent(msg.sender.id, msg.sender.name, true)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "#fbbf24",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "3px",
                                      padding: "2px 4px",
                                      borderRadius: "4px",
                                    }}
                                    title="Block student from chatting"
                                  >
                                    <ShieldAlert size={12} />
                                    <span>Block Student</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Quick Admin Template Chips */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    background: "rgba(15, 23, 42, 0.9)",
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    overflowX: "auto",
                  }}
                >
                  <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>Quick Templates:</span>
                  {[
                    "📢 Welcome Scholars! Happy learning.",
                    "📚 Reminder: Please maintain academic decorum.",
                    "⚡ Fresh exam notes are live in Notes Vault!",
                    "⚠️ Spam or promotional links are strictly prohibited.",
                  ].map((tpl, i) => (
                    <button
                      key={i}
                      onClick={() => setChatInputText(tpl)}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "var(--text-dim)",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>

                {/* Admin Message Composer Bar */}
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(15, 23, 42, 0.95)",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {chatAttachment && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "rgba(56, 189, 248, 0.15)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        color: "#38bdf8",
                        fontSize: "0.75rem",
                        maxWidth: "fit-content",
                      }}
                    >
                      <Paperclip size={13} />
                      <span>{chatAttachment.name}</span>
                      <X
                        size={13}
                        style={{ cursor: "pointer", marginLeft: "4px" }}
                        onClick={() => {
                          setChatAttachment(null);
                          if (chatFileInputRef.current) chatFileInputRef.current.value = "";
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="file"
                      ref={chatFileInputRef}
                      onChange={(e) => setChatAttachment(e.target.files[0] || null)}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: chatAttachment ? "#38bdf8" : "var(--text-dim)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                      title="Attach File / Document / Image"
                    >
                      <Paperclip size={16} />
                    </button>

                    <input
                      type="text"
                      value={chatInputText}
                      onChange={(e) => setChatInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAdminSendMessage();
                        }
                      }}
                      placeholder={`Post official message as Administrator in ${selectedChatRoomId === "public" ? "General Hall" : "this Pod"}...`}
                      style={{
                        flex: 1,
                        padding: "9px 14px",
                        borderRadius: "8px",
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        color: "#fff",
                        fontSize: "0.85rem",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => handleAdminSendMessage()}
                      disabled={chatSending || (!chatInputText.trim() && !chatAttachment)}
                      style={{
                        padding: "9px 18px",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
                        border: "none",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        opacity: chatSending || (!chatInputText.trim() && !chatAttachment) ? 0.6 : 1,
                      }}
                    >
                      <Send size={14} />
                      <span>{chatSending ? "Sending..." : "Broadcast"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Create Pod Modal Popup */}
              {showCreatePodModal && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.75)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1300,
                  }}
                  onClick={() => setShowCreatePodModal(false)}
                >
                  <div
                    style={{
                      width: "420px",
                      background: "#0d1322",
                      border: "1px solid rgba(167, 139, 250, 0.3)",
                      borderRadius: "14px",
                      padding: "20px",
                      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.9)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <h4 style={{ margin: 0, color: "#fff", fontSize: "1rem", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Plus size={16} color="#c084fc" /> Create Official Study Pod
                      </h4>
                      <X size={18} style={{ cursor: "pointer", color: "var(--text-dim)" }} onClick={() => setShowCreatePodModal(false)} />
                    </div>

                    <form onSubmit={handleAdminCreatePod} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "4px" }}>
                          Pod Name *
                        </label>
                        <input
                          type="text"
                          value={newPodName}
                          onChange={(e) => setNewPodName(e.target.value)}
                          placeholder="e.g. Computer Science Sem 6 Review"
                          required
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#fff",
                            fontSize: "0.85rem",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "4px" }}>
                          Secret Key (Optional, auto-generated if blank)
                        </label>
                        <input
                          type="text"
                          value={newPodSecret}
                          onChange={(e) => setNewPodSecret(e.target.value.toUpperCase())}
                          placeholder="e.g. CS62026"
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#fff",
                            fontSize: "0.85rem",
                            fontFamily: "monospace",
                          }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                        <button
                          type="button"
                          onClick={() => setShowCreatePodModal(false)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "6px",
                            background: "transparent",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          style={{
                            padding: "8px 16px",
                            borderRadius: "6px",
                            background: "linear-gradient(135deg, #a855f7, #6366f1)",
                            border: "none",
                            color: "#fff",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          Create Pod
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
  );
}
