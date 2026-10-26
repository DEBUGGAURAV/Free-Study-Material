import React, { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Search,
  Plus,
  Trash2,
  Edit3,
  Pin,
  Clock,
  Sparkles,
  RefreshCw,
  ExternalLink,
  CheckSquare,
  Square,
  AlertTriangle,
  Info,
  Calendar,
  CheckCircle,
  Database,
  Cpu,
  ShieldAlert,
  X,
} from "lucide-react";
import { api } from "../../../api";

export default function TabNotices({ currentUser }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // 'all', 'pinned', 'expiring', 'never'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState(null);
  const [tursoTelemetry, setTursoTelemetry] = useState(null);

  // Modal / Form state for Create & Edit
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formLinkText, setFormLinkText] = useState("Click Here");
  const [formPinned, setFormPinned] = useState(false);
  const [formRetentionDays, setFormRetentionDays] = useState("7");
  const [formType, setFormType] = useState("announcement"); // announcement, exam, syllabus, urgent

  // Fetch notices on mount
  useEffect(() => {
    loadNotices();
  }, []);

  const loadNotices = async () => {
    try {
      setLoading(true);
      const [res, teleRes] = await Promise.allSettled([
        api.getNotices(),
        api.getNoticesTelemetry(),
      ]);
      if (res.status === "fulfilled") {
        setNotices(res.value.notices || []);
      }
      if (teleRes.status === "fulfilled" && teleRes.value?.telemetry) {
        setTursoTelemetry(teleRes.value.telemetry);
      }
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[TabNotices] Failed to load notices:", err);
      showFeedback("Failed to load notices: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTursoCache = async () => {
    try {
      setActionLoading(true);
      const res = await api.syncNoticesCache();
      showFeedback(`⚡ Turso Edge Cache synced! (${res.count || 0} notices cached)`);
      loadNotices();
    } catch (err) {
      showFeedback("Failed to sync Turso Cache: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const showFeedback = (msg, type = "success") => {
    setStatusFeedback({ msg, type });
    setTimeout(() => {
      setStatusFeedback(null);
    }, 4500);
  };

  // Toggle selection of a single notice
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filtered notices
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      // Filter by type
      if (filterType === "pinned" && !n.isPinned) return false;
      if (filterType === "never" && n.retentionDays !== -1) return false;
      if (filterType === "expiring") {
        if (!n.expiresAt) return false;
        const diffHours = (new Date(n.expiresAt).getTime() - Date.now()) / (1000 * 3600);
        if (diffHours < 0 || diffHours > 48) return false;
      }

      // Filter by search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = n.title && n.title.toLowerCase().includes(q);
      const matchContent = n.content && n.content.toLowerCase().includes(q);
      const matchLink = n.linkText && n.linkText.toLowerCase().includes(q);
      const matchCreator = n.createdBy && n.createdBy.toLowerCase().includes(q);

      return matchTitle || matchContent || matchLink || matchCreator;
    });
  }, [notices, searchQuery, filterType]);

  // Select all / Deselect all
  const allFilteredSelected =
    filteredNotices.length > 0 && filteredNotices.every((n) => selectedIds.has(n.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filteredNotices.forEach((n) => next.add(n.id));
      setSelectedIds(next);
    }
  };

  // Quick 1-click Pin / Unpin
  const handleTogglePin = async (notice) => {
    try {
      setActionLoading(true);
      const nextPinned = !notice.isPinned;
      await api.togglePinNotice(notice.id, nextPinned);
      showFeedback(nextPinned ? `📌 "${notice.title}" pinned to top!` : `📍 "${notice.title}" unpinned.`);
      loadNotices();
    } catch (err) {
      showFeedback("Failed to update pin state: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Quick 1-click Expiry Update
  const handleChangeExpiry = async (noticeId, newDays) => {
    try {
      setActionLoading(true);
      await api.updateNoticeExpiry(noticeId, parseInt(newDays, 10));
      showFeedback(newDays === "-1" ? "Notice set to Never Expire." : `Notice retention set to ${newDays} days.`);
      loadNotices();
    } catch (err) {
      showFeedback("Failed to update expiry: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Single Notice
  const handleDeleteSingle = async (notice) => {
    if (!window.confirm(`Delete notice "${notice.title}"?\n\n(It will be safely archived to Tab 8: Restore Vault).`)) {
      return;
    }
    try {
      setActionLoading(true);
      await api.deleteNotice(notice.id);
      showFeedback("Notice safely archived to Restore Vault.");
      loadNotices();
    } catch (err) {
      showFeedback("Failed to delete notice: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Delete Selected Notices (tick lagake delete)
  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${count} selected notice(s)?\n\nThey will be safely archived to Tab 8: Restore Vault.`)) {
      return;
    }

    try {
      setActionLoading(true);
      const ids = Array.from(selectedIds);
      const res = await api.bulkDeleteNotices(ids);
      showFeedback(`✅ Successfully deleted ${res.deletedCount || count} notice(s)! (Archived in Restore Vault).`);
      setSelectedIds(new Set());
      loadNotices();
    } catch (err) {
      showFeedback("Bulk delete failed: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete ALL Notices (sabhi notice delete karna)
  const handleDeleteAll = async () => {
    if (notices.length === 0) {
      alert("There are no notices to delete.");
      return;
    }

    const confirmText = prompt(
      `⚠️ WARNING: This will delete ALL ${notices.length} notices on the platform!\n\nAll deleted notices will be safely archived to Tab 8: Restore Vault.\n\nType "DELETE ALL" to confirm:`
    );

    if (confirmText !== "DELETE ALL") {
      if (confirmText !== null) {
        alert("Action cancelled: Confirmation text did not match.");
      }
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.deleteAllNotices();
      showFeedback(`🚨 Cleared all ${res.deletedCount || notices.length} notices! (Archived in Restore Vault).`);
      setSelectedIds(new Set());
      loadNotices();
    } catch (err) {
      showFeedback("Failed to delete all notices: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Create Form
  const openCreateModal = () => {
    setEditingNotice(null);
    setFormTitle("");
    setFormContent("");
    setFormLink("");
    setFormLinkText("Click Here");
    setFormPinned(false);
    setFormRetentionDays("7");
    setFormType("announcement");
    setShowFormModal(true);
  };

  // Open Edit Form
  const openEditModal = (n) => {
    setEditingNotice(n);
    setFormTitle(n.title || "");
    setFormContent(n.content || "");
    setFormLink(n.link || "");
    setFormLinkText(n.linkText || "Click Here");
    setFormPinned(Boolean(n.isPinned));
    setFormRetentionDays(n.retentionDays !== undefined ? String(n.retentionDays) : "7");
    setFormType(n.type || "announcement");
    setShowFormModal(true);
  };

  // Submit Create or Edit Form
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert("Notice Title is required.");
      return;
    }

    try {
      setActionLoading(true);
      const payload = {
        title: formTitle.trim(),
        content: formContent.trim(),
        link: formLink.trim(),
        linkText: formLinkText.trim() || "Click Here",
        isPinned: Boolean(formPinned),
        retentionDays: parseInt(formRetentionDays, 10),
        type: formType,
      };

      if (editingNotice) {
        await api.updateNotice(editingNotice.id, payload);
        showFeedback("✅ Notice updated successfully!");
      } else {
        await api.createNotice(payload);
        showFeedback("🎉 Notice created & broadcasted successfully!");
      }

      setShowFormModal(false);
      loadNotices();
    } catch (err) {
      alert("Failed to save notice: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Analytics Metrics
  const totalCount = notices.length;
  const pinnedCount = notices.filter((n) => n.isPinned).length;
  const neverExpireCount = notices.filter((n) => n.retentionDays === -1).length;
  const expiringCount = notices.filter((n) => {
    if (!n.expiresAt) return false;
    const diff = (new Date(n.expiresAt).getTime() - Date.now()) / (1000 * 3600);
    return diff > 0 && diff <= 48;
  }).length;

  return (
    <div style={{ color: "#fff", padding: "4px" }}>
      {/* Feedback Banner */}
      {statusFeedback && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            marginBottom: "16px",
            background:
              statusFeedback.type === "error"
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(16, 185, 129, 0.15)",
            border:
              statusFeedback.type === "error"
                ? "1px solid rgba(239, 68, 68, 0.4)"
                : "1px solid rgba(16, 185, 129, 0.4)",
            color: statusFeedback.type === "error" ? "#fca5a5" : "#6ee7b7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {statusFeedback.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{statusFeedback.msg}</span>
          </div>
          <button
            onClick={() => setStatusFeedback(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Info & Quick Stats */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(99, 102, 241, 0.08) 100%)",
          border: "1px solid rgba(6, 182, 212, 0.25)",
          borderRadius: "14px",
          padding: "18px 22px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(6, 182, 212, 0.2)",
                color: "var(--accent-cyan)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bell size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Notice Board & Global Broadcast Studio</span>
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Set notice lifetimes, pin priorities, bulk delete with checkboxes, or purge all campus announcements
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSyncTursoCache}
              disabled={loading || actionLoading}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "0.82rem", background: "rgba(6, 182, 212, 0.12)", borderColor: "rgba(6, 182, 212, 0.35)", color: "var(--accent-cyan)" }}
              title="Synchronize Firestore notices with Turso Edge Cache"
            >
              <Cpu size={14} className={actionLoading ? "spin" : ""} />
              <span>Sync Turso Edge</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={loadNotices}
              disabled={loading || actionLoading}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "0.82rem" }}
              title="Refresh notices list"
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={openCreateModal}
              disabled={actionLoading}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 18px", fontSize: "0.84rem", fontWeight: 700 }}
            >
              <Plus size={16} />
              <span>Broadcast New Notice</span>
            </button>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>Total Notices</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--accent-cyan)", marginTop: "2px" }}>{totalCount}</div>
          </div>

          <div style={{ background: "rgba(99, 102, 241, 0.06)", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "0.72rem", color: "#a5b4fc", textTransform: "uppercase", fontWeight: 700 }}>Pinned to Top</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#818cf8", marginTop: "2px" }}>{pinnedCount}</div>
          </div>

          <div style={{ background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "0.72rem", color: "#6ee7b7", textTransform: "uppercase", fontWeight: 700 }}>Never Expire</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#34d399", marginTop: "2px" }}>{neverExpireCount}</div>
          </div>

          <div style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "0.72rem", color: "#fcd34d", textTransform: "uppercase", fontWeight: 700 }}>Expiring Soon (&lt;48h)</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#fbbf24", marginTop: "2px" }}>{expiringCount}</div>
          </div>
        </div>
      </div>

      {/* Storage Architecture Explanation Bar */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.7)",
          border: "1px solid rgba(6, 182, 212, 0.35)",
          borderRadius: "12px",
          padding: "12px 18px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--accent-cyan)", fontWeight: 700 }}>
          <Database size={16} />
          <span>Turso L2 Edge Cache Active:</span>
          <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", padding: "2px 8px", borderRadius: "12px", border: "1px solid rgba(16, 185, 129, 0.4)" }}>
            ⚡ fsm-cache • ZERO FIRESTORE READS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <span><strong>L1:</strong> RAM (0ms)</span>
          <span><strong>L2:</strong> Turso Edge LibSQL ({tursoTelemetry?.latencyMs || 3}ms latency)</span>
          <span><strong>L3:</strong> Cloud Firestore</span>
          <span><strong>Safe Trash:</strong> <code>deleted_records</code> (Tab 8 Restore Vault)</span>
          {tursoTelemetry && (
            <span style={{ color: "#34d399", fontWeight: 700 }}>
              🛡️ {tursoTelemetry.firestoreReadsSaved} Reads Saved
            </span>
          )}
        </div>
      </div>

      {/* Action Toolbar: Search + Filters + Multi-Select Actions */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "14px 16px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left: Search input & filter tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-dim)",
              }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Search by title, body, author, or link..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: "36px",
                paddingRight: searchQuery ? "32px" : "10px",
                height: "38px",
                borderRadius: "8px",
                fontSize: "0.82rem",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { id: "all", label: "All" },
              { id: "pinned", label: "Pinned" },
              { id: "never", label: "Permanent" },
              { id: "expiring", label: "Expiring Soon" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: filterType === tab.id ? "var(--accent-cyan)" : "rgba(255, 255, 255, 0.05)",
                  color: filterType === tab.id ? "#0f172a" : "var(--text-muted)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Bulk Selection & Delete All actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Select All Checkbox Button */}
          {filteredNotices.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={toggleSelectAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.78rem",
              }}
            >
              {allFilteredSelected ? (
                <CheckSquare size={14} style={{ color: "var(--accent-cyan)" }} />
              ) : (
                <Square size={14} />
              )}
              <span>{allFilteredSelected ? "Deselect All" : "Select All"}</span>
            </button>
          )}

          {/* Bulk Delete Selected Button (tick lagake delete) */}
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={actionLoading}
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.8rem",
                padding: "7px 14px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(239, 68, 68, 0.35)",
              }}
            >
              <Trash2 size={14} />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
          )}

          {/* Delete ALL Notices Button (sabhi notice delete karna) */}
          {notices.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={actionLoading}
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "8px",
                color: "#f87171",
                fontWeight: 600,
                fontSize: "0.78rem",
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
              }}
              title="Purge all notices from notice board"
            >
              <AlertTriangle size={13} />
              <span>Delete All Notices</span>
            </button>
          )}
        </div>
      </div>

      {/* Notices List / Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading notices database...</p>
        </div>
      ) : filteredNotices.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredNotices.map((n) => {
            const isSelected = selectedIds.has(n.id);
            const isExpiringSoon = n.expiresAt && (new Date(n.expiresAt).getTime() - Date.now() < 48 * 3600 * 1000);

            return (
              <div
                key={n.id}
                style={{
                  background: isSelected
                    ? "rgba(6, 182, 212, 0.08)"
                    : n.isPinned
                    ? "rgba(99, 102, 241, 0.06)"
                    : "rgba(255, 255, 255, 0.02)",
                  border: isSelected
                    ? "1.5px solid var(--accent-cyan)"
                    : n.isPinned
                    ? "1px solid rgba(99, 102, 241, 0.35)"
                    : "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  {/* Selection Checkbox (Tick mark) */}
                  <div
                    onClick={() => toggleSelect(n.id)}
                    style={{
                      cursor: "pointer",
                      paddingTop: "2px",
                      color: isSelected ? "var(--accent-cyan)" : "var(--text-dim)",
                    }}
                    title={isSelected ? "Deselect this notice" : "Select this notice for bulk action"}
                  >
                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>

                  {/* Notice Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      {/* Pinned Badge */}
                      {n.isPinned && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: "rgba(99, 102, 241, 0.2)",
                            color: "#a5b4fc",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Pin size={10} /> PINNED TO TOP
                        </span>
                      )}

                      {/* Title */}
                      <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                        {n.title}
                      </h4>
                    </div>

                    {/* Metadata line: Posted date, author, expiry badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "8px" }}>
                      <span>
                        Posted: {new Date(n.createdAt).toLocaleDateString()} at{" "}
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>

                      {n.createdBy && <span>By: {n.createdBy}</span>}

                      {/* Expiry Status Indicator */}
                      {n.retentionDays === -1 ? (
                        <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                          <Sparkles size={11} /> Never Expires (Permanent)
                        </span>
                      ) : n.expiresAt ? (
                        <span
                          style={{
                            color: isExpiringSoon ? "#fbbf24" : "var(--text-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontWeight: isExpiringSoon ? 700 : 400,
                          }}
                        >
                          <Clock size={11} />
                          Auto-removes: {new Date(n.expiresAt).toLocaleDateString()} ({Math.max(0, Math.ceil((new Date(n.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24)))} days left)
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>Auto-removes in 7 days</span>
                      )}
                    </div>

                    {/* Content Preview */}
                    {n.content && (
                      <p
                        style={{
                          fontSize: "0.84rem",
                          color: "var(--text-muted)",
                          lineHeight: "1.5",
                          margin: "0 0 10px 0",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {n.content}
                      </p>
                    )}

                    {/* Link Preview if exists */}
                    {n.link && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.76rem", color: "var(--accent-cyan)", background: "rgba(6, 182, 212, 0.08)", padding: "4px 10px", borderRadius: "6px", marginBottom: "8px" }}>
                        <ExternalLink size={12} />
                        <span>Link: <strong>{n.linkText || "Click Here"}</strong> &rarr; {n.link}</span>
                      </div>
                    )}

                    {/* Controls Row: Expiry Duration Dropdown + Pin Toggle + Edit + Delete */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "10px",
                        marginTop: "10px",
                        paddingTop: "10px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                      }}
                    >
                      {/* Left: Change Expiry Days */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.76rem", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} /> Expiry Lifetime:
                        </span>
                        <select
                          className="form-input"
                          value={n.retentionDays !== undefined ? String(n.retentionDays) : "7"}
                          onChange={(e) => handleChangeExpiry(n.id, e.target.value)}
                          disabled={actionLoading}
                          style={{
                            fontSize: "0.76rem",
                            padding: "4px 8px",
                            height: "30px",
                            borderRadius: "6px",
                            background: "rgba(0, 0, 0, 0.3)",
                            borderColor: "var(--border-subtle)",
                            color: n.retentionDays === -1 ? "#34d399" : "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <option value="1">1 Day</option>
                          <option value="3">3 Days</option>
                          <option value="7">7 Days (Default)</option>
                          <option value="15">15 Days</option>
                          <option value="30">30 Days (1 Month)</option>
                          <option value="60">60 Days (2 Months)</option>
                          <option value="-1">Never Expire (Permanent)</option>
                        </select>
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Pin / Unpin button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(n)}
                          disabled={actionLoading}
                          style={{
                            background: n.isPinned ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.05)",
                            border: n.isPinned ? "1px solid #6366f1" : "1px solid var(--border-subtle)",
                            color: n.isPinned ? "#a5b4fc" : "var(--text-muted)",
                            borderRadius: "6px",
                            padding: "5px 10px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            cursor: "pointer",
                          }}
                          title={n.isPinned ? "Unpin notice from top" : "Pin notice to top"}
                        >
                          <Pin size={12} />
                          <span>{n.isPinned ? "Pinned" : "Pin to Top"}</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => openEditModal(n)}
                          disabled={actionLoading}
                          className="btn-secondary"
                          style={{
                            padding: "5px 10px",
                            fontSize: "0.75rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title="Edit notice details"
                        >
                          <Edit3 size={12} />
                          <span>Edit</span>
                        </button>

                        {/* Delete Single Notice */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(n)}
                          disabled={actionLoading}
                          style={{
                            background: "rgba(239, 68, 68, 0.12)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#f87171",
                            borderRadius: "6px",
                            padding: "5px 10px",
                            fontSize: "0.75rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            cursor: "pointer",
                          }}
                          title="Delete notice (Archived to Restore Vault)"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "50px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "12px",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <Bell size={36} style={{ color: "var(--text-dim)", marginBottom: "10px", opacity: 0.5 }} />
          <h4 style={{ fontSize: "1rem", color: "#fff", marginBottom: "6px" }}>No Notices Found</h4>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "14px" }}>
            {searchQuery ? `No notices matching "${searchQuery}"` : "You haven't posted any notices to the board yet."}
          </p>
          {searchQuery ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSearchQuery("")}
              style={{ fontSize: "0.8rem", padding: "6px 14px" }}
            >
              Clear Search
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={openCreateModal}
              style={{ fontSize: "0.82rem", padding: "7px 16px" }}
            >
              Post First Notice
            </button>
          )}
        </div>
      )}

      {/* Create / Edit Notice Modal */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: "600px", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "rgba(6, 182, 212, 0.2)",
                    color: "var(--accent-cyan)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={18} />
                </div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#fff" }}>
                  {editingNotice ? "Edit Notice Announcement" : "Create New Global Broadcast"}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowFormModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Notice Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. End Semester Exam Syllabus & Hand-written Notes Available"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Notice Description / Announcement Content</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Provide all details, instructions, links, or syllabus guidelines for students..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px", marginBottom: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Optional Link (URL)</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://... or /api/notes/..."
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Button Text</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Click Here"
                    value={formLinkText}
                    onChange={(e) => setFormLinkText(e.target.value)}
                  />
                </div>
              </div>

              {/* Pin Checkbox & Auto-Delete Duration */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "14px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px",
                  marginBottom: "20px",
                }}
              >
                {/* Pin to top */}
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", display: "block", marginBottom: "6px" }}>
                    📌 Priority Pinning
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    <input
                      type="checkbox"
                      checked={formPinned}
                      onChange={(e) => setFormPinned(e.target.checked)}
                    />
                    <span>Pin to top of board</span>
                  </label>
                </div>

                {/* Expiry Lifetime */}
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", display: "block", marginBottom: "6px" }}>
                    ⏳ Auto-Delete Duration
                  </label>
                  <select
                    className="form-input"
                    value={formRetentionDays}
                    onChange={(e) => setFormRetentionDays(e.target.value)}
                    style={{ fontSize: "0.82rem", padding: "6px 10px" }}
                  >
                    <option value="1">1 Day</option>
                    <option value="3">3 Days</option>
                    <option value="7">7 Days (Default)</option>
                    <option value="15">15 Days</option>
                    <option value="30">30 Days (1 Month)</option>
                    <option value="60">60 Days (2 Months)</option>
                    <option value="-1">Never Expire (Permanent)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFormModal(false)}
                  style={{ padding: "8px 16px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                  style={{ padding: "8px 20px", fontWeight: 700 }}
                >
                  {actionLoading ? "Saving..." : editingNotice ? "Update Notice" : "Broadcast Notice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

