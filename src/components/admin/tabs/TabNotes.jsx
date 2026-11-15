import { Trash2, Eye, EyeOff, Edit3, Search, Clock, RefreshCw, Download, Power, Lock, BookOpen, Layers, Server, Sliders } from "lucide-react";
import { formatFileSize } from "../../../utils/formatUtils";

export default function TabNotes(props) {
  const {
    activeDownloadsCount,
    adminNoteSearch,
    bulkDownloadLoading,
    currentAllowNotesDownload,
    downloadGateLoading,
    filteredNotes,
    formatSyncTime,
    handleBulkToggleDownload,
    handleDeleteNote,
    handleStartEditNote,
    handleTelegramSync,
    handleToggleCompleteNotesDownload,
    handleToggleNoteDownload,
    handleToggleVisibility,
    isHalfAdmin,
    lastSyncInfo,
    lockedDownloadsCount,
    noteDownloadFilter,
    noteOverrides,
    notes,
    setAdminNoteSearch,
    setNoteDownloadFilter,
    setPreviewNoteInAdmin,
    setShowDeleteAllModal,
    stats,
    syncingTelegram,
  } = props;

  return (
    <div>
      {/* Complete Notes Download Master Gate Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: currentAllowNotesDownload ? "#ecfdf5" : "#fef2f2",
          border: `1.5px solid ${currentAllowNotesDownload ? "#a7f3d0" : "#fecaca"}`,
          borderRadius: "14px",
          padding: "14px 18px",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: currentAllowNotesDownload ? "#d1fae5" : "#fee2e2",
              color: currentAllowNotesDownload ? "#059669" : "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Download size={20} />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>Complete Notes Download Gate:</span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: currentAllowNotesDownload ? "#059669" : "#dc2626",
                  color: "#ffffff",
                }}
              >
                {currentAllowNotesDownload ? "✅ DOWNLOADS ENABLED" : "⛔ ALL DOWNLOADS PAUSED"}
              </span>
            </div>
            <div style={{ fontSize: "0.76rem", color: "#475569", marginTop: "3px" }}>
              {currentAllowNotesDownload
                ? "Platform-wide notes are active for student download. Individual notes can also be specifically paused in the table below."
                : "Complete platform notes download is paused. Students can only study in the Online PDF Reader; direct download is locked."}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleCompleteNotesDownload}
          disabled={downloadGateLoading}
          className={`adm-btn-pill ${currentAllowNotesDownload ? "danger" : "primary"}`}
          style={{ padding: "8px 16px" }}
        >
          <Power size={15} />
          <span>
            {downloadGateLoading
              ? "Updating Gate..."
              : currentAllowNotesDownload
              ? "⛔ Pause All Downloads"
              : "✅ Enable All Downloads"}
          </span>
        </button>
      </div>

      {/* Search & Actions Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", minWidth: "280px", flex: 1 }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#0284c7" }} />
          <input
            type="text"
            className="adm-form-input"
            style={{ padding: "9px 12px 9px 36px", fontSize: "0.85rem" }}
            placeholder="Search note vault by title, subject, branch, or course..."
            value={adminNoteSearch}
            onChange={(e) => setAdminNoteSearch(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleTelegramSync}
            className="adm-btn-pill"
            disabled={syncingTelegram}
            title="Two-way sync between Telegram MTProto storage channel and Firestore"
          >
            <RefreshCw size={14} className={syncingTelegram ? "spin" : ""} style={{ color: "#0284c7" }} />
            <span>{syncingTelegram ? "Syncing..." : "Sync Channel"}</span>
          </button>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.75rem",
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
              padding: "6px 12px",
              borderRadius: "8px",
              color: "#475569",
            }}
            title="Real-Time Event-Driven Sync Status"
          >
            <Clock size={13} style={{ color: "#0284c7" }} />
            <span>Last Synced:</span>
            <strong style={{ color: "#0f172a" }}>
              {formatSyncTime(lastSyncInfo || stats?.lastSync)}
            </strong>
            {(lastSyncInfo?.trigger || stats?.lastSync?.trigger) && (
              <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.72rem" }}>
                • {lastSyncInfo?.trigger || stats?.lastSync?.trigger}
              </span>
            )}
            <button
              type="button"
              onClick={handleTelegramSync}
              disabled={syncingTelegram}
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1d4ed8",
                borderRadius: "6px",
                padding: "2px 8px",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                marginLeft: "4px",
              }}
              title="Run Two-Way Sync Now"
            >
              {syncingTelegram ? "Syncing..." : "🔄 Sync"}
            </button>
          </div>

          {!isHalfAdmin && (
            <button
              type="button"
              onClick={() => setShowDeleteAllModal(true)}
              className="adm-btn-pill danger"
            >
              <Trash2 size={14} />
              <span>Restore Vault</span>
            </button>
          )}
        </div>
      </div>

      {/* Note Download Permissions Filter & Bulk Actions Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          padding: "10px 14px",
          background: "#f8fafc",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          marginBottom: "14px",
        }}
      >
        {/* Download Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Filter By Download:
          </span>
          <button
            type="button"
            onClick={() => setNoteDownloadFilter("all")}
            className="adm-btn-pill"
            style={{
              background: noteDownloadFilter === "all" ? "#eff6ff" : "#ffffff",
              borderColor: noteDownloadFilter === "all" ? "#2563eb" : "#cbd5e1",
              color: noteDownloadFilter === "all" ? "#1d4ed8" : "#475569",
              padding: "4px 10px",
            }}
          >
            All ({notes.length})
          </button>
          <button
            type="button"
            onClick={() => setNoteDownloadFilter("active")}
            className="adm-btn-pill"
            style={{
              background: noteDownloadFilter === "active" ? "#ecfdf5" : "#ffffff",
              borderColor: noteDownloadFilter === "active" ? "#059669" : "#cbd5e1",
              color: noteDownloadFilter === "active" ? "#065f46" : "#475569",
              padding: "4px 10px",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
            Active ({activeDownloadsCount})
          </button>
          <button
            type="button"
            onClick={() => setNoteDownloadFilter("locked")}
            className="adm-btn-pill"
            style={{
              background: noteDownloadFilter === "locked" ? "#fef2f2" : "#ffffff",
              borderColor: noteDownloadFilter === "locked" ? "#dc2626" : "#cbd5e1",
              color: noteDownloadFilter === "locked" ? "#991b1b" : "#475569",
              padding: "4px 10px",
            }}
          >
            <Lock size={11} style={{ color: "#dc2626" }} />
            Locked ({lockedDownloadsCount})
          </button>
        </div>

        {/* Bulk Actions for Filtered Notes */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => handleBulkToggleDownload(false)}
            disabled={bulkDownloadLoading || filteredNotes.length === 0}
            className="adm-btn-pill danger"
            style={{ padding: "5px 12px", opacity: (bulkDownloadLoading || filteredNotes.length === 0) ? 0.5 : 1 }}
            title={`Lock/Pause downloads for all ${filteredNotes.length} matching notes`}
          >
            <Lock size={12} />
            <span>{bulkDownloadLoading ? "Updating..." : `Lock Filtered (${filteredNotes.length})`}</span>
          </button>
          <button
            type="button"
            onClick={() => handleBulkToggleDownload(true)}
            disabled={bulkDownloadLoading || filteredNotes.length === 0}
            className="adm-btn-pill"
            style={{
              background: "#ecfdf5",
              borderColor: "#a7f3d0",
              color: "#059669",
              padding: "5px 12px",
              opacity: (bulkDownloadLoading || filteredNotes.length === 0) ? 0.5 : 1,
            }}
            title={`Enable downloads for all ${filteredNotes.length} matching notes`}
          >
            <Download size={12} />
            <span>{bulkDownloadLoading ? "Updating..." : `Enable Filtered (${filteredNotes.length})`}</span>
          </button>
        </div>
      </div>

      {/* Pure White Notes Table */}
      <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #e2e8f0", color: "#475569", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.5px" }}>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <BookOpen size={13} style={{ color: "#0284c7" }} />
                  <span>DOCUMENT TITLE &amp; SUBJECT</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Layers size={13} style={{ color: "#4f46e5" }} />
                  <span>BRANCH &amp; COURSE</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Server size={13} style={{ color: "#d97706" }} />
                  <span>SIZE</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Download size={13} style={{ color: "#059669" }} />
                  <span>DOWNLOAD GATE</span>
                </div>
              </th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                  <Sliders size={13} style={{ color: "#7c3aed" }} />
                  <span>CONTROLS</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredNotes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                  No notes found matching your search.
                </td>
              </tr>
            ) : (
              filteredNotes.map((rawNote) => {
                const override = noteOverrides[rawNote.id];
                const note = override ? { ...rawNote, ...override } : rawNote;
                const currentAllow = noteOverrides[note.id]?.allowDownload !== undefined ? noteOverrides[note.id].allowDownload : note.allowDownload;
                const isLocked = currentAllow === false || String(currentAllow) === "false" || currentAllow === 0 || String(currentAllow) === "0";

                return (
                  <tr key={note.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s ease" }}>
                    <td style={{ padding: "12px 16px", maxWidth: "340px" }}>
                      <div style={{ fontWeight: 750, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={note.title}>
                        {note.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#0284c7", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                        <span>{note.subject || "General Academic"}</span>
                        {note.telegramMessageId && (
                          <span style={{ color: "#0284c7", fontWeight: 700 }}>• ✈️ #{note.telegramMessageId}</span>
                        )}
                        {note.isDuplicate && (
                          <span style={{ fontSize: "0.64rem", padding: "1px 5px", borderRadius: "4px", background: "#fef3c7", color: "#92400e", fontWeight: 800 }}>⚡ Dedup</span>
                        )}
                        {note.foundViaOcr && (
                          <span style={{ fontSize: "0.64rem", padding: "1px 5px", borderRadius: "4px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800 }}>🔍 OCR</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontWeight: 800, fontSize: "0.72rem" }}>
                        {note.branch || "CSE"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>
                        {note.course || "B.Tech"} • {note.year || note.semester || "All"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>
                      {formatFileSize(note.compressedSize || note.fileSize)}
                      {note.savingsPercent > 0 && (
                        <span style={{ color: "#059669", fontSize: "0.72rem", marginLeft: "6px", fontWeight: 700 }}>
                          (-{note.savingsPercent}%)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ color: "#0f172a", fontWeight: 750 }}>{note.downloadsCount || 0}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleNoteDownload(note)}
                          style={{
                            fontSize: "0.68rem",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            background: isLocked ? "#fef2f2" : "#ecfdf5",
                            color: isLocked ? "#dc2626" : "#059669",
                            border: `1px solid ${isLocked ? "#fca5a5" : "#a7f3d0"}`,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            transition: "all 0.15s ease",
                          }}
                          title={isLocked ? "Downloads Locked for this note. Click to Enable!" : "Downloads Active for this note. Click to Lock!"}
                        >
                          {isLocked ? (
                            <>
                              <Lock size={10} />
                              <span>Locked</span>
                            </>
                          ) : (
                            <>
                              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#10b981" }} />
                              <span>Active</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "5px" }}>
                        <button
                          type="button"
                          onClick={() => handleToggleNoteDownload(note)}
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: isLocked ? "#fef2f2" : "#ecfdf5",
                            color: isLocked ? "#dc2626" : "#059669",
                            border: `1px solid ${isLocked ? "#fca5a5" : "#a7f3d0"}`,
                            cursor: "pointer",
                          }}
                          title={isLocked ? "Downloads Paused. Click to Enable." : "Downloads Active. Click to Pause."}
                        >
                          {isLocked ? <Lock size={13} /> : <Download size={13} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(note.id, note.isVisible !== false)}
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            color: note.isVisible !== false ? "#0284c7" : "#dc2626",
                            cursor: "pointer",
                          }}
                          title={note.isVisible !== false ? "Hide Note" : "Show Note"}
                        >
                          {note.isVisible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewNoteInAdmin(note)}
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            color: "#2563eb",
                            cursor: "pointer",
                          }}
                          title="Inspect Document in PDF Reader"
                        >
                          <BookOpen size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEditNote(note)}
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            color: "#475569",
                            cursor: "pointer",
                          }}
                          title="Edit Metadata"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "7px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#fee2e2",
                            border: "1px solid #fca5a5",
                            color: "#dc2626",
                            cursor: "pointer",
                          }}
                          title="Move to Restore Vault"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
