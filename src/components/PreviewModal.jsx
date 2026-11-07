import React from "react";
import VirtualPdfReader from "./VirtualPdfReader";
import { api } from "../api";
import { getSmartStreamUrl } from "../utils/cdnFailover";
import { getNotePdfFileName } from "../utils/formatUtils";

export default function PreviewModal({
  note,
  onClose,
  onOpenAuth,
  currentUser,
  allowNotesDownload = true,
  downloadDisabledReason = "",
  initialPage = 1,
}) {
  if (!note) return null;

  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.isMainAdmin;

  const isSingleNoteDisabled = note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0";
  const isBlocked = Boolean(!allowNotesDownload || allowNotesDownload === "false" || isSingleNoteDisabled);
  const effectiveReason = note.downloadDisabledReason || downloadDisabledReason || (isSingleNoteDisabled ? "Download for this specific note has been disabled by the administrator. You can still read and study all pages here in the Online Reader!" : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");

  const finalFileName = getNotePdfFileName(note);

  // Stream through Cloudflare Global Edge CDN with resilient auto-failover (using httpOnly session cookie)
  const streamUrl = getSmartStreamUrl(note.id, null, finalFileName, true, Boolean(note?.isCdnCached));
  const directDownloadUrl = api.getDownloadUrl(note.id, finalFileName);
  const isPdf = (note.mimeType || "").includes("pdf") || (note.originalName || "").toLowerCase().endsWith(".pdf") || true;

  // Auto-transfer and live stream source transitions are managed inside VirtualPdfReader

  const handleDownload = async () => {
    if (isBlocked) {
      alert(effectiveReason);
      return;
    }
    try {
      await api.downloadNoteWithProgress(note.id, finalFileName);
    } catch (err) {
      window.open(api.getDownloadUrl(note.id, finalFileName, true), "_blank");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ padding: "8px", zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: "1680px",
          width: "98vw",
          height: "96vh",
          maxHeight: "96vh",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          overflow: "hidden",
          borderRadius: "14px",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.15)",
          background: "#0b0f19",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <VirtualPdfReader
          url={streamUrl}
          title={note.title}
          subject={note.subject}
          noteId={note.id}
          note={note}
          currentUser={currentUser}
          onClose={onClose}
          onDownload={isBlocked ? null : handleDownload}
          isDownloadBlocked={isBlocked}
          downloadDisabledReason={effectiveReason}
          onOpenAuth={onOpenAuth}
          initialPage={initialPage || note?._initialPage || 1}
        />
      </div>
    </div>
  );
}
