import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  HelpCircle,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Send,
  Shield,
  Zap,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
  Check,
  X,
} from "lucide-react";
import { api } from "../../../api";

export default function TabHelpDesk() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'active' | 'closed'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [autoDeleteOnClose, setAutoDeleteOnClose] = useState(false);
  const [telemetry, setTelemetry] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // Load tickets on mount & filter change
  const loadTickets = async () => {
    setLoading(true);
    try {
      const filterArg = statusFilter === "all" ? null : statusFilter;
      const res = await api.getAdminHelpTickets(filterArg);
      if (res && res.tickets) {
        setTickets(res.tickets);
      }
      const telRes = await api.getHelpTelemetry().catch(() => null);
      if (telRes?.success) {
        setTelemetry(telRes);
      }
    } catch (err) {
      console.warn("Failed to load help tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const showNotification = (msg, isError = false) => {
    setActionNotice({ text: msg, isError });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Reply to ticket
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setReplySubmitting(true);
    try {
      const res = await api.adminReplyHelpTicket(selectedTicket.ticket_code, replyText.trim());
      if (res && res.success) {
        showNotification(`✅ Reply sent to student on #${selectedTicket.ticket_code}!`);
        setReplyText("");
        loadTickets();
        if (selectedTicket) {
          setSelectedTicket({
            ...selectedTicket,
            admin_reply: replyText.trim(),
            status: "answered",
            replied_at: new Date().toISOString(),
          });
        }
      } else {
        showNotification(res?.message || "Failed to send reply", true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setReplySubmitting(false);
    }
  };

  // Close ticket and delete from database
  const handleCloseTicket = async (ticket) => {
    if (!ticket) return;
    try {
      const res = await api.adminCloseHelpTicket(
        ticket.ticket_code,
        replyText.trim() || ticket.admin_reply || "Resolved by Administrator via Web Console",
        true
      );
      if (res && res.success) {
        showNotification(`🔴 Ticket #${ticket.ticket_code} closed & permanently deleted from database!`);
        setSelectedTicket(null);
        loadTickets();
      } else {
        showNotification(res?.message || "Failed to close ticket", true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  // Mark ticket active
  const handleSetActiveTicket = async (ticket) => {
    if (!ticket) return;
    try {
      const res = await api.adminActiveHelpTicket(ticket.ticket_code);
      if (res && res.success) {
        showNotification(`🟢 Ticket #${ticket.ticket_code} marked Active!`);
        if (selectedTicket?.ticket_code === ticket.ticket_code) {
          setSelectedTicket({ ...selectedTicket, status: "active" });
        }
        loadTickets();
      } else {
        showNotification(res?.message || "Failed to set active", true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  // Physically delete single ticket
  const handleDeleteTicket = async (ticketCode) => {
    if (!window.confirm(`Are you sure you want to physically delete ticket #${ticketCode} from the database?`)) return;
    try {
      const res = await api.adminDeleteHelpTicket(ticketCode);
      if (res && res.success) {
        showNotification(`🗑️ Ticket #${ticketCode} deleted from database!`);
        if (selectedTicket?.ticket_code === ticketCode) setSelectedTicket(null);
        loadTickets();
      } else {
        showNotification(res?.message || "Delete failed", true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  // Physically purge closed or all tickets
  const handlePurgeTickets = async (onlyClosed = true) => {
    const promptText = onlyClosed
      ? "Permanently delete all CLOSED tickets from Turso database?"
      : "⚠️ DANGER: Permanently wipe ALL tickets from Turso database?";
    if (!window.confirm(promptText)) return;

    try {
      const res = await api.adminPurgeHelpTickets(onlyClosed);
      if (res && res.success) {
        showNotification(`🧹 Database Cleaned: ${res.message || "Tickets purged"}`);
        setSelectedTicket(null);
        loadTickets();
      } else {
        showNotification(res?.message || "Purge failed", true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.ticket_code && t.ticket_code.toLowerCase().includes(q)) ||
      (t.user_name && t.user_name.toLowerCase().includes(q)) ||
      (t.user_email && t.user_email.toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q)) ||
      (t.question && t.question.toLowerCase().includes(q))
    );
  });

  const totalCount = tickets.length;
  const activeCount = tickets.filter((t) => t.status === "active" || t.status === "pending" || t.status === "answered").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Toast Notification */}
      {actionNotice && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            background: actionNotice.isError ? "rgba(239, 68, 68, 0.9)" : "rgba(16, 185, 129, 0.9)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {actionNotice.isError ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{actionNotice.text}</span>
        </div>
      )}

      {/* Top Telemetry & Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "14px 18px",
            borderRadius: "10px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>
            Total Support Inquiries
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>
            {totalCount}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "2px" }}>
            Physical Database Records
          </div>
        </div>

        <div
          style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            padding: "14px 18px",
            borderRadius: "10px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#34d399", textTransform: "uppercase", fontWeight: 700 }}>
            🟢 Active / Open Queries
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#34d399", marginTop: "4px" }}>
            {activeCount}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6ee7b7", marginTop: "2px" }}>
            Awaiting or In Conversation
          </div>
        </div>

        <div
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            padding: "14px 18px",
            borderRadius: "10px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#f87171", textTransform: "uppercase", fontWeight: 700 }}>
            🔴 Resolved & Closed
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f87171", marginTop: "4px" }}>
            {closedCount}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#fca5a5", marginTop: "2px" }}>
            Archived to Topic 2
          </div>
        </div>

        <div
          style={{
            background: "rgba(6, 182, 212, 0.06)",
            border: "1px solid rgba(6, 182, 212, 0.25)",
            padding: "14px 18px",
            borderRadius: "10px",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700 }}>
            ⚡ Turso Support Cloud
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#38bdf8", marginTop: "8px" }}>
            {telemetry?.turso?.mode === "CLOUD" ? "Cloud Connected" : "LibSQL Standby"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#7dd3fc", marginTop: "2px" }}>
            Bot: @fsm_help_bot (Topic 1 & 2)
          </div>
        </div>
      </div>

      {/* Action Controls & Filters Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "12px 16px",
          borderRadius: "10px",
        }}
      >
        {/* Left: Status Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.78rem",
              fontWeight: 700,
              background: statusFilter === "all" ? "var(--accent-cyan)" : "rgba(255,255,255,0.06)",
              color: statusFilter === "all" ? "#000" : "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.78rem",
              fontWeight: 700,
              background: statusFilter === "active" ? "#10b981" : "rgba(255,255,255,0.06)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            🟢 Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("closed")}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.78rem",
              fontWeight: 700,
              background: statusFilter === "closed" ? "#ef4444" : "rgba(255,255,255,0.06)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            🔴 Closed ({closedCount})
          </button>
        </div>

        {/* Middle: Search Box */}
        <div style={{ position: "relative", minWidth: "240px", flex: 1, maxWidth: "340px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--text-dim)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, email, question..."
            style={{
              width: "100%",
              padding: "6px 10px 6px 32px",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "0.8rem",
            }}
          />
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Auto Delete Toggle */}
          <label
            title="When ON, closing a ticket sends the dossier report to Topic 2 and immediately deletes the database row!"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.76rem",
              fontWeight: 700,
              color: autoDeleteOnClose ? "#fbbf24" : "var(--text-dim)",
              background: autoDeleteOnClose ? "rgba(245, 158, 11, 0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${autoDeleteOnClose ? "rgba(245, 158, 11, 0.4)" : "rgba(255,255,255,0.1)"}`,
              padding: "5px 10px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoDeleteOnClose}
              onChange={(e) => setAutoDeleteOnClose(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>Auto-Delete on Close</span>
          </label>

          {/* Physical Purge Closed Tickets */}
          <button
            type="button"
            onClick={() => handlePurgeTickets(true)}
            title="Physically wipe all closed tickets from Turso Database"
            style={{
              padding: "6px 12px",
              fontSize: "0.76rem",
              fontWeight: 700,
              background: "rgba(239, 68, 68, 0.12)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Trash2 size={14} />
            <span>Purge Closed</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            style={{
              padding: "6px 10px",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loading ? "spin-animation" : ""} />
          </button>
        </div>
      </div>

      {/* Main Tickets Content Area */}
      <div style={{ display: "grid", gridTemplateColumns: selectedTicket ? "1fr 1fr" : "1fr", gap: "16px" }}>
        {/* Tickets List Table */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Live Tickets Queue ({filteredTickets.length})</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
              Sorted Newest First
            </span>
          </div>

          <div style={{ maxHeight: "560px", overflowY: "auto" }}>
            {loading && tickets.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                Loading inquiries from Turso Edge Database...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                No support tickets found matching criteria.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "var(--text-dim)", textAlign: "left" }}>
                    <th style={{ padding: "10px 14px" }}>Code / Student</th>
                    <th style={{ padding: "10px 14px" }}>Subject & Inquiry</th>
                    <th style={{ padding: "10px 14px" }}>Status</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => {
                    const isClosed = t.status === "closed";
                    const isSelected = selectedTicket?.ticket_code === t.ticket_code;

                    return (
                      <tr
                        key={t.ticket_code}
                        onClick={() => setSelectedTicket(t)}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: isSelected
                            ? "rgba(6, 182, 212, 0.12)"
                            : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 800, color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                            #{t.ticket_code}
                          </div>
                          <div style={{ color: "#fff", fontWeight: 600, marginTop: "2px" }}>
                            {t.user_name || "Scholar"}
                          </div>
                          <div style={{ color: "var(--text-dim)", fontSize: "0.72rem" }}>
                            {t.user_email || "Guest Student"}
                            {t.user_mobile && <span style={{ color: "var(--accent-cyan)", marginLeft: "4px" }}>• 📱 {t.user_mobile}</span>}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 700, color: "#e2e8f0" }}>
                            {t.subject || t.category || "General Support"}
                          </div>
                          <div
                            style={{
                              color: "var(--text-dim)",
                              fontSize: "0.75rem",
                              marginTop: "2px",
                              lineHeight: "1.3",
                              maxHeight: "36px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {t.question}
                          </div>
                          {t.admin_reply && (
                            <div style={{ fontSize: "0.7rem", color: "#34d399", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Check size={12} />
                              <span>Replied: {t.admin_reply.slice(0, 40)}...</span>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "4px",
                              textTransform: "uppercase",
                              background: isClosed ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                              color: isClosed ? "#f87171" : "#34d399",
                              border: `1px solid ${isClosed ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                            }}
                          >
                            {t.status || "active"}
                          </span>
                        </td>

                        <td style={{ padding: "12px 14px", verticalAlign: "top", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            {isClosed ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetActiveTicket(t);
                                }}
                                title="Re-open & Mark Active"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  background: "rgba(16, 185, 129, 0.15)",
                                  color: "#34d399",
                                  border: "1px solid rgba(16, 185, 129, 0.3)",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                Active
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCloseTicket(t);
                                }}
                                title="Close Ticket & Send Topic 2 Report"
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  background: "rgba(239, 68, 68, 0.15)",
                                  color: "#f87171",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                Close
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTicket(t.ticket_code);
                              }}
                              title="Delete from Database"
                              style={{
                                padding: "4px 8px",
                                background: "rgba(255,255,255,0.06)",
                                color: "#f87171",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detailed Inspection & Live Reply Panel */}
        {selectedTicket && (
          <div
            style={{
              background: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "10px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--accent-cyan)", fontFamily: "monospace" }}>
                    #{selectedTicket.ticket_code}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: selectedTicket.status === "closed" ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: selectedTicket.status === "closed" ? "#f87171" : "#34d399",
                      border: `1px solid ${selectedTicket.status === "closed" ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedTicket.status || "active"}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
                  Student: <strong style={{ color: "#fff" }}>{selectedTicket.user_name}</strong> • {selectedTicket.user_email || "Guest"}
                  {selectedTicket.user_mobile && <span style={{ color: "var(--accent-cyan)", marginLeft: "4px" }}>• 📱 {selectedTicket.user_mobile}</span>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                style={{ background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Subject & Category */}
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff" }}>
              {selectedTicket.subject ? `📌 ${selectedTicket.subject}` : `Category: ${selectedTicket.category || "General"}`}
            </div>

            {/* Question Box */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: "0.82rem",
                color: "#e2e8f0",
                lineHeight: "1.45",
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", fontWeight: 700, marginBottom: "4px" }}>
                STUDENT QUERY:
              </div>
              {selectedTicket.question}
            </div>

            {/* Previous Admin Reply if exists */}
            {selectedTicket.admin_reply && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "0.82rem",
                  color: "#d1fae5",
                  lineHeight: "1.45",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700, marginBottom: "4px" }}>
                  ADMINISTRATOR REPLY ({selectedTicket.admin_name || "Admin"}):
                </div>
                {selectedTicket.admin_reply}
              </div>
            )}

            {/* Live Reply Form */}
            <form onSubmit={handleSendReply} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                Compose Web Reply to Student:
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type official response here... This reply will be visible to the student in real-time."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "0.82rem",
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button
                  type="submit"
                  disabled={replySubmitting || !replyText.trim()}
                  style={{
                    padding: "8px 16px",
                    background: "var(--accent-cyan)",
                    color: "#000",
                    fontWeight: 800,
                    fontSize: "0.8rem",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Send size={14} />
                  <span>{replySubmitting ? "Sending..." : "Send Web Reply"}</span>
                </button>
              </div>
            </form>

            {/* Status & Lifecycle Actions */}
            <div
              style={{
                marginTop: "auto",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", gap: "8px" }}>
                {selectedTicket.status === "closed" ? (
                  <button
                    type="button"
                    onClick={() => handleSetActiveTicket(selectedTicket)}
                    style={{
                      padding: "7px 14px",
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "6px",
                      fontWeight: 700,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                    }}
                  >
                    🟢 Mark Active
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCloseTicket(selectedTicket)}
                    style={{
                      padding: "7px 14px",
                      background: "rgba(239, 68, 68, 0.2)",
                      color: "#f87171",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      borderRadius: "6px",
                      fontWeight: 700,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                    }}
                  >
                    🔴 Close Ticket & Send Topic 2 Report
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDeleteTicket(selectedTicket.ticket_code)}
                style={{
                  padding: "7px 12px",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f87171",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "0.76rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Trash2 size={13} />
                <span>Delete Row</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

