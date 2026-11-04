import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Download,
  Eye,
  Share2,
  Check,
  Activity,
  HardDrive,
  MessageCircle,
  Pin,
  Trash2,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import { api } from "../api";
import { acquireNoteDocument } from "../utils/cdnFailover";
import { downloadFromPeerMesh, getCachedNoteBuffer } from "../utils/p2pMesh";
import { formatFileSize, formatMB, getNotePdfFileName } from "../utils/formatUtils";
import {
  saveNoteOffline,
  isNotePinnedOffline,
  togglePinOfflineNote,
  deleteSingleOfflineNote,
  getAnyCachedNoteBuffer,
} from "../utils/offlineQueue";
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
  const [, setSavedOffline] = useState(false);
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
    window.dispatchEvent(
      new CustomEvent("fsm:pinned-notes-changed", {
        detail: { noteId: note.id, isPinned: nextPinned },
      })
    );
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

  const isSingleNoteDisabled =
    note?.allowDownload === false ||
    note?.allowDownload === "false" ||
    note?.allowDownload === 0 ||
    note?.allowDownload === "0";
  const isNoteDownloadBlocked = Boolean(
    isSingleNoteDisabled || !allowNotesDownload || allowNotesDownload === "false"
  );

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

    try {
      await navigator.clipboard.writeText(`${shareData.text} ${noteUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      window.open(
        `https://api.whatsapp.com/send?text=${encodeURIComponent(shareData.text + " " + noteUrl)}`,
        "_blank"
      );
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
      const reasonMsg =
        note.downloadDisabledReason ||
        downloadDisabledReason ||
        (isSingleNoteDisabled
          ? "Downloads for this specific note have been disabled by the administrator. You can still preview and read all pages in the Online Reader."
          : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");
      alert(reasonMsg);
      return;
    }
    if (downloading) return;

    recordStudentNoteRead(note, currentUser);

    const fileName = getNotePdfFileName(note);

    abortControllerRef.current = new AbortController();
    setDownloading(true);
    setDownloadProgress({
      tier: 1,
      tierLabel: "Checking Local Device Storage (IndexedDB)...",
      icon: "📱",
      percent: 5,
      speed: "Checking local cache...",
      loadedMB: "0",
      totalMB: formatMB(note.compressedSize || note.fileSize || 1048576),
      timeRemaining: "Estimating...",
    });

    try {
      await acquireNoteDocument(note.id, {
        mode: "download",
        fileName,
        note,
        signal: abortControllerRef.current.signal,
        onProgress: (metrics) => {
          setDownloadProgress(metrics);
        },
      });
      setSavedOffline(true);
      setIsCachedOffline(true);
      window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("[DOWNLOAD] User cancelled active stream.");
        return;
      }
      console.warn("[DOWNLOAD] Download stream error:", err.message);
      if (
        err.message.includes("401") ||
        err.message.includes("Restricted") ||
        err.message.includes("exclusively for registered")
      ) {
        if (onRequireAuth) onRequireAuth("signin");
      } else {
        // Fallback to direct url
        window.open(api.getDownloadUrl(note.id, fileName), "_blank");
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

  const cleanDescription = note.description
    ? note.description.toLowerCase().includes("telegram") ||
      note.description.includes("TECH TITAN STORAGE")
      ? "📚 Verified Academic Notes • Free Study Material"
      : note.description
    : "";

  return (
    <article className="note-card">
      {/* UPPER CONTENT FLOW (Natural tight rhythm — zero artificial dead gap!) */}
      <div className="note-card-top">
        {/* 1. Top Metadata & Admin Status Strip */}
        <div className="card-header">
          <div className="note-badges-row">
            {note.isLatest && (
              <span className="tech-pill pill-latest-glow">✨ LATEST</span>
            )}
            {note.course && (
              <span className="tech-pill pill-course">{note.course}</span>
            )}
            {note.branch && (
              <span className="tech-pill branch">{note.branch}</span>
            )}
            {note.foundViaOcr && (
              <span className="tech-pill compress">🔍 OCR</span>
            )}
            {note.isDuplicate && (
              <span className="tech-pill dedup">⚡ Dedup</span>
            )}
            {note.savingsPercent > 0 && !note.isDuplicate && (
              <span className="tech-pill compress">🗜️ -{note.savingsPercent}%</span>
            )}
          </div>

          {/* Admin Quick Lock / Read-Only Pill (Image 1 Refined Status) */}
          <div className="card-header-status">
            {isAdmin && onToggleNoteDownload && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleNoteDownload(note);
                }}
                className={`admin-status-toggle ${isSingleNoteDisabled ? "locked" : "active"}`}
                title={
                  isSingleNoteDisabled
                    ? "Admin: Click to ENABLE downloads for this note"
                    : "Admin: Click to LOCK / DISABLE downloads for this note"
                }
              >
                <span className={`status-dot ${isSingleNoteDisabled ? "locked" : "active"}`} />
                <span>{isSingleNoteDisabled ? "Locked" : "Active"}</span>
              </button>
            )}
            {(!isAdmin || !onToggleNoteDownload) && isSingleNoteDisabled && (
              <span
                className="pill-readonly"
                title={
                  note.downloadDisabledReason ||
                  "Download disabled for this note (Online preview available)"
                }
              >
                <span className="status-dot locked" />
                <span>Read-Only</span>
              </span>
            )}
          </div>
        </div>

        {/* 2. Unified Interactive Document Showcase (No Duplicate Title, Clickable Preview) */}
        <div
          className="note-showcase-box"
          onClick={handleDocumentPreviewClick}
          title="Click to Open in Virtual PDF Reader"
        >
          {note.thumbnailUrl ? (
            <>
              <div className="card-thumbnail-box">
                <img src={note.thumbnailUrl} alt={note.title} loading="lazy" />
                <span className="thumbnail-preview-chip">
                  Preview <ArrowUpRight size={12} />
                </span>
              </div>
              <div className="showcase-text-body" style={{ marginTop: "8px" }}>
                <h3 className="note-title" title={note.title}>
                  {note.title}
                </h3>
                <div className="note-subject">
                  {note.subject || "General Academic"}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="showcase-top-meta">
                <span className="showcase-verified-tag">📄 VERIFIED PDF</span>
                <span className="showcase-preview-cta">
                  Preview <ArrowUpRight size={12} />
                </span>
              </div>
              <div className="showcase-doc-row">
                <div className="showcase-doc-icon">
                  <FileText size={20} />
                </div>
                <div className="showcase-text-body">
                  <h3 className="note-title" title={note.title}>
                    {note.title}
                  </h3>
                  <div className="note-subject">
                    {note.subject || "General Academic"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 3. Unclipped Clean Description */}
        {cleanDescription && (
          <p className="note-desc" title={cleanDescription}>
            {cleanDescription}
          </p>
        )}

        {/* 4. Crisp 3-Column Specs Strip */}
        <div className="note-specs-hud">
          <div className="note-specs-item">
            <span className="note-specs-label">Term</span>
            <span className="note-specs-val">
              {note.year || note.semester || "All Years"}
            </span>
          </div>
          <div className="note-specs-item specs-divider">
            <span className="note-specs-label">File Size</span>
            <span className="note-specs-val" style={{ color: "var(--accent-cyan)" }}>
              {formattedSize}
            </span>
          </div>
          <div className="note-specs-item">
            <span className="note-specs-label">Downloads</span>
            <span className="note-specs-val">{note.downloadsCount || 0}+</span>
          </div>
        </div>
      </div>

      {/* LOWER ANCHORED SECTION (Progress + Offline Control + Action Buttons) */}
      <div className="note-card-bottom">
        {/* LIVE IN-CARD DOWNLOAD PROGRESS BAR */}
        {downloading && downloadProgress && (
          <div className="note-live-progress-box">
            <div className="progress-top-row">
              <span className="progress-status-left">
                <Activity size={12} style={{ color: "var(--accent-cyan)" }} />
                <span>{downloadProgress.percent}%</span>
                <span
                  className={`source-mini-tag tag-${downloadProgress.tier === 1 ? "ram" : downloadProgress.tier === 2 ? "worker" : downloadProgress.tier === 3 ? "disk" : "storage"}`}
                  title={downloadProgress.tierLabel || "Waterfall Pipeline"}
                >
                  {downloadProgress.icon || "⚡"}{" "}
                  {downloadProgress.tierLabel || (downloadProgress.source === "storage" ? "Cloud Vault" : "Local Server")}
                </span>
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "var(--accent-cyan)", fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>
                  {downloadProgress.speed}
                </span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="btn-cancel-dl"
                  title="Cancel Download"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="progress-track-bar">
              <div
                className="progress-track-fill"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>

            <div className="progress-sub-row">
              <span>
                {downloadProgress.loadedMB} / {downloadProgress.totalMB} MB
              </span>
              <span>{downloadProgress.timeRemaining}</span>
            </div>
          </div>
        )}

        {/* Device Offline Cache Control Bar (Image 2 Luxury Retention Strip) */}
        {isCachedOffline && (
          <div className={`note-offline-bar ${isPinned ? "pinned" : "expiring"}`}>
            <span
              className="offline-bar-label"
              title={
                isPinned
                  ? "Kept Forever: Exempt from 48h auto-deletion and dynamic LRU"
                  : "Will auto-delete after 48h to prevent phone storage bloat"
              }
            >
              <HardDrive size={13} className="offline-icon" />
              <span>{isPinned ? "Kept Offline" : "48h Auto-Delete"}</span>
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <button
                type="button"
                onClick={handleToggleCardPin}
                title={isPinned ? "Click to set 48h auto-expire" : "Click to keep note forever"}
                className={`btn-offline-pin ${isPinned ? "active" : ""}`}
              >
                <Pin size={11} style={{ transform: isPinned ? "rotate(-45deg)" : "none" }} />
                <span>{isPinned ? "Pinned" : "Keep Note"}</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteOfflineCopy}
                title="Delete this note from device offline storage"
                className="btn-offline-trash"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )}

        {/* ANCHORED ACTION MATRIX (All 6 Buttons Cleanly Balanced) */}
        <div className="card-action-matrix">
          {/* Primary Row: Read Online + Download */}
          <div className="action-row-dual">
            <button
              type="button"
              className="btn-action-read"
              onClick={handleDocumentPreviewClick}
              title="Open full document in Online Reader"
            >
              <Eye size={14} />
              <span>Read Online</span>
            </button>

            {isNoteDownloadBlocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const reasonMsg =
                    note.downloadDisabledReason ||
                    downloadDisabledReason ||
                    (isSingleNoteDisabled
                      ? "Downloads for this specific note have been disabled by the administrator. You can still preview and read all pages in the Online Reader."
                      : "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.");
                  alert(reasonMsg);
                }}
                className="btn-action-download blocked"
                title={
                  isSingleNoteDisabled
                    ? "Downloads disabled for this note. Online Reader is active."
                    : "Downloads paused by administrator. Online Reader is active."
                }
              >
                <Download size={14} style={{ opacity: 0.85 }} />
                <span>{isSingleNoteDisabled ? "🔒 Read-Only" : "🔒 Paused"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTrackedDownload}
                className="btn-action-download"
                title="Download note via Local Server"
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <div className="spinner" style={{ width: "14px", height: "14px" }}></div>
                    <span>{downloadProgress?.percent || 0}%</span>
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

          {/* Secondary Row: Drop in Chat + Share Link */}
          <div className="action-row-dual">
            <button
              type="button"
              className="btn-action-chat"
              onClick={handleShareToChat}
              title={
                sharedToChat
                  ? "Dropped in Student Study Chat!"
                  : "Drop note directly into Student Study Chat"
              }
            >
              {sharedToChat ? (
                <Check size={14} style={{ color: "#34d399" }} />
              ) : (
                <MessageCircle size={14} />
              )}
              <span>{sharedToChat ? "Dropped!" : "Drop in Chat"}</span>
            </button>

            <button
              type="button"
              className="btn-action-share"
              onClick={handleShareNote}
              title={
                copied
                  ? "Link Copied to Clipboard!"
                  : "Share note link via WhatsApp, Telegram or Native Sheet"
              }
            >
              {copied ? (
                <Check size={14} style={{ color: "#34d399" }} />
              ) : (
                <Share2 size={14} />
              )}
              <span>{copied ? "Copied!" : "Share Link"}</span>
            </button>
          </div>

          {/* Tertiary Row: Campus AirDrop (1-Tap QR Mesh) */}
          <button
            type="button"
            className="btn-mesh-pill btn-mesh-airdrop"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("open_campus_airdrop", {
                  detail: { note, initialMode: "qr" },
                })
              );
            }}
            title="AirDrop: Beam note offline via 1-Tap QR Mesh"
          >
            <Zap size={14} />
            <span>Campus AirDrop (1-Tap QR)</span>
          </button>
        </div>
      </div>
    </article>
  );
}
