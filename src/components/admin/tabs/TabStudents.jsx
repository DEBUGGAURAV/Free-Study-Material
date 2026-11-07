import React, { useState, useEffect, useRef } from "react";
import {
  X, Mail, Shield, Trash2, Eye, EyeOff, Edit3, UserCheck, UserX, Activity,
  Search, CheckCircle, Clock, ChevronLeft, ChevronRight, Save, RefreshCw,
  Database, Cpu, Server, HardDrive, Globe, Code, Cloud, Send, Download,
  Upload, Zap, Inbox, Key, Monitor, ShieldCheck, ShieldAlert, Filter, Bot,
  Bell, BellOff, Power, AlertTriangle, Flame, Check, Share2, Wifi, Sparkles,
  FileText, Sliders, Layers, Scissors, RotateCcw, Megaphone, Plus, Lock,
  MessageSquare, Crown, Paperclip, Volume2, Radio, Bug, Smartphone, Laptop,
  MapPin, LogOut
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
    DASHBOARD_TABS = [],
    handleAdjustStudentPurgeDays,
    handleDeleteAllStudents,
    handleDeleteStudent,
    handleToggleBlock,
    isHalfAdmin,
    loadStudentActivities,
    setEditingStudent,
    setStudentPage,
    setStudentSearch,
    studentPage = 1,
    studentSearch = "",
    students = [],
    studentsError,
    studentsLoading,
    studentsTotal = 0,
    loadStudents,
  } = props;

  // Modals state
  const [viewingStudent, setViewingStudent] = useState(null);
  const [logStudent, setLogStudent] = useState(null);
  const [studentLogsLoading, setStudentLogsLoading] = useState(false);
  const [studentLogs, setStudentLogs] = useState({ sessions: [], securityLogs: [], activities: [] });
  const [activeLogSubTab, setActiveLogSubTab] = useState("sessions"); // sessions, security, activities
  const [terminatingSessionId, setTerminatingSessionId] = useState(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  // Filters state
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Open Quick Logs Modal
  const handleOpenStudentLogs = async (student) => {
    setLogStudent(student);
    setStudentLogsLoading(true);
    setActiveLogSubTab("sessions");
    try {
      const [sessRes, actRes] = await Promise.all([
        api.getStudentSessions(student.id).catch(() => ({ sessions: [], securityLogs: [] })),
        api.getUserActivities(student.id).catch(() => ({ activities: [] }))
      ]);
      setStudentLogs({
        sessions: sessRes?.sessions || [],
        securityLogs: sessRes?.securityLogs || [],
        activities: actRes?.activities || []
      });
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setStudentLogsLoading(false);
    }
  };

  // Terminate Single Device in Quick Logs
  const handleTerminateQuickSingle = async (sessionId, deviceName) => {
    if (!logStudent) return;
    if (!window.confirm(`Logout & disconnect active device "${deviceName}" for ${logStudent.name}?`)) return;
    setTerminatingSessionId(sessionId);
    try {
      const res = await api.terminateStudentSession(logStudent.id, sessionId);
      if (res?.success) {
        setStudentLogs((prev) => ({
          ...prev,
          sessions: prev.sessions.filter((s) => s.sessionId !== sessionId)
        }));
      } else {
        alert(res?.message || "Failed to disconnect session");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Terminate All Devices in Quick Logs
  const handleTerminateQuickAll = async () => {
    if (!logStudent) return;
    if (!window.confirm(`Terminate and logout ALL active devices for ${logStudent.name}?`)) return;
    setTerminatingAll(true);
    try {
      const res = await api.terminateAllStudentSessions(logStudent.id);
      if (res?.success) {
        setStudentLogs((prev) => ({ ...prev, sessions: [] }));
        alert("✅ All active devices logged out successfully.");
      } else {
        alert(res?.message || "Failed to disconnect all devices");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setTerminatingAll(false);
    }
  };

  // Filter students locally for role and status
  const filteredStudents = (students || []).filter((s) => {
    if (roleFilter !== "all") {
      if (roleFilter === "master" && !isMasterAdminStudent(s)) return false;
      if (roleFilter === "admin" && s.role !== "admin") return false;
      if (roleFilter === "half_admin" && s.role !== "half_admin") return false;
      if (roleFilter === "student" && (s.role === "admin" || s.role === "half_admin" || isMasterAdminStudent(s))) return false;
    }
    if (statusFilter !== "all") {
      if (statusFilter === "active" && s.isBlocked) return false;
      if (statusFilter === "blocked" && !s.isBlocked) return false;
      if (statusFilter === "immune" && !s.neverPurge) return false;
      if (statusFilter === "expiring" && (s.neverPurge || (s.daysRemaining ?? 90) > 30)) return false;
    }
    return true;
  });

  // Export Students (CSV or JSON)
  const handleExportStudents = (format = "csv") => {
    if (!filteredStudents || filteredStudents.length === 0) {
      alert("No student records available to export.");
      return;
    }
    if (format === "csv") {
      const headers = [
        "Student ID", "Name", "Email", "Mobile", "College", "Branch",
        "Year", "Semester", "Roll Number", "Role", "Status", "Immune",
        "Inactivity Threshold", "Days Remaining", "Scheduled Purge Date",
        "Registered At", "Last Login At"
      ];
      const rows = filteredStudents.map((s) => [
        `"${s.id || ""}"`,
        `"${(s.name || "").replace(/"/g, '""')}"`,
        `"${s.email || ""}"`,
        `"${s.mobile || ""}"`,
        `"${(s.college || "").replace(/"/g, '""')}"`,
        `"${(s.branch || "").replace(/"/g, '""')}"`,
        `"${(s.year || "").replace(/"/g, '""')}"`,
        `"${(s.semester || "").replace(/"/g, '""')}"`,
        `"${(s.rollNumber || "").replace(/"/g, '""')}"`,
        `"${s.role || "student"}"`,
        `"${s.isBlocked ? "Blocked" : "Active"}"`,
        `"${s.neverPurge ? "Yes" : "No"}"`,
        `"${s.effectiveThreshold || s.customInactivityDays || 90} days"`,
        `"${s.daysRemaining != null ? s.daysRemaining : 90}"`,
        `"${s.scheduledPurgeDate || ""}"`,
        `"${s.createdAt || ""}"`,
        `"${s.lastLoginAt || ""}"`
      ]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `student_registry_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredStudents, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `student_registry_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === "mobile") return <Smartphone size={16} color="#38bdf8" />;
    return <Laptop size={16} color="#34d399" />;
  };

  return (
    <div>
      {/* Top Search & Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "8px", flex: 1, minWidth: "300px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
            <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
            <input
              type="text"
              className="form-input"
              style={{ padding: "8px 12px 8px 34px", fontSize: "0.82rem" }}
              placeholder="Search by name, email, roll number, college, branch, or mobile..."
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setStudentPage(1);
              }}
            />
          </div>

          {/* Role Filter */}
          <select
            className="form-input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: "auto", fontSize: "0.8rem", padding: "8px 10px" }}
          >
            <option value="all">All Roles</option>
            <option value="student">🎓 Students Only</option>
            <option value="half_admin">⚡ Half Admins Only</option>
            <option value="admin">👑 Full Admins Only</option>
            <option value="master">👑 Master Admin Only</option>
          </select>

          {/* Status Filter */}
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "auto", fontSize: "0.8rem", padding: "8px 10px" }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="blocked">Blocked Accounts</option>
            <option value="immune">🛡️ Immune (Never Purged)</option>
            <option value="expiring">⏳ Expiring Soon (&lt;30d)</option>
          </select>

          {/* Refresh Button */}
          {typeof loadStudents === "function" && (
            <button
              onClick={() => loadStudents(studentPage, studentSearch)}
              className="btn-secondary"
              style={{ padding: "8px 12px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "5px" }}
              title="Refresh students list from server"
            >
              <RefreshCw size={13} className={studentsLoading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Export Dropdown / Buttons */}
          <div style={{ display: "inline-flex", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            <button
              onClick={() => handleExportStudents("csv")}
              className="btn-secondary"
              style={{ fontSize: "0.78rem", padding: "7px 11px", borderRadius: 0, border: "none", background: "rgba(255, 255, 255, 0.04)" }}
              title="Export currently filtered students to CSV"
            >
              📥 CSV Export
            </button>
            <button
              onClick={() => handleExportStudents("json")}
              className="btn-secondary"
              style={{ fontSize: "0.78rem", padding: "7px 10px", borderRadius: 0, borderLeft: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.04)" }}
              title="Export currently filtered students to JSON"
            >
              JSON
            </button>
          </div>

          <button
            onClick={async () => {
              if (!window.confirm("⚠️ Remotely wipe and reset offline storage & IndexedDB cache for ALL students across the platform?\n\nThis increments the global cache epoch and triggers a background reset on all student phones with 0 database reads and 0 database writes.")) return;
              try {
                const res = await api.resetAllUsersStorageCache();
                alert(`✅ ${res.message || "Global storage reset dispatched."}`);
              } catch (err) {
                alert(`❌ Global reset failed: ${err.message}`);
              }
            }}
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", border: "1px solid rgba(168, 85, 247, 0.4)", color: "#c084fc", background: "rgba(168, 85, 247, 0.1)" }}
            title="Zero Database Cost: Remote-purges IndexedDB & Service Worker caches on all student phones"
          >
            <RotateCcw size={13} />
            <span>Reset All Caches</span>
          </button>

          {!isHalfAdmin && (
            <button
              onClick={handleDeleteAllStudents}
              className="btn-danger"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px" }}
            >
              <Trash2 size={13} />
              <span>Move All to Vault</span>
            </button>
          )}
        </div>
      </div>

      {studentsError && (
        <div style={{ background: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.3)", color: "#f43f5e", padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: "14px", fontSize: "0.85rem" }}>
          {studentsError}
        </div>
      )}

      {/* Student Registry Table */}
      <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", color: "var(--text-dim)" }}>
              <th style={{ padding: "12px 16px" }}>STUDENT NAME &amp; EMAIL</th>
              <th style={{ padding: "12px 16px" }}>COLLEGE, BRANCH &amp; YEAR</th>
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
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                  No students found matching your search or filters.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div
                      style={{ fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() => setViewingStudent(student)}
                      title="Click to view complete student profile and details"
                    >
                      <span style={{ textDecoration: "underline", textDecorationColor: "rgba(255, 255, 255, 0.2)" }}>
                        {student.name || "Student"}
                      </span>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", flexWrap: "wrap" }}>
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
                    <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{student.college || "General University"}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "2px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {student.branch && (
                        <span style={{ color: "#38bdf8", fontWeight: 600 }}>{student.branch}</span>
                      )}
                      <span>{student.year || "Year N/A"}</span>
                      {student.semester && <span>• {student.semester}</span>}
                    </div>
                    {student.rollNumber && (
                      <div style={{ fontSize: "0.68rem", color: "#a78bfa", marginTop: "2px" }}>
                        🆔 Roll: {student.rollNumber}
                      </div>
                    )}
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
                    <div style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                      {/* View Details Modal Trigger */}
                      <button
                        onClick={() => setViewingStudent(student)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8" }}
                        title="View Complete Student Details"
                      >
                        <Eye size={14} />
                      </button>

                      {/* Quick Logs & Devices Inspector */}
                      <button
                        onClick={() => handleOpenStudentLogs(student)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)" }}
                        title="Quick View Activity Logs, Security Events & Active Devices"
                      >
                        <Activity size={14} />
                      </button>

                      {/* Edit Student Profile */}
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
                        style={{ width: "30px", height: "30px", background: "rgba(255, 255, 255, 0.05)" }}
                        title="Edit Student Profile, Branch, Year & Role"
                      >
                        <Edit3 size={14} />
                      </button>

                      {/* Inactivity Threshold Quick Buttons */}
                      <button
                        onClick={() => handleAdjustStudentPurgeDays(student, "increase", 15)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", fontSize: "0.68rem", fontWeight: 800 }}
                        title="Add +15 Days Grace to Purge Inactivity Limit"
                      >
                        +15d
                      </button>

                      <button
                        onClick={() => handleAdjustStudentPurgeDays(student, "decrease", 15)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", fontSize: "0.68rem", fontWeight: 800 }}
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
                        style={{ width: "30px", height: "30px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.68rem", fontWeight: 800 }}
                        title="Set Custom Inactivity / Purge Days or Grant Immunity"
                      >
                        ⏱️
                      </button>

                      {/* Block / Unblock */}
                      <button
                        onClick={() => handleToggleBlock(student)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(255, 255, 255, 0.05)" }}
                        title={student.isBlocked ? "Unblock Account" : "Block Account"}
                      >
                        {student.isBlocked ? <UserCheck size={14} style={{ color: "#34d399" }} /> : <UserX size={14} style={{ color: "#f87171" }} />}
                      </button>

                      {/* Remote Storage Wipe */}
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Remotely wipe and reset offline IndexedDB storage & caches for ${student.name} (${student.email})?\n\nThis executes immediately over WebSocket or when they next open the app with 0 database cost.`)) return;
                          try {
                            const res = await api.resetSingleUserStorageCache(student.id, student.email);
                            alert(`✅ ${res.message || "Storage reset command dispatched."}`);
                          } catch (err) {
                            alert(`❌ Reset failed: ${err.message}`);
                          }
                        }}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", fontSize: "0.8rem" }}
                        title="Remotely Wipe & Reset Student's Device Offline Storage (0 DB Cost)"
                      >
                        🧹
                      </button>

                      {/* Delete to Restore Vault */}
                      <button
                        onClick={() => handleDeleteStudent(student)}
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", background: "rgba(244, 63, 94, 0.1)", color: "#f43f5e" }}
                        title="Move Account to Restore Vault"
                      >
                        <Trash2 size={14} />
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

      {/* ========================================================================= */}
      {/* 👁️ MODAL 1: VIEW STUDENT COMPLETE PROFILE DETAILS                        */}
      {/* ========================================================================= */}
      {viewingStudent && (
        <div className="modal-overlay" onClick={() => setViewingStudent(null)} style={{ zIndex: 1250 }}>
          <div
            className="modal-content"
            style={{ maxWidth: "600px", background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(6, 182, 212, 0.15)", border: "1px solid rgba(6, 182, 212, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                  🎓
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                    {viewingStudent.name || "Student Profile"}
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)" }}>
                    {viewingStudent.email}
                  </div>
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setViewingStudent(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Badges Row */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: isMasterAdminStudent(viewingStudent) ? "rgba(245, 158, 11, 0.2)" : viewingStudent.role === "admin" ? "rgba(245, 158, 11, 0.15)" : viewingStudent.role === "half_admin" ? "rgba(168, 85, 247, 0.15)" : "rgba(255, 255, 255, 0.06)",
                  color: isMasterAdminStudent(viewingStudent) ? "#f59e0b" : viewingStudent.role === "admin" ? "#fbbf24" : viewingStudent.role === "half_admin" ? "#c084fc" : "#94a3b8",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                {isMasterAdminStudent(viewingStudent) ? "👑 MASTER ADMIN" : viewingStudent.role === "admin" ? "👑 FULL ADMIN" : viewingStudent.role === "half_admin" ? "⚡ HALF ADMIN" : "🎓 STUDENT"}
              </span>

              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: viewingStudent.isBlocked ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                  color: viewingStudent.isBlocked ? "#f87171" : "#34d399",
                  border: `1px solid ${viewingStudent.isBlocked ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                }}
              >
                {viewingStudent.isBlocked ? "🚫 Account Blocked" : "✅ Account Active"}
              </span>

              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: viewingStudent.neverPurge ? "rgba(52, 211, 153, 0.15)" : "rgba(245, 158, 11, 0.15)",
                  color: viewingStudent.neverPurge ? "#34d399" : "#fbbf24",
                  border: `1px solid ${viewingStudent.neverPurge ? "rgba(52, 211, 153, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                }}
              >
                {viewingStudent.neverPurge ? "🛡️ Immunity Shield (Never Purged)" : `⏳ ${viewingStudent.daysRemaining != null ? viewingStudent.daysRemaining : 90}d to Auto-Purge`}
              </span>
            </div>

            {/* Profile Information Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>University Roll Number</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginTop: "2px" }}>
                  {viewingStudent.rollNumber || "Not Provided"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Mobile Number</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
                  {viewingStudent.mobile && !viewingStudent.mobile.startsWith("enc_gcm:") ? viewingStudent.mobile : "Not Set"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>College / University</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", marginTop: "2px" }}>
                  {viewingStudent.college || "General University"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Branch / Department</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", marginTop: "2px" }}>
                  {viewingStudent.branch || "General / Not Specified"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Academic Year &amp; Semester</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", marginTop: "2px" }}>
                  {viewingStudent.year || "Year N/A"} {viewingStudent.semester ? `• ${viewingStudent.semester}` : ""}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Account UID</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", fontFamily: "monospace", marginTop: "2px" }}>
                  {viewingStudent.id}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Registered Date</div>
                <div style={{ fontSize: "0.8rem", color: "#e2e8f0", marginTop: "2px" }}>
                  {viewingStudent.createdAt ? new Date(viewingStudent.createdAt).toLocaleString("en-IN") : "N/A"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Last Active / Login</div>
                <div style={{ fontSize: "0.8rem", color: "#34d399", fontWeight: 600, marginTop: "2px" }}>
                  {viewingStudent.lastLoginAt ? new Date(viewingStudent.lastLoginAt).toLocaleString("en-IN") : "Never Logged In"}
                </div>
              </div>

              {viewingStudent.deviceSpecs && (
                <div style={{ gridColumn: "1 / -1", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "8px" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase" }}>Hardware Specs Profile</div>
                  <div style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 600, marginTop: "2px" }}>
                    💻 {viewingStudent.deviceSpecs.label || `${viewingStudent.deviceSpecs.cores} CPU Cores • ${viewingStudent.deviceSpecs.memoryGB} GB RAM Memory`}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "14px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const st = viewingStudent;
                    setViewingStudent(null);
                    handleOpenStudentLogs(st);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Activity size={13} color="var(--accent-cyan)" />
                  <span>Activity &amp; Devices</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const st = viewingStudent;
                    setViewingStudent(null);
                    setEditingStudent(st);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Edit3 size={13} />
                  <span>Edit Profile</span>
                </button>
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={() => setViewingStudent(null)}
                style={{ fontSize: "0.8rem", padding: "7px 16px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📊 MODAL 2: QUICK STUDENT ACTIVITY, SECURITY & SESSIONS INSPECTOR        */}
      {/* ========================================================================= */}
      {logStudent && (
        <div className="modal-overlay" onClick={() => setLogStudent(null)} style={{ zIndex: 1250 }}>
          <div
            className="modal-content"
            style={{ maxWidth: "700px", background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "14px", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px", marginBottom: "14px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Activity size={16} color="var(--accent-cyan)" />
                  <span>Activity Logs &amp; Live Devices:</span>
                  <span style={{ color: "var(--accent-cyan)" }}>{logStudent.name}</span>
                </h3>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
                  {logStudent.email}
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setLogStudent(null)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-Tab Navigation Bar */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px", marginBottom: "14px" }}>
              <button
                onClick={() => setActiveLogSubTab("sessions")}
                className={`filter-tab ${activeLogSubTab === "sessions" ? "active" : ""}`}
                style={{ fontSize: "0.78rem", padding: "5px 12px" }}
              >
                📱 Active Devices ({studentLogs.sessions.length})
              </button>
              <button
                onClick={() => setActiveLogSubTab("security")}
                className={`filter-tab ${activeLogSubTab === "security" ? "active" : ""}`}
                style={{ fontSize: "0.78rem", padding: "5px 12px" }}
              >
                🛡️ Security Events ({studentLogs.securityLogs.length})
              </button>
              <button
                onClick={() => setActiveLogSubTab("activities")}
                className={`filter-tab ${activeLogSubTab === "activities" ? "active" : ""}`}
                style={{ fontSize: "0.78rem", padding: "5px 12px" }}
              >
                📚 Academic Trail ({studentLogs.activities.length})
              </button>
            </div>

            {/* Sub-Tab Body */}
            {studentLogsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                <div className="spinner" style={{ width: "22px", height: "22px", margin: "0 auto 8px" }} />
                Loading student telemetry...
              </div>
            ) : (
              <div style={{ maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
                {/* 1. SESSIONS SUB-TAB */}
                {activeLogSubTab === "sessions" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
                        Current active sessions and connected phones/PCs
                      </span>
                      {studentLogs.sessions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleTerminateQuickAll}
                          disabled={terminatingAll}
                          className="btn-danger"
                          style={{ padding: "4px 10px", fontSize: "0.74rem" }}
                        >
                          Logout All Devices
                        </button>
                      )}
                    </div>

                    {studentLogs.sessions.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-dim)", fontSize: "0.8rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                        No active device sessions found. Student is logged out.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {studentLogs.sessions.map((sess) => (
                          <div
                            key={sess.sessionId}
                            style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {getDeviceIcon(sess.deviceType)}
                              <div>
                                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>
                                  {sess.deviceName || "Student Device"}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", display: "flex", gap: "8px", marginTop: "2px" }}>
                                  <span>🌐 {sess.ipAddress || "Active IP"}</span>
                                  {sess.location && <span>📍 {sess.location}</span>}
                                  <span>• Logged in: {sess.createdAt ? new Date(sess.createdAt).toLocaleDateString() : "Active"}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={terminatingSessionId === sess.sessionId}
                              onClick={() => handleTerminateQuickSingle(sess.sessionId, sess.deviceName)}
                              className="btn-danger"
                              style={{ padding: "4px 8px", fontSize: "0.72rem" }}
                            >
                              Disconnect
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. SECURITY EVENTS SUB-TAB */}
                {activeLogSubTab === "security" && (
                  <div>
                    {studentLogs.securityLogs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-dim)", fontSize: "0.8rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                        No security logs recorded yet for this student.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {studentLogs.securityLogs.slice(0, 15).map((log) => (
                          <div
                            key={log.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "6px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", fontSize: "0.75rem" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ padding: "2px 6px", borderRadius: "4px", background: log.action === "LOGIN" ? "rgba(16, 185, 129, 0.15)" : log.action.includes("TERMINATE") ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.15)", color: log.action === "LOGIN" ? "#34d399" : log.action.includes("TERMINATE") ? "#fca5a5" : "#38bdf8", fontWeight: 700, fontSize: "0.68rem" }}>
                                {log.action}
                              </span>
                              <span style={{ color: "#e2e8f0" }}>{log.details || log.deviceName}</span>
                            </div>
                            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>
                              {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recent"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. ACADEMIC ACTIVITIES SUB-TAB */}
                {activeLogSubTab === "activities" && (
                  <div>
                    {studentLogs.activities.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-dim)", fontSize: "0.8rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                        No academic activities recorded yet for this student.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {studentLogs.activities.slice(0, 25).map((act, idx) => (
                          <div
                            key={act.id || idx}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "6px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", fontSize: "0.75rem" }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: "#fff" }}>{act.action || act.type || "Action"}: </span>
                              <span style={{ color: "#38bdf8" }}>{act.noteTitle || act.subject || act.details || "Academic item"}</span>
                            </div>
                            <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>
                              {act.timestamp ? new Date(act.timestamp).toLocaleDateString() : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "12px", marginTop: "14px" }}>
              <button
                type="button"
                onClick={() => {
                  const target = logStudent;
                  setLogStudent(null);
                  loadStudentActivities(target);
                }}
                className="btn-secondary"
                style={{ fontSize: "0.78rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>Full Activity Studio →</span>
              </button>

              <button
                type="button"
                onClick={() => setLogStudent(null)}
                className="btn-primary"
                style={{ fontSize: "0.78rem", padding: "6px 16px" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
