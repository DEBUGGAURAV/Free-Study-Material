import React from "react";
import VirtualPdfReader from "./VirtualPdfReader";
import { api } from "../api";
import { getSmartStreamUrl } from "../utils/cdnFailover";

export default function PreviewModal({
  note,
  onClose,
  onOpenAuth,
  currentUser,
  allowNotesDownload = true,
  downloadDisabledReason = "",
}) {
  if (!note) return null;

  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.isMainAdmin;

  const isNoteDownloadDisabled = note.allowDownload === false;
  const isBlocked = (!allowNotesDownload || isNoteDownloadDisabled);
  const effectiveReason = note.downloadDisabledReason || downloadDisabledReason || "Download for this particular note is disabled by the administrator. You can still read and study all pages here in the Online Reader!";

  // Stream through Cloudflare Global Edge CDN with resilient auto-failover (using httpOnly session cookie)
  const streamUrl = getSmartStreamUrl(note.id);
  const directDownloadUrl = api.getDownloadUrl(note.id);
  const isPdf = (note.mimeType || "").includes("pdf") || (note.originalName || "").toLowerCase().endsWith(".pdf") || true;

  // Auto-transfer and live stream source transitions are managed inside VirtualPdfReader

  const handleDownload = () => {
    if (isBlocked) {
      if (isAdmin) {
        if (!window.confirm(`🛡️ Admin Inspection Notice:\n\nStudent downloads for "${note.title}" are currently DISABLED.\n\nReason: "${effectiveReason}"\n\nWould you like to download anyway as Administrator for inspection?`)) {
          return;
        }
      } else {
        alert(effectiveReason);
        return;
      }
    }
    const rawName = (note.originalName || note.title || "Free_Study_Material").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const finalFileName = rawName.toLowerCase().endsWith(".pdf") ? rawName : `${rawName}.pdf`;
    const downloadUrl = `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}download=1&filename=${encodeURIComponent(finalFileName)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ padding: "12px", zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: "1050px",
          width: "95vw",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          padding: "0",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <VirtualPdfReader
          url={streamUrl}
          title={note.title}
          subject={note.subject}
          noteId={note.id}
          note={note}
          onClose={onClose}
          onDownload={isBlocked ? null : handleDownload}
          isDownloadBlocked={isBlocked}
          downloadDisabledReason={effectiveReason}
          onOpenAuth={onOpenAuth}
        />
      </div>
    </div>
  );
}
