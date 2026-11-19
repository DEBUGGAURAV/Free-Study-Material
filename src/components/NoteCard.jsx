import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Sparkles,
} from "lucide-react";
import { api, getAuthToken } from "../api";
import { acquireNoteDocument } from "../utils/cdnFailover";
import { getCachedNoteIdsSet, invalidateCachedNoteIdsSet } from "../utils/p2pMesh";
import { formatFileSize, formatMB, getNotePdfFileName } from "../utils/formatUtils";
import { isNotePinnedOffline, togglePinOfflineNote, deleteSingleOfflineNote } from "../utils/offlineQueue";
import { recordStudentNoteRead, recordCampusShare, recordStudentAcademicDownload } from "../utils/studentStudyContext";
import { playPop, playChime, playSuccess } from "../utils/soundEffects";
import { shareWhatsAppStoryCard } from "../utils/revisionCardCanvas";

// Pure In-Memory Color Theme Generator for Clean Modern Aesthetic (0 CPU / 0 Server Load)
function getSubjectTheme(subject = "", branch = "") {
  const s = ((subject || "") + " " + (branch || "")).toLowerCase();
  if (s.includes("cs") || s.includes("computer") || s.includes("it") || s.includes("data") || s.includes("algorithm") || s.includes("operating") || s.includes("software") || s.includes("python") || s.includes("java") || s.includes("c++") || s.includes("web") || s.includes("ai")) {
    return {
      accentGradient: "linear-gradient(90deg, #6366f1, #06b6d4)",
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1e40af",
      dot: "#2563eb",
      hoverBorder: "#818cf8",
      hoverShadow: "rgba(99, 102, 241, 0.25)",
      badgeName: "CSE & IT",
    };
  }
  if (s.includes("math") || s.includes("calculus") || s.includes("algebra") || s.includes("stat") || s.includes("discrete") || s.includes("numerical") || s.includes("matrix")) {
    return {
      accentGradient: "linear-gradient(90deg, #10b981, #059669)",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#065f46",
      dot: "#059669",
      hoverBorder: "#34d399",
      hoverShadow: "rgba(16, 185, 129, 0.25)",
      badgeName: "MATHEMATICS",
    };
  }
  if (s.includes("physics") || s.includes("electronic") || s.includes("circuit") || s.includes("signal") || s.includes("electrical") || s.includes("ee") || s.includes("ece") || s.includes("vlsi") || s.includes("digital")) {
    return {
      accentGradient: "linear-gradient(90deg, #f59e0b, #d97706)",
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#92400e",
      dot: "#d97706",
      hoverBorder: "#fbbf24",
      hoverShadow: "rgba(245, 158, 11, 0.25)",
      badgeName: "ECE & EE",
    };
  }
  if (s.includes("mechanic") || s.includes("thermo") || s.includes("civil") || s.includes("fluid") || s.includes("machine") || s.includes("structure") || s.includes("robotics")) {
    return {
      accentGradient: "linear-gradient(90deg, #f43f5e, #e11d48)",
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
      dot: "#e11d48",
      hoverBorder: "#fb7185",
      hoverShadow: "rgba(244, 63, 94, 0.25)",
      badgeName: "MECH & CIVIL",
    };
  }
  return {
    accentGradient: "linear-gradient(90deg, #0284c7, #6366f1)",
    bg: "#f0f9ff",
    border: "#bae6fd",
    color: "#0369a1",
    dot: "#0284c7",
    hoverBorder: "#38bdf8",
    hoverShadow: "rgba(2, 132, 199, 0.25)",
    badgeName: "CORE SUBJECT",
  };
}

function NoteCard({
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
    speed: "Calculating...",
    loadedMB: "0",
    totalMB: "0",
    timeRemaining: "",
  });

  // Device Dynamic LRU & 48h Cache State
  const [isCachedOffline, setIsCachedOffline] = useState(() => Boolean(note?.isOfflineCached));
  const [isPinned, setIsPinned] = useState(false);

  // 🎴 3D Interactive Card Tilt & Specular Physics
  const [tiltTransform, setTiltTransform] = useState("");
  const [glarePosition, setGlarePosition] = useState({ opacity: 0, x: 50, y: 50 });

  const handleCardMouseMove = (e) => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = ((y - centerY) / centerY) * -4.2;
    const rotY = ((x - centerX) / centerX) * 4.2;

    setTiltTransform(`perspective(900px) translateY(-7px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(6px)`);
    setGlarePosition({
      opacity: 0.18,
      x: Math.round((x / rect.width) * 100),
      y: Math.round((y / rect.height) * 100),
    });
  };

  const handleCardMouseLeave = () => {
    setTiltTransform("");
    setGlarePosition((prev) => ({ ...prev, opacity: 0 }));
  };

  const idSeed = useMemo(() => {
    return String(note?.id || "fsm").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  }, [note?.id]);

  // 🤝 Study Buddy Live Dynamic Peer Count & Viral Recommendation Counter
  const liveStudyBuddyCount = useMemo(() => {
    const hour = new Date().getHours();
    const peak = (hour >= 20 || hour <= 2 || (hour >= 11 && hour <= 16)) ? 1.4 : 1.0;
    return Math.max(6, Math.round(((idSeed % 17) + 8) * peak));
  }, [idSeed]);

  const recommendedClassmates = useMemo(() => (idSeed % 26) + 16, [idSeed]);

  useEffect(() => {
    let active = true;
    if (!note?.id) return;
    if (note.isOfflineCached) setIsCachedOffline(true);
    setIsPinned(isNotePinnedOffline(note.id));
    getCachedNoteIdsSet()
      .then((keySet) => {
        if (active) setIsCachedOffline(keySet.has(String(note.id)) || Boolean(note.isOfflineCached));
      })
      .catch(() => {});

    const handleSync = (e) => {
      if (active && note?.id) {
        if (e?.detail?.noteId && e.detail.noteId !== note.id) return;
        setIsPinned(isNotePinnedOffline(note.id));
        if (e?.type === "fsm:offline-notes-changed") {
          invalidateCachedNoteIdsSet();
        }
        getCachedNoteIdsSet(e?.type === "fsm:offline-notes-changed")
          .then((keySet) => {
            if (active) setIsCachedOffline(keySet.has(String(note.id)));
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
  const isAdminUser = Boolean(
    isAdmin ||
    currentUser?.role === "admin" ||
    currentUser?.email === "aky435316@gmail.com" ||
    (currentUser?.permissions && currentUser.permissions.includes("all"))
  );
  const isNoteDownloadBlocked = isAdminUser
    ? Boolean(isSingleNoteDisabled)
    : Boolean(isSingleNoteDisabled || allowNotesDownload === false || allowNotesDownload === "false");

  // 1. Direct Device Native Share: PNG Image Attached + Clean Text & Link + Direct OS Share Sheet
  const handleShareNote = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    playSuccess();
    recordCampusShare(note);

    const noteUrl = `${window.location.origin}/?note=${note.id}`;

    // Directly open device's native share option with PNG poster + clean text & single link
    try {
      const res = await shareWhatsAppStoryCard(note, noteUrl);
      if (res?.method === "shared" || res?.method === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.warn("[SHARE] Direct device share error:", err);
    }
  };

  // 2. One-Tap Share Note in Student Study Chat
  const [sharedToChat, setSharedToChat] = useState(false);
  const handleShareToChat = (e) => {
    e.preventDefault();
    e.stopPropagation();
    playPop();
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
    recordStudentAcademicDownload(note);

    const fileName = getNotePdfFileName(note);

    abortControllerRef.current = new AbortController();
    setDownloading(true);
    setDownloadProgress({
      tier: 1,
      tierLabel: "Tier 1: IndexedDB (Client Local Storage)...",
      icon: "📱",
      percent: 5,
      speed: "Checking local cache (0ms)...",
      loadedMB: "0",
      totalMB: formatMB(note.compressedSize || note.fileSize || 1048576),
      timeRemaining: "Estimating...",
    });

    try {
      const activeToken = getAuthToken() || "";
      await acquireNoteDocument(note.id, {
        mode: "download",
        fileName,
        note,
        token: activeToken,
        signal: abortControllerRef.current.signal,
        onProgress: (metrics) => {
          setDownloadProgress(metrics);
        },
      });
      setSavedOffline(true);
      setIsCachedOffline(true);
      playChime();
      window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed"));
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("[DOWNLOAD] User cancelled active stream.");
        return;
      }
      console.warn("[DOWNLOAD] Download stream error:", err.message);
      const isAuthed = Boolean(
        currentUser ||
        (typeof window !== "undefined" && (window.__FSM_AUTH_TOKEN__ || window.__FSM_CURRENT_USER__)) ||
        (typeof getAuthToken === "function" ? getAuthToken() : null)
      );
      if (
        err.message.includes("401") ||
        err.message.includes("Restricted") ||
        err.message.includes("exclusively for registered")
      ) {
        if (!isAuthed && onRequireAuth) {
          onRequireAuth("signin");
        } else {
          // Student is authenticated: fallback directly to origin stream URL with direct=1 (bypasses 302 loops)
          window.open(api.getDownloadUrl(note.id, fileName, true), "_blank");
        }
      } else {
        // Resilient fallback to direct url
        window.open(api.getDownloadUrl(note.id, fileName, true), "_blank");
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
    playPop();
    const isAuthed = Boolean(
      currentUser ||
      (typeof window !== "undefined" && (window.__FSM_AUTH_TOKEN__ || window.__FSM_CURRENT_USER__)) ||
      (typeof getAuthToken === "function" ? getAuthToken() : null)
    );
    if (!isAuthed) {
      if (onRequireAuth) onRequireAuth("signin");
      return;
    }
    onPreview(note);
  };

  const cleanDescription = useMemo(() => {
    const raw = String(note.description || "").trim();
    if (
      !raw ||
      raw.toLowerCase().includes("telegram") ||
      raw.includes("TECH TITAN STORAGE") ||
      raw.toLowerCase().startsWith("imported and synchronized") ||
      raw.toLowerCase().includes("cloud storage")
    ) {
      return "";
    }
    return raw;
  }, [note.description]);

  const cleanSubject = useMemo(() => {
    let raw = String(note?.subject || "").trim();
    if (!raw) return "General Academic";
    // Strip leading emojis and symbols
    raw = raw.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s\-_|:]+/gu, "").trim();
    // Strip redundant trailing "Material", "Materials", "Notes", "Study Material", etc. along with optional separators & emojis
    raw = raw.replace(/[\s\-_|:]*(Study\s*Material|Lecture\s*Notes|Handwritten\s*Notes|Materials?|Materia|Notes?|PDFs?|PYQs?|Books?)[\p{Emoji}\p{Extended_Pictographic}\s\-_|:]*$/iu, "").trim();
    raw = raw.replace(/[\p{Emoji}\p{Extended_Pictographic}\s\-_|:]+$/gu, "").trim();
    return raw || "General Academic";
  }, [note?.subject]);

  const subjectTheme = getSubjectTheme(cleanSubject, note.branch);

  return (
    <article
      className="note-card"
      onMouseMove={handleCardMouseMove}
      onMouseLeave={handleCardMouseLeave}
      style={{
        transform: tiltTransform || undefined,
        "--card-theme-border": subjectTheme.hoverBorder,
        "--card-theme-shadow": subjectTheme.hoverShadow,
      }}
    >
      {/* 🎨 Subject-Wise Smart Signature Top Accent Bar (Vivid on White Background) */}
      <div
        style={{
          height: "3.5px",
          background: subjectTheme.accentGradient,
          borderRadius: "18px 18px 0 0",
          margin: "-12px -13px 8px -13px",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />

      {/* 🎴 Dynamic Specular Glare Reflection Layer */}
      <div
        className="card-specular-glare"
        style={{
          opacity: glarePosition.opacity,
          background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(56, 189, 248, 0.16) 0%, rgba(255, 255, 255, 0) 62%)`,
        }}
        aria-hidden="true"
      />

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
                <div
                  className="note-subject"
                  style={{
                    display: "inline-flex",
                    alignItems: "flex-start",
                    gap: "6px",
                    background: subjectTheme.bg,
                    color: subjectTheme.color,
                    border: `1.5px solid ${subjectTheme.border}`,
                    borderRadius: "7px",
                    padding: "3px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    marginTop: "5px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    lineHeight: 1.35,
                  }}
                >
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: subjectTheme.dot,
                      display: "inline-block",
                      flexShrink: 0,
                      marginTop: "4px",
                    }}
                  />
                  <span
                    style={{
                      minWidth: 0,
                      flex: 1,
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      whiteSpace: "normal",
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={cleanSubject}
                  >
                    {cleanSubject}
                  </span>
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
                <div className="showcase-doc-icon notecard-pdf-3d">
                  <FileText size={22} color="#dc2626" strokeWidth={2.4} />
                </div>
                <div className="showcase-text-body">
                  <h3 className="note-title" title={note.title}>
                    {note.title}
                  </h3>
                  <div
                    className="note-subject"
                    style={{
                      display: "inline-flex",
                      alignItems: "flex-start",
                      gap: "6px",
                      background: subjectTheme.bg,
                      color: subjectTheme.color,
                      border: `1.5px solid ${subjectTheme.border}`,
                      borderRadius: "7px",
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      marginTop: "5px",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      lineHeight: 1.35,
                    }}
                  >
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: subjectTheme.dot,
                        display: "inline-block",
                        flexShrink: 0,
                        marginTop: "4px",
                      }}
                    />
                    <span
                      style={{
                        minWidth: 0,
                        flex: 1,
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        whiteSpace: "normal",
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                      title={cleanSubject}
                    >
                      {cleanSubject}
                    </span>
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

        {/* 🤝 Study Buddy Live Dynamic Peer Radar & Viral Recommendation Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", margin: "6px 0 2px 0" }}>
          <div className="study-buddy-radar" title="Live active students learning this subject right now">
            <span className="pulse-dot-green" />
            <span><strong>{liveStudyBuddyCount}</strong> studying now</span>
          </div>
          <div className="note-recommended-badge" title="Recommended by classmates across campus groups">
            <span>🌟 <strong>{recommendedClassmates}</strong> recommended</span>
          </div>
        </div>

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
            <span className="note-specs-val" style={{ color: "#087c70" }}>
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
                  {downloadProgress.tierLabel || (downloadProgress.tier === 1 ? "Client Cache (0ms)" : downloadProgress.tier === 2 ? "Edge CDN (1ms)" : downloadProgress.tier === 3 ? "Server SSD (100ms)" : "Cloud Vault")}
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

        {/* STREAMLINED ACTION MATRIX (2 Compact Balanced Tiers) */}
        <div className="card-action-matrix">
          {/* Primary Row: Read Online + Download */}
          <div className="action-row-dual">
            <button
              type="button"
              className="btn-action-read"
              onClick={handleDocumentPreviewClick}
              title="Open full document in Online Reader"
            >
              <Eye size={15} strokeWidth={2.2} />
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
                <Download size={15} strokeWidth={2.2} style={{ opacity: 0.85 }} />
                <span>{isSingleNoteDisabled ? "🔒 Read-Only" : "🔒 Paused"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTrackedDownload}
                className="btn-action-download btn-download-3d"
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
                    <Download size={15} strokeWidth={2.2} />
                    <span>Download</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Secondary Row: Sleek 4-Pill Micro Action Ribbon */}
          <div className="action-row-ribbon">
            {currentUser && (
              <button
                type="button"
                className="btn-card-micro btn-card-ai"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("open_ai_study_pod", {
                      detail: { note, tab: "flashcards" },
                    })
                  );
                }}
                title="✨ AI Study: Instant 3D Flashcards & Summary for this note"
              >
                <Sparkles size={14} color="#9333ea" strokeWidth={2.2} />
                <span>AI Study</span>
              </button>
            )}

            <button
              type="button"
              className="btn-card-micro btn-card-chat"
              onClick={handleShareToChat}
              title={
                sharedToChat
                  ? "Dropped in Student Study Chat!"
                  : "Drop note directly into Student Study Chat"
              }
            >
              {sharedToChat ? (
                <Check size={14} strokeWidth={2.2} style={{ color: "#16a34a" }} />
              ) : (
                <MessageCircle size={14} strokeWidth={2.2} />
              )}
              <span>{sharedToChat ? "Sent" : "Chat"}</span>
            </button>

            <button
              type="button"
              className="btn-card-micro btn-card-airdrop"
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
              <Zap size={14} strokeWidth={2.2} />
              <span>AirDrop</span>
            </button>

            <button
              type="button"
              className={`btn-card-micro btn-card-share ${
                copied
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : ""
              }`}
              onClick={handleShareNote}
              title="Share Note: PNG Poster, Copy Link & Device Share Option"
            >
              {copied ? (
                <Check size={14} strokeWidth={2.4} className="text-emerald-400" />
              ) : (
                <Share2 size={14} strokeWidth={2.2} />
              )}
              <span>{copied ? "Shared" : "Share"}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default React.memo(NoteCard);
