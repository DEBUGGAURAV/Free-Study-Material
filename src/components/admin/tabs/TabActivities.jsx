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

export default function TabActivities(props) {
  const {
    activities,
    activitiesLoading,
    handleClearAllActivities,
    handleDeleteActivity,
    selectedStudentForActivity,
    setActiveTab,
  } = props;

  

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                      Activity History: {selectedStudentForActivity.name}
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)" }}>({selectedStudentForActivity.email})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "rgba(6, 182, 212, 0.15)",
                        border: "1px solid rgba(6, 182, 212, 0.35)",
                        color: "#38bdf8",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>💻 Device:</span>
                      <strong style={{ color: "#fff" }}>
                        {selectedStudentForActivity.deviceSpecs?.label ||
                          (selectedStudentForActivity.deviceSpecs?.cores
                            ? `${selectedStudentForActivity.deviceSpecs.isMobile ? "Mobile" : "Desktop"} • ${selectedStudentForActivity.deviceSpecs.cores} Cores • ${selectedStudentForActivity.deviceSpecs.memoryGB}GB RAM`
                            : "Standard Client (Hardware Guard Active)")}
                      </strong>
                    </span>

                    <span
                      style={{
                        fontSize: "0.74rem",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "rgba(16, 185, 129, 0.15)",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                        color: "#34d399",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>📞 Mobile:</span>
                      <strong style={{ color: "#fff" }}>
                        {selectedStudentForActivity.mobile && !selectedStudentForActivity.mobile.startsWith("enc_gcm:") && selectedStudentForActivity.mobile !== "N/A"
                          ? selectedStudentForActivity.mobile
                          : "Not Registered / Set"}
                      </strong>
                    </span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", margin: "4px 0 0" }}>
                    Complete audit trail of downloads, logins, uploads, and search queries for this student.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleClearAllActivities}
                    className="btn-danger"
                    style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                  >
                    Clear All History
                  </button>
                  <button
                    onClick={() => setActiveTab("students")}
                    className="btn-secondary"
                    style={{ padding: "8px 14px", fontSize: "0.82rem" }}
                  >
                    &larr; Back to Registry
                  </button>
                </div>
              </div>

              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px" }}>
                {activitiesLoading ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                    <div className="spinner" style={{ width: "24px", height: "24px", margin: "0 auto 8px" }} />
                    Loading activity stream...
                  </div>
                ) : activities.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                    No recorded activities found for this student.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {activities.map((act) => (
                      <div
                        key={act.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                          borderRadius: "8px",
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Activity size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.85rem" }}>
                              {act.detail || act.type || "Student Action"}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "2px" }}>
                              {act.timestamp ? new Date(act.timestamp).toLocaleString() : "Recorded Event"}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteActivity(act.id)}
                          className="btn-icon"
                          style={{ width: "28px", height: "28px", background: "rgba(244, 63, 94, 0.1)", color: "#f43f5e" }}
                          title="Delete Activity Entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
  );
}
