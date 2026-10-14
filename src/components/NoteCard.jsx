import React, { useState, useRef } from "react";
import { FileText, Download, Eye, Share2, Check, Activity } from "lucide-react";
import { api } from "../api";
import { downloadFromPeerMesh, cacheNoteBuffer } from "../utils/p2pMesh";
import { formatFileSize, formatMB } from "../utils/formatUtils";

export default function NoteCard({ note, onPreview, currentUser, onRequireAuth }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const abortControllerRef = useRef(null);
  const [downloadProgress, setDownloadProgress] = useState({
    percent: 0,
    speed: "0 MB/s",
    loadedMB: "0",
    totalMB: "0",
    timeRemaining: "",
  });

  const formattedSize = formatFileSize(note.compressedSize || note.fileSize);

  const directDownloadUrl = api.getDownloadUrl(note.id);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${directDownloadUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancelDownload = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDownloading(false);
    setDownloadProgress(null);
  };

  const handleTrackedDownload = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      if (onRequireAuth) onRequireAuth("signin");
      return;
    }
    if (downloading) return;

    abortControllerRef.current = new AbortController();
    setDownloading(true);
    setDownloadProgress({
      percent: 5,
      speed: "Checking Local Wi-Fi Peers...",
      loadedMB: "0",
      totalMB: formatMB(note.compressedSize || note.fileSize || 1048576),
      timeRemaining: "Estimating...",
    });

    try {
      const fileName = note.originalName || `${note.title}.pdf`;
      // Check WebRTC P2P Mesh first for direct peer-to-peer 100 MB/s transfer
      try {
        const p2pBuffer = await downloadFromPeerMesh(note.id, (metrics) => {
          setDownloadProgress(metrics);
        });

        if (p2pBuffer) {
          // File was transferred via WebRTC P2P mesh! Trigger browser download
          const blob = new Blob([p2pBuffer], { type: note.mimeType || "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return;
        }
      } catch (p2pErr) {
        console.debug("[P2P] Peer transfer fallback to Cloudflare stream:", p2pErr.message);
      }

      // Standard high-speed Cloudflare MTProto stream with AbortSignal
      await api.downloadNoteWithProgress(note.id, fileName, (metrics) => {
        setDownloadProgress(metrics);
      }, abortControllerRef.current.signal);
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("[DOWNLOAD] User cancelled active stream.");
        return;
      }
      console.warn("[DOWNLOAD] Download error:", err.message);
      if (err.message.includes("401") || err.message.includes("Restricted") || err.message.includes("exclusively for registered")) {
        if (onRequireAuth) onRequireAuth("signin");
      } else if (note.driveLink) {
        window.open(note.driveLink, "_blank");
      } else {
        alert(err.message || "Document is currently being processed in the vault. Please try another note.");
      }
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
            {note.foundViaOcr && (
              <span className="tech-pill compress" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                🔍 Found in Handwritten (OCR)
              </span>
            )}
            {note.isDuplicate && (
              <span className="tech-pill dedup">⚡ 0s Dedup</span>
            )}
            {note.savingsPercent > 0 && !note.isDuplicate && (
              <span className="tech-pill compress">🗜️ -{note.savingsPercent}% Saved</span>
            )}
            {note.isLatest && (
              <span
                className="tech-pill"
                style={{
                  background: "linear-gradient(135deg, #10b981, #06b6d4)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "0.68rem",
                  letterSpacing: "0.5px",
                }}
              >
                ✨ LATEST
              </span>
            )}
            {note.course && (
              <span className="tech-pill" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                {note.course}
              </span>
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
          <span>{note.year || note.semester || "All Years"}</span>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#fff", fontWeight: 700, marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Activity size={12} style={{ color: "var(--accent-cyan)" }} />
                Downloading: {downloadProgress.percent}%
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                  ⚡ {downloadProgress.speed}
                </span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  style={{
                    background: "rgba(239, 68, 68, 0.25)",
                    color: "#f87171",
                    border: "1px solid rgba(239, 68, 68, 0.45)",
                    borderRadius: "4px",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                  }}
                  title="Cancel Download"
                >
                  ✕ Cancel
                </button>
              </div>
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
            onClick={() => {
              if (!currentUser) {
                if (onRequireAuth) onRequireAuth("signin");
                return;
              }
              onPreview(note);
            }}
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
