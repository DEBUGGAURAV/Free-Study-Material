/**
 * ============================================================================
 * ⭕ DEDICATED TURSO CIRCLE-TO-SEARCH & AI CACHE SERVICE
 * ============================================================================
 * Solves the AI Quota & System Load Problem:
 * - 0% Server CPU: Text extracted on student's browser (Text-Layer / Tesseract WASM)
 * - 0ms AI Latency on repeated questions: Cached in Turso & in-memory RAM
 * - 1,500/day Gemini quota is preserved: If 100 students search the same question,
 *   Gemini API is called ONLY ONCE; 99 students get sub-5ms cached answers!
 *
 * Configurable via dedicated environment variables:
 * - TURSO_CIRCLE_SEARCH_URL / TURSO_AI_CACHE_URL (New Turso Database)
 * - TURSO_CIRCLE_SEARCH_AUTH_TOKEN / TURSO_AI_CACHE_AUTH_TOKEN
 * - Automatic standby fallback to local LibSQL (cache/turso_circle_search.db)
 * ============================================================================
 */

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const cacheDbUrl = (process.env.TURSO_CIRCLE_SEARCH_URL || process.env.TURSO_AI_CACHE_URL || "").trim();
const cacheDbAuthToken = (process.env.TURSO_CIRCLE_SEARCH_AUTH_TOKEN || process.env.TURSO_AI_CACHE_AUTH_TOKEN || "").trim();

let client = null;
let isCloud = false;
const ramCircleCache = new Map(); // In-Memory L1 Cache (0ms)
let totalHits = 0;
let totalMisses = 0;

function initLocalCircleDb() {
  try {
    const cacheDir = path.join(process.cwd(), "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const dbPath = path.join(cacheDir, "turso_circle_search.db");
    isCloud = false;
    client = createClient({
      url: `file:${dbPath}`,
    });
    console.log(`[TURSO-CIRCLE-SEARCH] 🟡 Standby Local LibSQL initialized: ${dbPath}`);
    ensureTable();
  } catch (err) {
    console.warn("[TURSO-CIRCLE-SEARCH] Local DB init warning:", err.message);
  }
}

try {
  if (cacheDbUrl && (cacheDbUrl.startsWith("libsql://") || cacheDbUrl.startsWith("https://")) && cacheDbAuthToken) {
    isCloud = true;
    client = createClient({
      url: cacheDbUrl,
      authToken: cacheDbAuthToken,
    });
    console.log(`[TURSO-CIRCLE-SEARCH] 🟢 Connected to Dedicated Cloud Turso: ${cacheDbUrl}`);
    ensureTable();
  } else {
    initLocalCircleDb();
  }
} catch (err) {
  console.warn("[TURSO-CIRCLE-SEARCH] Client setup warning:", err.message);
  initLocalCircleDb();
}

async function ensureTable() {
  if (!client) return;
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS circle_search_cache (
        query_hash TEXT PRIMARY KEY,
        query_text TEXT,
        answer TEXT,
        provider TEXT,
        model TEXT,
        created_at INTEGER,
        hits INTEGER DEFAULT 1
      );
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_circle_created_at ON circle_search_cache(created_at);
    `);
  } catch (e) {
    console.warn("[TURSO-CIRCLE-SEARCH] Table schema ensure notice:", e.message);
  }
}

/**
 * Computes deterministic SHA-256 hash from normalized query text
 */
function computeQueryHash(queryText = "") {
  const normalized = String(queryText || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Retrieves cached AI solution by query hash
 * Checks: L1 RAM -> L2 Turso (Cloud / Local)
 */
async function getCachedCircleSolution(queryHash) {
  if (!queryHash) return null;

  // 1. Check L1 In-Memory RAM (0ms)
  const inMemory = ramCircleCache.get(queryHash);
  if (inMemory) {
    inMemory.hits = (inMemory.hits || 1) + 1;
    totalHits++;
    return { ...inMemory, source: "ram-cache" };
  }

  // 2. Check L2 Turso Database
  if (client) {
    try {
      const res = await client.execute({
        sql: `SELECT * FROM circle_search_cache WHERE query_hash = ? LIMIT 1`,
        args: [queryHash],
      });

      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        const newHits = (Number(row.hits) || 1) + 1;

        // Async increment hits in Turso
        client.execute({
          sql: `UPDATE circle_search_cache SET hits = ? WHERE query_hash = ?`,
          args: [newHits, queryHash],
        }).catch(() => {});

        const item = {
          queryHash: row.query_hash,
          queryText: row.query_text,
          answer: row.answer,
          provider: row.provider,
          model: row.model,
          createdAt: Number(row.created_at),
          hits: newHits,
        };

        // Cache in L1 RAM (Max 1,000 entries)
        if (ramCircleCache.size > 1000) {
          const firstKey = ramCircleCache.keys().next().value;
          ramCircleCache.delete(firstKey);
        }
        ramCircleCache.set(queryHash, item);

        totalHits++;
        return { ...item, source: isCloud ? "turso-cloud" : "turso-local" };
      }
    } catch (err) {
      console.warn("[TURSO-CIRCLE-SEARCH] Cache query error:", err.message);
    }
  }

  totalMisses++;
  return null;
}

/**
 * Persists newly generated AI solution to Turso and L1 RAM
 */
async function saveCircleSolution(queryHash, queryText, answer, provider = "gemini", model = "gemini-2.0-flash") {
  if (!queryHash || !answer) return;

  const now = Date.now();
  const entry = {
    queryHash,
    queryText: (queryText || "").slice(0, 1000),
    answer,
    provider,
    model,
    createdAt: now,
    hits: 1,
  };

  // 1. Store in L1 RAM
  ramCircleCache.set(queryHash, entry);

  // 2. Store in Turso
  if (client) {
    try {
      await client.execute({
        sql: `
          INSERT INTO circle_search_cache (query_hash, query_text, answer, provider, model, created_at, hits)
          VALUES (?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(query_hash) DO UPDATE SET
            answer = excluded.answer,
            provider = excluded.provider,
            model = excluded.model,
            hits = circle_search_cache.hits + 1
        `,
        args: [queryHash, entry.queryText, answer, provider, model, now],
      });
    } catch (err) {
      console.warn("[TURSO-CIRCLE-SEARCH] Save cache error:", err.message);
    }
  }
}

/**
 * Returns telemetry data for Admin dashboard
 */
async function getCircleSearchTelemetry() {
  let count = 0;
  if (client) {
    try {
      const res = await client.execute("SELECT COUNT(*) as count FROM circle_search_cache");
      if (res.rows && res.rows[0]) {
        count = Number(res.rows[0].count) || 0;
      }
    } catch (_) {}
  }

  return {
    isCloud,
    databaseUrl: cacheDbUrl || "cache/turso_circle_search.db",
    totalCachedQueries: count,
    ramCachedEntries: ramCircleCache.size,
    totalHits,
    totalMisses,
    hitRatio: totalHits + totalMisses > 0 ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(1) + "%" : "0.0%",
    status: client ? "ONLINE & OPERATIONAL" : "STANDBY",
  };
}

module.exports = {
  computeQueryHash,
  getCachedCircleSolution,
  saveCircleSolution,
  getCircleSearchTelemetry,
};

