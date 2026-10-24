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
const isMasterAdminStudent = (student) => {
  if (!student) return false;
  if (student.isMainAdmin || student.isMasterAdmin) return true;
  if (MASTER_ADMIN_EMAIL && student.email && student.email.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return false;
};

export default function TabStudents(props) {
  const {
    DASHBOARD_TABS,
    handleAdjustStudentPurgeDays,
    handleDeleteAllStudents,
    handleDeleteStudent,
    handleToggleBlock,
    isHalfAdmin,
    loadStudentActivities,
    setEditingStudent,
    setStudentPage,
    setStudentSearch,
    studentPage,
    studentSearch,
    students,
    studentsError,
    studentsLoading,
    studentsTotal,
  } = props;

  

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", minWidth: "280px", flex: 1 }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: "9px 12px 9px 36px", fontSize: "0.85rem" }}
                    placeholder="Search students by name, email, roll number, college, or mobile..."
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setStudentPage(1);
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {!isHalfAdmin && (
                    <button
                      onClick={handleDeleteAllStudents}
                      className="btn-danger"
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", padding: "8px 14px" }}
                    >
                      <Trash2 size={14} />
                      <span>Move All Students to Restore Vault</span>
                    </button>
                  )}
                </div>
              </div>

              {studentsError && (
                <div style={{ background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", color: "#f43f5e", padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: "14px", fontSize: "0.85rem" }}>
                  {studentsError}
                </div>
              )}

              <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
                      <th style={{ padding: "12px 16px" }}>STUDENT NAME &amp; EMAIL</th>
                      <th style={{ padding: "12px 16px" }}>COLLEGE &amp; YEAR</th>
                      <th style={{ padding: "12px 16px" }}>ROLE</th>
                      <th style={{ padding: "12px 16px" }}>STATUS</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsLoading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                          <div className="spinner" style={{ width: "24px", height: "24px", margin: "0 auto 8px" }} />
                          Loading student registry...
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                          No students found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      students.map((student) => (
                        <tr key={student.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span>{student.name || "Student"}</span>
                              {isMasterAdminStudent(student) && (
                                <span style={{ color: "#fbbf24", fontSize: "0.7rem", fontWeight: 800 }}>👑 Master Admin</span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span>{student.email}</span>
                              <span
                                onClick={() => setEditingStudent && setEditingStudent(student)}
                                title="Click to view or update student mobile number"
                                style={{
                                  color: student.mobile && !student.mobile.startsWith("enc_gcm:") && student.mobile !== "N/A" && student.mobile !== "Not Set" ? "#38bdf8" : "#fbbf24",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  background: "rgba(56, 189, 248, 0.08)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(56, 189, 248, 0.2)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                📞 {student.mobile && !student.mobile.startsWith("enc_gcm:") && student.mobile !== "N/A" && student.mobile !== "Not Set" ? student.mobile : "Set Mobile"}
                              </span>
                              {student.deviceSpecs && (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    color: "#38bdf8",
                                    background: "rgba(6, 182, 212, 0.12)",
                                    border: "1px solid rgba(6, 182, 212, 0.25)",
                                    padding: "0 5px",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                  }}
                                  title={student.deviceSpecs.label || `${student.deviceSpecs.cores} Cores, ${student.deviceSpecs.memoryGB}GB RAM`}
                                >
                                  💻 {student.deviceSpecs.cores}C • {student.deviceSpecs.memoryGB}GB RAM
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: student.neverPurge ? "rgba(52, 211, 153, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                  color: student.neverPurge ? "#34d399" : "#fbbf24",
                                  border: `1px solid ${student.neverPurge ? "rgba(52, 211, 153, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                                }}
                              >
                                ⏳ {student.neverPurge ? "🛡️ Immune (Never Purged)" : `${student.daysRemaining != null ? student.daysRemaining : 90}d to purge`}
                              </span>
                              {!student.neverPurge && student.scheduledPurgeDate && (
                                <span style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
                                  • Scheduled: {student.scheduledPurgeDate}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                            <div>{student.college || "General University"}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>{student.year || "Year Not Specified"}</div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                padding: "3px 9px",
                                borderRadius: "6px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                background:
                                  isMasterAdminStudent(student)
                                    ? "rgba(245, 158, 11, 0.25)"
                                    : student.role === "admin"
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : student.role === "half_admin"
                                    ? "rgba(168, 85, 247, 0.18)"
                                    : "rgba(255, 255, 255, 0.05)",
                                color:
                                  isMasterAdminStudent(student)
                                    ? "#f59e0b"
                                    : student.role === "admin"
                                    ? "#fbbf24"
                                    : student.role === "half_admin"
                                    ? "#c084fc"
                                    : "var(--text-dim)",
                                border: `1px solid ${
                                  isMasterAdminStudent(student)
                                    ? "rgba(245, 158, 11, 0.5)"
                                    : student.role === "admin"
                                    ? "rgba(245, 158, 11, 0.3)"
                                    : student.role === "half_admin"
                                    ? "rgba(168, 85, 247, 0.35)"
                                    : "rgba(255, 255, 255, 0.1)"
                                }`,
                              }}
                            >
                              {isMasterAdminStudent(student)
                                ? "👑 MASTER ADMIN"
                                : student.role === "admin"
                                ? "👑 FULL ADMIN"
                                : student.role === "half_admin"
                                ? "⚡ HALF ADMIN"
                                : "🎓 STUDENT"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            {student.isBlocked ? (
                              <span style={{ color: "#f87171", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <UserX size={14} /> Blocked
                              </span>
                            ) : (
                              <span style={{ color: "#34d399", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <UserCheck size={14} /> Active
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              <button
                                onClick={() => handleAdjustStudentPurgeDays(student, "increase", 15)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", fontSize: "0.68rem", fontWeight: 800 }}
                                title="Add +15 Days Grace to Purge Inactivity Limit"
                              >
                                +15d
                              </button>

                              <button
                                onClick={() => handleAdjustStudentPurgeDays(student, "decrease", 15)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", fontSize: "0.68rem", fontWeight: 800 }}
                                title="Reduce 15 Days from Purge Inactivity Limit"
                              >
                                -15d
                              </button>

                              <button
                                onClick={() => {
                                  const input = window.prompt(
                                    `Adjust purge / inactivity days for ${student.name} (${student.email}):\n\nEnter number of days (e.g. 60) or relative (+30, -15), or type 'never' for permanent immunity:`,
                                    "30"
                                  );
                                  if (!input) return;
                                  const clean = input.trim().toLowerCase();
                                  if (clean === "never") {
                                    handleAdjustStudentPurgeDays(student, "set", 9999);
                                  } else if (clean.startsWith("+")) {
                                    handleAdjustStudentPurgeDays(student, "increase", Math.abs(parseInt(clean, 10)) || 15);
                                  } else if (clean.startsWith("-")) {
                                    handleAdjustStudentPurgeDays(student, "decrease", Math.abs(parseInt(clean, 10)) || 15);
                                  } else {
                                    handleAdjustStudentPurgeDays(student, "set", parseInt(clean, 10) || 30);
                                  }
                                }}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.68rem", fontWeight: 800 }}
                                title="Set Custom Inactivity / Purge Days or Grant Immunity"
                              >
                                ⏱️
                              </button>

                              <button
                                onClick={() => handleToggleBlock(student)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(255, 255, 255, 0.05)" }}
                                title={student.isBlocked ? "Unblock Account" : "Block Account"}
                              >
                                {student.isBlocked ? <UserCheck size={15} style={{ color: "#34d399" }} /> : <UserX size={15} style={{ color: "#f87171" }} />}
                              </button>

                              <button
                                onClick={() => loadStudentActivities(student)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)" }}
                                title="Inspect Activity Logs"
                              >
                                <Activity size={15} />
                              </button>

                              <button
                                onClick={() => {
                                  const initialAllowedTabs = Array.isArray(student.allowedTabs) && student.allowedTabs.length > 0
                                    ? student.allowedTabs
                                    : (student.role === "admin"
                                        ? DASHBOARD_TABS.map((t) => t.id)
                                        : student.role === "half_admin"
                                        ? ["notes", "students", "pipeline", "performance", "recycle_bin", "community_chat"]
                                        : []);
                                  setEditingStudent({ ...student, allowedTabs: initialAllowedTabs });
                                }}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(255, 255, 255, 0.05)" }}
                                title="Edit Student Profile & Role"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button
                                onClick={() => handleDeleteStudent(student)}
                                className="btn-icon"
                                style={{ width: "32px", height: "32px", background: "rgba(244, 63, 94, 0.1)", color: "#f43f5e" }}
                                title="Move Account to Restore Vault"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {studentsTotal > 10 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                    Showing page {studentPage} of {Math.ceil(studentsTotal / 10)} ({studentsTotal} total students)
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                      disabled={studentPage <= 1}
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setStudentPage((p) => p + 1)}
                      disabled={studentPage >= Math.ceil(studentsTotal / 10)}
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
  );
}
