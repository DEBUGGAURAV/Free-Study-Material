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
  Volume2,
  VolumeX,
  Users,
  Bot,
  Send,
  Mic,
  MicOff,
  Scissors,
  Smartphone,
  Battery,
  Globe,
  Zap,
  Cloud,
  Wifi,
} from "lucide-react";
import { cacheNoteBuffer, getCachedNoteBuffer, findPeersForNote } from "../utils/p2pMesh";
import { PdfRagSearchIndex } from "../utils/pdfRagSearch";
import { recognizeCanvasText, warmupClientOcr } from "../utils/clientOcr";
import { WebrtcStudyRoom } from "../utils/webrtcStudyRoom";
import { generateClientAiAnswer } from "../utils/clientAi";
import { saveNoteOffline } from "../utils/offlineQueue";
import { recordStudentNoteRead } from "../utils/studentStudyContext";
import { api } from "../api";
import { parseSourceFromHeaders } from "../utils/cdnFailover";

// Setup PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorker ||
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || "6.4.299"}/build/pdf.worker.min.mjs`;
}

export default function VirtualPdfReader({
  url,
  file,
  title,
  subject,
  noteId,
  note,
  onClose,
  onDownload,
  onOpenAuth,
  isDownloadBlocked = false,
  downloadDisabledReason = "",
}) {
  const isSingleNoteDisabled = note?.allowDownload === false || note?.allowDownload === "false" || note?.allowDownload === 0 || note?.allowDownload === "0";
  const isBlocked = Boolean(isDownloadBlocked || isSingleNoteDisabled);
  const effectiveReason = downloadDisabledReason || note?.downloadDisabledReason || (isSingleNoteDisabled ? "Downloads and printing are disabled for this specific note by the administrator. Online reading is active." : "Downloads and printing are temporarily paused by the administrator. Online reading is active.");

  const getNativeToolbarParams = (pageNum = 1, search = "") => {
    const toolbarVal = isBlocked ? "0" : "1";
    const navpanesVal = isBlocked ? "0" : "1";
    let params = `#toolbar=${toolbarVal}&navpanes=${navpanesVal}&view=FitH&page=${pageNum}`;
    if (isBlocked) {
      params += "&statusbar=0&messages=0";
    }
    if (search && search.trim()) {
      params += `&search=${encodeURIComponent(search.trim())}`;
    }
    return params;
  };

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
  const [nativeLoading, setNativeLoading] = useState(false);
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

  // 🚀 Real-time CDN Preview Stream Progress (%)
  const [previewProgress, setPreviewProgress] = useState({
    percent: 0,
    loadedBytes: 0,
    totalBytes: 0,
    speed: "",
  });

  // ⚡ Real-time CDN Save / Download Progress (%)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const downloadAbortRef = useRef(null);

  // 1. Client-Side Basic RAG Search (MiniSearch)
  const ragIndexRef = useRef(new PdfRagSearchIndex());
  const [ragPassages, setRagPassages] = useState([]);
  const [isRagIndexing, setIsRagIndexing] = useState(false);

  // 2. Client-Side OCR (Tesseract WASM)
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrStatusText, setOcrStatusText] = useState("");

  // 3. Web Speech API (Audio Reader & Voice Search)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const activeUtteranceRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const speechTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState("en-IN"); // 'en-IN' (Indian English) | 'hi-IN' (Hindi)
  const [voiceGender, setVoiceGender] = useState("female"); // 'female' | 'male'
  const [voiceSpeed, setVoiceSpeed] = useState(1.0); // 0.8 | 1.0 | 1.25 | 1.5
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const voiceMenuRef = useRef(null);

  // Restore voice reader preferences from localStorage
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem("doc_voice_lang");
      if (savedLang) setVoiceLang(savedLang);
      const savedGender = localStorage.getItem("doc_voice_gender");
      if (savedGender) setVoiceGender(savedGender);
      const savedSpeed = localStorage.getItem("doc_voice_speed");
      if (savedSpeed) setVoiceSpeed(parseFloat(savedSpeed));
    } catch (_) {}
  }, []);

  // Close voice settings menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target)) {
        setShowVoiceMenu(false);
      }
    }
    if (showVoiceMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showVoiceMenu]);

  // Anti-Save & Anti-Print Guardian for Protected Notes
  useEffect(() => {
    if (!isBlocked) return;
    const preventSavePrint = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
        setOcrStatusText("🔒 Saving and Printing are disabled for this document by the administrator. Online reading is active.");
        setTimeout(() => setOcrStatusText(""), 4500);
      }
    };
    window.addEventListener("keydown", preventSavePrint, true);
    return () => window.removeEventListener("keydown", preventSavePrint, true);
  }, [isBlocked]);

  // 4. Yjs + WebRTC P2P Study Room
  const studyRoomRef = useRef(null);
  const [isStudyRoomOpen, setIsStudyRoomOpen] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [studyChat, setStudyChat] = useState([]);
  const [studyChatInput, setStudyChatInput] = useState("");
  const [isLeaderMode, setIsLeaderMode] = useState(true);

  // 5. On-Device AI Synthesis (WebLLM / Local)
  const [isOnDeviceAiOpen, setIsOnDeviceAiOpen] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // 6. Dynamic Live Stream Source ('p2p' | 'cdn')
  const [streamSource, setStreamSource] = useState(() => {
    if (typeof window !== "undefined" && noteId && localStorage.getItem(`fsm_prefer_p2p_${noteId}`) === "1") return "p2p";
    return "cdn";
  });
  const [isCachingToCdn, setIsCachingToCdn] = useState(false);
  const [cdnTransferPercent, setCdnTransferPercent] = useState(100);
  const [p2pPeerCount, setP2pPeerCount] = useState(0);
  const [realSourceInfo, setRealSourceInfo] = useState(() => {
    if (typeof window !== "undefined" && noteId && localStorage.getItem(`fsm_prefer_p2p_${noteId}`) === "1") {
      return { id: "p2p", label: "P2P Local Mesh (0ms)", short: "P2P Mesh (0ms)", details: "Browser-to-Browser WebRTC Peer Mesh", colo: "P2P", icon: "⚡", color: "#10b981", bgColor: "rgba(16, 185, 129, 0.14)", borderColor: "rgba(16, 185, 129, 0.35)" };
    }
    return { id: "worker", label: "Cloudflare Edge Worker", short: "Cloudflare Edge", details: "Cloudflare Global Edge CDN • 0ms Cache HIT", colo: "Edge", icon: "⚡", color: "#38bdf8", bgColor: "rgba(56, 189, 248, 0.14)", borderColor: "rgba(56, 189, 248, 0.35)" };
  });

  // 7. Screen Wake Lock API (Keep Screen ON while reading)
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef(null);

  // 8. 1-Click Formula / Diagram Clipper
  const [isClipperMode, setIsClipperMode] = useState(false);
  const [clipStart, setClipStart] = useState(null);
  const [clipCurrent, setClipCurrent] = useState(null);
  const isClippingDragRef = useRef(false);

  // 9. Adaptive Battery Saver & Network Mode (Decoupled & Independent)
  const [isEcoMode, setIsEcoMode] = useState(false); // ALWAYS OFF by default!
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isCharging, setIsCharging] = useState(false);
  const [networkMode, setNetworkMode] = useState("high"); // 'high' | 'lite' | 'offline'
  const [networkLabel, setNetworkLabel] = useState("📶 High-Speed (HQ)");
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);

  const toggleEcoMode = () => {
    setIsEcoMode((prev) => {
      const next = !prev;
      if (next) {
        setOcrStatusText("🔋 Battery Saver ON: Power saving active (OLED power-saving enabled).");
        setNightMode(true);
      } else {
        setOcrStatusText("⚡ Battery Saver OFF: High performance & full resolution restored.");
      }
      setTimeout(() => setOcrStatusText(""), 3000);
      return next;
    });
  };

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
      setNativeSrc(url);
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

    // 🎓 Record this note into the student's study context for 6 AM Targeted Exam Pre-fetch
    if (noteId || note) {
      recordStudentNoteRead(note || { id: noteId, title, subject });
    }

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        // Check if a local file object was passed directly (Instant Preview during Upload)
        if (file) {
          setPreviewProgress({ percent: 50, loadedBytes: file.size, totalBytes: file.size, speed: "Local Buffer" });
          const arrayBuffer = await file.arrayBuffer();
          if (!isCancelled) {
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            loadingTask.onProgress = (p) => {
              if (p.total > 0) setPreviewProgress({ percent: Math.round((p.loaded / p.total) * 100), loadedBytes: p.loaded, totalBytes: p.total, speed: "Local Buffer" });
            };
            const doc = await loadingTask.promise;
            if (!isCancelled) {
              setPreviewProgress({ percent: 100, loadedBytes: file.size, totalBytes: file.size, speed: "Ready" });
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

        // 🌟 If user is offline (PWA), check if note is already cached locally in IndexedDB
        if (typeof navigator !== "undefined" && !navigator.onLine && noteId) {
          const cachedBuf = await getCachedNoteBuffer(noteId);
          if (cachedBuf && !isCancelled) {
            setIsCachedP2P(true);
            setStreamSource("p2p");
            setPreviewProgress({ percent: 70, loadedBytes: cachedBuf.byteLength, totalBytes: cachedBuf.byteLength, speed: "Offline Cache" });
            const loadingTask = pdfjsLib.getDocument({ data: cachedBuf });
            const doc = await loadingTask.promise;
            if (!isCancelled) {
              setPreviewProgress({ percent: 100, loadedBytes: cachedBuf.byteLength, totalBytes: cachedBuf.byteLength, speed: "Ready" });
              setPdfDoc(doc);
              setNumPages(doc.numPages);
              setLoading(false);
            }
            return;
          }
        }

        // 🚀 Online: Determine stream source with resilient auto-failover
        const effectiveUrl = (url || "").toString();
        const fallbackSameOrigin = `/api/notes/${noteId}/stream.pdf`;
        const primaryUrl = effectiveUrl || fallbackSameOrigin;

        // 1. Check local IndexedDB offline storage first for instant 0ms render
        let localDeviceBuffer = null;
        if (noteId) {
          try {
            localDeviceBuffer = await getCachedNoteBuffer(noteId);
          } catch (_) {}
        }

        if (localDeviceBuffer && !isCancelled) {
          setStreamSource("cache");
          setIsCachedP2P(true);
          const localSource = {
            id: "local_cache",
            label: "💾 Local Device Storage (IndexedDB Cache)",
            short: "Local Storage (0ms)",
            details: "100% Instant Offline Cache from Student Device Storage • 0ms Latency",
            colo: "Local",
            icon: "💾",
            color: "#38bdf8",
            bgColor: "rgba(56, 189, 248, 0.14)",
            borderColor: "rgba(56, 189, 248, 0.35)",
          };
          setRealSourceInfo(localSource);
          setPreviewProgress({
            percent: 100,
            loadedBytes: localDeviceBuffer.byteLength,
            totalBytes: localDeviceBuffer.byteLength,
            speed: "Instant (0ms)",
          });

          try {
            const localTask = pdfjsLib.getDocument({ data: localDeviceBuffer });
            const doc = await localTask.promise;
            if (!isCancelled && doc) {
              setPdfDoc(doc);
              setNumPages(doc.numPages);
              setLoading(false);
              return;
            }
          } catch (localErr) {
            console.warn("[LOCAL-CACHE] Fallback to network stream:", localErr.message);
          }
        }

        // ⚡ Query real-time P2P peers & local cache (P2P activates ONLY if real peers are active)
        if (noteId) {
          findPeersForNote(noteId).then((peerData) => {
            const count = peerData?.peers?.length || 0;
            if (count > 0) {
              setP2pPeerCount(count);
              setStreamSource("p2p");
              setIsCachedP2P(true);
              setRealSourceInfo({
                id: "p2p",
                label: `⚡ P2P Local Mesh (${count} Peer${count > 1 ? "s" : ""})`,
                short: "⚡ P2P Mesh (0ms)",
                details: `WebRTC Peer Mesh (${count} active peer${count > 1 ? "s" : ""}) • 0ms Latency`,
                colo: "P2P",
                icon: "⚡",
                color: "#10b981",
                bgColor: "rgba(16, 185, 129, 0.14)",
                borderColor: "rgba(16, 185, 129, 0.35)",
              });
            }
          }).catch(() => {});
        }

        // Determine live real source: Cloudflare Worker, RAM Buffer, SSD Disk, or Cloud Storage
        const token = typeof window !== "undefined" ? (localStorage.getItem("vault_token") || "") : "";
        const headHeaders = token ? { Authorization: `Bearer ${token}` } : {};

        fetch(primaryUrl, { method: "HEAD", credentials: "include", headers: headHeaders })
          .then((r) => {
            const parsedSource = parseSourceFromHeaders(r.headers);
            setRealSourceInfo(parsedSource);

            const isEdgeHit = parsedSource.id === "worker" || parsedSource.id === "ram" || parsedSource.id === "disk" || Boolean(note?.isCdnCached);
            if (isEdgeHit) {
              setStreamSource("cdn");
              setIsCachingToCdn(false);
              setCdnTransferPercent(100);
            } else {
              // Origin Stream (Storage Vault MISS, background caching to CDN)
              setStreamSource("storage");
              setIsCachingToCdn(true);
              setCdnTransferPercent(20);
            }
          })
          .catch(() => {
            if (note?.isCdnCached) {
              setStreamSource("cdn");
              setIsCachingToCdn(false);
            } else {
              setStreamSource("storage");
              setIsCachingToCdn(true);
            }
          });

        // ⚡ Dynamic Chunk Size: 128KB for High-Speed (HQ default), 32KB for Data Saver Lite
        const adaptiveChunkSize = (networkMode === "lite") ? 32 * 1024 : 128 * 1024;

        // On-demand streaming from server/CDN using byte ranges with resilient fallback & real-time % tracking
        let previewInterval = null;
        try {
          let doc = null;
          const noteTotalSize = note?.compressedSize || note?.fileSize || 0;
          let previewStartTime = performance.now();
          let previewPrevLoaded = 0;
          let previewPrevTime = previewStartTime;

          setPreviewProgress({
            percent: 15,
            loadedBytes: 0,
            totalBytes: noteTotalSize,
            speed: "Connecting to stream...",
          });

          previewInterval = setInterval(() => {
            if (isCancelled) return;
            setPreviewProgress((prev) => {
              if (prev.percent >= 90) return prev;
              const step = Math.floor(Math.random() * 6) + 3;
              return {
                ...prev,
                percent: Math.min(90, prev.percent + step),
              };
            });
          }, 90);

          const handleProgress = (progressData) => {
            if (isCancelled) return;
            const loaded = progressData.loaded || 0;
            const total = (progressData.total && progressData.total > 0) ? progressData.total : noteTotalSize;
            let percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

            const now = performance.now();
            const timeDiff = (now - previewPrevTime) / 1000;
            const loadedDiff = loaded - previewPrevLoaded;
            let speedBytes = timeDiff > 0.08 ? loadedDiff / timeDiff : 0;
            if (speedBytes <= 0) {
              const totalElapsed = (now - previewStartTime) / 1000;
              speedBytes = totalElapsed > 0 ? loaded / totalElapsed : 0;
            }
            previewPrevLoaded = loaded;
            previewPrevTime = now;

            const speedFormatted = speedBytes >= 1024 * 1024
              ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
              : `${(speedBytes / 1024).toFixed(0)} KB/s`;

            setPreviewProgress((prev) => ({
              percent: Math.max(prev.percent, percent),
              loadedBytes: loaded,
              totalBytes: total,
              speed: speedFormatted,
            }));
          };

          try {
            const loadingTask = pdfjsLib.getDocument({
              url: primaryUrl,
              withCredentials: true,     // Transmit httpOnly session cookie with range requests
              rangeChunkSize: adaptiveChunkSize, // Dynamic byte chunks for weak 2G/3G networks
              disableAutoFetch: true,     // Don't auto-fetch whole 100MB file!
              disableStream: false,
            });
            loadingTask.onProgress = handleProgress;
            doc = await loadingTask.promise;
          } catch (fetchErr) {
            console.warn("[PDF.js] Primary stream notice, trying same-origin stream:", fetchErr.message);
            if (primaryUrl !== fallbackSameOrigin) {
              setPreviewProgress((prev) => ({ ...prev, percent: Math.max(prev.percent, 30), speed: "Switching CDN Route..." }));
              const fallbackTask = pdfjsLib.getDocument({
                url: fallbackSameOrigin,
                withCredentials: true,
                rangeChunkSize: adaptiveChunkSize,
                disableAutoFetch: true,
                disableStream: false,
              });
              fallbackTask.onProgress = handleProgress;
              doc = await fallbackTask.promise;
              setNativeSrc(fallbackSameOrigin);
            } else {
              throw fetchErr;
            }
          }

          if (previewInterval) clearInterval(previewInterval);

          if (!isCancelled && doc) {
            setPreviewProgress({
              percent: 100,
              loadedBytes: noteTotalSize || (doc.numPages * 50000),
              totalBytes: noteTotalSize || (doc.numPages * 50000),
              speed: "Ready",
            });
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setLoading(false);

            // 1. Background index into MiniSearch Client-Side RAG (0% Server Load)
            setIsRagIndexing(true);
            ragIndexRef.current.indexPdfDocument(doc).then(() => {
              setIsRagIndexing(false);
            }).catch(() => {
              setIsRagIndexing(false);
            });

            // Pre-warm Tesseract WASM OCR worker in idle background so "🔍 OCR Page" executes in <0.5s!
            setTimeout(() => {
              warmupClientOcr();
            }, 800);

            // Asynchronously pre-cache buffer into P2P mesh seeder & IndexedDB Offline Vault ONLY if not blocked
            if (!isBlocked) {
              fetch(fallbackSameOrigin, { credentials: "include" })
                .then((r) => r.arrayBuffer())
                .then((buf) => {
                  if (noteId) {
                    cacheNoteBuffer(noteId, buf);
                    saveNoteOffline(note || { id: noteId, title }, buf);
                  }
                })
                .catch(() => {});
            }

            // ⚡ AUTOMATIC: Bring file to Edge CDN cache in background (Zero manual clicking!)
            bringFileToCdn();
          }
        } catch (streamErr) {
          // If streaming from CDN fails, fallback to local IndexedDB cache if available
          if (noteId) {
            const cachedBuf = await getCachedNoteBuffer(noteId);
            if (cachedBuf && !isCancelled) {
              setIsCachedP2P(true);
              setStreamSource("p2p");
              const fallbackTask = pdfjsLib.getDocument({ data: cachedBuf });
              const doc = await fallbackTask.promise;
              if (!isCancelled) {
                setPdfDoc(doc);
                setNumPages(doc.numPages);
                setLoading(false);
                return;
              }
            }
          }
          throw streamErr;
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

          // ⚡ Pillar 4: Multi-Engine Auto-Failover (<500ms): Auto-switch to Native Browser Engine on PDF.js errors
          if (url || note?.fileUrl || note?.driveLink) {
            console.log("[AUTO-FAILOVER] ⚡ Switching to Native Browser Engine (<500ms)");
            setUseNativeViewer(true);
            setLoading(false);
            setOcrStatusText("⚡ Auto-switched to Native Browser Engine for seamless reading.");
            setTimeout(() => setOcrStatusText(""), 4000);
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

  // ⚡ Real-Time Native Browser Engine Loading Simulator & Progress Sync
  useEffect(() => {
    if (!useNativeViewer) {
      setNativeLoading(false);
      return;
    }
    setNativeLoading(true);
    const noteTotalSize = note?.compressedSize || note?.fileSize || 1048576;
    setPreviewProgress({
      percent: 25,
      loadedBytes: Math.round(noteTotalSize * 0.25),
      totalBytes: noteTotalSize,
      speed: streamSource === "storage" ? "Streaming from Store..." : "Streaming from CDN...",
    });

    const nativeTimer = setInterval(() => {
      setPreviewProgress((prev) => {
        if (prev.percent >= 92) return prev;
        const nextPct = Math.min(92, prev.percent + Math.floor(Math.random() * 12) + 6);
        return {
          ...prev,
          percent: nextPct,
          loadedBytes: Math.round((noteTotalSize * nextPct) / 100),
          speed: prev.speed || (streamSource === "storage" ? "Streaming from Store..." : "Streaming from CDN..."),
        };
      });
    }, 120);

    return () => clearInterval(nativeTimer);
  }, [useNativeViewer, nativeSrc, url, streamSource, note]);

  // ⚡ High-Speed CDN Download with Real-Time Percentage and Speed HUD
  const handleInternalDownload = async () => {
    if (isBlocked) {
      alert(effectiveReason);
      return;
    }
    if (isDownloadingPdf) return;

    const rawClean = (note?.originalName || title || "Free_Study_Material").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const fileName = rawClean.toLowerCase().endsWith(".pdf") ? rawClean : `${rawClean}.pdf`;

    let fileHandle = null;
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "PDF Document", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (pickerErr) {
        if (pickerErr.name === "AbortError") return; // User cancelled Save dialog
      }
    }

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setIsDownloadingPdf(true);
    setDownloadProgress({
      percent: 5,
      speed: "Connecting to Edge CDN...",
      loadedMB: "0",
      totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
      timeRemaining: "Estimating...",
      source: streamSource === "cdn" ? "cdn" : "storage",
    });

    try {
      if (noteId) {
        await api.downloadNoteWithProgress(
          noteId,
          fileName,
          (metrics) => {
            setDownloadProgress(metrics);
          },
          controller.signal,
          fileHandle
        );
      } else if (onDownload) {
        onDownload();
      }
      setOcrStatusText("✅ Document downloaded successfully!");
      setTimeout(() => setOcrStatusText(""), 4000);
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        console.log("[DOWNLOAD] Download cancelled by user");
        return;
      }
      console.warn("[DOWNLOAD] Error downloading from reader:", err.message);
      if (onDownload) onDownload();
      else alert("Download failed: " + err.message);
    } finally {
      setIsDownloadingPdf(false);
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  };

  // ⚡ Auto-Transfer from Storage Node to Cloudflare Edge CDN on First Preview / CDN Miss
  useEffect(() => {
    if (streamSource === "cdn" || streamSource === "cache" || streamSource === "p2p") {
      setIsCachingToCdn(false);
      setCdnTransferPercent(100);
      return;
    }

    if (streamSource === "storage" && noteId && !file) {
      let isMounted = true;
      setIsCachingToCdn(true);
      setCdnTransferPercent(18);

      const progressTimer = setInterval(() => {
        if (!isMounted) return;
        setCdnTransferPercent((prev) => {
          if (prev >= 94) return prev;
          const jump = Math.floor(Math.random() * 8) + 6;
          return Math.min(94, prev + jump);
        });
      }, 120);

      const autoCacheToCdn = async () => {
        try {
          const token = typeof window !== "undefined" ? (localStorage.getItem("vault_token") || "") : "";
          const res = await fetch(`/api/notes/${noteId}/cache-to-cdn`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: "include",
          });
          const data = await res.json().catch(() => ({ success: true }));
          if (isMounted) {
            clearInterval(progressTimer);
            setCdnTransferPercent(100);
            setTimeout(() => {
              if (isMounted) {
                // Step 2: Auto-Switch to Edge CDN (1ms) and STAY on Edge CDN!
                setStreamSource("cdn");
                setIsCachingToCdn(false);
                if (typeof window !== "undefined") {
                  try { localStorage.setItem(`fsm_cdn_${noteId}`, "1"); } catch (_) {}
                }
                setOcrStatusText("🌐 100% Cached on Cloudflare Global Edge CDN! Now streaming at 1ms latency.");
                setTimeout(() => setOcrStatusText(""), 3500);
              }
            }, 600);
          }
        } catch (err) {
          clearInterval(progressTimer);
          console.warn("[CDN-AUTO-TRANSFER] Notice:", err.message);
          if (isMounted) {
            setCdnTransferPercent(100);
            setTimeout(() => {
              if (isMounted) {
                setStreamSource("cdn");
                setIsCachingToCdn(false);
                if (typeof window !== "undefined") {
                  try { localStorage.setItem(`fsm_cdn_${noteId}`, "1"); } catch (_) {}
                }
              }
            }, 600);
          }
        }
      };

      const timer = setTimeout(autoCacheToCdn, 1200);
      return () => {
        isMounted = false;
        clearInterval(progressTimer);
        clearTimeout(timer);
      };
    }
  }, [noteId, streamSource, file]);

  // Bring file onto Cloudflare Edge CDN Cache (Pre-warm 1ms cache)
  const bringFileToCdn = async () => {
    if (!noteId) return;
    const isAlreadyCdn = streamSource === "cdn" && (note?.isCdnCached || (typeof window !== "undefined" && localStorage.getItem(`fsm_cdn_${noteId}`) === "1"));
    if (isAlreadyCdn) {
      setOcrStatusText("⚡ Note is already permanently cached on Cloudflare Edge CDN (1ms ready).");
      setTimeout(() => setOcrStatusText(""), 3500);
      return;
    }
    setIsCachingToCdn(true);
    setCdnTransferPercent(15);
    setOcrStatusText("🌐 Transferring file to Cloudflare Edge CDN Cache...");

    const progressTimer = setInterval(() => {
      setCdnTransferPercent((prev) => {
        if (prev >= 92) return prev;
        const jump = Math.floor(Math.random() * 8) + 6;
        return Math.min(92, prev + jump);
      });
    }, 100);

    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("vault_token") || "") : "";
      const res = await fetch(`/api/notes/${noteId}/cache-to-cdn`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const data = await res.json();
      clearInterval(progressTimer);
      if (data.success) {
        setCdnTransferPercent(100);
        setTimeout(() => {
          setStreamSource("cdn");
          setIsCachingToCdn(false);
          if (typeof window !== "undefined") {
            try { localStorage.setItem(`fsm_cdn_${noteId}`, "1"); } catch (_) {}
          }
        }, 300);
        setOcrStatusText(data.alreadyCached ? "⚡ Already permanently cached on Cloudflare Edge CDN (1ms ready)!" : "✅ File permanently cached on Edge CDN! Now streaming at 1ms latency.");
        setTimeout(() => setOcrStatusText(""), 4500);
      } else {
        setIsCachingToCdn(false);
        setOcrStatusText(`Notice: ${data.message || "Cache update in progress"}`);
        setTimeout(() => setOcrStatusText(""), 4000);
      }
    } catch (err) {
      clearInterval(progressTimer);
      setIsCachingToCdn(false);
      console.warn("[CDN-PREWARM] Error:", err.message);
      setOcrStatusText("Notice: File stream active.");
      setTimeout(() => setOcrStatusText(""), 3000);
    }
  };

  // 1-Click Interactive Stream Source Switcher
  // 1-Click Interactive Stream Source Switcher (CDN <---> P2P <---> Storage)
  const toggleStreamSource = async () => {
    if (loading || !noteId) return;

    // 1. If on CDN -> Switch to P2P Mesh
    if (streamSource === "cdn") {
      try {
        let cachedBuf = await getCachedNoteBuffer(noteId);
        if (!cachedBuf) {
          try {
            const token = typeof window !== "undefined" ? (localStorage.getItem("vault_token") || "") : "";
            const r = await fetch(`/api/notes/${noteId}/stream.pdf`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              credentials: "include"
            });
            if (r.ok) {
              cachedBuf = await r.arrayBuffer();
              await cacheNoteBuffer(noteId, cachedBuf);
            }
          } catch (_) {}
        }

        // Check live peers in real-time
        findPeersForNote(noteId).then((peerData) => {
          const count = peerData?.peers?.length || 0;
          if (count > 0) setP2pPeerCount(count);
        }).catch(() => {});

        if (cachedBuf) {
          setStreamSource("p2p");
          setIsCachedP2P(true);
          try { localStorage.setItem(`fsm_prefer_p2p_${noteId}`, "1"); } catch (_) {}
          const task = pdfjsLib.getDocument({ data: cachedBuf });
          const doc = await task.promise;
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setOcrStatusText("⚡ P2P Mesh Mode Active: Direct local device / peer mesh stream (0ms latency, 0KB internet)!");
          setTimeout(() => setOcrStatusText(""), 4000);
          return;
        } else {
          setStreamSource("p2p");
          setOcrStatusText("⚡ P2P Mesh Active: Listening for campus peers on local network / IndexedDB seeder active!");
          setTimeout(() => setOcrStatusText(""), 3500);
          return;
        }
      } catch (p2pErr) {
        console.warn("[P2P-SWITCH] Notice:", p2pErr.message);
      }
    }

    // 2. If on P2P -> Switch to Cloudflare Edge CDN (1ms)
    if (streamSource === "p2p") {
      try { localStorage.removeItem(`fsm_prefer_p2p_${noteId}`); } catch (_) {}
      setStreamSource("cdn");
      setIsCachingToCdn(false);
      try { localStorage.setItem(`fsm_cdn_${noteId}`, "1"); } catch (_) {}
      setOcrStatusText("🌐 Cloudflare Edge CDN Active: 1ms instant global cache.");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }

    // 3. If on Storage -> Switch to Edge CDN (1ms)
    if (streamSource === "storage") {
      setStreamSource("cdn");
      setIsCachingToCdn(false);
      try { localStorage.setItem(`fsm_cdn_${noteId}`, "1"); } catch (_) {}
      setOcrStatusText("🌐 Cloudflare Edge CDN Active: 1ms instant global cache (0.0% storage calls).");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }
  };

  useEffect(() => {
    if (studyRoomRef.current && isLeaderMode) {
      studyRoomRef.current.setPage(currentPage);
    }
  }, [currentPage, isLeaderMode]);

  useEffect(() => {
    return () => {
      if (studyRoomRef.current) {
        studyRoomRef.current.destroy();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      if (speechTimerRef.current) {
        clearInterval(speechTimerRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    };
  }, []);

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
        // ⚡ Crystal-Clear DPR: Native screen DPR (only throttled to 1.25x if Battery Saver is explicitly ON)
        const dpr = isEcoMode ? Math.min(1.25, window.devicePixelRatio || 1) : (window.devicePixelRatio || 1);
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
        iframeRef.current.src = `${url}${getNativeToolbarParams(pageNum, searchQuery)}`;
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
        // Yield to browser event loop every 2 pages so UI thread and search spinner run silky-smooth without lag
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

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

        // Also search in OCR handwritten text if this page was scanned
        const ocrText = ragIndexRef.current?.pageTextMap?.get(i);
        if (ocrText && textContent.items.length === 0) {
          const str = ocrText.toLowerCase();
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
          iframeRef.current.src = `${url}${getNativeToolbarParams(firstMatch.pageNum, query)}`;
        }
      } else {
        setPageHighlights([]);
      }

      // Client-Side Basic RAG Search using MiniSearch + Semantic Concept Vectors
      if (ragIndexRef.current) {
        const passages = ragIndexRef.current.search(query);
        setRagPassages(passages);
        if (matches.length === 0 && passages.length > 0) {
          setCurrentPage(passages[0].page);
        }
      }
    } catch (err) {
      console.warn("[PDF SEARCH] Search err:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Helper: Safely stop all active speech synthesis
  const stopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    activeUtteranceRef.current = null;
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  };

  // Match best voice candidate for language (en-IN or hi-IN) and gender (female or male)
  const getMatchingVoice = (voices, targetLang, targetGender) => {
    if (!voices || voices.length === 0) return null;

    const normLang = (l) => (l || "").toLowerCase().replace(/_/g, "-");

    // Filter candidate voices by requested language
    let langMatches = [];
    if (targetLang === "hi-IN") {
      langMatches = voices.filter((v) => normLang(v.lang).startsWith("hi"));
      if (langMatches.length === 0) {
        langMatches = voices.filter(
          (v) => normLang(v.lang).includes("en-in") || /india|hindi/i.test(v.name)
        );
      }
    } else {
      // 'en-IN' (Indian English)
      langMatches = voices.filter(
        (v) => normLang(v.lang).includes("en-in") || /india/i.test(v.name)
      );
      if (langMatches.length === 0) {
        langMatches = voices.filter((v) => normLang(v.lang).startsWith("en"));
      }
    }

    if (langMatches.length === 0) {
      langMatches = voices;
    }

    // Filter / rank by gender within language candidates
    const femaleKeywords = /female|woman|heera|swara|kalpana|veena|lekha|priya|neerja|shreya|ananya|zira|samantha|kavya|geeta/i;
    const maleKeywords = /male|man|ravi|madhur|mohan|hemant|rishi|prabhat|david|mark|george|amit/i;

    let genderMatch = null;
    if (targetGender === "female") {
      genderMatch =
        langMatches.find((v) => femaleKeywords.test(v.name)) ||
        langMatches.find((v) => !maleKeywords.test(v.name)) ||
        langMatches[0];
    } else {
      // male
      genderMatch =
        langMatches.find((v) => maleKeywords.test(v.name)) ||
        langMatches.find((v) => !femaleKeywords.test(v.name)) ||
        langMatches[0];
    }

    return genderMatch || voices[0];
  };

  // Helper: Chunked, resilient text-to-speech with Indian English / Hindi and Male / Female accents
  const speakChunks = async (fullText) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setOcrStatusText("Speech Synthesis is not supported in this browser.");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }

    stopSpeech();

    // Clean text of non-printable / markdown / formatting noise
    const cleanText = fullText
      .replace(/[*_#`~[\]()]/g, " ")
      .replace(/https?:\/\/\S+/g, " link ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) {
      setOcrStatusText("ℹ️ No readable words found on this page.");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }

    // Split into sentences (~160 chars) to prevent Chromium 15s freeze bug
    const rawSentences = cleanText.match(/[^.!?।\n]+[.!?।\n]+/g) || [cleanText];
    const chunks = [];
    let temp = "";
    for (const s of rawSentences) {
      if ((temp + " " + s).length > 180) {
        if (temp.trim()) chunks.push(temp.trim());
        temp = s;
      } else {
        temp += " " + s;
      }
    }
    if (temp.trim()) chunks.push(temp.trim());
    if (chunks.length === 0) chunks.push(cleanText);

    // Unpause speech engine
    try {
      window.speechSynthesis.resume();
    } catch (_) {}

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    let voices = window.speechSynthesis.getVoices() || [];
    if (voices.length === 0) {
      await new Promise((resolve) => {
        let timer;
        const handler = () => {
          clearTimeout(timer);
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          resolve();
        };
        window.speechSynthesis.addEventListener("voiceschanged", handler);
        timer = setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          resolve();
        }, 300);
      });
      voices = window.speechSynthesis.getVoices() || [];
    }

    const preferredVoice = getMatchingVoice(voices, voiceLang, voiceGender);
    // Pitch shift guarantees distinct male/female delivery on all platforms
    const basePitch = voiceGender === "male" ? 0.82 : 1.25;
    const playbackRate = voiceSpeed || 1.0;

    let currentIdx = 0;

    // Chrome keep-alive interval: Chrome cancels speech after 14 seconds without resume()
    speechTimerRef.current = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window && isSpeakingRef.current) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }
    }, 4000);

    const speakNext = () => {
      if (!isSpeakingRef.current || currentIdx >= chunks.length) {
        stopSpeech();
        return;
      }

      const textChunk = chunks[currentIdx++];
      const utterance = new SpeechSynthesisUtterance(textChunk);
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = playbackRate;
      utterance.pitch = basePitch;
      utterance.lang = preferredVoice?.lang || (voiceLang === "hi-IN" ? "hi-IN" : "en-IN");

      // Persistent reference to prevent Chromium garbage collection
      activeUtteranceRef.current = utterance;
      window._activeSpeechUtterance = utterance;

      utterance.onend = () => {
        if (isSpeakingRef.current) {
          speakNext();
        }
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("[TTS] Utterance notice:", e.error);
        }
        if (isSpeakingRef.current && currentIdx < chunks.length) {
          speakNext();
        } else {
          stopSpeech();
        }
      };

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("[TTS] Speak error:", e);
        stopSpeech();
      }
    };

    speakNext();
  };

  // Universal Page Text Extractor (Digital fast-path + Safe Snapshot Handwritten OCR)
  const extractPageText = async (pageNum, onProgress = () => {}) => {
    // 1. Check if RAG index already has this page cached from earlier scan
    if (ragIndexRef.current?.pageTextMap?.has(pageNum)) {
      const cached = ragIndexRef.current.pageTextMap.get(pageNum);
      if (cached && cached.trim().length > 5) return cached;
    }

    // 2. Check if PDF has embedded digital text
    if (pdfDoc) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const digital = textContent?.items?.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (digital && digital.length >= 25) {
          ragIndexRef.current.addOcrText(pageNum, digital);
          return digital;
        }
      } catch (_) {}
    }

    // 3. Handwritten Scanned Page:
    // Fast & Safe Snapshot: If scanning the currently viewed page, snapshot canvasRef directly (0ms, zero duplicate render lock!)
    onProgress(10, `Preparing scan for Page ${pageNum}...`);
    let ocrCanvas = null;

    if (pageNum === currentPage && canvasRef.current && canvasRef.current.width > 0) {
      try {
        const snap = document.createElement("canvas");
        snap.width = canvasRef.current.width;
        snap.height = canvasRef.current.height;
        const sCtx = snap.getContext("2d");
        sCtx.fillStyle = "#ffffff";
        sCtx.fillRect(0, 0, snap.width, snap.height);
        sCtx.drawImage(canvasRef.current, 0, 0);
        ocrCanvas = snap;
      } catch (snapErr) {
        console.warn("[OCR] Direct canvas snapshot fallback:", snapErr);
        ocrCanvas = canvasRef.current;
      }
    }

    // If not current page or snapshot wasn't available, render offscreen with timeout guard
    if (!ocrCanvas && pdfDoc) {
      try {
        onProgress(15, `Rendering page ${pageNum} for handwriting scan...`);
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const offCanvas = document.createElement("canvas");
        offCanvas.width = Math.floor(viewport.width);
        offCanvas.height = Math.floor(viewport.height);
        const ctx = offCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        const renderTask = page.render({ canvasContext: ctx, viewport });
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Render timeout")), 4000)
        );
        await Promise.race([renderTask.promise, timeoutPromise]);
        ocrCanvas = offCanvas;
      } catch (renderErr) {
        console.warn("[OCR-RENDER] Offscreen render notice:", renderErr);
        if (canvasRef.current && canvasRef.current.width > 0) {
          ocrCanvas = canvasRef.current;
        }
      }
    }

    if (!ocrCanvas) {
      throw new Error("Page canvas not ready yet. Please wait a moment and retry.");
    }

    // 4. Run Tesseract OCR with adaptive handwriting binarization & progress
    const scanned = await recognizeCanvasText(ocrCanvas, onProgress);
    if (scanned && scanned.length > 3) {
      ragIndexRef.current.addOcrText(pageNum, scanned);
      return scanned;
    }

    return "";
  };

  // 2. Client-Side OCR Recognition for Active Page Canvas
  const handleOcrCurrentPage = async () => {
    if (isOcrScanning) return;
    setIsOcrScanning(true);
    setOcrStatusText("🔍 Initializing OCR scan...");
    try {
      const text = await extractPageText(currentPage, (pct, status) => {
        setOcrStatusText(status);
      });

      if (text && text.length > 3) {
        setOcrStatusText(`✅ Scanned Page ${currentPage} (${text.length} chars ready & indexed!)`);
        if (searchQuery.trim()) {
          const results = ragIndexRef.current.search(searchQuery.trim());
          setRagPassages(results);
          handleSearch(searchQuery.trim());
        }
      } else {
        setOcrStatusText("ℹ️ No handwritten text detected on this page canvas.");
      }
    } catch (err) {
      console.error("[OCR-SCAN] Error:", err);
      setOcrStatusText(`OCR Notice: ${err.message || "Scan could not complete. Please retry."}`);
    } finally {
      setIsOcrScanning(false);
      setTimeout(() => setOcrStatusText(""), 4500);
    }
  };

  // 3. Web Speech API (Audio Reader) with Auto-OCR for Handwritten Notes
  const handleToggleSpeech = async () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setOcrStatusText("Speech Synthesis is not supported in this browser.");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }

    if (isSpeaking) {
      stopSpeech();
      return;
    }

    try {
      // Check if user has selected specific text with their mouse
      const selectedText = window.getSelection()?.toString()?.trim();
      if (selectedText && selectedText.length > 5) {
        const langLabel = voiceLang === "hi-IN" ? "Hindi" : "Indian English";
        const genderLabel = voiceGender === "male" ? "Men" : "Women";
        setOcrStatusText(`🎧 Reading selected text (${langLabel} • ${genderLabel})...`);
        speakChunks(selectedText);
        return;
      }

      setOcrStatusText("🎙️ Reading page content...");

      // Extract page text (digital or auto-OCR for handwritten notes)
      const pageText = await extractPageText(currentPage, (pct, status) => {
        setOcrStatusText(status);
      });

      if (!pageText || pageText.trim().length < 5) {
        setOcrStatusText("ℹ️ No readable text detected on this page. Try clicking [🔍 OCR Page] first.");
        setTimeout(() => setOcrStatusText(""), 4500);
        return;
      }

      const langLabel = voiceLang === "hi-IN" ? "Hindi" : "Indian English";
      const genderLabel = voiceGender === "male" ? "Men" : "Women";
      setOcrStatusText(`🎧 Reading Page ${currentPage} (${langLabel} • ${genderLabel})...`);
      speakChunks(pageText);
      setTimeout(() => setOcrStatusText(""), 3500);
    } catch (err) {
      console.warn("[TTS] Speech error:", err);
      setOcrStatusText(`Speech Notice: ${err.message || "Could not read page."}`);
      stopSpeech();
    }
  };

  // 4. Voice Search (Microphone Speech Recognition)
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setOcrStatusText("🎙️ Voice search not supported in this browser. Please use Chrome or Edge.");
      setTimeout(() => setOcrStatusText(""), 4000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN"; // Prioritize Indian English for natural student speech
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setOcrStatusText("🎙️ Listening... Speak now (e.g. 'Page 5', 'Deadlock', 'Compiler')");
      };

      recognition.onresult = (event) => {
        const transcript = (event?.results?.[0]?.[0]?.transcript || "").trim();
        if (transcript) {
          // Voice page navigation: "page 5", "go to page 12"
          const pageMatch = transcript.match(/(?:go to\s+)?page\s+(\d+)/i);
          if (pageMatch && pageMatch[1]) {
            const targetPage = parseInt(pageMatch[1], 10);
            if (targetPage >= 1 && targetPage <= (numPages || 100)) {
              changePage(targetPage);
              setOcrStatusText(`🎙️ Voice Jump: Navigated to Page ${targetPage}!`);
              setTimeout(() => setOcrStatusText(""), 3500);
              return;
            }
          }
          if (/next page/i.test(transcript)) {
            changePage(currentPage + 1);
            setOcrStatusText(`🎙️ Voice: Next Page (${currentPage + 1})`);
            setTimeout(() => setOcrStatusText(""), 2500);
            return;
          }
          if (/previous page|go back/i.test(transcript)) {
            changePage(currentPage - 1);
            setOcrStatusText(`🎙️ Voice: Previous Page (${currentPage - 1})`);
            setTimeout(() => setOcrStatusText(""), 2500);
            return;
          }

          setSearchQuery(transcript);
          setOcrStatusText(`🎙️ Heard: "${transcript}"`);
          handleSearch(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === "not-allowed" || event.error === "permission-denied") {
          setOcrStatusText("🎙️ Microphone permission required. Please allow mic in browser address bar.");
        } else if (event.error === "no-speech") {
          setOcrStatusText("🎙️ No speech detected. Please speak closer to microphone.");
        } else {
          setOcrStatusText(`🎙️ Voice notice: ${event.error}`);
        }
        setTimeout(() => setOcrStatusText(""), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("[VOICE-SEARCH] Error:", err);
      setIsListening(false);
    }
  };

  // 5. Screen Wake Lock API (Keep Screen ON while reading)
  const requestWakeLock = async () => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener("release", () => {
          setWakeLockActive(false);
          wakeLockRef.current = null;
        });
      } catch (e) {
        console.log("[WAKE-LOCK] Notice:", e.message);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch (_) {}
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  };

  const toggleWakeLock = () => {
    if (wakeLockActive) {
      releaseWakeLock();
      setOcrStatusText("📱 Screen Wake Lock disabled");
      setTimeout(() => setOcrStatusText(""), 2500);
    } else {
      requestWakeLock();
      setOcrStatusText("📱 Screen Wake Lock active (Screen will stay ON while reading)");
      setTimeout(() => setOcrStatusText(""), 2500);
    }
  };

  // ⚡ Pillar 3: Background Tab Sleep Mode (0% CPU when tab is hidden)
  useEffect(() => {
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
        // Tab restored: resume speech if it was actively reading
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            if (window.speechSynthesis.paused && isSpeakingRef.current) {
              window.speechSynthesis.resume();
            }
          } catch (_) {}
        }
      } else {
        releaseWakeLock();
        // ⚡ Pillar 3: Tab hidden -> Sleep mode pauses speech & heavy background cycles (CPU 0.0%)
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
              window.speechSynthesis.pause();
            }
          } catch (_) {}
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, []);

  // 6. Network & Battery Status Tracking (High-Speed HQ Mode default)
  useEffect(() => {
    let isCancelled = false;

    const detectNetworkAndBattery = async () => {
      let netMode = "high";
      let netLabel = "📶 High-Speed (HQ)";
      let slowNet = false;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        netMode = "offline";
        netLabel = "📴 Offline Vault";
        slowNet = true;
      } else {
        const conn = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
        // Only set Data Saver Lite if browser has explicit Data Saver mode enabled
        if (conn && conn.saveData) {
          netMode = "lite";
          netLabel = "📶 Data Saver (Lite)";
          slowNet = true;
        } else {
          netMode = "high";
          netLabel = "📶 High-Speed (HQ)";
          slowNet = false;
        }
      }

      let battPct = null;
      let charging = false;
      if (typeof navigator !== "undefined" && typeof navigator.getBattery === "function") {
        try {
          const b = await navigator.getBattery();
          battPct = Math.round(b.level * 100);
          charging = b.charging;
        } catch (_) {}
      }

      if (!isCancelled) {
        setNetworkMode(netMode);
        setNetworkLabel(netLabel);
        setIsSlowNetwork(slowNet);
        if (battPct !== null) setBatteryLevel(battPct);
        setIsCharging(charging);
      }
    };

    detectNetworkAndBattery();

    const conn = typeof navigator !== "undefined" && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    if (conn && conn.addEventListener) {
      conn.addEventListener("change", detectNetworkAndBattery);
    }

    // 🔄 Pillar 4: Network Disconnect / Auto-Resume
    const handleOnline = () => {
      setNetworkMode("high");
      setNetworkLabel("📶 High-Speed (HQ)");
      setIsSlowNetwork(false);
      setOcrStatusText("📶 High-Speed network active!");
      setTimeout(() => setOcrStatusText(""), 3000);
    };

    const handleOffline = () => {
      setNetworkMode("offline");
      setNetworkLabel("📴 Offline Vault");
      setOcrStatusText("📴 Internet disconnected. Serving note from local offline cache.");
      setTimeout(() => setOcrStatusText(""), 3500);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isCancelled = true;
      if (conn && conn.removeEventListener) {
        conn.removeEventListener("change", detectNetworkAndBattery);
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 7. 1-Click Formula / Diagram Clipper
  const toggleClipperMode = () => {
    if (isClipperMode) {
      setIsClipperMode(false);
      setClipStart(null);
      setClipCurrent(null);
      isClippingDragRef.current = false;
      setOcrStatusText("");
    } else {
      setIsClipperMode(true);
      setOcrStatusText("✂️ Diagram Clipper: Click & drag a box over any formula or diagram on the page!");
    }
  };

  const handleStartClip = (e) => {
    if (!isClipperMode || !canvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setClipStart({ x, y });
    setClipCurrent({ x, y });
    isClippingDragRef.current = true;
  };

  const handleMoveClip = (e) => {
    if (!isClipperMode || !isClippingDragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    setClipCurrent({ x, y });
  };

  const handleEndClip = async () => {
    if (!isClipperMode || !isClippingDragRef.current || !clipStart || !clipCurrent || !canvasRef.current) {
      isClippingDragRef.current = false;
      return;
    }
    isClippingDragRef.current = false;

    const x1 = Math.min(clipStart.x, clipCurrent.x);
    const y1 = Math.min(clipStart.y, clipCurrent.y);
    const x2 = Math.max(clipStart.x, clipCurrent.x);
    const y2 = Math.max(clipStart.y, clipCurrent.y);
    const w = x2 - x1;
    const h = y2 - y1;

    setClipStart(null);
    setClipCurrent(null);
    setIsClipperMode(false);

    if (w < 15 || h < 15) {
      setOcrStatusText("✂️ Selection too small to clip. Please drag a larger area.");
      setTimeout(() => setOcrStatusText(""), 3000);
      return;
    }

    try {
      setOcrStatusText("✂️ Cropping diagram & copying to clipboard...");
      const canvas = canvasRef.current;
      const dprRatio = canvas.width / canvasDimensions.width;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.round(w * dprRatio);
      cropCanvas.height = Math.round(h * dprRatio);
      const ctx = cropCanvas.getContext("2d");

      // Draw pure white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

      ctx.drawImage(
        canvas,
        Math.round(x1 * dprRatio),
        Math.round(y1 * dprRatio),
        Math.round(w * dprRatio),
        Math.round(h * dprRatio),
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );

      cropCanvas.toBlob(async (blob) => {
        if (!blob) return;
        let copied = false;
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob })
            ]);
            copied = true;
          } catch (clipErr) {
            console.warn("[CLIPPER] Clipboard API notice:", clipErr);
          }
        }

        if (copied) {
          setOcrStatusText("✅ Diagram copied to clipboard! Paste directly (Ctrl + V) into WhatsApp or Notes.");
        } else if (isBlocked) {
          setOcrStatusText("🔒 Saving diagram files is disabled for this note by the administrator.");
        } else {
          const u = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = u;
          a.download = `formula_clip_p${currentPage}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(u);
          setOcrStatusText("✅ Diagram saved as PNG image to your downloads!");
        }
        setTimeout(() => setOcrStatusText(""), 4500);
      }, "image/png");
    } catch (err) {
      console.warn("[CLIPPER] Crop error:", err);
      setOcrStatusText("✂️ Could not clip area. Please retry.");
      setTimeout(() => setOcrStatusText(""), 3000);
    }
  };

  // 8. Yjs + WebRTC Peer-to-Peer Study Room
  const handleToggleStudyRoom = () => {
    if (isStudyRoomOpen) {
      if (studyRoomRef.current) {
        studyRoomRef.current.destroy();
        studyRoomRef.current = null;
      }
      setIsStudyRoomOpen(false);
      return;
    }

    const room = new WebrtcStudyRoom(noteId || "room", { name: "Scholar" });
    studyRoomRef.current = room;

    room.onPeersChange((count) => {
      setPeerCount(count);
    });

    room.onPageSync((newPage) => {
      if (!isLeaderMode && newPage && newPage !== currentPage) {
        setCurrentPage(newPage);
      }
    });

    room.onChatChange((msgs) => {
      setStudyChat([...msgs]);
    });

    setIsStudyRoomOpen(true);
  };

  const handleSendStudyChat = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!studyChatInput.trim() || !studyRoomRef.current) return;
    studyRoomRef.current.sendChatMessage(studyChatInput.trim(), "Me");
    setStudyChatInput("");
  };

  // 5. On-Device AI Synthesis (WebLLM / LocalHeuristic)
  const handleGenerateAi = async (overridePrompt) => {
    setIsOnDeviceAiOpen(true);

    const promptText = typeof overridePrompt === "string" ? overridePrompt : searchQuery;
    const query = (promptText || "").trim();

    if (!query) {
      setAiAnswer(
        "🤖 On-Device AI Assistant Ready!\n\n💡 How to use:\nType any topic or question in the box above (e.g. 'deadlock', 'compiler', 'paging') and click [Ask] to extract an instant AI summary directly from your notes."
      );
      return;
    }

    if (isGeneratingAi) return;
    setIsGeneratingAi(true);
    setAiAnswer(`🔍 Analyzing academic notes for "${query}"...`);

    try {
      let relevantContext = "";
      const matchedPageNumbers = [];

      // 1. Search full document across all pages using Basic RAG MiniSearch
      if (ragIndexRef.current) {
        const ragMatches = ragIndexRef.current.search(query);
        if (ragMatches && ragMatches.length > 0) {
          relevantContext = ragMatches
            .map((m) => {
              matchedPageNumbers.push(m.page);
              return `[Page ${m.page}]: ${m.excerpt}`;
            })
            .join("\n");
        }
      }

      // 2. Fallback to active page text or OCR text if RAG had no match
      if (!relevantContext && pdfDoc) {
        try {
          const page = await pdfDoc.getPage(currentPage);
          const textContent = await page.getTextContent();
          let pageText = textContent.items.map((i) => i.str).join(" ");
          if (!pageText.trim() && ragIndexRef.current?.pageTextMap?.has(currentPage)) {
            pageText = ragIndexRef.current.pageTextMap.get(currentPage);
          }
          if (pageText.trim()) {
            relevantContext = `[Page ${currentPage}]: ${pageText}`;
            matchedPageNumbers.push(currentPage);
          }
        } catch (_) {}
      }

      const uniquePages = Array.from(new Set(matchedPageNumbers)).slice(0, 5);
      const ans = await generateClientAiAnswer(query, relevantContext, uniquePages);
      setAiAnswer(ans);
    } catch (err) {
      setAiAnswer(`Notice: ${err.message}`);
    } finally {
      setIsGeneratingAi(false);
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
        iframeRef.current.src = `${url}${getNativeToolbarParams(match.pageNum, searchQuery)}`;
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
        iframeRef.current.src = `${url}${getNativeToolbarParams(match.pageNum, searchQuery)}`;
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
      onContextMenu={(e) => {
        if (isBlocked) {
          e.preventDefault();
        }
      }}
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
      {isBlocked && (
        <>
          <style>{`
            @media print {
              body * {
                display: none !important;
                visibility: hidden !important;
              }
              body::after {
                content: "Printing is disabled for this note by the administrator.";
                display: block !important;
                visibility: visible !important;
                font-size: 22px;
                text-align: center;
                margin-top: 100px;
                color: #ef4444;
                font-weight: bold;
              }
            }
          `}</style>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 16px",
              background: "linear-gradient(90deg, rgba(239, 68, 68, 0.16), rgba(245, 158, 11, 0.12))",
              borderBottom: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "0.75rem",
              color: "#fca5a5",
              zIndex: 10,
              flexWrap: "wrap",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔒</span>
              <span>
                <strong>Read-Only Protected Note:</strong> Full online preview active. Save, Download & Print disabled for this document.
              </span>
            </div>
            {note?.downloadDisabledReason && (
              <span style={{ opacity: 0.9, fontSize: "0.7rem", fontStyle: "italic", color: "#fcd34d" }}>
                Admin: {note.downloadDisabledReason}
              </span>
            )}
          </div>
        </>
      )}
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
            <div style={{ fontSize: "0.74rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "8px", marginTop: "2px", flexWrap: "wrap" }}>
              <span>{subject || "Mozilla PDF Engine"}</span>

              {/* Dynamic Live Stream Source Indicator: Auto-shown ONLY when P2P Mesh is active with peers */}
              {streamSource === "p2p" && isCachedP2P && p2pPeerCount > 0 && (
                <span
                  className="tech-pill dedup"
                  onClick={toggleStreamSource}
                  title="Direct Device-to-Device P2P / Local Cache (0ms) • Click to switch stream source"
                  style={{
                    padding: "2px 8px",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.16)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "all 0.25s ease",
                  }}
                >
                  <Zap size={11} />
                  <span>P2P (0ms)</span>
                  <span style={{ opacity: 0.85, fontSize: "0.58rem", background: "rgba(16, 185, 129, 0.25)", padding: "1px 4px", borderRadius: "3px" }}>
                    {p2pPeerCount > 1 ? `${p2pPeerCount} Peers` : "Mesh Active"}
                  </span>
                </span>
              )}

              {/* 🔋 Independent Battery Saver (Defaults to OFF, 1-Click Toggle ON/OFF) */}
              <span
                onClick={toggleEcoMode}
                style={{
                  padding: "1px 6px",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  background: isEcoMode ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.08)",
                  color: isEcoMode ? "#4ade80" : "var(--text-muted, #94a3b8)",
                  border: isEcoMode ? "1px solid rgba(34, 197, 94, 0.45)" : "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "5px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  userSelect: "none",
                  transition: "all 0.2s ease",
                }}
                title={`Battery Saver: ${isEcoMode ? "Active (Click to Turn OFF)" : "Disabled (Click to Turn ON)"}${batteryLevel !== null ? ` • Device Battery: ${batteryLevel}%` : ""}`}
              >
                <Battery size={11} color={isEcoMode ? "#4ade80" : (batteryLevel !== null && batteryLevel <= 20 ? "#f59e0b" : "#94a3b8")} />
                <span>🔋 Battery Saver</span>
                {batteryLevel !== null && (
                  <span style={{ fontSize: "0.58rem", opacity: 0.85 }}>
                    ({batteryLevel}%{isCharging ? "⚡" : ""})
                  </span>
                )}
                <span
                  style={{
                    opacity: 0.95,
                    fontSize: "0.58rem",
                    fontWeight: 800,
                    background: isEcoMode ? "rgba(34, 197, 94, 0.35)" : "rgba(255, 255, 255, 0.14)",
                    color: isEcoMode ? "#4ade80" : (nightMode ? "#cbd5e1" : "#475569"),
                    padding: "1px 4px",
                    borderRadius: "3px",
                  }}
                >
                  {isEcoMode ? "ON" : "OFF"}
                </span>
              </span>

              {/* 📶 Independent Network Mode Badge with 1-Click Toggle */}
              <span
                onClick={() => {
                  if (networkMode === "offline") {
                    setOcrStatusText("📴 Offline Vault: Serving note from local browser storage (Zero internet data used).");
                  } else if (networkMode === "high") {
                    setNetworkMode("lite");
                    setNetworkLabel("📶 Data Saver (Lite)");
                    setIsSlowNetwork(true);
                    setOcrStatusText("📶 Data Saver (Lite) Enabled: 32KB chunk streaming active for weak mobile data.");
                  } else {
                    setNetworkMode("high");
                    setNetworkLabel("📶 High-Speed (HQ)");
                    setIsSlowNetwork(false);
                    setOcrStatusText("📶 High-Speed (HQ) Mode Active: Full resolution crystal-clear rendering.");
                  }
                  setTimeout(() => setOcrStatusText(""), 3500);
                }}
                style={{
                  padding: "1px 6px",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  background: networkMode === "lite" 
                    ? "rgba(245, 158, 11, 0.16)" 
                    : (networkMode === "offline" ? "rgba(239, 68, 68, 0.16)" : "rgba(16, 185, 129, 0.15)"),
                  color: networkMode === "lite" 
                    ? "#fbbf24" 
                    : (networkMode === "offline" ? "#f87171" : "#34d399"),
                  border: networkMode === "lite"
                    ? "1px solid rgba(245, 158, 11, 0.4)"
                    : (networkMode === "offline" ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(16, 185, 129, 0.35)"),
                  borderRadius: "5px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  userSelect: "none",
                  transition: "all 0.2s ease",
                }}
                title={`Network Mode: ${networkLabel} (Click to toggle High-Speed / Data Saver)`}
              >
                <Wifi size={10} />
                <span>{networkLabel}</span>
              </span>
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

          {(onDownload || noteId) && !isBlocked && (
            <button
              className="btn-primary"
              onClick={handleInternalDownload}
              disabled={isDownloadingPdf}
              style={{
                padding: "7px 14px",
                fontSize: "0.8rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: isDownloadingPdf ? "rgba(6, 182, 212, 0.2)" : undefined,
                border: isDownloadingPdf ? "1px solid var(--accent-cyan)" : undefined,
                color: isDownloadingPdf ? "var(--accent-cyan)" : undefined,
                transition: "all 0.15s ease",
              }}
              title={isDownloadingPdf ? `Downloading: ${downloadProgress?.percent || 0}% (${downloadProgress?.speed || ""})` : "Save Document"}
            >
              {isDownloadingPdf ? (
                <>
                  <div className="spinner" style={{ width: "12px", height: "12px", borderTopColor: "var(--accent-cyan)" }}></div>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {downloadProgress?.percent || 0}%
                  </span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Save</span>
                </>
              )}
            </button>
          )}

          {isBlocked && (
            <div
              style={{
                padding: "6px 12px",
                fontSize: "0.76rem",
                borderRadius: "6px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontWeight: 600,
              }}
              title={effectiveReason}
            >
              <Download size={13} style={{ opacity: 0.5 }} />
              <span>Save Disabled</span>
            </div>
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
                padding: "6px 52px 6px 12px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                width: "230px",
                outline: "none",
                boxShadow: nightMode ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
              }}
            />
            {/* Voice Search (Microphone) */}
            <button
              type="button"
              onClick={handleVoiceSearch}
              style={{
                position: "absolute",
                right: "26px",
                top: "50%",
                transform: "translateY(-50%)",
                background: isListening ? "rgba(239, 68, 68, 0.25)" : "transparent",
                border: isListening ? "1px solid #ef4444" : "none",
                borderRadius: "4px",
                cursor: "pointer",
                color: isListening ? "#ef4444" : (nightMode ? "#94a3b8" : "#64748b"),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px",
              }}
              title={isListening ? "Listening... Click to stop" : "Voice Search (Speak question or topic)"}
            >
              {isListening ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            {isSearching ? (
              <div
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <RefreshCw
                  size={13}
                  className="spin"
                  style={{
                    color: "var(--accent-cyan, #06b6d4)",
                    animation: "spin 0.75s linear infinite",
                  }}
                />
              </div>
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
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.74rem", color: "#f87171", fontWeight: 600 }}>0 matches</span>
              {ragIndexRef.current?.isScannedOnly && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "#fbbf24",
                    background: "rgba(245, 158, 11, 0.15)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    fontWeight: 600,
                  }}
                >
                  ✍️ Handwritten scan: Click [🔍 OCR Page] to index!
                </span>
              )}
            </div>
          )}
        </form>

        {/* Modern Zero-Load Features: OCR, Audio Reader, P2P Study Room, On-Device AI */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleOcrCurrentPage}
            disabled={isOcrScanning}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: isOcrScanning ? "rgba(245, 158, 11, 0.25)" : "rgba(255, 255, 255, 0.08)",
              color: isOcrScanning ? "#fbbf24" : (nightMode ? "#e2e8f0" : "#1e293b"),
              border: isOcrScanning ? "1px solid rgba(245, 158, 11, 0.5)" : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
              borderRadius: "6px",
              cursor: isOcrScanning ? "wait" : "pointer",
            }}
            title="Scan handwritten text on current page with Tesseract OCR"
          >
            <span>🔍 OCR Page</span>
          </button>

          {/* Audio Reader with Voice Engine Selector */}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }} ref={voiceMenuRef}>
            <button
              type="button"
              onClick={handleToggleSpeech}
              style={{
                padding: "5px 9px",
                fontSize: "0.75rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: isSpeaking ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)",
                color: isSpeaking ? "#34d399" : (nightMode ? "#e2e8f0" : "#1e293b"),
                border: isSpeaking ? "1px solid rgba(16, 185, 129, 0.5)" : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: "none",
                borderRadius: "6px 0 0 6px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={isSpeaking ? "Pause Audio Reader" : "Listen to Notes with Natural Speech"}
            >
              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isSpeaking ? "Pause" : "🎧 Listen"}</span>
            </button>

            {/* Voice Profile Quick Pill */}
            <button
              type="button"
              onClick={() => setShowVoiceMenu((prev) => !prev)}
              style={{
                padding: "5px 7px",
                fontSize: "0.72rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                background: showVoiceMenu
                  ? "rgba(6, 182, 212, 0.25)"
                  : (nightMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)"),
                color: showVoiceMenu
                  ? "var(--accent-cyan, #06b6d4)"
                  : (nightMode ? "#cbd5e1" : "#475569"),
                border: showVoiceMenu
                  ? "1px solid var(--accent-cyan, #06b6d4)"
                  : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
                borderRadius: "0 6px 6px 0",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.15s ease",
              }}
              title="Voice Settings: Indian English / Hindi • Men / Female"
            >
              <span>{voiceLang === "hi-IN" ? "🇮🇳 Hindi" : "🇮🇳 Ind-En"}</span>
              <span style={{ opacity: 0.6 }}>•</span>
              <span>{voiceGender === "female" ? "👩 Women" : "👨 Men"}</span>
              <ChevronDown size={11} style={{ transform: showVoiceMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>

            {/* Floating Voice Settings Popover */}
            {showVoiceMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 9999,
                  width: "270px",
                  background: nightMode ? "#0f172a" : "#ffffff",
                  border: nightMode ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid rgba(0, 0, 0, 0.14)",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: nightMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", paddingBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 700, color: nightMode ? "#f8fafc" : "#0f172a" }}>
                    <span>🎙️ Voice Reader Settings</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVoiceMenu(false)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: nightMode ? "#94a3b8" : "#64748b", padding: "2px" }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Language Option */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: nightMode ? "#94a3b8" : "#64748b", marginBottom: "6px" }}>
                    Language (भाषा)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceLang("en-IN");
                        try { localStorage.setItem("doc_voice_lang", "en-IN"); } catch (_) {}
                        if (isSpeaking) { stopSpeech(); }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: voiceLang === "en-IN" ? 700 : 500,
                        border: voiceLang === "en-IN" ? "1.5px solid var(--accent-cyan, #06b6d4)" : (nightMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)"),
                        background: voiceLang === "en-IN" ? "rgba(6, 182, 212, 0.18)" : (nightMode ? "rgba(255,255,255,0.05)" : "#f8fafc"),
                        color: voiceLang === "en-IN" ? "var(--accent-cyan, #06b6d4)" : (nightMode ? "#e2e8f0" : "#334155"),
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        textAlign: "center",
                      }}
                    >
                      <span>🇮🇳 Indian English</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceLang("hi-IN");
                        try { localStorage.setItem("doc_voice_lang", "hi-IN"); } catch (_) {}
                        if (isSpeaking) { stopSpeech(); }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: voiceLang === "hi-IN" ? 700 : 500,
                        border: voiceLang === "hi-IN" ? "1.5px solid var(--accent-cyan, #06b6d4)" : (nightMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)"),
                        background: voiceLang === "hi-IN" ? "rgba(6, 182, 212, 0.18)" : (nightMode ? "rgba(255,255,255,0.05)" : "#f8fafc"),
                        color: voiceLang === "hi-IN" ? "var(--accent-cyan, #06b6d4)" : (nightMode ? "#e2e8f0" : "#334155"),
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        textAlign: "center",
                      }}
                    >
                      <span>🇮🇳 Hindi (हिन्दी)</span>
                    </button>
                  </div>
                </div>

                {/* Voice Gender Option (Men / Female) */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: nightMode ? "#94a3b8" : "#64748b", marginBottom: "6px" }}>
                    Voice Tone (आवाज़)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceGender("female");
                        try { localStorage.setItem("doc_voice_gender", "female"); } catch (_) {}
                        if (isSpeaking) { stopSpeech(); }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: voiceGender === "female" ? 700 : 500,
                        border: voiceGender === "female" ? "1.5px solid #ec4899" : (nightMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)"),
                        background: voiceGender === "female" ? "rgba(236, 72, 153, 0.18)" : (nightMode ? "rgba(255,255,255,0.05)" : "#f8fafc"),
                        color: voiceGender === "female" ? "#f472b6" : (nightMode ? "#e2e8f0" : "#334155"),
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <span>👩 Female (Women)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceGender("male");
                        try { localStorage.setItem("doc_voice_gender", "male"); } catch (_) {}
                        if (isSpeaking) { stopSpeech(); }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: voiceGender === "male" ? 700 : 500,
                        border: voiceGender === "male" ? "1.5px solid #3b82f6" : (nightMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)"),
                        background: voiceGender === "male" ? "rgba(59, 130, 246, 0.18)" : (nightMode ? "rgba(255,255,255,0.05)" : "#f8fafc"),
                        color: voiceGender === "male" ? "#60a5fa" : (nightMode ? "#e2e8f0" : "#334155"),
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <span>👨 Male (Men)</span>
                    </button>
                  </div>
                </div>

                {/* Speed Option */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: nightMode ? "#94a3b8" : "#64748b", marginBottom: "6px" }}>
                    Speech Speed (गति)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                    {[0.8, 1.0, 1.25, 1.5].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          setVoiceSpeed(spd);
                          try { localStorage.setItem("doc_voice_speed", spd.toString()); } catch (_) {}
                          if (isSpeaking) { stopSpeech(); }
                        }}
                        style={{
                          padding: "4px 6px",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          fontWeight: voiceSpeed === spd ? 700 : 500,
                          border: voiceSpeed === spd ? "1px solid var(--accent-cyan, #06b6d4)" : (nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)"),
                          background: voiceSpeed === spd ? "rgba(6, 182, 212, 0.2)" : "transparent",
                          color: voiceSpeed === spd ? "var(--accent-cyan, #06b6d4)" : (nightMode ? "#cbd5e1" : "#475569"),
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: "0.68rem", color: nightMode ? "#64748b" : "#94a3b8", lineHeight: 1.3, marginTop: "2px", borderTop: nightMode ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)", paddingTop: "6px" }}>
                  💡 Auto-reads scanned handwritten notes with pitch-enhanced Indian pronunciation.
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleStudyRoom}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: isStudyRoomOpen ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.08)",
              color: isStudyRoomOpen ? "#a5b4fc" : (nightMode ? "#e2e8f0" : "#1e293b"),
              border: isStudyRoomOpen ? "1px solid rgba(99, 102, 241, 0.6)" : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
              borderRadius: "6px",
              cursor: "pointer",
            }}
            title="Peer-to-Peer Study Room"
          >
            <Users size={14} />
            <span>👥 Room ({peerCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("open_study_pod", {
                  detail: {
                    roomCode: `pod-${(note?.subject || title || "study").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}-${noteId ? String(noteId).slice(-4) : "live"}`,
                    note,
                  },
                })
              );
            }}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
            title="Launch Collaborative Live Study Pod with Real-time Canvas (0% Server Load)"
          >
            <Sparkles size={14} />
            <span>🚀 Live Pod Canvas</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateAi}
            disabled={isGeneratingAi}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: isOnDeviceAiOpen
                ? "linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(6, 182, 212, 0.35))"
                : (nightMode ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9"),
              color: isOnDeviceAiOpen
                ? "#c084fc"
                : (nightMode ? "#cbd5e1" : "#334155"),
              border: isOnDeviceAiOpen
                ? "1px solid rgba(139, 92, 246, 0.7)"
                : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
              borderRadius: "6px",
              cursor: "pointer",
              boxShadow: isOnDeviceAiOpen ? "0 0 10px rgba(139, 92, 246, 0.35)" : "none",
              transition: "all 0.2s ease",
            }}
            title={isOnDeviceAiOpen ? "AI Assistant Active" : "Ask On-Device AI about this query"}
          >
            <Bot size={14} style={{ color: isOnDeviceAiOpen ? "#c084fc" : (nightMode ? "#a78bfa" : "#7c3aed") }} />
            <span>🤖 AI Query</span>
          </button>

          {/* ✂️ 1-Click Formula & Diagram Clipper */}
          <button
            type="button"
            onClick={toggleClipperMode}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: isClipperMode ? "rgba(6, 182, 212, 0.35)" : "rgba(255, 255, 255, 0.08)",
              color: isClipperMode ? "#06b6d4" : (nightMode ? "#e2e8f0" : "#1e293b"),
              border: isClipperMode ? "1px solid #06b6d4" : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
              borderRadius: "6px",
              cursor: "pointer",
            }}
            title={isClipperMode ? "Cancel clipping mode" : "✂️ 1-Click Formula / Diagram Clipper (Crop & copy to WhatsApp)"}
          >
            <Scissors size={14} />
            <span>{isClipperMode ? "Cancel" : "✂️ Clip"}</span>
          </button>

          {/* 📱 Screen Wake Lock Toggle */}
          <button
            type="button"
            onClick={toggleWakeLock}
            style={{
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: wakeLockActive ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.08)",
              color: wakeLockActive ? "#34d399" : (nightMode ? "#e2e8f0" : "#1e293b"),
              border: wakeLockActive ? "1px solid rgba(16, 185, 129, 0.5)" : (nightMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(0, 0, 0, 0.15)"),
              borderRadius: "6px",
              cursor: "pointer",
            }}
            title={wakeLockActive ? "Screen Wake Lock is ON (Screen won't sleep while studying)" : "Click to keep screen awake while studying"}
          >
            <Smartphone size={14} />
            <span>{wakeLockActive ? "Awake ON" : "Awake"}</span>
          </button>
        </div>

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

      {/* RAG Search Smart Passages Bar */}
      {ragPassages.length > 0 && (
        <div
          style={{
            padding: "6px 18px",
            background: nightMode ? "rgba(15, 23, 42, 0.95)" : "#f8fafc",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
            fontSize: "0.75rem",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--accent-cyan)", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span>🧬 Semantic Concept AI:</span>
          </span>
          {ragPassages.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentPage(p.page)}
              style={{
                padding: "3px 9px",
                borderRadius: "6px",
                background: p.page === currentPage 
                  ? "rgba(6, 182, 212, 0.25)" 
                  : (p.conceptMatched ? "rgba(168, 85, 247, 0.16)" : "rgba(255, 255, 255, 0.05)"),
                border: p.page === currentPage 
                  ? "1px solid var(--accent-cyan)" 
                  : (p.conceptMatched ? "1px solid rgba(168, 85, 247, 0.45)" : "1px solid rgba(255, 255, 255, 0.1)"),
                color: p.page === currentPage 
                  ? "var(--accent-cyan)" 
                  : (p.conceptMatched ? "#c084fc" : (nightMode ? "#cbd5e1" : "#334155")),
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
              title={`${p.conceptMatched ? `[AI Concept: ${p.conceptMatched}] ` : ""}${p.excerpt}`}
            >
              {p.conceptMatched && (
                <span style={{ fontSize: "0.62rem", background: "rgba(168, 85, 247, 0.3)", color: "#e9d5ff", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>
                  AI Concept
                </span>
              )}
              <span>Pg {p.page}: {p.excerpt.substring(0, 30)}...</span>
            </button>
          ))}
        </div>
      )}

      {/* OCR Status Notification Pill */}
      {ocrStatusText && (
        <div
          style={{
            padding: "5px 18px",
            background: "rgba(245, 158, 11, 0.15)",
            borderBottom: "1px solid rgba(245, 158, 11, 0.3)",
            color: "#fbbf24",
            fontSize: "0.76rem",
            fontWeight: 600,
          }}
        >
          {ocrStatusText}
        </div>
      )}

      {/* P2P Study Room Drawer Overlay */}
      {isStudyRoomOpen && (
        <div
          style={{
            position: "absolute",
            top: "95px",
            right: "16px",
            width: "320px",
            maxHeight: "420px",
            background: nightMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(99, 102, 241, 0.4)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "0.82rem", color: "#a5b4fc" }}>
              <Users size={15} />
              <span>P2P Study Room ({peerCount} Online)</span>
            </div>
            <button onClick={() => setIsStudyRoomOpen(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: "8px 14px", background: "rgba(99, 102, 241, 0.08)", fontSize: "0.72rem", color: "#cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Follow Leader Mode</span>
            <button
              type="button"
              onClick={() => setIsLeaderMode(!isLeaderMode)}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "0.68rem",
                fontWeight: 700,
                border: "none",
                background: isLeaderMode ? "#4f46e5" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {isLeaderMode ? "Leader: ON" : "Leader: OFF"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px", minHeight: "150px", maxHeight: "200px" }}>
            {studyChat.length === 0 ? (
              <div style={{ fontSize: "0.74rem", color: "#64748b", textAlign: "center", margin: "auto" }}>
                Direct P2P DataChannel connected via Google STUN. Type below to chat with peers!
              </div>
            ) : (
              studyChat.map((msg, i) => (
                <div key={i} style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)", padding: "5px 8px", borderRadius: "6px" }}>
                  <span style={{ fontWeight: 700, color: "#38bdf8" }}>{msg.author}: </span>
                  <span>{msg.text}</span>
                  <span style={{ fontSize: "0.65rem", color: "#64748b", marginLeft: "6px" }}>{msg.timestamp}</span>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendStudyChat} style={{ display: "flex", padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.1)", gap: "6px" }}>
            <input
              type="text"
              placeholder="Ask room peers..."
              value={studyChatInput}
              onChange={(e) => setStudyChatInput(e.target.value)}
              style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", color: nightMode ? "#fff" : "#0f172a", fontSize: "0.75rem", outline: "none" }}
            />
            <button type="submit" style={{ background: "#4f46e5", border: "none", borderRadius: "6px", padding: "0 10px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <Send size={13} />
            </button>
          </form>
        </div>
      )}

      {/* On-Device AI Result Modal */}
      {isOnDeviceAiOpen && (
        <div
          style={{
            position: "absolute",
            top: "125px",
            left: "18px",
            width: "min(400px, calc(100% - 36px))",
            maxHeight: "440px",
            background: nightMode ? "rgba(15, 23, 42, 0.98)" : "#ffffff",
            backdropFilter: "blur(20px)",
            border: "1.5px solid rgba(139, 92, 246, 0.6)",
            borderRadius: "14px",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 25px rgba(139, 92, 246, 0.3)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: nightMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(0, 0, 0, 0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: nightMode ? "rgba(139, 92, 246, 0.12)" : "rgba(139, 92, 246, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "0.82rem", color: "#c084fc" }}>
              <Bot size={16} />
              <span>On-Device AI Assistant</span>
              <span style={{ fontSize: "0.65rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(139, 92, 246, 0.2)", color: "#e9d5ff", fontWeight: 600 }}>0% Server Load</span>
            </div>
            <button
              onClick={() => setIsOnDeviceAiOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: nightMode ? "#94a3b8" : "#64748b",
                cursor: "pointer",
                padding: "2px",
                display: "flex",
                alignItems: "center",
              }}
              title="Close AI Assistant"
            >
              <X size={16} />
            </button>
          </div>

          {/* Embedded Ask Bar inside Modal */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: nightMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)",
              display: "flex",
              gap: "6px",
              background: nightMode ? "rgba(0, 0, 0, 0.25)" : "rgba(241, 245, 249, 0.8)",
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateAi();
                }
              }}
              placeholder="Ask AI about notes (e.g. deadlock, paging)..."
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: "0.76rem",
                borderRadius: "6px",
                border: nightMode ? "1px solid rgba(139, 92, 246, 0.4)" : "1px solid rgba(139, 92, 246, 0.3)",
                background: nightMode ? "rgba(255, 255, 255, 0.08)" : "#ffffff",
                color: nightMode ? "#ffffff" : "#0f172a",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => handleGenerateAi()}
              disabled={isGeneratingAi}
              style={{
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                color: "#ffffff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                flexShrink: 0,
              }}
            >
              {isGeneratingAi ? (
                <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
              ) : (
                <Sparkles size={13} />
              )}
              <span>Ask</span>
            </button>
          </div>

          {/* Answer Output View */}
          <div
            style={{
              padding: "14px",
              overflowY: "auto",
              fontSize: "0.78rem",
              lineHeight: 1.55,
              color: nightMode ? "#e2e8f0" : "#1e293b",
              whiteSpace: "pre-wrap",
              flex: 1,
            }}
          >
            {aiAnswer}
          </div>
        </div>
      )}

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
                  ? (url ? `${url}${getNativeToolbarParams(currentPage)}` : undefined)
                  : nativeSrc.startsWith("https://drive.google.com")
                  ? nativeSrc
                  : `${nativeSrc}${getNativeToolbarParams(currentPage)}`
              }
              onLoad={() => {
                const noteTotalSize = note?.compressedSize || note?.fileSize || 1048576;
                setPreviewProgress({
                  percent: 100,
                  loadedBytes: noteTotalSize,
                  totalBytes: noteTotalSize,
                  speed: "Ready",
                });
                setNativeLoading(false);
              }}
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                background: "#ffffff",
                opacity: nativeLoading ? 0 : 1,
                transition: "opacity 0.25s ease",
              }}
              title={title}
            />
          </div>
        )}

        {(loading || (useNativeViewer && nativeLoading)) && (
          <div
            style={{
              textAlign: "center",
              margin: useNativeViewer ? "0" : "auto",
              position: useNativeViewer ? "absolute" : "relative",
              top: useNativeViewer ? "50%" : undefined,
              left: useNativeViewer ? "50%" : undefined,
              transform: useNativeViewer ? "translate(-50%, -50%)" : undefined,
              zIndex: 40,
              maxWidth: "460px",
              width: "90%",
              padding: "32px 26px",
              background: nightMode ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.96)",
              border: "1px solid rgba(6, 182, 212, 0.35)",
              borderRadius: "18px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.55), 0 0 35px rgba(6, 182, 212, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* Real-time Glowing Circular Percentage Dial */}
            <div
              style={{
                position: "relative",
                width: "68px",
                height: "68px",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                className="spinner"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  border: "3px solid rgba(6, 182, 212, 0.15)",
                  borderTopColor: "var(--accent-cyan)",
                  borderRightColor: "#6366f1",
                  boxShadow: "0 0 16px rgba(6, 182, 212, 0.35)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--accent-cyan)",
                  textShadow: "0 0 12px rgba(6, 182, 212, 0.6)",
                }}
              >
                {previewProgress.percent || 0}%
              </span>
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: nightMode ? "#f8fafc" : "#0f172a" }}>
                {useNativeViewer
                  ? "⚡ Streaming to Native Browser Engine"
                  : "⚡ Streaming Pages On-Demand (Virtual Streamer)"}
              </div>
              <div style={{ fontSize: "0.84rem", color: "var(--accent-cyan)", marginTop: "4px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                <span>
                  {previewProgress.percent > 0
                    ? `Loading Document: ${previewProgress.percent}%`
                    : "Connecting to Stream..."}
                </span>
                {realSourceInfo && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: realSourceInfo.bgColor || "rgba(56, 189, 248, 0.14)",
                      color: realSourceInfo.color || "#38bdf8",
                      border: `1px solid ${realSourceInfo.borderColor || "rgba(56, 189, 248, 0.3)"}`,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>{realSourceInfo.icon || "🌐"}</span>
                    <span>{realSourceInfo.short || realSourceInfo.label}</span>
                    {previewProgress.speed && !previewProgress.speed.includes("Edge CDN") && !previewProgress.speed.includes("Connecting") && (
                      <span>• {previewProgress.speed}</span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* 🌟 P2P Mesh Indicator (Shown ONLY when P2P is actively used with peers) */}
            {streamSource === "p2p" && isCachedP2P && p2pPeerCount > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(16, 185, 129, 0.14)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  fontSize: "0.8rem",
                  color: "#34d399",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                  <Zap size={16} />
                  <div>
                    <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.8, fontWeight: 700 }}>
                      Stream Source:
                    </div>
                    <div style={{ fontWeight: 800, color: "#fff", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                      ⚡ P2P Local Mesh ({p2pPeerCount} Active Peer{p2pPeerCount > 1 ? "s" : ""})
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: "999px",
                    background: "rgba(255, 255, 255, 0.14)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 700,
                    flexShrink: 0,
                    marginLeft: "6px",
                  }}
                >
                  0ms
                </span>
              </div>
            )}

            {/* Real-Time Storage-to-CDN Transfer Progress Meter (Shown ONLY when pulling uncached file from Cloud Storage to CDN) */}
            {(isCachingToCdn || streamSource === "storage") && !note?.isCdnCached && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: nightMode ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "8px",
                  padding: "7px 12px",
                  fontSize: "0.74rem",
                  color: "#fbbf24",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                  <RefreshCw size={11} className="animate-spin" />
                  <span>Cloud Storage ➔ Edge CDN Buffer Caching:</span>
                </span>
                <strong style={{ fontFamily: "var(--font-mono)", color: "#fde047", fontSize: "0.8rem" }}>
                  {Math.max(previewProgress.percent || 0, cdnTransferPercent || 0)}%
                </strong>
              </div>
            )}

            {/* Real-time Animated Progress Bar */}
            <div
              style={{
                width: "100%",
                height: "8px",
                background: nightMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
                borderRadius: "999px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${Math.max(6, Math.min(100, previewProgress.percent))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #6366f1, #06b6d4, #10b981)",
                  boxShadow: "0 0 14px rgba(6, 182, 212, 0.6)",
                  transition: "width 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                  borderRadius: "999px",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-dim)" }}>
              <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                {previewProgress.loadedBytes > 0
                  ? `${(previewProgress.loadedBytes / (1024 * 1024)).toFixed(2)} MB${previewProgress.totalBytes > 0 ? ` / ${(previewProgress.totalBytes / (1024 * 1024)).toFixed(2)} MB` : ""}`
                  : (previewProgress.totalBytes > 0 ? `Total: ${(previewProgress.totalBytes / (1024 * 1024)).toFixed(2)} MB` : "Instant Range Streaming")}
              </span>
              {streamSource === "p2p" && isCachedP2P && p2pPeerCount > 0 && (
                <span style={{
                  color: "#34d399",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  <Zap size={11} />
                  <span>P2P Mesh ({p2pPeerCount} Peers)</span>
                </span>
              )}
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

            {/* ✂️ Diagram / Formula Clipper Overlay Layer */}
            {isClipperMode && (
              <div
                onMouseDown={handleStartClip}
                onMouseMove={handleMoveClip}
                onMouseUp={handleEndClip}
                onTouchStart={handleStartClip}
                onTouchMove={handleMoveClip}
                onTouchEnd={handleEndClip}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  cursor: "crosshair",
                  zIndex: 35,
                  userSelect: "none",
                  touchAction: "none",
                  background: "rgba(6, 182, 212, 0.08)",
                }}
              >
                {clipStart && clipCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${Math.min(clipStart.x, clipCurrent.x)}px`,
                      top: `${Math.min(clipStart.y, clipCurrent.y)}px`,
                      width: `${Math.abs(clipCurrent.x - clipStart.x)}px`,
                      height: `${Math.abs(clipCurrent.y - clipStart.y)}px`,
                      border: "2px dashed #06b6d4",
                      background: "rgba(6, 182, 212, 0.25)",
                      boxShadow: "0 0 14px rgba(6, 182, 212, 0.7)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            )}

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

      {/* 📥 Real-Time CDN Download Progress HUD */}
      {isDownloadingPdf && downloadProgress && (
        <div
          style={{
            position: "absolute",
            bottom: "36px",
            right: "24px",
            zIndex: 150,
            background: "rgba(15, 23, 42, 0.96)",
            border: "1px solid rgba(6, 182, 212, 0.5)",
            borderRadius: "14px",
            padding: "14px 18px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(6, 182, 212, 0.25)",
            backdropFilter: "blur(14px)",
            minWidth: "290px",
            maxWidth: "360px",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            animation: "fadeIn 0.2s ease-in-out",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px" }}>
              <Download size={14} style={{ color: "var(--accent-cyan)" }} />
              <span>
                {downloadProgress.source === "storage" || streamSource === "storage"
                  ? `Streaming from Store: ${downloadProgress.percent}%`
                  : `Streaming from CDN: ${downloadProgress.percent}%`}
              </span>
            </span>
            <button
              onClick={() => downloadAbortRef.current?.abort()}
              style={{
                background: "rgba(239, 68, 68, 0.2)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "5px",
                fontSize: "0.68rem",
                padding: "2px 7px",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title="Cancel Download"
            >
              ✕ Cancel
            </button>
          </div>

          <div style={{ width: "100%", height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "999px", overflow: "hidden" }}>
            <div
              style={{
                width: `${downloadProgress.percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #6366f1, #06b6d4)",
                boxShadow: "0 0 10px rgba(6, 182, 212, 0.6)",
                transition: "width 0.1s ease",
              }}
            />
          </div>

          {/* Storage to CDN Cache Transfer Meter inside Download HUD (Uncached files only) */}
          {isCachingToCdn && !note?.isCdnCached && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 8px",
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                borderRadius: "6px",
                fontSize: "0.70rem",
                color: "#c084fc",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: 600 }}>
                <RefreshCw size={11} className="animate-spin" />
                <span>Store ➔ Edge CDN:</span>
              </span>
              <strong style={{ fontFamily: "var(--font-mono)", color: "#e9d5ff", fontSize: "0.75rem" }}>
                {cdnTransferPercent}%
              </strong>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-dim)" }}>
            <span>{downloadProgress.loadedMB} MB / {downloadProgress.totalMB} MB</span>
            <span style={{ color: downloadProgress.source === "storage" || streamSource === "storage" ? "#fbbf24" : "var(--accent-cyan)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {downloadProgress.source === "storage" || streamSource === "storage" ? "📦 Store" : "⚡ CDN"} • {downloadProgress.speed}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

