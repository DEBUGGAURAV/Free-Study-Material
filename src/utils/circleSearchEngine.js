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

import { recognizeCanvasText } from "./clientOcr";

// In-Memory L0 Session Cache
const memorySessionCache = new Map();

/**
 * 1. Step 1: Text-Layer First Extraction from Native PDF.js Coordinates
 * Scans page.getTextContent() items that intersect with student's drawn circle bounding box.
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
    if (combinedText.length >= 4) {
      return {
        text: combinedText,
        source: "text-layer",
        confidence: 1.0,
      };
    }
  } catch (err) {
    console.warn("[CIRCLE-SEARCH] Text layer inspection notice:", err.message);
  }

  return null;
}

/**
 * 2. Step 2: Crops the drawn bounding box from main canvas
 */
export function cropCanvasRegion(sourceCanvas, bounds, padding = 8) {
  if (!sourceCanvas || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  try {
    const pad = Math.max(0, padding);
    const cropX = Math.max(0, bounds.x - pad);
    const cropY = Math.max(0, bounds.y - pad);
    const cropW = Math.min(sourceCanvas.width - cropX, bounds.width + pad * 2);
    const cropH = Math.min(sourceCanvas.height - cropY, bounds.height + pad * 2);

    if (cropW <= 0 || cropH <= 0) return null;

    const offscreen = document.createElement("canvas");
    offscreen.width = cropW;
    offscreen.height = cropH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;

    // Solid white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cropW, cropH);

    ctx.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const dataUrl = offscreen.toDataURL("image/webp", 0.85);
    return {
      canvas: offscreen,
      dataUrl,
      width: cropW,
      height: cropH,
    };
  } catch (err) {
    console.warn("[CIRCLE-SEARCH] Canvas crop error:", err.message);
    return null;
  }
}

/**
 * 3. Step 2 Fallback: Client-Side Tesseract WASM for Handwritten Notes
 */
export async function extractTextFromCroppedCanvas(croppedCanvas, onProgress) {
  if (!croppedCanvas) return null;
  try {
    const recognized = await recognizeCanvasText(croppedCanvas, onProgress);
    if (recognized && recognized.trim().length >= 2) {
      return {
        text: recognized.trim(),
        source: "client-ocr-wasm",
        confidence: 0.85,
      };
    }
  } catch (err) {
    console.warn("[CIRCLE-SEARCH] Client WASM OCR notice:", err.message);
  }
  return null;
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
  imageMimeType = "image/png",
  onProgress,
}) {
  const cleanQuery = typeof query === "string" ? query.trim() : "";
  if (!cleanQuery && !imageBase64) {
    throw new Error("Please enter a question or upload an image/formula to solve.");
  }

  const cacheKey = cleanQuery
    ? `circle_ai_${cleanQuery.toLowerCase().replace(/[^\w]/g, "_").slice(0, 80)}`
    : `circle_img_${String(imageBase64).slice(0, 32).replace(/[^\w]/g, "_")}`;

  // 1. Check Memory Cache (0ms) - only if text query (images bypass RAM key)
  if (cleanQuery && memorySessionCache.has(cacheKey)) {
    if (onProgress) onProgress("⚡ Instant Memory Cache Hit (0ms)");
    return {
      ...memorySessionCache.get(cacheKey),
      cached: true,
      cacheTier: "Memory L0",
    };
  }

  // 2. Check IndexedDB (L0 Offline Storage) - only if text query
  if (cleanQuery) {
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

  if (onProgress) onProgress("🔍 Searching Turso AI Cache & Cloud Tutoring...");

  // 3. Call Backend /api/ai/circle-search (Checks Turso L2 -> Generates via Gemini/Groq)
  const res = await fetch("/api/ai/circle-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      query: cleanQuery,
      context,
      noteId,
      subject,
      imageBase64: imageBase64 || undefined,
      imageMimeType: imageBase64 ? imageMimeType : undefined,
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


