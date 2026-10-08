import React, { useState } from "react";
import { FileText, Download, Eye, Share2, Check, Sparkles } from "lucide-react";
import { api } from "../api";

export default function NoteCard({ note, onPreview }) {
  const [copied, setCopied] = useState(false);

  const formattedSize = note.compressedSize
    ? (note.compressedSize / (1024 * 1024)).toFixed(1) + " MB"
    : note.fileSize
    ? (note.fileSize / (1024 * 1024)).toFixed(1) + " MB"
    : "PDF";

  const downloadUrl = api.getDownloadUrl(note.id);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${downloadUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="note-card">
      <div>
        {/* Header with Type & Badges */}
        <div className="card-header">
          <div className="file-type-icon">
            <FileText size={22} />
          </div>

          <div className="note-badges-row">
            {note.isDuplicate && (
              <span className="tech-pill dedup">⚡ 0s Dedup</span>
            )}
            {note.savingsPercent > 0 && !note.isDuplicate && (
              <span className="tech-pill compress">🗜️ -{note.savingsPercent}% Saved</span>
            )}
            {note.branch && (
              <span className="tech-pill branch">{note.branch}</span>
            )}
          </div>
        </div>

        {/* Optional WebP Thumbnail */}
        {note.thumbnailUrl && (
          <div className="card-thumbnail-box" style={{ marginTop: "12px" }}>
            <img src={note.thumbnailUrl} alt={note.title} loading="lazy" />
          </div>
        )}

        {/* Content Info */}
        <div style={{ marginTop: "14px" }}>
          <h3 className="note-title" title={note.title}>
            {note.title}
          </h3>
          <div className="note-subject">{note.subject || "General Engineering"}</div>
          {note.description && (
            <p className="note-desc">{note.description}</p>
          )}
        </div>
      </div>

      {/* Footer & Actions */}
      <div>
        <div className="note-meta-footer">
          <span>{note.semester || "All Semesters"}</span>
          <span>{formattedSize} • {note.downloadsCount || 0} downloads</span>
        </div>

        <div className="card-action-bar">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-card-download"
            title="Download via Cloudflare CDN"
          >
            <Download size={15} />
            <span>⚡ Fast Download</span>
          </a>

          <button
            className="btn-card-preview"
            onClick={() => onPreview(note)}
            title="Preview Document"
          >
            <Eye size={16} />
          </button>

          <button
            className="btn-card-preview"
            onClick={handleCopyLink}
            title={copied ? "Link Copied!" : "Copy Direct CDN Link"}
          >
            {copied ? <Check size={16} style={{ color: "#34d399" }} /> : <Share2 size={16} />}
          </button>
        </div>
      </div>
    </article>
  );
}

