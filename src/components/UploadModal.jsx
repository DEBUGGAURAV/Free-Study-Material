import React, { useState, useRef } from "react";
import { X, UploadCloud, CheckCircle2, FileText, AlertCircle, Sparkles } from "lucide-react";
import { api } from "../api";

export default function UploadModal({ isOpen, onClose, onUploadQueued }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [branch, setBranch] = useState("CSE");
  const [semester, setSemester] = useState("Sem 1");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = (selected) => {
    if (selected) {
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a document or note file.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("subject", subject);
      formData.append("branch", branch);
      formData.append("semester", semester);
      formData.append("description", description);

      const startTime = performance.now();
      const res = await api.uploadNote(formData);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      setSuccessData({
        elapsed,
        noteId: res.noteId,
        title: title || file.name,
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
    setDescription("");
    setError(null);
    setSuccessData(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={resetForm}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Upload Study Material</div>
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
              ⚡ Uploaded in {successData.elapsed}s!
            </h3>

            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "420px", margin: "0 auto 24px" }}>
              Your file is accepted and safely queued. The <strong>Async Background Engine</strong>{" "}
              is now optimizing PDF streams, checking SHA-256 deduplication, and archiving to
              Telegram Cloud.
            </p>

            <button className="btn-primary" onClick={resetForm}>
              Done & Return to Notes
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
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
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
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for Instant Ingestion
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.95rem" }}>
                    Choose a document or drag & drop here
                  </div>
                  <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginTop: "4px" }}>
                    PDF, DOCX, ZIP, or Images up to 2GB
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "18px" }}>
              <div className="form-group">
                <label className="form-label">Note Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Data Structures & Algorithms Hand-written Notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Computer Networks"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Branch</label>
                  <select
                    className="form-select"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  >
                    <option value="CSE">CSE</option>
                    <option value="IT">IT</option>
                    <option value="ECE">ECE</option>
                    <option value="ME">Mechanical</option>
                    <option value="Civil">Civil</option>
                    <option value="BCA">BCA</option>
                    <option value="MCA">MCA</option>
                    <option value="AI/ML">AI / ML</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Semester</label>
                <select
                  className="form-select"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                >
                  <option value="Sem 1">Semester 1</option>
                  <option value="Sem 2">Semester 2</option>
                  <option value="Sem 3">Semester 3</option>
                  <option value="Sem 4">Semester 4</option>
                  <option value="Sem 5">Semester 5</option>
                  <option value="Sem 6">Semester 6</option>
                  <option value="Sem 7">Semester 7</option>
                  <option value="Sem 8">Semester 8</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Key topics covered, professor name, or syllabus unit..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Uploading in 2s...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Upload & Fast Queue</span>
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
