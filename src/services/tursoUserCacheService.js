/**
 * ============================================================================
 * 🚀 DEDICATED TURSO USERS METADATA CACHE SERVICE
 * ============================================================================
 * Consolidates User Metadata Caching into the Dedicated Turso Cache Database:
 * - TURSO_CACHE_DATABASE_URL: libsql://fsm-cache-freestudymaterial.aws-ap-south-1.turso.io
 * - Standby Local LibSQL / SQLite fallback: cache/turso_users_cache.db
 *
 * Caching Layers:
 * - L1: In-Memory Node.js RAM Cache (0ms instant response)
 * - L2: Edge Turso LibSQL Cache on AWS Mumbai (sub-5ms cold-start / restart recovery)
 * - L3: Primary Document DB (MongoDB Atlas)
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
let userCacheHits = 0;
let userCacheMisses = 0;

function initLocalUserCacheClient() {
  const cacheDir = path.join(process.cwd(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const dbPath = path.join(cacheDir, "turso_users_cache.db");
  isCloud = false;
  client = createClient({
    url: `file:${dbPath}`,
  });
  console.log(`[TURSO-USERS-CACHE] 🟡 Standby Local LibSQL SQLite cache initialized: ${dbPath}`);
  return client;
}

try {
  if (cacheDbUrl && (cacheDbUrl.startsWith("libsql://") || cacheDbUrl.startsWith("https://")) && cacheDbAuthToken) {
    isCloud = true;
    client = createClient({
      url: cacheDbUrl,
      authToken: cacheDbAuthToken,
    });
    console.log(`[TURSO-USERS-CACHE] 🟢 Connected to Dedicated Turso Cache Cloud: ${cacheDbUrl}`);
  } else {
    initLocalUserCacheClient();
  }
} catch (err) {
  console.warn("[TURSO-USERS-CACHE] Initialization notice:", err.message);
  initLocalUserCacheClient();
}

/**
 * Initialize Users Cache Table in the Dedicated Turso Cache Database
 */
async function initTursoUsersCacheTables() {
  if (!client) initLocalUserCacheClient();
  try {
    if (isCloud) {
      try {
        await client.execute("SELECT 1;");
      } catch (connErr) {
        console.warn("[TURSO-USERS-CACHE] Cloud connection notice (" + connErr.message + "). Activating local LibSQL SQLite.");
        initLocalUserCacheClient();
      }
    }

    await client.execute(`
      CREATE TABLE IF NOT EXISTS users_cache (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        role TEXT DEFAULT 'student',
        mobile TEXT,
        college TEXT,
        branch TEXT,
        year TEXT,
        avatar TEXT,
        authProvider TEXT DEFAULT 'email',
        passwordHash TEXT,
        dataJson TEXT,
        updatedAt INTEGER NOT NULL
      )
    `);

    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_users_cache_email ON users_cache(email)
    `);

    console.log("[TURSO-USERS-CACHE] ⚡ High-speed Users Cache tables ready.");
    return true;
  } catch (err) {
    console.warn("[TURSO-USERS-CACHE] Table init warning:", err.message);
    if (isCloud) {
      initLocalUserCacheClient();
    }
    return false;
  }
}

// Auto-initialize on import
initTursoUsersCacheTables().catch(() => {});

/**
 * Cache user metadata in Turso
 */
async function cacheUserInTurso(user) {
  if (!client || !user || !user.email) return false;
  try {
    const id = String(user.id || user._id || "").trim();
    if (!id) return false;
    const email = String(user.email).trim().toLowerCase();
    const name = String(user.name || "Student").trim();
    const role = user.role || "student";
    const mobile = user.mobile || "";
    const college = user.college || "";
    const branch = user.branch || "";
    const year = user.year || "1st Year";
    const avatar = user.avatar || user.picture || user.photoUrl || "";
    const authProvider = user.authProvider || "email";
    const passwordHash = user.passwordHash || user.password || "";
    const dataJson = JSON.stringify(user);
    const now = Date.now();

    await client.execute({
      sql: `INSERT OR REPLACE INTO users_cache (id, email, name, role, mobile, college, branch, year, avatar, authProvider, passwordHash, dataJson, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, email, name, role, mobile, college, branch, year, avatar, authProvider, passwordHash, dataJson, now],
    });
    return true;
  } catch (err) {
    console.warn("[TURSO-USERS-CACHE] cacheUserInTurso warning:", err.message);
    return false;
  }
}

/**
 * Retrieve cached user metadata by email
 */
async function getCachedUserByEmailFromTurso(email) {
  if (!client || !email) return null;
  try {
    const cleanEmail = String(email).trim().toLowerCase();
    const res = await client.execute({
      sql: `SELECT * FROM users_cache WHERE LOWER(email) = ? LIMIT 1`,
      args: [cleanEmail],
    });
    if (res.rows && res.rows.length > 0) {
      userCacheHits++;
      const row = res.rows[0];
      let full = {};
      try {
        if (row.dataJson) full = JSON.parse(row.dataJson);
      } catch (_) {}
      return {
        ...row,
        ...full,
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
      };
    }
    userCacheMisses++;
    return null;
  } catch (err) {
    userCacheMisses++;
    return null;
  }
}

/**
 * Retrieve cached user metadata by id
 */
async function getCachedUserByIdFromTurso(userId) {
  if (!client || !userId) return null;
  try {
    const cleanId = String(userId).trim();
    const res = await client.execute({
      sql: `SELECT * FROM users_cache WHERE id = ? LIMIT 1`,
      args: [cleanId],
    });
    if (res.rows && res.rows.length > 0) {
      userCacheHits++;
      const row = res.rows[0];
      let full = {};
      try {
        if (row.dataJson) full = JSON.parse(row.dataJson);
      } catch (_) {}
      return {
        ...row,
        ...full,
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
      };
    }
    userCacheMisses++;
    return null;
  } catch (err) {
    userCacheMisses++;
    return null;
  }
}

/**
 * Invalidate user cache entry
 */
async function invalidateUserCacheInTurso(idOrEmail) {
  if (!client || !idOrEmail) return false;
  try {
    const key = String(idOrEmail).trim().toLowerCase();
    await client.execute({
      sql: `DELETE FROM users_cache WHERE id = ? OR LOWER(email) = ?`,
      args: [key, key],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Warm / Sync users metadata cache from MongoDB Atlas
 */
async function syncAllUsersToTursoCache(dbInstance = null) {
  const database = dbInstance || db;
  if (!database || !client) return 0;
  try {
    const snap = await database.collection("users").get();
    if (!snap || snap.size === 0) return 0;

    let count = 0;
    const statements = [];
    const now = Date.now();

    snap.forEach((doc) => {
      const u = doc.data() || {};
      const id = doc.id;
      const email = String(u.email || "").trim().toLowerCase();
      if (!email) return;

      const name = String(u.name || "Student").trim();
      const role = u.role || "student";
      const mobile = u.mobile || "";
      const college = u.college || "";
      const branch = u.branch || "";
      const year = u.year || "1st Year";
      const avatar = u.avatar || u.picture || u.photoUrl || "";
      const authProvider = u.authProvider || "email";
      const passwordHash = u.passwordHash || u.password || "";
      const dataJson = JSON.stringify({ ...u, id });

      statements.push({
        sql: `INSERT OR REPLACE INTO users_cache (id, email, name, role, mobile, college, branch, year, avatar, authProvider, passwordHash, dataJson, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, email, name, role, mobile, college, branch, year, avatar, authProvider, passwordHash, dataJson, now],
      });
      count++;
    });

    if (statements.length > 0) {
      // Chunk statements in batches of 50 for Turso batch API
      for (let i = 0; i < statements.length; i += 50) {
        const batch = statements.slice(i, i + 50);
        await client.batch(batch, "write");
      }
      console.log(`[TURSO-USERS-CACHE] 🚀 Cached ${count} users into Turso Cache Cloud.`);
    }
    return count;
  } catch (err) {
    console.warn("[TURSO-USERS-CACHE] syncAllUsersToTursoCache warning:", err.message);
    return 0;
  }
}

/**
 * Returns telemetry statistics for users metadata cache
 */
async function getTursoUserCacheStats() {
  let rowCount = 0;
  if (client) {
    try {
      const res = await client.execute("SELECT count(*) as c FROM users_cache;");
      rowCount = res.rows?.[0]?.c || 0;
    } catch (_) {}
  }
  return {
    cachedUsers: rowCount,
    isCloud,
    cacheHits: userCacheHits,
    cacheMisses: userCacheMisses,
    databaseUrl: cacheDbUrl ? cacheDbUrl.replace(/\/\/[^@]*@/, "//***@") : "Local SQLite",
  };
}

module.exports = {
  initTursoUsersCacheTables,
  cacheUserInTurso,
  getCachedUserByEmailFromTurso,
  getCachedUserByIdFromTurso,
  invalidateUserCacheInTurso,
  syncAllUsersToTursoCache,
  getTursoUserCacheStats,
};
