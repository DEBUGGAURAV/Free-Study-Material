const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { authenticateToken, requireAuth, JWT_SECRET, setAuthCookie } = require("../middleware/auth");
const { getClientIp } = require("../middleware/rateLimit");
const { getSiteUrl } = require("../config/siteConfig");
const {
  savePrivateRoomAudit,
  recordChatMessageToTurso,
  deleteRoomFromTurso,
  tursoClient,
  pruneChatMessagesOlderThan,
  getTursoChatTelemetry,
  getChatUserProfile,
  isChatUsernameTaken,
  saveChatUserProfile,
  getAllChatProfiles,
} = require("../services/tursoService");
const { bufferChatMessage } = require("../services/mongoChatBufferService");
const { decrypt } = require("../utils/cryptoVault");
const {
  dispatchChatForensicAudit,
  dispatchPrivateChatMessageToTelegram,
  dispatchGroupAuditEventToTelegram,
  dispatchPrivateMediaToTelegramVault,
  dispatchActiveStudentsReportToTelegram,
  dispatchPublicChatMessageToTelegram,
  dispatchPublicChatEditToTelegram,
  dispatchPublicChatDeleteToTelegram,
  dispatchChatPresenceAlertToTelegram,
  dispatchChatPurgeAlertToTelegram,
  dispatchChatBlockAlertToTelegram,
  getChatBotSettings,
  setChatHandlers,
} = require("../services/chatAuditBotService");
const { isMaintenanceActive } = require("../middleware/maintenance");

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

const RESERVED_CHAT_USERNAMES = [
  "admin", "administrator", "root", "staff", "mod", "moderator",
  "fsm", "freestudymaterial", "fsmadmin", "fsm_admin", "official", "support",
  "helpdesk", "system", "security", "owner", "superuser", "founder",
  "coreconcepts", "bot", "ai", "team", "securitybot", "fsmchat", "vault",
  "academic", "academic_cloud", "webmaster"
];

// Ensure Chat Media directory exists for uploaded PDFs & Images
const CHAT_MEDIA_DIR = path.join(process.cwd(), "cache", "chat_media");
try {
  if (!fs.existsSync(CHAT_MEDIA_DIR)) {
    fs.mkdirSync(CHAT_MEDIA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("[CHAT-MEDIA] Directory notice:", e.message);
}

// (getClientIp imported from rateLimit with proxy-safe spoofing prevention)

// Multer storage for Chat Attachments
const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CHAT_MEDIA_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const cleanName = (file.originalname || "attachment").replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `chat-${uniqueSuffix}-${cleanName}`);
  },
});

const uploadChatMedia = multer({
  storage: chatStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max limit for student PDF notes & media
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    if (ext === ".svg" || mime === "image/svg+xml" || ext === ".html" || mime === "text/html") {
      return cb(new Error("SVG and HTML script files are not permitted in chat for security reasons."));
    }
    const allowed = [
      ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".doc", ".docx",
      ".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"
    ];
    if (allowed.includes(ext) || file.mimetype.startsWith("audio/") || (file.mimetype.startsWith("image/") && mime !== "image/svg+xml")) {
      cb(null, true);
    } else {
      cb(new Error("File format not supported in chat. Please share PDF, image, audio, or text documents."));
    }
  },
});

// Multer storage for Student Chat DP / Avatar
const uploadChatAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CHAT_MEDIA_DIR),
    filename: (req, file, cb) => {
      let ext = path.extname(file.originalname).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        ext = ".jpg";
      }
      const safeUserId = String(req.user?.id || "user").replace(/[^a-zA-Z0-9_-]/g, "");
      cb(null, `dp-${safeUserId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext) && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (PNG, JPG, WebP) are allowed for DP."));
    }
  },
});

/**
 * -------------------------------------------------------------
 * 🧠 IN-MEMORY STATE FOR 0% CPU & SUB-10MS LATENCY
 * -------------------------------------------------------------
 */
// Map of roomId -> Room Object
const activeRooms = new Map();

// Map of roomId -> Array of Messages (Keeps latest 200 in RAM, 2-day TTL)
const activeMessages = new Map();

// Map of roomId -> Map of socketId -> Participant Details
const roomSockets = new Map();

// Set of Blocked User IDs
const blockedUsers = new Set();

// Public Chat Announcement Notice
let chatNotice = {
  text: "Welcome to Free Study Material Student Hub! Connect with peer scholars, share notes, and collaborate in real-time.",
  updatedAt: new Date().toISOString(),
  updatedBy: "Admin",
};

// Initialize Default Public Hall Room
const PUBLIC_ROOM_ID = "public";
activeRooms.set(PUBLIC_ROOM_ID, {
  id: PUBLIC_ROOM_ID,
  name: "💬 Public Community Chat",
  description: "Open community discussion for all college students across branches.",
  isPrivate: false,
  createdBy: "system",
  createdAt: new Date().toISOString(),
  members: new Set(),
  auditLog: [],
});
activeMessages.set(PUBLIC_ROOM_ID, []);
roomSockets.set(PUBLIC_ROOM_ID, new Map());

// Asynchronously load saved Chat Notice & Blocked Users from Firestore
(async function initChatState() {
  try {
    if (db) {
      const noticeDoc = await db.collection("settings").doc("chat_notice").get();
      if (noticeDoc.exists) {
        chatNotice = { ...chatNotice, ...noticeDoc.data() };
      }

      const blockedDoc = await db.collection("settings").doc("chat_blocked_users").get();
      if (blockedDoc.exists && Array.isArray(blockedDoc.data().userIds)) {
        blockedDoc.data().userIds.forEach((id) => blockedUsers.add(id));
      }

      // Load recent 100 public messages from Firestore (sorted in-memory to eliminate composite index requirement)
      let snap;
      try {
        snap = await db
          .collection("chat_messages")
          .where("roomId", "==", PUBLIC_ROOM_ID)
          .limit(100)
          .get();
      } catch (qErr) {
        snap = { empty: true };
      }

      if (snap && !snap.empty) {
        const msgs = [];
        snap.forEach((doc) => msgs.push({ id: doc.id, ...doc.data() }));
        msgs.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        activeMessages.set(PUBLIC_ROOM_ID, msgs);
        console.log(`[CHAT] 💬 Loaded ${msgs.length} public chat messages into RAM.`);
      }
    }
  } catch (err) {
    console.debug("[CHAT] State init notice:", err.message);
  }
})();

/**
 * 🔄 Retrieves a room from memory, or restores it from Firestore if not in memory (resilience against cold starts)
 */
async function getOrRestoreRoom(roomId) {
  if (!roomId) return null;
  let room = activeRooms.get(roomId);
  if (!room && db && roomId !== PUBLIC_ROOM_ID) {
    try {
      const rDoc = await db.collection("chat_rooms").doc(roomId).get();
      if (rDoc.exists) {
        const rData = rDoc.data();
        room = {
          id: rDoc.id,
          ...rData,
          members: new Set(rData.members || []),
          bannedMembers: new Set(rData.bannedMembers || []),
          auditLog: [],
          auditMessages: [],
          participantsMap: new Map(),
        };
        activeRooms.set(roomId, room);
        if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
        if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Map());
      }
    } catch (e) {
      console.warn(`[CHAT] Error restoring room ${roomId}:`, e.message);
    }
  }
  return room;
}

/**
 * 📥 Inbound Telegram Message Injector
 * Receives messages/photos/documents sent by Admins in Telegram @fsm_chat_bot,
 * inserts into RAM, mirrors to Turso LibSQL, and broadcasts via WebSocket.
 */
function injectIncomingPublicMessage(newMsg) {
  if (!activeMessages.has(PUBLIC_ROOM_ID)) activeMessages.set(PUBLIC_ROOM_ID, []);
  const msgs = activeMessages.get(PUBLIC_ROOM_ID);
  msgs.push(newMsg);
  if (msgs.length > 200) msgs.shift();

  // Real-Time WebSocket broadcast to all web students
  broadcastToRoom(PUBLIC_ROOM_ID, {
    type: "new_message",
    message: newMsg,
  });

  // Asynchronously persist to Firestore
  if (db) {
    db.collection("chat_messages").doc(newMsg.id).set(newMsg).catch(() => {});
  }

  // Mirror to Turso LibSQL Cloud
  recordChatMessageToTurso(newMsg).catch(() => {});
  bufferChatMessage(newMsg).catch(() => {});
  console.log(`[CHAT-SYNC] 📥 Synced Telegram message into Public Chat Hall: "${newMsg.text || newMsg.fileName}"`);
}

/**
 * ✏️ Inbound Telegram Edit Syncer
 * Updates message in memory, broadcasts message_edited via WebSocket, updates Firestore and Turso.
 */
function editPublicMessageFromTelegram(telegramMsgId, newText) {
  if (!activeMessages.has(PUBLIC_ROOM_ID)) return false;
  const msgs = activeMessages.get(PUBLIC_ROOM_ID);
  const msg = msgs.find((m) => String(m.telegramMsgId) === String(telegramMsgId) || m.id === String(telegramMsgId));
  if (!msg) return false;

  const sanitized = (newText || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  msg.text = sanitized;
  msg.isEdited = true;
  msg.editedAt = new Date().toISOString();

  broadcastToRoom(PUBLIC_ROOM_ID, {
    type: "message_edited",
    messageId: msg.id,
    newText: msg.text,
    editedAt: msg.editedAt,
  });

  if (db) {
    db.collection("chat_messages").doc(msg.id).update({
      text: msg.text,
      isEdited: true,
      editedAt: msg.editedAt,
    }).catch(() => {});
  }
  return true;
}

/**
 * 🗑️ Inbound Telegram Single-Message Delete Syncer
 * Finds message by Web Message ID or Telegram Message ID across Public & Private rooms,
 * marks as deleted in memory, broadcasts message_deleted via WebSocket, and updates Firestore & Turso.
 */
async function deletePublicMessageFromTelegram(msgIdentifier) {
  if (!msgIdentifier) return { success: false, message: "No message ID provided." };
  const cleanTarget = String(msgIdentifier).trim();

  let foundMsg = null;
  let foundRoomId = null;

  for (const [rId, msgs] of activeMessages.entries()) {
    if (!Array.isArray(msgs)) continue;
    const match = msgs.find(
      (m) => String(m.id) === cleanTarget || (m.telegramMsgId && String(m.telegramMsgId) === cleanTarget)
    );
    if (match) {
      foundMsg = match;
      foundRoomId = rId;
      break;
    }
  }

  if (foundMsg && foundRoomId) {
    foundMsg.isDeleted = true;
    foundMsg.text = "🗑️ This message was deleted";
    foundMsg.fileUrl = null;

    broadcastToRoom(foundRoomId, {
      type: "message_deleted",
      messageId: foundMsg.id,
      text: foundMsg.text,
    });

    if (db) {
      db.collection("chat_messages").doc(foundMsg.id).update({
        text: foundMsg.text,
        fileUrl: null,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    if (tursoClient) {
      tursoClient.execute({
        sql: "DELETE FROM chat_messages WHERE id = ?",
        args: [String(foundMsg.id)],
      }).catch(() => {});
    }

    return {
      success: true,
      messageId: foundMsg.id,
      roomId: foundRoomId,
      sender: foundMsg.sender || null,
    };
  }

  // Fallback if message scrolled out of 200-msg RAM cache: check Firestore / Turso directly by message ID
  let dbFoundRoom = PUBLIC_ROOM_ID;
  let dbSender = null;
  let deletedFromStorage = false;

  if (db && cleanTarget.startsWith("msg_")) {
    try {
      const docRef = db.collection("chat_messages").doc(cleanTarget);
      const snap = await docRef.get();
      if (snap.exists) {
        const d = snap.data() || {};
        dbFoundRoom = d.roomId || PUBLIC_ROOM_ID;
        dbSender = d.sender || null;
        await docRef.update({
          text: "🗑️ This message was deleted",
          fileUrl: null,
          isDeleted: true,
          deletedAt: new Date().toISOString(),
        });
        deletedFromStorage = true;
      }
    } catch (_) {}
  }

  if (tursoClient && cleanTarget.startsWith("msg_")) {
    try {
      const tRes = await tursoClient.execute({
        sql: "DELETE FROM chat_messages WHERE id = ?",
        args: [cleanTarget],
      });
      if (tRes && Number(tRes.rowsAffected || 0) > 0) {
        deletedFromStorage = true;
      }
    } catch (_) {}
  }

  if (deletedFromStorage) {
    broadcastToRoom(dbFoundRoom, {
      type: "message_deleted",
      messageId: cleanTarget,
      text: "🗑️ This message was deleted",
    });
    return {
      success: true,
      messageId: cleanTarget,
      roomId: dbFoundRoom,
      sender: dbSender,
    };
  }

  return { success: false, message: `Message "${cleanTarget}" not found.` };
}

setChatHandlers({
  injectIncomingPublicMessage,
  editPublicMessage: editPublicMessageFromTelegram,
  deletePublicMessage: deletePublicMessageFromTelegram,
  deleteAllUserMessages: handleDeleteAllUserMessagesFromTelegram,
  getActiveUsers: getActiveUsersList,
  blockUser: handleBlockUserFromTelegram,
  unblockUser: handleUnblockUserFromTelegram,
  getBlockedUsers: getBlockedUsersList,
  purgePublicChat: handlePurgePublicChatFromTelegram,
  setRetentionDays: (days) => {
    runRetentionPrune(days);
  },
});

let lastPruneStats = {
  timestamp: null,
  prunedCount: 0,
  retentionDays: 7,
};

let lastPurgeStats = {
  timestamp: null,
  purgedCount: 0,
  inactivityDays: 7,
};

/**
 * 🧹 Configurable Chat Retention Auto-Pruner
 * Purges messages older than chatRetentionDays (default 7 days) from Memory, Turso, and Firestore
 */
async function runRetentionPrune(customDays = null) {
  const settings = typeof getChatBotSettings === "function" ? getChatBotSettings() : {};
  const retentionDays = (customDays !== null && customDays !== undefined && !isNaN(customDays))
    ? Number(customDays)
    : Number(settings.chatRetentionDays || 7);
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  let memoryPruned = 0;
  activeMessages.forEach((msgs, roomId) => {
    const beforeLen = msgs.length;
    const filtered = msgs.filter((m) => new Date(m.createdAt).getTime() >= cutoffMs);
    activeMessages.set(roomId, filtered);
    memoryPruned += beforeLen - filtered.length;
  });

  // Prune Turso LibSQL table
  const tursoResult = await pruneChatMessagesOlderThan(retentionDays);

  // Prune MongoDB Hot Buffer
  let mongoPruned = 0;
  try {
    const { pruneBufferOlderThan } = require("../services/mongoChatBufferService");
    const mongoRes = await pruneBufferOlderThan(retentionDays);
    mongoPruned = mongoRes?.deletedCount || 0;
  } catch (_) {}

  // Prune Firestore in batches
  let firestorePruned = 0;
  if (db) {
    try {
      const oldDocs = await db.collection("chat_messages").where("createdAt", "<", cutoffIso).limit(100).get();
      if (!oldDocs.empty) {
        const batch = db.batch();
        oldDocs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        firestorePruned = oldDocs.size;
      }
    } catch (e) {
      console.warn("[CHAT-PRUNER] Firestore prune notice:", e.message);
    }
  }

  const totalPruned = Math.max(tursoResult?.deletedCount || 0, memoryPruned, firestorePruned, mongoPruned);
  lastPruneStats = {
    timestamp: new Date().toISOString(),
    prunedCount: totalPruned,
    retentionDays,
  };
  console.log(`[CHAT-PRUNER] 🧹 Auto-prune complete (${retentionDays}d retention limit): ${totalPruned} messages purged.`);
  if (totalPruned > 0) {
    dispatchChatPresenceAlertToTelegram({
      event: "RETENTION_PURGE",
      user: { name: "Retention Daemon", email: "retention@cleaner" },
      roomId: "public",
      details: `${totalPruned} messages older than ${retentionDays} days were automatically cleaned from Turso and Firestore.`,
    }).catch(() => {});
  }
  return { success: true, retentionDays, totalPruned, memoryPruned, tursoPruned: tursoResult?.deletedCount || 0, firestorePruned };
}

/**
 * 🚨 7-Day Inactivity Auto-Purge Guardian
 * Auto-archives and purges private study pods with no activity for 7 consecutive days
 */
async function runInactivityPurge(customDays = null) {
  const settings = typeof getChatBotSettings === "function" ? getChatBotSettings() : {};
  const inactivityDays = Number(customDays || settings.privateRoomInactivityDays || 7);
  const inactivityMs = inactivityDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let purgedCount = 0;
  const roomsToPurge = [];

  // Check in-memory active rooms
  activeRooms.forEach((room, roomId) => {
    if (!room.isPrivate || roomId === PUBLIC_ROOM_ID) return;
    const lastActive = new Date(room.lastActivity || room.createdAt).getTime();
    if (now - lastActive >= inactivityMs) {
      roomsToPurge.push(room);
    }
  });

  // Check Firestore chat_rooms for dormant rooms
  if (db) {
    try {
      const snap = await db.collection("chat_rooms").where("isPrivate", "==", true).get();
      if (!snap.empty) {
        snap.forEach((doc) => {
          const rData = doc.data();
          const rId = doc.id;
          if (!activeRooms.has(rId)) {
            const lastActive = new Date(rData.lastActivity || rData.createdAt || 0).getTime();
            if (now - lastActive >= inactivityMs) {
              roomsToPurge.push({
                id: rId,
                ...rData,
                members: new Set(),
                auditLog: [],
                auditMessages: [],
              });
            }
          }
        });
      }
    } catch (e) {}
  }

  for (const r of roomsToPurge) {
    try {
      console.log(`[INACTIVITY-GUARDIAN] 🚨 Purging private room "${r.name}" (${r.id}) due to >= ${inactivityDays} days inactivity...`);
      await archiveAndPurgePrivateRoom(r, "7_day_inactivity_guardian");
      purgedCount++;
    } catch (err) {
      console.warn(`[INACTIVITY-GUARDIAN] Purge error for room ${r.id}:`, err.message);
    }
  }

  lastPurgeStats = {
    timestamp: new Date().toISOString(),
    purgedCount,
    inactivityDays,
  };
  return { success: true, inactivityDays, purgedCount };
}

function getActiveChatStats() {
  const settings = typeof getChatBotSettings === "function" ? getChatBotSettings() : {};
  const inactivityDays = Number(settings.privateRoomInactivityDays || 7);
  const inactivityMs = inactivityDays * 24 * 60 * 60 * 1000;
  const warningMs = Math.max(1, inactivityDays - 2) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let privateRoomsCount = 0;
  let inactivePodsCount = 0;
  let nearInactivePodsCount = 0;
  let connectedSocketsCount = 0;

  roomSockets.forEach((sockMap) => {
    connectedSocketsCount += sockMap.size;
  });

  activeRooms.forEach((room, roomId) => {
    if (room.isPrivate && roomId !== PUBLIC_ROOM_ID) {
      privateRoomsCount++;
      const lastActive = new Date(room.lastActivity || room.createdAt).getTime();
      const diff = now - lastActive;
      if (diff >= inactivityMs) inactivePodsCount++;
      else if (diff >= warningMs) nearInactivePodsCount++;
    }
  });

  return {
    totalRooms: activeRooms.size,
    privateRoomsCount,
    connectedSocketsCount,
    inactivePodsCount,
    nearInactivePodsCount,
    lastPruneStats,
    lastPurgeStats,
    chatRetentionDays: settings.chatRetentionDays || 7,
    privateRoomInactivityDays: settings.privateRoomInactivityDays || 7,
  };
}

// Scheduled hourly sweep for message retention & 7-day inactivity guardian
setInterval(async () => {
  try {
    await runRetentionPrune();
    await runInactivityPurge();
  } catch (err) {
    console.warn("[CHAT-GUARDIAN] Scheduled sweep warning:", err.message);
  }
}, 60 * 60 * 1000);

// Initial warmup sweep after 15 seconds
setTimeout(() => {
  runRetentionPrune().catch(() => {});
  runInactivityPurge().catch(() => {});
}, 15000);

/**
 * Helper: Check if requesting user is Admin (Main Admin, Full Admin, Half Admin, or Admin Permission Holders)
 */
function isUserAdmin(user) {
  if (!user) return false;
  const role = (user.role || "").toLowerCase().trim();
  const email = (user.email || "").toLowerCase().trim();
  const perms = Array.isArray(user.permissions) ? user.permissions : [];

  return (
    Boolean(user.isMainAdmin) ||
    Boolean(user.isAdmin) ||
    role === "admin" ||
    role === "half_admin" ||
    role === "sub_admin" ||
    role === "moderator" ||
    role === "co_admin" ||
    perms.includes("all") ||
    perms.includes("manage_chat") ||
    perms.includes("delete_records") ||
    perms.includes("manage_users") ||
    (Boolean(MAIN_ADMIN_EMAIL) && email === MAIN_ADMIN_EMAIL)
  );
}

/**
 * 👑 Helper: Check if requesting user is the Master / Main Admin
 * Strictly only the Main Admin can enter private pods in Ghost Mode without a passcode!
 */
function isMainAdmin(user) {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  const mainEmail = (process.env.ADMIN_EMAIL || MAIN_ADMIN_EMAIL || "").toLowerCase().trim();
  return (
    Boolean(user.isMainAdmin) ||
    Boolean(user.isMasterAdmin) ||
    (Boolean(mainEmail) && email === mainEmail)
  );
}

function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Helper: Query database (Firestore + Turso) to enrich participant details with mobile number
 */
async function enrichParticipantDetails(userId, existingData = {}) {
  let mobile = existingData.mobile || "";
  let name = existingData.name || "Student";
  let username = existingData.username || "";
  let photoUrl = existingData.photoUrl || existingData.avatar || "";
  let avatarHistory = Array.isArray(existingData.avatarHistory) ? existingData.avatarHistory : [];
  let email = existingData.email || "";
  let branch = existingData.branch || "General";
  let year = existingData.year || "";
  let college = existingData.college || "";
  let role = existingData.role || "student";

  try {
    if (db && userId) {
      const uDoc = await db.collection("users").doc(userId).get();
      if (uDoc.exists) {
        const u = uDoc.data();
        if (u.mobile) mobile = decrypt(u.mobile);
        if (u.name) name = u.name;
        if (u.username) username = u.username;
        if (u.photoUrl || u.avatar) photoUrl = u.photoUrl || u.avatar;
        if (Array.isArray(u.avatarHistory)) avatarHistory = u.avatarHistory;
        if (u.email) email = u.email;
        if (u.branch) branch = u.branch;
        if (u.year) year = u.year;
        if (u.college) college = u.college;
        if (u.role) role = u.role;
      }
    }
  } catch (_) {}

  try {
    if ((!mobile || !email || !photoUrl) && tursoClient && userId) {
      const res = await tursoClient.execute({
        sql: "SELECT name, email, mobile, branch, year, role, avatar FROM users WHERE id = ? OR email = ? LIMIT 1",
        args: [String(userId), String(email || "")],
      });
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        if (!mobile && row.mobile) mobile = decrypt(row.mobile);
        if (!email && row.email) email = row.email;
        if (row.name && (!name || name === "Student")) name = row.name;
        if (!photoUrl && row.avatar) photoUrl = row.avatar;
        if (!branch && row.branch) branch = row.branch;
        if (!year && row.year) year = row.year;
        if (row.role) role = row.role;
      }
    }
  } catch (_) {}

  try {
    const chatProfile = await getChatUserProfile(userId);
    if (chatProfile) {
      if (chatProfile.chatUsername) username = chatProfile.chatUsername;
      if (chatProfile.avatarUrl) photoUrl = chatProfile.avatarUrl;
      if (Array.isArray(chatProfile.avatarHistory) && chatProfile.avatarHistory.length > 0) {
        avatarHistory = chatProfile.avatarHistory;
      }
    }
  } catch (_) {}

  return {
    userId,
    name,
    username,
    email: email || "Not Provided",
    mobile: mobile || "Not Linked",
    branch: branch || "General",
    year: year || "All",
    college: college || "Academic Hub",
    role,
    photoUrl,
    avatarHistory,
  };
}

/**
 * -------------------------------------------------------------
 * 🚀 COMPREHENSIVE FORENSIC PRIVATE ROOM ARCHIVER & PURGER
 * -------------------------------------------------------------
 * Dispatches full report (Participants, Deleted Messages, Media)
 * to Admin's Telegram & saves permanent audit to Turso LibSQL,
 * then completely purges the room from memory & Firestore!
 */
async function archiveAndPurgePrivateRoom(room, closeReason = "zero_members", closedByUser = null) {
  if (!room || !room.isPrivate) return;

  const roomId = room.id;
  try {
    const closedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(room.createdAt).getTime();
    const durationMins = Math.max(1, Math.round(durationMs / 60000));

    const auditMsgs = room.auditMessages || [];
    const auditLog = room.auditLog || [];
    const participantsMap = room.participantsMap || new Map();

    // 1. Gather all unique participant IDs
    const participantIds = new Set();
    if (room.createdBy) participantIds.add(room.createdBy);
    if (closedByUser?.id) participantIds.add(closedByUser.id);
    auditLog.forEach((log) => { if (log.userId) participantIds.add(log.userId); });
    participantsMap.forEach((_, uid) => participantIds.add(uid));
    auditMsgs.forEach((m) => { if (m.senderId) participantIds.add(m.senderId); });

    // 2. Enrich participant details (fetching real mobile, email, name, branch from DB)
    const detailedParticipants = [];
    for (const uid of participantIds) {
      const cached = participantsMap.get(uid) || {};
      const enriched = await enrichParticipantDetails(uid, cached);

      // Calculate time spent in room & movement status
      const userLogs = auditLog.filter((l) => l.userId === uid);
      let totalMins = 0;
      if (userLogs.length > 0) {
        userLogs.forEach((l) => {
          const start = l.joinedAt || new Date(room.createdAt).getTime();
          const end = l.leftAt || Date.now();
          totalMins += Math.max(1, Math.round((end - start) / 60000));
        });
      } else {
        totalMins = durationMins;
      }

      const hadLeft = userLogs.length > 0 && userLogs.every((l) => l.leftAt !== null);
      const firstJoinTs = userLogs.length > 0 ? Math.min(...userLogs.map((l) => l.joinedAt || 0)) : new Date(room.createdAt).getTime();
      const lastLeaveTs = userLogs.length > 0 ? Math.max(...userLogs.map((l) => l.leftAt || Date.now())) : Date.now();

      const firstJoinFormatted = new Date(firstJoinTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const lastLeaveFormatted = hadLeft
        ? new Date(lastLeaveTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : `Present at deletion (${new Date(lastLeaveTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})`;

      const movementStatus = hadLeft ? "🚪 Left session early" : "🟢 Present at deletion";

      detailedParticipants.push({
        ...enriched,
        ip: cached.ip || "127.0.0.1",
        durationMins: totalMins,
        isCreator: uid === room.createdBy,
        hadLeft,
        firstJoinFormatted,
        lastLeaveFormatted,
        movementStatus,
      });
    }

    // Host details
    const host = detailedParticipants.find((p) => p.userId === room.createdBy) || {
      name: room.creatorName || "Host",
      email: "N/A",
      mobile: "N/A",
      ip: "127.0.0.1",
    };

    // Calculate Join & Leave Metrics
    const totalJoinedCount = detailedParticipants.length;
    const totalLeftCount = detailedParticipants.filter((p) => p.hadLeft).length;
    const totalActiveAtDeletion = detailedParticipants.length - totalLeftCount;

    // 3. Process messages, deleted messages, and attachments
    const deletedMsgs = auditMsgs.filter((m) => m.isDeleted);
    const mediaMsgs = auditMsgs.filter(
      (m) => m.fileUrl || ["pdf", "image", "audio", "document"].includes(m.type)
    );
    const pdfCount = auditMsgs.filter((m) => m.type === "pdf").length;
    const imgCount = auditMsgs.filter((m) => m.type === "image").length;

    const clientUrl = getSiteUrl();

    // 4. Deletion Mode & Reason Formatting
    const isUserDelete = closeReason === "closed_by_user";
    const is7DayInactivity = closeReason === "7_day_inactivity_guardian";

    let reportCategoryHeader = "";
    let deletionModeBadge = "";
    let closeReasonFormatted = "";

    if (isUserDelete) {
      reportCategoryHeader = `🚨 <b>[USER MANUAL DELETION - PRIVATE GROUP]</b>`;
      deletionModeBadge = `🔴 USER DELETE`;
      closeReasonFormatted = `🔴 USER MANUAL DELETE: Deleted by ${closedByUser?.name || "Participant"} (${closedByUser?.email || "N/A"}${closedByUser?.ip ? ` | 🌐 IP: <code>${closedByUser.ip}</code>` : ""})`;
    } else if (is7DayInactivity) {
      reportCategoryHeader = `🚨 <b>[AUTO-PURGE: 7-DAY INACTIVITY EXPIRED]</b>`;
      deletionModeBadge = `⏰ AUTO DELETE (7-DAY INACTIVITY)`;
      closeReasonFormatted = `⏰ AUTO-PURGE: Inactive for 7 consecutive days without activity`;
    } else {
      reportCategoryHeader = `🚨 <b>[AUTO-PURGE: ALL PARTICIPANTS LEFT]</b>`;
      deletionModeBadge = `⏰ AUTO DELETE (0 MEMBERS)`;
      closeReasonFormatted = `⏰ AUTO-PURGE: All participants left the private group (0 active members remaining)`;
    }

    // 5. Construct Telegram HTML Report Message
    let teleHtml = `${reportCategoryHeader}\n\n`;
    teleHtml += `🏷️ <b>Group Name:</b> ${escapeHtml(room.name)}\n`;
    teleHtml += `🔑 <b>Invite Passcode:</b> <code>${escapeHtml(room.secretCode || "N/A")}</code>\n`;
    teleHtml += `🆔 <b>Room ID:</b> <code>${escapeHtml(room.id)}</code>\n`;
    teleHtml += `👤 <b>Host/Creator:</b> <b>${escapeHtml(host.name)}</b> (📱 <code>${escapeHtml(host.mobile)}</code> | 📧 ${escapeHtml(host.email)} | 🌐 <code>${escapeHtml(host.ip || "127.0.0.1")}</code>)\n`;
    teleHtml += `⏱️ <b>Active Duration:</b> ${durationMins} minutes\n`;
    teleHtml += `🗑️ <b>Deletion Mode:</b> <b>${escapeHtml(deletionModeBadge)}</b>\n`;
    teleHtml += `🚪 <b>Close Reason:</b> <i>${escapeHtml(closeReasonFormatted)}</i>\n`;
    teleHtml += `📅 <b>Session:</b> ${new Date(room.createdAt).toLocaleString("en-IN")} ➔ ${new Date(closedAt).toLocaleString("en-IN")}\n\n`;

    teleHtml += `👥 <b>PARTICIPANT MOVEMENT SUMMARY:</b>\n`;
    teleHtml += `📥 <b>Total Users Joined:</b> <b>${totalJoinedCount}</b> scholars\n`;
    teleHtml += `🚪 <b>Total Users Left:</b> <b>${totalLeftCount}</b> scholars\n`;
    teleHtml += `⚡ <b>Present at Deletion:</b> <b>${totalActiveAtDeletion}</b> scholars\n\n`;

    teleHtml += `📋 <b>PARTICIPANTS ATTENDANCE DIRECTORY (${detailedParticipants.length}):</b>\n`;
    detailedParticipants.forEach((p, idx) => {
      teleHtml += `${idx + 1}. <b>${escapeHtml(p.name)}</b> ${p.isCreator ? "(👑 Host)" : ""} [<b>${escapeHtml(p.movementStatus)}</b>]\n`;
      teleHtml += `   📱 Mobile: <code>${escapeHtml(p.mobile)}</code> | 📧 ${escapeHtml(p.email)}\n`;
      teleHtml += `   🌐 IP: <code>${escapeHtml(p.ip || "127.0.0.1")}</code>\n`;
      teleHtml += `   🎓 Branch/Year: ${escapeHtml(p.branch)} - ${escapeHtml(p.year)}\n`;
      teleHtml += `   ⏰ Joined: ${escapeHtml(p.firstJoinFormatted)} ➔ Left: ${escapeHtml(p.lastLeaveFormatted)} (~${p.durationMins} mins)\n`;
    });

    teleHtml += `\n📊 <b>ACTIVITY METRICS:</b>\n`;
    teleHtml += `💬 Total Messages: <b>${auditMsgs.length}</b>\n`;
    teleHtml += `🗑️ <b>Deleted Messages:</b> <b>${deletedMsgs.length}</b> ${deletedMsgs.length > 0 ? "⚠️ (Recorded below)" : ""}\n`;
    teleHtml += `📎 Files Shared: <b>${mediaMsgs.length}</b> (${pdfCount} PDFs, ${imgCount} Images)\n`;

    // Deleted Messages Summary in Telegram Message
    if (deletedMsgs.length > 0) {
      teleHtml += `\n🗑️ <b>DELETED MESSAGES FORENSIC TRAIL (${deletedMsgs.length}):</b>\n`;
      deletedMsgs.slice(0, 10).forEach((dm, i) => {
        const delTime = dm.deletedAt ? new Date(dm.deletedAt).toLocaleTimeString("en-IN") : "N/A";
        teleHtml += `[${i + 1}] <b>${escapeHtml(dm.senderName)}</b> (📱 <code>${escapeHtml(dm.senderMobile)}</code>) [Deleted at ${delTime}]:\n`;
        teleHtml += `    <i>Original:</i> "${escapeHtml(dm.originalText || dm.text || "(Media file)")}"`;
        if (dm.fileName) {
          teleHtml += `\n    <i>Attached File:</i> <code>${escapeHtml(dm.fileName)}</code>`;
        }
        teleHtml += `\n`;
      });
      if (deletedMsgs.length > 10) {
        teleHtml += `<i>...and ${deletedMsgs.length - 10} more deleted messages (see attached audit file).</i>\n`;
      }
    }

    // Attachments Summary in Telegram Message
    if (mediaMsgs.length > 0) {
      teleHtml += `\n📎 <b>SHARED FILES & MEDIA (${mediaMsgs.length}):</b>\n`;
      mediaMsgs.slice(0, 10).forEach((att, i) => {
        const sizeMb = (Number(att.fileSize || 0) / (1024 * 1024)).toFixed(2);
        const fileFullUrl = att.fileUrl?.startsWith("http") ? att.fileUrl : `${clientUrl}${att.fileUrl}`;
        const tag = att.type === "pdf" ? "📕 PDF" : att.type === "image" ? "🖼️ IMG" : "📁 FILE";
        const delTag = att.isDeleted ? " [⚠️ DELETED BY USER]" : "";
        teleHtml += `[${i + 1}] ${tag}: <a href="${fileFullUrl}">${escapeHtml(att.fileName || "File")}</a> (${sizeMb} MB)${delTag}\n`;
        teleHtml += `    Shared by: <b>${escapeHtml(att.senderName)}</b> (📱 <code>${escapeHtml(att.senderMobile)}</code>)\n`;
      });
      if (mediaMsgs.length > 10) {
        teleHtml += `<i>...and ${mediaMsgs.length - 10} more files (see attached audit file).</i>\n`;
      }
    }

    teleHtml += `\n🔒 <i>Private Room erased from active server RAM, Firestore & database. Complete unredacted forensic transcript attached.</i>`;

    // 6. Compile Complete Verbatim Forensic Transcript Document (.txt)
    let transcriptText = `================================================================================\n`;
    transcriptText += `🔒 ACADEMIC CLOUD FORENSIC AUDIT TRANSCRIPT: PRIVATE STUDY GROUP\n`;
    transcriptText += `================================================================================\n`;
    transcriptText += `Group Name:             ${room.name}\n`;
    transcriptText += `Room ID:                ${room.id}\n`;
    transcriptText += `Invite Passcode:        ${room.secretCode || "N/A"}\n`;
    transcriptText += `Host / Creator:         ${host.name} (Mobile: ${host.mobile} | Email: ${host.email})\n`;
    transcriptText += `Deletion Mode:          ${deletionModeBadge}\n`;
    transcriptText += `Close Reason:           ${closeReasonFormatted}\n`;
    transcriptText += `Created At:             ${room.createdAt}\n`;
    transcriptText += `Closed At:              ${closedAt}\n`;
    transcriptText += `Active Duration:        ${durationMins} minutes\n`;
    transcriptText += `================================================================================\n\n`;

    transcriptText += `PARTICIPANT MOVEMENT SUMMARY:\n`;
    transcriptText += `--------------------------------------------------------------------------------\n`;
    transcriptText += `Total Users Joined:     ${totalJoinedCount}\n`;
    transcriptText += `Total Users Left:       ${totalLeftCount}\n`;
    transcriptText += `Present at Deletion:    ${totalActiveAtDeletion}\n`;
    transcriptText += `================================================================================\n\n`;

    transcriptText += `PARTICIPANTS ATTENDANCE DIRECTORY (${detailedParticipants.length}):\n`;
    transcriptText += `--------------------------------------------------------------------------------\n`;
    detailedParticipants.forEach((p, idx) => {
      transcriptText += `[#${idx + 1}] Name:     ${p.name} ${p.isCreator ? "[HOST]" : ""} [${p.movementStatus}]\n`;
      transcriptText += `     User ID:  ${p.userId}\n`;
      transcriptText += `     Mobile:   ${p.mobile}\n`;
      transcriptText += `     Email:    ${p.email}\n`;
      transcriptText += `     IP:       ${p.ip}\n`;
      transcriptText += `     College:  ${p.college} | Branch: ${p.branch} | Year: ${p.year}\n`;
      transcriptText += `     Joined:   ${p.firstJoinFormatted}\n`;
      transcriptText += `     Left:     ${p.lastLeaveFormatted}\n`;
      transcriptText += `     Duration: ~${p.durationMins} minutes\n\n`;
    });

    transcriptText += `================================================================================\n`;
    transcriptText += `SHARED ATTACHMENTS & MEDIA (${mediaMsgs.length}):\n`;
    transcriptText += `--------------------------------------------------------------------------------\n`;
    if (mediaMsgs.length === 0) {
      transcriptText += `(No attachments shared in this session)\n\n`;
    } else {
      mediaMsgs.forEach((m, idx) => {
        const fileFullUrl = m.fileUrl?.startsWith("http") ? m.fileUrl : `${clientUrl}${m.fileUrl}`;
        transcriptText += `[#${idx + 1}] ${m.type.toUpperCase()}: ${m.fileName || "File"} (${m.fileSize || 0} bytes)\n`;
        transcriptText += `     Sender:  ${m.senderName} (Mobile: ${m.senderMobile} | Email: ${m.senderEmail} | IP: ${m.senderIp || m.sender?.ip || "N/A"})\n`;
        transcriptText += `     URL:     ${fileFullUrl}\n`;
        transcriptText += `     Status:  ${m.isDeleted ? "⚠️ USER DELETED THIS MESSAGE LATER" : "Active"}\n\n`;
      });
    }

    transcriptText += `================================================================================\n`;
    transcriptText += `DELETED MESSAGES LOG (${deletedMsgs.length}):\n`;
    transcriptText += `--------------------------------------------------------------------------------\n`;
    if (deletedMsgs.length === 0) {
      transcriptText += `(No messages were deleted by users in this session)\n\n`;
    } else {
      deletedMsgs.forEach((dm, idx) => {
        transcriptText += `[#${idx + 1}] Sent At:    ${dm.createdAt}\n`;
        transcriptText += `     Deleted At: ${dm.deletedAt || "N/A"}\n`;
        transcriptText += `     Deleted By: ${dm.deletedBy?.name || dm.senderName} (${dm.deletedBy?.email || ""})\n`;
        transcriptText += `     Sender:     ${dm.senderName} (Mobile: ${dm.senderMobile} | Email: ${dm.senderEmail} | IP: ${dm.senderIp || dm.sender?.ip || "N/A"})\n`;
        transcriptText += `     ORIGINAL UNTAMPERED TEXT:\n`;
        transcriptText += `     "${dm.originalText || dm.text || ""}"\n`;
        if (dm.fileName) {
          transcriptText += `     ORIGINAL FILE: ${dm.fileName} -> ${dm.fileUrl}\n`;
        }
        transcriptText += `\n`;
      });
    }

    transcriptText += `================================================================================\n`;
    transcriptText += `CHRONOLOGICAL AUDIT TRANSCRIPT (COMPLETE & UNREDACTED):\n`;
    transcriptText += `--------------------------------------------------------------------------------\n`;
    auditMsgs.forEach((m) => {
      const timeStr = new Date(m.createdAt).toLocaleTimeString("en-IN");
      const delFlag = m.isDeleted ? ` [⚠️ DELETED BY USER at ${new Date(m.deletedAt || Date.now()).toLocaleTimeString("en-IN")}]` : "";
      const editFlag = m.isEdited ? ` [EDITED]` : "";
      transcriptText += `[${timeStr}] ${m.senderName} (Mobile: ${m.senderMobile} | ${m.senderEmail} | IP: ${m.senderIp || m.sender?.ip || "N/A"})${delFlag}${editFlag}:\n`;
      transcriptText += `  Text: "${m.originalText || m.text || ""}"\n`;
      if (m.isEdited && m.edits && m.edits.length > 0) {
        m.edits.forEach((ed) => {
          transcriptText += `  ↳ Edit History: "${ed.oldText}" ➔ "${ed.newText}" (${ed.editedAt})\n`;
        });
      }
      if (m.fileUrl || m.fileName) {
        const fileFullUrl = m.fileUrl?.startsWith("http") ? m.fileUrl : `${clientUrl}${m.fileUrl}`;
        transcriptText += `  ↳ Attached [${(m.type || "FILE").toUpperCase()}]: ${m.fileName || "File"} (${m.fileSize || 0} bytes)\n`;
        transcriptText += `     Direct Link: ${fileFullUrl}\n`;
      }
      transcriptText += `\n`;
    });
    transcriptText += `================================================================================\n`;
    transcriptText += `END OF FORENSIC AUDIT TRANSCRIPT\n`;

    // 7. Extract ALL current and historical Profile Pictures (DPs) of all room participants
    const participantAvatars = [];
    const seenAvatars = new Set();
    detailedParticipants.forEach((p) => {
      if (p.photoUrl && !seenAvatars.has(p.photoUrl)) {
        seenAvatars.add(p.photoUrl);
        participantAvatars.push({
          userId: p.userId,
          name: p.name,
          username: p.username || "",
          mobile: p.mobile || "N/A",
          photoUrl: p.photoUrl,
          changedAt: "Active Session DP",
        });
      }
      if (Array.isArray(p.avatarHistory)) {
        p.avatarHistory.forEach((hist, hIdx) => {
          if (hist.photoUrl && !seenAvatars.has(hist.photoUrl)) {
            seenAvatars.add(hist.photoUrl);
            participantAvatars.push({
              userId: p.userId,
              name: p.name,
              username: p.username || "",
              mobile: p.mobile || "N/A",
              photoUrl: hist.photoUrl,
              changedAt: hist.changedAt ? new Date(hist.changedAt).toLocaleString("en-IN") : `Previous DP Version #${hIdx + 1}`,
            });
          }
        });
      }
    });

    // 8. Dispatch to Dedicated Telegram Chat Audit Bot & Supergroup
    let telegramDelivered = false;
    try {
      await dispatchChatForensicAudit({
        room,
        teleHtml,
        transcriptText,
        mediaMsgs,
        deletedMsgs,
        participantAvatars,
        chatMediaDir: CHAT_MEDIA_DIR,
        is7DayInactivity: closeReason === "7_day_inactivity_guardian",
      });
      telegramDelivered = true;
    } catch (auditBotErr) {
      console.warn("[CHAT-ARCHIVE] Dedicated chat audit bot dispatch notice:", auditBotErr.message);
    }

    // 8. Permanent Archival in Turso LibSQL Database
    await savePrivateRoomAudit({
      roomId: room.id,
      name: room.name,
      secretCode: room.secretCode,
      createdBy: room.createdBy,
      creatorName: host.name,
      createdAt: room.createdAt,
      closedAt,
      durationMins,
      participantsCount: detailedParticipants.length,
      participantsJson: JSON.stringify(detailedParticipants),
      messagesCount: auditMsgs.length,
      deletedMessagesCount: deletedMsgs.length,
      attachmentsCount: mediaMsgs.length,
      attachmentsJson: JSON.stringify(mediaMsgs),
      transcriptText,
      telegramSent: telegramDelivered ? 1 : 0,
    });

  } catch (err) {
    console.error("[CHAT-ARCHIVE] Fatal archive error:", err.message);
  } finally {
    // 9. COMPLETE PURGE OF PRIVATE ROOM DATA
    console.log(`[CHAT-PURGE] 🧹 Purging private room "${room.name}" (${roomId}) from memory, Firestore & active tables...`);
    activeRooms.delete(roomId);
    activeMessages.delete(roomId);
    roomSockets.delete(roomId);

    if (db) {
      try {
        await db.collection("chat_rooms").doc(roomId).delete();
        const snap = await db.collection("chat_messages").where("roomId", "==", roomId).get();
        if (!snap.empty) {
          const batch = db.batch();
          snap.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (dbErr) {
        console.warn("[CHAT-PURGE] Firestore clean notice:", dbErr.message);
      }
    }

    try {
      await deleteRoomFromTurso(roomId);
    } catch (_) {}

    console.log(`[CHAT-PURGE] ✅ Private room "${room.name}" (${roomId}) purged successfully.`);
  }
}

/**
 * -------------------------------------------------------------
 * 📡 WEBSOCKET REAL-TIME BROADCASTER
 * -------------------------------------------------------------
 */
let wssInstance = null;

function initChatWebSocket(server) {
  wssInstance = new WebSocketServer({ server, path: "/ws/chat" });

  wssInstance.on("connection", async (ws, req) => {
    // Authenticate connecting socket (Query param, httpOnly cookie, DB verification, or Admin bypass)
    let user = null;
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      let token = urlObj.searchParams.get("token") || urlObj.searchParams.get("ticket");

      // Normalize token: Treat "null", "undefined", or empty whitespace strings as null
      if (typeof token === "string") {
        token = token.trim();
        if (token === "null" || token === "undefined" || token === "") {
          token = null;
        }
      }

      // 1. Try token from query param
      if (token) {
        try {
          user = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
          console.warn("[CHAT-WS] Query token verify failed:", jwtErr.message);
        }
      }

      // 2. Fallback: Try httpOnly cookie parser if query token was missing or invalid
      if (!user && req.headers?.cookie) {
        const cookieHeader = req.headers.cookie;
        const match = cookieHeader.match(/(?:^|;\s*)(?:fsm_token|token|vault_token)=([^;]+)/);
        if (match && match[1]) {
          try {
            const cookieToken = decodeURIComponent(match[1].trim());
            user = jwt.verify(cookieToken, JWT_SECRET);
          } catch (cErr) {
            console.warn("[CHAT-WS] Cookie token verify failed:", cErr.message);
          }
        }
      }

      // 3. Admin bypass overrides (Strictly verified and only enabled when ADMIN_BYPASS_KEY is explicitly configured)
      const adminBypassKey = process.env.ADMIN_BYPASS_KEY || process.env.MAINTENANCE_BYPASS_KEY;
      const hasBypassParam = Boolean(
        adminBypassKey &&
        (urlObj.searchParams.get("admin_bypass") === adminBypassKey ||
         req.headers?.["x-admin-bypass"] === adminBypassKey)
      );

      if (!user && hasBypassParam) {
        const clientIp = req.socket?.remoteAddress || "";
        const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.includes("127.0.0.1");

        let verifiedAdminClaims = null;
        if (token) {
          try { verifiedAdminClaims = jwt.verify(token, JWT_SECRET); } catch (_) {}
        }
        const hasAdminClaims = verifiedAdminClaims && (
          verifiedAdminClaims.role === "admin" ||
          verifiedAdminClaims.role === "half_admin" ||
          verifiedAdminClaims.isMainAdmin ||
          (MAIN_ADMIN_EMAIL && verifiedAdminClaims.email?.toLowerCase().trim() === MAIN_ADMIN_EMAIL.toLowerCase().trim())
        );

        if ((isLoopback && hasAdminClaims) || (process.env.ALLOW_INSECURE_ADMIN_BYPASS === "true" && isLoopback)) {
          user = {
            id: verifiedAdminClaims?.id || "admin-root",
            email: verifiedAdminClaims?.email || MAIN_ADMIN_EMAIL,
            name: verifiedAdminClaims?.name || "Administrator",
            role: verifiedAdminClaims?.role || "admin",
            college: verifiedAdminClaims?.college || "FSM Network Hub",
            branch: verifiedAdminClaims?.branch || "Admin Team",
            year: verifiedAdminClaims?.year || "Official",
            permissions: verifiedAdminClaims?.permissions || ["all"],
          };
          console.log(`[CHAT-WS] 🛡️ Authorized Admin WebSocket session established for ${user.email} (${clientIp}).`);
        } else {
          console.warn(`[CHAT-WS] 🚨 Blocked unauthorized admin_bypass attempt from ${clientIp}`);
        }
      }
    } catch (authErr) {
      console.warn("[CHAT-WS] Auth verification notice:", authErr.message);
    }

    if (!user) {
      console.warn(`[CHAT-WS] ⚠️ Unauthorized WebSocket connection rejected (IP: ${req.socket?.remoteAddress})`);
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "UNAUTHORIZED",
            message: "Authentication required. Please sign in to connect to the live student chat.",
          })
        );
        ws.close(1008, "Unauthorized");
      } catch (_) {}
      return;
    }

    // 🔒 Maintenance Mode Guard: Block student WebSocket connections; allow only Administrators
    const isWsAdmin = Boolean(
      user.role === "admin" ||
      user.role === "half_admin" ||
      user.isMainAdmin ||
      (MAIN_ADMIN_EMAIL && user.email === MAIN_ADMIN_EMAIL) ||
      ["admin", "administrator", "root"].includes((user.email || "").toLowerCase().trim())
    );

    if (isMaintenanceActive() && !isWsAdmin) {
      console.warn(`[CHAT-WS] 🛡️ Maintenance active: Rejected student socket connection for ${user.email || user.id}`);
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            maintenance: true,
            message: "Server maintenance mode is active. Real-time chat is paused for students. Only administrators are allowed.",
          })
        );
        ws.close(1008, "Server Maintenance Active");
      } catch (_) {}
      return;
    }

    const clientIp = (
      req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.socket?.remoteAddress ||
      "127.0.0.1"
    ).split(",")[0].trim().replace(/^::ffff:/, "");

    const socketId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    ws.socketId = socketId;
    ws.user = user;
    ws.userIp = clientIp;
    ws.currentRoomId = null;
    ws.isAlive = true;
    ws.connectedAt = Date.now();
    ws.lastInteraction = Date.now();

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (rawMsg) => {
      ws.lastInteraction = Date.now();
      try {
        const data = JSON.parse(rawMsg.toString());
        const { type } = data;

        // 1. JOIN ROOM
        if (type === "join_room") {
          const { roomId, secretCode } = data;
          let room = await getOrRestoreRoom(roomId);

          if (!room) {
            return ws.send(JSON.stringify({ type: "error", message: "Room not found or has been closed." }));
          }

          // 🚫 WhatsApp Rule: If user was removed by group admin, they CANNOT rejoin via invite link or code
          const isUserBanned = room.bannedMembers instanceof Set
            ? room.bannedMembers.has(user.id)
            : Array.isArray(room.bannedMembers) && room.bannedMembers.includes(user.id);

          if (room.isPrivate && isUserBanned) {
            return ws.send(
              JSON.stringify({
                type: "error",
                isRemovedByAdmin: true,
                message: `🚫 You cannot join "${room.name}" because you were removed by the group admin. Only the group admin can add you back.`,
              })
            );
          }

          // 🔒 Secret Code Verification for Private Rooms:
          // 🛡️ STRICT RULE: ONLY MAIN ADMIN can bypass secretCode and enter in Ghost Mode!
          // Other admins (half_admin, sub_admin) and normal users MUST provide the exact secretCode!
          const isMain = isMainAdmin(user);
          if (room.isPrivate && !isMain) {
            const cleanCode = (room.secretCode || "").trim();
            const providedCode = (secretCode || "").trim();
            if (cleanCode && cleanCode !== providedCode) {
              return ws.send(
                JSON.stringify({
                  type: "error",
                  message: "🔒 Private Pod Access Denied: Incorrect Secret Passcode. Only authorized participants with the valid secret key can join.",
                })
              );
            }
          }

          // Leave previous room if any
          if (ws.currentRoomId) {
            handleUserLeaveRoom(ws);
          }

          ws.currentRoomId = roomId;

          // 👻 GHOST / STEALTH MODE: EXCLUSIVELY FOR MAIN ADMIN ONLY!
          // Main Admin enters completely invisible to users (no member increment, no join broadcast, hidden from participants).
          const isStealthAdmin = room.isPrivate && isMain;

          // 👻 STEALTH: Do not increment student members count if Main Admin enters in Ghost Mode
          if (!isStealthAdmin) {
            room.members.add(user.id);
          }

          // Ensure room audit structures exist
          if (!room.auditLog) room.auditLog = [];
          if (!room.auditMessages) room.auditMessages = [];
          if (!room.participantsMap) room.participantsMap = new Map();

          // Fetch enriched user details (including registered mobile from Firestore/Turso)
          const enrichedUser = await enrichParticipantDetails(user.id, {
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            branch: user.branch,
            year: user.year,
            college: user.college,
            role: user.role,
          });
          ws.enrichedUser = enrichedUser;

          // Only add to visible participantsMap if NOT in ghost mode
          if (!isStealthAdmin) {
            room.participantsMap.set(user.id, {
              ...enrichedUser,
              ip: ws.userIp || "127.0.0.1",
              joinedAt: Date.now(),
            });
          }

          // Add to audit log
          room.auditLog.push({
            userId: user.id,
            name: enrichedUser.name,
            email: enrichedUser.email,
            mobile: enrichedUser.mobile,
            branch: enrichedUser.branch,
            year: enrichedUser.year,
            college: enrichedUser.college,
            ip: ws.userIp || "127.0.0.1",
            joinedAt: Date.now(),
            leftAt: null,
          });

          if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Map());
          roomSockets.get(roomId).set(socketId, { ws, user });

          // Send confirmation & history (with isStealth flag for Admin UI)
          const msgs = activeMessages.get(roomId) || [];
          ws.send(
            JSON.stringify({
              type: "room_joined",
              room: {
                id: room.id,
                name: room.name,
                isPrivate: room.isPrivate,
                secretCode: room.secretCode,
                createdBy: room.createdBy,
                creatorName: room.creatorName,
                membersCount: room.members.size,
                isStealth: isStealthAdmin,
                participants: Array.from(room.participantsMap?.values() || []).map((p) => ({
                  id: p.userId,
                  name: p.name,
                  username: p.username || "",
                  photoUrl: p.photoUrl || "",
                  role: p.role || "student",
                })),
              },
              messages: msgs,
              notice: chatNotice,
            })
          );

          // 👻 GHOST MODE CHECK:
          // If Admin enters a private room, DO NOT broadcast presence update to regular students!
          // Regular students will NEVER know that Admin is inside the room.
          if (!isStealthAdmin) {
            broadcastToRoom(roomId, {
              type: "presence_update",
              roomId,
              membersCount: room.members.size,
              userJoined: {
                id: user.id,
                name: enrichedUser.name,
                username: enrichedUser.username || "",
                photoUrl: enrichedUser.photoUrl || "",
                role: enrichedUser.role || "student",
              },
            });
          }
        }

        // 2. SEND MESSAGE
        else if (type === "send_message") {
          const roomId = data.roomId || ws.currentRoomId;
          if (!roomId) return;

          // Check if user is blocked
          if (blockedUsers.has(user.id)) {
            return ws.send(
              JSON.stringify({
                type: "error",
                message: "You have been restricted from participating in chat by the Administrator.",
              })
            );
          }

          const { text, messageType = "text", fileUrl, fileName, fileSize, replyTo, noteData, audioDuration } = data;
          if (!text && !fileUrl && !noteData) return;

          // Clean XSS injection
          const sanitizedText = (text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

          const currentRoom = activeRooms.get(roomId);
          const pInfo = currentRoom?.participantsMap?.get(user.id) || {};
          let resolvedEmail = pInfo.email || ws.enrichedUser?.email || user.email || "";
          let resolvedMobile = pInfo.mobile || ws.enrichedUser?.mobile || (user.mobile ? decrypt(user.mobile) : "") || "";
          if (!resolvedEmail || !resolvedMobile || resolvedMobile === "N/A") {
            try {
              const freshlyEnriched = await enrichParticipantDetails(user.id, user);
              ws.enrichedUser = freshlyEnriched;
              if (!resolvedEmail) resolvedEmail = freshlyEnriched.email || "";
              if (!resolvedMobile || resolvedMobile === "N/A") resolvedMobile = freshlyEnriched.mobile || "";
            } catch (_) {}
          }

          const newMsg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            roomId,
            text: sanitizedText,
            type: messageType,
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileSize: fileSize || null,
            replyTo: replyTo || null, // { id, text, senderName, type }
            noteData: noteData || null, // { id, title, subject, branch, year, fileSize, fileUrl }
            audioDuration: audioDuration || null,
            reactions: {}, // e.g. { "❤️": ["uid1", "uid2"] }
            status: "delivered", // "sent" | "delivered" | "read"
            readBy: [user.id],
            sender: {
              id: user.id,
              name: user.name || "Scholar",
              username: pInfo.username || user.username || "",
              photoUrl: pInfo.photoUrl || user.photoUrl || user.avatar || "",
              email: resolvedEmail || user.email || "",
              branch: user.branch || "CSE",
              year: user.year || "B.Tech",
              college: user.college || "Campus",
              role: user.role || "student",
              isAdmin: isUserAdmin(user),
              ip: ws.userIp || "127.0.0.1",
            },
            ip: ws.userIp || "127.0.0.1",
            createdAt: new Date().toISOString(),
            isEdited: false,
            isDeleted: false,
          };

          if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
          const msgs = activeMessages.get(roomId);
          msgs.push(newMsg);
          if (msgs.length > 200) msgs.shift();

          // 🔒 Record complete, untampered snapshot into room's auditMessages (Capped at 500 to prevent memory leaks)
          if (currentRoom) {
            if (!currentRoom.auditMessages) currentRoom.auditMessages = [];
            currentRoom.auditMessages.push({
              id: newMsg.id,
              roomId,
              senderId: user.id,
              senderName: user.name || "Scholar",
              senderEmail: resolvedEmail || user.email || "",
              senderMobile: resolvedMobile || "N/A",
              senderBranch: user.branch || "CSE",
              senderYear: user.year || "B.Tech",
              senderRole: user.role || "student",
              senderIp: ws.userIp || "127.0.0.1",
              ip: ws.userIp || "127.0.0.1",
              text: sanitizedText,
              originalText: sanitizedText, // NEVER OVERWRITTEN ON DELETE!
              type: messageType,
              fileUrl: fileUrl || null,    // NEVER CLEARED ON DELETE!
              fileName: fileName || null,
              fileSize: fileSize || null,
              createdAt: newMsg.createdAt,
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              isEdited: false,
              edits: [],
            });
            if (currentRoom.auditMessages.length > 500) {
              currentRoom.auditMessages.shift();
            }
          }

          // Broadcast to everyone in room
          broadcastToRoom(roomId, {
            type: "new_message",
            message: newMsg,
          });

          const senderMeta = {
            email: resolvedEmail || "N/A",
            mobile: resolvedMobile || "N/A",
          };

          // 💬 Direct Two-Way Sync with @fsm_chat_bot for Public Hall
          if (roomId === PUBLIC_ROOM_ID) {
            dispatchPublicChatMessageToTelegram({
              message: newMsg,
              senderMeta,
              chatMediaDir: CHAT_MEDIA_DIR,
            }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Public send dispatch notice:", err.message));
          } else {
            // 🔒 Private Study Pod / Group: Real-time Dispatch to Telegram (@fsm_chat_bot & Topic 31)
            dispatchPrivateChatMessageToTelegram({
              message: newMsg,
              room: currentRoom,
              senderMeta,
              chatMediaDir: CHAT_MEDIA_DIR,
            }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Private pod message dispatch notice:", err.message));

            // 🔒 Private Chat Media Vault (Topic 33): Real-time vaulting for PDF, IMG, Documents
            if (newMsg.fileUrl || ["pdf", "image", "document", "audio"].includes(newMsg.type)) {
              dispatchPrivateMediaToTelegramVault({
                message: newMsg,
                room: currentRoom,
                chatMediaDir: CHAT_MEDIA_DIR,
                sender: { ...user, email: resolvedEmail || user.email, mobile: resolvedMobile || "N/A", ip: ws.userIp },
              }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Private media vault dispatch notice:", err.message));
            }
          }

          // Update lastActivity for private pod
          if (currentRoom && currentRoom.isPrivate) {
            currentRoom.lastActivity = new Date().toISOString();
            if (db) {
              db.collection("chat_rooms").doc(roomId).set({ lastActivity: currentRoom.lastActivity }, { merge: true }).catch(() => {});
            }
          }

          // Commit to Firestore asynchronously
          if (db) {
            db.collection("chat_messages").doc(newMsg.id).set(newMsg).catch(() => {});
          }

          // Mirror to Turso LibSQL Cloud
          recordChatMessageToTurso(newMsg).catch(() => {});
          bufferChatMessage(newMsg).catch(() => {});
        }

        // 3. EDIT MESSAGE
        else if (type === "edit_message") {
          const { messageId, newText } = data;
          const roomId = ws.currentRoomId;
          if (!roomId || !messageId) return;

          const currentRoom = activeRooms.get(roomId);
          const msgs = activeMessages.get(roomId) || [];
          const msg = msgs.find((m) => m.id === messageId);

          if (!msg) return;
          if (msg.sender.id !== user.id && !isUserAdmin(user)) {
            return ws.send(JSON.stringify({ type: "error", message: "Cannot edit another user's message." }));
          }

          const previousText = msg.text;
          const sanitizedNewText = (newText || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

          // Track edit history in room's auditMessages
          if (currentRoom && currentRoom.auditMessages) {
            const auditMsg = currentRoom.auditMessages.find((m) => m.id === messageId);
            if (auditMsg) {
              if (!auditMsg.edits) auditMsg.edits = [];
              auditMsg.edits.push({
                oldText: auditMsg.text,
                newText: sanitizedNewText,
                editedAt: new Date().toISOString(),
              });
              auditMsg.text = sanitizedNewText;
              auditMsg.isEdited = true;
            }
          }

          msg.text = sanitizedNewText;
          msg.isEdited = true;
          msg.editedAt = new Date().toISOString();

          broadcastToRoom(roomId, {
            type: "message_edited",
            messageId,
            newText: msg.text,
            editedAt: msg.editedAt,
          });

          // 💬 Dispatch edit to @fsm_chat_bot for Public Hall
          if (roomId === PUBLIC_ROOM_ID) {
            const editPInfo = currentRoom?.participantsMap?.get(user.id) || ws.enrichedUser || {};
            dispatchPublicChatEditToTelegram({
              messageId,
              oldText: previousText,
              newText: sanitizedNewText,
              sender: {
                ...user,
                email: editPInfo.email || user.email || "N/A",
                mobile: editPInfo.mobile || (user.mobile ? decrypt(user.mobile) : "") || "N/A",
                ip: ws.userIp,
              },
            }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Public edit dispatch notice:", err.message));
          }

          if (currentRoom && currentRoom.isPrivate) {
            currentRoom.lastActivity = new Date().toISOString();
          }

          if (db) {
            db.collection("chat_messages").doc(messageId).update({
              text: msg.text,
              isEdited: true,
              editedAt: msg.editedAt,
            }).catch(() => {});
          }
        }

        // 4. DELETE MESSAGE (Untampered original preserved in Audit Trail)
        else if (type === "delete_message") {
          const { messageId } = data;
          const roomId = ws.currentRoomId;
          if (!roomId || !messageId) return;

          const currentRoom = activeRooms.get(roomId);
          const msgs = activeMessages.get(roomId) || [];
          const msg = msgs.find((m) => m.id === messageId);

          if (!msg) return;
          if (msg.sender.id !== user.id && !isUserAdmin(user)) {
            return ws.send(JSON.stringify({ type: "error", message: "Cannot delete another user's message." }));
          }

          let deletedSnapshot = null;
          // 🔒 In room.auditMessages, preserve originalText and media links while marking as deleted
          if (currentRoom && currentRoom.auditMessages) {
            const auditMsg = currentRoom.auditMessages.find((m) => m.id === messageId);
            if (auditMsg) {
              auditMsg.isDeleted = true;
              auditMsg.deletedAt = new Date().toISOString();
              auditMsg.deletedBy = {
                id: user.id,
                name: user.name || (isUserAdmin(user) ? "Administrator" : "Student"),
                role: user.role || (user.isMainAdmin ? "admin" : "student"),
                email: user.email || "",
                mobile: currentRoom.participantsMap?.get(user.id)?.mobile || ws.enrichedUser?.mobile || (user.mobile ? decrypt(user.mobile) : "") || "N/A",
                ip: ws.userIp || "127.0.0.1",
              };
              deletedSnapshot = auditMsg;
              console.log(`[CHAT-AUDIT] 🗑️ Message "${messageId}" deleted by ${user.name}. Original text and media preserved for Admin Report.`);
            }
          }

          const originalUntamperedText = (deletedSnapshot?.originalText) || (msg.text !== "🗑️ This message was deleted" ? msg.text : null) || msg.originalText || "(Media Attachment)";
          const originalUntamperedFileName = deletedSnapshot?.fileName || msg.fileName;

          msg.isDeleted = true;
          msg.text = "🗑️ This message was deleted";
          msg.fileUrl = null;

          broadcastToRoom(roomId, {
            type: "message_deleted",
            messageId,
            text: msg.text,
          });

          // 💬 Dispatch deleted message alert to @fsm_chat_bot for Public Hall
          if (roomId === PUBLIC_ROOM_ID) {
            const delPInfo = currentRoom?.participantsMap?.get(user.id) || ws.enrichedUser || {};
            dispatchPublicChatDeleteToTelegram({
              messageId,
              originalText: originalUntamperedText,
              fileName: originalUntamperedFileName,
              sender: {
                ...user,
                email: delPInfo.email || user.email || "N/A",
                mobile: delPInfo.mobile || (user.mobile ? decrypt(user.mobile) : "") || "N/A",
                ip: ws.userIp,
              },
            }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Public delete dispatch notice:", err.message));
          }

          if (currentRoom && currentRoom.isPrivate) {
            currentRoom.lastActivity = new Date().toISOString();
          }

          if (db) {
            db.collection("chat_messages").doc(messageId).update({
              isDeleted: true,
              text: msg.text,
              fileUrl: null,
            }).catch(() => {});
          }
        }

        // 4b. ADMIN BULK PURGE: DELETE ALL MESSAGES BY A SPECIFIC USER
        else if (type === "delete_user_messages") {
          const { targetUserId } = data;
          const roomId = data.roomId || ws.currentRoomId;
          if (!roomId || !targetUserId) return;

          if (!isUserAdmin(user)) {
            return ws.send(
              JSON.stringify({
                type: "error",
                message: "Permission denied: Only administrators can delete all messages of a user.",
              })
            );
          }

          const msgs = activeMessages.get(roomId) || [];
          const remaining = [];
          const deletedList = [];
          msgs.forEach((m) => {
            if (m.sender?.id === targetUserId) {
              deletedList.push(m);
            } else {
              remaining.push(m);
            }
          });
          activeMessages.set(roomId, remaining);

          // Broadcast removal to all sockets in room
          broadcastToRoom(roomId, {
            type: "user_messages_purged",
            roomId,
            targetUserId,
            deletedCount: deletedList.length,
            purgedBy: { id: user.id, name: user.name },
          });

          // Delete from Firestore
          if (db) {
            db.collection("chat_messages")
              .where("roomId", "==", roomId)
              .where("sender.id", "==", targetUserId)
              .get()
              .then((snap) => {
                if (!snap.empty) {
                  const batch = db.batch();
                  snap.forEach((d) => batch.delete(d.ref));
                  return batch.commit();
                }
              })
              .catch(() => {});
          }

          // Delete from Turso LibSQL Cloud
          try {
            getTursoClient()
              .execute({
                sql: "DELETE FROM chat_messages WHERE room_id = ? AND sender_id = ?",
                args: [roomId, targetUserId],
              })
              .catch(() => {});
          } catch (_) {}

          // Dispatch audit alert to Telegram Supergroup
          const roomObj = activeRooms.get(roomId);
          dispatchChatPurgeAlertToTelegram({
            roomId,
            roomName: roomObj?.name || (roomId === PUBLIC_ROOM_ID ? "💬 Public Community Chat" : roomId),
            admin: { ...user, ip: ws.userIp },
            details: `All ${deletedList.length} messages by user (ID: ${targetUserId}) were purged by Admin ${user.name}.`,
          }).catch(() => {});

          console.log(`[CHAT-ADMIN] 🗑️ Admin ${user.name} purged all ${deletedList.length} messages by user ${targetUserId} in room ${roomId}.`);
        }

        // 4c. RENAME ROOM (Host or Admin only)
        else if (type === "rename_room") {
          const { roomId, newName } = data;
          const targetRoomId = roomId || ws.currentRoomId;
          if (!targetRoomId || !newName || !newName.trim()) {
            return ws.send(JSON.stringify({ type: "error", message: "Please provide a valid room name." }));
          }

          const currentRoom = await getOrRestoreRoom(targetRoomId);
          if (!currentRoom || !currentRoom.isPrivate) {
            return ws.send(JSON.stringify({ type: "error", message: "Private room not found or already closed." }));
          }

          const isCreator = currentRoom.createdBy === user.id;
          const isAdmin = isUserAdmin(user) || isMainAdmin(user);

          if (!isCreator && !isAdmin) {
            return ws.send(
              JSON.stringify({
                type: "error",
                message: "Permission denied. Only the host who created this private room or an admin can rename it.",
              })
            );
          }

          const sanitizedNewName = newName.trim().slice(0, 60);
          const oldName = currentRoom.name;
          currentRoom.name = sanitizedNewName;
          currentRoom.lastActivity = new Date().toISOString();

          // Update in Firestore
          if (db) {
            db.collection("chat_rooms").doc(targetRoomId).update({
              name: sanitizedNewName,
              lastActivity: currentRoom.lastActivity,
            }).catch((err) => console.warn("[CHAT-RENAME] Firestore update error:", err.message));
          }

          // Update in Turso LibSQL
          try {
            if (tursoClient) {
              tursoClient.execute({
                sql: "UPDATE chat_rooms SET name = ? WHERE id = ?",
                args: [sanitizedNewName, targetRoomId],
              }).catch(() => {});
            }
          } catch (_) {}

          // Insert system message into room history
          const renameSysMsg = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            roomId: targetRoomId,
            text: `✏️ ${user.name || "Host"} renamed the group to "${sanitizedNewName}".`,
            type: "text",
            sender: {
              id: "system",
              name: "System",
              role: "system",
            },
            createdAt: new Date().toISOString(),
            isSystem: true,
          };
          if (!activeMessages.has(targetRoomId)) activeMessages.set(targetRoomId, []);
          const msgs = activeMessages.get(targetRoomId);
          msgs.push(renameSysMsg);
          if (msgs.length > 200) msgs.shift();

          // Broadcast rename event and system message to all participants in this room
          broadcastToRoom(targetRoomId, {
            type: "room_renamed",
            roomId: targetRoomId,
            newName: sanitizedNewName,
            oldName,
            renamedBy: { id: user.id, name: user.name },
          });

          broadcastToRoom(targetRoomId, {
            type: "new_message",
            message: renameSysMsg,
          });

          console.log(`[CHAT-POD] ✏️ Room ${targetRoomId} renamed from "${oldName}" to "${sanitizedNewName}" by ${user.name}`);

          dispatchGroupAuditEventToTelegram({
            eventType: "group_renamed",
            room: currentRoom,
            actor: user,
            oldName,
            newName: sanitizedNewName,
            ip: ws.userIp,
          }).catch((err) => console.warn("[CHAT-AUDIT-BOT] WS rename group dispatch notice:", err.message));
        }

        // 5. EXPLICIT DELETE/CLOSE ROOM (Host or Admin only - Permanently deletes room for everyone)
        else if (type === "close_room" || type === "delete_room") {
          const roomId = data.roomId || ws.currentRoomId;
          const currentRoom = await getOrRestoreRoom(roomId);
          if (!currentRoom || !currentRoom.isPrivate) return;

          const isCreator = currentRoom.createdBy === user.id;
          const isAdmin = isUserAdmin(user) || isMainAdmin(user);

          if (!isCreator && !isAdmin) {
            return ws.send(
              JSON.stringify({
                type: "error",
                message: "Permission denied. Only the creator or admin can delete this private chat.",
              })
            );
          }

          console.log(`[CHAT-POD] 🛑 Private room "${currentRoom.name}" explicitly deleted by ${user.name} (${user.id}).`);

          // Notify all sockets in this room that room is closed and purged
          broadcastToRoom(roomId, {
            type: "room_closed",
            roomId,
            closedBy: { id: user.id, name: user.name },
            message: `Private group "${currentRoom.name}" was permanently deleted by ${user.name}. All messages have been permanently deleted.`,
          });

          // Detach all sockets and switch them to public
          const roomMap = roomSockets.get(roomId);
          if (roomMap) {
            roomMap.forEach(({ ws: memberWs }) => {
              memberWs.currentRoomId = "public";
            });
          }

          // Trigger full archive to Telegram + Turso, and purge from RAM & Firestore
          await archiveAndPurgePrivateRoom(currentRoom, "closed_by_user", { ...user, ip: ws.userIp });
        }

        // 5b. LEAVE ROOM (Non-creator participants leave room; room stays alive for host)
        else if (type === "leave_room") {
          const roomId = data.roomId || ws.currentRoomId;
          const currentRoom = await getOrRestoreRoom(roomId);
          if (!currentRoom || !currentRoom.isPrivate) return;

          const isCreator = currentRoom.createdBy === user.id;
          if (isCreator) {
            return ws.send(
              JSON.stringify({
                type: "error",
                message: "As the host, you cannot leave. You can delete this private chat to close it.",
              })
            );
          }

          // Remove user from room members
          if (currentRoom.members instanceof Set) {
            currentRoom.members.delete(user.id);
          } else if (Array.isArray(currentRoom.members)) {
            currentRoom.members = currentRoom.members.filter((uid) => uid !== user.id);
          }

          if (currentRoom.participantsMap) {
            currentRoom.participantsMap.delete(user.id);
          }

          // Detach user socket from this room and switch to public
          const roomMap = roomSockets.get(roomId);
          if (roomMap) {
            roomMap.delete(ws.socketId);
          }
          ws.currentRoomId = "public";

          // Confirm to leaving user
          ws.send(
            JSON.stringify({
              type: "left_room_success",
              roomId,
              message: `You left "${currentRoom.name}".`,
            })
          );

          // Broadcast departure & updated participant count to remaining members
          const remainingCount = currentRoom.members instanceof Set ? currentRoom.members.size : (currentRoom.members?.length || 0);
          broadcastToRoom(roomId, {
            type: "presence_update",
            roomId,
            membersCount: remainingCount,
            userLeft: { id: user.id, name: user.name },
          });

          // Insert system message into room history
          const leaveSysMsg = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            roomId,
            text: `👋 ${user.name} has left the chat.`,
            type: "text",
            sender: {
              id: "system",
              name: "System",
              role: "system",
            },
            createdAt: new Date().toISOString(),
            isSystem: true,
          };
          if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
          const msgs = activeMessages.get(roomId);
          msgs.push(leaveSysMsg);
          if (msgs.length > 200) msgs.shift();

          broadcastToRoom(roomId, {
            type: "new_message",
            message: leaveSysMsg,
          });

          console.log(`[CHAT-POD] 🚪 Member ${user.name} (${user.id}) left private room "${currentRoom.name}". Room remains active for host.`);
        }

        // 5. REACT TO MESSAGE (Instagram / WhatsApp Double-Tap & Emoji Tray)
        else if (type === "react_message") {
          const { messageId, emoji } = data;
          const roomId = ws.currentRoomId;
          if (!roomId || !messageId || !emoji) return;

          const msgs = activeMessages.get(roomId) || [];
          const msg = msgs.find((m) => m.id === messageId);
          if (!msg || msg.isDeleted) return;

          if (!msg.reactions || typeof msg.reactions !== "object") {
            msg.reactions = {};
          }
          if (!Array.isArray(msg.reactions[emoji])) {
            msg.reactions[emoji] = [];
          }

          const uIndex = msg.reactions[emoji].indexOf(user.id);
          if (uIndex > -1) {
            // Toggle off
            msg.reactions[emoji].splice(uIndex, 1);
            if (msg.reactions[emoji].length === 0) {
              delete msg.reactions[emoji];
            }
          } else {
            // Toggle on
            msg.reactions[emoji].push(user.id);
          }

          broadcastToRoom(roomId, {
            type: "message_reaction",
            messageId,
            reactions: msg.reactions,
          });

          if (db) {
            db.collection("chat_messages").doc(messageId).update({
              reactions: msg.reactions,
            }).catch(() => {});
          }
        }

        // 6. MARK MESSAGES AS READ (WhatsApp Blue Double Tick)
        else if (type === "mark_read") {
          const roomId = ws.currentRoomId;
          if (!roomId) return;

          const msgs = activeMessages.get(roomId) || [];
          const updatedIds = [];

          msgs.forEach((m) => {
            if (m.sender?.id !== user.id) {
              if (!m.readBy) m.readBy = [];
              if (!m.readBy.includes(user.id)) {
                m.readBy.push(user.id);
                m.status = "read";
                updatedIds.push(m.id);
              }
            }
          });

          if (updatedIds.length > 0) {
            broadcastToRoom(roomId, {
              type: "messages_read",
              roomId,
              readerId: user.id,
              messageIds: updatedIds,
            });
          }
        }

        // 7. TYPING INDICATOR
        else if (type === "typing") {
          const roomId = ws.currentRoomId;
          if (!roomId) return;
          broadcastToRoom(
            roomId,
            {
              type: "user_typing",
              user: { id: user.id, name: user.name },
            },
            socketId
          );
        }
      } catch (err) {
        console.warn("[CHAT-WS] Message handle notice:", err.message);
      }
    });

    ws.on("close", () => {
      handleUserLeaveRoom(ws);
    });

    ws.on("error", () => {
      handleUserLeaveRoom(ws);
    });
  });

  // Heartbeat & 30-Minute Idle Inactivity Guardian (every 30s)
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout
  setInterval(() => {
    if (!wssInstance) return;
    const now = Date.now();
    wssInstance.clients.forEach((ws) => {
      if (!ws.isAlive) {
        handleUserLeaveRoom(ws);
        return ws.terminate();
      }

      // Check 30-minute idle inactivity for all rooms (public and private)
      const lastActive = ws.lastInteraction || ws.connectedAt || now;
      if (now - lastActive > INACTIVITY_TIMEOUT_MS) {
        try {
          ws.send(
            JSON.stringify({
              type: "session_timeout",
              message: "Disconnected due to 30 minutes of inactivity. Please reopen chat to reconnect.",
            })
          );
        } catch (_) {}

        const roomObj = activeRooms.get(ws.currentRoomId || "public");
        const roomLabel = roomObj ? roomObj.name : (ws.currentRoomId === "public" ? "🏛️ General Student Hall" : (ws.currentRoomId || "General"));

        // 📡 Dispatch Inactivity Timeout Report directly to Admin Telegram Bot & Optional Supergroup
        dispatchChatPresenceAlertToTelegram({
          event: "INACTIVITY_TIMEOUT",
          user: { ...(ws.user || {}), ip: ws.userIp },
          roomId: ws.currentRoomId || "public",
          roomName: roomLabel,
          details: "Student session timed out after 30 minutes of continuous idle inactivity in chat.",
        }).catch(() => {});

        handleUserLeaveRoom(ws);
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log("[CHAT] ⚡ Real-Time WebSocket Server registered at /ws/chat");
}

function broadcastToRoom(roomId, payload, excludeSocketId = null) {
  const roomMap = roomSockets.get(roomId);
  if (!roomMap) return;

  const dataStr = JSON.stringify(payload);
  roomMap.forEach(({ ws }, sockId) => {
    if (sockId !== excludeSocketId && ws.readyState === WebSocket.OPEN) {
      ws.send(dataStr);
    }
  });
}

function handleUserLeaveRoom(ws) {
  const roomId = ws.currentRoomId;
  if (!roomId) return;

  const room = activeRooms.get(roomId);
  const roomMap = roomSockets.get(roomId);

  if (roomMap) {
    roomMap.delete(ws.socketId);
  }

  if (room) {
    // Check if user has no other open tabs in this room
    let userHasOtherTab = false;
    if (roomMap) {
      roomMap.forEach(({ user }) => {
        if (user.id === ws.user.id) userHasOtherTab = true;
      });
    }

    if (!userHasOtherTab) {
      const isStealthAdmin = room.isPrivate && isMainAdmin(ws.user);

      // Update audit log for this user
      if (room.auditLog) {
        const lastEntry = [...room.auditLog].reverse().find((a) => a.userId === ws.user.id && !a.leftAt);
        if (lastEntry) lastEntry.leftAt = Date.now();
      }

      // 👻 GHOST MODE CHECK:
      // If Main Admin leaves a private room, DO NOT broadcast departure to regular students!
      if (!isStealthAdmin) {
        const onlineCount = roomSockets.get(roomId)?.size || 0;
        broadcastToRoom(roomId, {
          type: "presence_update",
          roomId,
          membersCount: onlineCount,
          userLeft: { id: ws.user.id, name: ws.user.name },
        });

        // 🚨 0 USER AUTO-PURGE CHECK:
        // When all participants leave a private pod (0 active members remaining), trigger auto-purge archive to Topic 31!
        if (room.isPrivate && onlineCount === 0) {
          console.log(`[CHAT-POD] 🚪 0 members remaining in private pod "${room.name}" (${roomId}). Scheduling auto-purge report to Topic 31...`);
          setTimeout(async () => {
            const currentCount = roomSockets.get(roomId)?.size || 0;
            if (currentCount === 0 && activeRooms.has(roomId)) {
              console.log(`[CHAT-POD] ⏰ Auto-purging empty private pod "${room.name}" (${roomId}) [0 Members]...`);
              await archiveAndPurgePrivateRoom(room, "zero_members").catch((err) => {
                console.warn(`[CHAT-POD] Auto-purge error for 0-member pod:`, err.message);
              });
            }
          }, 4000);
        }
      }
    }
  }

  ws.currentRoomId = null;
}

/**
 * -------------------------------------------------------------
 * 🌐 REST API ENDPOINTS
 * -------------------------------------------------------------
 */

// Serve chat media attachments
router.use("/media", express.static(CHAT_MEDIA_DIR, { maxAge: "2d", immutable: true }));

/**
 * ALL /api/chat/ws-token
 * Generates an ephemeral WebSocket access token for the authenticated student or admin
 */
router.all("/ws-token", authenticateToken, async (req, res) => {
  try {
    const authUser = req.user;

    if (!authUser || !authUser.id) {
      return res.status(401).json({ success: false, message: "Authentication required. Please sign in to connect to the live student chat." });
    }

    const wsToken = jwt.sign(
      {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role || "student",
        college: authUser.college,
        branch: authUser.branch,
        year: authUser.year,
        permissions: authUser.permissions || [],
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    // Refresh auth cookie too so all ongoing API requests stay active
    try {
      if (typeof setAuthCookie === "function") {
        setAuthCookie(res, req, wsToken);
      }
    } catch (_) {}

    return res.json({ success: true, token: wsToken });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/rooms
 * Returns all accessible rooms (Public Hall + Private Pods)
 */
router.get("/rooms", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const isMain = isMainAdmin(user);
    const isAdmin = isUserAdmin(user);

    const roomsList = [];
    activeRooms.forEach((room) => {
      // 🛡️ STRICT PRIVACY ENFORCEMENT:
      // Only Main Admin sees all rooms; other users/admins see public room, or rooms they created, or rooms they joined!
      const isMember = room.members instanceof Set ? room.members.has(user.id) : Array.isArray(room.members) ? room.members.includes(user.id) : false;
      const isCreator = room.createdBy === user.id;

      if (!room.isPrivate || isMain || isCreator || isMember) {
        roomsList.push({
          id: room.id,
          name: room.name,
          description: room.description,
          isPrivate: room.isPrivate,
          createdBy: room.createdBy,
          creatorName: room.creatorName,
          // Only Main Admin or Room Creator sees the secretCode! Other admins and users NEVER see secretCode!
          secretCode: (isMain || isCreator) ? room.secretCode : undefined,
          membersCount: room.members instanceof Set ? room.members.size : Array.isArray(room.members) ? room.members.length : 0,
          createdAt: room.createdAt,
        });
      }
    });

    return res.json({
      success: true,
      rooms: roomsList,
      notice: chatNotice,
      isBlocked: blockedUsers.has(user.id),
      blockedUserIds: isAdmin ? Array.from(blockedUsers) : undefined,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/create
 * Creates a new Private Study Pod with Secret Key
 */
router.post("/rooms/create", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { name, secretCode, description } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Please provide a room name." });
    }

    const roomId = `pod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const finalCode = (secretCode || Math.random().toString(36).slice(2, 8).toUpperCase()).trim();

    const newRoom = {
      id: roomId,
      name: name.trim(),
      description: (description || `Private study pod created by ${user.name}`).trim(),
      isPrivate: true,
      secretCode: finalCode,
      createdBy: user.id,
      creatorName: user.name,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      members: new Set([user.id]),
      bannedMembers: new Set(),
      auditLog: [],
      auditMessages: [],
      participantsMap: new Map(),
    };

    activeRooms.set(roomId, newRoom);
    activeMessages.set(roomId, []);
    roomSockets.set(roomId, new Map());

    if (db) {
      db.collection("chat_rooms").doc(roomId).set({
        name: newRoom.name,
        description: newRoom.description,
        isPrivate: true,
        secretCode: newRoom.secretCode,
        createdBy: user.id,
        creatorName: user.name,
        createdAt: newRoom.createdAt,
        lastActivity: newRoom.lastActivity,
        bannedMembers: [],
      }).catch(() => {});
    }

    dispatchGroupAuditEventToTelegram({
      eventType: "group_created",
      room: newRoom,
      actor: user,
      ip: getClientIp(req),
    }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Create group dispatch notice:", err.message));

    return res.json({
      success: true,
      message: `Private Study Group "${newRoom.name}" created successfully!`,
      room: {
        id: newRoom.id,
        name: newRoom.name,
        isPrivate: true,
        secretCode: newRoom.secretCode,
        createdBy: newRoom.createdBy,
        creatorName: newRoom.creatorName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/rename
 * Renames a Private Study Pod (Host or Admin only)
 */
router.post("/rooms/rename", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId, newName } = req.body || {};

    if (!roomId) {
      return res.status(400).json({ success: false, message: "Room ID is required." });
    }
    if (!newName || !newName.trim()) {
      return res.status(400).json({ success: false, message: "Please provide a valid room name." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only the room creator or an admin can rename this private room.",
      });
    }

    const sanitizedNewName = newName.trim().slice(0, 60);
    const oldName = room.name;
    room.name = sanitizedNewName;
    room.lastActivity = new Date().toISOString();

    // Update in Firestore
    if (db) {
      db.collection("chat_rooms").doc(roomId).update({
        name: sanitizedNewName,
        lastActivity: room.lastActivity,
      }).catch((err) => console.warn("[CHAT-RENAME] Firestore update error:", err.message));
    }

    // Update in Turso LibSQL
    try {
      if (tursoClient) {
        tursoClient.execute({
          sql: "UPDATE chat_rooms SET name = ? WHERE id = ?",
          args: [sanitizedNewName, roomId],
        }).catch(() => {});
      }
    } catch (_) {}

    // Add system message into room history
    const renameSysMsg = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      text: `✏️ ${user.name || "Host"} renamed the group to "${sanitizedNewName}".`,
      type: "text",
      sender: {
        id: "system",
        name: "System",
        role: "system",
      },
      createdAt: new Date().toISOString(),
      isSystem: true,
    };
    if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
    const msgs = activeMessages.get(roomId);
    msgs.push(renameSysMsg);
    if (msgs.length > 200) msgs.shift();

    // Broadcast rename event and system message to all participants in this room
    broadcastToRoom(roomId, {
      type: "room_renamed",
      roomId,
      newName: sanitizedNewName,
      oldName,
      renamedBy: { id: user.id, name: user.name },
    });

    broadcastToRoom(roomId, {
      type: "new_message",
      message: renameSysMsg,
    });

    console.log(`[CHAT-POD] ✏️ Room ${roomId} renamed from "${oldName}" to "${sanitizedNewName}" by ${user.name} via API`);

    dispatchGroupAuditEventToTelegram({
      eventType: "group_renamed",
      room,
      actor: user,
      oldName,
      newName: sanitizedNewName,
      ip: getClientIp(req),
    }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Rename group dispatch notice:", err.message));

    return res.json({
      success: true,
      message: `Room renamed to "${sanitizedNewName}" successfully!`,
      room: {
        id: room.id,
        name: room.name,
        isPrivate: true,
        secretCode: room.secretCode,
        createdBy: room.createdBy,
        creatorName: room.creatorName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/reset-link
 * Reset invite code/link for a private study group (Host or Main Admin only)
 */
router.post("/rooms/reset-link", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ success: false, message: "Room ID is required." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only the room creator or an administrator can reset this group's invite link.",
      });
    }

    const oldCode = room.secretCode;
    const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    room.secretCode = newCode;
    room.lastActivity = new Date().toISOString();

    if (db) {
      db.collection("chat_rooms").doc(roomId).update({
        secretCode: newCode,
        lastActivity: room.lastActivity,
      }).catch((err) => console.warn("[CHAT-RESET-LINK] Firestore update error:", err.message));
    }

    try {
      if (tursoClient) {
        tursoClient.execute({
          sql: "UPDATE chat_rooms SET secretCode = ? WHERE id = ?",
          args: [newCode, roomId],
        }).catch(() => {});
      }
    } catch (_) {}

    // System message
    const resetSysMsg = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      text: `🔄 ${user.name || "Host"} reset the group invite link. Previous links and secret codes will no longer work.`,
      type: "text",
      sender: {
        id: "system",
        name: "System",
        role: "system",
      },
      createdAt: new Date().toISOString(),
      isSystem: true,
    };
    if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
    const msgs = activeMessages.get(roomId);
    msgs.push(resetSysMsg);
    if (msgs.length > 200) msgs.shift();

    broadcastToRoom(roomId, {
      type: "room_link_reset",
      roomId,
      newSecretCode: newCode,
      resetBy: { id: user.id, name: user.name },
    });

    broadcastToRoom(roomId, {
      type: "new_message",
      message: resetSysMsg,
    });

    console.log(`[CHAT-POD] 🔄 Room ${roomId} link reset from "${oldCode}" to "${newCode}" by ${user.name}`);

    dispatchGroupAuditEventToTelegram({
      eventType: "link_reset",
      room,
      actor: user,
      oldCode,
      newCode,
      ip: getClientIp(req),
    }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Reset link dispatch notice:", err.message));

    return res.json({
      success: true,
      message: "Group invite link reset successfully! Previous invite links are now invalid.",
      room: {
        id: room.id,
        name: room.name,
        isPrivate: true,
        secretCode: room.secretCode,
        createdBy: room.createdBy,
        creatorName: room.creatorName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/remove-user
 * Removes a member from a private study group and prevents rejoining via invite link (WhatsApp-style)
 */
router.post("/rooms/remove-user", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId, targetUserId } = req.body || {};
    if (!roomId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Room ID and targetUserId are required." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only the room creator or an administrator can remove members from this group.",
      });
    }

    if (targetUserId === room.createdBy) {
      return res.status(400).json({
        success: false,
        message: "The group host cannot be removed.",
      });
    }

    // Initialize bannedMembers if not existing
    if (!(room.bannedMembers instanceof Set)) {
      room.bannedMembers = new Set(Array.isArray(room.bannedMembers) ? room.bannedMembers : []);
    }
    room.bannedMembers.add(targetUserId);

    // Get target user's name before removing
    let targetName = "Member";
    if (room.participantsMap && room.participantsMap.has(targetUserId)) {
      targetName = room.participantsMap.get(targetUserId).name || targetName;
      room.participantsMap.delete(targetUserId);
    } else {
      const enriched = await enrichParticipantDetails(targetUserId);
      if (enriched && enriched.name) targetName = enriched.name;
    }

    // Remove from active members
    if (room.members instanceof Set) {
      room.members.delete(targetUserId);
    } else if (Array.isArray(room.members)) {
      room.members = room.members.filter((uid) => uid !== targetUserId);
    }

    room.lastActivity = new Date().toISOString();

    // Persist bannedMembers and members to Firestore
    if (db) {
      db.collection("chat_rooms").doc(roomId).update({
        members: room.members instanceof Set ? Array.from(room.members) : (room.members || []),
        bannedMembers: room.bannedMembers instanceof Set ? Array.from(room.bannedMembers) : (room.bannedMembers || []),
        lastActivity: room.lastActivity,
      }).catch((err) => console.warn("[CHAT-REMOVE-USER] Firestore update error:", err.message));
    }

    // Disconnect user socket from this room and switch to public
    const rMap = roomSockets.get(roomId);
    if (rMap) {
      rMap.forEach((entry, sockId) => {
        if (entry.user && entry.user.id === targetUserId) {
          try {
            entry.ws.send(JSON.stringify({
              type: "kicked_from_room",
              roomId,
              roomName: room.name,
              reason: `🚫 You have been removed from "${room.name}" by the group admin. You cannot rejoin with the invite link until the group admin adds you back.`,
            }));
          } catch (_) {}
          entry.ws.currentRoomId = "public";
          rMap.delete(sockId);
        }
      });
    }

    // Broadcast presence update to remaining members
    const remainingCount = room.members instanceof Set ? room.members.size : (room.members?.length || 0);
    broadcastToRoom(roomId, {
      type: "presence_update",
      roomId,
      membersCount: remainingCount,
      userRemoved: { id: targetUserId, name: targetName },
    });

    // Add system message
    const kickSysMsg = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      text: `🚫 ${targetName} was removed from the group by ${user.name}. Rejoining via link is blocked.`,
      type: "text",
      sender: {
        id: "system",
        name: "System",
        role: "system",
      },
      createdAt: new Date().toISOString(),
      isSystem: true,
    };
    if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
    const msgs = activeMessages.get(roomId);
    msgs.push(kickSysMsg);
    if (msgs.length > 200) msgs.shift();

    broadcastToRoom(roomId, {
      type: "new_message",
      message: kickSysMsg,
    });

    console.log(`[CHAT-POD] 🚫 User ${targetUserId} (${targetName}) removed from room ${roomId} by ${user.name}`);

    dispatchGroupAuditEventToTelegram({
      eventType: "member_removed",
      room,
      actor: user,
      targetUser: { id: targetUserId, name: targetName },
      ip: getClientIp(req),
    }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Remove user dispatch notice:", err.message));

    return res.json({
      success: true,
      message: `${targetName} has been removed from the group. They cannot rejoin using invite links or codes.`,
      bannedMembers: Array.from(room.bannedMembers),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/add-user
 * Adds a user back to private room (unbans and re-invites by userId or email)
 */
router.post("/rooms/add-user", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId, targetUserId, email } = req.body || {};
    if (!roomId || (!targetUserId && !email)) {
      return res.status(400).json({ success: false, message: "Room ID and either targetUserId or email are required." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Permission denied. Only the room creator or an administrator can add members to this group.",
      });
    }

    let finalUserId = targetUserId;
    let targetUserInfo = null;

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (db) {
        const uSnap = await db.collection("users").where("email", "==", cleanEmail).limit(1).get();
        if (!uSnap.empty) {
          finalUserId = uSnap.docs[0].id;
          targetUserInfo = { id: finalUserId, ...uSnap.docs[0].data() };
        }
      }
      if (!finalUserId && tursoClient) {
        const tRes = await tursoClient.execute({
          sql: "SELECT id, name, email, role, avatar FROM users WHERE LOWER(email) = ? LIMIT 1",
          args: [cleanEmail],
        });
        if (tRes.rows?.length > 0) {
          finalUserId = tRes.rows[0].id;
          targetUserInfo = tRes.rows[0];
        }
      }
    }

    if (!finalUserId) {
      return res.status(404).json({ success: false, message: "User not found with the provided email or ID." });
    }

    if (!targetUserInfo) {
      targetUserInfo = await enrichParticipantDetails(finalUserId);
    }
    const targetName = targetUserInfo?.name || "Student";

    // 1. Unban from bannedMembers
    if (room.bannedMembers instanceof Set) {
      room.bannedMembers.delete(finalUserId);
    } else if (Array.isArray(room.bannedMembers)) {
      room.bannedMembers = room.bannedMembers.filter((uid) => uid !== finalUserId);
    }

    // 2. Add to room.members
    if (room.members instanceof Set) {
      room.members.add(finalUserId);
    } else if (Array.isArray(room.members)) {
      if (!room.members.includes(finalUserId)) room.members.push(finalUserId);
    }

    room.lastActivity = new Date().toISOString();

    // Persist to Firestore
    if (db) {
      db.collection("chat_rooms").doc(roomId).update({
        members: room.members instanceof Set ? Array.from(room.members) : (room.members || []),
        bannedMembers: room.bannedMembers instanceof Set ? Array.from(room.bannedMembers) : (room.bannedMembers || []),
        lastActivity: room.lastActivity,
      }).catch((err) => console.warn("[CHAT-ADD-USER] Firestore update error:", err.message));
    }

    // System message
    const addSysMsg = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      text: `✅ ${targetName} was added back to the group by ${user.name}.`,
      type: "text",
      sender: {
        id: "system",
        name: "System",
        role: "system",
      },
      createdAt: new Date().toISOString(),
      isSystem: true,
    };
    if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
    const msgs = activeMessages.get(roomId);
    msgs.push(addSysMsg);
    if (msgs.length > 200) msgs.shift();

    broadcastToRoom(roomId, {
      type: "new_message",
      message: addSysMsg,
    });

    const totalCount = room.members instanceof Set ? room.members.size : (room.members?.length || 0);
    broadcastToRoom(roomId, {
      type: "presence_update",
      roomId,
      membersCount: totalCount,
      userAdded: { id: finalUserId, name: targetName },
    });

    console.log(`[CHAT-POD] ✅ User ${finalUserId} (${targetName}) added back to room ${roomId} by ${user.name}`);

    dispatchGroupAuditEventToTelegram({
      eventType: "member_added",
      room,
      actor: user,
      targetUser: { id: finalUserId, name: targetName },
      ip: getClientIp(req),
    }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Add user dispatch notice:", err.message));

    return res.json({
      success: true,
      message: `${targetName} has been added to the group successfully!`,
      user: { id: finalUserId, name: targetName },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/rooms/:roomId/members
 * Get active members and banned/removed members of a private room (for host/admin management)
 */
router.get("/rooms/:roomId/members", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId } = req.params;

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);
    const isMember = (room.members instanceof Set ? room.members.has(user.id) : (room.members || []).includes(user.id)) || isCreator;

    if (!isMember && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied. You are not a member of this private room." });
    }

    // Build list of active participants
    const participants = [];
    const seenIds = new Set();

    if (room.participantsMap) {
      room.participantsMap.forEach((p, uid) => {
        seenIds.add(uid);
        participants.push({
          id: uid,
          name: p.name || "Student",
          role: p.role || "student",
          photoUrl: p.photoUrl || p.avatar || "",
          isHost: uid === room.createdBy,
          isOnline: true,
        });
      });
    }

    // Check room.members for anyone not in participantsMap
    const memberIds = room.members instanceof Set ? Array.from(room.members) : (room.members || []);
    for (const uid of memberIds) {
      if (!seenIds.has(uid)) {
        seenIds.add(uid);
        const enriched = await enrichParticipantDetails(uid);
        participants.push({
          id: uid,
          name: enriched.name || "Student",
          role: enriched.role || "student",
          photoUrl: enriched.photoUrl || enriched.avatar || "",
          isHost: uid === room.createdBy,
          isOnline: false,
        });
      }
    }

    // Ensure host is always in the list
    if (room.createdBy && !seenIds.has(room.createdBy)) {
      const hostEnriched = await enrichParticipantDetails(room.createdBy);
      participants.unshift({
        id: room.createdBy,
        name: room.creatorName || hostEnriched.name || "Host",
        role: hostEnriched.role || "student",
        photoUrl: hostEnriched.photoUrl || "",
        isHost: true,
        isOnline: false,
      });
    }

    // List of banned/removed members (WhatsApp-style kicked)
    const bannedMembers = [];
    const bannedSet = room.bannedMembers instanceof Set ? Array.from(room.bannedMembers) : (room.bannedMembers || []);
    for (const bId of bannedSet) {
      const bEnriched = await enrichParticipantDetails(bId);
      bannedMembers.push({
        id: bId,
        name: bEnriched.name || "Removed Member",
        email: bEnriched.email || "",
        photoUrl: bEnriched.photoUrl || "",
        role: bEnriched.role || "student",
      });
    }

    return res.json({
      success: true,
      roomId: room.id,
      roomName: room.name,
      createdBy: room.createdBy,
      creatorName: room.creatorName,
      isCreator,
      isMainAdmin: isAdmin,
      members: participants,
      bannedMembers: (isCreator || isAdmin) ? bannedMembers : [],
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/close
 * Explicitly delete and archive a private study group (Host or Admin only)
 */
router.post("/rooms/close", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ success: false, message: "Room ID is required." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user) || isMainAdmin(user);

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ success: false, message: "Permission denied. Only the room creator or an administrator can delete this private chat." });
    }

    broadcastToRoom(roomId, {
      type: "room_closed",
      roomId,
      closedBy: { id: user.id, name: user.name },
      message: `Private group "${room.name}" was permanently deleted by ${user.name}. All messages have been permanently deleted.`,
    });

    const rMap = roomSockets.get(roomId);
    if (rMap) {
      rMap.forEach(({ ws: sWs }) => {
        sWs.currentRoomId = "public";
      });
    }

    await archiveAndPurgePrivateRoom(room, "closed_by_user", { ...user, ip: getClientIp(req) });

    return res.json({ success: true, message: `Room "${room.name}" was permanently deleted.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/leave
 * Allows a member to leave a private room without deleting it
 */
router.post("/rooms/leave", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { roomId } = req.body || {};
    if (!roomId) {
      return res.status(400).json({ success: false, message: "Room ID is required." });
    }

    const room = await getOrRestoreRoom(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found." });
    }

    const isCreator = room.createdBy === user.id;
    if (isCreator) {
      return res.status(400).json({
        success: false,
        message: "As the host, you cannot leave. You can delete this private chat to close it.",
      });
    }

    // Remove user from room members
    if (room.members instanceof Set) {
      room.members.delete(user.id);
    } else if (Array.isArray(room.members)) {
      room.members = room.members.filter((uid) => uid !== user.id);
    }

    if (room.participantsMap) {
      room.participantsMap.delete(user.id);
    }

    // Disconnect user socket from this room and switch to public
    const rMap = roomSockets.get(roomId);
    if (rMap) {
      rMap.forEach((entry, sockId) => {
        if (entry.user.id === user.id) {
          entry.ws.currentRoomId = "public";
          rMap.delete(sockId);
        }
      });
    }

    const remainingCount = room.members instanceof Set ? room.members.size : (room.members?.length || 0);
    broadcastToRoom(roomId, {
      type: "presence_update",
      roomId,
      membersCount: remainingCount,
      userLeft: { id: user.id, name: user.name },
    });

    const leaveSysMsg = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      text: `👋 ${user.name} has left the chat.`,
      type: "text",
      sender: {
        id: "system",
        name: "System",
        role: "system",
      },
      createdAt: new Date().toISOString(),
      isSystem: true,
    };
    if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
    const msgs = activeMessages.get(roomId);
    msgs.push(leaveSysMsg);
    if (msgs.length > 200) msgs.shift();

    broadcastToRoom(roomId, {
      type: "new_message",
      message: leaveSysMsg,
    });

    return res.json({ success: true, message: `You have left "${room.name}".` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/rooms/join
 * Verifies secretCode and returns room details
 */
router.post("/rooms/join", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { secretCode, roomId } = req.body || {};

    let targetRoom = null;
    activeRooms.forEach((r) => {
      if (roomId && r.id === roomId) targetRoom = r;
      if (secretCode && r.secretCode && r.secretCode.trim().toUpperCase() === secretCode.trim().toUpperCase()) {
        targetRoom = r;
      }
    });

    if (!targetRoom && db) {
      if (secretCode) {
        const snap = await db.collection("chat_rooms").where("secretCode", "==", secretCode.trim().toUpperCase()).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          const rData = doc.data();
          targetRoom = {
            id: doc.id,
            ...rData,
            members: new Set(rData.members || []),
            bannedMembers: new Set(rData.bannedMembers || []),
            auditLog: [],
            auditMessages: [],
            participantsMap: new Map(),
          };
          activeRooms.set(targetRoom.id, targetRoom);
          if (!activeMessages.has(targetRoom.id)) activeMessages.set(targetRoom.id, []);
          if (!roomSockets.has(targetRoom.id)) roomSockets.set(targetRoom.id, new Map());
        }
      } else if (roomId) {
        targetRoom = await getOrRestoreRoom(roomId);
      }
    }

    if (!targetRoom) {
      return res.status(404).json({ success: false, message: "No active room found with this Secret Key." });
    }

    // 🛡️ Private Room Passcode Enforcement
    if (targetRoom.isPrivate) {
      const isCreator = targetRoom.createdBy === user.id;
      const isMain = isMainAdmin(user);
      const isAlreadyMember = targetRoom.members instanceof Set
        ? targetRoom.members.has(user.id)
        : Array.isArray(targetRoom.members) && targetRoom.members.includes(user.id);
      const codeMatches = secretCode && targetRoom.secretCode && secretCode.trim().toUpperCase() === targetRoom.secretCode.trim().toUpperCase();

      if (!isCreator && !isMain && !isAlreadyMember && !codeMatches) {
        return res.status(403).json({
          success: false,
          message: "Valid Secret Passcode is required to join this private study room.",
        });
      }
    }

    // 🚫 WhatsApp Rule: If user was removed by group admin, they CANNOT rejoin via invite link or code
    const isBanned = targetRoom.bannedMembers instanceof Set
      ? targetRoom.bannedMembers.has(user.id)
      : Array.isArray(targetRoom.bannedMembers) && targetRoom.bannedMembers.includes(user.id);

    if (targetRoom.isPrivate && isBanned) {
      return res.status(403).json({
        success: false,
        isRemovedByAdmin: true,
        message: `🚫 You cannot join "${targetRoom.name}" because you were removed by the group admin. Only the group admin can add you back.`,
      });
    }

    // Register user in room.members
    if (targetRoom.members instanceof Set) {
      targetRoom.members.add(user.id);
    }

    return res.json({
      success: true,
      room: {
        id: targetRoom.id,
        name: targetRoom.name,
        isPrivate: targetRoom.isPrivate,
        secretCode: targetRoom.secretCode,
        createdBy: targetRoom.createdBy,
        creatorName: targetRoom.creatorName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/messages/:roomId
 * Returns messages history for a room
 */
router.get("/messages/:roomId", authenticateToken, requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = activeRooms.get(roomId);
    if (room && room.isPrivate) {
      const isMain = isMainAdmin(req.user);
      const isCreator = room.createdBy === req.user.id;
      const isMember = room.members instanceof Set ? room.members.has(req.user.id) : Array.isArray(room.members) ? room.members.includes(req.user.id) : false;
      if (!isMain && !isCreator && !isMember) {
        return res.status(403).json({ success: false, message: "Access denied. You are not a member of this private pod." });
      }
    }
    const msgs = activeMessages.get(roomId) || [];
    return res.json({ success: true, messages: msgs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/upload
 * Handles PDF & Image upload for chat attachment
 */
router.post("/upload", authenticateToken, requireAuth, uploadChatMedia.single("file"), async (req, res) => {
  try {
    if (blockedUsers.has(req.user.id)) {
      return res.status(403).json({ success: false, message: "You have been restricted from uploading files in chat." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const isPdf = req.file.mimetype.includes("pdf") || req.file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = req.file.mimetype.includes("image");
    const isAudio =
      req.file.mimetype.includes("audio") ||
      [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"].some((ext) =>
        req.file.originalname.toLowerCase().endsWith(ext)
      );

    const fileUrl = `/api/chat/media/${req.file.filename}`;

    return res.json({
      success: true,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: isPdf ? "pdf" : isImage ? "image" : isAudio ? "audio" : "document",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/media/:filename
 * Safely serves chat media & user avatar profile pictures
 */
router.get("/media/:filename", (req, res) => {
  try {
    const rawName = String(req.params.filename || "");
    const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeName) return res.status(400).send("Invalid filename.");
    const filePath = path.resolve(CHAT_MEDIA_DIR, safeName);
    if (!filePath.startsWith(path.resolve(CHAT_MEDIA_DIR)) || !fs.existsSync(filePath)) {
      return res.status(404).send("Chat media not found.");
    }
    const ext = path.extname(safeName).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".webm": "audio/webm",
    };
    if (mimeMap[ext]) {
      res.setHeader("Content-Type", mimeMap[ext]);
    }
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).send("Error reading media file.");
  }
});

/**
 * GET /api/chat/profile
 * Retrieves user's custom chat handle, avatar, and historical DPs from Turso
 */
router.get("/profile", authenticateToken, requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await getChatUserProfile(userId);

    // Fallback to Firestore if not yet recorded in Turso
    if (!profile && db) {
      try {
        const uDoc = await db.collection("users").doc(userId).get();
        if (uDoc.exists) {
          const u = uDoc.data();
          profile = {
            userId,
            chatUsername: u.username || "",
            avatarUrl: u.photoUrl || u.avatar || "",
            role: u.role || "student",
            isBlocked: false,
            updatedAt: u.updatedAt || new Date().toISOString(),
            avatarHistory: Array.isArray(u.avatarHistory) ? u.avatarHistory : [],
          };
          // Cache into Turso for instant 0ms subsequent reads
          await saveChatUserProfile(userId, profile);
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      profile: profile || {
        userId,
        chatUsername: "",
        avatarUrl: "",
        role: req.user.role || "student",
        isBlocked: false,
        avatarHistory: [],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/profile
 * Updates user's chat username and uploads avatar photo into Turso
 * Enforces admin/system reserved name restrictions
 */
router.post("/profile", authenticateToken, requireAuth, uploadChatAvatar.single("avatar"), async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = isUserAdmin(req.user);
    const rawUsername = (req.body.username || "").trim();

    let cleanUsername = null;
    if (rawUsername) {
      cleanUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "");

      if (cleanUsername.length < 3 || cleanUsername.length > 24) {
        return res.status(400).json({
          success: false,
          message: "Chat username must be between 3 and 24 characters (letters, numbers, and underscores only).",
        });
      }

      // 🛡️ Strict Reserved Name Shield: Students CANNOT choose admin, root, fsm, or web-related handles
      if (!isAdmin && RESERVED_CHAT_USERNAMES.includes(cleanUsername)) {
        return res.status(400).json({
          success: false,
          message: `The username "@${cleanUsername}" is reserved for system administrators. Please choose a different student handle.`,
        });
      }

      // Check uniqueness in Turso
      const isTaken = await isChatUsernameTaken(cleanUsername, userId);
      if (isTaken) {
        return res.status(400).json({
          success: false,
          message: `The username "@${cleanUsername}" is already taken by another student. Please pick another handle.`,
        });
      }
    }

    // Determine new Avatar URL
    let newAvatarUrl = null;
    if (req.file) {
      newAvatarUrl = `/api/chat/media/${req.file.filename}`;
    } else if (req.body.photoUrl && typeof req.body.photoUrl === "string") {
      const pUrl = req.body.photoUrl.trim();
      if (pUrl.startsWith("data:image/")) {
        try {
          const parts = pUrl.split(",");
          const base64Data = parts[1];
          const ext = pUrl.includes("image/png") ? ".png" : pUrl.includes("image/webp") ? ".webp" : ".jpg";
          const fname = `dp-${userId}-${Date.now()}${ext}`;
          const outPath = path.join(CHAT_MEDIA_DIR, fname);
          await fs.promises.writeFile(outPath, Buffer.from(base64Data, "base64"));
          newAvatarUrl = `/api/chat/media/${fname}`;
        } catch (e) {
          console.warn("[CHAT-PROFILE] Base64 avatar write error:", e.message);
        }
      } else if (pUrl.startsWith("http") || pUrl.startsWith("/api/chat/media/")) {
        newAvatarUrl = pUrl;
      }
    }

    // Fetch existing profile to manage historical DP versions
    const existing = (await getChatUserProfile(userId)) || {};
    let avatarHistory = Array.isArray(existing.avatarHistory) ? [...existing.avatarHistory] : [];

    // If new DP differs from existing DP, store previous DP in history
    if (newAvatarUrl && existing.avatarUrl && existing.avatarUrl !== newAvatarUrl) {
      avatarHistory.unshift({
        photoUrl: existing.avatarUrl,
        changedAt: new Date().toISOString(),
      });
      // Retain up to 20 historical DP versions for forensic private room reports
      if (avatarHistory.length > 20) avatarHistory = avatarHistory.slice(0, 20);
    }

    const effectiveAvatarUrl = newAvatarUrl !== null ? newAvatarUrl : (existing.avatarUrl || "");
    const effectiveUsername = cleanUsername !== null ? cleanUsername : (existing.chatUsername || "");

    // ⚡ 1. Save directly to Turso LibSQL Database
    await saveChatUserProfile(userId, {
      chatUsername: effectiveUsername,
      avatarUrl: effectiveAvatarUrl,
      role: req.user.role || "student",
      isBlocked: existing.isBlocked || false,
      avatarHistory,
    });

    // ⚡ 2. Update Firestore user document for consistency
    if (db) {
      db.collection("users").doc(userId).update({
        username: effectiveUsername,
        avatar: effectiveAvatarUrl,
        photoUrl: effectiveAvatarUrl,
        avatarHistory,
        updatedAt: new Date().toISOString(),
      }).catch((e) => console.warn("[CHAT-PROFILE] Firestore sync notice:", e.message));
    }

    // ⚡ 3. Update active WebSocket sockets for this user in-memory
    activeRooms.forEach((r) => {
      if (r.participantsMap && r.participantsMap.has(userId)) {
        const p = r.participantsMap.get(userId);
        p.username = effectiveUsername;
        p.photoUrl = effectiveAvatarUrl;
        p.avatarHistory = avatarHistory;
      }
    });

    // ⚡ 4. Live Broadcast Profile Update to Room Participants
    const broadcastPayload = {
      type: "user_profile_updated",
      user: {
        id: userId,
        username: effectiveUsername,
        photoUrl: effectiveAvatarUrl,
        role: req.user.role || "student",
      },
    };

    roomSockets.forEach((socketsMap, roomId) => {
      let isUserInRoom = false;
      socketsMap.forEach(({ user }) => {
        if (user && user.id === userId) isUserInRoom = true;
      });
      if (isUserInRoom) {
        broadcastToRoom(roomId, broadcastPayload);
      }
    });

    console.log(`[CHAT-PROFILE] 👤 User ${userId} updated chat profile: @${effectiveUsername || "none"} (DP: ${effectiveAvatarUrl ? "YES" : "NO"}) in Turso`);

    return res.json({
      success: true,
      message: "Chat profile and DP updated successfully!",
      profile: {
        userId,
        chatUsername: effectiveUsername,
        avatarUrl: effectiveAvatarUrl,
        avatarHistory,
        role: req.user.role || "student",
      },
    });
  } catch (err) {
    console.error("[CHAT-PROFILE] Error updating profile:", err.message);
    return res.status(500).json({ success: false, message: "Failed to update chat profile: " + err.message });
  }
});

/**
 * POST /api/chat/admin/purge/:roomId
 * Admin only: Purges entire room message history
 */
router.post("/admin/purge/:roomId", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!isUserAdmin(user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }

    const { roomId } = req.params;
    activeMessages.set(roomId, []);

    if (db) {
      const snap = await db.collection("chat_messages").where("roomId", "==", roomId).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    broadcastToRoom(roomId, {
      type: "chat_purged",
      roomId,
      message: "Chat history was cleared by the Administrator.",
    });

    // 📡 Dispatch Complete Chat Purge Alert to Telegram Supergroup
    const roomObj = activeRooms.get(roomId);
    dispatchChatPurgeAlertToTelegram({
      roomId,
      roomName: roomObj?.name || (roomId === PUBLIC_ROOM_ID ? "💬 Public Community Chat" : roomId),
      admin: { ...user, ip: getClientIp(req) },
    }).catch(() => {});

    return res.json({ success: true, message: `Room history cleared.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/admin/block-user
 * Admin only: Blocks or Unblocks a student from chatting
 */
router.post("/admin/block-user", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!isUserAdmin(user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }

    const { targetUserId, block } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Target student ID required." });
    }

    if (block) {
      blockedUsers.add(targetUserId);
    } else {
      blockedUsers.delete(targetUserId);
    }

    if (db) {
      await db.collection("settings").doc("chat_blocked_users").set({
        userIds: Array.from(blockedUsers),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Enriched target details for Telegram report
    let targetDetails = { id: targetUserId };
    if (db) {
      try {
        const uSnap = await db.collection("users").doc(targetUserId).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          targetDetails = {
            id: targetUserId,
            name: uData.name || uData.username || "Student",
            email: uData.email || "N/A",
            mobile: uData.mobile || "N/A",
          };
        }
      } catch (_) {}
    }

    // Enrich target user with live socket IP if available
    const activeList = getActiveUsersList();
    const activeMatch = activeList.find((u) => u.id === targetUserId);
    if (activeMatch && activeMatch.ip) {
      targetDetails.ip = activeMatch.ip;
    }

    // 📡 Dispatch User Block / Unblock Alert to Telegram Bot & Optional Supergroup
    dispatchChatBlockAlertToTelegram({
      targetUser: targetDetails,
      block: Boolean(block),
      admin: { ...user, ip: getClientIp(req) },
      activeUsers: activeList,
    }).catch(() => {});

    // 📡 Live Real-Time WebSocket Broadcast to All Rooms
    const blockedPayload = JSON.stringify({
      type: "blocked_status_update",
      isBlocked: Boolean(block),
      message: block
        ? "You have been restricted from participating in chat by the Administrator."
        : "Your chat participation permissions have been restored.",
    });

    const adminSyncPayload = JSON.stringify({
      type: "admin_blocked_users_update",
      blockedUserIds: Array.from(blockedUsers),
      targetUserId,
      isBlocked: Boolean(block),
    });

    // Broadcast across all rooms and sockets
    roomSockets.forEach((socketsMap) => {
      socketsMap.forEach((clientWs) => {
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          if (clientWs.user?.id === targetUserId) {
            try { clientWs.send(blockedPayload); } catch (_) {}
          }
          if (isUserAdmin(clientWs.user)) {
            try { clientWs.send(adminSyncPayload); } catch (_) {}
          }
        }
      });
    });

    return res.json({
      success: true,
      blocked: blockedUsers.has(targetUserId),
      blockedUserIds: Array.from(blockedUsers),
      message: block ? `Student blocked from chat.` : `Student unblocked.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/admin/blocked-users
 * Admin only: Returns all currently blocked chat users with names and contact details
 */
router.get("/admin/blocked-users", authenticateToken, requireAuth, async (req, res) => {
  try {
    if (!isUserAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }

    const list = [];
    for (const uid of blockedUsers) {
      let uInfo = { id: uid, name: "Student", email: "N/A", mobile: "N/A", college: "", year: "" };
      if (db) {
        try {
          const uDoc = await db.collection("users").doc(uid).get();
          if (uDoc.exists) {
            const d = uDoc.data();
            uInfo.name = d.name || "Student";
            uInfo.email = d.email || "N/A";
            uInfo.mobile = d.mobile ? decrypt(d.mobile) : "N/A";
            uInfo.college = d.college || "";
            uInfo.year = d.year || "";
          }
        } catch (_) {}
      }
      list.push(uInfo);
    }

    return res.json({ success: true, blockedUsers: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/admin/delete-user-messages
 * Admin only: Deletes all messages by a specific user in a room
 */
router.post("/admin/delete-user-messages", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!isUserAdmin(user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    const { targetUserId, roomId = "public" } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "Target user ID is required." });
    }

    const msgs = activeMessages.get(roomId) || [];
    const remaining = [];
    const deletedList = [];
    msgs.forEach((m) => {
      if (m.sender?.id === targetUserId) {
        deletedList.push(m);
      } else {
        remaining.push(m);
      }
    });
    activeMessages.set(roomId, remaining);

    broadcastToRoom(roomId, {
      type: "user_messages_purged",
      roomId,
      targetUserId,
      deletedCount: deletedList.length,
      purgedBy: { id: user.id, name: user.name },
    });

    if (db) {
      db.collection("chat_messages")
        .where("roomId", "==", roomId)
        .where("sender.id", "==", targetUserId)
        .get()
        .then((snap) => {
          if (!snap.empty) {
            const docs = snap.docs;
            const promises = [];
            for (let i = 0; i < docs.length; i += 450) {
              const batch = db.batch();
              docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
              promises.push(batch.commit());
            }
            return Promise.all(promises);
          }
        })
        .catch(() => {});
    }

    try {
      getTursoClient()
        .execute({
          sql: "DELETE FROM chat_messages WHERE room_id = ? AND sender_id = ?",
          args: [roomId, targetUserId],
        })
        .catch(() => {});
    } catch (_) {}

    const roomObj = activeRooms.get(roomId);
    dispatchChatPurgeAlertToTelegram({
      roomId,
      roomName: roomObj?.name || (roomId === PUBLIC_ROOM_ID ? "💬 Public Community Chat" : roomId),
      admin: { ...user, ip: getClientIp(req) },
      details: `All ${deletedList.length} messages by user (ID: ${targetUserId}) were purged by Admin ${user.name}.`,
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Deleted ${deletedList.length} messages by this user.`,
      deletedCount: deletedList.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/chat/admin/users
 * Admin only: Live search student directory by name, email, or mobile for Block/Unblock
 */
router.get("/admin/users", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!isUserAdmin(user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }
    const search = (req.query.search || "").trim().toLowerCase();
    const usersMap = new Map();

    if (db) {
      try {
        const snap = await db.collection("users").limit(120).get();
        snap.forEach((doc) => {
          const d = doc.data();
          const name = (d.name || d.username || "Student").trim();
          const email = (d.email || "").trim();
          const username = (d.username || "").trim();
          const mobile = d.mobile ? decrypt(d.mobile) : "";

          const match =
            !search ||
            name.toLowerCase().includes(search) ||
            email.toLowerCase().includes(search) ||
            username.toLowerCase().includes(search) ||
            mobile.toLowerCase().includes(search);

          if (match) {
            usersMap.set(doc.id, {
              id: doc.id,
              name,
              email: email || "N/A",
              username,
              mobile: mobile || "N/A",
              photoUrl: d.photoUrl || d.avatar || "",
              college: d.college || "",
              year: d.year || "",
              role: d.role || "student",
              isBlocked: blockedUsers.has(doc.id),
            });
          }
        });
      } catch (_) {}
    }

    activeRooms.forEach((r) => {
      if (r.participantsMap) {
        r.participantsMap.forEach((p, uid) => {
          if (!usersMap.has(uid)) {
            const name = (p.name || "Student").trim();
            const email = (p.email || "").trim();
            const username = (p.username || "").trim();
            const mobile = (p.mobile || "").trim();

            const match =
              !search ||
              name.toLowerCase().includes(search) ||
              email.toLowerCase().includes(search) ||
              username.toLowerCase().includes(search) ||
              mobile.toLowerCase().includes(search);

            if (match) {
              usersMap.set(uid, {
                id: uid,
                name,
                email: email || "N/A",
                username,
                mobile: mobile || "N/A",
                photoUrl: p.photoUrl || "",
                college: p.college || "",
                year: p.year || "",
                role: p.role || "student",
                isBlocked: blockedUsers.has(uid),
              });
            }
          }
        });
      }
    });

    return res.json({ success: true, users: Array.from(usersMap.values()).slice(0, 50) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/chat/notice
 * Admin only: Sets or updates public chat announcement
 */
router.post("/notice", authenticateToken, requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!isUserAdmin(user)) {
      return res.status(403).json({ success: false, message: "Admin access required." });
    }

    const { text } = req.body || {};
    chatNotice = {
      text: (text || "").trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: user.name || "Admin",
    };

    if (db) {
      await db.collection("settings").doc("chat_notice").set(chatNotice, { merge: true });
    }

    broadcastToRoom(PUBLIC_ROOM_ID, {
      type: "notice_updated",
      notice: chatNotice,
    });

    return res.json({ success: true, notice: chatNotice, message: "Chat notice updated!" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Hook: Purge student's chat history when account is deleted
 */
async function purgeUserChatHistory(userId) {
  try {
    if (!userId) return;
    activeMessages.forEach((msgs, roomId) => {
      const filtered = msgs.filter((m) => m.sender?.id !== userId);
      activeMessages.set(roomId, filtered);
    });

    if (db) {
      const snap = await db.collection("chat_messages").where("sender.id", "==", userId).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        console.log(`[CHAT-CLEANUP] 🗑️ Cleaned ${snap.size} chat messages for deleted user ${userId}`);
      }
    }
  } catch (err) {
    console.warn("[CHAT-CLEANUP] Purge notice:", err.message);
  }
}


/**
 * 👥 Helper: Returns deduplicated list of all currently active/connected students
 */
function getActiveUsersList() {
  const usersMap = new Map();
  if (wssInstance && wssInstance.clients) {
    wssInstance.clients.forEach((ws) => {
      if (ws.readyState === 1 && ws.user && ws.user.id) { // 1 = WebSocket.OPEN
        if (!usersMap.has(ws.user.id)) {
          const roomObj = activeRooms.get(ws.currentRoomId || "public");
          const roomLabel = roomObj ? roomObj.name : (ws.currentRoomId === "public" ? "🏛️ General Student Hall" : (ws.currentRoomId || "General"));
          const pInfo = ws.enrichedUser || roomObj?.participantsMap?.get(ws.user.id) || {};
          const resolvedMobile = pInfo.mobile || (ws.user.mobile ? decrypt(ws.user.mobile) : "") || "N/A";
          usersMap.set(ws.user.id, {
            id: ws.user.id,
            name: pInfo.name || ws.user.name || "Student",
            email: pInfo.email || ws.user.email || "N/A",
            mobile: resolvedMobile,
            role: ws.user.role || "student",
            roomId: ws.currentRoomId || "public",
            roomName: roomLabel,
            ip: ws.userIp || "127.0.0.1",
            connectedAt: ws.connectedAt || Date.now(),
            lastInteraction: ws.lastInteraction || Date.now(),
          });
        }
      }
    });
  }
  return Array.from(usersMap.values());
}

/**
 * 🔍 Helper: Normalizes phone numbers to comparable digits (handles +91, 0-prefix, spaces, hyphens)
 */
function matchesPhoneQuery(candidateMobile, rawQuery) {
  if (!candidateMobile || candidateMobile === "N/A" || !rawQuery) return false;
  const qDigits = String(rawQuery).replace(/\D/g, "");
  if (qDigits.length < 8) return false;
  const cDigits = String(candidateMobile).replace(/\D/g, "");
  if (!cDigits) return false;
  if (cDigits === qDigits) return true;
  if (cDigits.length >= 10 && qDigits.length >= 10 && cDigits.slice(-10) === qDigits.slice(-10)) {
    return true;
  }
  return false;
}

/**
 * 🔍 Helper: Resolves a student by Mobile Number, Email, or User ID across active sockets,
 * recent chat logs, Turso LibSQL, and Firestore (including encrypted mobile fields).
 */
async function resolveChatUserByQuery(query) {
  if (!query || !String(query).trim()) return null;
  const trimmed = String(query).trim();
  const cleanQuery = trimmed.toLowerCase();
  const queryDigits = trimmed.replace(/\D/g, "");
  const isPhoneLike = queryDigits.length >= 8 && !trimmed.includes("@");

  // 1. Check active WebSocket users first
  const activeList = getActiveUsersList();
  const matchedActive = activeList.find((u) =>
    (u.id && String(u.id).toLowerCase() === cleanQuery) ||
    (u.email && String(u.email).toLowerCase() === cleanQuery) ||
    (isPhoneLike && matchesPhoneQuery(u.mobile, trimmed))
  );
  if (matchedActive) {
    return {
      id: matchedActive.id,
      name: matchedActive.name || "Student",
      email: matchedActive.email || "N/A",
      mobile: matchedActive.mobile || "N/A",
      ip: matchedActive.ip || "N/A",
    };
  }

  // 2. Check recent room participants & auditMessages in RAM (0ms instant hit for chat senders)
  for (const room of activeRooms.values()) {
    if (room.participantsMap) {
      for (const [uid, p] of room.participantsMap.entries()) {
        if (
          String(uid).toLowerCase() === cleanQuery ||
          (p.email && String(p.email).toLowerCase() === cleanQuery) ||
          (isPhoneLike && matchesPhoneQuery(p.mobile, trimmed))
        ) {
          return {
            id: uid,
            name: p.name || "Student",
            email: p.email || "N/A",
            mobile: p.mobile || "N/A",
            ip: p.ip || "N/A",
          };
        }
      }
    }
    if (Array.isArray(room.auditMessages)) {
      for (let i = room.auditMessages.length - 1; i >= 0; i--) {
        const am = room.auditMessages[i];
        if (
          (am.senderId && String(am.senderId).toLowerCase() === cleanQuery) ||
          (am.senderEmail && String(am.senderEmail).toLowerCase() === cleanQuery) ||
          (isPhoneLike && matchesPhoneQuery(am.senderMobile, trimmed))
        ) {
          return {
            id: am.senderId,
            name: am.senderName || "Student",
            email: am.senderEmail || "N/A",
            mobile: am.senderMobile || "N/A",
            ip: am.senderIp || "N/A",
          };
        }
      }
    }
  }

  // 3. Check activeMessages in RAM
  for (const msgs of activeMessages.values()) {
    if (!Array.isArray(msgs)) continue;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const s = msgs[i]?.sender;
      if (!s || !s.id || s.id === "system") continue;
      if (
        String(s.id).toLowerCase() === cleanQuery ||
        (s.email && String(s.email).toLowerCase() === cleanQuery)
      ) {
        const enriched = await enrichParticipantDetails(s.id, s);
        return {
          id: s.id,
          name: enriched.name || s.name || "Student",
          email: enriched.email || s.email || "N/A",
          mobile: enriched.mobile || "N/A",
          ip: s.ip || "N/A",
        };
      }
    }
  }

  // 4. Check Turso LibSQL users table (by ID, Email, or Mobile)
  if (tursoClient) {
    try {
      const exactRes = await tursoClient.execute({
        sql: "SELECT id, name, email, mobile FROM users WHERE LOWER(id) = ? OR LOWER(email) = ? OR mobile = ? LIMIT 1",
        args: [cleanQuery, cleanQuery, trimmed],
      });
      if (exactRes.rows && exactRes.rows.length > 0) {
        const r = exactRes.rows[0];
        return {
          id: String(r.id),
          name: r.name || "Student",
          email: r.email || "N/A",
          mobile: r.mobile ? decrypt(r.mobile) : "N/A",
          ip: "N/A",
        };
      }
      if (isPhoneLike) {
        const allMobilesRes = await tursoClient.execute({
          sql: "SELECT id, name, email, mobile FROM users WHERE mobile IS NOT NULL AND mobile != ''",
          args: [],
        });
        if (allMobilesRes.rows) {
          for (const r of allMobilesRes.rows) {
            const decMob = r.mobile ? decrypt(r.mobile) : "";
            if (matchesPhoneQuery(decMob, trimmed)) {
              return {
                id: String(r.id),
                name: r.name || "Student",
                email: r.email || "N/A",
                mobile: decMob || "N/A",
                ip: "N/A",
              };
            }
          }
        }
      }
    } catch (_) {}
  }

  // 5. Check Firestore users collection (by Doc ID, Email, or Encrypted/Plain Mobile)
  if (db) {
    try {
      const byId = await db.collection("users").doc(trimmed).get();
      if (byId.exists) {
        const d = byId.data() || {};
        return {
          id: byId.id,
          name: d.name || "Student",
          email: d.email || "N/A",
          mobile: d.mobile ? decrypt(d.mobile) : "N/A",
          ip: d.lastLoginIp || "N/A",
        };
      }
      const byEmail = await db.collection("users").where("email", "==", cleanQuery).limit(1).get();
      if (!byEmail.empty) {
        const doc = byEmail.docs[0];
        const d = doc.data() || {};
        return {
          id: doc.id,
          name: d.name || "Student",
          email: d.email || "N/A",
          mobile: d.mobile ? decrypt(d.mobile) : "N/A",
          ip: d.lastLoginIp || "N/A",
        };
      }
      if (isPhoneLike) {
        const uSnap = await db.collection("users").get();
        for (const doc of uSnap.docs) {
          const d = doc.data() || {};
          const decMob = d.mobile ? decrypt(d.mobile) : "";
          if (matchesPhoneQuery(decMob, trimmed) || matchesPhoneQuery(d.mobile, trimmed)) {
            return {
              id: doc.id,
              name: d.name || "Student",
              email: d.email || "N/A",
              mobile: decMob || d.mobile || "N/A",
              ip: d.lastLoginIp || "N/A",
            };
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * 🚫 Helper: Blocks a user directly via Telegram Chat Bot command (by Mobile, Email, or ID)
 */
async function handleBlockUserFromTelegram(query, adminInfo = {}) {
  if (!query || !String(query).trim()) {
    return { success: false, message: "Please specify student mobile number, email, or ID." };
  }

  const targetDetails = await resolveChatUserByQuery(query);
  if (!targetDetails || !targetDetails.id) {
    return { success: false, message: `No student found matching "${query}".` };
  }
  const targetUserId = targetDetails.id;

  if (targetDetails.email && targetDetails.email.toLowerCase() === MAIN_ADMIN_EMAIL) {
    return { success: false, message: "Cannot block Master Administrator." };
  }

  blockedUsers.add(targetUserId);

  if (db) {
    await db.collection("settings").doc("chat_blocked_users").set({
      userIds: Array.from(blockedUsers),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  }

  const blockedPayload = JSON.stringify({
    type: "blocked_status_update",
    isBlocked: true,
    message: "You have been restricted from participating in chat by the Administrator.",
  });

  const adminSyncPayload = JSON.stringify({
    type: "admin_blocked_users_update",
    blockedUserIds: Array.from(blockedUsers),
    targetUserId,
    isBlocked: true,
  });

  roomSockets.forEach((socketsMap) => {
    socketsMap.forEach((clientWs) => {
      if (clientWs && clientWs.readyState === 1) {
        if (clientWs.user?.id === targetUserId) {
          try { clientWs.send(blockedPayload); } catch (_) {}
        }
        if (isUserAdmin(clientWs.user)) {
          try { clientWs.send(adminSyncPayload); } catch (_) {}
        }
      }
    });
  });

  const currentActive = getActiveUsersList();

  dispatchChatBlockAlertToTelegram({
    targetUser: targetDetails,
    block: true,
    admin: { name: adminInfo.name || "Telegram Bot Admin", ip: adminInfo.ip || "Telegram API" },
    activeUsers: currentActive,
  }).catch(() => {});

  return { success: true, targetUser: targetDetails, activeCount: currentActive.length };
}

/**
 * ✅ Helper: Unblocks a user directly via Telegram Chat Bot command (by Mobile, Email, or ID)
 */
async function handleUnblockUserFromTelegram(query, adminInfo = {}) {
  if (!query || !String(query).trim()) {
    return { success: false, message: "Please specify student mobile number, email, or ID." };
  }
  const cleanQuery = String(query).trim().toLowerCase();

  let targetDetails = await resolveChatUserByQuery(query);
  let targetUserId = targetDetails?.id || null;

  if (!targetUserId) {
    for (const bId of blockedUsers) {
      if (bId.toLowerCase() === cleanQuery) {
        targetUserId = bId;
        break;
      }
    }
  }

  if (!targetUserId) {
    targetUserId = String(query).trim();
  }

  blockedUsers.delete(targetUserId);

  if (db) {
    await db.collection("settings").doc("chat_blocked_users").set({
      userIds: Array.from(blockedUsers),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});

    if (!targetDetails) {
      try {
        const uSnap = await db.collection("users").doc(targetUserId).get();
        if (uSnap.exists) {
          const d = uSnap.data() || {};
          targetDetails = {
            id: targetUserId,
            name: d.name || "Student",
            email: d.email || "N/A",
            mobile: d.mobile ? decrypt(d.mobile) : "N/A",
          };
        }
      } catch (_) {}
    }
  }

  if (!targetDetails) {
    targetDetails = { id: targetUserId, name: "Student", email: "N/A", mobile: "N/A" };
  }

  const unblockedPayload = JSON.stringify({
    type: "blocked_status_update",
    isBlocked: false,
    message: "Your chat participation permissions have been restored.",
  });

  const adminSyncPayload = JSON.stringify({
    type: "admin_blocked_users_update",
    blockedUserIds: Array.from(blockedUsers),
    targetUserId,
    isBlocked: false,
  });

  roomSockets.forEach((socketsMap) => {
    socketsMap.forEach((clientWs) => {
      if (clientWs && clientWs.readyState === 1) {
        if (clientWs.user?.id === targetUserId) {
          try { clientWs.send(unblockedPayload); } catch (_) {}
        }
        if (isUserAdmin(clientWs.user)) {
          try { clientWs.send(adminSyncPayload); } catch (_) {}
        }
      }
    });
  });

  const currentActive = getActiveUsersList();

  dispatchChatBlockAlertToTelegram({
    targetUser: targetDetails,
    block: false,
    admin: { name: adminInfo.name || "Telegram Bot Admin", ip: adminInfo.ip || "Telegram API" },
    activeUsers: currentActive,
  }).catch(() => {});

  return { success: true, targetUser: targetDetails, activeCount: currentActive.length };
}

/**
 * 🧹 Helper: Deletes ALL messages sent by a specific student across chat (via Telegram Bot)
 * Accepts student Mobile Number, Email, or User ID.
 */
async function handleDeleteAllUserMessagesFromTelegram(query, adminInfo = {}) {
  if (!query || !String(query).trim()) {
    return { success: false, message: "Please specify student mobile number, email, or ID." };
  }

  const resolvedUser = await resolveChatUserByQuery(query);
  const targetUserId = resolvedUser?.id || String(query).trim();
  const targetEmailLower = resolvedUser?.email && resolvedUser.email !== "N/A"
    ? String(resolvedUser.email).toLowerCase()
    : (String(query).includes("@") ? String(query).trim().toLowerCase() : "");

  const deletedMessageIds = new Set();
  let ramDeletedCount = 0;

  // 1. Purge from all active in-memory rooms & broadcast immediate removal to connected clients
  for (const [rId, msgs] of activeMessages.entries()) {
    if (!Array.isArray(msgs) || msgs.length === 0) continue;
    const remaining = [];
    let roomDeleted = 0;
    for (const m of msgs) {
      const sId = m.sender?.id ? String(m.sender.id) : "";
      const sEmail = m.sender?.email ? String(m.sender.email).toLowerCase() : "";
      if (sId === String(targetUserId) || (targetEmailLower && sEmail === targetEmailLower)) {
        deletedMessageIds.add(String(m.id));
        roomDeleted++;
      } else {
        remaining.push(m);
      }
    }
    if (roomDeleted > 0) {
      activeMessages.set(rId, remaining);
      ramDeletedCount += roomDeleted;
      broadcastToRoom(rId, {
        type: "user_messages_purged",
        roomId: rId,
        targetUserId: String(targetUserId),
        deletedCount: roomDeleted,
        purgedBy: { id: "admin", name: adminInfo.name || "Telegram Bot Admin" },
      });
    }
  }

  // Always broadcast to public hall even if scrolled out of RAM so any client holding older messages purges them
  if (ramDeletedCount === 0) {
    broadcastToRoom(PUBLIC_ROOM_ID, {
      type: "user_messages_purged",
      roomId: PUBLIC_ROOM_ID,
      targetUserId: String(targetUserId),
      deletedCount: 0,
      purgedBy: { id: "admin", name: adminInfo.name || "Telegram Bot Admin" },
    });
  }

  // 2. Delete from Firestore chat_messages
  let firestoreDeletedCount = 0;
  if (db) {
    try {
      const snapById = await db.collection("chat_messages").where("sender.id", "==", String(targetUserId)).get();
      const docsToDelete = new Map();
      snapById.forEach((d) => docsToDelete.set(d.id, d.ref));

      if (targetEmailLower) {
        const snapByEmail = await db.collection("chat_messages").where("sender.email", "==", targetEmailLower).get();
        snapByEmail.forEach((d) => docsToDelete.set(d.id, d.ref));
      }

      if (docsToDelete.size > 0) {
        const allEntries = Array.from(docsToDelete.entries());
        for (const [docId] of allEntries) {
          deletedMessageIds.add(String(docId));
        }
        firestoreDeletedCount = allEntries.length;
        for (let i = 0; i < allEntries.length; i += 450) {
          const batch = db.batch();
          allEntries.slice(i, i + 450).forEach(([, ref]) => batch.delete(ref));
          await batch.commit();
        }
      }
    } catch (_) {}
  }

  // 3. Delete from Turso LibSQL chat_messages
  let tursoDeletedCount = 0;
  if (tursoClient) {
    try {
      const tRes = await tursoClient.execute({
        sql: "DELETE FROM chat_messages WHERE sender_id = ?",
        args: [String(targetUserId)],
      });
      tursoDeletedCount = Number(tRes?.rowsAffected || 0);
    } catch (_) {}
  }

  const totalDeleted = Math.max(deletedMessageIds.size, ramDeletedCount, firestoreDeletedCount, tursoDeletedCount);

  if (!resolvedUser && totalDeleted === 0) {
    return {
      success: false,
      message: `No student or messages found matching "${query}".`,
    };
  }

  const targetDetails = resolvedUser || {
    id: String(targetUserId),
    name: "Student",
    email: targetEmailLower || "N/A",
    mobile: "N/A",
  };

  dispatchChatPurgeAlertToTelegram({
    roomId: PUBLIC_ROOM_ID,
    roomName: "💬 Public & Study Rooms",
    admin: { name: adminInfo.name || "Telegram Bot Admin", ip: adminInfo.ip || "Telegram API" },
    details: `All ${totalDeleted} messages by ${targetDetails.name} (${targetDetails.email} | ${targetDetails.mobile}) were deleted via Telegram Bot.`,
  }).catch(() => {});

  return {
    success: true,
    targetUser: targetDetails,
    deletedCount: totalDeleted,
    deletedMessageIds: Array.from(deletedMessageIds),
  };
}

/**
 * 📋 Helper: Returns all blocked students with profile details
 */
async function getBlockedUsersList() {
  const list = [];
  for (const uid of blockedUsers) {
    let details = { id: uid, name: "Student", email: "N/A", mobile: "N/A" };
    if (db) {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        if (uSnap.exists) {
          const d = uSnap.data();
          details = {
            id: uid,
            name: d.name || "Student",
            email: d.email || "N/A",
            mobile: d.mobile ? decrypt(d.mobile) : "N/A",
            ip: d.lastLoginIp || "N/A",
          };
        }
      } catch (_) {}
    }
    list.push(details);
  }
  return list;
}

/**
 * 🗑️ Helper: Clears public chat messages via Telegram command
 */
async function handlePurgePublicChatFromTelegram(adminInfo = {}) {
  activeMessages.set("public", []);
  if (db) {
    try {
      const snap = await db.collection("chat_messages").where("roomId", "==", "public").get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (_) {}
  }
  try {
    getTursoClient().execute({ sql: "DELETE FROM chat_messages WHERE room_id = 'public'", args: [] }).catch(() => {});
  } catch (_) {}

  broadcastToRoom("public", {
    type: "complete_chat_purged",
    roomId: "public",
    message: "Public Community Chat history was cleared by Administrator.",
    purgedBy: { name: adminInfo.name || "Administrator" },
  });

  dispatchChatPurgeAlertToTelegram({
    roomId: "public",
    roomName: "🏛️ General Student Hall",
    admin: { name: adminInfo.name || "Telegram Bot Admin", email: "admin", ip: adminInfo.ip || "Telegram API" },
    count: "ALL",
  }).catch(() => {});

  return { success: true };
}

/**
 * ⚡ Real-Time Zero-Cost Remote Storage Wipe Dispatches
 * Zero database reads/writes, zero server CPU overhead. Dispatches directly over existing WebSockets.
 */
function broadcastRemoteStorageWipe({ studentId, email }) {
  if (!wssInstance || !wssInstance.clients) return false;
  let delivered = false;
  const targetId = String(studentId || "").trim();
  const targetEmail = String(email || "").trim().toLowerCase();

  wssInstance.clients.forEach((clientWs) => {
    if (clientWs && clientWs.readyState === 1 && clientWs.user) {
      const uid = String(clientWs.user.id || "").trim();
      const uemail = String(clientWs.user.email || "").trim().toLowerCase();
      if ((targetId && uid === targetId) || (targetEmail && uemail === targetEmail)) {
        try {
          clientWs.send(JSON.stringify({
            type: "remote_storage_wipe",
            targetUserId: uid,
            reason: "Administrator remote storage refresh",
            timestamp: new Date().toISOString(),
          }));
          delivered = true;
        } catch (_) {}
      }
    }
  });
  return delivered;
}

function broadcastRemoteStorageWipeAll(epoch = 1) {
  if (!wssInstance || !wssInstance.clients) return 0;
  let count = 0;
  const payload = JSON.stringify({
    type: "remote_storage_wipe_all",
    epoch,
    reason: "Global storage refresh to latest catalog epoch",
    timestamp: new Date().toISOString(),
  });

  wssInstance.clients.forEach((clientWs) => {
    if (clientWs && clientWs.readyState === 1) {
      try {
        clientWs.send(payload);
        count++;
      } catch (_) {}
    }
  });
  return count;
}

router.initChatWebSocket = initChatWebSocket;
router.purgeUserChatHistory = purgeUserChatHistory;
router.archiveAndPurgePrivateRoom = archiveAndPurgePrivateRoom;
router.getActiveChatStats = getActiveChatStats;
router.runRetentionPrune = runRetentionPrune;
router.runInactivityPurge = runInactivityPurge;
router.activeRooms = activeRooms;
router.activeMessages = activeMessages;
router.getActiveUsersList = getActiveUsersList;
router.handleBlockUserFromTelegram = handleBlockUserFromTelegram;
router.handleUnblockUserFromTelegram = handleUnblockUserFromTelegram;
router.getBlockedUsersList = getBlockedUsersList;
router.handlePurgePublicChatFromTelegram = handlePurgePublicChatFromTelegram;
router.broadcastRemoteStorageWipe = broadcastRemoteStorageWipe;
router.broadcastRemoteStorageWipeAll = broadcastRemoteStorageWipeAll;

module.exports = router;
