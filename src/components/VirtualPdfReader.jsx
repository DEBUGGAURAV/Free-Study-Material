import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  X,
  Moon,
  Sun,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Download,
  FileText,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cacheNoteBuffer, getCachedNoteBuffer } from "../utils/p2pMesh";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorker ||
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || "6.4.299"}/build/pdf.worker.min.mjs`;
}

export default function VirtualPdfReader({ url, file, title, subject, noteId, note, onClose, onDownload, onOpenAuth }) {
  const canvasRef = useRef(null);
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const mainScrollRef = useRef(null);
  const renderTaskRef = useRef(null);
  const searchMatchesRef = useRef([]);
  const matchIndexRef = useRef(0);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [pageRendering, setPageRendering] = useState(false);
  const [nightMode, setNightMode] = useState(true); // Default to eye-care Dark Mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isAuthGated, setIsAuthGated] = useState(false);
  const [useNativeViewer, setUseNativeViewer] = useState(false);
  const [nativeSrc, setNativeSrc] = useState("");

  // Search inside PDF
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [pageHighlights, setPageHighlights] = useState([]);

  // P2P status
  const [isCachedP2P, setIsCachedP2P] = useState(false);

  // Compute robust native iframe embed source
  useEffect(() => {
    let objectUrl = null;

    if (file) {
      try {
        objectUrl = URL.createObjectURL(file);
        setNativeSrc(objectUrl);
      } catch {}
    } else if (note?.driveLink && !note?.telegramMessageId) {
      let dLink = note.driveLink;
      const match = dLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        dLink = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
      setNativeSrc(dLink);
    } else if (url) {
      let finalUrl = url;
      const token = typeof window !== "undefined" ? localStorage.getItem("vault_token") : null;
      if (token && !finalUrl.includes("token=")) {
        finalUrl += `${finalUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      }
      setNativeSrc(finalUrl);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file, url, note]);

  // Load document on-demand (streaming range requests or local file)
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        // Check if a local file object was passed directly (Instant Preview during Upload)
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          if (!isCancelled) {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const doc = await loadingTask.promise;
            if (!isCancelled) {
              setPdfDoc(doc);
              setNumPages(doc.numPages);
              setLoading(false);
            }
          }
          return;
        }

        // Check if note is a Google Drive link without Telegram storage
        if (note?.driveLink && !note?.telegramMessageId) {
          setUseNativeViewer(true);
          setLoading(false);
          return;
        }

        // Check if note is already cached locally in IndexedDB
        if (noteId) {
          const cachedBuf = await getCachedNoteBuffer(noteId);
          if (cachedBuf && !isCancelled) {
            setIsCachedP2P(true);
            const loadingTask = pdfjsLib.getDocument({ data: cachedBuf });
            const doc = await loadingTask.promise;
            if (!isCancelled) {
              setPdfDoc(doc);
              setNumPages(doc.numPages);
              setLoading(false);
            }
            return;
          }
        }

        // On-demand streaming from server using byte ranges
        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: true,     // Transmit httpOnly session cookie with range requests
          rangeChunkSize: 64 * 1024, // 64KB initial chunk for instantaneous 1st page
          disableAutoFetch: true,     // Don't auto-fetch whole 100MB file!
          disableStream: false,
        });

        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);

          // Asynchronously pre-cache buffer into P2P mesh seeder
          fetch(url, { credentials: "include" })
            .then((r) => r.arrayBuffer())
            .then((buf) => {
              if (noteId) cacheNoteBuffer(noteId, buf);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("[PDF.js Reader] Stream error:", err);
          let errMsg = err.message || "Failed to load document";
          const hasToken = Boolean(localStorage.getItem("vault_token") || localStorage.getItem("vault_user"));
          if (!hasToken || errMsg.includes("401") || errMsg.includes("Restricted") || errMsg.includes("exclusively for registered")) {
            setIsAuthGated(true);
            setLoading(false);
            return;
          }
          if (errMsg.includes("400") || errMsg.includes("Unexpected server response") || errMsg.includes("404") || errMsg.includes("not found")) {
            errMsg = "Document Notice: This file is currently being synced in cloud storage or re-indexed. You can also view it using the Native Browser Engine.";
          }
          setError(errMsg);
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [url, noteId, file, note, reloadTrigger]);

  // Compute bounding boxes for searched text on the active page
  const computeHighlightsForPage = async (
    page,
    viewport,
    pageNum,
    matchesList = searchMatchesRef.current,
    activeIdx = matchIndexRef.current
  ) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setPageHighlights([]);
      return;
    }

    try {
      const textContent = await page.getTextContent();
      const highlights = [];
      let matchCount = 0;

      for (const item of textContent.items) {
        if (!item.str) continue;
        const str = item.str.toLowerCase();
        let idx = 0;

        while ((idx = str.indexOf(query, idx)) !== -1) {
          const itemX = item.transform[4];
          const itemY = item.transform[5];
          const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height || 12;
          const itemWidth = item.width || (fontHeight * 0.6 * item.str.length);

          const p1 = viewport.convertToViewportPoint(itemX, itemY);
          const p2 = viewport.convertToViewportPoint(itemX + itemWidth, itemY);
          const p3 = viewport.convertToViewportPoint(itemX, itemY + fontHeight);
          const p4 = viewport.convertToViewportPoint(itemX + itemWidth, itemY + fontHeight);

          const left = Math.min(p1[0], p2[0], p3[0], p4[0]);
          const right = Math.max(p1[0], p2[0], p3[0], p4[0]);
          const top = Math.min(p1[1], p2[1], p3[1], p4[1]);
          const bottom = Math.max(p1[1], p2[1], p3[1], p4[1]);

          const w = Math.max(1, right - left);
          const h = Math.max(1, bottom - top);

          const strLen = Math.max(1, item.str.length);
          const startRatio = idx / strLen;
          const matchRatio = query.length / strLen;

          const hlLeft = Math.round(left + (w * startRatio));
          const hlWidth = Math.max(8, Math.round(w * matchRatio));
          const hlHeight = Math.max(12, Math.round(h));

          const curMatch = matchesList && matchesList[activeIdx];
          const isActive = Boolean(
            curMatch &&
            curMatch.pageNum === pageNum &&
            curMatch.matchInPageIdx === matchCount
          );

          highlights.push({
            id: `hl-p${pageNum}-m${matchCount}`,
            left: hlLeft,
            top: Math.round(top),
            width: hlWidth,
            height: hlHeight,
            isActive,
            matchInPageIdx: matchCount,
          });

          matchCount++;
          idx += query.length;
        }
      }

      setPageHighlights(highlights);

      // Smoothly scroll document viewport to the active match
      if (highlights.length > 0 && mainScrollRef.current) {
        const activeMatch = highlights.find((h) => h.isActive) || highlights[0];
        if (activeMatch) {
          const targetScroll = Math.max(0, activeMatch.top - 120);
          mainScrollRef.current.scrollTo({ top: targetScroll, behavior: "smooth" });
        }
      }
    } catch (err) {
      console.warn("[PDF HIGHLIGHT] Compute error:", err);
    }
  };

  // Robust Page Renderer: Triggers cleanly on page, scale, or engine change
  useEffect(() => {
    if (!pdfDoc || useNativeViewer) return;

    let isCurrent = true;
    let activeTask = null;

    async function renderCurrentPage() {
      try {
        setPageRendering(true);
        const page = await pdfDoc.getPage(currentPage);
        if (!isCurrent) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        const displayWidth = Math.floor(viewport.width);
        const displayHeight = Math.floor(viewport.height);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        setCanvasDimensions({ width: displayWidth, height: displayHeight });

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        activeTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
        });
        renderTaskRef.current = activeTask;

        await activeTask.promise;
        if (!isCurrent) return;

        // Rendered page successfully! Now compute text highlights
        await computeHighlightsForPage(
          page,
          viewport,
          currentPage,
          searchMatchesRef.current,
          matchIndexRef.current
        );
      } catch (e) {
        if (e.name !== "RenderingCancelledException") {
          console.warn("[PDF.js] Render error:", e.message);
        }
      } finally {
        if (isCurrent) {
          setPageRendering(false);
          renderTaskRef.current = null;
        }
      }
    }

    renderCurrentPage();

    return () => {
      isCurrent = false;
      if (activeTask) {
        try {
          activeTask.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, currentPage, scale, useNativeViewer]);

  const changePage = (newPage) => {
    const pageNum = Math.max(1, Math.min(numPages || 1, newPage));
    if (pageNum !== currentPage) {
      setCurrentPage(pageNum);
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (useNativeViewer && iframeRef.current) {
        iframeRef.current.src = `${url}#toolbar=1&page=${pageNum}${searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : ""}`;
      }
    }
  };

  // Search inside PDF pages
  const handleSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query || !pdfDoc) {
      searchMatchesRef.current = [];
      matchIndexRef.current = 0;
      setSearchMatches([]);
      setPageHighlights([]);
      return;
    }

    setIsSearching(true);
    const matches = [];

    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        let matchInPage = 0;

        for (const item of textContent.items) {
          if (!item.str) continue;
          const str = item.str.toLowerCase();
          let idx = 0;
          while ((idx = str.indexOf(query, idx)) !== -1) {
            matches.push({
              pageNum: i,
              matchInPageIdx: matchInPage,
            });
            matchInPage++;
            idx += query.length;
          }
        }
      }

      searchMatchesRef.current = matches;
      matchIndexRef.current = 0;
      setSearchMatches(matches);
      setCurrentMatchIndex(0);

      if (matches.length > 0) {
        const firstMatch = matches[0];
        if (currentPage === firstMatch.pageNum) {
          const page = await pdfDoc.getPage(currentPage);
          const viewport = page.getViewport({ scale });
          await computeHighlightsForPage(page, viewport, currentPage, matches, 0);
        } else {
          setCurrentPage(firstMatch.pageNum);
        }
        if (useNativeViewer && iframeRef.current) {
          iframeRef.current.src = `${url}#toolbar=1&page=${firstMatch.pageNum}&search=${encodeURIComponent(query)}`;
        }
      } else {
        setPageHighlights([]);
      }
    } catch (err) {
      console.warn("[PDF SEARCH] Search err:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const nextMatch = () => {
    if (searchMatchesRef.current.length === 0) return;
    const matches = searchMatchesRef.current;
    const nextIdx = (matchIndexRef.current + 1) % matches.length;
    matchIndexRef.current = nextIdx;
    setCurrentMatchIndex(nextIdx);

    const match = matches[nextIdx];
    if (match.pageNum !== currentPage) {
      setCurrentPage(match.pageNum);
      if (useNativeViewer && iframeRef.current) {
        iframeRef.current.src = `${url}#toolbar=1&page=${match.pageNum}&search=${encodeURIComponent(searchQuery.trim())}`;
      }
    } else {
      setPageHighlights((prev) => {
        const updated = prev.map((h) => ({
          ...h,
          isActive: h.matchInPageIdx === match.matchInPageIdx,
        }));
        const active = updated.find((h) => h.isActive);
        if (active && mainScrollRef.current) {
          mainScrollRef.current.scrollTo({ top: Math.max(0, active.top - 120), behavior: "smooth" });
        }
        return updated;
      });
    }
  };

  const prevMatch = () => {
    if (searchMatchesRef.current.length === 0) return;
    const matches = searchMatchesRef.current;
    const prevIdx = (matchIndexRef.current - 1 + matches.length) % matches.length;
    matchIndexRef.current = prevIdx;
    setCurrentMatchIndex(prevIdx);

    const match = matches[prevIdx];
    if (match.pageNum !== currentPage) {
      setCurrentPage(match.pageNum);
      if (useNativeViewer && iframeRef.current) {
        iframeRef.current.src = `${url}#toolbar=1&page=${match.pageNum}&search=${encodeURIComponent(searchQuery.trim())}`;
      }
    } else {
      setPageHighlights((prev) => {
        const updated = prev.map((h) => ({
          ...h,
          isActive: h.matchInPageIdx === match.matchInPageIdx,
        }));
        const active = updated.find((h) => h.isActive);
        if (active && mainScrollRef.current) {
          mainScrollRef.current.scrollTo({ top: Math.max(0, active.top - 120), behavior: "smooth" });
        }
        return updated;
      });
    }
  };

  // ESC key listener for instant closing
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: nightMode ? "#090d16" : "#f1f5f9",
        color: nightMode ? "#f8fafc" : "#0f172a",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header Tier 1: Document Details & Primary Action Bar with PROMINENT CLOSE BUTTON */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          background: nightMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)",
          borderBottom: nightMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)",
          backdropFilter: "blur(16px)",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Left: Document Icon & Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "200px", flex: "1 1 280px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(99, 102, 241, 0.15)",
              color: "var(--accent-indigo)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={20} />
          </div>
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.95rem",
                lineHeight: 1.25,
                color: nightMode ? "#fff" : "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "480px",
              }}
              title={title}
            >
              {title}
            </div>
            <div style={{ fontSize: "0.74rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
              <span>{subject || "Mozilla PDF Engine"}</span>
              {isCachedP2P && (
                <span className="tech-pill dedup" style={{ padding: "1px 6px", fontSize: "0.65rem" }}>
                  ⚡ P2P Local Cached
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Engine Switcher, Download & BIG HIGH-VISIBILITY CLOSE BUTTON */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {!note?.driveLink && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: nightMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
                padding: "3px",
                borderRadius: "8px",
                border: nightMode ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.12)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUseNativeViewer(false);
                }}
                style={{
                  padding: "5px 12px",
                  fontSize: "0.78rem",
                  fontWeight: !useNativeViewer ? 700 : 500,
                  borderRadius: "6px",
                  border: "none",
                  background: !useNativeViewer ? "linear-gradient(135deg, #4f46e5, #06b6d4)" : "transparent",
                  color: !useNativeViewer ? "#ffffff" : (nightMode ? "#94a3b8" : "#64748b"),
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: !useNativeViewer ? "0 2px 6px rgba(79, 70, 229, 0.4)" : "none",
                  transition: "all 0.15s ease",
                }}
                title="Switch to Range Streamer Engine (instant glowing highlights & rapid scrolling)"
              >
                🚀 Streamer Engine
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setUseNativeViewer(true);
                }}
                style={{
                  padding: "5px 12px",
                  fontSize: "0.78rem",
                  fontWeight: useNativeViewer ? 700 : 500,
                  borderRadius: "6px",
                  border: "none",
                  background: useNativeViewer ? "linear-gradient(135deg, #2563eb, #38bdf8)" : "transparent",
                  color: useNativeViewer ? "#ffffff" : (nightMode ? "#94a3b8" : "#64748b"),
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: useNativeViewer ? "0 2px 6px rgba(37, 99, 235, 0.4)" : "none",
                  transition: "all 0.15s ease",
                }}
                title="Switch to Native Browser Engine (Chrome/Edge PDF plugin)"
              >
                ⚡ Native Browser
              </button>
            </div>
          )}

          {onDownload && (
            <button
              className="btn-primary"
              onClick={onDownload}
              style={{ padding: "7px 14px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Download size={14} />
              <span>Save</span>
            </button>
          )}

          {/* PROMINENT, UNMISTAKABLE CLOSE BUTTON */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.18)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.45)",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Close Viewer (ESC)"
            >
              <X size={16} />
              <span>Close (Esc)</span>
            </button>
          )}
        </div>
      </div>

      {/* Header Tier 2: Reading & View Controls (Search, Pages, Zoom, Night Mode, Fullscreen) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 18px",
          background: nightMode ? "rgba(10, 15, 29, 0.85)" : "rgba(241, 245, 249, 0.95)",
          borderBottom: nightMode ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(0, 0, 0, 0.06)",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        {/* Left: Text Search Bar */}
        <form onSubmit={handleSearch} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search inside PDF text..."
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  searchMatchesRef.current = [];
                  matchIndexRef.current = 0;
                  setSearchMatches([]);
                  setPageHighlights([]);
                }
              }}
              style={{
                background: nightMode ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
                border: nightMode ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid rgba(0, 0, 0, 0.22)",
                color: nightMode ? "#ffffff" : "#0f172a",
                padding: "6px 28px 6px 12px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                width: "210px",
                outline: "none",
                boxShadow: nightMode ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
              }}
            />
            {isSearching ? (
              <div
                className="spinner"
                style={{
                  width: "12px",
                  height: "12px",
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  borderTopColor: "var(--accent-cyan)",
                }}
              />
            ) : (
              <button
                type="submit"
                style={{
                  position: "absolute",
                  right: "6px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: nightMode ? "var(--accent-cyan)" : "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px",
                }}
                title="Search text in document (Enter)"
              >
                <Search size={14} />
              </button>
            )}
          </div>

          {searchMatches.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.75rem",
                background: nightMode ? "rgba(255, 255, 255, 0.1)" : "#ffffff",
                padding: "3px 6px",
                borderRadius: "6px",
                border: nightMode ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid rgba(0, 0, 0, 0.22)",
                boxShadow: nightMode ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              <span
                style={{
                  color: nightMode ? "var(--accent-cyan)" : "#0284c7",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  padding: "0 4px",
                  userSelect: "none",
                }}
              >
                {currentMatchIndex + 1}/{searchMatches.length}
              </span>
              <button
                type="button"
                onClick={prevMatch}
                title="Previous Match (↑)"
                style={{
                  padding: "4px 8px",
                  background: nightMode ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.08)",
                  border: nightMode ? "1px solid rgba(255, 255, 255, 0.25)" : "1px solid rgba(0, 0, 0, 0.18)",
                  borderRadius: "4px",
                  color: nightMode ? "#f8fafc" : "#0f172a",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  lineHeight: 1,
                  transition: "all 0.15s ease",
                }}
              >
                <ChevronUp size={14} strokeWidth={2.5} color={nightMode ? "#f8fafc" : "#0f172a"} />
              </button>
              <button
                type="button"
                onClick={nextMatch}
                title="Next Match (↓)"
                style={{
                  padding: "4px 8px",
                  background: nightMode ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.08)",
                  border: nightMode ? "1px solid rgba(255, 255, 255, 0.25)" : "1px solid rgba(0, 0, 0, 0.18)",
                  borderRadius: "4px",
                  color: nightMode ? "#f8fafc" : "#0f172a",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  lineHeight: 1,
                  transition: "all 0.15s ease",
                }}
              >
                <ChevronDown size={14} strokeWidth={2.5} color={nightMode ? "#f8fafc" : "#0f172a"} />
              </button>
            </div>
          )}

          {searchQuery.trim() && searchMatches.length === 0 && !isSearching && (
            <span style={{ fontSize: "0.74rem", color: "#f87171", fontWeight: 600 }}>0 matches</span>
          )}
        </form>

        {/* Center: Page Jumpers */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            className="btn-secondary"
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            style={{
              padding: "5px 12px",
              fontSize: "0.78rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: nightMode ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              color: nightMode ? "#f8fafc" : "#0f172a",
              border: nightMode ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid rgba(0, 0, 0, 0.22)",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              opacity: currentPage <= 1 ? 0.5 : 1,
            }}
            title="Previous Page"
          >
            <ChevronLeft size={14} strokeWidth={2.2} /> Prev
          </button>

          <div
            style={{
              padding: "5px 14px",
              background: nightMode ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              borderRadius: "6px",
              border: nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.2)",
              fontSize: "0.82rem",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: nightMode ? "#fff" : "#0f172a",
              boxShadow: nightMode ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            Page {currentPage} of {numPages || "..."}
          </div>

          <button
            className="btn-secondary"
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage >= numPages || loading}
            style={{
              padding: "5px 12px",
              fontSize: "0.78rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: nightMode ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
              color: nightMode ? "#f8fafc" : "#0f172a",
              border: nightMode ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid rgba(0, 0, 0, 0.22)",
              cursor: currentPage >= numPages ? "not-allowed" : "pointer",
              opacity: currentPage >= numPages ? 0.5 : 1,
            }}
            title="Next Page"
          >
            Next <ChevronRight size={14} strokeWidth={2.2} />
          </button>
        </div>

        {/* Right: Zoom, Night Mode, Fullscreen */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(255, 255, 255, 0.04)", borderRadius: "6px", padding: "2px 6px" }}>
            <button
              className="btn-icon"
              onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
              style={{ width: "26px", height: "26px", background: "transparent" }}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: "0.74rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)", minWidth: "38px", textAlign: "center" }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              className="btn-icon"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
              style={{ width: "26px", height: "26px", background: "transparent" }}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          {/* Night Mode */}
          <button
            className="btn-secondary"
            onClick={() => setNightMode((prev) => !prev)}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: nightMode ? "rgba(99, 102, 241, 0.15)" : "rgba(251, 191, 36, 0.15)",
              color: nightMode ? "#818cf8" : "#d97706",
              border: `1px solid ${nightMode ? "rgba(99, 102, 241, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
            }}
            title={nightMode ? "Switch to Day Mode" : "Switch to Eye-Care Night Mode"}
          >
            {nightMode ? <Moon size={14} /> : <Sun size={14} />}
            <span>{nightMode ? "Night" : "Day"}</span>
          </button>

          {/* Fullscreen */}
          <button
            className="btn-icon"
            onClick={toggleFullscreen}
            style={{ width: "30px", height: "30px", background: "rgba(255,255,255,0.05)" }}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>

      {/* Main Virtual Document Canvas Area */}
      <div
        ref={mainScrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: useNativeViewer ? "0" : "24px",
          background: nightMode ? "#060911" : "#e2e8f0",
          position: "relative",
        }}
      >
        {/* Native Browser PDF Engine Embed */}
        {useNativeViewer && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: nightMode ? "#0f172a" : "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                background: nightMode ? "rgba(30, 41, 59, 0.95)" : "#e2e8f0",
                fontSize: "0.78rem",
                color: nightMode ? "#94a3b8" : "#475569",
                borderBottom: nightMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span>⚡ <strong>Native Browser PDF Engine</strong> (Chrome/Edge Native PDFium)</span>
              <span>
                💡 Tip: Press <kbd style={{ padding: "2px 6px", borderRadius: "4px", background: nightMode ? "#334155" : "#cbd5e1", fontWeight: 700 }}>Ctrl + F</kbd> for browser highlight, or switch to <strong>🚀 Streamer Engine</strong> for instant glowing overlays!
              </span>
            </div>
            <iframe
              ref={iframeRef}
              key={`native-frame-${noteId || "pdf"}`}
              src={
                !nativeSrc
                  ? (url ? `${url}#toolbar=1&page=${currentPage}` : undefined)
                  : nativeSrc.startsWith("https://drive.google.com")
                  ? nativeSrc
                  : `${nativeSrc}#toolbar=1&page=${currentPage}`
              }
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                background: "#ffffff",
              }}
              title={title}
            />
          </div>
        )}

        {loading && !useNativeViewer && (
          <div style={{ textAlign: "center", margin: "auto" }}>
            <div className="spinner" style={{ width: "36px", height: "36px", margin: "0 auto 12px" }}></div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              Streaming Pages On-Demand (Mozilla PDF.js)...
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", marginTop: "4px" }}>
              Instant Range Request Streaming (Zero waiting for 100MB download)
            </div>
          </div>
        )}

        {isAuthGated && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              padding: "36px 28px",
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(99, 102, 241, 0.4)",
              borderRadius: "16px",
              maxWidth: "480px",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.2)",
              backdropFilter: "blur(20px)",
              position: "relative",
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.4)",
                color: "#818cf8",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "6px 14px",
                borderRadius: "999px",
                marginBottom: "16px",
              }}
            >
              🔒 Registered Student Access Only
            </div>

            <h3
              style={{
                fontSize: "1.45rem",
                fontWeight: 800,
                marginBottom: "10px",
                background: "linear-gradient(135deg, #fff 30%, #a5b4fc 70%, #06b6d4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Free Study Material Vault
            </h3>

            <div style={{ color: "#38bdf8", fontWeight: 600, fontSize: "0.9rem", marginBottom: "14px" }}>
              📄 {title || "Academic Study Document"}
            </div>

            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: "24px" }}>
              This verified academic document is exclusively available to registered college students (<strong>100% Free</strong>). 
              Please register your Free Student Account or Sign In to unlock full high-speed reading &amp; downloads!
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  if (onClose) onClose();
                  if (onOpenAuth) onOpenAuth("signup");
                }}
                className="btn-primary"
                style={{
                  padding: "12px 20px",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                🎓 Sign Up
              </button>

              <button
                onClick={() => {
                  if (onClose) onClose();
                  if (onOpenAuth) onOpenAuth("signin");
                }}
                className="btn-secondary"
                style={{
                  padding: "11px 20px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                ⚡ Sign In
              </button>
            </div>

            <div style={{ marginTop: "20px", fontSize: "0.74rem", color: "#64748b" }}>
              100% Free Lifetime Academic Cloud • No Ads &amp; Popups
            </div>
          </div>
        )}

        {error && !isAuthGated && !useNativeViewer && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              padding: "24px",
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              maxWidth: "440px",
            }}
          >
            <AlertCircle size={32} style={{ color: "#f43f5e", margin: "0 auto 10px" }} />
            <div style={{ fontWeight: 600, color: "#fff", marginBottom: "6px" }}>Document Viewer Notice</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "16px" }}>{error}</div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setError(null);
                  setReloadTrigger((prev) => prev + 1);
                }}
                className="btn-secondary"
                style={{ padding: "8px 16px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={14} />
                <span>Retry Connection</span>
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setUseNativeViewer(true);
                }}
                className="btn-primary"
                style={{ padding: "8px 16px", fontSize: "0.85rem", cursor: "pointer" }}
              >
                ⚡ Switch to Native Browser Viewer
              </button>
            </div>
          </div>
        )}

        {/* Virtual Page Canvas Wrapper with Highlight Overlay Layer */}
        {!loading && !error && !isAuthGated && !useNativeViewer && (
          <div
            style={{
              position: "relative",
              display: "inline-block",
              margin: "auto",
            }}
          >
            <canvas
              key={`pdf-canvas-p${currentPage}-s${scale}`}
              ref={canvasRef}
              style={{
                display: "block",
                boxShadow: nightMode ? "0 8px 32px rgba(0,0,0,0.8)" : "0 8px 24px rgba(0,0,0,0.15)",
                borderRadius: "4px",
                filter: nightMode ? "invert(0.9) hue-rotate(180deg) contrast(1.05)" : "none",
                transition: "filter 0.2s ease",
              }}
            />

            {/* Glowing Search Highlight Overlay Boxes */}
            {canvasDimensions.width > 0 && pageHighlights.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${canvasDimensions.width}px`,
                  height: `${canvasDimensions.height}px`,
                  pointerEvents: "none",
                }}
              >
                {pageHighlights.map((hl) => (
                  <div
                    key={hl.id}
                    style={{
                      position: "absolute",
                      left: `${hl.left}px`,
                      top: `${hl.top}px`,
                      width: `${hl.width}px`,
                      height: `${hl.height}px`,
                      backgroundColor: hl.isActive
                        ? (nightMode ? "rgba(249, 115, 22, 0.75)" : "rgba(255, 140, 0, 0.75)")
                        : (nightMode ? "rgba(250, 204, 21, 0.45)" : "rgba(255, 235, 59, 0.55)"),
                      border: hl.isActive
                        ? "2px solid #ea580c"
                        : (nightMode ? "1.5px solid rgba(250, 204, 21, 0.85)" : "1.5px solid rgba(202, 138, 4, 0.85)"),
                      borderRadius: "3px",
                      boxShadow: hl.isActive
                        ? (nightMode
                            ? "0 0 16px rgba(249, 115, 22, 1), 0 0 4px #ffffff"
                            : "0 0 16px rgba(234, 88, 12, 0.9), 0 0 4px #000000")
                        : (nightMode
                            ? "0 0 6px rgba(250, 204, 21, 0.7)"
                            : "0 0 4px rgba(234, 179, 8, 0.5)"),
                      zIndex: 10,
                      pointerEvents: "none",
                      transition: "background-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 16px",
          background: nightMode ? "rgba(9, 13, 22, 0.95)" : "#f8fafc",
          borderTop: nightMode ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(0, 0, 0, 0.05)",
          fontSize: "0.72rem",
          color: "var(--text-dim)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Sparkles size={12} style={{ color: "var(--accent-cyan)" }} />
          <span>Mozilla PDF.js Virtual Engine • On-demand 64KB Byte Streaming</span>
        </span>

        <span>
          Page {currentPage} of {numPages} • Night Mode {nightMode ? "Active 🌙" : "Off ☀️"}
        </span>
      </div>
    </div>
  );
}

