import React, { useState, useEffect } from "react";
import { X, Bell, Pin, ExternalLink, Plus, Trash2, Edit3, CheckCircle, AlertCircle } from "lucide-react";
import { api } from "../api";

export default function NoticeBoardModal({ isOpen, onClose, currentUser, onOpenNote, onOpenAuth }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [linkText, setLinkText] = useState("Click Here");
  const [isPinned, setIsPinned] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const canManageNotices =
    currentUser?.role === "admin" ||
    currentUser?.email === "jnplotus@gmail.com" ||
    currentUser?.permissions?.includes("manage_notices") ||
    currentUser?.permissions?.includes("all");

  useEffect(() => {
    if (isOpen) {
      loadNotices();
    }
  }, [isOpen]);

  const loadNotices = async () => {
    try {
      setLoading(true);
      const res = await api.getNotices();
      setNotices(res.notices || []);
    } catch (err) {
      console.warn("[NOTICES] Failed to load:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNoticeLinkClick = (e, n) => {
    e.preventDefault();
    if (!n.link) return;

    // Check if link points to an internal note (e.g. /api/notes/:id or /api/notes/:id/stream)
    const noteMatch = n.link.match(/\/api\/notes\/([a-zA-Z0-9_-]+)/);
    if (noteMatch) {
      const noteId = noteMatch[1];
      if (currentUser) {
        if (onOpenNote) {
          onOpenNote(noteId);
        }
        onClose();
      } else {
        onClose();
        if (onOpenAuth) {
          onOpenAuth("signup");
        }
      }
      return;
    }

    // If user is not logged in and link is an internal app path, prompt signup
    if (!currentUser && (n.link.startsWith("/") || n.link.includes(window.location.host))) {
      onClose();
      if (onOpenAuth) {
        onOpenAuth("signup");
      }
      return;
    }

    // External link: append token if pointing to notes API, else open cleanly
    const token = localStorage.getItem("vault_token");
    let targetUrl = n.link;
    if (token && targetUrl.includes("/api/notes/")) {
      targetUrl += (targetUrl.includes("?") ? "&" : "?") + `token=${token}`;
    }
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setMsg(null);

    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        link: link.trim(),
        linkText: linkText.trim() || "Click Here",
        isPinned,
      };

      if (editingId) {
        await api.updateNotice(editingId, payload);
        setMsg({ type: "success", text: "Notice updated successfully!" });
      } else {
        await api.createNotice(payload);
        setMsg({ type: "success", text: "Notice posted successfully!" });
      }

      // Reset form
      setTitle("");
      setContent("");
      setLink("");
      setLinkText("Click Here");
      setIsPinned(false);
      setEditingId(null);
      setShowCreateForm(false);
      loadNotices();
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to save notice." });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (n) => {
    setEditingId(n.id);
    setTitle(n.title);
    setContent(n.content || "");
    setLink(n.link || "");
    setLinkText(n.linkText || "Click Here");
    setIsPinned(Boolean(n.isPinned));
    setShowCreateForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this notice?")) return;
    try {
      await api.deleteNotice(id);
      loadNotices();
    } catch (err) {
      alert("Failed to delete notice: " + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "720px", maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(6, 182, 212, 0.15)",
                color: "var(--accent-cyan)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <div className="modal-title">Official Notice Board</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                Latest announcements, study syllabus updates & links
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {canManageNotices && !showCreateForm && (
              <button
                className="btn-primary"
                style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                onClick={() => {
                  setEditingId(null);
                  setTitle("");
                  setContent("");
                  setLink("");
                  setShowCreateForm(true);
                }}
              >
                <Plus size={14} />
                <span>Post Notice</span>
              </button>
            )}

            <button className="modal-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Admin Post/Edit Notice Form */}
        {showCreateForm && canManageNotices && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-highlight)",
              borderRadius: "var(--radius-md)",
              padding: "18px",
              marginBottom: "20px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "12px", color: "var(--accent-cyan)" }}>
              {editingId ? "Edit Notice" : "Create New Notice Announcement"}
            </div>

            {msg && (
              <div
                style={{
                  background: msg.type === "error" ? "rgba(244, 63, 94, 0.1)" : "rgba(16, 185, 129, 0.1)",
                  color: msg.type === "error" ? "#f43f5e" : "#10b981",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem",
                  marginBottom: "12px",
                }}
              >
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Notice Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. End Semester Exam Syllabus & Hand-written Notes Available"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notice Content / Description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Detailed announcement, instructions, or subject information..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
                <div className="form-group">
                  <label className="form-label">Optional Link (URL)</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://... or /api/notes/..."
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Button Text</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Click Here"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "10px 0 16px" }}>
                <input
                  type="checkbox"
                  id="pinCheck"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                <label htmlFor="pinCheck" style={{ fontSize: "0.85rem", color: "var(--text-muted)", cursor: "pointer" }}>
                  Pin this notice to top of board
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "6px 16px", fontSize: "0.82rem" }}
                  disabled={formLoading}
                >
                  {formLoading ? "Publishing..." : editingId ? "Update Notice" : "Publish Notice"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Notices List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading notice board...</p>
          </div>
        ) : notices.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {notices.map((n) => (
              <div
                key={n.id}
                style={{
                  background: n.isPinned ? "rgba(99, 102, 241, 0.08)" : "rgba(255, 255, 255, 0.03)",
                  border: n.isPinned ? "1px solid rgba(99, 102, 241, 0.35)" : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px 18px",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {n.isPinned && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full)",
                            background: "rgba(99, 102, 241, 0.2)",
                            color: "#a5b4fc",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Pin size={10} /> PINNED
                        </span>
                      )}
                      <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
                        {n.title}
                      </h4>
                    </div>

                    <div style={{ fontSize: "0.74rem", color: "var(--text-dim)", marginTop: "4px" }}>
                      Posted on {new Date(n.createdAt).toLocaleDateString()} at{" "}
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {canManageNotices && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="btn-icon"
                        style={{ width: "30px", height: "30px" }}
                        onClick={() => handleEdit(n)}
                        title="Edit Notice"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        className="btn-icon"
                        style={{ width: "30px", height: "30px", color: "#f43f5e" }}
                        onClick={() => handleDelete(n.id)}
                        title="Delete Notice"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {n.content && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      lineHeight: "1.5",
                      marginTop: "10px",
                    }}
                  >
                    {n.content}
                  </p>
                )}

                {/* Optional Link Button: "Click Here" */}
                {n.link && (
                  <div style={{ marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={(e) => handleNoticeLinkClick(e, n)}
                      className="btn-secondary"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.78rem",
                        padding: "6px 14px",
                        background: "rgba(6, 182, 212, 0.12)",
                        borderColor: "rgba(6, 182, 212, 0.3)",
                        color: "var(--accent-cyan)",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <span>{n.linkText || "Click Here"}</span>
                      <ExternalLink size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)" }}>
            No notices posted yet.
          </div>
        )}
      </div>
    </div>
  );
}

