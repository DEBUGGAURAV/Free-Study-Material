/**
 * ============================================================================
 * ⭕ CLIENT-SIDE CIRCLE TO SEARCH & SOLVE ENGINE
 * ============================================================================
 * 3-Step Smart Architecture:
 * - Step 1: Text-Layer First Check (0ms, 0 RAM, 0 API Calls)
 * - Step 2: Client-Side Tesseract.js WASM for Handwritten Notes (0% Server CPU)
 * - Step 3: Multi-Tier Cache (L0 IndexedDB -> L1 RAM -> L2 Turso Cloud Database)
 * ============================================================================
 */

import { recognizeCanvasText, prepareCanvasForVision } from "./clientOcr";
import { getCurrentUser, getAuthToken } from "../api";

// In-Memory L0 Session Caches (0ms Repeat Hits)
const memorySessionCache = new Map();
const ocrSessionCache = new Map();

// Common scanner watermarks that pollute PDF text layers on scanned handwritten notes
const WATERMARK_NOISE_REGEX =
  /^(?:scanned\s+(?:by|with)\s+)?(?:camscanner|tapscanner|clear\s*scanner|adobe\s*scan|vflat|microsoft\s*lens|fast\s*scanner|docscanner|genius\s*scan|www\.[a-z0-9.-]+|\d+\s*\/\s*\d+)$/i;

/**
 * Parses any DataURL or raw base64 string into guaranteed matching { mimeType, base64 }
 */
export function extractMimeAndBase64(dataUrlOrBase64, fallbackMime = "image/jpeg") {
  if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== "string") {
    return { mimeType: fallbackMime, base64: null };
  }
  const trimmed = dataUrlOrBase64.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (match) {
    return {
      mimeType: match[1].toLowerCase(),
      base64: match[2].replace(/\s+/g, ""),
    };
  }
  return {
    mimeType: fallbackMime,
    base64: trimmed.replace(/^data:image\/[^;]+;base64,/i, "").replace(/\s+/g, ""),
  };
}

/**
 * Ultra-fast (<0.2ms) 8x8 pixel sample hash for L0 OCR & image cache keys
 */
function computeFastCanvasFingerprint(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return "";
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return `${canvas.width}x${canvas.height}`;
    const w = canvas.width;
    const h = canvas.height;
    let hash = (w * 31 + h) | 0;
    const stepX = Math.max(1, Math.floor(w / 8));
    const stepY = Math.max(1, Math.floor(h / 8));
    for (let y = Math.floor(stepY / 2); y < h; y += stepY) {
      const row = ctx.getImageData(0, y, w, 1).data;
      for (let x = Math.floor(stepX / 2); x < w; x += stepX) {
        const idx = x * 4;
        const lum = (row[idx] + row[idx + 1] + row[idx + 2]) | 0;
        hash = ((hash << 5) - hash + lum) | 0;
      }
    }
    return `cfp_${w}x${h}_${Math.abs(hash).toString(36)}`;
  } catch (_) {
    return "";
  }
}

/**
 * 1. Step 1: Text-Layer First Extraction from Native PDF.js Coordinates
 * Scans page.getTextContent() items that intersect with student's drawn circle bounding box.
 * Filters out scanner watermarks & stray OCR noise so handwritten scanned PDFs use Vision/WASM OCR.
 */
export async function extractTextFromPageBounds(pdfPage, bounds, viewport) {
  if (!pdfPage || !bounds || bounds.width < 5 || bounds.height < 5) return null;

  try {
    const textContent = await pdfPage.getTextContent();
    if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
      return null;
    }

    const scale = viewport.scale || 1;
    const vpHeight = viewport.height;

    // Convert canvas bounds (origin at top-left) to PDF user-space bounds
    const boxLeft = bounds.x;
    const boxRight = bounds.x + bounds.width;
    const boxTop = bounds.y;
    const boxBottom = bounds.y + bounds.height;

    const matchedItems = [];

    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;

      // item.transform: [scaleX, skewY, skewX, scaleY, tx, ty]
      let tx, ty;
      if (viewport && typeof viewport.convertToViewportPoint === "function") {
        const pt = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        tx = pt[0];
        ty = pt[1];
      } else {
        tx = item.transform[4] * scale;
        ty = vpHeight - item.transform[5] * scale;
      }
      const itemWidth = (item.width || 10) * scale;
      const itemHeight = (item.height || 12) * scale;

      const itemRight = tx + itemWidth;
      const itemBottom = ty + itemHeight;

      // Check geometric intersection with bounding box
      const intersects = !(
        tx > boxRight ||
        itemRight < boxLeft ||
        ty > boxBottom ||
        itemBottom < boxTop
      );

      if (intersects) {
        matchedItems.push({
          str: item.str,
          x: tx,
          y: ty,
        });
      }
    }

    if (matchedItems.length === 0) return null;

    // Sort top-to-bottom, left-to-right
    matchedItems.sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 8) return yDiff;
      return a.x - b.x;
    });

    const combinedText = matchedItems.map((m) => m.str).join(" ").replace(/\s+/g, " ").trim();
    if (combinedText.length >= 4 && !WATERMARK_NOISE_REGEX.test(combinedText)) {
      const meaningfulChars = (
        combinedText.match(/[a-zA-Z0-9\u0900-\u097F∑∫√πΔθλμΩαβγ=+\-*/^()]/g) || []
      ).length;
      const nonSpaceLen = combinedText.replace(/\s+/g, "").length || 1;
      // Reject garbage scanner artifacts like ". , | ~ _ -" so handwritten notes trigger Vision OCR
      if (meaningfulChars >= 4 && meaningfulChars / nonSpaceLen >= 0.4) {
        return {
          text: combinedText,
          source: "text-layer",
          confidence: 1.0,
        };
      }
    }
  } catch (err) {
    console.warn("[CIRCLE-SEARCH] Text layer inspection notice:", err.message);
  }

  return null;
}

/**
 * 2. Step 2: Crops the drawn bounding box from main canvas
 * Produces both a raw canvas (for local SIMD OCR) and a Vision-optimized crisp JPEG (<110KB).
 */
export function cropCanvasRegion(sourceCanvas, bounds, padding = 10) {
  if (!sourceCanvas || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  try {
    const pad = Math.max(0, padding);
    const cropX = Math.max(0, bounds.x - pad);
    const cropY = Math.max(0, bounds.y - pad);
    const cropW = Math.min(sourceCanvas.width - cropX, bounds.width + pad * 2);
    const cropH = Math.min(sourceCanvas.height - cropY, bounds.height + pad * 2);

    if (cropW <= 0 || cropH <= 0) return null;

    // Safari WebKit 16.7MP canvas safety cap (3x Retina iPads/iPhones can exceed limit)
    const maxSafeDim = 2400;
    const safeScale = Math.max(cropW, cropH) > maxSafeDim ? maxSafeDim / Math.max(cropW, cropH) : 1;
    const dstW = Math.max(1, Math.round(cropW * safeScale));
    const dstH = Math.max(1, Math.round(cropH * safeScale));

    const offscreen = document.createElement("canvas");
    offscreen.width = dstW;
    offscreen.height = dstH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;

    // Solid white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dstW, dstH);

    ctx.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      dstW,
      dstH
    );

    const visionReady = prepareCanvasForVision(offscreen, 1360);
    const fallbackDataUrl = visionReady?.dataUrl || offscreen.toDataURL("image/jpeg", 0.88);

    return {
      canvas: offscreen,
      dataUrl: fallbackDataUrl,
      mimeType: visionReady?.mimeType || "image/jpeg",
      width: dstW,
      height: dstH,
    };
  } catch (err) {
    console.warn("[CIRCLE-SEARCH] Canvas crop error:", err.message);
    return null;
  }
}

/**
 * 3. Step 2 Hybrid Handwriting Engine:
 * Runs Ultra-Fast Cloud Multimodal Vision OCR (Groq Llama-4-Scout ~420ms + Gemini Flash failover)
 * in parallel with Upgraded Local Adaptive Integral-Image Tesseract SIMD WASM!
 */
export async function extractTextFromCroppedCanvas(croppedCanvas, onProgress, options = {}) {
  if (!croppedCanvas) return null;

  const fingerprint = computeFastCanvasFingerprint(croppedCanvas);
  if (fingerprint && ocrSessionCache.has(fingerprint)) {
    if (onProgress) onProgress(100, "⚡ Instant Handwriting Cache Hit (0ms)");
    return ocrSessionCache.get(fingerprint);
  }

  const timeoutMs = options.timeoutMs || 5400;
  const canUseCloudVision =
    !options.localOnly &&
    typeof navigator !== "undefined" &&
    navigator.onLine !== false &&
    Boolean(getCurrentUser());

  // Local SIMD WASM OCR promise (starts immediately when offline, or after 110ms head-start online)
  let wasmTimer = null;
  const localWasmPromise = new Promise((resolve) => {
    const startWasm = async () => {
      try {
        const recognized = await recognizeCanvasText(croppedCanvas, canUseCloudVision ? undefined : onProgress);
        const cleaned = (recognized || "").trim();
        if (cleaned.length >= 2) {
          resolve({
            text: cleaned,
            source: "client-ocr-wasm",
            confidence: 0.88,
          });
          return;
        }
      } catch (err) {
        console.warn("[CIRCLE-SEARCH] Client WASM OCR notice:", err.message);
      }
      resolve(null);
    };

    if (!canUseCloudVision) {
      startWasm();
    } else {
      wasmTimer = setTimeout(startWasm, 110);
    }
  });

  if (canUseCloudVision) {
    if (onProgress) onProgress(30, "⚡ Reading handwriting & math via AI Vision...");
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const prepared = prepareCanvasForVision(croppedCanvas, 1280);
      if (prepared?.base64) {
        const authToken = getAuthToken();
        const res = await fetch("/api/ai/ocr-handwriting", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: prepared.base64,
            imageMimeType: prepared.mimeType || "image/jpeg",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const visionText = (data?.text || "").trim();
          if (visionText.length >= 1) {
            if (wasmTimer) clearTimeout(wasmTimer);
            clearTimeout(abortTimer);
            const result = {
              text: visionText,
              source: "ai-vision-ocr",
              provider: data.provider || "vision",
              confidence: 0.98,
            };
            if (fingerprint) ocrSessionCache.set(fingerprint, result);
            if (onProgress) onProgress(100, "⚡ Handwriting extracted!");
            return result;
          }
        }
      }
    } catch (_) {
      // Network timeout or offline -> seamlessly fall through to already-running localWasmPromise
    } finally {
      clearTimeout(abortTimer);
    }
  }

  // Fallback to local adaptive-threshold WASM OCR (capped so UI never hangs)
  const fallbackCapMs = options.timeoutMs ? Math.max(900, options.timeoutMs) : 6500;
  const localResult = await Promise.race([
    localWasmPromise,
    new Promise((res) => setTimeout(() => res(null), fallbackCapMs)),
  ]);

  if (localResult && fingerprint) {
    ocrSessionCache.set(fingerprint, localResult);
  }
  return localResult;
}

/**
 * 4. Step 3: Multi-Tier AI Solution with IndexedDB & Turso Cache
 */
export async function solveCircleQuery({
  query = "",
  context = "",
  noteId = "",
  subject = "",
  imageBase64 = null,
  imageMimeType = "image/jpeg",
  skipCache = false,
  onProgress,
}) {
  const cleanQuery = typeof query === "string" ? query.trim() : "";
  const parsedImg = imageBase64 ? extractMimeAndBase64(imageBase64, imageMimeType || "image/jpeg") : null;
  const cleanImageBase64 = parsedImg?.base64 || null;
  const resolvedMimeType = parsedImg?.mimeType || imageMimeType || "image/jpeg";

  if (!cleanQuery && !cleanImageBase64) {
    throw new Error("Please enter a question or draw/upload a formula or structure to solve.");
  }

  // 🛡️ Strict Authentication Requirement for AI Solver
  const user = getCurrentUser();
  if (!user) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open_auth_modal", { detail: { mode: "signin" } }));
    }
    throw new Error("Authentication Required: Please sign in with your student account to use Circle to Search & AI Solver.");
  }

  const isConversational = Boolean(skipCache) || String(context || "").includes("[CONVERSATION_CONTEXT]");
  const imgTag = cleanImageBase64
    ? `_im_${cleanImageBase64.length}_${cleanImageBase64.slice(40, 88).replace(/[^\w]/g, "")}_${cleanImageBase64.slice(-40).replace(/[^\w]/g, "")}`
    : "";
  const cacheKey = cleanQuery
    ? `circle_ai_${cleanQuery.toLowerCase().replace(/[^\w]/g, "_").slice(0, 72)}${imgTag}${
        isConversational ? `_${String(context).slice(-120).replace(/[^\w]/g, "_").slice(0, 40)}` : ""
      }`
    : `circle_img${imgTag}`;

  // 1. Check Memory Cache (0ms) - works for both standalone text AND repeated image crops!
  if (!isConversational && memorySessionCache.has(cacheKey)) {
    if (onProgress) onProgress("⚡ Instant Memory Cache Hit (0ms)");
    return {
      ...memorySessionCache.get(cacheKey),
      cached: true,
      cacheTier: "Memory L0",
    };
  }

  // 2. Check IndexedDB (L0 Offline Storage)
  if (!isConversational) {
    try {
      const localHit = await getIndexedDbCircleCache(cacheKey);
      if (localHit) {
        memorySessionCache.set(cacheKey, localHit);
        if (onProgress) onProgress("⚡ Instant IndexedDB Cache Hit (0ms)");
        return {
          ...localHit,
          cached: true,
          cacheTier: "IndexedDB L0",
        };
      }
    } catch (_) {}
  }

  if (onProgress) {
    onProgress(
      cleanImageBase64
        ? "⚡ Reading handwriting & solving via LPU Vision AI..."
        : "🔍 Searching Turso AI Cache & Cloud Tutoring..."
    );
  }

  // 3. Call Backend /api/ai/circle-search (Checks Turso L2 -> Generates via Groq LPU Vision / Gemini)
  const authToken = getAuthToken();
  const res = await fetch("/api/ai/circle-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({
      query: cleanQuery,
      context,
      noteId,
      subject,
      skipCache: isConversational || Boolean(skipCache),
      imageBase64: cleanImageBase64 || undefined,
      imageMimeType: cleanImageBase64 ? resolvedMimeType : undefined,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Circle search error (${res.status})`);
  }

  const data = await res.json();
  const result = {
    key: cacheKey,
    query: cleanQuery,
    subject: subject || "Study Notes",
    noteId: noteId || "",
    answer: data.answer,
    provider: data.provider,
    model: data.model,
    cached: data.cached || false,
    cacheTier: data.cached ? (data.cacheSource || "Turso Cloud L2") : "Cloud Engine (Fresh)",
    hits: data.hits || 1,
    latencyMs: data.latencyMs || 0,
    savedAt: Date.now(),
    isPinned: false,
  };

  // Cache locally in IndexedDB & Memory
  memorySessionCache.set(cacheKey, result);
  saveIndexedDbCircleCache(cacheKey, result).catch(() => {});

  return result;
}

// ============================================================================
// 📦 Lightweight IndexedDB Helper for Circle Search Cache (48h Default TTL)
// ============================================================================
export const CIRCLE_CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 Hours Default TTL

function openCircleDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const req = window.indexedDB.open("fsm_circle_search_vault", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getIndexedDbCircleCache(key) {
  try {
    const db = await openCircleDb();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readonly");
      const store = tx.objectStore("cache");
      const req = store.get(key);
      req.onsuccess = () => {
        const item = req.result;
        // Check 48-Hour TTL (exempt if isPinned)
        if (item && (item.isPinned || Date.now() - (item.savedAt || 0) < CIRCLE_CACHE_TTL_MS)) {
          resolve(item.data || item);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

export async function saveIndexedDbCircleCache(key, data) {
  try {
    const db = await openCircleDb();
    const tx = db.transaction("cache", "readwrite");
    const store = tx.objectStore("cache");
    store.put({
      key,
      data,
      query: data.query || "",
      subject: data.subject || "Study Notes",
      answer: data.answer || "",
      noteId: data.noteId || "",
      provider: data.provider || "gemini",
      savedAt: data.savedAt || Date.now(),
      isPinned: Boolean(data.isPinned),
    });
  } catch (_) {}
}

/**
 * Loads all stored circled Q&A notes for Profile Modal
 * Auto-evicts unpinned entries older than 48 hours
 */
export async function getAllStoredCircleNotes() {
  try {
    const db = await openCircleDb();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readwrite");
      const store = tx.objectStore("cache");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        const now = Date.now();
        const active = [];

        for (const item of items) {
          const age = now - (item.savedAt || now);
          // Auto-evict unpinned entries older than 48 hours
          if (age > CIRCLE_CACHE_TTL_MS && !item.isPinned) {
            store.delete(item.key);
          } else {
            active.push(item);
          }
        }

        active.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        resolve(active);
      };
      req.onerror = () => resolve([]);
    });
  } catch (_) {
    return [];
  }
}

/**
 * Deletes a single circled note by key
 */
export async function deleteSingleCircleNote(key) {
  try {
    const db = await openCircleDb();
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").delete(key);
    memorySessionCache.delete(key);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Pins or unpins a circled note (Pinned notes never auto-expire)
 */
export async function togglePinCircleNote(key) {
  try {
    const db = await openCircleDb();
    const tx = db.transaction("cache", "readwrite");
    const store = tx.objectStore("cache");
    const item = await new Promise((res) => {
      const r = store.get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });

    if (item) {
      item.isPinned = !item.isPinned;
      store.put(item);
      return item.isPinned;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Clears all cached circled notes from local IndexedDB & RAM
 */
export async function clearAllStoredCircleNotes() {
  try {
    const db = await openCircleDb();
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").clear();
    memorySessionCache.clear();
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================================
// ✏️ FREEHAND PENCIL & ANY-STRUCTURE ENGINE (Shared by Read PDF & Home Screen)
// ============================================================================

const PENCIL_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">` +
    `<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" fill="#0f172a" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="m15 5 4 4" stroke="#c084fc" stroke-width="1.8" stroke-linecap="round"/>` +
    `<circle cx="2.2" cy="21.8" r="1.3" fill="#38bdf8"/>` +
  `</svg>`
);

export const PENCIL_CURSOR_STYLE = `url("data:image/svg+xml,${PENCIL_SVG}") 2 18, crosshair`;

/**
 * Converts an array of { x, y } points into a smooth quadratic-bezier SVG path string
 */
export function strokePointsToSvgPath(points = []) {
  if (!Array.isArray(points) || points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.5).toFixed(1)} ${(p.y + 0.5).toFixed(1)}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Computes smart bounding box & total path length for ANY freehand structure
 * (circle, underline, line, bracket, box, triangle, chemical ring, handwritten formula, etc.)
 */
export function computeFreehandBounds(strokes = [], maxWidth = Infinity, maxHeight = Infinity) {
  const validStrokes = (Array.isArray(strokes) ? strokes : []).filter((s) => Array.isArray(s) && s.length > 0);
  if (validStrokes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let totalLength = 0;
  let pointCount = 0;

  for (const stroke of validStrokes) {
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      pointCount++;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (i > 0) {
        const prev = stroke[i - 1];
        totalLength += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
    }
  }

  if (pointCount === 0 || !Number.isFinite(minX)) return null;

  let rawWidth = maxX - minX;
  let rawHeight = maxY - minY;

  // Reject tiny accidental clicks (< 14px span and < 18px path length)
  if (totalLength < 18 && rawWidth < 14 && rawHeight < 14) {
    return null;
  }

  // Smart expansion: if user drew an underline or straight horizontal/vertical mark,
  // expand perpendicular axis so the text above/beside the pencil mark is captured!
  const padX = rawWidth < 26 ? 24 : 8;
  const padY = rawHeight < 26 ? 24 : 8;

  const x = Math.max(0, Math.round(minX - padX));
  const y = Math.max(0, Math.round(minY - padY));
  const right = Math.min(maxWidth, Math.round(maxX + padX));
  const bottom = Math.min(maxHeight, Math.round(maxY + padY));

  return {
    x,
    y,
    width: Math.max(20, right - x),
    height: Math.max(20, bottom - y),
    rawBounds: {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.max(4, Math.round(rawWidth)),
      height: Math.max(4, Math.round(rawHeight)),
    },
    totalLength: Math.round(totalLength),
    strokeCount: validStrokes.length,
  };
}

/**
 * Renders the user's freehand pencil strokes onto a clean, high-contrast canvas
 * so Gemini Vision / AI can recognize ANY drawn structure, diagram, graph, or formula!
 */
export function renderFreehandStrokesToCanvas(strokes = [], options = {}) {
  const validStrokes = (Array.isArray(strokes) ? strokes : []).filter((s) => Array.isArray(s) && s.length > 0);
  const geom = computeFreehandBounds(validStrokes);
  if (!geom) return null;

  const pad = options.padding ?? 28;
  const minDim = options.minDimension ?? 180;
  const raw = geom.rawBounds;
  const contentW = Math.max(raw.width + pad * 2, minDim);
  const contentH = Math.max(raw.height + pad * 2, minDim);
  const offsetX = (contentW - raw.width) / 2 - raw.x;
  const offsetY = (contentH - raw.height) / 2 - raw.y;

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1400, Math.round(contentW));
  canvas.height = Math.min(1400, Math.round(contentH));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // High-contrast crisp white background with dark ink for maximum Vision & OCR accuracy
  ctx.fillStyle = options.background || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = options.strokeColor || "#0f172a";
  ctx.lineWidth = options.lineWidth || 2.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of validStrokes) {
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x + offsetX, stroke[0].y + offsetY, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = options.strokeColor || "#0f172a";
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x + offsetX, stroke[0].y + offsetY);
    for (let i = 1; i < stroke.length - 1; i++) {
      const midX = (stroke[i].x + stroke[i + 1].x) / 2 + offsetX;
      const midY = (stroke[i].y + stroke[i + 1].y) / 2 + offsetY;
      ctx.quadraticCurveTo(stroke[i].x + offsetX, stroke[i].y + offsetY, midX, midY);
    }
    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x + offsetX, last.y + offsetY);
    ctx.stroke();
  }

  return {
    canvas,
    dataUrl: canvas.toDataURL("image/jpeg", 0.9),
    mimeType: "image/jpeg",
    bounds: geom,
  };
}

/**
 * Checks whether a cropped PDF canvas region is mostly blank/uniform background
 * (so we know the student sketched their own structure on empty margin space)
 */
export function isCanvasBlankOrUniform(canvas) {
  try {
    if (!canvas || !canvas.width || !canvas.height) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    if (!data || data.length < 4) return true;
    const r0 = data[0];
    const g0 = data[1];
    const b0 = data[2];
    const stepX = Math.max(1, Math.floor(w / 10));
    const stepY = Math.max(1, Math.floor(h / 10));
    let diffPixels = 0;
    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const diff =
          Math.abs(data[idx] - r0) +
          Math.abs(data[idx + 1] - g0) +
          Math.abs(data[idx + 2] - b0);
        if (diff > 36) {
          diffPixels++;
          if (diffPixels >= 3) return false;
        }
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Inspects visible DOM text nodes, images, canvases, and NoteCards intersecting viewport bounds
 * for Global / Home Screen Pencil-to-Search (mirrors Read PDF Circle Search on any screen!)
 */
export function extractDomContentFromScreenBounds(bounds, allNotes = []) {
  if (typeof document === "undefined" || !bounds) {
    return { text: "", croppedImage: null, croppedCanvas: null, matchedNote: null };
  }

  const boxLeft = bounds.x;
  const boxRight = bounds.x + bounds.width;
  const boxTop = bounds.y;
  const boxBottom = bounds.y + bounds.height;

  const intersectsRect = (r) =>
    r &&
    r.width > 0 &&
    r.height > 0 &&
    !(r.left > boxRight || r.right < boxLeft || r.top > boxBottom || r.bottom < boxTop);

  // 1. Collect intersecting text nodes in reading order
  const collectedSnippets = [];
  const seenTexts = new Set();

  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const val = (node.nodeValue || "").trim();
        if (!val) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-pencil-overlay='true']")) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(currentNode);
      const rect = range.getBoundingClientRect();
      if (intersectsRect(rect)) {
        const clean = currentNode.nodeValue.replace(/\s+/g, " ").trim();
        if (clean && !seenTexts.has(clean)) {
          seenTexts.add(clean);
          collectedSnippets.push({
            text: clean,
            top: rect.top,
            left: rect.left,
          });
        }
      }
    }
  } catch (_) {}

  collectedSnippets.sort((a, b) => {
    if (Math.abs(a.top - b.top) > 10) return a.top - b.top;
    return a.left - b.left;
  });

  const combinedText = collectedSnippets
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);

  // 2. Check if user circled an <img /> or <canvas /> on screen and crop it with Vision upscaling/compression
  let croppedVisual = null;
  let croppedCanvasEl = null;
  try {
    const mediaEls = Array.from(document.querySelectorAll("canvas, img")).filter(
      (el) => !el.closest("[data-pencil-overlay='true']")
    );
    for (const el of mediaEls) {
      const rect = el.getBoundingClientRect();
      if (!intersectsRect(rect) || rect.width < 24 || rect.height < 24) continue;
      const ix1 = Math.max(boxLeft, rect.left);
      const iy1 = Math.max(boxTop, rect.top);
      const ix2 = Math.min(boxRight, rect.right);
      const iy2 = Math.min(boxBottom, rect.bottom);
      const iw = ix2 - ix1;
      const ih = iy2 - iy1;
      if (iw < 16 || ih < 16) continue;

      const sourceW = el.tagName === "CANVAS" ? el.width : el.naturalWidth;
      const sourceH = el.tagName === "CANVAS" ? el.height : el.naturalHeight;
      if (!sourceW || !sourceH) continue;

      const scaleX = sourceW / rect.width;
      const scaleY = sourceH / rect.height;
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(iw * scaleX));
      off.height = Math.max(1, Math.round(ih * scaleY));
      const ctx = off.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(
          el,
          Math.round((ix1 - rect.left) * scaleX),
          Math.round((iy1 - rect.top) * scaleY),
          off.width,
          off.height,
          0,
          0,
          off.width,
          off.height
        );
        croppedCanvasEl = off;
        const prepared = prepareCanvasForVision(off, 1360);
        croppedVisual = prepared?.dataUrl || off.toDataURL("image/jpeg", 0.88);
        break;
      }
    }
  } catch (_) {}

  // 3. Match underlying NoteCard if user circled a note card on Home screen
  let matchedNote = null;
  if (combinedText && Array.isArray(allNotes) && allNotes.length > 0) {
    const lower = combinedText.toLowerCase();
    matchedNote =
      allNotes.find((n) => n?.title && lower.includes(String(n.title).toLowerCase())) ||
      allNotes.find((n) => n?.subject && lower.includes(String(n.subject).toLowerCase())) ||
      null;
  }

  return {
    text: combinedText,
    croppedImage: croppedVisual,
    croppedCanvas: croppedCanvasEl,
    matchedNote,
  };
}



