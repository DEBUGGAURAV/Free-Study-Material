import React from "react";
import VirtualPdfReader from "./VirtualPdfReader";
import { api } from "../api";

export default function PreviewModal({ note, onClose, onOpenAuth }) {
  if (!note) return null;

  const downloadUrl = api.getDownloadUrl(note.id);
  const isPdf = (note.mimeType || "").includes("pdf") || (note.originalName || "").toLowerCase().endsWith(".pdf") || true;

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
          url={downloadUrl}
          title={note.title}
          subject={note.subject}
          noteId={note.id}
          note={note}
          onClose={onClose}
          onDownload={() => window.open(downloadUrl, "_blank")}
          onOpenAuth={onOpenAuth}
        />
      </div>
    </div>
  );
}
