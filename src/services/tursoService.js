/**
 * ============================================================================
 * 🚀 TURSO (LIBSQL / EDGE SQLITE) SERVICE FOR RENDER
 * ============================================================================
 * - 9 GB Lifetime Free Cloud Storage
 * - Sub-5ms Instant Response Latency on Render
 * - Zero Sleep & Zero Expiry (unlike Render PostgreSQL which deletes in 30 days)
 * - Automatic Local SQLite Fallback if cloud keys are not yet provided
 * ============================================================================
 */

const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

const rawUrl = (process.env.TURSO_DATABASE_URL || "").trim();
const authToken = (process.env.TURSO_AUTH_TOKEN || "").trim();

let isCloud = false;
let client = null;

function initLocalClient() {
  const cacheDir = path.join(process.cwd(), "cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const dbPath = path.join(cacheDir, "turso_vault.db");
  isCloud = false;
  client = createClient({
    url: `file:${dbPath}`,
  });
  console.log(`[TURSO] 🟡 Local LibSQL standby mode: ${dbPath}`);
  return client;
}

try {
  if (rawUrl && (rawUrl.startsWith("libsql://") || rawUrl.startsWith("https://")) && authToken) {
    isCloud = true;
    client = createClient({
      url: rawUrl,
      authToken: authToken,
    });
    console.log(`[TURSO] 🟢 Connected to Turso Edge Cloud: ${rawUrl}`);
  } else {
    initLocalClient();
  }
} catch (err) {
  console.warn("[TURSO] Initialization warning:", err.message);
  initLocalClient();
}

/**
 * Initialize all core relational tables (Idempotent)
 */
async function initTursoTables() {
  if (!client) return false;
  try {
    const t0 = Date.now();

    // 1. Users Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        role TEXT DEFAULT 'student',
        mobile TEXT,
        college TEXT,
        isVerified INTEGER DEFAULT 0,
        branch TEXT,
        year TEXT,
        avatar TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);
    // Safe column migrations
    await client.execute(`ALTER TABLE users ADD COLUMN college TEXT`).catch(() => {});

    // 2. Academic Notes Vault Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        subject TEXT,
        branch TEXT,
        year TEXT,
        semester TEXT,
        fileSize INTEGER DEFAULT 0,
        fileHash TEXT,
        originalName TEXT,
        driveLink TEXT,
        telegramDocumentId TEXT,
        telegramMessageId INTEGER,
        telegramOriginChatId TEXT,
        telegramTopicId INTEGER,
        downloadUrl TEXT,
        views INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        isCdnCached INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      )
    `);

    // 3. Notices & Broadcasts
    await client.execute(`
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        type TEXT DEFAULT 'announcement',
        priority TEXT DEFAULT 'normal',
        createdAt TEXT
      )
    `);

    // 4. Community Chat Rooms & Pods
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        isPrivate INTEGER DEFAULT 0,
        secretCode TEXT,
        createdBy TEXT,
        membersCount INTEGER DEFAULT 0,
        createdAt TEXT
      )
    `);

    // 5. Community Chat Messages
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        roomId TEXT,
        senderId TEXT,
        senderName TEXT,
        senderRole TEXT,
        senderBranch TEXT,
        senderYear TEXT,
        text TEXT,
        type TEXT DEFAULT 'text',
        fileUrl TEXT,
        fileName TEXT,
        fileSize INTEGER,
        isDeleted INTEGER DEFAULT 0,
        createdAt TEXT
      )
    `);

    // 6. Global Key-Value Settings
    await client.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      )
    `);

    // 7. Forensic Audit Vault for Private Study Pods
    await client.execute(`
      CREATE TABLE IF NOT EXISTS private_room_audits (
        roomId TEXT PRIMARY KEY,
        name TEXT,
        secretCode TEXT,
        createdBy TEXT,
        creatorName TEXT,
        createdAt TEXT,
        closedAt TEXT,
        durationMins INTEGER,
        participantsCount INTEGER DEFAULT 0,
        participantsJson TEXT,
        messagesCount INTEGER DEFAULT 0,
        deletedMessagesCount INTEGER DEFAULT 0,
        attachmentsCount INTEGER DEFAULT 0,
        attachmentsJson TEXT,
        transcriptText TEXT,
        telegramSent INTEGER DEFAULT 0,
        createdAtTimestamp INTEGER
      )
    `);

    // 8. Chat User Profiles (Custom Chat Handles, Uploaded DPs, and Historical DPs)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chat_user_profiles (
        userId TEXT PRIMARY KEY,
        chatUsername TEXT UNIQUE,
        avatarUrl TEXT,
        role TEXT DEFAULT 'student',
        isBlocked INTEGER DEFAULT 0,
        updatedAt TEXT,
        avatarHistory TEXT
      )
    `);

    // 🚀 High-Speed Indexes: Eliminates Full-Table Scans for Sub-Millisecond Queries
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).catch(() => {});
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_notes_branch ON notes(branch)`).catch(() => {});
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject)`).catch(() => {});
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(createdAt)`).catch(() => {});
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(roomId, createdAt)`).catch(() => {});

    const latency = Date.now() - t0;
    console.log(`[TURSO] ✅ Database schema verified in ${latency}ms (Cloud: ${isCloud ? "YES" : "LOCAL"})`);
    return true;
  } catch (err) {
    if (isCloud && (err.message.includes("401") || err.message.includes("UNAUTHORIZED") || err.message.includes("SERVER_ERROR"))) {
      console.warn(`[TURSO] Cloud auth rejected (${err.message}). Auto-switching to Local LibSQL standby database...`);
      initLocalClient();
      return initTursoTables();
    }
    console.error("[TURSO] Schema initialization error:", err.message);
    return false;
  }
}

/**
 * Get comprehensive health & statistics of Turso Database
 */
async function getTursoStatus() {
  if (!client) {
    return {
      connected: false,
      isCloud: false,
      url: rawUrl || "Not Configured",
      error: "Client not initialized",
    };
  }

  try {
    const t0 = Date.now();
    await client.execute("SELECT 1 AS ping");
    const latencyMs = Date.now() - t0;

    const [uCount, nCount, mCount, rCount, pCount, aCount, notifCount] = await Promise.all([
      client.execute("SELECT COUNT(*) AS c FROM users").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM notes").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM chat_messages").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM chat_rooms").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM chat_user_profiles").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM private_room_audits").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM notices").catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    let diskSizeBytes = null;
    if (!isCloud) {
      try {
        const dbPath = path.join(process.cwd(), "cache", "turso_vault.db");
        if (fs.existsSync(dbPath)) {
          diskSizeBytes = fs.statSync(dbPath).size;
        }
      } catch (_) {}
    }

    return {
      connected: true,
      isCloud,
      url: isCloud && rawUrl ? rawUrl.replace(/(:\/\/[^@]*@)/, "://***@") : "local:cache/turso_vault.db",
      latencyMs,
      storageTier: isCloud ? "9 GB Lifetime Free Tier (Turso LibSQL Cloud)" : "Local LibSQL Standby Engine (Persistent)",
      diskSizeBytes,
      counts: {
        users: Number(uCount.rows[0]?.c || 0),
        notes: Number(nCount.rows[0]?.c || 0),
        chatMessages: Number(mCount.rows[0]?.c || 0),
        chatRooms: Number(rCount.rows[0]?.c || 0),
        chatProfiles: Number(pCount.rows[0]?.c || 0),
        privateRoomAudits: Number(aCount.rows[0]?.c || 0),
        notices: Number(notifCount.rows[0]?.c || 0),
      },
    };
  } catch (err) {
    if (isCloud && (err.message.includes("401") || err.message.includes("UNAUTHORIZED") || err.message.includes("SERVER_ERROR"))) {
      console.warn(`[TURSO] Cloud auth rejected (${err.message}). Auto-switching to Local LibSQL standby database...`);
      initLocalClient();
      await initTursoTables().catch(() => {});
      return getTursoStatus();
    }
    return {
      connected: false,
      isCloud,
      url: rawUrl || "Error",
      error: err.message,
    };
  }
}

/**
 * Upsert a single note into Turso
 */
async function upsertNoteToTurso(note) {
  if (!client || !note || !note.id) return false;
  try {
    await client.execute({
      sql: `
        INSERT INTO notes (
          id, title, subject, branch, year, semester, fileSize, fileHash,
          originalName, driveLink, telegramDocumentId, telegramMessageId,
          telegramOriginChatId, telegramTopicId, downloadUrl, views, downloads, likes,
          isCdnCached, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          subject = excluded.subject,
          branch = excluded.branch,
          year = excluded.year,
          fileSize = excluded.fileSize,
          driveLink = excluded.driveLink,
          telegramDocumentId = excluded.telegramDocumentId,
          telegramMessageId = excluded.telegramMessageId,
          isCdnCached = excluded.isCdnCached,
          updatedAt = excluded.updatedAt
      `,
      args: [
        String(note.id),
        String(note.title || "Untitled"),
        String(note.subject || "General"),
        String(note.branch || "CSE"),
        String(note.year || "All"),
        String(note.semester || ""),
        Number(note.fileSize || 0),
        String(note.fileHash || ""),
        String(note.originalName || ""),
        String(note.driveLink || ""),
        String(note.telegramDocumentId || ""),
        Number(note.telegramMessageId || 0),
        String(note.telegramOriginChatId || ""),
        Number(note.telegramTopicId || 0),
        String(note.downloadUrl || ""),
        Number(note.views || 0),
        Number(note.downloads || 0),
        Number(note.likes || 0),
        note.isCdnCached ? 1 : 0,
        String(note.createdAt || new Date().toISOString()),
        new Date().toISOString(),
      ],
    });
    return true;
  } catch (err) {
    console.warn(`[TURSO] Upsert note error (${note.id}):`, err.message);
    return false;
  }
}

/**
 * 1-Click Sync: Replicate all Firestore data into Turso
 */
async function syncFromFirestore(dbInstance) {
  if (!dbInstance) return { success: false, message: "Firestore db not connected." };
  if (!client) return { success: false, message: "Turso client not initialized." };

  try {
    let syncedNotes = 0;
    let syncedUsers = 0;

    // 1. Sync Notes
    const notesSnap = await dbInstance.collection("notes").get();
    for (const doc of notesSnap.docs) {
      const data = { id: doc.id, ...doc.data() };
      const ok = await upsertNoteToTurso(data);
      if (ok) syncedNotes++;
    }

    // 2. Sync Users
    const usersSnap = await dbInstance.collection("users").get();
    for (const doc of usersSnap.docs) {
      const u = { id: doc.id, ...doc.data() };
      try {
        await client.execute({
          sql: `
            INSERT INTO users (id, email, name, role, mobile, college, isVerified, branch, year, avatar, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              name = excluded.name,
              role = excluded.role,
              mobile = excluded.mobile,
              college = excluded.college,
              updatedAt = excluded.updatedAt
          `,
          args: [
            String(u.id),
            String(u.email || ""),
            String(u.name || "Student"),
            String(u.role || "student"),
            String(u.mobile || ""),
            String(u.college || ""),
            u.isVerified ? 1 : 0,
            String(u.branch || ""),
            String(u.year || ""),
            String(u.avatar || ""),
            String(u.createdAt || new Date().toISOString()),
            new Date().toISOString(),
          ],
        });
        syncedUsers++;
      } catch (_) {}
    }

    return {
      success: true,
      syncedNotes,
      syncedUsers,
      totalNotesInSource: notesSnap.size,
      totalUsersInSource: usersSnap.size,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * 🔒 Save Full Forensic Audit Record for Private Study Pod
 */
async function savePrivateRoomAudit(auditData) {
  if (!client || !auditData) return false;
  try {
    await client.execute({
      sql: `
        INSERT OR REPLACE INTO private_room_audits (
          roomId, name, secretCode, createdBy, creatorName, createdAt, closedAt,
          durationMins, participantsCount, participantsJson, messagesCount,
          deletedMessagesCount, attachmentsCount, attachmentsJson, transcriptText,
          telegramSent, createdAtTimestamp
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `,
      args: [
        String(auditData.roomId || ""),
        String(auditData.name || "Private Room"),
        String(auditData.secretCode || ""),
        String(auditData.createdBy || ""),
        String(auditData.creatorName || ""),
        String(auditData.createdAt || new Date().toISOString()),
        String(auditData.closedAt || new Date().toISOString()),
        Number(auditData.durationMins || 0),
        Number(auditData.participantsCount || 0),
        typeof auditData.participantsJson === "string" ? auditData.participantsJson : JSON.stringify(auditData.participants || []),
        Number(auditData.messagesCount || 0),
        Number(auditData.deletedMessagesCount || 0),
        Number(auditData.attachmentsCount || 0),
        typeof auditData.attachmentsJson === "string" ? auditData.attachmentsJson : JSON.stringify(auditData.attachments || []),
        String(auditData.transcriptText || ""),
        auditData.telegramSent ? 1 : 0,
        Date.now(),
      ],
    });
    console.log(`[TURSO-AUDIT] 🔒 Private room audit saved permanently for room "${auditData.name}" (${auditData.roomId})`);
    return true;
  } catch (err) {
    console.error("[TURSO-AUDIT] Failed to save private room audit:", err.message);
    return false;
  }
}

/**
 * Record a single chat message to Turso for redundant cloud persistence
 */
async function recordChatMessageToTurso(msg) {
  if (!client || !msg || !msg.id) return false;
  try {
    await client.execute({
      sql: `
        INSERT OR REPLACE INTO chat_messages (
          id, roomId, senderId, senderName, senderRole, senderBranch, senderYear,
          text, type, fileUrl, fileName, fileSize, isDeleted, createdAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )
      `,
      args: [
        String(msg.id),
        String(msg.roomId || "public"),
        String(msg.sender?.id || msg.senderId || ""),
        String(msg.sender?.name || msg.senderName || "Student"),
        String(msg.sender?.role || msg.senderRole || "student"),
        String(msg.sender?.branch || msg.senderBranch || ""),
        String(msg.sender?.year || msg.senderYear || ""),
        String(msg.text || ""),
        String(msg.type || "text"),
        String(msg.fileUrl || ""),
        String(msg.fileName || ""),
        Number(msg.fileSize || 0),
        msg.isDeleted ? 1 : 0,
        String(msg.createdAt || new Date().toISOString()),
      ],
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Remove active room and active chat messages from Turso
 */
async function deleteRoomFromTurso(roomId) {
  if (!client || !roomId) return false;
  try {
    await client.execute({
      sql: `DELETE FROM chat_rooms WHERE id = ?`,
      args: [String(roomId)],
    });
    await client.execute({
      sql: `DELETE FROM chat_messages WHERE roomId = ?`,
      args: [String(roomId)],
    });
    console.log(`[TURSO] 🗑️ Cleaned active room ${roomId} from chat_rooms & chat_messages tables.`);
    return true;
  } catch (err) {
    console.warn("[TURSO] Clean room warning:", err.message);
    return false;
  }
}

/**
 * Retrieve saved private room audits
 */
async function getPrivateRoomAudits(limit = 50) {
  if (!client) return [];
  try {
    const res = await client.execute({
      sql: `SELECT * FROM private_room_audits ORDER BY createdAtTimestamp DESC LIMIT ?`,
      args: [Number(limit)],
    });
    return res.rows.map((row) => ({
      ...row,
      participants: row.participantsJson ? JSON.parse(row.participantsJson) : [],
      attachments: row.attachmentsJson ? JSON.parse(row.attachmentsJson) : [],
    }));
  } catch (err) {
    console.error("[TURSO] Get audits error:", err.message);
    return [];
  }
}

/**
 * Prune chat messages older than specified days
 */
async function pruneChatMessagesOlderThan(days = 7) {
  if (!client) return { success: false, deletedCount: 0 };
  try {
    const cutoffIso = new Date(Date.now() - Number(days) * 86400000).toISOString();
    const res = await client.execute({
      sql: `DELETE FROM chat_messages WHERE createdAt < ?`,
      args: [cutoffIso],
    });
    const deletedCount = res.rowsAffected || 0;
    console.log(`[TURSO-PRUNER] 🧹 Pruned ${deletedCount} chat messages older than ${days} days (< ${cutoffIso})`);
    return { success: true, deletedCount, cutoffIso };
  } catch (err) {
    console.warn("[TURSO-PRUNER] Error during message pruning:", err.message);
    return { success: false, deletedCount: 0, error: err.message };
  }
}

/**
 * Prune private room forensic audits older than specified days
 * (days <= 0 wipes all audits completely)
 */
async function prunePrivateRoomAuditsOlderThan(days = 30) {
  if (!client) return { success: false, deletedCount: 0 };
  try {
    const numDays = Number(days);
    let res;
    if (isNaN(numDays) || numDays <= 0) {
      res = await client.execute({
        sql: `DELETE FROM private_room_audits`,
      });
    } else {
      const cutoffMs = Date.now() - numDays * 86400000;
      const cutoffIso = new Date(cutoffMs).toISOString();
      res = await client.execute({
        sql: `DELETE FROM private_room_audits WHERE createdAtTimestamp < ? OR closedAt < ?`,
        args: [cutoffMs, cutoffIso],
      });
    }
    const deletedCount = res.rowsAffected || 0;
    console.log(`[TURSO-AUDIT-PRUNER] 🧹 Pruned ${deletedCount} private room audits (retention days: ${numDays})`);
    return { success: true, deletedCount };
  } catch (err) {
    console.warn("[TURSO-AUDIT-PRUNER] Error during audit pruning:", err.message);
    return { success: false, deletedCount: 0, error: err.message };
  }
}

/**
 * Delete a single private room audit by its roomId
 */
async function deleteSinglePrivateRoomAudit(roomId) {
  if (!client || !roomId) return { success: false, deletedCount: 0 };
  try {
    const res = await client.execute({
      sql: `DELETE FROM private_room_audits WHERE roomId = ?`,
      args: [String(roomId)],
    });
    const deletedCount = res.rowsAffected || 0;
    console.log(`[TURSO-AUDIT-PRUNER] 🗑️ Deleted single audit for room "${roomId}" (deleted: ${deletedCount})`);
    return { success: true, deletedCount };
  } catch (err) {
    console.warn(`[TURSO-AUDIT-PRUNER] Error deleting audit for room "${roomId}":`, err.message);
    return { success: false, deletedCount: 0, error: err.message };
  }
}

/**
 * Get comprehensive Turso chat telemetry metrics
 */
async function getTursoChatTelemetry() {
  if (!client) {
    return {
      connected: false,
      isCloud: false,
      latencyMs: 0,
      chatMessagesCount: 0,
      auditsCount: 0,
      roomsCount: 0,
      storageTier: "9 GB Lifetime Free Tier (Turso LibSQL)",
      error: "Client not initialized",
    };
  }
  try {
    const t0 = Date.now();
    await client.execute("SELECT 1 AS ping");
    const latencyMs = Date.now() - t0;

    const [mRes, aRes, rRes] = await Promise.all([
      client.execute("SELECT COUNT(*) AS c FROM chat_messages").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM private_room_audits").catch(() => ({ rows: [{ c: 0 }] })),
      client.execute("SELECT COUNT(*) AS c FROM chat_rooms").catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    return {
      connected: true,
      isCloud,
      latencyMs,
      chatMessagesCount: Number(mRes.rows[0]?.c || 0),
      auditsCount: Number(aRes.rows[0]?.c || 0),
      roomsCount: Number(rRes.rows[0]?.c || 0),
      storageTier: "9 GB Lifetime Free Tier (Turso LibSQL)",
      url: rawUrl ? rawUrl.replace(/(:\/\/[^@]*@)/, "://***@") : "local:cache/turso_vault.db",
    };
  } catch (err) {
    return {
      connected: false,
      isCloud,
      latencyMs: 0,
      chatMessagesCount: 0,
      auditsCount: 0,
      roomsCount: 0,
      storageTier: "9 GB Lifetime Free Tier (Turso LibSQL)",
      error: err.message,
    };
  }
}

/**
 * Fetch a user's chat profile from Turso
 */
async function getChatUserProfile(userId) {
  if (!client || !userId) return null;
  try {
    const res = await client.execute({
      sql: "SELECT * FROM chat_user_profiles WHERE userId = ? LIMIT 1",
      args: [String(userId)],
    });
    if (res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      let avatarHistory = [];
      try {
        if (row.avatarHistory) avatarHistory = JSON.parse(row.avatarHistory);
      } catch (_) {}
      return {
        userId: String(row.userId),
        chatUsername: row.chatUsername ? String(row.chatUsername) : "",
        avatarUrl: row.avatarUrl ? String(row.avatarUrl) : "",
        role: row.role ? String(row.role) : "student",
        isBlocked: Boolean(row.isBlocked),
        updatedAt: row.updatedAt ? String(row.updatedAt) : "",
        avatarHistory,
      };
    }
    return null;
  } catch (err) {
    console.warn(`[TURSO] getChatUserProfile notice (${userId}):`, err.message);
    return null;
  }
}

/**
 * Check if a chat username is already taken by another student in Turso
 */
async function isChatUsernameTaken(username, excludeUserId = null) {
  if (!client || !username) return false;
  try {
    const clean = String(username).trim().toLowerCase();
    const sql = excludeUserId
      ? "SELECT userId FROM chat_user_profiles WHERE LOWER(chatUsername) = ? AND userId != ? LIMIT 1"
      : "SELECT userId FROM chat_user_profiles WHERE LOWER(chatUsername) = ? LIMIT 1";
    const args = excludeUserId ? [clean, String(excludeUserId)] : [clean];
    const res = await client.execute({ sql, args });
    return res.rows && res.rows.length > 0;
  } catch (err) {
    console.warn(`[TURSO] isChatUsernameTaken error (${username}):`, err.message);
    return false;
  }
}

/**
 * Upsert a user's chat profile (handle, DP, avatarHistory) into Turso
 */
async function saveChatUserProfile(userId, data = {}) {
  if (!client || !userId) return false;
  try {
    const cleanUsername = data.chatUsername ? String(data.chatUsername).trim().toLowerCase().replace(/[^a-z0-9_]/g, "") : null;
    const avatarUrl = data.avatarUrl ? String(data.avatarUrl).trim() : null;
    const role = data.role ? String(data.role).trim() : "student";
    const isBlocked = data.isBlocked ? 1 : 0;
    const updatedAt = new Date().toISOString();
    const historyJson = Array.isArray(data.avatarHistory) ? JSON.stringify(data.avatarHistory) : "[]";

    await client.execute({
      sql: `
        INSERT INTO chat_user_profiles (userId, chatUsername, avatarUrl, role, isBlocked, updatedAt, avatarHistory)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
          chatUsername = COALESCE(excluded.chatUsername, chat_user_profiles.chatUsername),
          avatarUrl = COALESCE(excluded.avatarUrl, chat_user_profiles.avatarUrl),
          role = excluded.role,
          isBlocked = excluded.isBlocked,
          updatedAt = excluded.updatedAt,
          avatarHistory = excluded.avatarHistory
      `,
      args: [String(userId), cleanUsername, avatarUrl, role, isBlocked, updatedAt, historyJson],
    });
    return true;
  } catch (err) {
    console.warn(`[TURSO] saveChatUserProfile error (${userId}):`, err.message);
    return false;
  }
}

/**
 * Get all chat user profiles from Turso
 */
async function getAllChatProfiles() {
  if (!client) return [];
  try {
    const res = await client.execute("SELECT * FROM chat_user_profiles ORDER BY updatedAt DESC LIMIT 200");
    return (res.rows || []).map((row) => {
      let avatarHistory = [];
      try {
        if (row.avatarHistory) avatarHistory = JSON.parse(row.avatarHistory);
      } catch (_) {}
      return {
        userId: String(row.userId),
        chatUsername: row.chatUsername ? String(row.chatUsername) : "",
        avatarUrl: row.avatarUrl ? String(row.avatarUrl) : "",
        role: row.role ? String(row.role) : "student",
        isBlocked: Boolean(row.isBlocked),
        updatedAt: row.updatedAt ? String(row.updatedAt) : "",
        avatarHistory,
      };
    });
  } catch (err) {
    console.warn("[TURSO] getAllChatProfiles notice:", err.message);
    return [];
  }
}

/**
 * Permanently cascades and removes a user and their associated records from Turso database
 */
async function purgeUserFromTurso(userId, userEmail = null) {
  if (!client || !userId) return { success: false, deletedCount: 0 };
  let deletedCount = 0;
  try {
    const cleanId = String(userId).trim();
    const cleanEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;

    // 1. Delete from users table
    const r1 = await client.execute({
      sql: `DELETE FROM users WHERE id = ? OR (email IS NOT NULL AND email = ?)`,
      args: [cleanId, cleanEmail || cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r1.rowsAffected || 0);

    // 2. Delete from chat_user_profiles
    const r2 = await client.execute({
      sql: `DELETE FROM chat_user_profiles WHERE userId = ?`,
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r2.rowsAffected || 0);

    // 3. Delete user's chat messages
    const r3 = await client.execute({
      sql: `DELETE FROM chat_messages WHERE senderId = ?`,
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r3.rowsAffected || 0);

    // 4. Delete user's created chat rooms
    const r4 = await client.execute({
      sql: `DELETE FROM chat_rooms WHERE createdBy = ?`,
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r4.rowsAffected || 0);

    // 5. Delete private room audits where user was creator
    const r5 = await client.execute({
      sql: `DELETE FROM private_room_audits WHERE createdBy = ?`,
      args: [cleanId],
    }).catch(() => ({ rowsAffected: 0 }));
    deletedCount += (r5.rowsAffected || 0);

    console.log(`[TURSO] 🗑️ Cascaded user deletion for ${cleanId} (${cleanEmail}): ${deletedCount} rows removed.`);
    return { success: true, deletedCount };
  } catch (err) {
    console.warn("[TURSO] Purge user error:", err.message);
    return { success: false, error: err.message, deletedCount };
  }
}

/**
 * Re-attribute or archive uploaded notes in Turso database
 */
async function archiveUserNotesInTurso(userEmail, archivedUploaderName) {
  if (!client || !userEmail) return false;
  try {
    const cleanEmail = String(userEmail).trim().toLowerCase();
    await client.execute({
      sql: `UPDATE notes SET uploaderName = ? WHERE uploadedBy = ?`,
      args: [String(archivedUploaderName), cleanEmail],
    }).catch(() => {});
    return true;
  } catch (err) {
    console.warn("[TURSO] Archive user notes error:", err.message);
    return false;
  }
}

module.exports = {
  get tursoClient() {
    return client;
  },
  get client() {
    return client;
  },
  get isCloud() {
    return isCloud;
  },
  initTursoTables,
  getTursoStatus,
  upsertNoteToTurso,
  syncFromFirestore,
  savePrivateRoomAudit,
  recordChatMessageToTurso,
  deleteRoomFromTurso,
  getPrivateRoomAudits,
  pruneChatMessagesOlderThan,
  prunePrivateRoomAuditsOlderThan,
  deleteSinglePrivateRoomAudit,
  getTursoChatTelemetry,
  getChatUserProfile,
  isChatUsernameTaken,
  saveChatUserProfile,
  getAllChatProfiles,
  purgeUserFromTurso,
  archiveUserNotesInTurso,
};

