import { useState, useEffect, useCallback } from "react";
import { Activity, Trash2, LogOut, Smartphone, Laptop, Tablet, RefreshCw, CheckSquare, Square, AlertTriangle, CheckCircle2, MapPin, Globe } from "lucide-react";
import { api } from "../../../api";

export default function TabActivities(props) {
  const {
    activities = [],
    activitiesLoading = false,
    handleClearAllActivities,
    handleDeleteActivity,
    selectedStudentForActivity,
    setActiveTab,
  } = props;

  const [studentSessions, setStudentSessions] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState(null);
  const [terminatingAll, setTerminatingAll] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [terminatingSelected, setTerminatingSelected] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const studentId = selectedStudentForActivity?.id;
  const studentName = selectedStudentForActivity?.name || "Student";
  const studentEmail = selectedStudentForActivity?.email || "";

  const showMsg = (type, text) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const loadSessionsAndLogs = useCallback(async () => {
    if (!studentId) return;
    setSessionsLoading(true);
    try {
      const res = await api.getStudentSessions(studentId);
      if (res?.success) {
        setStudentSessions(res.sessions || []);
        setSecurityLogs(res.securityLogs || []);
      }
    } catch (err) {
      console.warn("[ADMIN-STUDENT-SESSIONS] Failed to load sessions:", err.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadSessionsAndLogs();
  }, [loadSessionsAndLogs]);

  // Toggle single session in multi-selection
  const handleToggleSelectSession = (sessionId) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  };

  // Select all or deselect all
  const handleToggleSelectAll = () => {
    if (selectedSessionIds.length === studentSessions.length) {
      setSelectedSessionIds([]);
    } else {
      setSelectedSessionIds(studentSessions.map((s) => s.sessionId));
    }
  };

  // Terminate Single Device
  const handleTerminateSingle = async (sessionId, deviceName) => {
    if (!window.confirm(`Logout & terminate active session on "${deviceName}" for ${studentName}? That device will be logged out immediately.`)) {
      return;
    }
    setTerminatingSessionId(sessionId);
    try {
      const res = await api.terminateStudentSession(studentId, sessionId);
      if (res?.success) {
        showMsg("success", `Terminated session on "${deviceName}". Device is now logged out.`);
        setSelectedSessionIds((prev) => prev.filter((id) => id !== sessionId));
        await loadSessionsAndLogs();
      } else {
        showMsg("error", res?.message || "Failed to terminate session.");
      }
    } catch (err) {
      showMsg("error", "Failed to terminate session: " + err.message);
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Terminate Selected Multiple Devices
  const handleTerminateSelected = async () => {
    if (selectedSessionIds.length === 0) return;
    if (!window.confirm(`Logout and terminate ${selectedSessionIds.length} selected device(s) for ${studentName}?`)) {
      return;
    }
    setTerminatingSelected(true);
    try {
      const res = await api.terminateMultipleStudentSessions(studentId, selectedSessionIds);
      if (res?.success) {
        showMsg("success", `Terminated ${selectedSessionIds.length} device sessions successfully.`);
        setSelectedSessionIds([]);
        await loadSessionsAndLogs();
      } else {
        showMsg("error", res?.message || "Failed to terminate selected sessions.");
      }
    } catch (err) {
      showMsg("error", "Multi-device logout failed: " + err.message);
    } finally {
      setTerminatingSelected(false);
    }
  };

  // Terminate All Devices (Complete Remote Logout)
  const handleTerminateAll = async () => {
    if (studentSessions.length === 0) return;
    if (!window.confirm(`Are you sure you want to LOGOUT ALL active devices for ${studentName}? They will be completely disconnected everywhere.`)) {
      return;
    }
    setTerminatingAll(true);
    try {
      const res = await api.terminateAllStudentSessions(studentId);
      if (res?.success) {
        showMsg("success", `All active devices for ${studentName} have been logged out.`);
        setSelectedSessionIds([]);
        await loadSessionsAndLogs();
      } else {
        showMsg("error", res?.message || "Failed to terminate all sessions.");
      }
    } catch (err) {
      showMsg("error", "Logout all devices failed: " + err.message);
    } finally {
      setTerminatingAll(false);
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === "mobile") return <Smartphone size={18} color="#38bdf8" />;
    if (deviceType === "tablet") return <Tablet size={18} color="#a78bfa" />;
    return <Laptop size={18} color="#34d399" />;
  };

  if (!selectedStudentForActivity) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
        No student selected. <button onClick={() => setActiveTab("students")} className="btn-secondary" style={{ marginLeft: "8px" }}>Back to Registry</button>
      </div>
    );
  }

  const allSelected = studentSessions.length > 0 && selectedSessionIds.length === studentSessions.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top Header Card */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.6))",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Activity &amp; Device Control:</span>
              <span style={{ color: "var(--accent-cyan)" }}>{studentName}</span>
            </h3>
            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>({studentEmail})</span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "999px",
                background: studentSessions.length > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${studentSessions.length > 0 ? "rgba(16, 185, 129, 0.35)" : "rgba(255, 255, 255, 0.1)"}`,
                color: studentSessions.length > 0 ? "#34d399" : "#94a3b8",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Smartphone size={12} />
              <span>{studentSessions.length} Active {studentSessions.length === 1 ? "Device" : "Devices"}</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.74rem", padding: "2px 8px", borderRadius: "6px", background: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)", color: "#38bdf8", fontWeight: 600 }}>
              📞 Mobile: {selectedStudentForActivity.mobile && !selectedStudentForActivity.mobile.startsWith("enc_gcm:") ? selectedStudentForActivity.mobile : "Not Set"}
            </span>
            <span style={{ fontSize: "0.74rem", padding: "2px 8px", borderRadius: "6px", background: "rgba(167, 139, 250, 0.12)", border: "1px solid rgba(167, 139, 250, 0.25)", color: "#c4b5fd", fontWeight: 600 }}>
              🏛️ {selectedStudentForActivity.college || "General University"}
            </span>
            <span style={{ fontSize: "0.74rem", padding: "2px 8px", borderRadius: "6px", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)", color: "#fbbf24", fontWeight: 600 }}>
              🎓 {selectedStudentForActivity.year || "Year N/A"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={loadSessionsAndLogs}
            disabled={sessionsLoading}
            className="btn-secondary"
            style={{ padding: "7px 12px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
            title="Refresh student devices and activity logs"
          >
            <RefreshCw size={13} className={sessionsLoading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("students")}
            className="btn-secondary"
            style={{ padding: "7px 14px", fontSize: "0.8rem" }}
          >
            &larr; Back to Student Registry
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {feedbackMsg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "0.8rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: feedbackMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${feedbackMsg.type === "success" ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
            color: feedbackMsg.type === "success" ? "#34d399" : "#fca5a5",
          }}
        >
          {feedbackMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: 📱 ACTIVE LOGGED-IN DEVICES (SINGLE & MULTIPLE REMOTE LOGOUT) */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Smartphone size={17} color="#38bdf8" />
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
                Active Logged-In Devices ({studentSessions.length})
              </h4>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "0.74rem", color: "var(--text-dim)" }}>
              Admin remote session terminator. Logout a single device or terminate multiple phones and PCs instantly.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {studentSessions.length > 1 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="btn-secondary"
                style={{ padding: "6px 10px", fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "5px" }}
              >
                {allSelected ? <CheckSquare size={13} color="#38bdf8" /> : <Square size={13} />}
                <span>{allSelected ? "Deselect All" : "Select All"}</span>
              </button>
            )}

            {/* Logout Selected Button */}
            {selectedSessionIds.length > 0 && (
              <button
                type="button"
                disabled={terminatingSelected}
                onClick={handleTerminateSelected}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.76rem",
                  borderRadius: "6px",
                  background: "rgba(244, 63, 94, 0.18)",
                  border: "1px solid rgba(244, 63, 94, 0.4)",
                  color: "#fda4af",
                  cursor: terminatingSelected ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: 700,
                  transition: "all 0.15s ease",
                }}
                title={`Terminate ${selectedSessionIds.length} selected device sessions`}
              >
                <LogOut size={13} className={terminatingSelected ? "spin" : ""} />
                <span>{terminatingSelected ? "Terminating..." : `Logout Selected (${selectedSessionIds.length})`}</span>
              </button>
            )}

            {/* Logout All Devices Button */}
            <button
              type="button"
              disabled={terminatingAll || studentSessions.length === 0}
              onClick={handleTerminateAll}
              className="btn-danger"
              style={{
                padding: "6px 12px",
                fontSize: "0.76rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 700,
                opacity: studentSessions.length === 0 ? 0.5 : 1,
                cursor: studentSessions.length === 0 ? "not-allowed" : "pointer",
              }}
              title="Remote logout across ALL student devices"
            >
              <LogOut size={13} className={terminatingAll ? "spin" : ""} />
              <span>{terminatingAll ? "Revoking All..." : "Logout All Devices"}</span>
            </button>
          </div>
        </div>

        {sessionsLoading ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "0.78rem" }}>
            <div className="spinner" style={{ width: "20px", height: "20px", margin: "0 auto 6px" }} />
            Scanning student active sessions...
          </div>
        ) : studentSessions.length === 0 ? (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
              fontSize: "0.78rem",
              color: "var(--text-dim)",
            }}
          >
            No active device sessions found for this student. They are currently logged out.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "10px" }}>
            {studentSessions.map((sess) => {
              const isSelected = selectedSessionIds.includes(sess.sessionId);
              const isTerminating = terminatingSessionId === sess.sessionId;
              const loginDate = sess.createdAt ? new Date(sess.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Active";
              const lastActiveDiff = Date.now() - Number(sess.lastActiveAt || sess.createdAt || Date.now());
              const lastActiveMins = Math.floor(lastActiveDiff / 60000);
              const lastActiveStr = lastActiveMins < 2 ? "Active now" : `${lastActiveMins}m ago`;

              return (
                <div
                  key={sess.sessionId}
                  style={{
                    background: isSelected ? "rgba(56, 189, 248, 0.06)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${isSelected ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                    borderRadius: "10px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    {/* Multi-Select Checkbox */}
                    <div
                      onClick={() => handleToggleSelectSession(sess.sessionId)}
                      style={{ cursor: "pointer", marginTop: "2px", color: isSelected ? "#38bdf8" : "var(--text-dim)" }}
                      title="Select device for bulk termination"
                    >
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>

                    <div style={{ marginTop: "1px" }}>
                      {getDeviceIcon(sess.deviceType)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.82rem", lineHeight: 1.3 }}>
                        {sess.deviceName || "Student Device"}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", flexWrap: "wrap", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          <Globe size={11} color="#38bdf8" />
                          <span>{sess.ipAddress || "Active IP"}</span>
                        </span>
                        {sess.location && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <MapPin size={11} color="#a78bfa" />
                            <span>{sess.location}</span>
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "0.68rem" }}>
                        <span style={{ color: "#34d399", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                          {lastActiveStr}
                        </span>
                        <span style={{ color: "var(--text-dim)" }}>• Login: {loginDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Single Terminate Button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "6px", borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <button
                      type="button"
                      disabled={isTerminating}
                      onClick={() => handleTerminateSingle(sess.sessionId, sess.deviceName)}
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.72rem",
                        borderRadius: "6px",
                        background: "rgba(244, 63, 94, 0.12)",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                        color: "#fda4af",
                        cursor: isTerminating ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontWeight: 600,
                        transition: "all 0.15s ease",
                      }}
                      title={`Terminate session on ${sess.deviceName}`}
                    >
                      <Trash2 size={12} className={isTerminating ? "spin" : ""} />
                      <span>{isTerminating ? "Terminating..." : "Logout Device"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: 🛡️ RECENT SECURITY ACTIVITY (LAST 15 EVENTS - AUTO-DELETE)     */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={16} color="#a78bfa" />
            <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
              Recent Security Activity (Last 15 Events)
            </h4>
          </div>
          <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
            Rolling Capped Audit (Older than 15 events auto-deleted)
          </span>
        </div>

        {sessionsLoading ? (
          <div style={{ textAlign: "center", padding: "16px", color: "var(--text-dim)", fontSize: "0.76rem" }}>
            Loading security activity...
          </div>
        ) : securityLogs.length === 0 ? (
          <div style={{ padding: "14px", textAlign: "center", fontSize: "0.76rem", color: "var(--text-dim)" }}>
            No security logs recorded yet for this student.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {securityLogs.slice(0, 15).map((log) => {
              const diff = Date.now() - Number(log.createdAt || Date.now());
              const mins = Math.floor(diff / 60000);
              const timeStr = mins < 2 ? "Just now" : (mins < 60 ? `${mins}m ago` : (mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`));

              let badgeColor = "#38bdf8";
              let badgeBg = "rgba(56, 189, 248, 0.12)";
              if (log.action.includes("TERMINATE") || log.action.includes("REVOKE") || log.action.includes("LOGGED_OUT")) {
                badgeColor = "#fca5a5";
                badgeBg = "rgba(239, 68, 68, 0.12)";
              } else if (log.action === "LOGIN") {
                badgeColor = "#34d399";
                badgeBg = "rgba(16, 185, 129, 0.12)";
              } else if (log.action.includes("PASSWORD")) {
                badgeColor = "#fcd34d";
                badgeBg = "rgba(245, 158, 11, 0.12)";
              }

              return (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.04)",
                    fontSize: "0.74rem",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 7px", borderRadius: "4px", background: badgeBg, color: badgeColor, fontWeight: 700, fontSize: "0.68rem", flexShrink: 0 }}>
                      {log.action}
                    </span>
                    <span style={{ color: "#e2e8f0", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {log.details || log.deviceName}
                    </span>
                    {log.ipAddress && log.ipAddress !== "Active IP" && log.ipAddress !== "127.0.0.1" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.68rem", color: "#38bdf8", background: "rgba(56, 189, 248, 0.1)", padding: "1px 6px", borderRadius: "4px", flexShrink: 0 }}>
                        <Globe size={10} />
                        <span>{log.ipAddress}</span>
                      </span>
                    )}
                  </div>
                  <span style={{ color: "var(--text-dim)", flexShrink: 0, fontSize: "0.7rem" }}>
                    {timeStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: 📊 STUDENT AUDIT TRAIL (DOWNLOADS, VIEWS & SEARCHES)          */}
      {/* ========================================================================= */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>
              Academic Audit Trail (Downloads &amp; Actions)
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-dim)" }}>
              Historical trail of study material reads, downloads, searches, and notes accessed.
            </p>
          </div>

          {activities.length > 0 && (
            <button
              onClick={handleClearAllActivities}
              className="btn-danger"
              style={{ padding: "6px 12px", fontSize: "0.76rem" }}
            >
              Clear Academic Audit
            </button>
          )}
        </div>

        {activitiesLoading ? (
          <div style={{ textAlign: "center", padding: "30px", color: "var(--text-dim)" }}>
            <div className="spinner" style={{ width: "20px", height: "20px", margin: "0 auto 6px" }} />
            Loading academic activity stream...
          </div>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)", fontSize: "0.76rem" }}>
            No academic downloads or searches recorded yet for this student.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "350px", overflowY: "auto", paddingRight: "4px" }}>
            {activities.map((act) => (
              <div
                key={act.id}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(6, 182, 212, 0.15)", color: "var(--accent-cyan)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Activity size={14} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.8rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {act.detail || act.type || "Student Action"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "2px" }}>
                      {act.timestamp ? new Date(act.timestamp).toLocaleString() : "Recorded Event"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteActivity(act.id)}
                  className="btn-icon"
                  style={{ width: "26px", height: "26px", background: "rgba(244, 63, 94, 0.1)", color: "#f43f5e", flexShrink: 0 }}
                  title="Delete Entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
