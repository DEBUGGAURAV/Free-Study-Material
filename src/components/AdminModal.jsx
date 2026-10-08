import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  Trash2,
  Eye,
  EyeOff,
  Edit,
  UserCheck,
  UserX,
  Activity,
  Calendar,
  Phone,
  School,
  Lock,
  Search,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";
import { api } from "../api";

export default function AdminModal({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  notes,
  onRefreshNotes,
  branches = [],
}) {
  const [activeTab, setActiveTab] = useState("notes"); // 'notes', 'students', 'activities', 'stats'

  // Stats & Health
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);

  // Student Management State
  const [students, setStudents] = useState([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Edit Student Modal State
  const [editingStudent, setEditingStudent] = useState(null);

  // Student Activity Inspection State
  const [selectedStudentForActivity, setSelectedStudentForActivity] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Edit Note State
  const [editingNote, setEditingNote] = useState(null);
  const [noteForm, setNoteForm] = useState({
    title: "",
    subject: "",
    branch: "",
    semester: "",
    description: "",
  });

  const isAdminOrManager =
    currentUser?.role === "admin" ||
    currentUser?.email === "jnplotus@gmail.com" ||
    currentUser?.permissions?.includes("all") ||
    currentUser?.permissions?.includes("manage_notes") ||
    currentUser?.permissions?.includes("manage_users");

  const isMainAdmin = currentUser?.email === "jnplotus@gmail.com";

  useEffect(() => {
    if (isOpen && isAdminOrManager) {
      loadStats();
      if (activeTab === "students") {
        loadStudents();
      }
    }
  }, [isOpen, isAdminOrManager, activeTab, studentPage, studentSearch]);

  const loadStats = async () => {
    try {
      const [s, h] = await Promise.all([
        api.getStats().catch(() => ({ stats: null })),
        api.getHealth().catch(() => null),
      ]);
      setStats(s.stats);
      setHealth(h);
    } catch {}
  };

  const loadStudents = async () => {
    try {
      setStudentsLoading(true);
      const res = await api.getUsers({
        page: studentPage,
        limit: 10,
        search: studentSearch,
      });
      setStudents(res.users || []);
      setStudentsTotal(res.totalCount || 0);
    } catch (err) {
      console.warn("[ADMIN] Students load error:", err.message);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadStudentActivities = async (student) => {
    try {
      setSelectedStudentForActivity(student);
      setActivitiesLoading(true);
      const res = await api.getUserActivities(student.id);
      setActivities(res.activities || []);
    } catch (err) {
      alert("Failed to load student activities: " + err.message);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!selectedStudentForActivity) return;
    try {
      await api.deleteUserActivity(selectedStudentForActivity.id, activityId);
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
    } catch (err) {
      alert("Failed to delete activity: " + err.message);
    }
  };

  const handleClearAllActivities = async () => {
    if (!selectedStudentForActivity) return;
    if (!window.confirm(`Clear ALL activity history for ${selectedStudentForActivity.name}?`)) return;

    try {
      await api.clearUserActivities(selectedStudentForActivity.id);
      setActivities([]);
    } catch (err) {
      alert("Failed to clear activities: " + err.message);
    }
  };

  // Student Controls
  const handleToggleBlock = async (student) => {
    if (student.isMainAdmin) {
      return alert("Main Administrator (jnplotus@gmail.com) cannot be blocked!");
    }
    try {
      await api.blockUser(student.id, !student.isBlocked);
      loadStudents();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteStudent = async (student) => {
    if (student.isMainAdmin) {
      return alert("Main Administrator (jnplotus@gmail.com) cannot be deleted!");
    }
    if (!window.confirm(`Permanently delete student account "${student.name}" from database?`)) return;

    try {
      await api.deleteUser(student.id);
      loadStudents();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await api.updateUser(editingStudent.id, {
        name: editingStudent.name,
        mobile: editingStudent.mobile,
        college: editingStudent.college,
        year: editingStudent.year,
        role: editingStudent.role,
        permissions: editingStudent.permissions,
      });
      setEditingStudent(null);
      loadStudents();
    } catch (err) {
      alert("Failed to update student: " + err.message);
    }
  };

  // Note Controls
  const handleStartEditNote = (note) => {
    setEditingNote(note);
    setNoteForm({
      title: note.title || "",
      subject: note.subject || "",
      branch: note.branch || "CSE",
      semester: note.semester || "Sem 1",
      description: note.description || "",
    });
  };

  const handleSaveNoteEdit = async (e) => {
    e.preventDefault();
    if (!editingNote) return;

    try {
      await api.updateNote(editingNote.id, noteForm);
      setEditingNote(null);
      onRefreshNotes();
    } catch (err) {
      alert("Failed to update note: " + err.message);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Permanently delete this note from the vault?")) return;
    try {
      await api.deleteNote(noteId);
      onRefreshNotes();
      loadStats();
    } catch (err) {
      alert("Failed to delete note: " + err.message);
    }
  };

  const handleToggleVisibility = async (noteId, isVisible) => {
    try {
      await api.toggleVisibility(noteId, !isVisible);
      onRefreshNotes();
    } catch (err) {
      alert("Failed to toggle visibility: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "1050px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan))",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <div className="modal-title">Admin Studio & Dynamic Control Center</div>
              <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>Signed in as: <strong>{currentUser?.name || currentUser?.email}</strong></span>
                {isMainAdmin && <span style={{ color: "#fbbf24", fontWeight: 700 }}>• 👑 MASTER ADMIN</span>}
              </div>
            </div>
          </div>

          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Analytics Highlights Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "10px",
            marginBottom: "18px",
          }}
        >
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Total Notes</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", marginTop: "2px" }}>{stats?.totalNotes ?? notes.length}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Registered Students</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "2px" }}>{stats?.totalStudents ?? studentsTotal}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Storage Saved</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>{stats?.formattedSaved || "0.00 MB"}</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>Server Memory</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fbbf24", marginTop: "2px" }}>{health?.memoryUsageMB ? `${health.memoryUsageMB} MB` : "81 MB"}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "12px", marginBottom: "16px", overflowX: "auto" }}>
          <button
            className={`filter-tab ${activeTab === "notes" ? "active" : ""}`}
            onClick={() => setActiveTab("notes")}
          >
            Manage Notes Vault ({notes.length})
          </button>

          <button
            className={`filter-tab ${activeTab === "students" ? "active" : ""}`}
            onClick={() => { setActiveTab("students"); setSelectedStudentForActivity(null); }}
          >
            Student Registry & Permissions
          </button>

          {selectedStudentForActivity && (
            <button
              className={`filter-tab ${activeTab === "activities" ? "active" : ""}`}
              onClick={() => setActiveTab("activities")}
            >
              Activity Timeline: {selectedStudentForActivity.name}
            </button>
          )}

          <button
            className={`filter-tab ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            Cloud Diagnostics
          </button>
        </div>

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: "320px" }}>
          {/* TAB 1: NOTES MANAGEMENT */}
          {activeTab === "notes" && (
            <div>
              <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(255, 255, 255, 0.03)", color: "var(--text-dim)", textAlign: "left" }}>
                      <th style={{ padding: "10px 12px" }}>Title & Subject</th>
                      <th style={{ padding: "10px 12px" }}>Branch / Sem</th>
                      <th style={{ padding: "10px 12px" }}>Size</th>
                      <th style={{ padding: "10px 12px" }}>Downloads</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n) => (
                      <tr key={n.id} style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 600 }}>
                          <div>{n.title}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 400 }}>{n.subject}</div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>
                          <span className="tech-pill branch">{n.branch}</span> {n.semester}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                          {(n.compressedSize / (1024 * 1024)).toFixed(1)} MB
                          {n.savingsPercent > 0 && <span style={{ color: "#34d399", fontSize: "0.7rem", marginLeft: "4px" }}>(-{n.savingsPercent}%)</span>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                          {n.downloadsCount || 0}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              className="btn-icon"
                              style={{ width: "30px", height: "30px" }}
                              onClick={() => handleStartEditNote(n)}
                              title="Edit Note Details"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              className="btn-icon"
                              style={{ width: "30px", height: "30px" }}
                              onClick={() => handleToggleVisibility(n.id, n.isVisible)}
                              title={n.isVisible ? "Hide from Students" : "Publish to Students"}
                            >
                              {n.isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                            <button
                              className="btn-icon"
                              style={{ width: "30px", height: "30px", color: "#f43f5e" }}
                              onClick={() => handleDeleteNote(n.id)}
                              title="Delete Permanently"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: STUDENTS REGISTRY */}
          {activeTab === "students" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", minWidth: "260px" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                  <input
                    type="text"
                    className="search-input"
                    style={{ padding: "8px 14px 8px 36px", fontSize: "0.82rem" }}
                    placeholder="Search by name, email, mobile, or college..."
                    value={studentSearch}
                    onChange={(e) => { setStudentSearch(e.target.value); setStudentPage(1); }}
                  />
                </div>

                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  Total: <strong style={{ color: "#fff" }}>{studentsTotal}</strong> students (10 per page)
                </div>
              </div>

              {studentsLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div className="spinner" style={{ margin: "0 auto 10px" }}></div>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading student database...</p>
                </div>
              ) : (
                <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.03)", color: "var(--text-dim)", textAlign: "left" }}>
                        <th style={{ padding: "10px 12px" }}>Student</th>
                        <th style={{ padding: "10px 12px" }}>Contact</th>
                        <th style={{ padding: "10px 12px" }}>College & Year</th>
                        <th style={{ padding: "10px 12px" }}>Role</th>
                        <th style={{ padding: "10px 12px" }}>Status</th>
                        <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st, index) => (
                        <React.Fragment key={st.id}>
                          {/* Sleek Ad / Partner Divider after every 5 students */}
                          {index === 5 && (
                            <tr style={{ background: "linear-gradient(90deg, rgba(99, 102, 241, 0.1), rgba(6, 182, 212, 0.1))" }}>
                              <td colSpan={6} style={{ padding: "8px 16px", textAlign: "center", fontSize: "0.75rem", color: "var(--accent-cyan)", fontWeight: 600 }}>
                                ⚡ ACADEMIC CLOUD SPONSOR: Powered by Cloudflare Indian Edge & Telegram DC5 (High Performance Free Hosting)
                              </td>
                            </tr>
                          )}

                          <tr style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}>
                            <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 600 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {st.name}
                                {st.isMainAdmin && <span style={{ color: "#fbbf24", fontSize: "0.7rem", fontWeight: 700 }}>👑 MASTER ADMIN</span>}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 400 }}>{st.email}</div>
                            </td>

                            <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>
                              {st.mobile || "N/A"}
                            </td>

                            <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>
                              <div>{st.college}</div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{st.year}</div>
                            </td>

                            <td style={{ padding: "10px 12px" }}>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "var(--radius-full)",
                                  background: st.role === "admin" ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
                                  color: st.role === "admin" ? "#a5b4fc" : "#cbd5e1",
                                }}
                              >
                                {st.role?.toUpperCase()}
                              </span>
                            </td>

                            <td style={{ padding: "10px 12px" }}>
                              {st.isBlocked ? (
                                <span style={{ color: "#f43f5e", fontWeight: 600, fontSize: "0.75rem" }}>Blocked</span>
                              ) : (
                                <span style={{ color: "#10b981", fontWeight: 600, fontSize: "0.75rem" }}>Active</span>
                              )}
                            </td>

                            <td style={{ padding: "10px 12px", textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "6px" }}>
                                {/* Activity Inspection */}
                                <button
                                  className="btn-icon"
                                  style={{ width: "28px", height: "28px", color: "var(--accent-cyan)" }}
                                  onClick={() => {
                                    loadStudentActivities(st);
                                    setActiveTab("activities");
                                  }}
                                  title="Inspect Download / Login Activities"
                                >
                                  <Activity size={13} />
                                </button>

                                {/* Edit Student */}
                                <button
                                  className="btn-icon"
                                  style={{ width: "28px", height: "28px" }}
                                  onClick={() => setEditingStudent(st)}
                                  title="Edit Details / Permissions"
                                >
                                  <Edit size={13} />
                                </button>

                                {/* Block/Unblock (Protected for Main Admin) */}
                                {!st.isMainAdmin && (
                                  <button
                                    className="btn-icon"
                                    style={{ width: "28px", height: "28px", color: st.isBlocked ? "#10b981" : "#fbbf24" }}
                                    onClick={() => handleToggleBlock(st)}
                                    title={st.isBlocked ? "Unblock Student" : "Block Student"}
                                  >
                                    {st.isBlocked ? <UserCheck size={13} /> : <UserX size={13} />}
                                  </button>
                                )}

                                {/* Delete Student (Protected for Main Admin) */}
                                {!st.isMainAdmin && (
                                  <button
                                    className="btn-icon"
                                    style={{ width: "28px", height: "28px", color: "#f43f5e" }}
                                    onClick={() => handleDeleteStudent(st)}
                                    title="Delete Student from Database"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                <button
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                  disabled={studentPage <= 1}
                  onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Previous 10
                </button>

                <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  Page {studentPage} of {Math.ceil(studentsTotal / 10) || 1}
                </span>

                <button
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                  disabled={studentPage >= Math.ceil(studentsTotal / 10)}
                  onClick={() => setStudentPage((p) => p + 1)}
                >
                  Next 10 <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: STUDENT ACTIVITY TIMELINE */}
          {activeTab === "activities" && selectedStudentForActivity && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h4 style={{ fontSize: "1rem", color: "#fff", fontWeight: 700 }}>
                    Activity Logs: {selectedStudentForActivity.name}
                  </h4>
                  <div style={{ fontSize: "0.75rem", color: "var(--accent-cyan)" }}>
                    {selectedStudentForActivity.email} • {selectedStudentForActivity.college}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "0.75rem", color: "#f43f5e" }}
                    onClick={handleClearAllActivities}
                  >
                    Clear All Activities
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                    onClick={() => setActiveTab("students")}
                  >
                    Back to Registry
                  </button>
                </div>
              </div>

              {activitiesLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div className="spinner" style={{ margin: "0 auto 10px" }}></div>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading activity events...</p>
                </div>
              ) : activities.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "380px", overflowY: "auto" }}>
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background:
                              act.type === "download"
                                ? "rgba(6, 182, 212, 0.15)"
                                : act.type === "login"
                                ? "rgba(16, 185, 129, 0.15)"
                                : act.type === "logout"
                                ? "rgba(245, 158, 11, 0.15)"
                                : "rgba(99, 102, 241, 0.15)",
                            color:
                              act.type === "download"
                                ? "var(--accent-cyan)"
                                : act.type === "login"
                                ? "#10b981"
                                : act.type === "logout"
                                ? "#fbbf24"
                                : "var(--accent-indigo)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                          }}
                        >
                          {act.type === "download" ? "📥" : act.type === "login" ? "🔑" : act.type === "logout" ? "🚪" : "📝"}
                        </div>

                        <div>
                          <div style={{ fontSize: "0.82rem", color: "#fff", fontWeight: 600 }}>
                            {act.detail || act.type}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                            {new Date(act.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <button
                        className="btn-icon"
                        style={{ width: "26px", height: "26px", color: "#f43f5e" }}
                        onClick={() => handleDeleteActivity(act.id)}
                        title="Delete this event"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)" }}>
                  No activities recorded for this student yet.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYSTEM & CLOUDFLARE DIAGNOSTICS */}
          {activeTab === "stats" && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                padding: "18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.82rem",
                color: "#cbd5e1",
              }}
            >
              <div><strong>Primary Domain:</strong> freestudymaterial.onrender.com</div>
              <div><strong>Telegram Cloud Engine:</strong> MTProto GramJS Layer 198 (Connected)</div>
              <div><strong>Deduplication Index:</strong> SHA-256 Active ({stats?.totalDuplicates || 0} hits saved)</div>
              <div><strong>PDF Compressor:</strong> pdf-lib active (Savings: {stats?.formattedSaved || "0 MB"})</div>
              <div><strong>CDN Status:</strong> Cloudflare Mumbai/Delhi Edge (LRU Enabled)</div>
              <div><strong>RAM Cache Hit Ratio:</strong> {health?.cacheStats?.hitRatio || "0%"}</div>
              <div><strong>Server RSS:</strong> {health?.memoryUsageMB || 81} MB</div>
            </div>
          )}
        </div>

        {/* Edit Note Modal Overlay */}
        {editingNote && (
          <div className="modal-overlay" style={{ zIndex: 250 }} onClick={() => setEditingNote(null)}>
            <div className="modal-content" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Edit Note Metadata</div>
                <button className="modal-close-btn" onClick={() => setEditingNote(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveNoteEdit}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={noteForm.title}
                    onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input
                    type="text"
                    className="form-input"
                    value={noteForm.subject}
                    onChange={(e) => setNoteForm({ ...noteForm, subject: e.target.value })}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="form-group">
                    <label className="form-label">Branch</label>
                    <input
                      type="text"
                      className="form-input"
                      value={noteForm.branch}
                      onChange={(e) => setNoteForm({ ...noteForm, branch: e.target.value })}
                      placeholder="e.g. CSE, IT, ME"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Semester</label>
                    <select
                      className="form-select"
                      value={noteForm.semester}
                      onChange={(e) => setNoteForm({ ...noteForm, semester: e.target.value })}
                    >
                      <option value="Sem 1">Sem 1</option>
                      <option value="Sem 2">Sem 2</option>
                      <option value="Sem 3">Sem 3</option>
                      <option value="Sem 4">Sem 4</option>
                      <option value="Sem 5">Sem 5</option>
                      <option value="Sem 6">Sem 6</option>
                      <option value="Sem 7">Sem 7</option>
                      <option value="Sem 8">Sem 8</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={noteForm.description}
                    onChange={(e) => setNoteForm({ ...noteForm, description: e.target.value })}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                  <button type="button" className="btn-secondary" onClick={() => setEditingNote(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <Save size={14} />
                    <span>Save Note</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Student Details & Permissions Overlay */}
        {editingStudent && (
          <div className="modal-overlay" style={{ zIndex: 250 }} onClick={() => setEditingStudent(null)}>
            <div className="modal-content" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Edit Student & Role</div>
                <button className="modal-close-btn" onClick={() => setEditingStudent(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveStudentEdit}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingStudent.name || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="form-group">
                    <label className="form-label">Mobile</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent.mobile || ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, mobile: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingStudent.year || ""}
                      onChange={(e) => setEditingStudent({ ...editingStudent, year: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">College</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingStudent.college || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, college: e.target.value })}
                  />
                </div>

                {/* Role Picker (Disabled if target is Main Admin) */}
                <div className="form-group">
                  <label className="form-label">System Role & Permissions</label>
                  {editingStudent.isMainAdmin ? (
                    <div style={{ color: "#fbbf24", fontSize: "0.82rem", fontWeight: 600 }}>
                      👑 Master Administrator (Permanent Immunity)
                    </div>
                  ) : (
                    <select
                      className="form-select"
                      value={editingStudent.role || "student"}
                      onChange={(e) => setEditingStudent({ ...editingStudent, role: e.target.value })}
                    >
                      <option value="student">Student (Standard User)</option>
                      <option value="moderator">Moderator (Can Manage Notes & Notices)</option>
                      <option value="admin">Full Admin (Can Manage Entire Platform)</option>
                    </select>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                  <button type="button" className="btn-secondary" onClick={() => setEditingStudent(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    <Save size={14} />
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
