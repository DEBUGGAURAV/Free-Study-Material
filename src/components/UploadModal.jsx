import React, { useState, useEffect, useRef } from "react";
import {
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Activity,
  Search,
  ChevronDown,
  Plus,
  BookOpen,
} from "lucide-react";
import { api } from "../api";
import { formatFileSize, formatMB } from "../utils/formatUtils";

export default function UploadModal({ isOpen, onClose, onUploadQueued, existingBranches = [] }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  const [customBranchName, setCustomBranchName] = useState("");
  const [course, setCourse] = useState("B.Tech");
  const [year, setYear] = useState("All Years / General");
  const [description, setDescription] = useState("");

  // Searchable Subject Combobox with Live Telegram Topic Sync
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const subjectDropdownRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Live Upload Metrics
  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    speed: "0 KB/s",
    loadedMB: "0",
    totalMB: "0",
    timeRemaining: "Calculating...",
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    api.getSubjects()
      .then((res) => {
        if (isMounted && res && Array.isArray(res.subjects)) {
          setSubjectOptions(res.subjects);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch subjects:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isSubjectDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(e.target)) {
        setIsSubjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isSubjectDropdownOpen]);

  if (!isOpen) return null;

  const defaultBranchOptions = [
    "CSE",
    "IT",
    "ECE",
    "ME",
    "Civil",
    "BCA",
    "MCA",
    "AI/ML",
    ...existingBranches.filter((b) => !["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"].includes(b)),
  ];

  const trimmedSubject = subject.trim();
  const filteredSubjects = subjectOptions.filter((s) =>
    s.toLowerCase().includes(trimmedSubject.toLowerCase())
  );
  const isExactMatch = subjectOptions.some(
    (s) => s.toLowerCase() === trimmedSubject.toLowerCase()
  );
  const showCreateOption = trimmedSubject.length > 0 && !isExactMatch;

  const handleFileSelect = (selected) => {
    if (selected) {
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleBranchChange = (e) => {
    const val = e.target.value;
    if (val === "CUSTOM_NEW") {
      setIsCustomBranch(true);
      setCustomBranchName("");
    } else {
      setIsCustomBranch(false);
      setBranch(val);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a document or note file.");
      return;
    }

    if (isCustomBranch && !customBranchName.trim()) {
      setError("Please specify the custom branch name.");
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress({
      percent: 5,
      speed: "Starting...",
      loadedMB: "0",
      totalMB: formatMB(file.size),
      timeRemaining: "Estimating...",
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("subject", subject);
      formData.append("branch", isCustomBranch ? customBranchName.trim().toUpperCase() : branch);
      formData.append("customBranch", isCustomBranch ? customBranchName.trim().toUpperCase() : "");
      formData.append("course", course);
      formData.append("year", year);
      formData.append("semester", year); // Backward-compatible
      formData.append("description", description);

      const startTime = performance.now();
      const res = await api.uploadNoteWithProgress(formData, (metrics) => {
        setUploadProgress(metrics);
      });
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      setSuccessData({
        elapsed,
        noteId: res.noteId,
        title: title || file.name,
        branch: isCustomBranch ? customBranchName.trim().toUpperCase() : branch,
      });

      if (onUploadQueued) {
        onUploadQueued(res.noteId, title || file.name);
      }
    } catch (err) {
      setError(err.message || "Failed to upload note.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setSubject("");
    setIsCustomBranch(false);
    setCustomBranchName("");
    setDescription("");
    setError(null);
    setSuccessData(null);
    setUploadProgress({ percent: 0, speed: "0 KB/s", loadedMB: "0", totalMB: "0", timeRemaining: "" });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={resetForm}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Upload Study Material</div>
            <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)" }}>
              Free Study Material Vault • Instant 2s Async Pipeline
            </div>
          </div>
          <button className="modal-close-btn" onClick={resetForm}>
            <X size={20} />
          </button>
        </div>

        {successData ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "8px" }}>
              ⚡ Ingested in {successData.elapsed}s!
            </h3>

            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", margin: "0 auto 16px" }}>
              File received at maximum bandwidth. Background Cloud Worker is now syncing to Encrypted Distributed Storage, checking SHA-256 deduplication, and updating Notice Board!
            </p>

            <button className="btn-primary" onClick={resetForm} style={{ marginTop: "16px" }}>
              Done & Return to Free Study Material
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "#f43f5e",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "16px",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Dropzone */}
            <div
              className={`dropzone-box ${isDragging ? "dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "var(--accent-indigo)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <UploadCloud size={24} />
              </div>

              {file ? (
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>
                    {file.name}
                  </div>
                  <div style={{ color: "var(--accent-cyan)", fontSize: "0.8rem", marginTop: "4px" }}>
                    {formatFileSize(file.size)} • Ready for High-Speed Transfer
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.95rem" }}>
                    Choose a document or drag & drop here
                  </div>
                  <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginTop: "4px" }}>
                    PDF, DOCX, ZIP, or Images up to 200MB
                  </div>
                </div>
              )}
            </div>

            {/* LIVE TRANSFER SPEED & PERCENTAGE MONITOR */}
            {loading && (
              <div
                style={{
                  marginTop: "16px",
                  background: "rgba(6, 182, 212, 0.08)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 18px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "#fff", fontWeight: 700 }}>
                    <Activity size={15} style={{ color: "var(--accent-cyan)" }} />
                    <span>Uploading: {uploadProgress.percent}%</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--accent-cyan)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    🚀 {uploadProgress.speed}
                  </div>
                </div>

                {/* Progress Bar Container */}
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      width: `${uploadProgress.percent}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--accent-indigo), var(--accent-cyan))",
                      boxShadow: "0 0 10px var(--accent-cyan)",
                      transition: "width 0.15s ease",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
                  <span>{uploadProgress.loadedMB} MB of {uploadProgress.totalMB} MB</span>
                  <span>{uploadProgress.timeRemaining}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: "18px" }}>
              <div className="form-group">
                <label className="form-label">Note Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Operating Systems Complete Handwritten Notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="form-group" ref={subjectDropdownRef} style={{ position: "relative" }}>
                  <label className="form-label">Subject</label>

                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingRight: "36px" }}
                      placeholder="Search or enter subject..."
                      value={subject}
                      onFocus={() => setIsSubjectDropdownOpen(true)}
                      onChange={(e) => {
                        setSubject(e.target.value);
                        setIsSubjectDropdownOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsSubjectDropdownOpen((prev) => !prev)}
                      tabIndex={-1}
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "4px",
                      }}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {isSubjectDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 60,
                        maxHeight: "220px",
                        overflowY: "auto",
                        background: "var(--bg-surface-elevated, #12192e)",
                        border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))",
                        borderRadius: "10px",
                        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.6)",
                        padding: "6px",
                      }}
                    >
                      {/* Create New Option if typed and not an exact match */}
                      {showCreateOption && (
                        <div
                          onClick={() => {
                            setIsSubjectDropdownOpen(false);
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "6px",
                            background: "rgba(6, 182, 212, 0.12)",
                            border: "1px dashed var(--accent-cyan, #06b6d4)",
                            color: "var(--accent-cyan, #06b6d4)",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            marginBottom: "6px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <Plus size={15} />
                          <span>Create & Auto-Topic: "{trimmedSubject}"</span>
                        </div>
                      )}

                      {/* Filtered subjects list */}
                      {filteredSubjects.length > 0 ? (
                        filteredSubjects.map((s) => {
                          const isSelected = s.toLowerCase() === trimmedSubject.toLowerCase();
                          return (
                            <div
                              key={s}
                              onClick={() => {
                                setSubject(s);
                                setIsSubjectDropdownOpen(false);
                              }}
                              style={{
                                padding: "8px 10px",
                                borderRadius: "6px",
                                fontSize: "0.83rem",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                color: isSelected ? "var(--accent-cyan)" : "var(--text-main)",
                                background: isSelected ? "rgba(6, 182, 212, 0.15)" : "transparent",
                                transition: "background 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <BookOpen size={14} style={{ opacity: 0.7, color: "var(--accent-indigo)" }} />
                                <span>{s}</span>
                              </div>
                              {isSelected && (
                                <span style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 600 }}>Selected</span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        !showCreateOption && (
                          <div style={{ padding: "10px 12px", fontSize: "0.82rem", color: "var(--text-muted)", textAlign: "center" }}>
                            No subjects found
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Branch / Department</label>
                  <select
                    className="form-select"
                    value={isCustomBranch ? "CUSTOM_NEW" : branch}
                    onChange={handleBranchChange}
                  >
                    {defaultBranchOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                    <option value="CUSTOM_NEW">+ Create New Branch...</option>
                  </select>
                </div>
              </div>

              {isCustomBranch && (
                <div className="form-group" style={{ animation: "fadeIn 0.2s ease" }}>
                  <label className="form-label" style={{ color: "var(--accent-cyan)" }}>
                    Enter New Custom Branch Name *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. AERONAUTICAL, BIOTECH, ROBOTICS"
                    value={customBranchName}
                    onChange={(e) => setCustomBranchName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Degree / Course Program</label>
                  <select
                    className="form-select"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                  >
                    <option value="B.Tech">B.Tech / B.E.</option>
                    <option value="BCA">BCA (Bachelor of Comp. Apps)</option>
                    <option value="MCA">MCA (Master of Comp. Apps)</option>
                    <option value="Diploma">Diploma / Polytechnic</option>
                    <option value="M.Tech">M.Tech / M.E.</option>
                    <option value="B.Sc">B.Sc / IT</option>
                    <option value="General">General / All Courses</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Year / Target Level</label>
                  <select
                    className="form-select"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    <option value="All Years / General">All Years / Common</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year (Final Year)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Key topics, exam tips, or professor reference..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button type="button" className="btn-secondary" onClick={resetForm} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Streaming ({uploadProgress.percent}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Upload & Queue Instant</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
