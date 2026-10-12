import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  X,
  Moon,
  Sun,
  Search,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Download,
  Share2,
  FileText,
  AlertCircle,
  Wifi,
  Sparkles,
} from "lucide-react";
import { cacheNoteBuffer, getCachedNoteBuffer } from "../utils/p2pMesh";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || "4.10.38"}/build/pdf.worker.min.mjs`;
}

export default function VirtualPdfReader({ url, file, title, subject, noteId, note, onClose, onDownload, onOpenAuth }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [pageRendering, setPageRendering] = useState(false);
  const [nightMode, setNightMode] = useState(true); // Default to eye-care Dark Mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthGated, setIsAuthGated] = useState(false);
  const [useNativeViewer, setUseNativeViewer] = useState(false);

  // Search inside PDF
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // P2P status
  const [isCachedP2P, setIsCachedP2P] = useState(false);

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
          fetch(url)
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
          const hasToken = Boolean(localStorage.getItem("vault_token"));
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
  }, [url, noteId, file, note]);

  // Render page when currentPage or scale changes
  useEffect(() => {
    if (!pdfDoc || pageRendering) return;

    let renderTask = null;

    async function renderPage() {
      try {
        setPageRendering(true);
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const viewport = page.getViewport({ scale });

        // High DPI sharpness support
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
        });

        await renderTask.promise;
      } catch (e) {
        if (e.name !== "RenderingCancelledException") {
          console.warn("[PDF.js] Render warning:", e.message);
        }
      } finally {
        setPageRendering(false);
      }
    }

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  // Search inside PDF pages
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !pdfDoc) return;

    setIsSearching(true);
    setSearchMatches([]);
    const query = searchQuery.toLowerCase().trim();
    const matches = [];

    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ").toLowerCase();

        if (pageText.includes(query)) {
          matches.push(i);
        }
      }

      setSearchMatches(matches);
      if (matches.length > 0) {
        setCurrentMatchIndex(0);
        setCurrentPage(matches[0]);
      }
    } catch (err) {
      console.warn("[PDF SEARCH] Search err:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const nextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIdx);
    setCurrentPage(searchMatches[nextIdx]);
  };

  const prevMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIdx);
    setCurrentPage(searchMatches[prevIdx]);
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
            <button
              className="btn-secondary"
              onClick={() => {
                setError(null);
                setUseNativeViewer(!useNativeViewer);
              }}
              style={{
                padding: "6px 12px",
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: useNativeViewer ? "1px solid var(--accent-cyan)" : "1px solid rgba(255,255,255,0.15)",
                color: useNativeViewer ? "var(--accent-cyan)" : "var(--text-dim)",
              }}
              title="Toggle between Range Streamer and Native Browser PDF Viewer"
            >
              {useNativeViewer ? "🚀 Streamer" : "⚡ Native Engine"}
            </button>
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
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: nightMode ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
                border: nightMode ? "1px solid rgba(255, 255, 255, 0.14)" : "1px solid rgba(0, 0, 0, 0.15)",
                color: nightMode ? "#fff" : "#000",
                padding: "6px 28px 6px 12px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                width: "200px",
                outline: "none",
              }}
            />
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
                color: "var(--accent-cyan)",
              }}
            >
              <Search size={14} />
            </button>
          </div>

          {searchMatches.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>
                {currentMatchIndex + 1}/{searchMatches.length}
              </span>
              <button
                type="button"
                onClick={prevMatch}
                style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "4px", color: "#fff", cursor: "pointer" }}
              >
                &uarr;
              </button>
              <button
                type="button"
                onClick={nextMatch}
                style={{ padding: "4px 8px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "4px", color: "#fff", cursor: "pointer" }}
              >
                &darr;
              </button>
            </div>
          )}
        </form>

        {/* Center: Page Jumpers */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            className="btn-secondary"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || loading}
            style={{ padding: "5px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
            title="Previous Page"
          >
            <ChevronLeft size={14} /> Prev
          </button>

          <div
            style={{
              padding: "4px 12px",
              background: nightMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "0.82rem",
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: nightMode ? "#fff" : "#0f172a",
            }}
          >
            Page {currentPage} of {numPages || "..."}
          </div>

          <button
            className="btn-secondary"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages || loading}
            style={{ padding: "5px 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
            title="Next Page"
          >
            Next <ChevronRight size={14} />
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
          <iframe
            src={`${url}#toolbar=1`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#fff",
            }}
            title={title}
          />
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
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
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

        {/* Virtual Page Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            display: loading || error || isAuthGated || useNativeViewer ? "none" : "block",
            boxShadow: nightMode ? "0 8px 32px rgba(0,0,0,0.8)" : "0 8px 24px rgba(0,0,0,0.15)",
            borderRadius: "4px",
            filter: nightMode ? "invert(0.9) hue-rotate(180deg) contrast(1.05)" : "none",
            transition: "filter 0.2s ease",
          }}
        />
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

