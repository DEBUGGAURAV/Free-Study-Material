import { useState } from "react";
import { X, Trash2, Eye, Edit3, UserCheck, UserX, Activity, Search, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Smartphone, Laptop, BookOpen, Shield, Sliders } from "lucide-react";
import { api } from "../../../api";
import "../../../utils/formatUtils";
import "../../../utils/hardwareAdaptiveEngine";
import "../../VirtualPdfReader";
import AdminSubModal from "../AdminSubModal";

const MASTER_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
const isMasterAdminStudent = (student) => {
  if (!student) return false;
  if (student.isMainAdmin || student.isMasterAdmin) return true;
  if (MASTER_ADMIN_EMAIL && student.email && student.email.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  return false;
};

export function getDisplayRom(specs) {
  if (!specs) return "128GB ROM";
  const label = `${specs.label || ""} ${specs.deviceName || ""} ${specs.brand || ""} ${specs.os || ""}`.toLowerCase();
  const isApple = /apple|iphone|ipad|macintosh|mac\s*os|ios/i.test(label);
  const isMobile = specs.isMobile !== false && !/macintosh|mac\s*os|macbook/i.test(label);

  if (specs.romGB && Number(specs.romGB) >= 32) return `${specs.romGB}GB ${isMobile ? "ROM" : "SSD"}`;
  if (specs.realRomGB && Number(specs.realRomGB) >= 32) return `${specs.realRomGB}GB ${isMobile ? "ROM" : "SSD"}`;

  const rawStorageGB = Number(specs.storageGB || 0);
  if (rawStorageGB >= 32 && Number.isInteger(rawStorageGB)) {
    return `${rawStorageGB}GB ${isMobile ? "ROM" : "SSD"}`;
  }

  if (specs.storage && typeof specs.storage === "string") {
    const match = specs.storage.match(/(1\s*TB|2\s*TB|32\s*GB|64\s*GB|128\s*GB|256\s*GB|512\s*GB)/i);
    if (match) return match[1].replace(/\s+/g, "") + (match[1].toLowerCase().includes("tb") || !isMobile ? " SSD" : " ROM");
  }

  // Apple Mac & iPhone resolution
  if (isApple) {
    if (!isMobile) {
      return (Number(specs.cores) >= 8 || Number(specs.memoryGB) >= 8) ? "512GB SSD" : "256GB SSD";
    }
    if (/pro\s*max/i.test(label) || /15\s*pro|16\s*pro/i.test(label)) return "256GB ROM";
    if (/11|xr|x|8|se/i.test(label)) return "64GB ROM";
    return "128GB ROM";
  }

  // Reverse-map legacy browser quota (e.g. 6.5, 12.8) to real phone/PC ROM
  const quota = rawStorageGB > 0 ? rawStorageGB : 0;
  const mem = Number(specs.memoryGB || 4);
  const cores = Number(specs.cores || 4);

  if (!isMobile) {
    if (quota >= 150 || mem >= 16 || cores >= 16) return "1TB SSD";
    if (quota >= 45 || mem >= 8 || cores >= 8) return "512GB SSD";
    if (quota >= 18 || mem >= 6 || cores >= 4) return "256GB SSD";
    return "128GB SSD";
  }

  if (quota >= 45 || mem >= 12) return "512GB ROM";
  if (quota >= 20 || (mem >= 8 && cores >= 8)) return "256GB ROM";
  if (quota >= 6 || mem >= 4 || cores >= 6) return "128GB ROM";
  if (mem >= 3 || cores >= 4) return "64GB ROM";
  return "32GB ROM";
}

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
    studentsOnlineCount = 0,
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

  // Helper to format last seen or active time with precise hour & minute (hh:mm a)
  const formatLastSeen = (dateStr) => {
    if (!dateStr) return "Never logged in";
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    if (isNaN(diffMs)) return "Never logged in";

    const timeStr = date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (diffMs < 60000 && diffMs >= 0) return `Just now • ${timeStr}`;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago (${timeStr})`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      const isToday = new Date().toDateString() === date.toDateString();
      return isToday ? `Today at ${timeStr} (${hours}h ago)` : `Yesterday at ${timeStr} (${hours}h ago)`;
    }
    const days = Math.floor(hours / 24);
    const dateFormatted = date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
    if (days === 1) return `Yesterday at ${timeStr}`;
    if (days < 30) return `${dateFormatted} at ${timeStr} (${days}d ago)`;
    return `${dateFormatted} at ${timeStr}`;
  };

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
      if (statusFilter === "online" && !s.isOnline) return false;
      if (statusFilter === "recent" && !s.isOnline && !s.isRecentlyActive) return false;
      if (statusFilter === "active" && s.isBlocked) return false;
      if (statusFilter === "blocked" && !s.isBlocked) return false;
      if (statusFilter === "immune" && !s.neverPurge) return false;
      if (statusFilter === "expiring" && (s.neverPurge || (s.daysRemaining ?? 90) > 30)) return false;
    }
    return true;
  });

  // Realtime online users count
  const onlineCount = studentsOnlineCount || (students || []).filter((s) => s.isOnline).length;

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
        "Hardware Specs", "Device Storage",
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
        `"${s.deviceSpecs?.cores ? `${s.deviceSpecs.cores} Cores, ${s.deviceSpecs.memoryGB}GB RAM` : ""}"`,
        `"${getDisplayRom(s.deviceSpecs)}${s.deviceSpecs?.browserQuotaGB ? ` (${s.deviceSpecs.browserQuotaGB}GB Quota)` : ""}"`,
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
            <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#38bdf8" }} />
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
            <option value="online">🟢 Online Now (Active on Site)</option>
            <option value="recent">🟡 Recently Active (&lt;15m)</option>
            <option value="active">Active Accounts</option>
            <option value="blocked">Blocked Accounts</option>
            <option value="immune">🛡️ Immune (Never Purged)</option>
            <option value="expiring">⏳ Expiring Soon (&lt;30d)</option>
          </select>

          {/* 🟢 Dedicated 1-Click Quick Filter: Online Users */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === "online" ? "all" : "online"))}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 13px",
              borderRadius: "20px",
              fontSize: "0.8rem",
              fontWeight: 700,
              background: statusFilter === "online" ? "#10b981" : "#ecfdf5",
              color: statusFilter === "online" ? "#ffffff" : "#047857",
              border: `1.5px solid ${statusFilter === "online" ? "#10b981" : "#a7f3d0"}`,
              cursor: "pointer",
              boxShadow: statusFilter === "online" ? "0 2px 8px rgba(16, 185, 129, 0.35)" : "none",
              transition: "all 0.15s ease",
            }}
            title="Click to view students currently active or online on the site"
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: statusFilter === "online" ? "#ffffff" : "#10b981",
                boxShadow: "0 0 8px #10b981",
                display: "inline-block",
              }}
            />
            <span style={{ color: statusFilter === "online" ? "#ffffff" : "#047857", fontWeight: 700 }}>
              Online ({onlineCount})
            </span>
          </button>

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
        <div
          style={{
            background: "rgba(244, 63, 94, 0.12)",
            border: "1px solid rgba(244, 63, 94, 0.35)",
            color: "#fca5a5",
            padding: "12px 16px",
            borderRadius: "10px",
            marginBottom: "16px",
            fontSize: "0.86rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.1rem" }}>⚠️</span>
            <span>
              {String(studentsError).includes("<") || String(studentsError).includes("Suspended") || String(studentsError).includes("DOCTYPE") || String(studentsError).includes("html")
                ? "Backend cluster node is waking up from sleep. Click Refresh below to load students."
                : studentsError}
            </span>
          </div>
          {typeof loadStudents === "function" && (
            <button
              type="button"
              onClick={() => loadStudents()}
              disabled={studentsLoading}
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: studentsLoading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RefreshCw size={12} className={studentsLoading ? "spin" : ""} />
              <span>{studentsLoading ? "Loading..." : "Refresh Student Registry"}</span>
            </button>
          )}
        </div>
      )}

      {/* Student Registry Table */}
      <div style={{ background: "rgba(15, 23, 42, 0.55)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(56, 189, 248, 0.2)", color: "#cbd5e1", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.5px" }}>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <UserCheck size={13} style={{ color: "#38bdf8" }} />
                  <span>STUDENT NAME &amp; EMAIL</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <BookOpen size={13} style={{ color: "#818cf8" }} />
                  <span>COLLEGE, BRANCH &amp; YEAR</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Shield size={13} style={{ color: "#fbbf24" }} />
                  <span>ROLE</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Activity size={13} style={{ color: "#34d399" }} />
                  <span>STATUS</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                  <Sliders size={13} style={{ color: "#c084fc" }} />
                  <span>ACTIONS</span>
                </div>
              </th>
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
                <tr key={student.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div
                      style={{ fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() => setViewingStudent(student)}
                      title="Click to view complete student profile and details"
                    >
                      <span className="student-name-text" style={{ color: "#0f172a", fontWeight: 800, textDecoration: "underline", textDecorationColor: "#64748b" }}>
                        {student.name || "Student"}
                      </span>
                      {isMasterAdminStudent(student) && (
                        <span style={{ color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", padding: "1px 6px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 800 }}>👑 Master Admin</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#0284c7", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontWeight: 600 }}>
                      <span style={{ color: "#0284c7" }}>{student.email}</span>
                      <span
                        onClick={() => setEditingStudent && setEditingStudent(student)}
                        title="Click to view or update student mobile number"
                        style={{
                          color: student.mobile && !student.mobile.startsWith("enc_gcm:") && student.mobile !== "N/A" && student.mobile !== "Not Set" ? "#0369a1" : "#92400e",
                          fontWeight: 700,
                          cursor: "pointer",
                          background: student.mobile && !student.mobile.startsWith("enc_gcm:") && student.mobile !== "N/A" && student.mobile !== "Not Set" ? "#f0f9ff" : "#fffbeb",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          border: `1px solid ${student.mobile && !student.mobile.startsWith("enc_gcm:") && student.mobile !== "N/A" && student.mobile !== "Not Set" ? "#bae6fd" : "#fde68a"}`,
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
                            color: "#0369a1",
                            background: "#e0f2fe",
                            border: "1px solid #7dd3fc",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title={student.deviceSpecs.label || `${student.deviceSpecs.cores} Cores, ${student.deviceSpecs.memoryGB}GB RAM • ROM: ${getDisplayRom(student.deviceSpecs)}`}
                        >
                          <span>💻 {student.deviceSpecs.cores}C • {student.deviceSpecs.memoryGB}GB</span>
                          <span style={{ color: "#0284c7" }}>•</span>
                          <span style={{ color: "#0284c7" }}>
                            💾 {getDisplayRom(student.deviceSpecs)}
                          </span>
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
                          background: student.neverPurge ? "#ecfdf5" : "#fffbeb",
                          color: student.neverPurge ? "#047857" : "#b45309",
                          border: `1px solid ${student.neverPurge ? "#a7f3d0" : "#fde68a"}`,
                        }}
                      >
                        ⏳ {student.neverPurge ? "🛡️ Immune (Never Purged)" : `${student.daysRemaining != null ? student.daysRemaining : (dbRetentionDays || 90)}d to purge`}
                      </span>
                      {!student.neverPurge && student.scheduledPurgeDate && (
                        <span style={{ fontSize: "0.68rem", color: "#475569", fontWeight: 500 }}>
                          • Scheduled: {student.scheduledPurgeDate}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{student.college || "General University"}</div>
                    <div style={{ fontSize: "0.74rem", color: "#334155", marginTop: "2px", display: "flex", gap: "6px", flexWrap: "wrap", fontWeight: 500 }}>
                      {student.branch && (
                        <span style={{ color: "#0284c7", fontWeight: 700 }}>{student.branch}</span>
                      )}
                      <span style={{ color: "#475569", fontWeight: 600 }}>{student.year || "Year N/A"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background:
                          isMasterAdminStudent(student)
                            ? "#fef3c7"
                            : student.role === "admin"
                            ? "#fffbeb"
                            : student.role === "half_admin"
                            ? "#ede9fe"
                            : "#f1f5f9",
                        color:
                          isMasterAdminStudent(student)
                            ? "#92400e"
                            : student.role === "admin"
                            ? "#b45309"
                            : student.role === "half_admin"
                            ? "#6d28d9"
                            : "#1e293b",
                        border: `1px solid ${
                          isMasterAdminStudent(student)
                            ? "#fcd34d"
                            : student.role === "admin"
                            ? "#fde68a"
                            : student.role === "half_admin"
                            ? "#c4b5fd"
                            : "#cbd5e1"
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
                      <span style={{ color: "#b91c1c", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <UserX size={14} /> Blocked
                      </span>
                    ) : student.isOnline ? (
                      <div>
                        <span
                          style={{
                            background: "#ecfdf5",
                            color: "#047857",
                            border: "1px solid #a7f3d0",
                            padding: "3px 9px",
                            borderRadius: "20px",
                            fontWeight: 800,
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            boxShadow: "0 1px 4px rgba(16, 185, 129, 0.2)",
                          }}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: "#10b981",
                              boxShadow: "0 0 8px #10b981",
                              display: "inline-block",
                            }}
                          />
                          Online Now
                        </span>
                        <div style={{ fontSize: "0.68rem", color: "#059669", fontWeight: 600, marginTop: "2px" }}>
                          Active on site • Live ({new Date(student.lastActiveAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })})
                        </div>
                      </div>
                    ) : student.isRecentlyActive ? (
                      <div>
                        <span
                          style={{
                            background: "#fef3c7",
                            color: "#b45309",
                            border: "1px solid #fcd34d",
                            padding: "3px 9px",
                            borderRadius: "20px",
                            fontWeight: 700,
                            fontSize: "0.72rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: "#f59e0b",
                              display: "inline-block",
                            }}
                          />
                          Away (&lt;15m)
                        </span>
                        <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 500, marginTop: "2px" }}>
                          Seen {formatLastSeen(student.lastActiveAt || student.lastLoginAt)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span
                          style={{
                            color: "#64748b",
                            fontWeight: 600,
                            fontSize: "0.74rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "#94a3b8",
                              display: "inline-block",
                            }}
                          />
                          Offline
                        </span>
                        <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 500, marginTop: "2px" }}>
                          {formatLastSeen(student.lastActiveAt || student.lastLoginAt)}
                        </div>
                      </div>
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

      {/* 👁️ MODAL 1: VIEW STUDENT COMPLETE PROFILE DETAILS */}
      <AdminSubModal
        isOpen={Boolean(viewingStudent)}
        onClose={() => setViewingStudent(null)}
        title={viewingStudent?.name || "Student Profile"}
        subtitle={viewingStudent?.email || ""}
        icon={UserCheck}
        accentColor="#4f46e5"
        maxWidth="600px"
        zIndex={1250}
      >
        {viewingStudent && (
          <div>
            {/* Badges Row */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: isMasterAdminStudent(viewingStudent) ? "#fef3c7" : viewingStudent.role === "admin" ? "#fef3c7" : viewingStudent.role === "half_admin" ? "#f3e8ff" : "#eff6ff",
                  color: isMasterAdminStudent(viewingStudent) ? "#92400e" : viewingStudent.role === "admin" ? "#92400e" : viewingStudent.role === "half_admin" ? "#7e22ce" : "#1d4ed8",
                  border: `1px solid ${isMasterAdminStudent(viewingStudent) ? "#fde68a" : viewingStudent.role === "admin" ? "#fde68a" : viewingStudent.role === "half_admin" ? "#d8b4fe" : "#bfdbfe"}`,
                }}
              >
                {isMasterAdminStudent(viewingStudent) ? "👑 MASTER ADMIN" : viewingStudent.role === "admin" ? "👑 FULL ADMIN" : viewingStudent.role === "half_admin" ? "⚡ HALF ADMIN" : "🎓 STUDENT"}
              </span>

              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: viewingStudent.isBlocked ? "#fef2f2" : viewingStudent.isOnline ? "#ecfdf5" : viewingStudent.isRecentlyActive ? "#fef3c7" : "#f1f5f9",
                  color: viewingStudent.isBlocked ? "#dc2626" : viewingStudent.isOnline ? "#059669" : viewingStudent.isRecentlyActive ? "#b45309" : "#64748b",
                  border: `1px solid ${viewingStudent.isBlocked ? "#fecaca" : viewingStudent.isOnline ? "#a7f3d0" : viewingStudent.isRecentlyActive ? "#fcd34d" : "#cbd5e1"}`,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                {viewingStudent.isBlocked ? (
                  "🚫 Account Blocked"
                ) : viewingStudent.isOnline ? (
                  <>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                    🟢 Online Now (Active on Site)
                  </>
                ) : viewingStudent.isRecentlyActive ? (
                  <>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f59e0b" }} />
                    🟡 Away (&lt;15m)
                  </>
                ) : (
                  <>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#94a3b8" }} />
                    ⚪ Offline
                  </>
                )}
              </span>

              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: viewingStudent.neverPurge ? "#ecfdf5" : "#fffbeb",
                  color: viewingStudent.neverPurge ? "#059669" : "#d97706",
                  border: `1px solid ${viewingStudent.neverPurge ? "#a7f3d0" : "#fde68a"}`,
                }}
              >
                {viewingStudent.neverPurge ? "🛡️ Immunity Shield (Never Purged)" : `⏳ ${viewingStudent.daysRemaining != null ? viewingStudent.daysRemaining : 90}d to Auto-Purge`}
              </span>
            </div>

            {/* Profile Information Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "14px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Mobile Number</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 750, color: "#0284c7", marginTop: "2px" }}>
                  {viewingStudent.mobile && !viewingStudent.mobile.startsWith("enc_gcm:") ? viewingStudent.mobile : "Not Set"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>College / University</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {viewingStudent.college || "General University"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Branch / Department</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {viewingStudent.branch || "General / Not Specified"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Academic Year</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {viewingStudent.year || "Year N/A"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Account UID</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", fontFamily: "monospace", marginTop: "2px" }}>
                  {viewingStudent.id}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Registered Date</div>
                <div style={{ fontSize: "0.8rem", color: "#334155", marginTop: "2px" }}>
                  {viewingStudent.createdAt ? new Date(viewingStudent.createdAt).toLocaleString("en-IN") : "N/A"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Realtime Activity / Seen</div>
                <div style={{ fontSize: "0.8rem", color: viewingStudent.isOnline ? "#059669" : "#0f172a", fontWeight: 700, marginTop: "2px" }}>
                  {viewingStudent.isOnline
                    ? "🟢 Active on Site Right Now"
                    : viewingStudent.lastActiveAt
                    ? new Date(viewingStudent.lastActiveAt).toLocaleString("en-IN")
                    : viewingStudent.lastLoginAt
                    ? new Date(viewingStudent.lastLoginAt).toLocaleString("en-IN")
                    : "Never Logged In"}
                </div>
              </div>

              {viewingStudent.deviceSpecs && (
                <div style={{ gridColumn: "1 / -1", borderTop: "1.5px solid #e2e8f0", paddingTop: "8px" }}>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Hardware &amp; Storage Profile</div>
                  <div style={{ fontSize: "0.8rem", color: "#0284c7", fontWeight: 700, marginTop: "4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span>💻 {viewingStudent.deviceSpecs.label || `${viewingStudent.deviceSpecs.cores} CPU Cores • ${viewingStudent.deviceSpecs.memoryGB} GB RAM Memory`}</span>
                    <span style={{ color: "#0891b2", background: "#ecfeff", border: "1px solid #a5f3fc", padding: "1px 7px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      💾 <strong>Device Storage (ROM):</strong> {getDisplayRom(viewingStudent.deviceSpecs)}
                    </span>
                    {(viewingStudent.deviceSpecs.browserQuotaGB || (Number(viewingStudent.deviceSpecs.storageGB) > 0 && Number(viewingStudent.deviceSpecs.storageGB) < 32)) && (
                      <span style={{ color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "1px 7px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.74rem" }}>
                        🌐 <strong>Browser Cache Quota:</strong> {viewingStudent.deviceSpecs.browserQuotaGB || viewingStudent.deviceSpecs.storageGB} GB
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", borderTop: "1.5px solid #f1f5f9", paddingTop: "14px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const st = viewingStudent;
                    setViewingStudent(null);
                    handleOpenStudentLogs(st);
                  }}
                  className="adm-btn-pill"
                >
                  <Activity size={13} style={{ color: "#0284c7" }} />
                  <span>Activity &amp; Devices</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const st = viewingStudent;
                    setViewingStudent(null);
                    setEditingStudent(st);
                  }}
                  className="adm-btn-pill"
                >
                  <Edit3 size={13} />
                  <span>Edit Profile</span>
                </button>
              </div>

              <button
                type="button"
                className="adm-btn-pill primary"
                onClick={() => setViewingStudent(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </AdminSubModal>

      {/* 📊 MODAL 2: QUICK STUDENT ACTIVITY, SECURITY & SESSIONS INSPECTOR */}
      <AdminSubModal
        isOpen={Boolean(logStudent)}
        onClose={() => setLogStudent(null)}
        title={logStudent ? `Activity & Devices: ${logStudent.name}` : "Activity Logs"}
        subtitle={logStudent?.email || ""}
        icon={Activity}
        accentColor="#0284c7"
        maxWidth="700px"
        zIndex={1250}
      >
        {logStudent && (
          <div>
            {/* Sub-Tab Navigation Bar */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1.5px solid #f1f5f9", paddingBottom: "10px", marginBottom: "14px" }}>
              <button
                type="button"
                onClick={() => setActiveLogSubTab("sessions")}
                className="adm-btn-pill"
                style={{
                  background: activeLogSubTab === "sessions" ? "#eff6ff" : "#ffffff",
                  borderColor: activeLogSubTab === "sessions" ? "#2563eb" : "#cbd5e1",
                  color: activeLogSubTab === "sessions" ? "#1d4ed8" : "#475569",
                  padding: "4px 10px",
                }}
              >
                📱 Active Devices ({studentLogs.sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLogSubTab("security")}
                className="adm-btn-pill"
                style={{
                  background: activeLogSubTab === "security" ? "#eff6ff" : "#ffffff",
                  borderColor: activeLogSubTab === "security" ? "#2563eb" : "#cbd5e1",
                  color: activeLogSubTab === "security" ? "#1d4ed8" : "#475569",
                  padding: "4px 10px",
                }}
              >
                🛡️ Security Events ({studentLogs.securityLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLogSubTab("activities")}
                className="adm-btn-pill"
                style={{
                  background: activeLogSubTab === "activities" ? "#eff6ff" : "#ffffff",
                  borderColor: activeLogSubTab === "activities" ? "#2563eb" : "#cbd5e1",
                  color: activeLogSubTab === "activities" ? "#1d4ed8" : "#475569",
                  padding: "4px 10px",
                }}
              >
                📚 Academic Trail ({studentLogs.activities.length})
              </button>
            </div>

            {/* Sub-Tab Body */}
            {studentLogsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                <div className="spinner" style={{ width: "22px", height: "22px", margin: "0 auto 8px" }} />
                Loading student telemetry...
              </div>
            ) : (
              <div style={{ maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
                {/* 1. SESSIONS SUB-TAB */}
                {activeLogSubTab === "sessions" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                        Current active sessions and connected phones/PCs
                      </span>
                      {studentLogs.sessions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleTerminateQuickAll}
                          disabled={terminatingAll}
                          className="adm-btn-pill danger"
                          style={{ padding: "4px 10px", fontSize: "0.74rem" }}
                        >
                          Logout All Devices
                        </button>
                      )}
                    </div>

                    {studentLogs.sessions.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: "0.8rem", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px" }}>
                        No active device sessions found. Student is logged out.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {studentLogs.sessions.map((sess) => (
                          <div
                            key={sess.sessionId}
                            style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              {getDeviceIcon(sess.deviceType)}
                              <div>
                                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
                                  {sess.deviceName || "Student Device"}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "#64748b", display: "flex", gap: "8px", marginTop: "2px" }}>
                                  <span>🌐 {sess.ipAddress || "Active IP"}</span>
                                  {sess.location && <span>📍 {sess.location}</span>}
                                  <span>• Active: {sess.lastActiveAt ? new Date(sess.lastActiveAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : (sess.createdAt ? new Date(sess.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "Active")}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={terminatingSessionId === sess.sessionId}
                              onClick={() => handleTerminateQuickSingle(sess.sessionId, sess.deviceName)}
                              className="adm-btn-pill danger"
                              style={{ padding: "3px 8px", fontSize: "0.7rem" }}
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
                      <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: "0.8rem", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px" }}>
                        No security logs recorded yet for this student.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {studentLogs.securityLogs.slice(0, 15).map((log) => (
                          <div
                            key={log.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "6px", background: "#ffffff", border: "1.5px solid #e2e8f0", fontSize: "0.75rem" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ padding: "2px 6px", borderRadius: "4px", background: log.action === "LOGIN" ? "#ecfdf5" : log.action.includes("TERMINATE") ? "#fef2f2" : "#eff6ff", color: log.action === "LOGIN" ? "#059669" : log.action.includes("TERMINATE") ? "#dc2626" : "#2563eb", fontWeight: 750, fontSize: "0.68rem" }}>
                                {log.action}
                              </span>
                              <span style={{ color: "#334155" }}>{log.details || log.deviceName}</span>
                            </div>
                            <span style={{ color: "#64748b", fontSize: "0.7rem" }}>
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
                      <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: "0.8rem", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px" }}>
                        No academic activities recorded yet for this student.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {studentLogs.activities.slice(0, 25).map((act, idx) => (
                          <div
                            key={act.id || idx}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: "6px", background: "#ffffff", border: "1.5px solid #e2e8f0", fontSize: "0.75rem" }}
                          >
                            <div>
                              <span style={{ fontWeight: 700, color: "#0f172a" }}>{act.action || act.type || "Action"}: </span>
                              <span style={{ color: "#0284c7" }}>{act.noteTitle || act.subject || act.details || "Academic item"}</span>
                            </div>
                            <span style={{ color: "#64748b", fontSize: "0.7rem" }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid #f1f5f9", paddingTop: "12px", marginTop: "14px" }}>
              <button
                type="button"
                onClick={() => {
                  const target = logStudent;
                  setLogStudent(null);
                  loadStudentActivities(target);
                }}
                className="adm-btn-pill"
              >
                <span>Full Activity Studio →</span>
              </button>

              <button
                type="button"
                onClick={() => setLogStudent(null)}
                className="adm-btn-pill primary"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </AdminSubModal>
    </div>
  );
}
