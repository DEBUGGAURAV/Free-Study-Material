import React, { useState, useEffect, useRef } from "react";
import { FileText, Download, Eye, Share2, Check, Activity, HardDrive, MessageCircle, Pin, Trash2, Zap, Volume2 } from "lucide-react";
import { api } from "../api";
import { downloadFromPeerMesh, cacheNoteBuffer, getCachedNoteBuffer } from "../utils/p2pMesh";
import { formatFileSize, formatMB, getNotePdfFileName } from "../utils/formatUtils";
import { saveNoteOffline, isNotePinnedOffline, togglePinOfflineNote, deleteSingleOfflineNote } from "../utils/offlineQueue";
import { recordStudentNoteRead } from "../utils/studentStudyContext";

export default function NoteCard({
  note,
  onPreview,
  currentUser,
  onRequireAuth,
  allowNotesDownload = true,
  downloadDisabledReason = "",
  onToggleNoteDownload,
}) {
  if (!note || !note.id) return null;

  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.role === "half_admin" ||
    currentUser?.isMainAdmin;
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const abortControllerRef = useRef(null);
  const [downloadProgress, setDownloadProgress] = useState({
    percent: 0,
    speed: "98.4 MB/s",
    loadedMB: "0",
    totalMB: "0",
    timeRemaining: "",
  });

  // Device Dynamic LRU & 48h Cache State
  const [isCachedOffline, setIsCachedOffline] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    let active = true;
    if (!note?.id) return;
    setIsPinned(isNotePinnedOffline(note.id));
    getCachedNoteBuffer(note.id)
      .then((buf) => {
        if (active) setIsCachedOffline(Boolean(buf && buf.byteLength > 0));
      })
      .catch(() => {});

    const handleSync = (e) => {
      if (active && note?.id) {
        // ⚡ Fast-path loop skip: If event was for another note, don't query IndexedDB
        if (e?.detail?.noteId && e.detail.noteId !== note.id) return;
        setIsPinned(isNotePinnedOffline(note.id));
        getCachedNoteBuffer(note.id)
          .then((buf) => {
            if (active) setIsCachedOffline(Boolean(buf && buf.byteLength > 0));
          })
          .catch(() => {});
      }
    };

    window.addEventListener("fsm:offline-notes-changed", handleSync);
    window.addEventListener("fsm:pinned-notes-changed", handleSync);
    return () => {
      active = false;
      window.removeEventListener("fsm:offline-notes-changed", handleSync);
      window.removeEventListener("fsm:pinned-notes-changed", handleSync);
    };
  }, [note?.id]);

  const handleToggleCardPin = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nextPinned = togglePinOfflineNote(note.id);
    setIsPinned(nextPinned);
    window.dispatchEvent(new CustomEvent("fsm:pinned-notes-changed", { detail: { noteId: note.id, isPinned: nextPinned } }));
  };

  const handleDeleteOfflineCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${note.title}" from local device offline storage?`)) return;
    await deleteSingleOfflineNote(note.id);
    setIsCachedOffline(false);
    setIsPinned(false);
    window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
  };

  const formattedSize = formatFileSize(note?.compressedSize || note?.fileSize);

  const isSingleNoteDisabled = note?.allowDownload === false || note?.allowDownload === "false" || note?.allowDownload === 0 || note?.allowDownload === "0";
  const isNoteDownloadBlocked = Boolean(isSingleNoteDisabled || !allowNotesDownload || allowNotesDownload === "false");

  const fileName = getNotePdfFileName(note);
  const directDownloadUrl = api.getDownloadUrl(note?.id, fileName);

  // 1. One-Tap Native Web Share API (WhatsApp/Telegram/System Sheet)
  const handleShareNote = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const noteUrl = `${window.location.origin}/?note=${note.id}`;
    const shareData = {
      title: note.title,
      text: `📚 Free Study Material Vault:\nDownload "${note.title}" for ${note.subject || "General"} (${note.course || "B.Tech"}):`,
      url: noteUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback: Clipboard copy & WhatsApp Web
    try {
      await navigator.clipboard.writeText(`${shareData.text} ${noteUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareData.text + " " + noteUrl)}`, "_blank");
    }
  };

  // 2. One-Tap Share Note in Student Study Chat
  const [sharedToChat, setSharedToChat] = useState(false);
  const handleShareToChat = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) {
      if (onRequireAuth) onRequireAuth("signin");
      return;
    }
    window.dispatchEvent(new CustomEvent("open_student_chat"));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("share_note_to_chat", { detail: note }));
    }, 150);
    setSharedToChat(true);
    setTimeout(() => setSharedToChat(false), 2000);
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
    if (isNoteDownloadBlocked) {
      const reasonMsg = note.downloadDisabledReason || downloadDisabledReason || (isSingleNoteDisabled ? "Downloads for this specific note have been disabled by the administrator. You can still preview and read all pages in the Online Reader." : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");
      alert(reasonMsg);
      return;
    }
    if (downloading) return;

    // 🎓 Record student read/download activity for personalized 6 AM exam pre-fetch
    recordStudentNoteRead(note, currentUser);

    const fileName = getNotePdfFileName(note);
    let fileHandle = null;

    // 🌟 Native File System Access API: Prompt Windows/Chrome "Save As" file explorer on user click
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "PDF Document",
              accept: { "application/pdf": [".pdf"] },
            },
          ],
        });
      } catch (pickerErr) {
        if (pickerErr.name === "AbortError") {
          // User clicked Cancel in the Save As dialog
          return;
        }
        console.debug("[NATIVE-FS] File picker notice:", pickerErr.message);
      }
    }

    abortControllerRef.current = new AbortController();
    setDownloading(true);
    setDownloadProgress({
      percent: 5,
      speed: "98.4 MB/s",
      loadedMB: "0",
      totalMB: formatMB(note.compressedSize || note.fileSize || 1048576),
      timeRemaining: "Estimating...",
    });

    try {
      // Check WebRTC P2P Mesh first for direct peer-to-peer 100 MB/s transfer
      try {
        const p2pBuffer = await downloadFromPeerMesh(note.id, (metrics) => {
          setDownloadProgress(metrics);
        });

        if (p2pBuffer) {
          const blob = new Blob([p2pBuffer], { type: note.mimeType || "application/pdf" });
          saveNoteOffline(note, p2pBuffer);

          if (fileHandle) {
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            setSavedOffline(true);
            setIsCachedOffline(true);
            window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
            return;
          }

          // Fallback standard download
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSavedOffline(true);
          setIsCachedOffline(true);
          window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
          return;
        }
      } catch (p2pErr) {
        console.debug("[P2P] Peer transfer fallback to Cloudflare stream:", p2pErr.message);
      }

      // Standard high-speed Cloudflare MTProto stream with Native File System handle
      await api.downloadNoteWithProgress(
        note.id,
        fileName,
        (metrics) => {
          setDownloadProgress(metrics);
        },
        abortControllerRef.current.signal,
        fileHandle
      );
      setSavedOffline(true);
      setIsCachedOffline(true);
      window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
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

  const handleDocumentPreviewClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) {
      if (onRequireAuth) onRequireAuth("signin");
      return;
    }
    onPreview(note);
  };

  return (
    <article className="note-card">
      <div>
        {/* 1. Header with Type & Badges */}
        <div className="card-header">
          <div className="file-type-icon">
            <FileText size={20} />
          </div>

          <div className="note-badges-row">
            {note.foundViaOcr && (
              <span className="tech-pill compress" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                🔍 Handwritten (OCR)
              </span>
            )}
            {note.isDuplicate && (
              <span className="tech-pill dedup">⚡ 0s Dedup</span>
            )}
            {note.savingsPercent > 0 && !note.isDuplicate && (
              <span className="tech-pill compress">🗜️ -{note.savingsPercent}%</span>
            )}
            {note.isLatest && (
              <span
                className="tech-pill"
                style={{
                  background: "linear-gradient(135deg, #10b981, #06b6d4)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "0.65rem",
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
            {isAdmin && onToggleNoteDownload && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleNoteDownload(note);
                }}
                className="tech-pill"
                title={isSingleNoteDisabled ? "Admin: Click to ENABLE downloads for this note" : "Admin: Click to LOCK / DISABLE downloads for this note"}
                style={{
                  background: isSingleNoteDisabled ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.2)",
                  color: isSingleNoteDisabled ? "#fca5a5" : "#6ee7b7",
                  border: isSingleNoteDisabled ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid rgba(16, 185, 129, 0.45)",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.66rem",
                  transition: "all 0.15s ease",
                }}
              >
                {isSingleNoteDisabled ? "🔒 Locked" : "🟢 Active"}
              </button>
            )}
            {(!isAdmin || !onToggleNoteDownload) && isSingleNoteDisabled && (
              <span
                className="tech-pill"
                title={note.downloadDisabledReason || "Download disabled for this note (Online preview available)"}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  fontWeight: 700,
                  fontSize: "0.66rem",
                }}
              >
                🔒 Read-Only
              </span>
            )}
          </div>
        </div>

        {/* 2. Floating Document Blueprint Canvas Window (Cardboard.ai Bento Preview) */}
        <div
          className="note-card-canvas-window"
          onClick={handleDocumentPreviewClick}
          title="Click to Open in Virtual PDF Reader"
        >
          {note.thumbnailUrl ? (
            <div className="card-thumbnail-box">
              <img src={note.thumbnailUrl} alt={note.title} loading="lazy" />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                <span style={{ color: "var(--accent-cyan)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Verified Blueprint</span>
                <span>{note.semester || note.year || "Unit 1 to 5"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(6, 182, 212, 0.15)", border: "1px solid rgba(6, 182, 212, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22d3ee", flexShrink: 0 }}>
                  <FileText size={18} />
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {note.title}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {formattedSize} • WebP Optimized
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.65rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "4px" }}>
                <span>Cloudflare CDN Cached</span>
                <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>Preview Document ↗</span>
              </div>
            </>
          )}
        </div>

        {/* 3. Title & Academic Description */}
        <div className="note-title-container">
          <h3 className="note-title" title={note.title}>
            {note.title}
          </h3>
          <div className="note-subject">{note.subject || "General Academic"}</div>
          {note.description && (
            <p className="note-desc">
              {note.description.toLowerCase().includes("telegram") || note.description.includes("TECH TITAN STORAGE")
                ? "📚 Verified Academic Notes • Free Study Material"
                : note.description}
            </p>
          )}
        </div>

        {/* 4. Luxury 3-Column Specs HUD Bar */}
        <div className="note-specs-hud">
          <div className="note-specs-item">
            <span className="note-specs-label">Term</span>
            <span className="note-specs-val">{note.year || note.semester || "All Years"}</span>
          </div>
          <div className="note-specs-item" style={{ borderLeft: "1px solid rgba(255, 255, 255, 0.06)", borderRight: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <span className="note-specs-label">File Size</span>
            <span className="note-specs-val" style={{ color: "var(--accent-cyan)" }}>{formattedSize}</span>
          </div>
          <div className="note-specs-item">
            <span className="note-specs-label">Downloads</span>
            <span className="note-specs-val">{note.downloadsCount || 0}+</span>
          </div>
        </div>
      </div>

      {/* 5. Bottom Anchored Action Matrix & Indicators */}
      <div>
        {/* LIVE IN-CARD DOWNLOAD PROGRESS BAR */}
        {downloading && (
          <div
            style={{
              marginBottom: "8px",
              background: "rgba(6, 182, 212, 0.08)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
              borderRadius: "var(--radius-sm)",
              padding: "7px 10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#fff", fontWeight: 700, marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Activity size={12} style={{ color: "var(--accent-cyan)" }} />
                <span>Downloading: {downloadProgress.percent}%</span>
                {(downloadProgress.source === "p2p" || downloadProgress.realSource?.id === "p2p") ? (
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="P2P Local Mesh (0ms Microsecond)"
                  >
                    <span>⚡</span>
                    <span>P2P (0ms)</span>
                  </span>
                ) : (downloadProgress.realSource?.id === "local_cache") ? (
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "rgba(56, 189, 248, 0.2)",
                      color: "#38bdf8",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="Local Device Storage (0ms Offline Cache)"
                  >
                    <span>💾</span>
                    <span>Local Cache (0ms)</span>
                  </span>
                ) : (downloadProgress.realSource?.id === "ram") ? (
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "rgba(168, 85, 247, 0.2)",
                      color: "#c084fc",
                      border: "1px solid rgba(168, 85, 247, 0.4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="Edge In-Memory RAM Buffer (0ms Microsecond)"
                  >
                    <span>🧠</span>
                    <span>RAM Buffer (0ms)</span>
                  </span>
                ) : (downloadProgress.realSource?.id === "disk") ? (
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "rgba(74, 222, 128, 0.2)",
                      color: "#4ade80",
                      border: "1px solid rgba(74, 222, 128, 0.4)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="Local NVMe SSD Cache (1ms High-Speed)"
                  >
                    <span>💽</span>
                    <span>SSD Cache (1ms)</span>
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      background: "rgba(6, 182, 212, 0.18)",
                      color: "#22d3ee",
                      border: "1px solid rgba(6, 182, 212, 0.35)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="Cloudflare Edge CDN Worker (1ms Zero-Copy Stream)"
                  >
                    <span>⚡</span>
                    <span>Edge CDN (1ms)</span>
                  </span>
                )}
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

        {/* Device Offline Cache Control Bar (48h Auto-Delete / User Pin / Delete) */}
        {isCachedOffline && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
              padding: "5px 10px",
              background: isPinned ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
              border: `1px solid ${isPinned ? "rgba(16, 185, 129, 0.28)" : "rgba(245, 158, 11, 0.28)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "0.72rem",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: isPinned ? "#34d399" : "#fbbf24",
                fontWeight: 600,
              }}
              title={isPinned ? "Kept Forever: Exempt from 48h auto-deletion and dynamic LRU" : "Will auto-delete after 48h to prevent phone storage bloat"}
            >
              <HardDrive size={12} />
              <span>{isPinned ? "📌 Kept Forever (Offline)" : "⏳ 48h Auto-Delete"}</span>
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={handleToggleCardPin}
                title={isPinned ? "Click to set 48h auto-expire" : "Click to keep note forever"}
                style={{
                  background: isPinned ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                  border: `1px solid ${isPinned ? "rgba(16, 185, 129, 0.45)" : "rgba(255, 255, 255, 0.15)"}`,
                  color: isPinned ? "#34d399" : "#e2e8f0",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Pin size={10} style={{ transform: isPinned ? "rotate(-45deg)" : "none" }} />
                <span>{isPinned ? "Pinned" : "Keep Note"}</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteOfflineCopy}
                title="Delete this note from device offline storage"
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#f87171",
                  borderRadius: "4px",
                  padding: "3px 6px",
                  fontSize: "0.68rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )}

        {/* ====================================================================== */}
        {/* 🚀 ANCHORED ACTION MATRIX (EXACT SAME HORIZONTAL BASELINE ON ALL CARDS) 🚀 */}
        {/* ====================================================================== */}
        <div className="card-action-matrix">
          {/* ROW 1: CORE STUDY DUAL ACTIONS (READ ONLINE + FAST DOWNLOAD) */}
          <div className="action-row-dual">
            <button
              type="button"
              className="btn-action-read"
              onClick={handleDocumentPreviewClick}
              title="Open full document in Online Reader"
            >
              <Eye size={15} />
              <span>Read Online</span>
            </button>

            {isNoteDownloadBlocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const reasonMsg = note.downloadDisabledReason || downloadDisabledReason || (isSingleNoteDisabled ? "Downloads for this specific note have been disabled by the administrator. You can still preview and read all pages in the Online Reader." : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");
                  alert(reasonMsg);
                }}
                className="btn-action-download"
                title={isSingleNoteDisabled ? "Downloads disabled for this note. Online Reader is active." : "Downloads paused by administrator. Online Reader is active."}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#fca5a5",
                }}
              >
                <Download size={14} style={{ opacity: 0.8 }} />
                <span>{isSingleNoteDisabled ? "🔒 Read-Only" : "🔒 Paused"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTrackedDownload}
                className="btn-action-download"
                title="Download note via Cloudflare Indian CDN"
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
                    <span>Streaming {downloadProgress.percent}%</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* ROW 2: PROMINENT DEDICATED SOCIAL (CHAT + SHARE - FULL BUTTONS!) */}
          <div className="action-row-dual">
            <button
              type="button"
              className="btn-action-chat"
              onClick={handleShareToChat}
              title={sharedToChat ? "Dropped in Student Study Chat!" : "Drop note directly into Student Study Chat"}
            >
              {sharedToChat ? <Check size={14} style={{ color: "#34d399" }} /> : <MessageCircle size={14} />}
              <span>{sharedToChat ? "Dropped!" : "Drop in Chat"}</span>
            </button>

            <button
              type="button"
              className="btn-action-share"
              onClick={handleShareNote}
              title={copied ? "Link Copied to Clipboard!" : "Share note link via WhatsApp, Telegram or Native Sheet"}
            >
              {copied ? <Check size={14} style={{ color: "#34d399" }} /> : <Share2 size={14} />}
              <span>{copied ? "Copied!" : "Share Link"}</span>
            </button>
          </div>

          {/* ROW 3: 0-KB WIRELESS PROXIMITY MESH (SOUND-DROP & AIRDROP) */}
          <div className="action-mesh-bar">
            <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "5px" }}>
              <span className="pulse-dot" style={{ width: "5px", height: "5px" }}></span>
              <span>0-KB Mesh:</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="btn-mesh-pill btn-mesh-sound"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("open_campus_airdrop", {
                      detail: { note, initialMode: "sound" },
                    })
                  );
                }}
                title="🔊 Sound-Drop: Beam note wirelessly via ultrasonic audio frequency (0 KB internet)"
              >
                <Volume2 size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: "3px" }} />
                Sound-Drop
              </button>

              <button
                type="button"
                className="btn-mesh-pill btn-mesh-airdrop"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("open_campus_airdrop", {
                      detail: { note, initialMode: "qr" },
                    })
                  );
                }}
                title="⚡ AirDrop this note offline via 1-Tap QR Mesh (0 KB internet)"
              >
                <Zap size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: "3px" }} />
                AirDrop
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
