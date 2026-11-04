/**
 * ============================================================================
 * 🚀 DEDICATED TURSO STUDENT SESSIONS & TELEMETRY SERVICE (NEW TURSO DB)
 * ============================================================================
 * Powers:
 * 1. Active Device Tracking with Device Names (Android, Windows, iOS, Mac, etc.)
 * 2. Single Device Session Termination (Kill 1 specific phone / laptop remotely)
 * 3. All Other Devices Termination (Keep current phone active, revoke rest)
 * 4. Last 10 Security & Login Activity History (Zero Firestore Quota Burn)
 * 5. Automatic Rolling Ring-Buffer (Limits to last 20 logs per student, auto-prunes)
 * 6. Standby Local LibSQL Fallback (cache/turso_student_sessions.db) until user
 *    provides TURSO_STUDENT_DATABASE_URL and TURSO_STUDENT_AUTH_TOKEN.
 * ============================================================================
 */

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const rawUrl = (
  process.env.TURSO_STUDENT_DATABASE_URL ||
  process.env.TURSO_SESSIONS_DATABASE_URL ||
  ""
).trim();

const authToken = (
  process.env.TURSO_STUDENT_AUTH_TOKEN ||
  process.env.TURSO_SESSIONS_AUTH_TOKEN ||
  ""
).trim();

let client = null;
let isCloud = false;

// Fast in-memory set of revoked session IDs for sub-1ms middleware validation
const memoryRevokedSessions = new Set();
// Throttle session last_active updates in memory so we don't query DB on every single HTTP asset
const sessionActiveThrottle = new Map();

function initLocalClient() {
  const cacheDir = path.join(process.cwd(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const dbPath = path.join(cacheDir, "turso_student_sessions.db");
  isCloud = false;
  client = createClient({
    url: `file:${dbPath}`,
  });
  console.log(`[TURSO-STUDENTS] 🟡 Local LibSQL standby mode: ${dbPath}`);
  return client;
}

try {
  if (rawUrl && (rawUrl.startsWith("libsql://") || rawUrl.startsWith("https://")) && authToken) {
    isCloud = true;
    client = createClient({
      url: rawUrl,
      authToken: authToken,
    });
    console.log(`[TURSO-STUDENTS] 🟢 Connected to Dedicated Student Turso Cloud: ${rawUrl}`);
  } else {
    initLocalClient();
  }
} catch (err) {
  console.warn("[TURSO-STUDENTS] Initialization notice:", err.message);
  initLocalClient();
}

/**
 * Helper to parse user-agent into a friendly human device name
 */
function parseUserAgentFriendly(ua = "") {
  if (!ua || typeof ua !== "string") return { deviceName: "Unknown Device", deviceType: "desktop" };

  let os = "Unknown OS";
  let browser = "Browser";
  let deviceType = "desktop";

  // OS detection
  if (/Android/i.test(ua)) {
    os = "Android";
    deviceType = "mobile";
    const match = ua.match(/Android\s([0-9\.]+)/i);
    if (match) os = `Android ${match[1]}`;
  } else if (/iPhone/i.test(ua)) {
    os = "iPhone (iOS)";
    deviceType = "mobile";
  } else if (/iPad/i.test(ua)) {
    os = "iPad (iPadOS)";
    deviceType = "tablet";
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = "Windows 10/11";
  } else if (/Windows/i.test(ua)) {
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  // Browser detection
  if (/Edg\//i.test(ua)) {
    browser = "Microsoft Edge";
  } else if (/Chrome\//i.test(ua)) {
    browser = /Mobile/i.test(ua) ? "Chrome Mobile" : "Google Chrome";
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox";
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = "Safari";
  } else if (/Opera|OPR\//i.test(ua)) {
    browser = "Opera";
  }

  return {
    deviceName: `${browser} on ${os}`,
    deviceType,
  };
}

/**
 * Initialize Tables for Student Sessions & Security Activity
 */
async function initTursoStudentTables() {
  if (!client) return false;
  try {
    // 1. Active User Sessions Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS user_active_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT,
        device_type TEXT DEFAULT 'desktop',
        ip_address TEXT,
        location TEXT,
        user_agent TEXT,
        token_version INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        is_revoked INTEGER DEFAULT 0
      )
    `);

    // Indexes for high-speed sub-millisecond session filtering
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_sess_user_active ON user_active_sessions(user_id, is_revoked)`).catch(() => {});
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_sess_last_active ON user_active_sessions(last_active_at)`).catch(() => {});

    // 2. User Security & Login Activity History
    await client.execute(`
      CREATE TABLE IF NOT EXISTS user_security_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        device_name TEXT,
        device_type TEXT,
        ip_address TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    await client.execute(`CREATE INDEX IF NOT EXISTS idx_sec_user_created ON user_security_logs(user_id, created_at)`).catch(() => {});

    // Preload recent revoked sessions into memory set for 0ms middleware checks
    try {
      const revoked = await client.execute({
        sql: `SELECT session_id FROM user_active_sessions WHERE is_revoked = 1 AND created_at > ?`,
        args: [Date.now() - (7 * 24 * 3600 * 1000)],
      });
      if (revoked && revoked.rows) {
        revoked.rows.forEach(r => memoryRevokedSessions.add(String(r.session_id)));
      }
    } catch (_) {}

    console.log("[TURSO-STUDENTS] ✅ Student Sessions & Activity tables initialized.");
    return true;
  } catch (err) {
    console.warn("[TURSO-STUDENTS] Table initialization notice:", err.message);
    return false;
  }
}

// Auto-initialize tables
initTursoStudentTables();

/**
 * Record a New Active User Session & Log Activity
 */
async function recordActiveSession({ sessionId, userId, req, tokenVersion = 1 }) {
  if (!client || !sessionId || !userId) return null;

  try {
    const ua = req.headers?.["user-agent"] || "";
    const { deviceName, deviceType } = parseUserAgentFriendly(ua);
    const ip = (
      req.headers?.["cf-connecting-ip"] ||
      req.headers?.["x-forwarded-for"]?.split(",")[0] ||
      req.ip ||
      "127.0.0.1"
    ).trim();

    const city = req.headers?.["cf-ipcity"] || "";
    const country = req.headers?.["cf-ipcountry"] || "";
    const location = city && country ? `${city}, ${country}` : (country || "India");

    const now = Date.now();

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO user_active_sessions
        (session_id, user_id, device_name, device_type, ip_address, location, user_agent, token_version, created_at, last_active_at, is_revoked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
      args: [sessionId, String(userId), deviceName, deviceType, ip, location, ua.slice(0, 300), Number(tokenVersion), now, now],
    });

    // Also record Login in user_security_logs
    await logSecurityActivity({
      userId,
      action: "LOGIN",
      deviceName,
      deviceType,
      ipAddress: ip,
      details: `Signed in successfully via ${deviceName} (${location})`,
    });

    return { sessionId, deviceName, deviceType, ip, location };
  } catch (err) {
    console.warn("[TURSO-STUDENTS] recordActiveSession error:", err.message);
    return null;
  }
}

/**
 * Touch Session Last Active (Throttled every 5 minutes in memory)
 */
async function touchSessionActive(sessionId) {
  if (!client || !sessionId) return;
  const now = Date.now();
  const last = sessionActiveThrottle.get(sessionId) || 0;
  if (now - last < 5 * 60 * 1000) return; // Only write every 5 minutes

  sessionActiveThrottle.set(sessionId, now);
  try {
    await client.execute({
      sql: `UPDATE user_active_sessions SET last_active_at = ? WHERE session_id = ?`,
      args: [now, String(sessionId)],
    });
  } catch (_) {}
}

/**
 * Get All Active (Non-revoked) Sessions for a User
 */
async function getUserActiveSessions(userId, currentSessionId = "") {
  if (!client || !userId) return [];
  try {
    // 30 days session expiry cutoff
    const cutoff = Date.now() - (30 * 24 * 3600 * 1000);
    const rs = await client.execute({
      sql: `
        SELECT session_id, device_name, device_type, ip_address, location, created_at, last_active_at
        FROM user_active_sessions
        WHERE user_id = ? AND is_revoked = 0 AND last_active_at > ?
        ORDER BY last_active_at DESC
        LIMIT 25
      `,
      args: [String(userId), cutoff],
    });

    return (rs.rows || []).map((row) => ({
      sessionId: String(row.session_id),
      deviceName: String(row.device_name || "Unknown Device"),
      deviceType: String(row.device_type || "desktop"),
      ipAddress: String(row.ip_address || "Unknown IP"),
      location: String(row.location || "India"),
      createdAt: Number(row.created_at),
      lastActiveAt: Number(row.last_active_at),
      isCurrentDevice: Boolean(currentSessionId && String(row.session_id) === String(currentSessionId)),
    }));
  } catch (err) {
    console.warn("[TURSO-STUDENTS] getUserActiveSessions error:", err.message);
    return [];
  }
}

/**
 * Terminate a Single Specific Session (Remote Logout on 1 device)
 */
async function terminateSingleSession(userId, sessionIdToTerminate, terminatedByDevice = "Current Device") {
  if (!client || !userId || !sessionIdToTerminate) return false;
  try {
    const sId = String(sessionIdToTerminate);
    const uId = String(userId);

    // Get session info for audit log
    const sessionDoc = await client.execute({
      sql: `SELECT device_name, ip_address FROM user_active_sessions WHERE session_id = ? AND user_id = ?`,
      args: [sId, uId],
    });

    const targetDeviceName = sessionDoc?.rows?.[0]?.device_name || "Device";

    // Mark revoked in Turso
    await client.execute({
      sql: `UPDATE user_active_sessions SET is_revoked = 1 WHERE session_id = ? AND user_id = ?`,
      args: [sId, uId],
    });

    // Add to memory set for instant 0ms rejection in middleware
    memoryRevokedSessions.add(sId);

    // Record Security Activity Log
    await logSecurityActivity({
      userId: uId,
      action: "DEVICE_TERMINATED",
      deviceName: targetDeviceName,
      details: `Session on "${targetDeviceName}" was manually terminated from ${terminatedByDevice}`,
    });

    return true;
  } catch (err) {
    console.warn("[TURSO-STUDENTS] terminateSingleSession error:", err.message);
    return false;
  }
}

/**
 * Terminate All Other Sessions (Keep Current Active)
 */
async function terminateAllOtherSessions(userId, currentSessionId = "") {
  if (!client || !userId) return false;
  try {
    const uId = String(userId);
    const curId = String(currentSessionId || "");

    // Fetch session IDs being terminated to add to memory cache
    const targetRows = await client.execute({
      sql: `SELECT session_id FROM user_active_sessions WHERE user_id = ? AND session_id != ? AND is_revoked = 0`,
      args: [uId, curId],
    });

    if (targetRows?.rows) {
      targetRows.rows.forEach(r => memoryRevokedSessions.add(String(r.session_id)));
    }

    // Revoke all other sessions in Turso
    await client.execute({
      sql: `UPDATE user_active_sessions SET is_revoked = 1 WHERE user_id = ? AND session_id != ?`,
      args: [uId, curId],
    });

    // Log Activity
    await logSecurityActivity({
      userId: uId,
      action: "ALL_OTHER_DEVICES_TERMINATED",
      details: `Revoked all other active sessions across phones and PCs`,
    });

    return true;
  } catch (err) {
    console.warn("[TURSO-STUDENTS] terminateAllOtherSessions error:", err.message);
    return false;
  }
}

/**
 * Terminate ALL Sessions for User (Complete Logout Everywhere)
 */
async function terminateAllUserSessions(userId) {
  if (!client || !userId) return false;
  try {
    const uId = String(userId);

    const targetRows = await client.execute({
      sql: `SELECT session_id FROM user_active_sessions WHERE user_id = ? AND is_revoked = 0`,
      args: [uId],
    });

    if (targetRows?.rows) {
      targetRows.rows.forEach(r => memoryRevokedSessions.add(String(r.session_id)));
    }

    await client.execute({
      sql: `UPDATE user_active_sessions SET is_revoked = 1 WHERE user_id = ?`,
      args: [uId],
    });

    await logSecurityActivity({
      userId: uId,
      action: "ALL_DEVICES_LOGGED_OUT",
      details: `All sessions logged out across all devices`,
    });

    return true;
  } catch (err) {
    console.warn("[TURSO-STUDENTS] terminateAllUserSessions error:", err.message);
    return false;
  }
}

/**
 * Synchronous 0ms check for in-memory revoked sessions
 */
function isSessionRevokedSync(sessionId) {
  if (!sessionId) return false;
  return memoryRevokedSessions.has(String(sessionId));
}

/**
 * Check if a session ID is revoked (0ms memory check with DB fallback)
 */
async function isSessionRevoked(sessionId) {
  if (!sessionId) return false;
  const sId = String(sessionId);
  if (memoryRevokedSessions.has(sId)) return true;

  if (!client) return false;
  try {
    const res = await client.execute({
      sql: `SELECT is_revoked FROM user_active_sessions WHERE session_id = ? LIMIT 1`,
      args: [sId],
    });
    if (res?.rows?.length > 0 && Number(res.rows[0].is_revoked) === 1) {
      memoryRevokedSessions.add(sId);
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Log a Security Activity & Prune Beyond Last 20 Records (Ring Buffer)
 */
async function logSecurityActivity({ userId, action, deviceName = "", deviceType = "", ipAddress = "", details = "" }) {
  if (!client || !userId) return;
  try {
    const id = `sec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    await client.execute({
      sql: `
        INSERT INTO user_security_logs
        (id, user_id, action, device_name, device_type, ip_address, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [id, String(userId), String(action), String(deviceName), String(deviceType), String(ipAddress), String(details), now],
    });

    // Automatic Ring-Buffer Prune: Keep only the latest 20 security logs for this student
    await client.execute({
      sql: `
        DELETE FROM user_security_logs
        WHERE user_id = ? AND id NOT IN (
          SELECT id FROM user_security_logs
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 20
        )
      `,
      args: [String(userId), String(userId)],
    }).catch(() => {});
  } catch (err) {
    console.warn("[TURSO-STUDENTS] logSecurityActivity notice:", err.message);
  }
}

/**
 * Get Last 10 Security Updates for a User
 */
async function getUserSecurityLogs(userId, limit = 10) {
  if (!client || !userId) return [];
  try {
    const rs = await client.execute({
      sql: `
        SELECT id, action, device_name, device_type, ip_address, details, created_at
        FROM user_security_logs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args: [String(userId), Number(limit)],
    });

    return (rs.rows || []).map((row) => ({
      id: String(row.id),
      action: String(row.action),
      deviceName: String(row.device_name || "Device"),
      deviceType: String(row.device_type || "desktop"),
      ipAddress: String(row.ip_address || ""),
      details: String(row.details || ""),
      createdAt: Number(row.created_at),
    }));
  } catch (err) {
    console.warn("[TURSO-STUDENTS] getUserSecurityLogs error:", err.message);
    return [];
  }
}

/**
 * Telemetry / Status for Admin Studio
 */
async function getStudentTursoStats() {
  const t0 = Date.now();
  let connected = false;
  let activeSessionsCount = 0;
  let revokedSessionsCount = 0;
  let securityLogsCount = 0;
  let latencyMs = 0;

  if (client) {
    try {
      const [resSessions, resLogs] = await Promise.all([
        client.execute(`SELECT is_revoked, COUNT(*) as cnt FROM user_active_sessions GROUP BY is_revoked`).catch(() => ({ rows: [] })),
        client.execute(`SELECT COUNT(*) as cnt FROM user_security_logs`).catch(() => ({ rows: [{ cnt: 0 }] })),
      ]);

      connected = true;
      latencyMs = Date.now() - t0;

      if (resSessions?.rows) {
        resSessions.rows.forEach((r) => {
          if (Number(r.is_revoked) === 0) activeSessionsCount = Number(r.cnt);
          if (Number(r.is_revoked) === 1) revokedSessionsCount = Number(r.cnt);
        });
      }

      securityLogsCount = Number(resLogs?.rows?.[0]?.cnt || 0);
    } catch (_) {
      connected = false;
    }
  }

  const maskedUrl = isCloud && rawUrl
    ? rawUrl.replace(/(:\/\/[^@]*@)/, "://***@")
    : "local:cache/turso_student_sessions.db";

  return {
    connected,
    isCloud,
    databaseUrl: maskedUrl,
    activeSessionsCount,
    revokedSessionsCount,
    securityLogsCount,
    latencyMs,
  };
}

/**
 * Admin Clean / Prune Function
 */
async function pruneStudentSessions({ days = 7, target = "all" }) {
  if (!client) return { success: false, message: "Turso Student client unavailable" };

  try {
    const cutoff = Date.now() - (Number(days) * 24 * 3600 * 1000);
    let prunedSessions = 0;
    let prunedLogs = 0;

    if (target === "all" || target === "revoked" || target === "sessions") {
      const res = await client.execute({
        sql: `DELETE FROM user_active_sessions WHERE is_revoked = 1 OR last_active_at < ?`,
        args: [cutoff],
      });
      prunedSessions = res.rowsAffected || 0;
    }

    if (target === "all" || target === "logs") {
      const res = await client.execute({
        sql: `DELETE FROM user_security_logs WHERE created_at < ?`,
        args: [cutoff],
      });
      prunedLogs = res.rowsAffected || 0;
    }

    // Refresh memory cache
    memoryRevokedSessions.clear();

    return {
      success: true,
      prunedSessions,
      prunedLogs,
      message: `Cleaned ${prunedSessions} expired sessions and ${prunedLogs} older activity logs (> ${days} days).`,
    };
  } catch (err) {
    return { success: false, message: "Prune error: " + err.message };
  }
}

/**
 * Wipe all revoked sessions (Instant Clean)
 */
async function cleanAllRevokedSessions() {
  if (!client) return { success: false, message: "Turso Student client unavailable" };
  try {
    const res = await client.execute(`DELETE FROM user_active_sessions WHERE is_revoked = 1`);
    memoryRevokedSessions.clear();
    return {
      success: true,
      cleanedRows: res.rowsAffected || 0,
      message: `Cleaned ${res.rowsAffected || 0} revoked session records completely.`,
    };
  } catch (err) {
    return { success: false, message: "Clean error: " + err.message };
  }
}

module.exports = {
  recordActiveSession,
  touchSessionActive,
  getUserActiveSessions,
  terminateSingleSession,
  terminateAllOtherSessions,
  terminateAllUserSessions,
  isSessionRevoked,
  isSessionRevokedSync,
  logSecurityActivity,
  getUserSecurityLogs,
  getStudentTursoStats,
  pruneStudentSessions,
  cleanAllRevokedSessions,
};
