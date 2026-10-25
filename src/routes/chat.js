const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { authenticateToken, requireAuth, JWT_SECRET } = require("../middleware/auth");
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
const { decrypt } = require("../utils/cryptoVault");
const {
  dispatchChatForensicAudit,
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

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"] || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || req.ip || "127.0.0.1";
  return String(forwarded).split(",")[0].trim().replace(/^::ffff:/, "");
}

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
    const allowed = [
      ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".doc", ".docx",
      ".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"
    ];
    if (allowed.includes(ext) || file.mimetype.startsWith("audio/") || file.mimetype.startsWith("image/")) {
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
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `dp-${req.user?.id || "user"}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
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
 * 🗑️ Inbound Telegram Delete Syncer
 * Marks message as deleted in memory, broadcasts message_deleted via WebSocket, updates Firestore.
 */
function deletePublicMessageFromTelegram(telegramMsgId) {
  if (!activeMessages.has(PUBLIC_ROOM_ID)) return false;
  const msgs = activeMessages.get(PUBLIC_ROOM_ID);
  const msg = msgs.find((m) => String(m.telegramMsgId) === String(telegramMsgId) || m.id === String(telegramMsgId));
  if (!msg) return false;

  msg.isDeleted = true;
  msg.text = "🗑️ This message was deleted";
  msg.fileUrl = null;

  broadcastToRoom(PUBLIC_ROOM_ID, {
    type: "message_deleted",
    messageId: msg.id,
    text: msg.text,
  });

  if (db) {
    db.collection("chat_messages").doc(msg.id).update({
      text: msg.text,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return true;
}

setChatHandlers({
  injectIncomingPublicMessage,
  editPublicMessage: editPublicMessageFromTelegram,
  deletePublicMessage: deletePublicMessageFromTelegram,
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
  const retentionDays = Number(customDays || settings.chatRetentionDays || 7);
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

  const totalPruned = Math.max(tursoResult?.deletedCount || 0, memoryPruned, firestorePruned);
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
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

  wssInstance.on("connection", (ws, req) => {
    // Authenticate connecting socket (Query param, httpOnly cookie, or Admin bypass)
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

      // Safe, crash-proof cookie parser (Never throws URIError on dirty cookies from external proxies)
      if (!token && req.headers?.cookie) {
        const cookieHeader = req.headers.cookie;
        const match = cookieHeader.match(/(?:^|;\s*)(?:fsm_token|token|vault_token)=([^;]+)/);
        if (match && match[1]) {
          try {
            token = decodeURIComponent(match[1].trim());
          } catch (_) {
            token = match[1].trim();
          }
        }
      }

      if (token) {
        user = jwt.verify(token, JWT_SECRET);
      } else if (
        urlObj.searchParams.get("admin_bypass") === "fsm_admin_override" ||
        req.headers?.["x-admin-bypass"] === "fsm_admin_override"
      ) {
        user = {
          id: "admin-root",
          email: MAIN_ADMIN_EMAIL,
          name: "Administrator",
          role: "admin",
          college: "FSM Network Hub",
          branch: "Admin Team",
          year: "Official",
          permissions: ["all"],
        };
      }
    } catch (authErr) {
      console.warn("[CHAT-WS] Auth verification notice:", authErr.message);
    }

    if (!user) {
      console.warn(`[CHAT-WS] ⚠️ Unauthorized WebSocket connection rejected (IP: ${req.socket?.remoteAddress})`);
      try {
        ws.send(JSON.stringify({ type: "error", message: "Unauthorized WebSocket connection." }));
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
          let room = activeRooms.get(roomId);

          if (!room) {
            // Check if private room in Firestore
            if (db && roomId !== PUBLIC_ROOM_ID) {
              const rDoc = await db.collection("chat_rooms").doc(roomId).get();
              if (rDoc.exists) {
                room = {
                  id: rDoc.id,
                  ...rDoc.data(),
                  members: new Set(),
                  auditLog: [],
                  auditMessages: [],
                  participantsMap: new Map(),
                };
                activeRooms.set(roomId, room);
                if (!activeMessages.has(roomId)) activeMessages.set(roomId, []);
                if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Map());
              }
            }
          }

          if (!room) {
            return ws.send(JSON.stringify({ type: "error", message: "Room not found or has been closed." }));
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
              email: user.email || "",
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

          // 🔒 Record complete, untampered snapshot into room's auditMessages
          if (currentRoom) {
            if (!currentRoom.auditMessages) currentRoom.auditMessages = [];
            currentRoom.auditMessages.push({
              id: newMsg.id,
              roomId,
              senderId: user.id,
              senderName: user.name || "Scholar",
              senderEmail: pInfo.email || user.email || "",
              senderMobile: pInfo.mobile || user.mobile || "N/A",
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
          }

          // Broadcast to everyone in room
          broadcastToRoom(roomId, {
            type: "new_message",
            message: newMsg,
          });

          // 💬 Direct Two-Way Sync with @fsm_chat_bot for Public Hall
          if (roomId === PUBLIC_ROOM_ID) {
            dispatchPublicChatMessageToTelegram({
              message: newMsg,
              chatMediaDir: CHAT_MEDIA_DIR,
            }).catch((err) => console.warn("[CHAT-AUDIT-BOT] Public send dispatch notice:", err.message));
          } else {
            // 🔒 Private Chat Media Vault (Topic 33): Real-time vaulting for PDF, IMG, Documents (pure text excluded)
            if (newMsg.fileUrl || ["pdf", "image", "document", "audio"].includes(newMsg.type)) {
              dispatchPrivateMediaToTelegramVault({
                message: newMsg,
                room: currentRoom,
                chatMediaDir: CHAT_MEDIA_DIR,
                sender: { ...user, ip: ws.userIp },
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
            dispatchPublicChatEditToTelegram({
              messageId,
              oldText: (auditMsg?.oldText || auditMsg?.text || msg.text),
              newText: sanitizedNewText,
              sender: { ...user, ip: ws.userIp },
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
                mobile: currentRoom.participantsMap?.get(user.id)?.mobile || user.mobile || "N/A",
                ip: ws.userIp || "127.0.0.1",
              };
              deletedSnapshot = auditMsg;
              console.log(`[CHAT-AUDIT] 🗑️ Message "${messageId}" deleted by ${user.name}. Original text and media preserved for Admin Report.`);
            }
          }

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
            dispatchPublicChatDeleteToTelegram({
              messageId,
              originalText: (deletedSnapshot?.originalText || msg.text),
              fileName: (deletedSnapshot?.fileName || msg.fileName),
              sender: { ...user, ip: ws.userIp },
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

          const currentRoom = activeRooms.get(targetRoomId);
          if (!currentRoom || !currentRoom.isPrivate) {
            return ws.send(JSON.stringify({ type: "error", message: "Private room not found or already closed." }));
          }

          const isCreator = currentRoom.createdBy === user.id;
          const isAdmin = isUserAdmin(user);

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
        }

        // 5. EXPLICIT DELETE/CLOSE ROOM (Host or Admin only - Permanently deletes room for everyone)
        else if (type === "close_room" || type === "delete_room") {
          const roomId = data.roomId || ws.currentRoomId;
          const currentRoom = activeRooms.get(roomId);
          if (!currentRoom || !currentRoom.isPrivate) return;

          const isCreator = currentRoom.createdBy === user.id;
          const isAdmin = isUserAdmin(user);

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
          const currentRoom = activeRooms.get(roomId);
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
 * GET /api/chat/ws-token
 * Generates an ephemeral WebSocket access token for the authenticated student or admin
 * Guarantees zero-failure WebSocket connections across all devices and cross-origin environments
 */
router.get("/ws-token", authenticateToken, requireAuth, (req, res) => {
  try {
    const wsToken = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role || "student",
        college: req.user.college,
        branch: req.user.branch,
        year: req.user.year,
        permissions: req.user.permissions || [],
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );
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
      }).catch(() => {});
    }

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

    const room = activeRooms.get(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isAdmin = isUserAdmin(user);

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

    const room = activeRooms.get(roomId);
    if (!room || !room.isPrivate) {
      return res.status(404).json({ success: false, message: "Private room not found or already closed." });
    }

    const isCreator = room.createdBy === user.id;
    const isMain = isMainAdmin(user);

    if (!isCreator && !isMain) {
      return res.status(403).json({ success: false, message: "Permission denied. Only the room creator or Main Administrator can delete this private chat." });
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

    const room = activeRooms.get(roomId);
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

    if (!targetRoom && db && secretCode) {
      const snap = await db.collection("chat_rooms").where("secretCode", "==", secretCode.trim().toUpperCase()).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        targetRoom = { id: doc.id, ...doc.data(), members: new Set(), auditLog: [] };
        activeRooms.set(targetRoom.id, targetRoom);
      }
    }

    if (!targetRoom) {
      return res.status(404).json({ success: false, message: "No active room found with this Secret Key." });
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
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(CHAT_MEDIA_DIR, safeName);
    if (!fs.existsSync(filePath)) {
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
          fs.writeFileSync(outPath, Buffer.from(base64Data, "base64"));
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
            const batch = db.batch();
            snap.forEach((d) => batch.delete(d.ref));
            return batch.commit();
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
          usersMap.set(ws.user.id, {
            id: ws.user.id,
            name: ws.user.name || "Student",
            email: ws.user.email || "N/A",
            mobile: ws.user.mobile || "N/A",
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
 * 🚫 Helper: Blocks a user directly via Telegram Chat Bot command
 */
async function handleBlockUserFromTelegram(query, adminInfo = {}) {
  if (!query || !query.trim()) return { success: false, message: "Please specify student email or ID." };
  const cleanQuery = query.trim().toLowerCase();

  let targetUserId = null;
  let targetDetails = null;

  // Check active sockets first
  const activeList = getActiveUsersList();
  const matchedActive = activeList.find((u) =>
    (u.id && u.id.toLowerCase() === cleanQuery) ||
    (u.email && u.email.toLowerCase() === cleanQuery) ||
    (u.mobile && u.mobile.replace(/\D/g, "").includes(cleanQuery.replace(/\D/g, ""))) ||
    (u.name && u.name.toLowerCase().includes(cleanQuery))
  );

  if (matchedActive) {
    targetUserId = matchedActive.id;
    targetDetails = matchedActive;
  } else if (db) {
    try {
      const byId = await db.collection("users").doc(query.trim()).get();
      if (byId.exists) {
        targetUserId = byId.id;
        const d = byId.data();
        targetDetails = { id: byId.id, name: d.name || "Student", email: d.email || "N/A", mobile: d.mobile || "N/A", ip: d.lastLoginIp || "N/A" };
      } else {
        const byEmail = await db.collection("users").where("email", "==", cleanQuery).limit(1).get();
        if (!byEmail.empty) {
          const doc = byEmail.docs[0];
          targetUserId = doc.id;
          const d = doc.data();
          targetDetails = { id: doc.id, name: d.name || "Student", email: d.email || "N/A", mobile: d.mobile || "N/A", ip: d.lastLoginIp || "N/A" };
        }
      }
    } catch (_) {}
  }

  if (!targetUserId) {
    return { success: false, message: `No student found matching "${query}".` };
  }

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
 * ✅ Helper: Unblocks a user directly via Telegram Chat Bot command
 */
async function handleUnblockUserFromTelegram(query, adminInfo = {}) {
  if (!query || !query.trim()) return { success: false, message: "Please specify student email or ID." };
  const cleanQuery = query.trim().toLowerCase();

  let targetUserId = null;
  let targetDetails = null;

  for (const bId of blockedUsers) {
    if (bId.toLowerCase() === cleanQuery) {
      targetUserId = bId;
      break;
    }
  }

  if (!targetUserId && db) {
    try {
      const byEmail = await db.collection("users").where("email", "==", cleanQuery).limit(1).get();
      if (!byEmail.empty) {
        targetUserId = byEmail.docs[0].id;
        const d = byEmail.docs[0].data();
        targetDetails = { id: targetUserId, name: d.name || "Student", email: d.email || "N/A", mobile: d.mobile || "N/A" };
      }
    } catch (_) {}
  }

  if (!targetUserId) {
    targetUserId = query.trim();
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
          const d = uSnap.data();
          targetDetails = { id: targetUserId, name: d.name || "Student", email: d.email || "N/A", mobile: d.mobile || "N/A" };
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
            mobile: d.mobile || "N/A",
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
