import React from "react";
import { X, Download, ExternalLink, FileText } from "lucide-react";
import { api } from "../api";

export default function PreviewModal({ note, onClose }) {
  if (!note) return null;

  const downloadUrl = api.getDownloadUrl(note.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "900px", height: "85vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ marginBottom: "16px" }}>
          <div>
            <div className="modal-title" style={{ fontSize: "1.15rem" }}>
              {note.title}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", marginTop: "2px" }}>
              {note.subject} • {note.semester}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ padding: "8px 14px", fontSize: "0.8rem" }}
            >
              <Download size={14} />
              <span>Download</span>
            </a>

            <button className="modal-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Embedded Viewer */}
        <div
          style={{
            flex: 1,
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: "#0a0f1d",
            border: "1px solid var(--border-subtle)",
            position: "relative",
          }}
        >
          <iframe
            src={downloadUrl}
            title={note.title}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

