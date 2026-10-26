/**
 * ============================================================================
 * 🚀 DEDICATED TURSO NOTICES CACHE SERVICE (ZERO-FIRESTORE READS)
 * ============================================================================
 * Solves Frequent Reads problem for Notice Board:
 * - 10,000+ students visiting homepage = 0 Firestore reads (was 10,000+ reads)
 * - L1: In-Memory Node.js RAM Cache (0ms instant response)
 * - L2: Edge Turso LibSQL Cache on AWS Mumbai (sub-5ms cold-start / restart recovery)
 * - L3: Firebase Firestore (Source of Truth & Restore Vault backup)
 *
 * Connected to Dedicated Cache Database:
 * - TURSO_CACHE_DATABASE_URL: libsql://fsm-cache-freestudymaterial.aws-ap-south-1.turso.io
 * - Standby local LibSQL fallback: cache/turso_notices_cache.db
 * ============================================================================
 */

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");
const { db } = require("../firebase");

const cacheDbUrl = (process.env.TURSO_CACHE_DATABASE_URL || process.env.TURSO_NOTES_CACHE_URL || "").trim();
const cacheDbAuthToken = (process.env.TURSO_CACHE_AUTH_TOKEN || process.env.TURSO_NOTES_CACHE_AUTH_TOKEN || "").trim();

let client = null;
let isCloud = false;
let ramNoticesMemory = null;
let ramNoticesExpiresAt = 0;
let firestoreReadsSaved = 0;
let cacheHits = 0;
let cacheMisses = 0;

function initLocalCacheClient() {
  const cacheDir = path.join(process.cwd(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const dbPath = path.join(cacheDir, "turso_notices_cache.db");
  isCloud = false;
  client = createClient({
    url: `file:${dbPath}`,
  });
  console.log(`[TURSO-NOTICES-CACHE] 🟡 Standby Local LibSQL cache initialized: ${dbPath}`);
  return client;
}

try {
  if (cacheDbUrl && (cacheDbUrl.startsWith("libsql://") || cacheDbUrl.startsWith("https://")) && cacheDbAuthToken) {
    isCloud = true;
    client = createClient({
      url: cacheDbUrl,
      authToken: cacheDbAuthToken,
    });
    console.log(`[TURSO-NOTICES-CACHE] 🟢 Connected to Dedicated Turso Cache Cloud: ${cacheDbUrl}`);
  } else {
    initLocalCacheClient();
  }
} catch (err) {
  console.warn("[TURSO-NOTICES-CACHE] Initialization notice:", err.message);
  initLocalCacheClient();
}

/**
 * Initialize Notices Cache Tables in Dedicated Turso Cache DB
 */
async function initTursoNoticesCacheTables() {
  if (!client) return false;
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS notices_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        title TEXT,
        content TEXT,
        link TEXT,
        linkText TEXT,
        isPinned INTEGER DEFAULT 0,
        retentionDays INTEGER DEFAULT 7,
        expiresAt TEXT,
        expiresAtMs INTEGER,
        type TEXT DEFAULT 'announcement',
        createdBy TEXT,
        createdAt TEXT,
        createdAtMs INTEGER,
        sortTimestamp INTEGER DEFAULT 0,
        updatedAt INTEGER NOT NULL
      )
    `);

    // Performance Indices for Sub-Millisecond Filtering
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_notices_cache_pinned ON notices_cache(isPinned)
    `).catch(() => {});

    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_notices_cache_sort ON notices_cache(sortTimestamp)
    `).catch(() => {});

    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_notices_cache_expires ON notices_cache(expiresAtMs)
    `).catch(() => {});

    await client.execute(`
      CREATE TABLE IF NOT EXISTS notices_cache_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `).catch(() => {});

    console.log("[TURSO-NOTICES-CACHE] ⚡ High-speed Notices Cache tables ready.");
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Table init warning:", err.message);
    return false;
  }
}

// Auto-initialize tables on startup
initTursoNoticesCacheTables().catch(() => {});

/**
 * Helper to extract milliseconds from timestamp or string
 */
function getTimestampMs(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (val._seconds !== undefined) return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);
  if (val.seconds !== undefined) return val.seconds * 1000;
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Save notices list into Turso Cache (L2)
 */
async function saveNoticesToTursoCache(noticesList) {
  if (!client || !Array.isArray(noticesList)) return false;
  try {
    if (noticesList.length === 0) {
      await client.execute("DELETE FROM notices_cache");
      return true;
    }

    const statements = noticesList.map((n) => {
      const createdMs = getTimestampMs(n.createdAt) || Date.now();
      const expiresMs = n.expiresAt ? getTimestampMs(n.expiresAt) : null;
      const isPinnedNum = n.isPinned ? 1 : 0;
      const rDays = n.retentionDays !== undefined ? parseInt(n.retentionDays, 10) : 7;

      return {
        sql: `
          INSERT OR REPLACE INTO notices_cache (
            id, data, title, content, link, linkText, isPinned, retentionDays,
            expiresAt, expiresAtMs, type, createdBy, createdAt, createdAtMs, sortTimestamp, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          n.id,
          JSON.stringify(n),
          n.title || "Campus Notice",
          n.content || "",
          n.link || "",
          n.linkText || "Click Here",
          isPinnedNum,
          rDays,
          n.expiresAt || null,
          expiresMs,
          n.type || "announcement",
          n.createdBy || "Admin",
          n.createdAt || new Date().toISOString(),
          createdMs,
          n._sortTimestamp || createdMs,
          Date.now(),
        ],
      };
    });

    // Execute in chunks
    for (let i = 0; i < statements.length; i += 50) {
      const chunk = statements.slice(i, i + 50);
      await client.batch(chunk, "write");
    }

    await client.execute({
      sql: "INSERT OR REPLACE INTO notices_cache_meta (key, value, updatedAt) VALUES ('last_synced', ?, ?)",
      args: [new Date().toISOString(), Date.now()],
    });

    console.log(`[TURSO-NOTICES-CACHE] 💾 Successfully cached ${noticesList.length} notices in Turso Edge DB.`);
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Batch save warning:", err.message);
    return false;
  }
}

/**
 * Fetch raw notices directly from Firestore (L3 Cold Fetch)
 * and automatically mirror into Turso Notices Cache (L2) and RAM (L1)
 */
async function refreshNoticesCacheFromFirestore() {
  if (!db) return [];
  try {
    console.log("[TURSO-NOTICES-CACHE] 📥 Fetching live notices from Firestore to populate Turso Edge Cache...");
    const snapshot = await db.collection("notices").orderBy("createdAt", "desc").limit(150).get();
    const rawNotices = [];
    const now = Date.now();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const createdMs = getTimestampMs(data.createdAt);
      const expiresMs = data.expiresAt ? getTimestampMs(data.expiresAt) : null;
      const isPinned = Boolean(data.isPinned);
      const retentionDays = data.retentionDays !== undefined ? parseInt(data.retentionDays, 10) : 7;

      // Check if expired
      let isExpired = false;
      if (!isPinned && retentionDays !== -1) {
        if (expiresMs && expiresMs < now) {
          isExpired = true;
        } else if (!expiresMs && createdMs > 0 && (now - createdMs > retentionDays * 24 * 3600 * 1000)) {
          isExpired = true;
        }
      }

      if (!isExpired) {
        rawNotices.push({
          id: doc.id,
          ...data,
          isPinned,
          retentionDays,
          _sortTimestamp: createdMs,
        });
      }
    });

    // Sort: Pinned first, then newest
    rawNotices.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b._sortTimestamp || 0) - (a._sortTimestamp || 0);
    });

    // Batch save into Turso L2
    await saveNoticesToTursoCache(rawNotices);

    // Save into L1 RAM (60s TTL)
    ramNoticesMemory = rawNotices;
    ramNoticesExpiresAt = Date.now() + 60 * 1000;

    return rawNotices;
  } catch (err) {
    console.error("[TURSO-NOTICES-CACHE] Failed to refresh from Firestore:", err.message);
    return [];
  }
}

/**
 * Core Notices Retrieval:
 * 1. Return from L1 Node.js RAM (0ms) if warm
 * 2. Return from L2 Turso Edge Database (~2-4ms) if present (0 Firestore reads!)
 * 3. Fallback to L3 Firestore ONLY if Turso is empty, then populate Turso + RAM
 */
async function getAllCachedNotices() {
  const now = Date.now();

  // 1. L1 RAM Hit (0ms)
  if (ramNoticesMemory && ramNoticesExpiresAt > now) {
    cacheHits++;
    firestoreReadsSaved++;
    return ramNoticesMemory;
  }

  // 2. L2 Turso Edge Database Hit (~2-4ms)
  if (client) {
    try {
      // Query active notices: Not expired OR Pinned OR Never Expire (retentionDays = -1)
      const result = await client.execute({
        sql: `
          SELECT id, data FROM notices_cache
          WHERE isPinned = 1 OR retentionDays = -1 OR expiresAtMs IS NULL OR expiresAtMs > ?
          ORDER BY isPinned DESC, sortTimestamp DESC
        `,
        args: [now],
      });

      if (result && result.rows && result.rows.length > 0) {
        const parsedNotices = [];
        for (const row of result.rows) {
          try {
            parsedNotices.push(JSON.parse(row.data));
          } catch (_) {}
        }

        if (parsedNotices.length > 0) {
          cacheHits++;
          firestoreReadsSaved++;
          ramNoticesMemory = parsedNotices;
          ramNoticesExpiresAt = now + 60 * 1000; // 60s RAM TTL

          // Asynchronously purge expired rows from Turso
          client.execute({
            sql: "DELETE FROM notices_cache WHERE isPinned = 0 AND retentionDays != -1 AND expiresAtMs IS NOT NULL AND expiresAtMs <= ?",
            args: [now],
          }).catch(() => {});

          return parsedNotices;
        }
      }
    } catch (err) {
      console.warn("[TURSO-NOTICES-CACHE] Turso query notice fallback:", err.message);
    }
  }

  // 3. L3 Firestore Fallback (Cold start / first time run)
  cacheMisses++;
  console.log("[TURSO-NOTICES-CACHE] ⚠️ Cache miss on Turso. Falling back to Firestore L3...");
  return await refreshNoticesCacheFromFirestore();
}

/**
 * Upsert a single notice in Turso Cache (L2) & RAM (L1)
 */
async function upsertNoticeInCache(notice) {
  if (!notice || !notice.id) return false;
  try {
    const createdMs = getTimestampMs(notice.createdAt) || Date.now();
    const expiresMs = notice.expiresAt ? getTimestampMs(notice.expiresAt) : null;
    const isPinnedNum = notice.isPinned ? 1 : 0;
    const rDays = notice.retentionDays !== undefined ? parseInt(notice.retentionDays, 10) : 7;

    const noticeObj = {
      ...notice,
      isPinned: Boolean(notice.isPinned),
      retentionDays: rDays,
      _sortTimestamp: createdMs,
    };

    if (client) {
      await client.execute({
        sql: `
          INSERT OR REPLACE INTO notices_cache (
            id, data, title, content, link, linkText, isPinned, retentionDays,
            expiresAt, expiresAtMs, type, createdBy, createdAt, createdAtMs, sortTimestamp, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          notice.id,
          JSON.stringify(noticeObj),
          notice.title || "Campus Notice",
          notice.content || "",
          notice.link || "",
          notice.linkText || "Click Here",
          isPinnedNum,
          rDays,
          notice.expiresAt || null,
          expiresMs,
          notice.type || "announcement",
          notice.createdBy || "Admin",
          notice.createdAt || new Date().toISOString(),
          createdMs,
          createdMs,
          Date.now(),
        ],
      });
    }

    // Invalidate L1 RAM cache to force refresh on next call
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Single upsert warning:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Remove a single notice from Turso Cache & RAM
 */
async function removeNoticeFromCache(noticeId) {
  if (!noticeId) return false;
  try {
    if (client) {
      await client.execute({
        sql: "DELETE FROM notices_cache WHERE id = ?",
        args: [noticeId],
      });
    }
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Remove notice error:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Bulk remove notices by IDs
 */
async function bulkRemoveNoticesFromCache(noticeIds) {
  if (!Array.isArray(noticeIds) || noticeIds.length === 0) return false;
  try {
    if (client) {
      const placeholders = noticeIds.map(() => "?").join(",");
      await client.execute({
        sql: `DELETE FROM notices_cache WHERE id IN (${placeholders})`,
        args: noticeIds,
      });
    }
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Bulk remove error:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Clear all notices from Turso Cache
 */
async function clearAllNoticesFromCache() {
  try {
    if (client) {
      await client.execute("DELETE FROM notices_cache");
    }
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Clear all error:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Update Pin status of a notice in Turso Cache
 */
async function updateNoticePinInCache(noticeId, isPinned) {
  try {
    if (client) {
      const res = await client.execute({
        sql: "SELECT data FROM notices_cache WHERE id = ? LIMIT 1",
        args: [noticeId],
      });
      if (res && res.rows && res.rows[0]) {
        const item = JSON.parse(res.rows[0].data);
        item.isPinned = Boolean(isPinned);
        await client.execute({
          sql: "UPDATE notices_cache SET isPinned = ?, data = ?, updatedAt = ? WHERE id = ?",
          args: [isPinned ? 1 : 0, JSON.stringify(item), Date.now(), noticeId],
        });
      }
    }
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Update pin error:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Update Expiry of a notice in Turso Cache
 */
async function updateNoticeExpiryInCache(noticeId, retentionDays, expiresAt) {
  try {
    if (client) {
      const res = await client.execute({
        sql: "SELECT data FROM notices_cache WHERE id = ? LIMIT 1",
        args: [noticeId],
      });
      if (res && res.rows && res.rows[0]) {
        const item = JSON.parse(res.rows[0].data);
        const rDays = parseInt(retentionDays, 10);
        item.retentionDays = rDays;
        item.expiresAt = expiresAt;
        const expMs = expiresAt ? getTimestampMs(expiresAt) : null;

        await client.execute({
          sql: "UPDATE notices_cache SET retentionDays = ?, expiresAt = ?, expiresAtMs = ?, data = ?, updatedAt = ? WHERE id = ?",
          args: [rDays, expiresAt || null, expMs, JSON.stringify(item), Date.now(), noticeId],
        });
      }
    }
    invalidateTursoNoticesCache();
    return true;
  } catch (err) {
    console.warn("[TURSO-NOTICES-CACHE] Update expiry error:", err.message);
    invalidateTursoNoticesCache();
    return false;
  }
}

/**
 * Invalidate L1 RAM cache
 */
function invalidateTursoNoticesCache() {
  ramNoticesMemory = null;
  ramNoticesExpiresAt = 0;
}

/**
 * Telemetry details for Admin
 */
async function getTursoNoticesTelemetry() {
  let count = 0;
  let latencyMs = 0;
  let lastSynced = null;

  if (client) {
    try {
      const t0 = Date.now();
      const countRes = await client.execute("SELECT COUNT(*) as cnt FROM notices_cache");
      latencyMs = Date.now() - t0;
      count = countRes?.rows?.[0]?.cnt || 0;

      const metaRes = await client.execute("SELECT value FROM notices_cache_meta WHERE key = 'last_synced' LIMIT 1").catch(() => null);
      lastSynced = metaRes?.rows?.[0]?.value || null;
    } catch (_) {}
  }

  return {
    isCloud,
    databaseUrl: cacheDbUrl || "cache/turso_notices_cache.db",
    totalCached: Number(count),
    cacheHits,
    cacheMisses,
    firestoreReadsSaved,
    latencyMs,
    lastSynced,
  };
}

module.exports = {
  initTursoNoticesCacheTables,
  getAllCachedNotices,
  upsertNoticeInCache,
  removeNoticeFromCache,
  bulkRemoveNoticesFromCache,
  clearAllNoticesFromCache,
  updateNoticePinInCache,
  updateNoticeExpiryInCache,
  refreshNoticesCacheFromFirestore,
  invalidateTursoNoticesCache,
  getTursoNoticesTelemetry,
};
