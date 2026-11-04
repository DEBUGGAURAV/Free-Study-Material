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

const isLocalHost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

// Determine valid Cloudflare Worker URL (Tier 2 Edge CDN Worker)
const rawWorkerEnv =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_CF_WORKER_URL
    ? String(import.meta.env.VITE_CF_WORKER_URL).trim()
    : "";
export const CF_WORKER =
  rawWorkerEnv || (!isLocalHost ? "https://fsm-edge.jnplotus.workers.dev" : "");

export const originBase =
  typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "http://localhost:5000";

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

  // Tier 2: Cloudflare Edge CDN Worker
  if (
    realSource === "CLOUDFLARE_WORKER" ||
    xEdgeCache === "HIT" ||
    (cfCache === "HIT" && realSource !== "RAM_BUFFER" && realSource !== "DISK_CACHE") ||
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

  // Tier 3: In-Memory RAM Buffer (0ms)
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

  // Tier 3: Local NVMe SSD Disk Cache (1ms)
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
 * Cache buffer locally in memory and IndexedDB offline vault
 */
export function saveToClientOfflineStorage(noteId, note, arrayBuffer) {
  if (!noteId || !arrayBuffer || arrayBuffer.byteLength < 500) return;
  try {
    if (typeof window !== "undefined") {
      window.__FSM_LOADED_PDF_BUFFERS__ = window.__FSM_LOADED_PDF_BUFFERS__ || {};
      window.__FSM_LOADED_PDF_BUFFERS__[String(noteId)] = arrayBuffer;
    }
    // Save to BOTH IndexedDB stores (fsm_offline_vault AND fsm_p2p_cache_v1)
    saveNoteOffline(note || { id: noteId, title: "Academic Document" }, arrayBuffer).catch(() => {});
    cacheNoteBuffer(noteId, arrayBuffer).catch(() => {});
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
  const authToken =
    token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("vault_token") || localStorage.getItem("token") || ""
      : "");

  let cleanName = (fileName || note?.title || `Document_${cleanId}`)
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
      new Promise((resolve) => setTimeout(() => resolve(null), 800)),
    ]);
    if (localBuf && localBuf.byteLength > 500) {
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
  // TIER 2: Local Server - Strict 3.5s Timeout
  // =========================================================================
  if (CF_WORKER) {
    onProgress({
      tier: 2,
      tierLabel: "Tier 2: Local Server",
      percent: 15,
      speed: "3.5s Fast Timeout / HIT...",
      loadedMB: "0",
      totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
      timeRemaining: "Estimating...",
      source: "worker",
      icon: "⚡",
    });

    try {
      const workerUrl = `${CF_WORKER}/api/notes/${cleanId}/stream.pdf?${
        mode === "download" ? "download=1" : "preview=1"
      }${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}`;

      const workerController = new AbortController();
      const workerTimeout = setTimeout(() => workerController.abort(), 3500); // 3.5s strict timeout
      if (signal) {
        signal.addEventListener("abort", () => workerController.abort(), { once: true });
      }

      const workerRes = await fetch(workerUrl, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        signal: workerController.signal,
      });
      clearTimeout(workerTimeout);

      const contentType = workerRes.headers.get("content-type") || "";
      if (
        workerRes.ok &&
        (contentType.includes("pdf") ||
          contentType.includes("octet-stream") ||
          workerRes.status === 206)
      ) {
        // 🎉 TIER 2 HIT!
        const buffer = await streamResponseBody(workerRes, {
          onProgress,
          tier: 2,
          tierLabel: "Tier 2: Local Server (HIT)",
          icon: "⚡",
          source: "worker",
          expectedSize: note?.compressedSize || note?.fileSize || 0,
          signal,
        });

        if (buffer && buffer.byteLength > 500) {
          saveToClientOfflineStorage(cleanId, note, buffer);
          let blob = null;
          if (mode === "download") {
            blob = await triggerBrowserDownload(buffer, cleanName, fileHandle);
          } else {
            blob = new Blob([buffer], { type: "application/pdf" });
          }
          return { buffer, blob, source: "worker", tier: 2 };
        }
      }
    } catch (t2Err) {
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

  const originUrl = `/api/notes/${cleanId}/stream.pdf?${
    mode === "download" ? "download=1" : "preview=1"
  }${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}&filename=${encodeURIComponent(cleanName)}`;

  const serverRes = await fetch(originUrl, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    signal,
    credentials: "include",
  });

  if (!serverRes.ok) {
    let errMsg = `Document unavailable (${serverRes.status})`;
    try {
      const errJson = await serverRes.json();
      if (errJson?.message) errMsg = errJson.message;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const realSource = serverRes.headers.get("x-real-source") || "";
  const isServerSsd = realSource === "DISK_CACHE" || realSource === "RAM_BUFFER";
  const tierNum = isServerSsd ? 3 : 4;
  const tierLabel = isServerSsd
    ? "Tier 3: Server SSD Disk (Zero-Copy 100ms)"
    : "Tier 4: Cloud Storage";
  const tierIcon = isServerSsd ? "💽" : "☁️";

  onProgress({
    tier: tierNum,
    tierLabel: `Streaming from ${tierLabel}...`,
    percent: 35,
    speed: isServerSsd ? "Zero-Copy SSD Stream (100ms)" : "Stream Chunks + Auto-Save to SSD",
    loadedMB: "0",
    totalMB: ((note?.compressedSize || note?.fileSize || 1048576) / (1024 * 1024)).toFixed(2),
    timeRemaining: "Streaming...",
    source: isServerSsd ? "disk" : "telegram",
    icon: tierIcon,
  });

  const buffer = await streamResponseBody(serverRes, {
    onProgress,
    tier: tierNum,
    tierLabel,
    icon: tierIcon,
    source: isServerSsd ? "disk" : "telegram",
    expectedSize: note?.compressedSize || note?.fileSize || 0,
    signal,
  });

  // Background: Pre-cache in IndexedDB & memory so subsequent calls are Tier 1 (0ms Hit)
  saveToClientOfflineStorage(cleanId, note, buffer);

  let blob = null;
  if (mode === "download") {
    blob = await triggerBrowserDownload(buffer, cleanName, fileHandle);
  } else {
    blob = new Blob([buffer], { type: "application/pdf" });
  }

  return { buffer, blob, source: isServerSsd ? "disk" : "telegram", tier: tierNum };
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
  const token = typeof window !== "undefined" ? localStorage.getItem("vault_token") || "" : "";
  let cleanName = (fileName || "").replace(/[/\\?%*:|"<>]/g, "_").trim();
  if (cleanName && !cleanName.toLowerCase().endsWith(".pdf")) cleanName += ".pdf";
  const pathSegment = cleanName ? encodeURIComponent(cleanName) : "stream.pdf";
  const params = [];
  if (isPreview) params.push("preview=1");
  if (ticket) params.push(`ticket=${encodeURIComponent(ticket)}`);
  if (token) params.push(`token=${encodeURIComponent(token)}`);
  if (cleanName) params.push(`filename=${encodeURIComponent(cleanName)}`);
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `${base}/api/notes/${noteId}/${pathSegment}${query}`;
}
