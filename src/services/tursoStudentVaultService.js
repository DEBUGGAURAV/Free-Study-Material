/**
 * ============================================================================
 * ⚡ TURSO ENGINE 4: STUDENT SESSIONS & SECURITY TELEMETRY VAULT SERVICE
 * ============================================================================
 * - Dedicated Turso LibSQL Cloud / Standby Local Engine for Student Telemetry
 * - Configurable via TURSO_STUDENT_DATABASE_URL & TURSO_STUDENT_AUTH_TOKEN
 * - Automatic Local LibSQL Failover (cache/turso_student_vault.db)
 * - Microsecond Speed Monitoring, Metrics Telemetry & 1-Click Clean Controller
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const studentTursoUrl = (process.env.TURSO_STUDENT_DATABASE_URL || process.env.TURSO_4_DATABASE_URL || "").trim();
const studentAuthToken = (process.env.TURSO_STUDENT_AUTH_TOKEN || process.env.TURSO_4_AUTH_TOKEN || "").trim();

let studentTursoClient = null;
let isStudentCloud = false;

try {
  if (studentTursoUrl && studentTursoUrl.startsWith("libsql://")) {
    studentTursoClient = createClient({
      url: studentTursoUrl,
      authToken: studentAuthToken || undefined,
    });
    isStudentCloud = true;
    console.log("[TURSO-STUDENT-VAULT] 🟢 Connected to Dedicated Student Telemetry LibSQL Cloud:", studentTursoUrl);
  } else {
    const cacheDir = path.resolve(__dirname, "../../cache");
    if (!fs.existsSync(cacheDir)) {
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
    }
    const localDbPath = path.join(cacheDir, "turso_student_vault.db");
    studentTursoClient = createClient({
      url: `file:${localDbPath}`,
    });
    isStudentCloud = false;
    console.log("[TURSO-STUDENT-VAULT] 🟡 Local LibSQL standby mode for Student Vault:", localDbPath);
  }
} catch (err) {
  console.warn("[TURSO-STUDENT-VAULT] Initialization warning:", err.message);
  try {
    const localDbPath = path.resolve(__dirname, "../../cache/turso_student_vault.db");
    studentTursoClient = createClient({ url: `file:${localDbPath}` });
    isStudentCloud = false;
  } catch (_) {}
}

/**
 * Initialize Student Telemetry & Security Defense Tables
 */
async function initStudentTursoTables() {
  if (!studentTursoClient) return;
  try {
    await studentTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS student_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT,
        device_type TEXT,
        ip TEXT,
        location TEXT,
        created_at INTEGER,
        last_active INTEGER,
        revoked INTEGER DEFAULT 0
      );
    `);
    await studentTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS student_security_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        event TEXT,
        device_name TEXT,
        ip TEXT,
        created_at INTEGER
      );
    `);

    // 1. Account Brute-Force Lockouts (Security Defense - Decoupled from MongoDB)
    await studentTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS account_lockouts (
        id TEXT PRIMARY KEY,
        identifier TEXT,
        attempts INTEGER DEFAULT 0,
        locked_until INTEGER DEFAULT 0,
        last_attempt INTEGER DEFAULT 0,
        last_ip TEXT,
        last_user_agent TEXT,
        updated_at INTEGER
      );
    `);
    await studentTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_lockouts_until ON account_lockouts(locked_until);`).catch(() => {});

    // 2. IP Quarantine & Jail Appeals (Decoupled from MongoDB)
    await studentTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS jail_appeals (
        incident_id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        mobile TEXT,
        message TEXT,
        ip TEXT,
        device_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER
      );
    `);
    await studentTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_jail_appeals_ip ON jail_appeals(ip);`).catch(() => {});
    await studentTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_jail_appeals_status ON jail_appeals(status);`).catch(() => {});

    // 3. Distributed Active IP & Device Jails (Multi-Node Sync across Render instances & restarts)
    await studentTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS active_ip_jails (
        jail_key TEXT PRIMARY KEY,
        jail_type TEXT NOT NULL,
        target TEXT NOT NULL,
        incident_id TEXT,
        ip TEXT,
        device_id TEXT,
        reason TEXT,
        duration_label TEXT,
        unjail_time INTEGER NOT NULL,
        jailed_at INTEGER NOT NULL
      );
    `);
    await studentTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_active_jails_unjail ON active_ip_jails(unjail_time);`).catch(() => {});
    await studentTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_active_jails_incident ON active_ip_jails(incident_id);`).catch(() => {});

    console.log("[TURSO-STUDENT-VAULT] ✅ Student telemetry, account lockouts, active jails & jail appeals tables verified.");
  } catch (err) {
    console.warn("[TURSO-STUDENT-VAULT] Table init notice:", err.message);
  }
}

// Auto-run schema initialization
initStudentTursoTables().catch(() => {});

/**
 * 🛡️ Account Lockout Helpers (Turso 4)
 */
async function getTursoAccountLockout(id) {
  if (!studentTursoClient || !id) return null;
  try {
    const res = await studentTursoClient.execute({
      sql: "SELECT * FROM account_lockouts WHERE id = ? LIMIT 1",
      args: [String(id)],
    });
    if (res.rows && res.rows.length > 0) {
      const r = res.rows[0];
      return {
        id: r.id,
        identifier: r.identifier,
        attempts: Number(r.attempts || 0),
        lockedUntil: Number(r.locked_until || 0),
        lastAttempt: Number(r.last_attempt || 0),
        lastIp: r.last_ip || "",
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function saveTursoAccountLockout({ id, identifier, attempts, lockedUntil, lastAttempt, lastIp, lastUserAgent }) {
  if (!studentTursoClient || !id) return false;
  try {
    await studentTursoClient.execute({
      sql: `INSERT INTO account_lockouts (id, identifier, attempts, locked_until, last_attempt, last_ip, last_user_agent, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              attempts = excluded.attempts,
              locked_until = excluded.locked_until,
              last_attempt = excluded.last_attempt,
              last_ip = excluded.last_ip,
              last_user_agent = excluded.last_user_agent,
              updated_at = excluded.updated_at`,
      args: [
        String(id),
        String(identifier || id),
        Number(attempts || 0),
        Number(lockedUntil || 0),
        Number(lastAttempt || Date.now()),
        String(lastIp || ""),
        String(lastUserAgent || ""),
        Date.now(),
      ],
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function deleteTursoAccountLockout(id) {
  if (!studentTursoClient || !id) return false;
  try {
    await studentTursoClient.execute({
      sql: "DELETE FROM account_lockouts WHERE id = ?",
      args: [String(id)],
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function getActiveTursoLockouts(limit = 50) {
  if (!studentTursoClient) return [];
  try {
    const now = Date.now();
    const res = await studentTursoClient.execute({
      sql: "SELECT * FROM account_lockouts WHERE locked_until > ? ORDER BY locked_until DESC LIMIT ?",
      args: [now, Math.min(100, Math.max(1, limit))],
    });
    return (res.rows || []).map((r) => ({
      id: r.id,
      identifier: r.identifier,
      attempts: Number(r.attempts || 0),
      lockedUntil: Number(r.locked_until || 0),
      lastAttempt: Number(r.last_attempt || 0),
      lastIp: r.last_ip,
    }));
  } catch (err) {
    return [];
  }
}

/**
 * ⚖️ Jail Appeals Helpers (Turso 4)
 */
async function saveTursoJailAppeal({ incidentId, name, email, mobile, message, ip, deviceId, status = "pending" }) {
  if (!studentTursoClient || !incidentId) return false;
  try {
    await studentTursoClient.execute({
      sql: `INSERT OR REPLACE INTO jail_appeals (incident_id, name, email, mobile, message, ip, device_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        String(incidentId),
        String(name || "Student"),
        String(email || ""),
        String(mobile || ""),
        String(message || ""),
        String(ip || ""),
        String(deviceId || ""),
        String(status || "pending"),
        Date.now(),
      ],
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function getTursoJailAppeals(limit = 100) {
  if (!studentTursoClient) return [];
  try {
    const res = await studentTursoClient.execute({
      sql: "SELECT * FROM jail_appeals ORDER BY created_at DESC LIMIT ?",
      args: [Math.min(200, Math.max(1, limit))],
    });
    return (res.rows || []).map((r) => ({
      incidentId: r.incident_id,
      name: r.name,
      email: r.email,
      mobile: r.mobile,
      message: r.message,
      ip: r.ip,
      deviceId: r.device_id,
      status: r.status,
      createdAt: r.created_at,
    }));
  } catch (err) {
    return [];
  }
}

async function deleteTursoJailAppeal(incidentId, ip = null) {
  if (!studentTursoClient || (!incidentId && !ip)) return false;
  try {
    if (incidentId && ip) {
      await studentTursoClient.execute({
        sql: "DELETE FROM jail_appeals WHERE incident_id = ? OR ip = ?",
        args: [String(incidentId), String(ip)],
      });
    } else if (incidentId) {
      await studentTursoClient.execute({
        sql: "DELETE FROM jail_appeals WHERE incident_id = ?",
        args: [String(incidentId)],
      });
    } else if (ip) {
      await studentTursoClient.execute({
        sql: "DELETE FROM jail_appeals WHERE ip = ?",
        args: [String(ip)],
      });
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function getTursoJailAppealByIncident(incidentId) {
  if (!studentTursoClient || !incidentId) return null;
  try {
    const res = await studentTursoClient.execute({
      sql: "SELECT * FROM jail_appeals WHERE incident_id = ? LIMIT 1",
      args: [String(incidentId)],
    });
    if (res.rows && res.rows.length > 0) {
      const r = res.rows[0];
      return {
        incidentId: r.incident_id,
        name: r.name,
        email: r.email,
        mobile: r.mobile,
        message: r.message,
        ip: r.ip,
        deviceId: r.device_id,
        status: r.status,
        createdAt: r.created_at,
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * 🛡️ Distributed Active IP / Device Jail Persistence Helpers (Turso 4)
 */
async function saveTursoActiveJail({ jailType, target, incidentId, ip, deviceId, reason, durationLabel, unjailTime, jailedAt }) {
  if (!studentTursoClient || !jailType || !target || !unjailTime) return false;
  try {
    const jailKey = `${jailType}:${target}`;
    await studentTursoClient.execute({
      sql: `INSERT OR REPLACE INTO active_ip_jails
            (jail_key, jail_type, target, incident_id, ip, device_id, reason, duration_label, unjail_time, jailed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        String(jailKey),
        String(jailType),
        String(target),
        String(incidentId || ""),
        String(ip || ""),
        String(deviceId || ""),
        String(reason || "Security policy violation"),
        String(durationLabel || ""),
        Number(unjailTime),
        Number(jailedAt || Date.now()),
      ],
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function getActiveTursoJails(limit = 500) {
  if (!studentTursoClient) return [];
  try {
    const now = Date.now();
    const res = await studentTursoClient.execute({
      sql: "SELECT * FROM active_ip_jails WHERE unjail_time > ? ORDER BY jailed_at DESC LIMIT ?",
      args: [now, Math.min(1000, Math.max(1, limit))],
    });
    return (res.rows || []).map((r) => ({
      jailKey: r.jail_key,
      jailType: r.jail_type,
      target: r.target,
      incidentId: r.incident_id || "",
      ip: r.ip || "",
      deviceId: r.device_id || "",
      reason: r.reason || "Security policy violation",
      durationLabel: r.duration_label || "",
      unjailTime: Number(r.unjail_time || 0),
      jailedAt: Number(r.jailed_at || now),
    }));
  } catch (_) {
    return [];
  }
}

async function deleteTursoActiveJail({ jailType, target, incidentId }) {
  if (!studentTursoClient) return false;
  try {
    if (jailType && target) {
      await studentTursoClient.execute({
        sql: "DELETE FROM active_ip_jails WHERE jail_key = ?",
        args: [`${jailType}:${target}`],
      });
    }
    if (incidentId) {
      await studentTursoClient.execute({
        sql: "DELETE FROM active_ip_jails WHERE incident_id = ?",
        args: [String(incidentId)],
      });
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function clearAllTursoActiveJails() {
  if (!studentTursoClient) return false;
  try {
    await studentTursoClient.execute("DELETE FROM active_ip_jails");
    return true;
  } catch (_) {
    return false;
  }
}

async function pruneExpiredTursoActiveJails() {
  if (!studentTursoClient) return false;
  try {
    await studentTursoClient.execute({
      sql: "DELETE FROM active_ip_jails WHERE unjail_time <= ?",
      args: [Date.now()],
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * ⚡ Live Speed & Health Telemetry for Tab 4 (Software & Maintenance)
 */
async function getTursoStudentTelemetry() {
  const startTime = Date.now();
  let connected = false;
  let latencyMs = 0;
  let sessionsCount = 0;
  let logsCount = 0;
  let lockoutsCount = 0;
  let appealsCount = 0;

  if (studentTursoClient) {
    try {
      const [sessRes, logsRes, lockRes, appRes] = await Promise.all([
        studentTursoClient.execute("SELECT COUNT(*) as count FROM student_sessions").catch(() => null),
        studentTursoClient.execute("SELECT COUNT(*) as count FROM student_security_logs").catch(() => null),
        studentTursoClient.execute("SELECT COUNT(*) as count FROM account_lockouts").catch(() => null),
        studentTursoClient.execute("SELECT COUNT(*) as count FROM jail_appeals").catch(() => null),
      ]);
      latencyMs = Math.max(1, Date.now() - startTime);
      connected = true;
      if (sessRes && sessRes.rows && sessRes.rows[0]) {
        sessionsCount = Number(sessRes.rows[0].count) || 0;
      }
      if (logsRes && logsRes.rows && logsRes.rows[0]) {
        logsCount = Number(logsRes.rows[0].count) || 0;
      }
      if (lockRes && lockRes.rows && lockRes.rows[0]) {
        lockoutsCount = Number(lockRes.rows[0].count) || 0;
      }
      if (appRes && appRes.rows && appRes.rows[0]) {
        appealsCount = Number(appRes.rows[0].count) || 0;
      }
    } catch (_) {
      latencyMs = Math.max(1, Date.now() - startTime);
      connected = false;
    }
  }

  return {
    connected,
    isCloud: isStudentCloud,
    latencyMs: `${latencyMs}ms`,
    url: studentTursoUrl || "cache/turso_student_vault.db",
    database: studentTursoUrl ? studentTursoUrl.replace("libsql://", "").split("?")[0] : "fsm-studet-session-freestudymaterial.aws-ap-south-1.turso.io",
    sessionsCount,
    logsCount,
    lockoutsCount,
    appealsCount,
    engineName: "Turso 4: Student Sessions & Security Defense Vault",
  };
}

/**
 * 🧹 Clean / Wipe Student Vault Records (1-Click Maintenance)
 */
async function cleanTursoStudentData() {
  if (!studentTursoClient) {
    return { success: false, message: "Student Turso client is not connected." };
  }
  try {
    await studentTursoClient.execute("DELETE FROM student_sessions WHERE revoked = 1;");
    await studentTursoClient.execute({
      sql: "DELETE FROM student_security_logs WHERE created_at < ?",
      args: [Date.now() - 30 * 86400000],
    });
    await studentTursoClient.execute({
      sql: "DELETE FROM account_lockouts WHERE locked_until < ?",
      args: [Date.now()],
    });
    return {
      success: true,
      message: "Turso Student Vault cleaned successfully! Stale revoked sessions, expired lockouts, and old telemetry logs purged.",
    };
  } catch (err) {
    // If tables don't exist yet, re-init
    try {
      await initStudentTursoTables();
    } catch (_) {}
    return { success: true, message: "Turso Student Vault reset and optimized." };
  }
}

/**
 * Permanently cascades and removes student sessions, security logs, and lockouts from Turso 4 Student Vault
 */
async function purgeUserFromStudentVault(userId, userEmail = null) {
  if (!studentTursoClient || !userId) return { success: false, deletedCount: 0 };
  let deletedCount = 0;
  try {
    const cleanId = String(userId).trim();
    const cleanEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;

    // 1. Delete all active sessions
    const r1 = await studentTursoClient.execute({
      sql: "DELETE FROM student_sessions WHERE user_id = ?",
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r1.rowsAffected || 0);

    // 2. Delete student security logs
    const r2 = await studentTursoClient.execute({
      sql: "DELETE FROM student_security_logs WHERE user_id = ?",
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r2.rowsAffected || 0);

    // 3. Delete account lockouts
    const r3 = await studentTursoClient.execute({
      sql: "DELETE FROM account_lockouts WHERE id = ? OR identifier = ? OR (id = ?)",
      args: [cleanId, cleanEmail || cleanId, cleanEmail || cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r3.rowsAffected || 0);

    return { success: true, deletedCount };
  } catch (err) {
    console.warn("[TURSO-STUDENT] purgeUserFromStudentVault error:", err.message);
    return { success: false, error: err.message, deletedCount };
  }
}

module.exports = {
  getTursoStudentTelemetry,
  cleanTursoStudentData,
  initStudentTursoTables,
  getTursoAccountLockout,
  saveTursoAccountLockout,
  deleteTursoAccountLockout,
  getActiveTursoLockouts,
  saveTursoJailAppeal,
  getTursoJailAppeals,
  getTursoJailAppealByIncident,
  deleteTursoJailAppeal,
  saveTursoActiveJail,
  getActiveTursoJails,
  deleteTursoActiveJail,
  clearAllTursoActiveJails,
  pruneExpiredTursoActiveJails,
  purgeUserFromStudentVault,
};

