/**
 * ⚡ 4-Tier Zero-Downtime Waterfall Document Engine
 *
 * Sequence:
 *   Tier 1: IndexedDB (Client Local Storage & In-Memory Cache) -> 0ms Cache Hit
 *   Tier 2: Local Server (with 3.5s fast timeout)
 *   Tier 3: Server SSD Disk (NVMe / RAM Cache via Zero-Copy) -> 100ms
 *   Tier 4: Cloud Storage (Primary Vault + Auto-Save to Server SSD)
 */

import { getAnyCachedNoteBuffer, saveNoteOffline } from "./offlineQueue";
import { cacheNoteBuffer } from "./p2pMesh";
import { loadAuthSession } from "./authIndexedDb";
import { BACKEND_CLUSTER_URLS } from "../config/clientConfig";

// Determine valid Cloudflare Worker URL (Tier 2 Edge CDN Worker)
const rawWorkerEnv =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CF_WORKER_URL
    ? String(import.meta.env.VITE_CF_WORKER_URL).trim()
    : "";
export const CF_WORKER = rawWorkerEnv;

// Circuit breaker cooldown if CF_WORKER is unreachable / times out
let workerCooldownUntil = 0;

/**
 * Verifies that an ArrayBuffer is a valid binary document (not an HTML error page or JSON error payload)
 */
export function isValidPdfArrayBuffer(buf) {
  if (!buf || !(buf.byteLength > 200)) return false;
  try {
    const u8 = new Uint8Array(buf, 0, Math.min(64, buf.byteLength));
    // Check for standard %PDF- signature anywhere in first 32 bytes
    for (let i = 0; i <= Math.min(24, u8.length - 4); i++) {
      if (u8[i] === 0x25 && u8[i + 1] === 0x50 && u8[i + 2] === 0x44 && u8[i + 3] === 0x46) {
        return true;
      }
    }
    // Reject HTML or JSON error payloads masquerading as 200 OK
    const prefix = String.fromCharCode(...u8).trim().toLowerCase();
    if (
      prefix.startsWith("<!doctype") ||
      prefix.startsWith("<html") ||
      prefix.startsWith("<head") ||
      prefix.startsWith("<body") ||
      prefix.startsWith('{"success":false') ||
      prefix.startsWith('{"error":')
    ) {
      return false;
    }
    return true;
  } catch {
    return buf.byteLength > 500;
  }
}

/**
 * Verifies that a fetch Response is a valid document stream (not HTML or JSON error)
 */
function isValidPdfStreamResponse(res) {
  if (!res || (!res.ok && res.status !== 206)) return false;
  const ct = (res.headers?.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/json")) return false;
  return true;
}

export const originBase =
  typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : import.meta.env?.VITE_BACKEND_URL || "";

export const CDN_ENDPOINTS = CF_WORKER ? [CF_WORKER, originBase] : [originBase];

/**
 * Extracts normalized Real Source metadata from HTTP response headers
 */
export function parseSourceFromHeaders(headers) {
  if (!headers) {
    return {
      id: "unknown",
      label: "Connecting...",
      short: "Connecting...",
      colo: "",
      icon: "🌐",
      color: "#38bdf8",
      bgColor: "rgba(56, 189, 248, 0.12)",
      borderColor: "rgba(56, 189, 248, 0.3)",
    };
  }
  const get = (k) => (headers.get ? headers.get(k) : headers[k]) || "";

  const realSource = get("x-real-source");
  const sourceLabel = get("x-source-label");
  const cfCache = (get("cf-cache-status") || "").toUpperCase();
  const xEdgeCache = (get("x-edge-cache") || "").toUpperCase();
  const edgeLocation = get("x-edge-location") || get("cf-ray")?.split("-")[1] || "";
  const dataSource = get("x-data-source");

  // Tier 3: In-Memory RAM Buffer (0ms) - Check before generic HIT headers
  if (realSource === "RAM_BUFFER" || dataSource === "ram") {
    return {
      id: "ram",
      label: sourceLabel || "In-Memory RAM Buffer (0ms)",
      short: "RAM Buffer (0ms)",
      details: "In-Memory RAM Buffer Pool • 0ms Microsecond Stream",
      colo: "RAM",
      icon: "🧠",
      color: "#c084fc",
      bgColor: "rgba(168, 85, 247, 0.14)",
      borderColor: "rgba(168, 85, 247, 0.35)",
    };
  }

  // Tier 3: Local NVMe SSD Disk Cache (1ms) - Check before generic HIT headers
  if (realSource === "DISK_CACHE" || dataSource === "disk") {
    return {
      id: "disk",
      label: sourceLabel || "Local NVMe SSD Disk Cache (1ms)",
      short: "SSD Cache (1ms)",
      details: "Local NVMe SSD Zero-Copy Stream • 1ms Latency",
      colo: "NVMe",
      icon: "💽",
      color: "#4ade80",
      bgColor: "rgba(34, 197, 94, 0.14)",
      borderColor: "rgba(34, 197, 94, 0.35)",
    };
  }

  // Tier 2: Cloudflare Edge CDN Worker
  if (
    realSource === "CLOUDFLARE_WORKER" ||
    xEdgeCache === "HIT" ||
    cfCache === "HIT" ||
    dataSource === "cdn"
  ) {
    return {
      id: "worker",
      label: sourceLabel || `Local Server (${edgeLocation || "Global"} Node)`,
      short: "Local Server (1ms)",
      details: edgeLocation
        ? `Local Server (${edgeLocation}) • 0ms Cache HIT`
        : "Local Server • 0ms Cache HIT",
      colo: edgeLocation || "Edge",
      icon: "⚡",
      color: "#38bdf8",
      bgColor: "rgba(56, 189, 248, 0.14)",
      borderColor: "rgba(56, 189, 248, 0.35)",
    };
  }

  // Tier 4: Primary Cloud Storage Vault (Telegram MTProto)
  if (
    realSource === "ACADEMIC_CLOUD_VAULT" ||
    realSource === "CLOUD_STORAGE" ||
    realSource === "TELEGRAM_STORAGE" ||
    realSource === "TELEGRAM_BOT_API" ||
    dataSource === "storage" ||
    dataSource === "bot_api" ||
    xEdgeCache === "MISS" ||
    cfCache === "MISS"
  ) {
    return {
      id: "storage",
      label: sourceLabel || "Academic Cloud Storage Vault (Fast Stream)",
      short: "Cloud Vault",
      details: "Streaming from Cloud Storage • Caching to Server SSD",
      colo: "Origin",
      icon: "☁️",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.14)",
      borderColor: "rgba(245, 158, 11, 0.35)",
    };
  }

  return {
    id: "origin",
    label: sourceLabel || "Academic Cloud Node",
    short: "Cloud Node",
    details: "Primary Academic Cloud Node",
    colo: edgeLocation || "Origin",
    icon: "🌐",
    color: "#94a3b8",
    bgColor: "rgba(148, 163, 184, 0.14)",
    borderColor: "rgba(148, 163, 184, 0.35)",
  };
}

/**
 * Trigger reliable browser download via anchor tag with 45s delayed revocation
 * Or saves directly using Native File System Access API if fileHandle is provided
 */
export async function triggerBrowserDownload(arrayBuffer, fileName, fileHandle = null) {
  if (typeof window === "undefined" || !arrayBuffer) return null;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return blob;
    } catch (fsErr) {
      console.warn("[FS-API] Direct save failed, falling back to anchor download:", fsErr);
    }
  }
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = fileName || "Free_Study_Material.pdf";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (a.parentNode) document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (_) {}
  }, 45000);
  return blob;
}

/**
 * Cache buffer locally in memory, Browser Cache API (<5ms), and IndexedDB offline vault
 */
export function saveToClientOfflineStorage(noteId, note, arrayBuffer) {
  if (!noteId || !isValidPdfArrayBuffer(arrayBuffer)) return;
  try {
    const sId = String(noteId).trim();
    const safeBuffer = arrayBuffer.slice ? arrayBuffer.slice(0) : arrayBuffer;
    if (typeof window !== "undefined") {
      window.__FSM_LOADED_PDF_BUFFERS__ = window.__FSM_LOADED_PDF_BUFFERS__ || {};
      window.__FSM_LOADED_PDF_BUFFERS__[sId] = safeBuffer;
    }
    // 1. Save into Browser Cache API (fastest <5ms read on mobile & desktop, immune to IndexedDB lock delays)
    if (typeof caches !== "undefined" && typeof Response !== "undefined") {
      caches.open("fsm-pdf-cache-v1").then((cache) => {
        const res = new Response(safeBuffer.slice(0), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(safeBuffer.byteLength),
            "X-FSM-Cached-At": String(Date.now()),
          },
        });
        return cache.put(`/api/notes/${sId}/stream.pdf`, res);
      }).catch(() => {});
    }
    // 2. Save to BOTH IndexedDB stores (fsm_offline_vault AND fsm_p2p_cache_v1)
    saveNoteOffline(note || { id: sId, title: "Academic Document" }, safeBuffer).catch(() => {});
    cacheNoteBuffer(sId, safeBuffer).catch(() => {});
  } catch (_) {}
}

/**
 * Streams response body chunk-by-chunk with live progress calculation
 */
async function streamResponseBody(response, { onProgress, tier, tierLabel, icon, source, expectedSize = 0, signal }) {
  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : (expectedSize || 0);

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  const startTime = performance.now();
  let prevLoaded = 0;
  let prevTime = startTime;

  while (true) {
    if (signal && signal.aborted) {
      try { reader.cancel(); } catch (_) {}
      throw new Error("Stream cancelled by user");
    }

    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;

    const now = performance.now();
    const timeDiff = (now - prevTime) / 1000;
    const loadedDiff = loaded - prevLoaded;

    let speedBytes = timeDiff > 0.08 ? loadedDiff / timeDiff : 0;
    if (speedBytes <= 0) {
      const totalElapsed = (now - startTime) / 1000;
      speedBytes = totalElapsed > 0 ? loaded / totalElapsed : 0;
    }
    prevLoaded = loaded;
    prevTime = now;

    const speedMB = (speedBytes / (1024 * 1024)).toFixed(1);
    const speedFormatted = Number(speedMB) > 0.1 ? `${speedMB} MB/s` : `${Math.round(speedBytes / 1024)} KB/s`;

    const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : Math.min(95, Math.round((loaded / (4 * 1024 * 1024)) * 60));
    const remainingBytes = total > 0 ? Math.max(0, total - loaded) : 0;
    const secondsRemaining = speedBytes > 0 && remainingBytes > 0 ? (remainingBytes / speedBytes).toFixed(1) : "0";

    onProgress({
      tier,
      tierLabel,
      icon,
      source,
      percent,
      speed: speedFormatted,
      loadedMB: (loaded / (1024 * 1024)).toFixed(2),
      totalMB: total > 0 ? (total / (1024 * 1024)).toFixed(2) : (loaded / (1024 * 1024)).toFixed(2),
      timeRemaining: Number(secondsRemaining) > 0 ? `~${secondsRemaining}s left` : "Finalizing...",
    });
  }

  // Combine chunks into single ArrayBuffer
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  onProgress({
    tier,
    tierLabel,
    icon,
    source,
    percent: 100,
    speed: "Ready",
    loadedMB: (loaded / (1024 * 1024)).toFixed(2),
    totalMB: (loaded / (1024 * 1024)).toFixed(2),
    timeRemaining: "Ready",
  });

  return combined.buffer;
}

/**
 * ⚡ CORE WATERFALL: acquireNoteDocument
 *
 * Implements the exact 4-tier waterfall:
 *   Tier 1: IndexedDB (Client Local Storage) -> 0ms Cache Hit
 *   Tier 2: Local Server -> 3.5s Fast Timeout
 *   Tier 3: Server SSD Disk (NVMe / RAM) -> 100ms Zero-Copy
 *   Tier 4: Cloud Storage (Primary Vault) -> Stream + Auto-Save to SSD
 *
 * Used by BOTH "Read / Preview" and "Download"
 */
function resolveClientAuthToken(explicitToken) {
  if (explicitToken) return explicitToken;
  if (typeof window === "undefined") return "";
  try {
    const memToken =
      window.__FSM_AUTH_TOKEN__ ||
      (window.__FSM_AUTH_SESSION__ && window.__FSM_AUTH_SESSION__.token);
    if (memToken) return memToken;
    return (
      localStorage.getItem("vault_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("fsm_token") ||
      sessionStorage.getItem("vault_token") ||
      sessionStorage.getItem("fsm_token") ||
      ""
    );
  } catch {
    return "";
  }
}

export async function acquireNoteDocument(noteId, {
  mode = "download", // "download" | "read"
  fileName = "",
  note = null,
  token = null,
  signal = null,
  fileHandle = null,
  onProgress = () => {},
} = {}) {
  const cleanId = String(noteId).trim();
  let authToken = resolveClientAuthToken(token);
  if (!authToken) {
    try {
      const restored = await loadAuthSession();
      if (restored?.token) {
        authToken = restored.token;
      }
    } catch {}
  }

  const candidateRaw = (note?.originalName || note?.fileName || fileName || note?.title || `Document_${cleanId}`);
  let cleanName = String(candidateRaw)
    .replace(/[/\\?%*:|"<>]/g, "_")
    .trim();
  if (!cleanName.toLowerCase().endsWith(".pdf")) cleanName += ".pdf";

  // =========================================================================
  // TIER 1: IndexedDB (Client Local Storage & In-Memory Cache)
  // =========================================================================
  onProgress({
    tier: 1,
    tierLabel: "Tier 1: IndexedDB (Client Local Storage)",
    percent: 5,
    speed: "Checking local cache (0ms)...",
    loadedMB: "0",
    totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
    timeRemaining: "Estimating...",
    source: "local",
    icon: "📱",
  });

  try {
    const localBuf = await Promise.race([
      getAnyCachedNoteBuffer(cleanId),
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (localBuf && isValidPdfArrayBuffer(localBuf)) {
      // 🎉 TIER 1 CACHE HIT (0ms)!
      onProgress({
        tier: 1,
        tierLabel: "Tier 1: IndexedDB (Cache Hit • 0ms)",
        percent: 100,
        speed: "Instant 0ms Save / Open",
        loadedMB: (localBuf.byteLength / (1024 * 1024)).toFixed(2),
        totalMB: (localBuf.byteLength / (1024 * 1024)).toFixed(2),
        timeRemaining: "Ready",
        source: "local",
        icon: "📱",
      });

      let blob = null;
      if (mode === "download") {
        blob = await triggerBrowserDownload(localBuf, cleanName, fileHandle);
      } else {
        blob = new Blob([localBuf], { type: "application/pdf" });
      }
      return { buffer: localBuf, blob, source: "local", tier: 1 };
    }
  } catch (t1Err) {
    console.debug("[WATERFALL] Tier 1 cache lookup notice:", t1Err.message);
  }

  // =========================================================================
  // TIER 2: Edge CDN (Cloudflare Global Edge Cache • 1ms)
  // =========================================================================
  onProgress({
    tier: 2,
    tierLabel: "Tier 2: Edge CDN (Cloudflare Global)",
    percent: 15,
    speed: "Edge CDN Cache Check (1ms)...",
    loadedMB: "0",
    totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
    timeRemaining: "Estimating...",
    source: "worker",
    icon: "⚡",
  });

  if (CF_WORKER && Date.now() >= workerCooldownUntil) {
    try {
      const workerUrl = `${CF_WORKER}/api/notes/${cleanId}/stream.pdf?${
        mode === "download" ? "download=1" : "preview=1"
      }${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}&filename=${encodeURIComponent(cleanName)}`;

      // Cross-origin CF Worker uses Bearer token + ?token query; avoid credentials:"include" so custom domains never fail CORS wildcard rules
      const isCrossOriginWorker = (() => {
        try {
          return typeof window !== "undefined" && new URL(CF_WORKER).origin !== window.location.origin;
        } catch {
          return true;
        }
      })();

      const workerController = new AbortController();
      // 7.5s response-header timeout (aborts only if headers never arrive; cleared immediately once streaming begins)
      const workerTimeout = setTimeout(() => workerController.abort(), 7500);
      if (signal) {
        signal.addEventListener("abort", () => workerController.abort(), { once: true });
      }

      const workerRes = await fetch(workerUrl, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        signal: workerController.signal,
        credentials: isCrossOriginWorker ? "omit" : "include",
      });
      clearTimeout(workerTimeout);

      if (isValidPdfStreamResponse(workerRes)) {
        // Inspect actual upstream/edge headers so UI accurately reports Tier 2 Edge HIT vs Tier 3 SSD vs Tier 4 Vault
        const wReal = (workerRes.headers.get("x-real-source") || "").toUpperCase();
        const wCf = (workerRes.headers.get("cf-cache-status") || "").toUpperCase();
        const wEdge = (workerRes.headers.get("x-edge-cache") || "").toUpperCase();
        const wData = (workerRes.headers.get("x-data-source") || "").toLowerCase();

        const isSsdViaWorker =
          wReal === "DISK_CACHE" || wReal === "RAM_BUFFER" || wData === "disk" || wData === "ram";
        const isTrueEdgeHit =
          !isSsdViaWorker &&
          (wReal === "CLOUDFLARE_WORKER" || wEdge === "HIT" || wCf === "HIT" || wData === "cdn");

        const resolvedTier = isTrueEdgeHit ? 2 : isSsdViaWorker ? 3 : 2;
        const resolvedLabel = isTrueEdgeHit
          ? "Tier 2: Edge CDN (HIT • 1ms)"
          : isSsdViaWorker
          ? "Tier 3: Server SSD Disk (via Edge CDN)"
          : "Tier 2: Edge CDN (Populating Cache...)";
        const resolvedIcon = isTrueEdgeHit ? "⚡" : isSsdViaWorker ? "💽" : "⚡";
        const resolvedSource = isSsdViaWorker ? "disk" : "worker";

        const buffer = await streamResponseBody(workerRes, {
          onProgress,
          tier: resolvedTier,
          tierLabel: resolvedLabel,
          icon: resolvedIcon,
          source: resolvedSource,
          expectedSize: note?.compressedSize || note?.fileSize || 0,
          signal,
        });

        if (isValidPdfArrayBuffer(buffer)) {
          saveToClientOfflineStorage(cleanId, note, buffer);
          let blob = null;
          if (mode === "download") {
            blob = await triggerBrowserDownload(buffer, cleanName, fileHandle);
          } else {
            blob = new Blob([buffer], { type: "application/pdf" });
          }
          return { buffer, blob, source: resolvedSource, tier: resolvedTier };
        }
      } else if (workerRes && workerRes.status >= 500) {
        workerCooldownUntil = Date.now() + 15000;
      }
    } catch (t2Err) {
      if (!(signal && signal.aborted)) {
        workerCooldownUntil = Date.now() + 15000;
      }
      console.debug("[WATERFALL] Tier 2 CDN worker fallback to Tier 3:", t2Err.message);
    }
  }

  // =========================================================================
  // TIER 3 & TIER 4: Origin Server (Server SSD Disk -> Cloud Storage)
  // =========================================================================
  onProgress({
    tier: 3,
    tierLabel: "Tier 3: Server SSD Disk (NVMe / RAM)",
    percent: 25,
    speed: "Zero-Copy SSD Stream (100ms)...",
    loadedMB: "0",
    totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
    timeRemaining: "Estimating...",
    source: "disk",
    icon: "💽",
  });

  const streamEndpointPath = `/api/notes/${cleanId}/stream.pdf?${
    mode === "download" ? "download=1" : "preview=1"
  }&direct=1${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}&filename=${encodeURIComponent(cleanName)}`;

  const fetchHeaders = {
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    "X-Direct-Origin": "1",
    "X-Requested-With": "XMLHttpRequest",
  };

  let serverRes = null;
  try {
    serverRes = await fetch(streamEndpointPath, {
      headers: fetchHeaders,
      signal,
      credentials: "include",
    });
  } catch (netErr) {
    console.warn("[WATERFALL] Tier 3 fetch network notice:", netErr.message);
  }

  // 🛡️ Multi-Node Cluster Failover if local origin is offline, 502/503/504, or returned static HTML fallback
  if (!isValidPdfStreamResponse(serverRes) && (!serverRes || serverRes.status >= 500 || (serverRes.headers?.get("content-type") || "").includes("text/html"))) {
    const clusterNodes = Array.isArray(BACKEND_CLUSTER_URLS) ? BACKEND_CLUSTER_URLS : [];
    for (const clusterOrigin of clusterNodes) {
      if (signal && signal.aborted) break;
      try {
        const candidateRes = await fetch(`${clusterOrigin}${streamEndpointPath}`, {
          headers: fetchHeaders,
          signal,
          credentials: "include",
        });
        if (isValidPdfStreamResponse(candidateRes) || (candidateRes && candidateRes.status < 500)) {
          serverRes = candidateRes;
          break;
        }
      } catch (_) {}
    }
  }

  // 🛡️ Auto-Retry for 503 Storage Warm-ups (gives background MTProto pull 2.2s to finish SSD caching)
  if (!serverRes || serverRes.status === 503) {
    onProgress({
      tier: 4,
      tierLabel: "Tier 4: Cloud Storage Vault (Warming Up)",
      percent: 30,
      speed: "Warming cloud vault stream (2.2s)...",
      loadedMB: "0",
      totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
      timeRemaining: "Retrying...",
      source: "telegram",
      icon: "☁️",
    });
    await new Promise((r) => setTimeout(r, 2200));
    try {
      serverRes = await fetch(streamEndpointPath, {
        headers: fetchHeaders,
        signal,
        credentials: "include",
      });
    } catch (_) {}
  }

  if (!serverRes || (!serverRes.ok && serverRes.status !== 206)) {
    let errMsg = `Document unavailable (${serverRes?.status || "network"})`;
    try {
      const errJson = await serverRes.json();
      if (errJson?.message) errMsg = errJson.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const realSource = (serverRes.headers.get("x-real-source") || "").toUpperCase();
  const cfCache = (serverRes.headers.get("cf-cache-status") || "").toUpperCase();
  const edgeCache = (serverRes.headers.get("x-edge-cache") || "").toUpperCase();
  const dataSource = (serverRes.headers.get("x-data-source") || "").toLowerCase();

  // Check Server SSD / RAM Buffer BEFORE generic CF/Edge HIT headers!
  const isServerSsd =
    realSource === "DISK_CACHE" ||
    realSource === "RAM_BUFFER" ||
    dataSource === "disk" ||
    dataSource === "ram";

  const isEdgeCdn =
    !isServerSsd &&
    (realSource === "CLOUDFLARE_WORKER" ||
      dataSource === "cdn" ||
      cfCache === "HIT" ||
      edgeCache === "HIT");

  let tierNum = 4;
  let tierLabel = "Tier 4: Cloud Storage Vault";
  let tierIcon = "☁️";
  let tierSource = "telegram";

  if (isServerSsd) {
    tierNum = 3;
    tierLabel = "Tier 3: Server SSD Disk (Zero-Copy 100ms)";
    tierIcon = "💽";
    tierSource = "disk";
  } else if (isEdgeCdn) {
    tierNum = 2;
    tierLabel = "Tier 2: Edge CDN (Cloudflare 1ms)";
    tierIcon = "⚡";
    tierSource = "worker";
  }

  onProgress({
    tier: tierNum,
    tierLabel: `Streaming from ${tierLabel}...`,
    percent: 35,
    speed: isServerSsd
      ? "Zero-Copy SSD Stream (100ms)"
      : isEdgeCdn
      ? "Edge CDN Stream (1ms)"
      : "Stream Chunks + Auto-Save to SSD",
    loadedMB: "0",
    totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
    timeRemaining: "Streaming...",
    source: tierSource,
    icon: tierIcon,
  });

  const buffer = await streamResponseBody(serverRes, {
    onProgress,
    tier: tierNum,
    tierLabel,
    icon: tierIcon,
    source: tierSource,
    expectedSize: note?.compressedSize || note?.fileSize || 0,
    signal,
  });

  if (!isValidPdfArrayBuffer(buffer)) {
    throw new Error("Received invalid or corrupted document stream from server.");
  }

  // Background: Pre-cache in IndexedDB & memory so subsequent calls are Tier 1 (0ms Hit)
  saveToClientOfflineStorage(cleanId, note, buffer);

  let blob = null;
  if (mode === "download") {
    blob = await triggerBrowserDownload(buffer, cleanName, fileHandle);
  } else {
    blob = new Blob([buffer], { type: "application/pdf" });
  }

  return { buffer, blob, source: isServerSsd ? "disk" : isEdgeCdn ? "worker" : "telegram", tier: tierNum };
}

/**
 * Backwards-compatible helper for legacy components
 */
export async function fetchWithCdnFailover(noteId, fetchOptions = {}) {
  const mode = fetchOptions.isDownload ? "download" : "read";
  const res = await acquireNoteDocument(noteId, {
    mode,
    fileName: fetchOptions.fileName,
    signal: fetchOptions.signal,
    token: fetchOptions.token,
  });
  return new Response(res.buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(res.buffer.byteLength),
      "X-Real-Source": res.source === "local" ? "RAM_BUFFER" : res.source === "disk" ? "DISK_CACHE" : "CLOUD_STORAGE",
    },
  });
}

/**
 * Returns stream URL for direct streaming
 */
export function getSmartStreamUrl(noteId, ticket = null, fileName = null, isPreview = false, isCdnCached = false) {
  const localOrigin = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
  let base = localOrigin;
  if (CF_WORKER && isCdnCached) {
    base = CF_WORKER;
  }
  const token = resolveClientAuthToken(null);
  let cleanName = (fileName || "").replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (cleanName && !cleanName.toLowerCase().endsWith(".pdf")) cleanName += ".pdf";
  // Always use canonical stream.pdf path so Cloudflare Edge Cache key is 100% shared across Reader & Downloader
  const pathSegment = "stream.pdf";
  const params = [];
  if (isPreview) params.push("preview=1");
  if (ticket) params.push(`ticket=${encodeURIComponent(ticket)}`);
  if (token) params.push(`token=${encodeURIComponent(token)}`);
  if (cleanName) params.push(`filename=${encodeURIComponent(cleanName)}`);
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `${base}/api/notes/${noteId}/${pathSegment}${query}`;
}
