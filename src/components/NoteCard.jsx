import React, { useState } from "react";
import { FileText, Download, Eye, Share2, Check, Activity, Sparkles } from "lucide-react";
import { api } from "../api";

export default function NoteCard({ note, onPreview }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    percent: 0,
    speed: "0 MB/s",
    loadedMB: "0",
    totalMB: "0",
    timeRemaining: "",
  });

  const formattedSize = note.compressedSize
    ? (note.compressedSize / (1024 * 1024)).toFixed(1) + " MB"
    : note.fileSize
    ? (note.fileSize / (1024 * 1024)).toFixed(1) + " MB"
    : "PDF";

  const directDownloadUrl = api.getDownloadUrl(note.id);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${directDownloadUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrackedDownload = async (e) => {
    e.preventDefault();
    if (downloading) return;

    setDownloading(true);
    setDownloadProgress({
      percent: 5,
      speed: "Connecting to CDN...",
      loadedMB: "0",
      totalMB: (note.compressedSize ? note.compressedSize / (1024 * 1024) : 1).toFixed(1),
      timeRemaining: "Estimating...",
    });

    try {
      const fileName = note.originalName || `${note.title}.pdf`;
      await api.downloadNoteWithProgress(note.id, fileName, (metrics) => {
        setDownloadProgress(metrics);
      });
    } catch (err) {
      console.warn("[DOWNLOAD] Direct stream fallback:", err.message);
      // Fallback: open direct link
      window.open(directDownloadUrl, "_blank");
    } finally {
      setTimeout(() => {
        setDownloading(false);
      }, 1000);
    }
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
          <div className="note-subject">{note.subject || "General Academic"}</div>
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

        {/* LIVE IN-CARD DOWNLOAD PROGRESS BAR */}
        {downloading && (
          <div
            style={{
              marginTop: "8px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#fff", fontWeight: 700, marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Activity size={12} style={{ color: "var(--accent-cyan)" }} />
                Downloading: {downloadProgress.percent}%
              </span>
              <span style={{ color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                ⚡ {downloadProgress.speed}
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: "5px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
                marginBottom: "4px",
              }}
            >
              <div
                style={{
                  width: `${downloadProgress.percent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--accent-indigo), var(--accent-cyan))",
                  boxShadow: "0 0 8px var(--accent-cyan)",
                  transition: "width 0.1s ease",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-dim)" }}>
              <span>{downloadProgress.loadedMB} MB / {downloadProgress.totalMB} MB</span>
              <span>{downloadProgress.timeRemaining}</span>
            </div>
          </div>
        )}

        <div className="card-action-bar">
          <button
            onClick={handleTrackedDownload}
            className="btn-card-download"
            title="Download via Cloudflare Indian CDN"
            disabled={downloading}
          >
            {downloading ? (
              <>
                <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
                <span>Streaming {downloadProgress.percent}%</span>
              </>
            ) : (
              <>
                <Download size={15} />
                <span>⚡ Fast Download</span>
              </>
            )}
          </button>

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
