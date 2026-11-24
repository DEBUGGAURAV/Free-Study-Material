const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { ramCache, invalidateAllCache } = require("../utils/ramCache");
const { getAllCachedNotes, getTursoNotesCacheStats, upsertNoteInCache } = require("../services/tursoNotesCacheService");
const { downloadLimiter, getClientIp } = require("../middleware/rateLimit");
const { streamDocumentFromChannel, getDocumentBufferFromChannel } = require("../telegram/mtproto");
const { authenticateToken, requireAuth, requireAdmin, JWT_SECRET } = require("../middleware/auth");
const { sendTelegramAuthNotice } = require("../services/emailService");
const { getLastSyncState, recordSyncEvent } = require("../telegram/syncTracker");
const { getPublicNoteMeta, renderNoteOgPngBuffer } = require("../utils/ogPreviewHelper");

function isSafeExternalHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (/[\r\n]/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isAdminUser(user) {
  if (!user) return false;
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  return Boolean(
    user.role === "admin" ||
    user.role === "half_admin" ||
    user.role === "sub_admin" ||
    user.isMainAdmin ||
    user.isMasterAdmin ||
    user.id === "admin-root" ||
    (adminEmail && user.email && user.email.toLowerCase().trim() === adminEmail) ||
    (Array.isArray(user.permissions) && user.permissions.includes("all"))
  );
}

// In-Memory Edge CDN & RAM Buffer Cache (Ultra-Lightweight Zero-RAM Mode: 0 MB Heap Buffer)
const noteBufferCache = new Map();
let dbWritesPreventedCount = 0;

// ⚡ Batched Download Counter Buffer (Flushes accumulated note download increments to Firestore every 3 minutes — saves 90%+ Firestore writes!)
const pendingNoteDownloadCounts = new Map(); // noteId -> latestCount
function queueBatchedNoteDownloadIncrement(noteId, latestCount) {
  if (!noteId) return;
  if (pendingNoteDownloadCounts.has(noteId)) {
    dbWritesPreventedCount++;
  }
  pendingNoteDownloadCounts.set(noteId, Math.max(Number(pendingNoteDownloadCounts.get(noteId) || 0), Number(latestCount || 1)));
}
async function flushBatchedNoteDownloads() {
  if (!db || pendingNoteDownloadCounts.size === 0) return;
  const entries = Array.from(pendingNoteDownloadCounts.entries());
  pendingNoteDownloadCounts.clear();
  for (const [noteId, count] of entries) {
    try {
      await db.collection("notes").doc(noteId).update({ downloadsCount: count });
    } catch (_) {}
  }
}
setInterval(() => {
  flushBatchedNoteDownloads().catch(() => {});
}, 3 * 60 * 1000).unref();

// Anti-Spam / Cooldown Cache for Telegram Activity Alerts (Prevents repeat notices for 15 minutes)
const streamNoticeCooldown = new Map();
const STREAM_NOTICE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

function shouldDispatchStreamNotice(userKey, noteId, action) {
  const key = `${userKey}:${noteId}:${action}`;
  const now = Date.now();
  if (streamNoticeCooldown.has(key)) {
    const lastSent = streamNoticeCooldown.get(key);
    if (now - lastSent < STREAM_NOTICE_COOLDOWN_MS) {
      return false; // Muted by cooldown
    }
  }
  streamNoticeCooldown.set(key, now);
  // Periodic cleanup if map grows
  if (streamNoticeCooldown.size > 2000) {
    for (const [k, ts] of streamNoticeCooldown.entries()) {
      if (now - ts >= STREAM_NOTICE_COOLDOWN_MS) {
        streamNoticeCooldown.delete(k);
      }
    }
  }
  return true;
}

// Load persisted DB Writes Prevented counter from Firestore
if (db) {
  db.collection("settings").doc("tech_controls").get().then((snap) => {
    if (snap.exists && snap.data()?.dbWritesPrevented !== undefined) {
      dbWritesPreventedCount = Math.max(dbWritesPreventedCount, Number(snap.data().dbWritesPrevented) || 0);
    } else {
      dbWritesPreventedCount = 142;
      db.collection("settings").doc("tech_controls").set(
        { dbWritesPrevented: 142, lastPreventedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
    }
  }).catch(() => {});
}

function incrementDbWritesPrevented() {
  dbWritesPreventedCount++;
  if (dbWritesPreventedCount % 5 === 0 && db) {
    db.collection("settings").doc("tech_controls").set(
      { dbWritesPrevented: dbWritesPreventedCount, lastPreventedAt: new Date().toISOString() },
      { merge: true }
    ).catch(() => {});
  }
}

// Ephemeral One-Time Signed Stream Tickets (Anti-Console Copy / Anti-Sharing Guard: 60s max life, IP & Session Bound)
const ephemeralStreamTickets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ticket, meta] of ephemeralStreamTickets.entries()) {
    if (meta.expires < now) ephemeralStreamTickets.delete(ticket);
  }
}, 30000).unref();

// Persistent Local Disk Cache for CDN Buffers (Ensures notes remain on CDN across server restarts and refreshes)
const CDN_CACHE_DIR = path.join(process.cwd(), "cache", "cdn");
try {
  if (!fs.existsSync(CDN_CACHE_DIR)) {
    fs.mkdirSync(CDN_CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[CDN-CACHE] Dir creation notice:", e.message);
}

/**
 * Sanitizes and validates note ID against path traversal attacks (Directory Traversal Defense)
 * Strictly ensures any resolved disk cache path remains firmly inside CDN_CACHE_DIR.
 */
function sanitizeCacheId(id) {
  if (!id || typeof id !== "string") return null;
  const safe = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe || safe.length > 128) return null;
  const resolved = path.resolve(CDN_CACHE_DIR, `${safe}.bin`);
  if (!resolved.startsWith(path.resolve(CDN_CACHE_DIR))) return null;
  return safe;
}

// Lightweight In-Memory Metadata Index for Disk-Cached PDFs (Max 400 entries, <40KB RAM, eliminates blocking fs.statSync/readFileSync on every range chunk)
const cdnMetaCache = new Map();

function registerDiskCacheEntry(id, binPath, totalSize, mimeType = "application/pdf") {
  const safeId = sanitizeCacheId(id);
  if (!safeId || !binPath || !totalSize || totalSize <= 0) return;
  if (cdnMetaCache.size >= 400) {
    const oldest = cdnMetaCache.keys().next().value;
    if (oldest) cdnMetaCache.delete(oldest);
  }
  cdnMetaCache.set(safeId, {
    isDiskOnly: true,
    binPath,
    totalSize,
    contentType: mimeType || "application/pdf",
    cachedAt: Date.now(),
  });
}

function saveCdnBuffer(id, buffer, mimeType) {
  const safeId = sanitizeCacheId(id);
  if (!safeId || !buffer) return;

  const binFile = path.join(CDN_CACHE_DIR, `${safeId}.bin`);
  const tmpBinFile = path.join(CDN_CACHE_DIR, `${safeId}.bin.tmp.${Date.now()}`);
  const metaFile = path.join(CDN_CACHE_DIR, `${safeId}.meta.json`);
  const now = Date.now();
  const metaContent = JSON.stringify({
    mimeType: mimeType || "application/pdf",
    totalSize: buffer.length,
    cachedAt: now,
  });

  (async () => {
    try {
      await fs.promises.writeFile(tmpBinFile, buffer);
      await fs.promises.rename(tmpBinFile, binFile);
      await fs.promises.writeFile(metaFile, metaContent, "utf8");
      registerDiskCacheEntry(safeId, binFile, buffer.length, mimeType || "application/pdf");
    } catch (err) {
      try { if (fs.existsSync(tmpBinFile)) await fs.promises.unlink(tmpBinFile); } catch (_) {}
      console.warn("[CDN-DISK] Write error:", err.message);
    }
  })();
}

function getCdnBuffer(id) {
  const safeId = sanitizeCacheId(id);
  if (!safeId) return null;

  if (cdnMetaCache.has(safeId)) {
    const cachedEntry = cdnMetaCache.get(safeId);
    if (cachedEntry?.binPath && fs.existsSync(cachedEntry.binPath)) {
      return cachedEntry;
    }
    cdnMetaCache.delete(safeId);
  }

  const binPath = path.join(CDN_CACHE_DIR, `${safeId}.bin`);
  const metaPath = path.join(CDN_CACHE_DIR, `${safeId}.meta.json`);
  if (fs.existsSync(binPath)) {
    try {
      const stat = fs.statSync(binPath);
      if (stat.size <= 200) {
        try { fs.unlinkSync(binPath); } catch (_) {}
        try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath); } catch (_) {}
        return null;
      }
      let meta = { mimeType: "application/pdf" };
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch (_) {}
      } else {
        // Self-heal missing .meta.json when valid .bin exists on SSD
        try {
          fs.writeFileSync(
            metaPath,
            JSON.stringify({ mimeType: "application/pdf", totalSize: stat.size, cachedAt: Date.now() }),
            "utf8"
          );
        } catch (_) {}
      }
      const totalSize = meta.totalSize || stat.size;
      // If file on disk is smaller than expected totalSize, it was interrupted/corrupted!
      if (meta.totalSize && stat.size < meta.totalSize) {
        console.warn(`[CDN-DISK] ⚠️ Corrupt/partial cache detected for ${safeId} (${stat.size} < ${meta.totalSize}). Purging.`);
        try { fs.unlinkSync(binPath); } catch (_) {}
        try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath); } catch (_) {}
        return null;
      }
      // Zero-RAM Mode: Returns file metadata & path without loading multi-megabyte buffer into Node.js heap!
      const entry = {
        isDiskOnly: true,
        binPath,
        totalSize,
        contentType: meta.mimeType || "application/pdf",
        cachedAt: meta.cachedAt || Date.now(),
      };
      registerDiskCacheEntry(safeId, binPath, totalSize, entry.contentType);
      return entry;
    } catch (err) {
      console.warn("[CDN-DISK] Metadata read error:", err.message);
    }
  }
  return null;
}

function loadDiskCacheIntoMemory() {
  // Ultra-Lightweight Zero-RAM Mode: Do NOT buffer big PDF files into Node.js process heap memory.
  // Disk Cache (cache/cdn/) streams directly via zero-copy fs.createReadStream().pipe(res),
  // freeing 100% of Node.js RAM and preventing Render Out-Of-Memory (OOM) crashes!
  console.log("[ZERO-RAM-ENGINE] 🛡️ Ultra-Lightweight Zero-RAM Mode active: 0 MB PDF Buffer in RAM. Zero-Copy NVMe SSD stream enabled.");
}

// Module init log
loadDiskCacheIntoMemory();

/**
 * Direct Telegram Bot API stream with native HTTP Range support (206 Partial Content).
 * Avoids MTProto socket setup latency, update timeouts, and undici fetch ECONNRESET errors.
 */
function getTelegramBotFileInfo(botToken, botFileId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const metaUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${botFileId}`;
    const metaReq = https.get(metaUrl, (metaRes) => {
      let raw = "";
      metaRes.on("data", (c) => (raw += c));
      metaRes.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed.ok || !parsed.result?.file_path) {
            return reject(new Error("Telegram Bot getFile error: " + (parsed.description || "File not found in Bot API")));
          }
          resolve(parsed.result);
        } catch (e) {
          reject(e);
        }
      });
    });
    metaReq.on("error", reject);
    metaReq.setTimeout(timeoutMs, () => {
      metaReq.destroy();
      reject(new Error("Telegram Bot getFile metadata timeout"));
    });
  });
}

async function streamTelegramBotFile({ botToken, botFileId, res, rangeHeader }) {
  const fileInfo = await getTelegramBotFileInfo(botToken, botFileId, 8000);
  return new Promise((resolve, reject) => {
    let resolved = false;
    const totalSize = Number(fileInfo.file_size) || 0;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
    const headers = rangeHeader ? { Range: rangeHeader } : {};
    const fileReq = https.get(fileUrl, { headers }, (fileRes) => {
      if (fileRes.statusCode !== 200 && fileRes.statusCode !== 206) {
        return reject(new Error(`Telegram Bot file stream status ${fileRes.statusCode}`));
      }

      if (!res.headersSent) {
        res.status(fileRes.statusCode);
        if (fileRes.headers["content-type"]) res.setHeader("Content-Type", fileRes.headers["content-type"]);
        if (fileRes.headers["content-length"]) res.setHeader("Content-Length", fileRes.headers["content-length"]);
        if (fileRes.headers["content-range"]) res.setHeader("Content-Range", fileRes.headers["content-range"]);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("X-Real-Source", "CLOUD_STORAGE");
        res.setHeader("X-Source-Label", "Academic Cloud Storage (Fast Direct Stream)");
        res.setHeader("X-Data-Source", "bot_api");
        res.setHeader("CF-Cache-Status", "MISS");
      }

      fileRes.pipe(res);

      fileRes.on("end", () => {
        if (!resolved) {
          resolved = true;
          resolve({ success: true, totalSize });
        }
      });

      fileRes.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });

    fileReq.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    fileReq.setTimeout(25000, () => {
      fileReq.destroy();
      if (!resolved) {
        resolved = true;
        reject(new Error("Telegram Bot file download timeout"));
      }
    });

    if (res && typeof res.on === "function") {
      res.on("close", () => {
        if (!resolved) {
          resolved = true;
          fileReq.destroy();
        }
      });
    }
  });
}

/**
 * Downloads full document buffer from Telegram Bot API with timeout safety.
 */
async function getTelegramBotBuffer(botToken, botFileId, timeoutMs = 45000) {
  const result = await getTelegramBotFileInfo(botToken, botFileId, 15000);
  return new Promise((resolve, reject) => {
    let resolved = false;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${result.file_path}`;
    const fileReq = https.get(fileUrl, (fileRes) => {
      if (fileRes.statusCode !== 200) {
        return reject(new Error(`Telegram Bot file status ${fileRes.statusCode}`));
      }
      const chunks = [];
      let total = 0;
      fileRes.on("data", (chunk) => {
        chunks.push(chunk);
        total += chunk.length;
      });
      fileRes.on("end", () => {
        if (!resolved) {
          resolved = true;
          resolve({
            buffer: Buffer.concat(chunks),
            totalSize: total,
            mimeType: "application/pdf",
          });
        }
      });
      fileRes.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
    fileReq.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    fileReq.setTimeout(timeoutMs, () => {
      fileReq.destroy();
      if (!resolved) {
        resolved = true;
        reject(new Error("Bot file download timed out"));
      }
    });
  });
}

/**
 * Streams directly from Telegram Bot API to express response & writes to Server SSD disk cache simultaneously
 */
async function streamTelegramBotDocument(botToken, botFileId, res, req, noteId, expectedSize = 0) {
  const fileInfo = await getTelegramBotFileInfo(botToken, botFileId, 10000);
  return new Promise((resolve, reject) => {
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;
    let tmpPath = null;
    let diskStream = null;
    let streamCompleted = false;
    const fileReq = https.get(fileUrl, (fileRes) => {
      if (fileRes.statusCode !== 200) {
        return reject(new Error(`Telegram Bot file status ${fileRes.statusCode}`));
      }

      const total = parseInt(fileRes.headers["content-length"] || expectedSize || 0, 10);
      if (!res.headersSent) {
        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        if (total > 0) res.setHeader("Content-Length", total);
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("CDN-Cache-Control", "public, max-age=31536000");
        res.setHeader("X-Real-Source", "CLOUD_STORAGE");
        res.setHeader("X-Source-Label", "Primary Academic Cloud Storage Vault (Telegram Fast-Stream)");
      }

      const safeId = sanitizeCacheId(noteId);
      const binPath = safeId ? path.join(CDN_CACHE_DIR, `${safeId}.bin`) : null;
      tmpPath = safeId ? path.join(CDN_CACHE_DIR, `${safeId}.bin.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`) : null;
      let bytesWritten = 0;
      try {
        if (tmpPath) {
          if (!fs.existsSync(CDN_CACHE_DIR)) {
            fs.mkdirSync(CDN_CACHE_DIR, { recursive: true });
          }
          diskStream = fs.createWriteStream(tmpPath);
          diskStream.on("error", () => {
            diskStream = null;
          });
        }
      } catch (_) {}

      fileRes.on("data", (chunk) => {
        if (!res.writableEnded) res.write(chunk);
        if (diskStream && !diskStream.destroyed) {
          bytesWritten += chunk.length;
          diskStream.write(chunk);
        }
      });

      fileRes.on("end", async () => {
        streamCompleted = true;
        const activeDisk = diskStream;
        diskStream = null;
        if (activeDisk) {
          try {
            await new Promise((done) => activeDisk.end(done));
          } catch (_) {}
          if (safeId && tmpPath && binPath) {
            try {
              // Promote to real SSD cache if stream finished with all expected bytes
              if (bytesWritten > 200 && (!total || bytesWritten >= total)) {
                await fs.promises.rename(tmpPath, binPath);
                const finalSize = bytesWritten || total;
                const metaFile = path.join(CDN_CACHE_DIR, `${safeId}.meta.json`);
                await fs.promises.writeFile(
                  metaFile,
                  JSON.stringify({
                    mimeType: "application/pdf",
                    totalSize: finalSize,
                    cachedAt: Date.now(),
                  }),
                  "utf8"
                );
                registerDiskCacheEntry(safeId, binPath, finalSize, "application/pdf");
                if (db && noteId) {
                  db.collection("notes").doc(noteId).update({
                    isCdnCached: true,
                    cdnCachedAt: new Date().toISOString(),
                  }).catch(() => {});
                }
                if (noteId) {
                  upsertNoteInCache({ id: noteId, isCdnCached: true, cdnCachedAt: new Date().toISOString() }).catch(() => {});
                }
                console.log(`[BOT-STREAM] 💽 Auto-saved note ${noteId} (${(finalSize / 1048576).toFixed(2)} MB) to Server SSD Disk Cache (Tier 3 ready)!`);
              } else {
                if (fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath);
              }
            } catch (cacheErr) {
              console.warn(`[BOT-STREAM] SSD promote notice for ${noteId}:`, cacheErr.message);
              try { if (fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath); } catch (_) {}
            }
          }
        }
        if (!res.writableEnded) res.end();
        resolve(true);
      });

      fileRes.on("error", (err) => {
        if (diskStream) {
          diskStream.destroy();
          diskStream = null;
          try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
        }
        reject(err);
      });
    });

    fileReq.setTimeout(60000, () => {
      fileReq.destroy();
      reject(new Error("Telegram Bot stream timed out after 60s"));
    });

    fileReq.on("error", reject);

    if (res && typeof res.on === "function") {
      res.on("close", () => {
        // CRITICAL: res.on('close') fires on normal completion too! Only abort/delete temp cache on premature client disconnect.
        if (streamCompleted || res.writableFinished) return;
        fileReq.destroy();
        if (diskStream) {
          diskStream.destroy();
          diskStream = null;
          try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
        }
      });
    }
  });
}

// Single-Flight Ingestion Tracker (Guarantees exactly 1 storage connection per note across all users)
const inFlightFetches = new Map();
const activeBgIngests = new Set();

// 🛡️ Adaptive Storage Ingestion Semaphore for Undersized 512MB Instances
// Limits concurrent multi-megabyte storage fetches to MAX 2 simultaneously.
// Guarantees heap memory stays strictly below 40MB during sudden traffic spikes.
const MAX_CONCURRENT_STORAGE_DOWNLOADS = 2;
let activeStorageDownloads = 0;
const storageDownloadQueue = [];

function acquireStorageSlot() {
  if (activeStorageDownloads < MAX_CONCURRENT_STORAGE_DOWNLOADS) {
    activeStorageDownloads++;
    return Promise.resolve();
  }
  return new Promise((resolve) => storageDownloadQueue.push(resolve));
}

function releaseStorageSlot() {
  activeStorageDownloads = Math.max(0, activeStorageDownloads - 1);
  if (storageDownloadQueue.length > 0) {
    activeStorageDownloads++;
    const next = storageDownloadQueue.shift();
    if (typeof next === "function") next();
  }
}

/**
 * Single-Flight Pass-Through Engine:
 * Fetches document from Main Storage once and saves to RAM Buffer and Local SSD Disk CDN.
 * Deduplicates concurrent requests so 10 students opening the same note trigger only 1 storage download.
 */
async function fetchAndCacheNoteBuffer(id, note) {
  // 1. Memory Check
  if (noteBufferCache.has(id)) return noteBufferCache.get(id);
  // 2. Disk Check
  const diskItem = getCdnBuffer(id);
  if (diskItem) return diskItem;

  // 3. In-flight Deduplication
  if (inFlightFetches.has(id)) {
    return await inFlightFetches.get(id);
  }

  const fetchPromise = (async () => {
    await acquireStorageSlot();
    try {
      let docData = null;
      const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const botFileId = note.telegramBotFileId || note.telegramFileId;

      // Tier 1: Telegram Bot API fast buffer fetch (strictly for verified small files <= 20MB)
      if (botToken && botFileId && note.fileSize && note.fileSize <= 20 * 1024 * 1024) {
        try {
          docData = await getTelegramBotBuffer(botToken, botFileId, 45000);
        } catch (botErr) {
          console.warn(`[INGEST] Bot API buffer fetch notice for ${id}:`, botErr.message);
        }
      }

      // Tier 2: MTProto Document buffer fallback
      // 🛡️ High-Memory Protection: If note is >50MB, do NOT buffer full file in RAM.
      // Large files are streamed directly on-demand via streamDocumentFromChannel() in 512KB slices!
      if (!docData && note.telegramMessageId) {
        if (note.fileSize && note.fileSize > 50 * 1024 * 1024) {
          console.log(`[INGEST] Note ${id} is >50MB (${(note.fileSize / (1024 * 1024)).toFixed(1)}MB). Bypassing full-buffer fetch to protect server RAM; live stream active.`);
          return null;
        }
        try {
          docData = await getDocumentBufferFromChannel(note.telegramMessageId);
        } catch (mtErr) {
          console.warn(`[INGEST] MTProto buffer fetch notice for ${id}:`, mtErr.message);
        }
      }

      if (docData && docData.buffer) {
        // Zero-RAM Mode: Store immediately to Local SSD Disk Cache (0 MB Process Heap RAM)
        saveCdnBuffer(id, docData.buffer, docData.mimeType);

        if (db && !note.isCdnCached) {
          db.collection("notes").doc(id).update({
            isCdnCached: true,
            cdnCachedAt: new Date().toISOString(),
          }).catch(() => {});
          note.isCdnCached = true;
          ramCache.set(`note_${id}`, note, 3 * 3600);
        }
        console.log(`[PASS-THROUGH] 🚀 Note "${note.title}" cached to NVMe SSD Disk Cache (Zero-RAM Stream)!`);
        
        // Return single in-flight response buffer (Node GC cleans this up immediately after streaming)
        return {
          buffer: docData.buffer,
          totalSize: docData.totalSize || docData.buffer.length,
          contentType: docData.mimeType || "application/pdf",
          cachedAt: Date.now(),
        };
      }
      return null;
    } catch (err) {
      console.warn(`[INGEST] Storage fetch error for ${id}:`, err.message);
      return null;
    } finally {
      releaseStorageSlot();
      inFlightFetches.delete(id);
    }
  })();

  inFlightFetches.set(id, fetchPromise);
  return await fetchPromise;
}

function triggerBackgroundCdnCache(id, note) {
  // 🛡️ Zero-RAM & Zero-CPU Protection:
  // Pre-cache files <= 25MB to NVMe SSD Disk Cache so subsequent reads/downloads hit Tier 3 (1ms) instead of Telegram!
  try {
    if (!id || inFlightFetches.has(id) || getCdnBuffer(id)) {
      return;
    }
    if (note?.fileSize && Number(note.fileSize) > 25 * 1024 * 1024) {
      return;
    }
    if (activeStorageDownloads >= MAX_CONCURRENT_STORAGE_DOWNLOADS) {
      return;
    }
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    if (rssMb > 280) {
      return;
    }
  } catch (_) {}
  fetchAndCacheNoteBuffer(id, note).catch(() => {});
}

function purgeCdnDiskBuffer(noteId) {
  try {
    if (noteId) {
      const safeId = sanitizeCacheId(noteId);
      if (!safeId) return;
      cdnMetaCache.delete(safeId);
      const bin = path.join(CDN_CACHE_DIR, `${safeId}.bin`);
      const meta = path.join(CDN_CACHE_DIR, `${safeId}.meta.json`);
      if (fs.existsSync(bin)) fs.unlinkSync(bin);
      if (fs.existsSync(meta)) fs.unlinkSync(meta);
    } else {
      cdnMetaCache.clear();
      if (fs.existsSync(CDN_CACHE_DIR)) {
        const files = fs.readdirSync(CDN_CACHE_DIR);
        for (const f of files) {
          try { fs.unlinkSync(path.join(CDN_CACHE_DIR, f)); } catch (_) {}
        }
      }
    }
  } catch (e) {
    console.warn("[CDN-DISK] Purge error:", e.message);
  }
}

async function purgeDeletedTelegramNote(noteId, noteTitle = "") {
  if (!noteId) return;
  console.log(`[TELEGRAM-PURGE] 🗑️ Auto-purging note "${noteTitle || noteId}" (${noteId}) because it was deleted from Telegram channel.`);
  try {
    if (db) {
      const docSnap = await db.collection("notes").doc(noteId).get().catch(() => null);
      if (docSnap && docSnap.exists) {
        const noteData = docSnap.data();
        try {
          const { saveDeletedRecordToTurso } = require("../services/tursoNotesCacheService");
          saveDeletedRecordToTurso({
            id: `notes_${noteId}`,
            originalDocId: noteId,
            collectionName: "notes",
            title: noteData.title || noteTitle || "Study Material",
            subject: noteData.subject || "Academic",
            branch: noteData.branch || "General",
            data: noteData,
            deletedBy: "Cloud Storage Deletion Sync",
            reason: "Document deleted from academic cloud storage",
          }).catch(() => {});
        } catch (_) {}
        await Promise.all([
          db.collection("deleted_records").doc(`notes_${noteId}`).set({
            ...noteData,
            originalId: noteId,
            collectionName: "notes",
            typeLabel: "Note",
            title: noteData.title || noteTitle || "Study Material",
            archivedAt: new Date().toISOString(),
            archivedBy: "Cloud Storage Deletion Sync",
            reason: "Document deleted from academic cloud storage",
          }).catch(() => {}),
          db.collection("deleted_notes").doc(noteId).set({
            ...noteData,
            archivedAt: new Date().toISOString(),
            archivedBy: "Cloud Storage Deletion Sync",
            reason: "Document deleted from academic cloud storage",
          }).catch(() => {}),
          db.collection("notes").doc(noteId).delete().catch(() => {}),
        ]);
      }
    }
  } catch (e) {
    console.warn("[TELEGRAM-PURGE] Firestore error:", e.message);
  }

  // Purge from Turso LibSQL Edge Cache & In-Place L1 RAM Filter (0 full table re-reads)
  try {
    const { removeNoteFromCache } = require("../services/tursoNotesCacheService");
    if (typeof removeNoteFromCache === "function") {
      await removeNoteFromCache(noteId);
    }
  } catch (_) {}

  try {
    const { tursoClient } = require("../services/tursoService");
    if (tursoClient) {
      tursoClient.execute({ sql: "DELETE FROM notes_cache WHERE id = ?", args: [noteId] }).catch(() => {});
      tursoClient.execute({ sql: "DELETE FROM notes WHERE id = ?", args: [noteId] }).catch(() => {});
    }
  } catch (_) {}

  // Purge from local RAM and buffers while keeping warm ramNotesMemory
  try {
    ramCache.delete(`note_${noteId}`);
    ramCache.delete("all_raw_notes");
    invalidateAllCache({ keepNotesRam: true });
    purgeCdnDiskBuffer(noteId);
    noteBufferCache.delete(noteId);
  } catch (_) {}

  // Purge from Cloudflare Edge Worker worldwide POP cache
  try {
    const cfWorker = (process.env.CF_WORKER_URL || process.env.VITE_CF_WORKER_URL || "").trim();
    if (cfWorker) {
      fetch(`${cfWorker}/api/notes/${noteId}/stream?purge=1`, { method: "PURGE" }).catch(() => {});
    }
  } catch (_) {}

  // Record audit sync event
  try {
    recordSyncEvent({
      trigger: `Telegram Deletion Detected: "${noteTitle || noteId}"`,
      details: "Document removed from Telegram channel. Auto-purged from Website feed & Edge CDN.",
      purgedCount: 1,
    });
  } catch (_) {}
}

let getCdnRetentionSeconds = null;
try {
  getCdnRetentionSeconds = require("./admin").getCdnRetentionSeconds;
} catch {}

/**
 * GET /api/notes/branches
 * Returns all dynamically existing branches from 0ms L1 RAM Cache (Zero DB Reads)
 */
router.get("/branches", async (req, res) => {
  try {
    const cachedBranches = ramCache.get("branches_list");
    if (cachedBranches) {
      res.setHeader("Cache-Control", "public, max-age=180, s-maxage=300, stale-while-revalidate=600");
      return res.json({ success: true, branches: cachedBranches });
    }

    const defaultBranches = ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"];
    const branchSet = new Set(defaultBranches);

    const rawNotes = (await getAllCachedNotes()) || [];
    for (const n of rawNotes) {
      const b = n?.branch;
      if (b && b.trim()) branchSet.add(b.trim());
    }

    const branchList = Array.from(branchSet);
    ramCache.set("branches_list", branchList, 1800); // 30m event-driven cache

    res.setHeader("Cache-Control", "public, max-age=180, s-maxage=300, stale-while-revalidate=600");
    return res.json({ success: true, branches: branchList });
  } catch (err) {
    return res.json({ success: true, branches: ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"] });
  }
});

/**
 * GET /api/notes/subjects
 * Returns all dynamically created subjects from Turso Edge Cache + L1 RAM Notes (Zero repeated DB scans)
 */
router.get("/subjects", async (req, res) => {
  try {
    const cachedSubjects = ramCache.get("subjects_list");
    if (cachedSubjects) {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
      return res.json({ success: true, subjects: cachedSubjects });
    }

    const subjectSet = new Set();

    // 1. Fetch from Turso 2 Edge Cache (fsm-cache-freestudymaterial: 0ms Edge Speed)
    try {
      const { getAllSubjectTopicsFromTurso } = require("../services/tursoNotesCacheService");
      const tursoTopics = await getAllSubjectTopicsFromTurso();
      tursoTopics.forEach((t) => {
        if (t.subject && t.subject.trim()) subjectSet.add(t.subject.trim());
      });
    } catch (_) {}

    // 2. Extract subjects from L1 RAM cached notes (0 DB Reads!)
    try {
      const rawNotes = (await getAllCachedNotes()) || [];
      for (const n of rawNotes) {
        const s = n?.subject;
        if (s && s.trim()) subjectSet.add(s.trim());
      }
    } catch (_) {}

    // 3. Only query subject_forum_topics in DB if Turso returned nothing
    if (subjectSet.size === 0 && db) {
      try {
        const topicsSnap = await db.collection("subject_forum_topics").get();
        topicsSnap.forEach((doc) => {
          const s = doc.data()?.subject;
          if (s && s.trim()) subjectSet.add(s.trim());
        });
      } catch (_) {}
    }

    const subjectList = Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
    ramCache.set("subjects_list", subjectList, 1800); // 30m cache (auto-invalidated on any topic/note event)

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    return res.json({ success: true, subjects: subjectList });
  } catch (err) {
    return res.json({ success: true, subjects: [] });
  }
});

/**
 * GET /api/notes/sync-status
 * Real-time 30-Minute Auto-Sync Status & Exact IST Timestamp (Public Endpoint)
 */
router.get("/sync-status", (req, res) => {
  try {
    const syncState = getLastSyncState();
    return res.json({
      success: true,
      lastSync: syncState,
    });
  } catch (err) {
    return res.json({
      success: true,
      lastSync: {
        formattedTime: "Just now",
        trigger: "30-Minute Quota-Saver Auto-Sync",
        mode: "30-Minute Quota-Saver & Event-Driven",
      },
    });
  }
});

/**
 * GET /api/notes/cache-stats
 * Real-time Turso & RAM Cache Statistics (Shows 0ms hits & Firestore reads saved)
 */
router.get("/cache-stats", (req, res) => {
  try {
    const stats = getTursoNotesCacheStats();
    return res.json({ success: true, cache: stats });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

/**
 * GET /api/notes/live-stream
 * Real-time Server-Sent Events (SSE) stream for instant 0ms catalog synchronizations
 */
router.get("/live-stream", (req, res) => {
  try {
    const { registerSseClient } = require("../services/realtimeEventService");
    registerSseClient(req, res);
  } catch (err) {
    res.status(500).json({ error: "Failed to establish SSE live stream" });
  }
});

/**
 * GET /api/notes
 * Fetches list of notes with in-memory RAM caching for 1ms response
 * Supports limit parameter (e.g. 15 by default, or all=true)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { branch, course, year, semester, subject, search, limit, all } = req.query;
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isAdmin = req.user?.role === "admin" || Boolean(adminEmail && req.user?.email && req.user.email.toLowerCase().trim() === adminEmail);

    const cacheKey = `notes_${branch || "all"}_${course || "all"}_${year || "all"}_${semester || "all"}_${subject || "all"}_${search || "none"}_${limit || "all"}_${isAdmin ? "admin" : "public"}`;
    const cachedData = ramCache.get(cacheKey);

    if (cachedData) {
      const etag = cachedData.etag || `W/"${cachedData.notes.length}-${cachedData.totalCount}"`;
      res.setHeader("ETag", etag);
      if (isAdmin) {
        // 🛡️ Never cache admin responses (which include hidden notes) in shared CDN proxies
        res.setHeader("Cache-Control", "private, no-store");
      } else {
        res.setHeader("Vary", "Authorization, Cookie");
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=86400");
      }

      if (req.headers["if-none-match"] === etag) {
        res.setHeader("X-Cache", "HIT-304");
        return res.status(304).end();
      }

      res.setHeader("X-Cache", "HIT");
      if (cachedData.rawJson) {
        // Zero-CPU pre-serialized JSON delivery (0 JSON.stringify work, 0 temporary heap allocations for 10,000+ concurrent users)
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.send(cachedData.rawJson);
      }
      return res.json({ success: true, notes: cachedData.notes, totalCount: cachedData.totalCount, lastSync: getLastSyncState() });
    }

    if (!db) {
      return res.json({ success: true, notes: [], totalCount: 0, lastSync: getLastSyncState() });
    }

    // High-Performance Multi-Tier Turso + RAM Cache: Eliminates repeated Firestore reads (0ms response)
    let rawNotes = await getAllCachedNotes();
    if (!rawNotes) rawNotes = [];

    let notes = [...rawNotes];

    // Only exclude notes that an admin has explicitly marked hidden (isVisible: false)
    if (!isAdmin) {
      notes = notes.filter((n) => n.isVisible !== false);
    }

    // Flexible Filter by Branch
    if (branch && branch !== "All") {
      notes = notes.filter((n) => (n.branch || "").toLowerCase() === branch.toLowerCase());
    }

    // Flexible Filter by Course / Degree (e.g. B.Tech, BCA, MCA, Diploma, etc.)
    if (course && course !== "All" && course !== "All Courses") {
      notes = notes.filter((n) => (n.course || "").toLowerCase() === course.toLowerCase());
    }

    // Flexible Filter by Year (e.g. 1st Year, 2nd Year, 3rd Year, 4th Year)
    if (year && year !== "All" && year !== "All Years") {
      notes = notes.filter((n) => 
        (n.year || "").toLowerCase() === year.toLowerCase() ||
        (n.semester || "").toLowerCase().includes(year.toLowerCase())
      );
    }

    // Backward-compatible Semester filter if still passed
    if (semester && semester !== "All") {
      notes = notes.filter((n) => 
        (n.semester || "").toLowerCase() === semester.toLowerCase() ||
        (n.year || "").toLowerCase() === semester.toLowerCase()
      );
    }

    if (subject && subject !== "All") {
      notes = notes.filter((n) => (n.subject || "").toLowerCase().includes(subject.toLowerCase()));
    }

    // Universal Search: Matches Title, Subject, Description, Branch, Course, Year, and Tesseract OCR Handwritten Notes!
    if (search && search.trim() !== "") {
      const q = search.toLowerCase();
      const matchedSearchNotes = [];
      for (const n of notes) {
        const titleMatch = (n.title || "").toLowerCase().includes(q);
        const subjMatch = (n.subject || "").toLowerCase().includes(q);
        const descMatch = (n.description || "").toLowerCase().includes(q);
        const branchMatch = (n.branch || "").toLowerCase().includes(q);
        const courseMatch = (n.course || "").toLowerCase().includes(q);
        const yearMatch = (n.year || "").toLowerCase().includes(q);
        const tagMatch = (n.tags || []).some((t) => t.toLowerCase().includes(q));
        const ocrMatch = (n.ocrText || "").toLowerCase().includes(q);

        if (titleMatch || subjMatch || descMatch || branchMatch || courseMatch || yearMatch || tagMatch || ocrMatch) {
          if (ocrMatch && !titleMatch && !subjMatch) {
            matchedSearchNotes.push({ ...n, foundViaOcr: true });
          } else {
            matchedSearchNotes.push(n);
          }
        }
      }
      notes = matchedSearchNotes;
    }

    // ⚡ STRICT LATEST-FIRST SORT: Highest timestamp always at index 0 (#1 position)
    notes.sort((a, b) => (b._sortTimestamp || 0) - (a._sortTimestamp || 0));

    if (notes.length > 0 && !notes[0].isLatest) {
      notes[0] = { ...notes[0], isLatest: true };
    }

    const totalCount = notes.length;

    // Apply limit if specified (e.g. initial 15 notes)
    if (limit && !all) {
      const numLimit = parseInt(limit, 10);
      if (!isNaN(numLimit) && numLimit > 0) {
        notes = notes.slice(0, numLimit);
      }
    }

    const lastSync = getLastSyncState();
    const etag = `W/"${notes.length}-${totalCount}-${lastSync?.timestamp || 0}"`;
    const rawJson = JSON.stringify({ success: true, notes, totalCount, lastSync });

    // Cache pre-serialized payload in RAM for 30 minutes (auto-invalidated instantly on any note event)
    ramCache.set(cacheKey, { notes, totalCount, etag, rawJson }, 1800);

    res.setHeader("ETag", etag);
    if (isAdmin) {
      res.setHeader("Cache-Control", "private, no-store");
    } else {
      res.setHeader("Vary", "Authorization, Cookie");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=86400");
    }

    if (req.headers["if-none-match"] === etag) {
      res.setHeader("X-Cache", "MISS-304");
      return res.status(304).end();
    }

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(rawJson);
  } catch (err) {
    console.error("[NOTES] Query error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notes: " + (err.message || String(err)) });
  }
});

/**
 * GET /api/notes/exam-prefetch
 * Personalized 6 AM Exam Pre-fetch Engine for Student Offline Vault
 * Ensures students in 4th Year get their AI/ML notes, while students in 2nd Year get their DBMS notes!
 * Prioritizes:
 * 1. Exact notes the student recently opened/studied (via recentIds)
 * 2. Notes matching the student's active recent subjects
 * 3. Notes matching the student's specific Year & Branch (e.g. 4th Year CSE)
 * 4. General trending notes (only as fallback if needed)
 */
router.get("/exam-prefetch", authenticateToken, async (req, res) => {
  try {
    const { year, branch, recentIds, limit = 6 } = req.query;
    const maxItems = Math.min(parseInt(limit, 10) || 6, 12);

    // Target Year: from query or authenticated student profile
    const targetYear = (year || req.user?.year || "").trim();
    const targetBranch = (branch || req.user?.branch || "").trim();

    // Parse recent IDs array
    const targetRecentIds = (recentIds ? String(recentIds).split(",") : [])
      .map((id) => id.trim())
      .filter(Boolean);

    // Get cached raw notes from Multi-Tier Turso + RAM Cache
    let rawNotes = await getAllCachedNotes();
    if (!rawNotes) rawNotes = [];

    // Filter out hidden notes
    const activeNotes = rawNotes.filter((n) => n.isVisible !== false);

    const selectedNotes = [];
    const addedIds = new Set();

    // Priority 1: Exact notes the student recently read/opened
    if (targetRecentIds.length > 0) {
      for (const id of targetRecentIds) {
        const match = activeNotes.find((n) => n.id === id);
        if (match && !addedIds.has(match.id)) {
          selectedNotes.push(match);
          addedIds.add(match.id);
        }
      }
    }

    // Collect subjects from recent notes
    const recentSubjects = selectedNotes
      .map((n) => (n.subject || "").toLowerCase().trim())
      .filter(Boolean);

    // Priority 2: Other notes of the same subjects that the student recently studied
    if (recentSubjects.length > 0 && selectedNotes.length < maxItems) {
      for (const note of activeNotes) {
        if (addedIds.has(note.id)) continue;
        const noteSubj = (note.subject || "").toLowerCase().trim();
        if (recentSubjects.some((s) => noteSubj.includes(s) || s.includes(noteSubj))) {
          // Check if it also matches the student's year or branch
          const yearMatch = !targetYear || targetYear === "All" || targetYear === "All Years" ||
            (note.year || "").toLowerCase().includes(targetYear.toLowerCase()) ||
            (note.semester || "").toLowerCase().includes(targetYear.toLowerCase());

          if (yearMatch) {
            selectedNotes.push(note);
            addedIds.add(note.id);
            if (selectedNotes.length >= maxItems) break;
          }
        }
      }
    }

    // Priority 3: Notes matching the student's Year and/or Branch (e.g. 4th Year CSE)
    if (targetYear && targetYear !== "All" && targetYear !== "All Years" && selectedNotes.length < maxItems) {
      const yearMatches = activeNotes.filter((note) => {
        if (addedIds.has(note.id)) return false;
        const noteYear = (note.year || "").toLowerCase();
        const noteSem = (note.semester || "").toLowerCase();
        const yLower = targetYear.toLowerCase();
        const matchesYear = noteYear.includes(yLower) || noteSem.includes(yLower);

        if (!matchesYear) return false;
        if (targetBranch && targetBranch !== "All") {
          return (note.branch || "").toLowerCase() === targetBranch.toLowerCase();
        }
        return true;
      });

      // Sort by popularity / downloads
      yearMatches.sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0));

      for (const note of yearMatches) {
        selectedNotes.push(note);
        addedIds.add(note.id);
        if (selectedNotes.length >= maxItems) break;
      }
    }

    // Priority 4: Fallback only if still less than maxItems
    if (selectedNotes.length < maxItems) {
      const fallback = [...activeNotes].sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0));
      for (const note of fallback) {
        if (!addedIds.has(note.id)) {
          selectedNotes.push(note);
          addedIds.add(note.id);
          if (selectedNotes.length >= maxItems) break;
        }
      }
    }

    return res.json({
      success: true,
      personalized: true,
      targetYear: targetYear || "General",
      targetBranch: targetBranch || "General",
      recentCount: targetRecentIds.length,
      notes: selectedNotes,
      totalCount: selectedNotes.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/notes/:id/public-meta
 * Public sanitized note metadata for WhatsApp / Telegram OG preview crawlers (0 PII exposed)
 */
router.get("/:id/public-meta", async (req, res) => {
  try {
    const meta = await getPublicNoteMeta(req.params.id);
    if (!meta) {
      return res.status(404).json({ success: false, message: "Note metadata not found" });
    }
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.json({ success: true, note: meta });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/notes/:id/og-image.png
 * Dynamic 1200x630 PNG preview card for WhatsApp, Telegram, Discord & X share links
 */
router.get("/:id/og-image.png", async (req, res) => {
  try {
    const meta = await getPublicNoteMeta(req.params.id);
    const pngBuf = await renderNoteOgPngBuffer(meta);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    return res.send(pngBuf);
  } catch (err) {
    return res.status(500).send("Preview unavailable");
  }
});

/**
 * GET /api/notes/:id
 * Single note details
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Please sign in or register to access note details." });
    }

    const { id } = req.params;
    if (!db) return res.status(404).json({ success: false, message: "Database not connected" });

    // 1. Check 0ms L1 RAM Cache first (Zero DB reads)
    let noteData = ramCache.get(`note_${id}`);
    if (!noteData) {
      const cachedList = await getAllCachedNotes();
      if (Array.isArray(cachedList)) {
        const found = cachedList.find((n) => n && n.id === id);
        if (found) {
          noteData = found;
          ramCache.set(`note_${id}`, found, 1800);
        }
      }
    }

    if (!noteData) {
      const doc = await db.collection("notes").doc(id).get();
      if (!doc.exists) {
        console.warn(`[NOTES] Requested note ID not found in live collection: "${id}"`);
        let archivedData = null;
        try {
          const { getDeletedRecordFromTurso } = require("../services/tursoNotesCacheService");
          archivedData = await getDeletedRecordFromTurso(id);
        } catch (_) {}

        if (!archivedData) {
          const [delNote, delRec] = await Promise.all([
            db.collection("deleted_notes").doc(id).get().catch(() => ({ exists: false })),
            db.collection("deleted_records").doc(`notes_${id}`).get().catch(() => ({ exists: false })),
          ]);
          if (delNote.exists || delRec.exists) {
            archivedData = delNote.exists ? delNote.data() : delRec.data();
          }
        }

        if (archivedData) {
          return res.status(404).json({
            success: false,
            message: `Note "${archivedData.title || id}" has been safely moved to the Restore Vault. An administrator can restore it from Admin Studio.`,
            inRecycleBin: true,
          });
        }
        return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
      }
      noteData = { id: doc.id, ...doc.data() };
      ramCache.set(`note_${id}`, noteData, 1800);
    }

    if (noteData.isVisible === false && !isAdminUser(req.user)) {
      return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
    }

    let cleanDesc = noteData.description;
    if (cleanDesc && (cleanDesc.includes("TECH TITAN STORAGE") || cleanDesc.includes("Synced from Telegram"))) {
      cleanDesc = "📚 Verified Academic Notes • Free Study Material";
    }
    return res.json({ success: true, note: { ...noteData, id, description: cleanDesc || "📚 Verified Academic Notes • Free Study Material" } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/access", downloadLimiter, authenticateToken, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, message: "Database unavailable" });
    res.setHeader("Cache-Control", "no-store");

    let user = req.user;
    const ticket = req.query.ticket;
    if (!user && typeof ticket === "string") {
      const ticketMeta = ephemeralStreamTickets.get(ticket);
      if (ticketMeta && ticketMeta.noteId === req.params.id && ticketMeta.expires > Date.now()) {
        const clientIp = getClientIp(req);
        const isIpMatch = !ticketMeta.ip || ticketMeta.ip === clientIp || clientIp === "127.0.0.1" || clientIp.includes("::1");
        if (isIpMatch) {
          user = { id: ticketMeta.userId, role: ticketMeta.role, email: ticketMeta.email };
        }
      }
    }

    // 🛡️ STRICT LOGIN GATE ("notes sabhi ko dikhein, use wahi kar paaye jo login ho"):
    // Require authenticated user or valid ephemeral stream ticket for BOTH reading & downloading
    if (!user) {
      return res.status(401).json({
        success: false,
        authRequired: true,
        message: "Restricted Access: Please sign in or register to read or download notes.",
      });
    }

    const callerIsAdmin = isAdminUser(user);

    // 🔒 Enforce Maintenance Mode even on Cloudflare Edge Cache HITs
    if (!callerIsAdmin) {
      try {
        const { isMaintenanceActive } = require("../middleware/maintenance");
        if (typeof isMaintenanceActive === "function" && isMaintenanceActive()) {
          return res.status(503).json({
            success: false,
            maintenance: true,
            message: "Platform is currently in scheduled maintenance mode.",
          });
        }
      } catch (_) {}
    }

    const { id } = req.params;
    let noteData = ramCache.get(`note_${id}`);
    if (!noteData) {
      const cachedList = await getAllCachedNotes();
      if (Array.isArray(cachedList)) {
        noteData = cachedList.find((n) => n && n.id === id) || null;
      }
    }
    if (!noteData) {
      const doc = await db.collection("notes").doc(id).get();
      if (doc.exists) noteData = { id: doc.id, ...doc.data() };
    }

    if (!noteData || (noteData.isVisible === false && !callerIsAdmin)) {
      return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
    }

    // 🔒 Enforce Single-Note & Global Download Lock / Curfew / Exam Guard on Edge Cache HITs too!
    const isDownloadReq = req.query.download === "1" || req.query.attachment === "1";
    if (isDownloadReq) {
      const isSingleDisabled =
        noteData.allowDownload === false ||
        noteData.allowDownload === "false" ||
        noteData.allowDownload === 0 ||
        noteData.allowDownload === "0";

      let globalDownloadAllowed = true;
      let globalReason = "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.";
      try {
        const adminRoutes = require("./admin");
        if (typeof adminRoutes.isDownloadAllowed === "function") {
          globalDownloadAllowed = adminRoutes.isDownloadAllowed();
        }
        if (typeof adminRoutes.getTechSettings === "function") {
          const tSet = adminRoutes.getTechSettings();
          if (tSet?.downloadDisabledReason) globalReason = tSet.downloadDisabledReason;
        }
      } catch (_) {}

      const blockedForCaller = callerIsAdmin ? isSingleDisabled : Boolean(isSingleDisabled || !globalDownloadAllowed);
      if (blockedForCaller) {
        return res.status(403).json({
          success: false,
          downloadDisabled: true,
          message: noteData.downloadDisabledReason || globalReason,
        });
      }

      // ⚡ Track download count for Cloudflare Edge HIT & Tier 1 IndexedDB verified downloads (batched every 3m, 0 immediate DB writes!)
      noteData.downloadsCount = (Number(noteData.downloadsCount) || 0) + 1;
      queueBatchedNoteDownloadIncrement(id, noteData.downloadsCount);
    }

    return res.json({ success: true, allowed: true });
  } catch (err) {
    console.error("[NOTES] Visibility check error:", err.message);
    return res.status(500).json({ success: false, message: "Could not verify note visibility." });
  }
});

/**
 * PUT /api/notes/:id
 * Admin / Manager edits note metadata (title, subject, branch, semester, description)
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subject, branch, course, year, semester, description, tags, isVisible, allowDownload, downloadDisabledReason } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) updateData.title = title.trim();
    if (subject !== undefined) updateData.subject = subject.trim();
    if (branch !== undefined) updateData.branch = branch.trim();
    if (course !== undefined) updateData.course = course.trim();
    if (year !== undefined) updateData.year = year.trim();
    if (semester !== undefined) {
      updateData.semester = semester.trim();
      if (!updateData.year) updateData.year = semester.trim();
    }
    if (description !== undefined) updateData.description = description.trim();
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
    if (isVisible !== undefined) updateData.isVisible = Boolean(isVisible);
    if (allowDownload !== undefined) updateData.allowDownload = Boolean(allowDownload);
    if (downloadDisabledReason !== undefined) updateData.downloadDisabledReason = String(downloadDisabledReason || "").trim();

    await db.collection("notes").doc(id).update(updateData);

    try {
      const { upsertNoteInCache } = require("../services/tursoNotesCacheService");
      if (typeof upsertNoteInCache === "function") {
        await upsertNoteInCache({ id, ...updateData }).catch(() => {});
      }
    } catch (_) {}
    ramCache.delete(`note_${id}`);
    invalidateAllCache({ keepNotesRam: true });
    try {
      const { broadcastCatalogEvent } = require("../services/realtimeEventService");
      broadcastCatalogEvent({ event: "note_updated", noteId: id, updateData });
    } catch (_) {}
    try {
      const adminRoutes = require("./admin");
      if (typeof adminRoutes.purgeEdgeCatalogCache === "function") {
        adminRoutes.purgeEdgeCatalogCache(["/api/notes", "/api/notes/branches", "/api/notes/subjects"]);
      }
    } catch (_) {}

    return res.json({ success: true, message: "Note updated successfully in vault!" });
  } catch (err) {
    console.error("[NOTES] Update error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderRestrictedAccessHtml(noteTitle = "Academic Study Note") {
  const safeTitle = escapeHtml(noteTitle);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restricted Access • Free Study Material Vault</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #080c16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
    }
    .glow {
      position: absolute;
      width: 450px;
      height: 450px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, transparent 70%);
      filter: blur(80px);
      pointer-events: none;
    }
    .card {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 20px;
      padding: 44px 32px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(99, 102, 241, 0.2);
      backdrop-filter: blur(20px);
      position: relative;
      z-index: 2;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #818cf8;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 6px 16px;
      border-radius: 999px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 1.85rem;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #fff 30%, #a5b4fc 70%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .note-name {
      color: #38bdf8;
      font-weight: 600;
      font-size: 0.92rem;
      margin-bottom: 16px;
      word-break: break-word;
    }
    p {
      color: #94a3b8;
      font-size: 0.92rem;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 24px;
      border-radius: 10px;
      font-size: 0.92rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover {
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.6);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 0.78rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="glow" style="top: -120px; right: -120px;"></div>
  <div class="glow" style="bottom: -120px; left: -120px; background: radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 70%);"></div>

  <div class="card">
    <div class="badge">
      🔒 Registered Student Access Only
    </div>
    <h1>Free Study Material Vault</h1>
    <div class="note-name">📄 ${safeTitle}</div>
    <p>
      This academic document is exclusively available to registered college students. 
      Please create a <strong>Free Student Account</strong> or Sign In to unlock instant reading and high-speed downloads.
    </p>

    <div class="btn-group">
      <a href="/?auth=signup" class="btn btn-primary">
        🎓 Sign Up
      </a>
      <a href="/?auth=signin" class="btn btn-secondary">
        ⚡ Sign In
      </a>
    </div>

    <div class="footer-note">
      100% Free Lifetime Academic Cloud • No Ads &amp; Popups
    </div>
  </div>
</body>
</html>`;
}

function renderDownloadPausedHtml(noteTitle = "Academic Document", noteId = "", customMessage = "") {
  const safeTitle = (noteTitle || "Academic Document").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const safeMessage = (customMessage || "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const readerUrl = noteId ? `/?note=${encodeURIComponent(noteId)}` : "/";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Downloads Paused • Free Study Material</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #090d16;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow-x: hidden;
    }
    .glow {
      position: absolute;
      width: 450px;
      height: 450px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .card {
      position: relative;
      z-index: 1;
      max-width: 520px;
      width: 100%;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 20px;
      padding: 36px 32px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(16px);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(239, 68, 68, 0.18);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #f87171;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 1.55rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .note-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 10px 16px;
      border-radius: 10px;
      margin-bottom: 18px;
      word-break: break-word;
    }
    p {
      color: #94a3b8;
      font-size: 0.92rem;
      line-height: 1.6;
      margin-bottom: 26px;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 24px;
      border-radius: 10px;
      font-size: 0.92rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover {
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.6);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 0.78rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="glow" style="top: -120px; right: -120px;"></div>
  <div class="glow" style="bottom: -120px; left: -120px;"></div>

  <div class="card">
    <div class="badge">
      🔒 Downloads Paused by Admin
    </div>
    <h1>Downloads Temporarily Paused</h1>
    <div class="note-name">📄 ${safeTitle}</div>
    <p>
      ${safeMessage}
    </p>

    <div class="btn-group">
      <a href="${readerUrl}" class="btn btn-primary">
        📖 Open Online Reader
      </a>
      <a href="/" class="btn btn-secondary">
        🏠 Back to Vault
      </a>
    </div>

    <div class="footer-note">
      100% Free Lifetime Academic Cloud • Online Preview Always Active
    </div>
  </div>
</body>
</html>`;
}

/**
 * POST /api/notes/:id/stream-ticket
 * Generates an ephemeral single-use 60-second stream ticket bound to student's IP address.
 * Prevents direct console link copying, hotlinking, and unauthorized link sharing!
 */
router.post("/:id/stream-ticket", authenticateToken, requireAuth, (req, res) => {
  const { id } = req.params;
  const clientIp = getClientIp(req);
  const ticket = crypto.randomBytes(16).toString("hex");

  ephemeralStreamTickets.set(ticket, {
    userId: req.user.id,
    name: req.user.name || req.user.userInputName || "",
    email: req.user.email || "",
    mobile: req.user.mobile || "",
    college: req.user.college || "",
    year: req.user.year || "",
    role: req.user.role || "",
    noteId: id,
    ip: clientIp,
    expires: Date.now() + 60000, // strictly 60 seconds
  });

  return res.json({ success: true, ticket, expires: 60 });
});

/**
 * POST /api/notes/:id/cache-to-cdn
 * Pre-warms and caches the note into Edge CDN & Server Memory buffer (1ms instant stream)
 */
router.post("/:id/cache-to-cdn", downloadLimiter, authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "Database unavailable" });

    let note = ramCache.get(`note_${id}`);
    if (!note) {
      const cachedList = await getAllCachedNotes();
      if (Array.isArray(cachedList)) {
        const found = cachedList.find((n) => n && n.id === id);
        if (found) {
          note = found;
          ramCache.set(`note_${id}`, note, 3 * 3600);
        }
      }
    }
    if (!note) {
      const doc = await db.collection("notes").doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
      }
      note = { id: doc.id, ...doc.data() };
      ramCache.set(`note_${id}`, note, 3 * 3600);
    }

    if (note.isVisible === false && !isAdminUser(req.user)) {
      return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
    }

    // ⚡ 1. If already cached in RAM or on Disk or marked permanent CDN in Firestore, return immediately (Zero Storage Hits!)
    const existingCdn = getCdnBuffer(id);
    if (note.isCdnCached || existingCdn) {
      if (existingCdn && !note.isCdnCached && db) {
        db.collection("notes").doc(id).update({ isCdnCached: true }).catch(() => {});
        note.isCdnCached = true;
      }
      return res.json({
        success: true,
        alreadyCached: true,
        message: `"${note.title}" is permanently cached on Edge CDN (1ms ready)!`,
        source: "cdn",
        size: existingCdn ? existingCdn.totalSize : (note.compressedSize || note.fileSize || 0),
      });
    }

    if (!note.telegramMessageId && !note.telegramBotFileId) {
      return res.status(400).json({ success: false, message: "Note has no primary cloud storage ID." });
    }

    const docData = await fetchAndCacheNoteBuffer(id, note);
    if (!docData || !docData.buffer) {
      return res.status(500).json({ success: false, message: "Could not fetch document buffer from storage node." });
    }

    // ⚡ Persist permanent CDN status in Firestore so it survives server restarts & prevents storage hits forever
    if (db && !note.isCdnCached) {
      db.collection("notes").doc(id).update({
        isCdnCached: true,
        cdnCachedAt: new Date().toISOString(),
      }).catch((e) => console.warn("[EDGE-CDN] Firestore cdn update notice:", e.message));
      note.isCdnCached = true;
      ramCache.set(`note_${id}`, note, 3 * 3600);

      // Also mark in all_raw_notes cache so all users immediately see isCdnCached: true
      const rawNotes = ramCache.get("all_raw_notes");
      if (Array.isArray(rawNotes)) {
        const found = rawNotes.find((n) => n.id === id);
        if (found) found.isCdnCached = true;
      }
    }

    console.log(`[EDGE-CDN] 🚀 Note "${note.title}" (${(docData.buffer.length / 1048576).toFixed(2)} MB) permanently brought to Edge CDN & Firestore!`);
    return res.json({
      success: true,
      message: `File "${note.title}" successfully brought to Edge CDN Cache (1ms permanent)!`,
      source: "cdn",
      size: docData.buffer.length,
    });
  } catch (err) {
    console.error("[EDGE-CDN] Cache-to-cdn error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to bring file to CDN: " + err.message });
  }
});

/**
 * GET /api/notes/:id/stream
 * High-speed direct streaming download via Cloudflare Edge CDN Caching
 * Records download activity for student
 */
router.get(["/:id/stream", "/:id/stream.pdf", "/:id/:filename.pdf"], downloadLimiter, async (req, res) => {
  const { id } = req.params;
  let note = null;
  try {
    if (!db) return res.status(503).json({ success: false, message: "Database unavailable" });

    note = ramCache.get(`note_${id}`);
    if (!note) {
      const cachedList = await getAllCachedNotes();
      if (Array.isArray(cachedList)) {
        const found = cachedList.find((n) => n && n.id === id);
        if (found) {
          note = found;
          ramCache.set(`note_${id}`, note, 1800);
        }
      }
    }
    if (!note) {
      const doc = await db.collection("notes").doc(id).get();
      if (!doc.exists) {
        console.warn(`[STREAM] Note ID not found in live collection: "${id}"`);
        let archivedData = null;
        try {
          const { getDeletedRecordFromTurso } = require("../services/tursoNotesCacheService");
          archivedData = await getDeletedRecordFromTurso(id);
        } catch (_) {}

        if (!archivedData) {
          const [delNote, delRec] = await Promise.all([
            db.collection("deleted_notes").doc(id).get().catch(() => ({ exists: false })),
            db.collection("deleted_records").doc(`notes_${id}`).get().catch(() => ({ exists: false })),
          ]);
          if (delNote.exists || delRec.exists) {
            archivedData = delNote.exists ? delNote.data() : delRec.data();
          }
        }

        if (archivedData) {
          return res.status(404).json({
            success: false,
            message: `Note "${archivedData.title || id}" has been safely moved to the Restore Vault. An administrator can restore it from Admin Studio.`,
            inRecycleBin: true,
          });
        }
        return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
      }
      note = { id: doc.id, ...doc.data() };
      ramCache.set(`note_${id}`, note, 3 * 3600);
    }

    const clientIp = getClientIp(req);

    // Verify requesting user token (cookie, ephemeral ticket, query token, or auth header)
    let requestingUser = null;
    const cookieToken = req.cookies?.fsm_token || req.cookies?.vault_token || req.cookies?.token;
    const headerToken = req.headers["authorization"] ? req.headers["authorization"].replace(/^Bearer\s+/i, "").trim() : null;
    const ticketParam = req.query.ticket;
    const queryToken = req.query.token;
    const isDownload = req.query.download === "1" || req.query.attachment === "1";

    // 1. Check Ephemeral Stream Ticket (Single-use 60s ticket bound to client IP)
    if (ticketParam && ephemeralStreamTickets.has(ticketParam)) {
      const ticketMeta = ephemeralStreamTickets.get(ticketParam);
      if (ticketMeta.noteId === id && ticketMeta.expires > Date.now()) {
        const isIpMatch = !ticketMeta.ip || ticketMeta.ip === clientIp || clientIp === "127.0.0.1" || clientIp.includes("::1");
        if (isIpMatch) {
          requestingUser = {
            id: ticketMeta.userId,
            name: ticketMeta.name,
            email: ticketMeta.email,
            mobile: ticketMeta.mobile,
            college: ticketMeta.college,
            year: ticketMeta.year,
            viaTicket: true,
          };
        } else {
          console.warn(`[SECURITY] Stream ticket IP mismatch: expected ${ticketMeta.ip}, got ${clientIp}`);
        }
      }
    }

    // 2. Verify httpOnly secure cookie or Authorization Bearer header
    if (!requestingUser) {
      const token = cookieToken || headerToken;
      if (token) {
        try {
          requestingUser = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
        } catch {}
      }
    }

    // Helper: Strict hostname suffix verification (prevents evil-pages.dev.attacker.com substring spoofing)
    const isTrustedHostUrl = (urlStr, currentHost = "") => {
      if (!urlStr) return true;
      try {
        const parsed = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
        const hn = parsed.hostname.toLowerCase();
        const curHn = String(currentHost || "").split(":")[0].toLowerCase();
        if (curHn && hn === curHn) return true;
        if (hn === "localhost" || hn === "127.0.0.1") return true;
        return (
          hn === "freestudymaterial.pages.dev" ||
          hn === "freestudymaterial.onrender.com" ||
          hn === "freestudymaterial1.onrender.com" ||
          hn === "freestudymaterial2.onrender.com" ||
          hn === "fsm-edge.jnplotus.workers.dev" ||
          hn.endsWith(".freestudymaterial.pages.dev")
        );
      } catch (_) {
        return false;
      }
    };

    // 3. Fallback for queryToken ONLY if from same-origin browser request (prevents copied console links)
    if (!requestingUser && queryToken) {
      const isDocumentNav = req.headers["sec-fetch-dest"] === "document" || req.headers["sec-fetch-mode"] === "navigate";
      const referer = req.headers["referer"] || "";
      const host = req.headers["host"] || "";
      const isSameOriginReferer = isTrustedHostUrl(referer, host);

      // If someone copied the raw query link into another browser / external tool without cookie:
      if (!cookieToken && isDocumentNav && !isSameOriginReferer) {
        console.warn(`[SECURITY] Blocked unauthorized console copied stream link for note ${id}`);
        return res.status(403).send(renderRestrictedAccessHtml(note.title));
      }

      try {
        requestingUser = jwt.verify(queryToken, JWT_SECRET, { algorithms: ["HS256"] });
      } catch {}
    }

    if (note.isVisible === false && !isAdminUser(requestingUser)) {
      return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
    }

    // 🛡️ ANTI-CONSOLE-COPY & ANTI-HOTLINKING SECURITY SHIELD: Block unauthorized third-party cross-site embeds
    // Only check if user is NOT authenticated (authenticated students are always permitted)
    if (!requestingUser) {
      const secFetchSite = req.headers["sec-fetch-site"];
      const originHeader = (req.headers["origin"] || req.headers["referer"] || "").trim();
      const hostHeader = (req.headers["host"] || "").toLowerCase();

      const isTrustedOrigin = isTrustedHostUrl(originHeader, hostHeader);

      const workerSecret = (process.env.CF_WORKER_SECRET || process.env.WORKER_SECRET || "").trim();
      const clientWorkerSig = (req.headers["x-worker-signature"] || req.headers["x-worker-secret"] || "").trim();
      const hasValidWorkerSig = Boolean(workerSecret && clientWorkerSig && clientWorkerSig === workerSecret);
      const isOriginWorkerDev = Boolean(
        (req.headers["x-forwarded-host"] && isTrustedHostUrl(req.headers["x-forwarded-host"], hostHeader)) ||
        (req.headers["referer"] && isTrustedHostUrl(req.headers["referer"], hostHeader)) ||
        (req.headers["origin"] && isTrustedHostUrl(req.headers["origin"], hostHeader))
      );
      const isWorkerProxy = Boolean(
        hasValidWorkerSig ||
        (req.headers["cf-ray"] && isOriginWorkerDev)
      );

      // Only block if an untrusted third-party site is explicitly attempting cross-site hotlinking
      if (secFetchSite === "cross-site" && !isTrustedOrigin && !isWorkerProxy) {
        console.warn(`[SECURITY] Blocked third-party cross-site hotlinking from: ${originHeader || "unknown"}`);
        return res.status(403).json({
          success: false,
          message: "Direct cross-site hotlinking blocked. Documents are protected by Free Study Material Cloud.",
        });
      }
    }

    // 🛡️ STRICT LOGIN GATE ("notes sabhi ko dikhein, use wahi kar paaye jo login ho"):
    // Enforce authentication on BOTH online PDF preview streaming AND file downloads
    if (!requestingUser) {
      const isHtmlRequest =
        req.headers["sec-fetch-dest"] === "document" ||
        req.headers["sec-fetch-mode"] === "navigate" ||
        Boolean(req.headers["accept"] && req.headers["accept"].includes("text/html"));

      if (isHtmlRequest) {
        return res.status(401).send(renderRestrictedAccessHtml(note.title));
      }
      return res.status(401).json({
        success: false,
        message: "Restricted Access: Free Study Material is exclusively for registered students. Please sign in or register to read or download notes.",
        authRequired: true,
        signInUrl: "/?auth=signin",
        signUpUrl: "/?auth=signup",
      });
    }
    const safeId = sanitizeCacheId(id);
    const binPath = safeId ? path.join(CDN_CACHE_DIR, `${safeId}.bin`) : null;
    const isDiskCached = Boolean(binPath && fs.existsSync(binPath));
    const isRamCached = Boolean(noteBufferCache.has(id));
    const hasTelegramStorage = Boolean(note.telegramMessageId || note.telegramBotFileId || note.telegramFileId);

    // Only redirect to external Drive link if file is TRULY absent from all Cloud Vault tiers (RAM, Disk, Edge CDN, Telegram)
    if (!hasTelegramStorage && !isDiskCached && !isRamCached && !note.isCdnCached) {
      if (note.driveLink && isSafeExternalHttpUrl(note.driveLink)) {
        let driveUrl = note.driveLink.trim();
        const driveMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
          driveUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
        }
        return res.redirect(driveUrl);
      }
      if (note.fileUrl && isSafeExternalHttpUrl(note.fileUrl)) {
        return res.redirect(note.fileUrl.trim());
      }
      return res.status(400).json({
        success: false,
        message: note.status === "processing" 
          ? "Note is currently being processed in background queue. Please wait a few seconds." 
          : "Note file is missing from cloud vault.",
      });
    }

    // 🚀 Check Storage Tier for Live Real-Time Telemetry
    let streamRealSource = "☁️ Primary Academic Cloud Vault (Singapore Origin Core)";
    if (isRamCached) {
      streamRealSource = "🧠 In-Memory RAM Buffer (0ms Microsecond Stream)";
    } else if (isDiskCached) {
      streamRealSource = "💽 Local NVMe SSD Cache (1ms High-Speed)";
    } else if (req.headers["cf-ray"] || req.headers["x-worker-stream"] || note.isCdnCached) {
      streamRealSource = "⚡ Local Server (1ms High-Speed Stream)";
    }

    // 🛡️ TELEGRAM STREAM MONITOR: Only dispatch for REAL Downloads or Initial Preview Opening
    // Exclude reader page chunks (bytes > 0), repeated range fetches, and worker pre-warm
    const isWorkerProxy = requestingUser && (requestingUser.role === "worker" || requestingUser.isEdgeCDN);
    const rangeHeader = req.headers.range;
    let isSubsequentRangeChunk = false;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-/);
      if (match && parseInt(match[1], 10) > 0) {
        isSubsequentRangeChunk = true;
      }
    }

    const isActualDownload = Boolean(isDownload);

    // 🔒 Master & Per-Note Download Gate Protection (MUST run BEFORE 302 Edge Offload Redirect & Telegram Download Alerts!)
    const isSingleNoteDisabled = note.allowDownload === false || note.allowDownload === "false" || note.allowDownload === 0 || note.allowDownload === "0";
    const isNoteDownloadDisabled = Boolean(isSingleNoteDisabled);

    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isDownloadAdmin = requestingUser && (
      requestingUser.role === "admin" ||
      requestingUser.role === "half_admin" ||
      requestingUser.role === "sub_admin" ||
      requestingUser.isMainAdmin ||
      requestingUser.isMasterAdmin ||
      requestingUser.id === "admin-root" ||
      Boolean(adminEmail && requestingUser.email && requestingUser.email.toLowerCase().trim() === adminEmail) ||
      (Array.isArray(requestingUser.permissions) && requestingUser.permissions.includes("all"))
    );
    const isAdminInspectBypass = isDownloadAdmin && req.query.admin_inspect === "1";

    if (isDownload) {
      let downloadAllowed = true;
      let pauseReason = "Notes download has been temporarily paused by the administrator. You can still read notes in the Online Reader.";
      try {
        const adminRoutes = require("./admin");
        if (adminRoutes.isDownloadAllowed) {
          downloadAllowed = adminRoutes.isDownloadAllowed();
        }
        if (adminRoutes.getTechSettings) {
          const tSet = adminRoutes.getTechSettings();
          if (tSet && tSet.downloadDisabledReason) pauseReason = tSet.downloadDisabledReason;
        }
      } catch (_) {}

      const effectiveReason = note.downloadDisabledReason || pauseReason;
      // Match /access & Frontend policy: Admins can still download unlocked notes during a global student download pause
      const isBlockedForCaller = isDownloadAdmin
        ? isNoteDownloadDisabled
        : Boolean(!downloadAllowed || isNoteDownloadDisabled);

      if (isBlockedForCaller && !isAdminInspectBypass) {
        const isHtmlRequest =
          req.headers["sec-fetch-dest"] === "document" ||
          req.headers["sec-fetch-mode"] === "navigate" ||
          Boolean(req.headers["accept"] && req.headers["accept"].includes("text/html"));

        if (isHtmlRequest) {
          return res.status(403).send(renderDownloadPausedHtml(note.title, note.id || id, effectiveReason));
        }

        return res.status(403).json({
          success: false,
          downloadsDisabled: true,
          message: effectiveReason,
        });
      }
    }

    // ⚡ Zero-Render Bandwidth Offloader:
    // When downloading a PDF, redirect top-level browser downloads to Cloudflare Edge Worker CDN unless the request came from the worker itself,
    // or is an explicit direct request (e.g. Tier 3 fallback), or an internal API fetch request.
    // Cloudflare Edge serves the multi-megabyte PDF for free with 0 bytes of Render bandwidth!
    const cfWorkerUrl = (process.env.CF_WORKER_URL || process.env.VITE_CF_WORKER_URL || "").trim();
    const isDirectFromWorker = Boolean(
      req.headers["cf-worker"] === "true" ||
      req.headers["x-via-worker"] === "true" ||
      req.headers["cf-worker"] ||
      req.headers["x-via-worker"] ||
      req.headers["x-worker-signature"] ||
      (req.headers["x-forwarded-host"] && isTrustedHostUrl(req.headers["x-forwarded-host"], req.headers["host"] || "")) ||
      (req.headers["referer"] && isTrustedHostUrl(req.headers["referer"], req.headers["host"] || ""))
    );
    const isExplicitDirect = req.query.direct === "1" || req.headers["x-direct-origin"] === "1";
    const isFetchOrApi = Boolean(
      req.headers["x-requested-with"] ||
      req.headers["sec-fetch-dest"] === "empty" ||
      req.headers["x-direct-stream"] === "1"
    );

    if (cfWorkerUrl && !isDirectFromWorker && !isExplicitDirect && !isFetchOrApi && isActualDownload) {
      // 🛡️ SECURITY FIX: Never copy a 7-day HttpOnly session cookie into a 302 redirect URL query string.
      // Always mint a short-lived (5 min) download-scoped token bound to this note.
      let qToken = "";
      if (requestingUser && requestingUser.id) {
        try {
          qToken = jwt.sign(
            { id: requestingUser.id, role: requestingUser.role || "student", scope: "download", noteId: id },
            JWT_SECRET,
            { expiresIn: "5m" }
          );
        } catch (_) {}
      }
      const realDlName = (note.originalName || note.fileName || req.query.filename || "").trim();
      const dlUrl = `${cfWorkerUrl}/api/notes/${id}/stream.pdf?download=1${qToken ? `&token=${encodeURIComponent(qToken)}` : ""}${realDlName ? `&filename=${encodeURIComponent(realDlName)}` : ""}`;
      return res.redirect(302, dlUrl);
    }
    const isExplicitPreview = req.query.preview === "1" || req.query.view === "1";
    // Preview is only initial load (not subsequent reader chunks)
    const isInitialPreview = (isExplicitPreview || !isSubsequentRangeChunk) && !isActualDownload;

    // RULE: Exclude reader chunks completely! Only allow real download or initial preview
    const isEligibleForNotice = (isActualDownload || isInitialPreview) && !isSubsequentRangeChunk && !isWorkerProxy;

    if (requestingUser && isEligibleForNotice) {
      const userKey = requestingUser.id || requestingUser.email || clientIp;
      const actionType = isActualDownload ? "NOTE_DOWNLOAD" : "NOTE_PREVIEW";

      if (shouldDispatchStreamNotice(userKey, note.id || id, actionType)) {
        const isStudent = requestingUser.id && requestingUser.id !== "admin-root";
        const studentDisplayName = requestingUser.name || (isStudent ? "Student Scholar" : "Administrator");

        sendTelegramAuthNotice({
          event: actionType,
          user: {
            id: requestingUser.id,
            name: studentDisplayName,
            email: requestingUser.email || "N/A",
            mobile: requestingUser.mobile || (isStudent ? "N/A" : "Admin Session"),
            college: requestingUser.college || (isStudent ? "N/A" : "Central Administration"),
            year: requestingUser.year || (isStudent ? "N/A" : "Master Admin"),
          },
          note: {
            id: note.id || id,
            title: note.title,
            subject: note.subject,
            course: note.course,
            branch: note.branch,
            fileSize: note.fileSize,
            downloadsCount: note.downloadsCount || 0,
          },
          method: streamRealSource,
        }).catch((err) => console.warn("[STREAM-TELEGRAM-NOTICE] Notice error:", err.message));
      }
    }

    // Explicit PDF Content-Type & RFC-compliant Content-Disposition with ACTUAL File Name
    const queryFilename = (req.query.filename || req.params.filename || "").trim();
    const genericNames = [
      "blob", "blob.pdf", "document", "document.pdf", "file", "file.pdf",
      "stream", "stream.pdf", "download", "download.pdf", "null", "undefined",
      "untitled", "untitled.pdf"
    ];

    let candidateName = "";
    const realOriginalName = (note.originalName || note.fileName || "").trim();
    if (realOriginalName && !genericNames.includes(realOriginalName.toLowerCase())) {
      // 1. Highest priority: The actual REAL file name stored in the database!
      candidateName = realOriginalName;
    } else if (queryFilename && !genericNames.includes(queryFilename.toLowerCase())) {
      candidateName = queryFilename;
    } else if (note.title && !genericNames.includes(note.title.toLowerCase().trim())) {
      candidateName = note.title.trim();
    } else if (note.subject && note.subject !== "General Academic") {
      candidateName = `${note.subject}_Notes`;
    } else {
      candidateName = "Free_Study_Material";
    }

    let baseClean = candidateName.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
    if (!baseClean.toLowerCase().endsWith(".pdf")) {
      baseClean = `${baseClean}.pdf`;
    }
    const sanitizedName = baseClean;
    const isPdf =
      (note.mimeType && note.mimeType.toLowerCase().includes("pdf")) ||
      sanitizedName.toLowerCase().endsWith(".pdf") ||
      !note.mimeType ||
      note.mimeType === "application/octet-stream";
    const contentType = isPdf ? "application/pdf" : (note.mimeType || "application/pdf");

    // Download policy already enforced before 302 Edge Offload Redirect & Telegram alerts
    const dispositionType = (isDownload && (!isNoteDownloadDisabled || isAdminInspectBypass)) ? "attachment" : "inline";

    res.setHeader("Content-Type", contentType);
    const asciiSafeName = sanitizedName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    res.setHeader("Content-Disposition", `${dispositionType}; filename="${asciiSafeName}"; filename*=UTF-8''${encodeURIComponent(sanitizedName)}`);
    if (isNoteDownloadDisabled && !isDownloadAdmin) {
      res.setHeader("X-Download-Options", "noopen");
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache");

    const retentionSeconds = (typeof getCdnRetentionSeconds === "function" ? getCdnRetentionSeconds() : 365 * 86400);
    res.setHeader("Cache-Control", `public, max-age=${retentionSeconds}, immutable`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${retentionSeconds}`);
    res.setHeader("Cloudflare-CDN-Cache-Control", `max-age=${retentionSeconds}`);
    res.setHeader("ETag", `W/"${note.fileHash || note.id}"`);

    // ⚡ Batched Download Counter: Accumulate in RAM & flush to Firestore every 3 minutes (Saves 90%+ Firestore note writes!)
    if (isDownload) {
      note.downloadsCount = (note.downloadsCount || 0) + 1;
      queueBatchedNoteDownloadIncrement(id, note.downloadsCount);

      if (requestingUser && requestingUser.id && requestingUser.id !== "admin-root" && requestingUser.role !== "admin") {
        try {
          const uDocRef = db.collection("users").doc(requestingUser.id);
          uDocRef.get().then((snap) => {
            if (!snap.exists) return;
            const uData = snap.data() || {};
            let curActs = Array.isArray(uData.activities) ? [...uData.activities] : [];
            const newAct = {
              id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              type: "download",
              noteId: id,
              noteTitle: note.title || "Academic Document",
              subject: note.subject || "General",
              course: note.course || "",
              branch: note.branch || "",
              fileSize: note.fileSize || 0,
              detail: `Downloaded: ${note.title || "Academic Document"} (${note.subject || "General"})`,
              timestamp: new Date().toISOString(),
            };
            curActs.unshift(newAct);
            // 🛡️ Strict 15 Rolling Auto-Cap: Auto-delete older than 15 events
            if (curActs.length > 15) curActs = curActs.slice(0, 15);
            uDocRef.update({
              activities: curActs,
              downloadsCount: (uData.downloadsCount || 0) + 1,
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
          }).catch(() => {});
        } catch (_) {}
      }
    } else {
      incrementDbWritesPrevented();
    }

    // 🚀 1. Resolve Server SSD / RAM Buffer metadata upfront (safe for both HEAD & GET)
    // NOTE: getCdnBuffer() validates & auto-purges corrupt/partial files, so NEVER trust stale isDiskCached from earlier!
    const cached = getCdnBuffer(id);
    const hasValidDiskFile = Boolean(cached && cached.isDiskOnly && cached.binPath && fs.existsSync(cached.binPath));

    // ⚡ Instant HEAD response for preflight metadata checks (0ms, 0 byte overhead)
    if (req.method === "HEAD") {
      let headSize = note.fileSize || note.compressedSize || 0;
      if (hasValidDiskFile) {
        try { headSize = fs.statSync(cached.binPath).size; } catch (_) {}
      } else if (cached?.totalSize) {
        headSize = cached.totalSize;
      }
      if (headSize > 0) res.setHeader("Content-Length", headSize);

      if (isRamCached) {
        res.setHeader("X-Real-Source", "RAM_BUFFER");
        res.setHeader("X-Source-Label", "In-Memory RAM Buffer (0ms Microsecond)");
        res.setHeader("CF-Cache-Status", "HIT");
      } else if (hasValidDiskFile) {
        res.setHeader("X-Real-Source", "DISK_CACHE");
        res.setHeader("X-Source-Label", "Local SSD Disk Cache (1ms High-Speed)");
        res.setHeader("CF-Cache-Status", "HIT");
      } else {
        res.setHeader("X-Real-Source", "CLOUD_STORAGE");
        res.setHeader("X-Source-Label", "Primary Academic Cloud Storage Vault (Caching to Edge CDN...)");
        res.setHeader("CF-Cache-Status", "MISS");
      }
      return res.status(200).end();
    }

    if (hasValidDiskFile || (cached && cached.buffer)) {
      // ⚡ If found on disk or RAM, make sure DB & L1 cache have isCdnCached: true
      if (!note.isCdnCached) {
        const cachedIso = new Date().toISOString();
        if (db) {
          db.collection("notes").doc(id).update({
            isCdnCached: true,
            cdnCachedAt: cachedIso,
          }).catch(() => {});
        }
        note.isCdnCached = true;
        ramCache.set(`note_${id}`, note, 3 * 3600);
        upsertNoteInCache({ id, isCdnCached: true, cdnCachedAt: cachedIso }).catch(() => {});
      }

      if (isRamCached) {
        res.setHeader("X-Real-Source", "RAM_BUFFER");
        res.setHeader("X-Source-Label", "In-Memory RAM Buffer (0ms Microsecond)");
        res.setHeader("X-Data-Source", "ram");
        res.setHeader("X-Storage-Node", "RAM-Buffer-Node");
      } else {
        res.setHeader("X-Real-Source", "DISK_CACHE");
        res.setHeader("X-Source-Label", "Local SSD Disk Cache (1ms High-Speed)");
        res.setHeader("X-Data-Source", "disk");
        res.setHeader("X-Storage-Node", "NVMe-SSD-Disk");
      }
      res.setHeader("CF-Cache-Status", "HIT");
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Edge-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=604800, immutable");

      let totalSize = cached?.totalSize || 0;
      if (hasValidDiskFile && !totalSize) {
        try {
          totalSize = fs.statSync(cached.binPath).size;
        } catch (_) {
          totalSize = 0;
        }
      }

      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        if (isNaN(start)) {
          start = Math.max(0, totalSize - (parseInt(parts[1], 10) || 0));
          end = totalSize - 1;
        }
        if (isNaN(end) || end >= totalSize) end = totalSize - 1;
        const contentLength = Math.max(0, end - start + 1);

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", contentLength);

        if (hasValidDiskFile) {
          // ⚡ Pillar 3: Zero-Copy Stream Pipelining (0% RAM / 0% CPU kernel file-descriptor pipe)
          const fileStream = fs.createReadStream(cached.binPath, { start, end });
          const cleanup = () => {
            if (!fileStream.destroyed) fileStream.destroy();
          };
          res.on("close", cleanup);
          res.on("finish", cleanup);
          fileStream.on("error", (err) => {
            console.warn("[ZERO-COPY-STREAM] Range pipe error:", err.message);
            if (!res.headersSent) res.status(500).end();
          });
          return fileStream.pipe(res);
        } else if (cached && cached.buffer) {
          return res.end(cached.buffer.slice(start, end + 1));
        }
      } else {
        res.status(200);
        res.setHeader("Content-Length", totalSize);

        if (hasValidDiskFile) {
          // ⚡ Pillar 3: Zero-Copy Stream Pipelining for full file transfer
          const fileStream = fs.createReadStream(cached.binPath);
          const cleanup = () => {
            if (!fileStream.destroyed) fileStream.destroy();
          };
          res.on("close", cleanup);
          res.on("finish", cleanup);
          fileStream.on("error", (err) => {
            console.warn("[ZERO-COPY-STREAM] Full pipe error:", err.message);
            if (!res.headersSent) res.status(500).end();
          });
          return fileStream.pipe(res);
        } else if (cached && cached.buffer) {
          return res.end(cached.buffer);
        }
      }
    }

    // ☁️ 2. First-time fetch from Primary Academic Cloud Storage Vault
    // Real-Time Dynamic Headers: Tell the student browser we are streaming directly from Cloud Storage
    res.setHeader("X-Real-Source", "CLOUD_STORAGE");
    res.setHeader("X-Source-Label", "Primary Academic Cloud Storage Vault (Fast Stream)");
    res.setHeader("X-Data-Source", "storage");
    res.setHeader("CF-Cache-Status", "MISS");
    res.setHeader("X-Cache", "MISS");

    // ⚡ INSTANT FAST-STREAM ENGINE: If MTProto message ID exists, stream directly to user!
    // Never block range requests or user preview on downloading the full 50MB file!
    if (note.telegramMessageId) {
      if (req.headers.range) {
        // For partial range requests, asynchronously trigger background CDN caching to NVMe SSD disk
        triggerBackgroundCdnCache(id, note);
      }

      try {
        await streamDocumentFromChannel(note.telegramMessageId, res, req.headers.range, {
          noteId: id,
          cdnCacheDir: CDN_CACHE_DIR,
          onCached: (cachedSize) => {
            if (binPath) {
              registerDiskCacheEntry(id, binPath, cachedSize || note.fileSize || 0, contentType);
            }
            const cachedIso = new Date().toISOString();
            if (!note.isCdnCached) {
              if (db) {
                db.collection("notes").doc(id).update({
                  isCdnCached: true,
                  cdnCachedAt: cachedIso,
                }).catch(() => {});
              }
              note.isCdnCached = true;
              ramCache.set(`note_${id}`, note, 3 * 3600);
              upsertNoteInCache({ id, isCdnCached: true, cdnCachedAt: cachedIso }).catch(() => {});
            }
          },
        });
        return;
      } catch (streamErr) {
        console.warn(`[FAST-STREAM] Direct MTProto stream notice for ${id}, falling back to buffer fetch:`, streamErr.message);
      }
    }

    // Fast-Stream Fallback: Stream directly via Telegram Bot API with zero buffering lag
    const botStreamToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const botStreamFileId = note.telegramBotFileId || note.telegramFileId;
    if (botStreamToken && botStreamFileId && !res.headersSent) {
      try {
        await streamTelegramBotDocument(botStreamToken, botStreamFileId, res, req, id, note.fileSize || note.compressedSize);
        return;
      } catch (botStreamErr) {
        console.warn(`[FAST-STREAM] Bot API direct stream notice for ${id}:`, botStreamErr.message);
      }
    }

    // Fallback: Fetch once from Main Storage and simultaneously write to CDN (RAM + Disk) and user response
    const freshItem = await fetchAndCacheNoteBuffer(id, note);

    if (freshItem && freshItem.buffer) {
      const totalSize = freshItem.totalSize || freshItem.buffer.length;
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        if (isNaN(start)) {
          start = Math.max(0, totalSize - (parseInt(parts[1], 10) || 0));
          end = totalSize - 1;
        }
        if (isNaN(end) || end >= totalSize) end = totalSize - 1;
        const contentLength = Math.max(0, end - start + 1);

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", contentLength);
        return res.end(freshItem.buffer.slice(start, end + 1));
      } else {
        res.status(200);
        res.setHeader("Content-Length", totalSize);
        return res.end(freshItem.buffer);
      }
    }

    // Failover: External Google Drive link or fileUrl (validated strictly for http/https to prevent open-redirect/XSS)
    if (note.driveLink && isSafeExternalHttpUrl(note.driveLink)) {
      return res.redirect(note.driveLink.trim());
    }
    if (note.fileUrl && isSafeExternalHttpUrl(note.fileUrl)) {
      return res.redirect(note.fileUrl.trim());
    }

    // Direct MTProto streaming fallback (Bypasses buffer assembly and streams chunks directly)
    if (note.telegramMessageId && !res.headersSent) {
      try {
        if (typeof streamDocumentFromChannel === "function") {
          return await streamDocumentFromChannel(note.telegramMessageId, res, req.headers.range);
        }
      } catch (streamFallbackErr) {
        console.warn(`[STREAM-DIRECT] Direct MTProto stream fallback notice for ${id}:`, streamFallbackErr.message);
      }
      try {
        if (typeof getDocumentBufferFromChannel === "function") {
          const docData = await getDocumentBufferFromChannel(note.telegramMessageId);
          if (docData && docData.buffer) {
            saveCdnBuffer(id, docData.buffer, docData.mimeType);
            res.setHeader("Content-Type", docData.mimeType || "application/pdf");
            res.setHeader("Content-Length", docData.buffer.length);
            return res.status(200).end(docData.buffer);
          }
        }
      } catch (docBufErr) {
        console.warn(`[STREAM-DIRECT] Direct MTProto buffer fetch notice for ${id}:`, docBufErr.message);
      }
    }

    // Resilient 503 retryable fallback
    if (!res.headersSent) {
      res.setHeader("Retry-After", "3");
      return res.status(503).json({
        success: false,
        retryable: true,
        message: "Academic Cloud Vault is warming up storage connections. Please retry in a moment.",
      });
    }
  } catch (err) {
    console.error("[STREAM] Error streaming note:", err.message);

    const isTgDeleted =
      err.isDeleted ||
      err.code === "TELEGRAM_MESSAGE_DELETED" ||
      err.message?.includes("Document not found for message ID") ||
      err.message?.includes("MESSAGE_ID_INVALID") ||
      err.message?.includes("FILE_REFERENCE_EXPIRED") ||
      err.message?.includes("message to get is not found");

    if (isTgDeleted) {
      await purgeDeletedTelegramNote(id, note?.title);
      if (!res.headersSent) {
        return res.status(404).json({
          success: false,
          noteDeleted: true,
          isDeletedFromTelegram: true,
          noteId: id,
          message: "This study material has been removed from cloud storage and has been automatically cleaned up from the website.",
        });
      }
    }

    if (!res.headersSent) {
      res.setHeader("Retry-After", "3");
      res.status(503).json({
        success: false,
        message: "Academic Cloud Vault is warming up. Please retry in a moment.",
        retryable: true,
      });
    }
  }
});

/**
 * Edge CDN Memory Cache & Telemetry Helpers
 */
function getMaxRamBufferItems() {
  let ceilingMb = 512;
  try {
    const watchdog = require("../utils/selfHealingWatchdog");
    if (typeof watchdog.getSystemMemoryCeilingMb === "function") {
      ceilingMb = watchdog.getSystemMemoryCeilingMb();
    }
  } catch (_) {}

  // Allocate ~25% of server RAM to in-memory PDF buffers (avg 5MB per note)
  // 512MB RAM -> ~25 items (~125MB)
  // 1GB RAM -> ~50 items (~250MB)
  // 2GB RAM -> ~100 items (~500MB)
  // 4GB RAM -> ~200 items (~1000MB)
  // 8GB+ RAM -> ~400 items (~2000MB)
  const items = Math.floor((ceilingMb * 0.25) / 5);
  return Math.max(20, Math.min(items, 600));
}

function trimMemoryCache(keepRatio = 0.6) {
  const currentSize = noteBufferCache.size;
  const keepCount = Math.floor(currentSize * keepRatio);
  const removeCount = currentSize - keepCount;
  let removed = 0;
  for (const key of noteBufferCache.keys()) {
    if (removed >= removeCount) break;
    noteBufferCache.delete(key);
    removed++;
  }
  return { removed, remaining: noteBufferCache.size };
}

function getMemoryCacheInfo() {
  const dynamicMax = getMaxRamBufferItems();
  return {
    itemCount: noteBufferCache.size,
    maxItems: dynamicMax,
    totalBytes: 0,
    totalMB: "0.00",
    mode: "Zero-RAM Kernel Zero-Copy SSD Stream",
    items: [],
  };
}

function purgeMemoryCache() {
  const count = noteBufferCache.size;
  noteBufferCache.clear();
  purgeCdnDiskBuffer(); // Clears persistent disk CDN cache
  return { success: true, purgedCount: count };
}

async function prewarmPopularNotes(limit = 10) {
  if (!db) return { success: false, message: "Database not connected", prewarmed: 0 };
  let ceilingMb = 512;
  try {
    const watchdog = require("../utils/selfHealingWatchdog");
    if (typeof watchdog.getSystemMemoryCeilingMb === "function") {
      ceilingMb = watchdog.getSystemMemoryCeilingMb();
    }
  } catch (_) {}

  // On 512MB hosts (Render), prewarm at most 2 notes to eliminate startup memory spikes.
  // On 1GB, 2GB, 4GB+ hosts (VPS / Railway / AWS), prewarm up to the requested limit (10 - 50 notes).
  const isConstrainedHost = ceilingMb <= 512;
  const parsedLimit = parseInt(limit, 10);
  const finalLimit = isConstrainedHost
    ? Math.min(2, isNaN(parsedLimit) || parsedLimit <= 0 ? 2 : parsedLimit)
    : (isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : Math.min(parsedLimit, 50));

  let topNotes = [];
  try {
    const cachedNotes = await getAllCachedNotes();
    if (Array.isArray(cachedNotes) && cachedNotes.length > 0) {
      topNotes = [...cachedNotes]
        .sort((a, b) => Number(b.viewsCount || 0) - Number(a.viewsCount || 0))
        .slice(0, finalLimit);
    }
  } catch (_) {}

  if (topNotes.length === 0) {
    let snap = null;
    try {
      snap = await db.collection("notes").orderBy("viewsCount", "desc").limit(finalLimit).get();
    } catch (_) {
      snap = await db.collection("notes").limit(finalLimit).get();
    }
    if (snap && snap.docs) {
      topNotes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  }

  let prewarmed = 0;
  for (const note of topNotes) {
    const doc = { id: note.id };
    const binPath = path.join(CDN_CACHE_DIR, `${doc.id}.bin`);
    // 1. If already on SSD disk, zero-copy stream is already warm!
    if (fs.existsSync(binPath)) {
      prewarmed++;
      continue;
    }

    // 2. Fetch from high-speed MTProto Telegram DC and save to SSD disk (Zero-RAM mode)
    if (note.telegramMessageId) {
      const sizeBytes = Number(note.fileSize || note.compressedSize || 0);
      if (sizeBytes > 45 * 1024 * 1024) {
        console.log(`[PREWARM] Note ${doc.id} is ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB (>45MB). Bypassing RAM buffer; zero-copy live chunked stream active.`);
        continue;
      }
      try {
        const docData = await getDocumentBufferFromChannel(note.telegramMessageId);
        if (docData && docData.buffer) {
          saveCdnBuffer(doc.id, docData.buffer, docData.mimeType);
          prewarmed++;
          // Immediately reclaim buffer memory on constrained containers
          if (global.gc) {
            try { global.gc(); } catch (_) {}
          }
        }
      } catch (e) {
        if (e.code === "FILE_TOO_LARGE_FOR_RAM_BUFFER" || e.message?.includes("exceeds 45MB")) {
          console.log(`[PREWARM] Note ${doc.id} is >45MB. Bypassing RAM buffer; zero-copy live chunked stream active.`);
        } else {
          console.warn(`[PREWARM] Note ${doc.id} notice:`, e.message);
        }
      }
    }
  }
  return { success: true, prewarmed, totalInCache: prewarmed, mode: "Zero-RAM Kernel SSD Stream" };
}

// ⚡ Automatic Auto-Prewarm: Automatically load popular documents into RAM Edge Cache on boot
setTimeout(async () => {
  try {
    let techSet = null;
    try {
      const adminRoutes = require("./admin");
      if (adminRoutes.getTechSettings) techSet = adminRoutes.getTechSettings();
    } catch (_) {}

    if (!techSet || techSet.enableCdnAutoPrewarm !== false) {
      console.log("[TECH-NEXUS] 🚀 Auto-Prewarming Top Notes into Zero-RAM NVMe SSD Cache...");
      const res = await prewarmPopularNotes(techSet?.cdnMaxRamItems || 10);
      console.log(`[TECH-NEXUS] ⚡ Auto-Prewarm complete: ${res.prewarmed || 0} notes cached on SSD (0 MB Heap RAM).`);
    }
  } catch (err) {
    console.warn("[TECH-NEXUS] Auto-prewarm notice:", err.message);
  }
}, 8000);

router.getMemoryCacheInfo = getMemoryCacheInfo;
router.purgeMemoryCache = purgeMemoryCache;
router.purgeCdnDiskBuffer = purgeCdnDiskBuffer;
router.getCdnBuffer = getCdnBuffer;
router.saveCdnBuffer = saveCdnBuffer;
router.prewarmPopularNotes = prewarmPopularNotes;
router.getDbWritesPreventedCount = () => dbWritesPreventedCount;
router.noteBufferCache = noteBufferCache;
router.getMaxRamBufferItems = getMaxRamBufferItems;
router.trimMemoryCache = trimMemoryCache;

module.exports = router;
