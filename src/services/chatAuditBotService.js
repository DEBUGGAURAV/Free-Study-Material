/**
 * ============================================================================
 * 🤖 DEDICATED TELEGRAM CHAT AUDIT & FORENSIC BOT ENGINE
 * Bot: @fsm_chat_bot (Free Study Material Chat)
 * ============================================================================
 * Features:
 * 1. Automatic Supergroup & Forum Topic Discovery & Setup (6 Topics)
 * 2. Dedicated topics: Pod Audits, Media Vault, Deleted Log, Presence, Stealth, Public Chat
 * 3. Direct Two-Way Public Chat Sync with @fsm_chat_bot (Read/Write/Edit/Delete, Images, PDFs)
 * 4. Dual-delivery: Sends to both Supergroup Topics and Admin Direct Message
 * 5. Configurable Message Retention & 7-Day Inactivity Auto-Purge Guardian
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

const BOT_TOKEN = (process.env.TELEGRAM_CHAT_AUDIT_BOT_TOKEN || "").trim();
let activeAdminId = (process.env.TELEGRAM_CHAT_AUDIT_ADMIN_ID || "").trim();
const BOT_USERNAME = "fsm_chat_bot";

let supergroupId = (process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "").trim();
let auditTopics = {
  podAudits: process.env.TELEGRAM_CHAT_TOPIC_POD_AUDITS || "31",
  mediaVault: process.env.TELEGRAM_CHAT_TOPIC_MEDIA_VAULT || "33",
  deletedMessages: process.env.TELEGRAM_CHAT_TOPIC_DELETED || "35",
  tamperAudit: process.env.TELEGRAM_CHAT_TOPIC_TAMPER_AUDIT || "35",
  forensicPurge: process.env.TELEGRAM_CHAT_TOPIC_FORENSIC_PURGE || "72",
  presence: process.env.TELEGRAM_CHAT_TOPIC_PRESENCE || "37",
  stealth: process.env.TELEGRAM_CHAT_TOPIC_STEALTH || "39",
  publicChat: process.env.TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT || "39",
};

let pollerRunning = false;
let lastUpdateId = 0;

let dbRef = null;
try {
  const { db } = require("../firebase");
  dbRef = db;
} catch {}

// Controller Settings for Chat Bot
let chatBotSettings = {
  enableChatAudit: true,
  enableMediaVaultUpload: true,
  enableDeletedMessageAlerts: true,
  enablePublicChatSync: true,
  enableAdminDmMirror: true,
  chatRetentionDays: 7, // Delete messages older than X days
  privateRoomInactivityDays: 7, // Purge private rooms with no activity for 7 days
  adminId: activeAdminId || "",
  supergroupId: supergroupId || "",
  topics: {
    podAudits: auditTopics.podAudits,
    mediaVault: auditTopics.mediaVault,
    deletedMessages: auditTopics.deletedMessages,
    tamperAudit: auditTopics.tamperAudit,
    forensicPurge: auditTopics.forensicPurge,
    presence: auditTopics.presence,
    stealth: auditTopics.stealth,
    publicChat: auditTopics.publicChat,
  },
  updatedAt: new Date().toISOString(),
};

// Registered external handlers from chat.js
let chatHandlers = {
  injectIncomingPublicMessage: null,
};

function setChatHandlers(handlers = {}) {
  chatHandlers = { ...chatHandlers, ...handlers };
}

/**
 * Initialize settings from Firestore doc settings/chat_bot
 */
async function initChatBotSettings() {
  if (!dbRef) return chatBotSettings;
  try {
    const doc = await dbRef.collection("settings").doc("chat_bot").get();
    if (doc.exists) {
      const data = doc.data() || {};
      chatBotSettings = {
        ...chatBotSettings,
        ...data,
        topics: {
          ...chatBotSettings.topics,
          ...(data.topics || {}),
        },
      };
      if (chatBotSettings.adminId) {
        activeAdminId = String(chatBotSettings.adminId).trim();
      }
      if (chatBotSettings.supergroupId) supergroupId = chatBotSettings.supergroupId;
      if (chatBotSettings.topics) {
        auditTopics = { ...auditTopics, ...chatBotSettings.topics };
      }
      console.log("[CHAT-AUDIT-BOT] ⚙️ Loaded settings from Firestore doc settings/chat_bot.");
    } else {
      await dbRef.collection("settings").doc("chat_bot").set(chatBotSettings, { merge: true });
    }
  } catch (err) {
    console.warn("[CHAT-AUDIT-BOT] Settings initialization notice:", err.message);
  }
  return chatBotSettings;
}
initChatBotSettings();

function getChatBotSettings() {
  return {
    ...chatBotSettings,
    adminId: chatBotSettings.adminId || activeAdminId,
    supergroupId,
    topics: { ...auditTopics },
  };
}

async function updateChatBotSettings(updates = {}) {
  chatBotSettings = {
    ...chatBotSettings,
    ...updates,
    topics: {
      ...chatBotSettings.topics,
      ...(updates.topics || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  if (updates.adminId !== undefined) {
    activeAdminId = String(updates.adminId).trim();
    chatBotSettings.adminId = activeAdminId;
    updateEnvFile("TELEGRAM_CHAT_AUDIT_ADMIN_ID", activeAdminId);
  }

  if (chatBotSettings.supergroupId) {
    supergroupId = String(chatBotSettings.supergroupId).trim();
    updateEnvFile("TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID", supergroupId);
  }
  if (chatBotSettings.topics) {
    auditTopics = { ...auditTopics, ...chatBotSettings.topics };
    if (chatBotSettings.topics.podAudits) updateEnvFile("TELEGRAM_CHAT_TOPIC_POD_AUDITS", chatBotSettings.topics.podAudits);
    if (chatBotSettings.topics.mediaVault) updateEnvFile("TELEGRAM_CHAT_TOPIC_MEDIA_VAULT", chatBotSettings.topics.mediaVault);
    if (chatBotSettings.topics.deletedMessages) updateEnvFile("TELEGRAM_CHAT_TOPIC_DELETED", chatBotSettings.topics.deletedMessages);
    if (chatBotSettings.topics.tamperAudit) updateEnvFile("TELEGRAM_CHAT_TOPIC_TAMPER_AUDIT", chatBotSettings.topics.tamperAudit);
    if (chatBotSettings.topics.forensicPurge) updateEnvFile("TELEGRAM_CHAT_TOPIC_FORENSIC_PURGE", chatBotSettings.topics.forensicPurge);
    if (chatBotSettings.topics.presence) updateEnvFile("TELEGRAM_CHAT_TOPIC_PRESENCE", chatBotSettings.topics.presence);
    if (chatBotSettings.topics.stealth) updateEnvFile("TELEGRAM_CHAT_TOPIC_STEALTH", chatBotSettings.topics.stealth);
    if (chatBotSettings.topics.publicChat) updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", chatBotSettings.topics.publicChat);
  }

  if (dbRef) {
    try {
      await dbRef.collection("settings").doc("chat_bot").set(chatBotSettings, { merge: true });
    } catch (e) {
      console.warn("[CHAT-AUDIT-BOT] Failed saving settings to Firestore:", e.message);
    }
  }
  return chatBotSettings;
}

/**
 * Helper to call Telegram Bot API
 */
async function callTelegram(method, body = {}) {
  if (!BOT_TOKEN) return { ok: false, error: "BOT_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.warn(`[CHAT-AUDIT-BOT] API error on ${method}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Updates .env file with new supergroup ID or topic IDs
 */
function updateEnvFile(key, value) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, "utf8");
    const regex = new RegExp(`^${key}\\s*=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, content, "utf8");
    process.env[key] = value;
  } catch (err) {
    console.warn(`[CHAT-AUDIT-BOT] Failed to write ${key} to .env:`, err.message);
  }
}

/**
 * Automatically creates all Forum Topics in the provided Supergroup
 * @param {string|number} chatId - Target Supergroup Chat ID (e.g. -100...)
 */
async function autoCreateTopicsForSupergroup(chatId) {
  const cleanChatId = String(chatId).trim();
  console.log(`[CHAT-AUDIT-BOT] 🛠️ Initializing 6 Forum Topics in Supergroup ${cleanChatId}...`);

  const topicConfigs = [
    { key: "podAudits", name: "📜 Pod Audits & Transcripts", color: 7322096 },
    { key: "mediaVault", name: "📎 Original Media Vault (PDF & IMG)", color: 16766590 },
    { key: "deletedMessages", name: "⚠️ Deleted Messages & Tamper Log", color: 16749490 },
    { key: "forensicPurge", name: "🚨 Forensic & Purge Dossier", color: 16749490 },
    { key: "presence", name: "👥 Student Presence & Session Logs", color: 9367192 },
    { key: "stealth", name: "👻 Admin Stealth Mode Alerts", color: 13338331 },
    { key: "publicChat", name: "💬 Public Community Chat", color: 5322744 },
  ];

  const createdTopics = {};

  for (const conf of topicConfigs) {
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const res = await callTelegram("createForumTopic", {
          chat_id: cleanChatId,
          name: conf.name,
          icon_color: conf.color,
        });

        if (res.ok && res.result?.message_thread_id) {
          const threadId = String(res.result.message_thread_id);
          createdTopics[conf.key] = threadId;
          console.log(`[CHAT-AUDIT-BOT] ✅ Created topic: "${conf.name}" -> Thread ID: ${threadId}`);

          // Post welcome message in topic
          await callTelegram("sendMessage", {
            chat_id: cleanChatId,
            message_thread_id: threadId,
            text: `🟢 <b>${conf.name} Activated</b>\n\nChannel configured for real-time archival and public two-way sync with Academic Cloud.`,
            parse_mode: "HTML",
          });
          await new Promise((r) => setTimeout(r, 1200));
          break;
        } else if (res.error_code === 429 && res.parameters?.retry_after) {
          const waitSec = res.parameters.retry_after + 1;
          console.log(`[CHAT-AUDIT-BOT] ⏳ Telegram rate-limited. Waiting ${waitSec}s before creating "${conf.name}"...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        } else {
          console.warn(`[CHAT-AUDIT-BOT] ⚠️ Could not create topic "${conf.name}":`, res.description);
          break;
        }
      } catch (e) {
        console.warn(`[CHAT-AUDIT-BOT] Error creating topic ${conf.name}:`, e.message);
        break;
      }
    }
  }

  // Update in-memory state
  supergroupId = cleanChatId;
  auditTopics = { ...auditTopics, ...createdTopics };
  chatBotSettings.supergroupId = cleanChatId;
  chatBotSettings.topics = { ...chatBotSettings.topics, ...createdTopics };

  // Persist to .env and Firestore
  updateEnvFile("TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID", cleanChatId);
  if (createdTopics.podAudits) updateEnvFile("TELEGRAM_CHAT_TOPIC_POD_AUDITS", createdTopics.podAudits);
  if (createdTopics.mediaVault) updateEnvFile("TELEGRAM_CHAT_TOPIC_MEDIA_VAULT", createdTopics.mediaVault);
  if (createdTopics.deletedMessages) updateEnvFile("TELEGRAM_CHAT_TOPIC_DELETED", createdTopics.deletedMessages);
  if (createdTopics.presence) updateEnvFile("TELEGRAM_CHAT_TOPIC_PRESENCE", createdTopics.presence);
  if (createdTopics.stealth) updateEnvFile("TELEGRAM_CHAT_TOPIC_STEALTH", createdTopics.stealth);
  if (createdTopics.publicChat) updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", createdTopics.publicChat);

  if (dbRef) {
    dbRef.collection("settings").doc("chat_bot").set(chatBotSettings, { merge: true }).catch(() => {});
  }

  // Send Admin summary message
  await callTelegram("sendMessage", {
    chat_id: cleanChatId,
    text: `🎉 <b>Free Study Material Chat Audit Vault Initialized!</b>\n\n` +
      `🛡️ <b>Supergroup ID:</b> <code>${cleanChatId}</code>\n` +
      `📁 <b>6 Forensic & Sync Topics Active:</b>\n` +
      `• 📜 Pod Audits: Thread <code>${createdTopics.podAudits || "N/A"}</code>\n` +
      `• 📎 Media Vault (Original Files): Thread <code>${createdTopics.mediaVault || "N/A"}</code>\n` +
      `• ⚠️ Deleted Messages: Thread <code>${createdTopics.deletedMessages || "N/A"}</code>\n` +
      `• 👥 Student Presence: Thread <code>${createdTopics.presence || "N/A"}</code>\n` +
      `• 👻 Admin Stealth: Thread <code>${createdTopics.stealth || "N/A"}</code>\n` +
      `• 💬 Public Community Chat: Thread <code>${createdTopics.publicChat || "N/A"}</code>\n\n` +
      `All future private group purges, public chat sync & original media will be processed here!`,
    parse_mode: "HTML",
  });

  return { success: true, supergroupId: cleanChatId, topics: createdTopics };
}

/**
 * Download a file from Telegram and save to local chat media cache
 */
async function downloadTelegramFile(fileId, targetFilename) {
  if (!BOT_TOKEN || !fileId) return null;
  try {
    const fileRes = await callTelegram("getFile", { file_id: fileId });
    if (!fileRes.ok || !fileRes.result?.file_path) {
      console.warn("[CHAT-AUDIT-BOT] getFile failed:", fileRes.description);
      return null;
    }

    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileRes.result.file_path}`;
    const resp = await fetch(downloadUrl);
    if (!resp.ok) return null;

    const arrBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrBuf);

    const cacheDir = path.join(process.cwd(), "cache", "chat_media");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const savePath = path.join(cacheDir, targetFilename);
    fs.writeFileSync(savePath, buffer);
    return `/api/chat/media/${targetFilename}`;
  } catch (err) {
    console.warn("[CHAT-AUDIT-BOT] File download error:", err.message);
    return null;
  }
}

/**
 * Handle incoming updates from Telegram Long Polling
 */
async function processUpdate(update) {
  if (!update) return;

  try {
    // 1b. Callback queries from inline buttons (Direct Admin interactive actions)
    if (update.callback_query) {
      const cb = update.callback_query;
      const cbId = cb.id;
      const fromId = String(cb.from?.id || "");
      const data = cb.data || "";
      const chatId = cb.message?.chat?.id || fromId;

      try {
        await callTelegram("answerCallbackQuery", { callback_query_id: cbId });
      } catch (_) {}

      if (data === "cmd_active") {
        const activeUsers = typeof chatHandlers.getActiveUsers === "function" ? chatHandlers.getActiveUsers() : [];
        let msg = "";
        if (activeUsers.length === 0) {
          msg = "👥 <b>Active Online Students:</b>\n\nNo students are currently connected to live chat.";
        } else {
          const lines = activeUsers.map((u, i) =>
            `<b>${i + 1}. ${escapeHtml(u.name || "Student")}</b>\n` +
            `   📧 <code>${escapeHtml(u.email || "N/A")}</code>\n` +
            `   📱 Mobile: <code>${escapeHtml(u.mobile || "N/A")}</code>\n` +
            `   🏠 Room: <code>${escapeHtml(u.roomName || u.roomId || "General")}</code>\n` +
            `   🌐 IP: <code>${escapeHtml(u.ip || "N/A")}</code>`
          ).join("\n\n");
          msg = `👥 <b>LIVE ACTIVE STUDENTS IN CHAT (${activeUsers.length} Online):</b>\n\n${lines}`;
        }
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: msg,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Refresh Active List", callback_data: "cmd_active" },
                { text: "📋 Blocked Students", callback_data: "cmd_blocked" },
              ],
            ],
          },
        });
        return;
      }

      if (data === "cmd_blocked") {
        const blocked = typeof chatHandlers.getBlockedUsers === "function" ? await chatHandlers.getBlockedUsers() : [];
        if (blocked.length === 0) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: "✅ <b>No Students Currently Blocked:</b>\n\nAll registered students currently have active chat permissions.",
            parse_mode: "HTML",
          });
        } else {
          const lines = blocked.map((u, i) =>
            `${i + 1}. <b>${escapeHtml(u.name || "Student")}</b> (<code>${escapeHtml(u.email || u.id)}</code>)`
          ).join("\n");
          const inlineKb = blocked.slice(0, 8).map((u) => [
            { text: `✅ Unblock ${u.name || u.email}`, callback_data: `unblock_${u.id}` }
          ]);
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: `🚫 <b>RESTRICTED / BLOCKED STUDENTS (${blocked.length}):</b>\n\n${lines}\n\n<i>Tap a button below to unblock:</i>`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: inlineKb },
          });
        }
        return;
      }

      if (data === "cmd_inactive") {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⏳ <b>[STUDENT INACTIVITY & DATABASE DELETION POLICY]</b>\n\n` +
            `1️⃣ <b>30-Minute Chat Idle Timeout:</b>\n` +
            `• If a student remains idle in chat without interaction for 30 minutes, their WebSocket session is automatically disconnected to free server RAM and CPU.\n` +
            `• Instant report is dispatched to you with student's Name, Email, IP, and Room.\n\n` +
            `2️⃣ <b>90-Day Continuous Inactivity Database Purge:</b>\n` +
            `• Student accounts with no login activity for over 90 continuous days are permanently deleted from database.\n` +
            `• Their uploaded notes are safely preserved for other university scholars in the academic vault.\n\n` +
            `3️⃣ <b>Direct Chat Bot Commands:</b>\n` +
            `• <code>/active</code> - Live active online students\n` +
            `• <code>/block &lt;email or id&gt;</code> - Restrict a student\n` +
            `• <code>/unblock &lt;email or id&gt;</code> - Restore a student\n` +
            `• <code>/blocked</code> - List restricted students\n` +
            `• <code>/clearchat</code> - Purge public chat hall`,
          parse_mode: "HTML",
        });
        return;
      }

      if (data.startsWith("extend_user_") || data.startsWith("reduce_user_") || data.startsWith("immunity_user_")) {
        const parts = data.split("_");
        const actionType = parts[0];
        const targetUserId = parts[2];
        const days = parseInt(parts[3], 10) || 15;

        try {
          const { adjustUserInactivity } = require("./accountPurgeService");
          let act = actionType === "extend" ? "increase" : actionType === "reduce" ? "decrease" : "toggle_immunity";
          const res = await adjustUserInactivity(targetUserId, { action: act, days });
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: res.success
              ? `⏳ <b>[INACTIVITY THRESHOLD UPDATED]</b>\n\n` +
                `👤 <b>Student:</b> ${escapeHtml(res.userName || "Student")} (<code>${escapeHtml(res.userEmail || targetUserId)}</code>)\n` +
                `• ${escapeHtml(res.message)}\n` +
                `• 🗓️ <b>Scheduled Deletion:</b> <code>${res.scheduledPurgeDate}</code>`
              : `⚠️ ${res.message || "Failed to update days."}`,
            parse_mode: "HTML",
          });
        } catch (e) {
          await callTelegram("sendMessage", { chat_id: chatId, text: `⚠️ Error adjusting days: ${e.message}` });
        }
        return;
      }

      if (data.startsWith("toggle_block_") || data.startsWith("block_") || data.startsWith("unblock_")) {
        const isUnblock = data.startsWith("unblock_");
        const targetId = data.replace(/^(toggle_block_|block_|unblock_)/, "");
        if (isUnblock) {
          if (typeof chatHandlers.unblockUser === "function") {
            const res = await chatHandlers.unblockUser(targetId, { name: cb.from?.first_name || "Admin (Bot DM)", ip: "Telegram Bot" });
            await callTelegram("sendMessage", {
              chat_id: chatId,
              text: res.success ? `✅ Student unblocked successfully.` : `⚠️ ${res.message || "Failed to unblock."}`,
            });
          }
        } else {
          if (typeof chatHandlers.blockUser === "function") {
            const res = await chatHandlers.blockUser(targetId, { name: cb.from?.first_name || "Admin (Bot DM)", ip: "Telegram Bot" });
            await callTelegram("sendMessage", {
              chat_id: chatId,
              text: res.success ? `🚫 Student restricted from chat successfully.` : `⚠️ ${res.message || "Failed to block."}`,
            });
          }
        }
        return;
      }
    }

    // 1. Group membership updates: Bot added to group or supergroup
    const chatMember = update.my_chat_member;
    if (chatMember && chatMember.new_chat_member) {
      const status = chatMember.new_chat_member.status;
      const chat = chatMember.chat;
      if ((chat.type === "supergroup" || chat.type === "group") && (status === "administrator" || status === "member")) {
        console.log(`[CHAT-AUDIT-BOT] 🔔 Bot added to chat: "${chat.title}" (${chat.id}) as ${status}`);
        if (chat.type === "supergroup") {
          await autoCreateTopicsForSupergroup(chat.id);
        } else {
          await callTelegram("sendMessage", {
            chat_id: chat.id,
            text: `👋 <b>Hello! Please convert this group to a Supergroup with "Topics" enabled</b> so I can auto-create the 6 dedicated archival & public chat channels!`,
            parse_mode: "HTML",
          });
        }
        return;
      }
    }

    // 2. Incoming messages (Text, Photo, Document)
    const message = update.message;
    if (!message) return;

    // Ignore messages sent by bots (including ourselves) to eliminate infinite loops
    if (message.from?.is_bot) return;

    const chatId = message.chat?.id;
    const chatType = message.chat?.type;
    const text = (message.text || "").trim();
    const caption = (message.caption || "").trim();
    const threadId = message.message_thread_id ? String(message.message_thread_id) : null;
    const fromName = `${message.from?.first_name || ""} ${message.from?.last_name || ""}`.trim() || message.from?.username || "Admin";
    const fromId = String(message.from?.id || "");

    // Command: /start in DM
    if (chatType === "private" && (text === "/start" || text.startsWith("/start"))) {
      activeAdminId = String(chatId);
      chatBotSettings.adminId = String(chatId);
      updateEnvFile("TELEGRAM_CHAT_AUDIT_ADMIN_ID", String(chatId));
      if (dbRef) {
        dbRef.collection("settings").doc("chat_bot").set({ adminId: String(chatId) }, { merge: true }).catch(() => {});
      }
      console.log(`[CHAT-AUDIT-BOT] 🔗 Auto-linked Admin Telegram ID: ${chatId} from /start DM.`);

      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: `🛡️ <b>Free Study Material Direct Admin Bot Connected!</b>\n\n` +
          `✅ <b>Admin Telegram ID Linked:</b> <code>${chatId}</code>\n\n` +
          `🚀 <b>Direct 1-on-1 Bot Mode Active (No Supergroup Needed):</b>\n` +
          `• <b>Instant Inactivity Alerts:</b> 30-min idle timeouts with database deletion countdown arrive directly here.\n` +
          `• <b>Block/Unblock Audits:</b> Student restrictions with live online users list come straight to this chat.\n` +
          `• <b>Direct Moderation:</b> Block/unblock students, view live active users, or clear chat right from this bot.\n` +
          `• <b>Two-Way Public Chat Sync:</b> Any text, photo, or PDF you send without a slash (/) streams into the web Public Chat Hall with your <code>🛡️ Admin</code> badge!\n\n` +
          `📌 <i>Supergroup with topics is completely optional. You can manage everything right here!</i>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👥 Live Active Students", callback_data: "cmd_active" },
              { text: "📋 Blocked Students", callback_data: "cmd_blocked" },
            ],
            [
              { text: "⏳ Inactivity & Deletion Policy", callback_data: "cmd_inactive" },
              { text: "📖 Help & Commands", callback_data: "cmd_inactive" },
            ],
          ],
        },
      });
      return;
    }

    // Direct Admin Command: /active or /online or /users
    if (text === "/active" || text === "/online" || text === "/users") {
      const activeUsers = typeof chatHandlers.getActiveUsers === "function" ? chatHandlers.getActiveUsers() : [];
      let msg = "";
      if (activeUsers.length === 0) {
        msg = "👥 <b>Active Online Students:</b>\n\nNo students are currently connected to live chat.";
      } else {
        const lines = activeUsers.map((u, i) =>
          `<b>${i + 1}. ${escapeHtml(u.name || "Student")}</b>\n` +
          `   📧 <code>${escapeHtml(u.email || "N/A")}</code>\n` +
          `   📱 Mobile: <code>${escapeHtml(u.mobile || "N/A")}</code>\n` +
          `   🏠 Room: <code>${escapeHtml(u.roomName || u.roomId || "General")}</code>\n` +
          `   🌐 IP: <code>${escapeHtml(u.ip || "N/A")}</code>`
        ).join("\n\n");
        msg = `👥 <b>LIVE ACTIVE STUDENTS IN CHAT (${activeUsers.length} Online):</b>\n\n${lines}`;
      }
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: msg,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Refresh Active List", callback_data: "cmd_active" },
              { text: "📋 Blocked Students", callback_data: "cmd_blocked" },
            ],
          ],
        },
      });
      return;
    }

    // Direct Admin Command: /block <query>
    if (text.startsWith("/block ") || text === "/block") {
      const query = text.replace(/^\/block\s*/, "").trim();
      if (!query) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "ℹ️ <b>Usage:</b> <code>/block student_email_or_id</code>\n\nExample: <code>/block student@gmail.com</code>",
          parse_mode: "HTML",
        });
        return;
      }
      if (typeof chatHandlers.blockUser === "function") {
        const res = await chatHandlers.blockUser(query, { name: fromName, ip: "Telegram Bot Direct" });
        if (res.success) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: `🚫 <b>Student Restricted from Chat Successfully:</b>\n\n` +
              `👤 <b>Name:</b> ${escapeHtml(res.targetUser?.name || "Student")}\n` +
              `📧 <b>Email:</b> <code>${escapeHtml(res.targetUser?.email || "N/A")}</code>\n` +
              `📱 <b>Mobile:</b> <code>${escapeHtml(res.targetUser?.mobile || "N/A")}</code>\n` +
              `👥 <b>Live Active Students Online:</b> ${res.activeCount || 0}`,
            parse_mode: "HTML",
          });
        } else {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: `⚠️ <b>Block Failed:</b> ${escapeHtml(res.message || "Student not found.")}`,
            parse_mode: "HTML",
          });
        }
      }
      return;
    }

    // Direct Admin Command: /unblock <query>
    if (text.startsWith("/unblock ") || text === "/unblock") {
      const query = text.replace(/^\/unblock\s*/, "").trim();
      if (!query) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "ℹ️ <b>Usage:</b> <code>/unblock student_email_or_id</code>\n\nExample: <code>/unblock student@gmail.com</code>",
          parse_mode: "HTML",
        });
        return;
      }
      if (typeof chatHandlers.unblockUser === "function") {
        const res = await chatHandlers.unblockUser(query, { name: fromName, ip: "Telegram Bot Direct" });
        if (res.success) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: `✅ <b>Student Unblocked Successfully:</b>\n\n` +
              `👤 <b>Name:</b> ${escapeHtml(res.targetUser?.name || "Student")}\n` +
              `📧 <b>Email:</b> <code>${escapeHtml(res.targetUser?.email || "N/A")}</code>\n` +
              `Chat participation permissions have been restored.`,
            parse_mode: "HTML",
          });
        } else {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: `⚠️ <b>Unblock Failed:</b> ${escapeHtml(res.message || "Student not found.")}`,
            parse_mode: "HTML",
          });
        }
      }
      return;
    }

    // Direct Admin Command: /blocked
    if (text === "/blocked") {
      const blocked = typeof chatHandlers.getBlockedUsers === "function" ? await chatHandlers.getBlockedUsers() : [];
      if (blocked.length === 0) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "✅ <b>No Students Currently Blocked:</b>\n\nAll registered students currently have active chat permissions.",
          parse_mode: "HTML",
        });
      } else {
        const lines = blocked.map((u, i) =>
          `${i + 1}. <b>${escapeHtml(u.name || "Student")}</b> (<code>${escapeHtml(u.email || u.id)}</code>)`
        ).join("\n");
        const inlineKb = blocked.slice(0, 8).map((u) => [
          { text: `✅ Unblock ${u.name || u.email}`, callback_data: `unblock_${u.id}` }
        ]);
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `🚫 <b>RESTRICTED / BLOCKED STUDENTS (${blocked.length}):</b>\n\n${lines}\n\n<i>Tap button below or use /unblock &lt;email&gt;</i>`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inlineKb },
        });
      }
      return;
    }

    // Direct Admin Command: /inactive
    if (text === "/inactive" || text === "/timeouts") {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: `⏳ <b>[STUDENT INACTIVITY & DATABASE DELETION POLICY]</b>\n\n` +
          `1️⃣ <b>30-Minute Chat Idle Timeout:</b>\n` +
          `• If a student remains idle in chat without interaction for 30 minutes, their WebSocket session is automatically disconnected to free server RAM and CPU.\n` +
          `• Instant security report is dispatched to you with student's Name, Email, IP, and Room.\n\n` +
          `2️⃣ <b>90-Day Continuous Inactivity Database Purge:</b>\n` +
          `• Student accounts with no login activity for over 90 continuous days are permanently deleted from database.\n` +
          `• Uploaded notes are safely preserved for other university scholars.\n\n` +
          `3️⃣ <b>Direct Chat Bot Commands:</b>\n` +
          `• <code>/active</code> - Live active online students\n` +
          `• <code>/block &lt;email or id&gt;</code> - Restrict a student\n` +
          `• <code>/unblock &lt;email or id&gt;</code> - Restore a student\n` +
          `• <code>/blocked</code> - List restricted students\n` +
          `• <code>/clearchat</code> - Purge public chat hall`,
        parse_mode: "HTML",
      });
      return;
    }

    // Direct Admin Command: /clearchat or /purge
    if (text === "/clearchat" || text === "/purge") {
      if (typeof chatHandlers.purgePublicChat === "function") {
        await chatHandlers.purgePublicChat({ name: fromName, ip: "Telegram Bot Direct" });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "🗑️ <b>Public Community Chat Cleared:</b>\n\nAll messages have been purged from memory and database.",
          parse_mode: "HTML",
        });
      }
      return;
    }

    // Direct Admin Command: /extend <email/id> <days> (Increase or decrease days for a student)
    if (text.startsWith("/extend") || text.startsWith("/increase") || text.startsWith("/decrease")) {
      const parts = text.split(/\s+/);
      const isDecrease = text.startsWith("/decrease");
      const query = parts[1];
      const days = parseInt(parts[2], 10) || 15;
      if (!query) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `ℹ️ <b>Usage:</b> <code>/extend student@gmail.com 30</code>\nOr: <code>/decrease student@gmail.com 15</code>`,
          parse_mode: "HTML",
        });
        return;
      }

      try {
        let targetId = query;
        if (dbRef) {
          const uSnap = await dbRef.collection("users").get();
          uSnap.forEach((doc) => {
            const d = doc.data();
            if (doc.id === query || d.email?.toLowerCase() === query.toLowerCase() || d.mobile === query) {
              targetId = doc.id;
            }
          });
        }
        const { adjustUserInactivity } = require("./accountPurgeService");
        const res = await adjustUserInactivity(targetId, { action: isDecrease ? "decrease" : "increase", days });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⏳ <b>[STUDENT INACTIVITY THRESHOLD UPDATED]</b>\n\n` +
            `👤 <b>Student:</b> ${escapeHtml(res.userName || query)} (<code>${escapeHtml(res.userEmail || targetId)}</code>)\n` +
            `• ${escapeHtml(res.message)}\n` +
            `• 🗓️ <b>Scheduled Deletion:</b> <code>${res.scheduledPurgeDate}</code>`,
          parse_mode: "HTML",
        });
      } catch (e) {
        await callTelegram("sendMessage", { chat_id: chatId, text: `⚠️ Error updating user: ${e.message}` });
      }
      return;
    }

    // Direct Admin Command: /setinactivity <days> (Global default)
    if (text.startsWith("/setinactivity") || text.startsWith("/inactivitydays")) {
      const parts = text.split(/\s+/);
      const days = parseInt(parts[1], 10);
      if (!days || days < 1) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `ℹ️ <b>Usage:</b> <code>/setinactivity 90</code>\n(Sets the system-wide inactivity purge threshold in days)`,
          parse_mode: "HTML",
        });
        return;
      }

      try {
        const { setDefaultInactivityDays } = require("./accountPurgeService");
        const updated = await setDefaultInactivityDays(days);
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `✅ <b>System-Wide Inactivity Purge Limit Updated!</b>\n\n` +
            `• <b>New Default Threshold:</b> <b>${updated} Days</b>\n` +
            `• Accounts inactive beyond ${updated} days will be safely archived & purged.\n` +
            `• You can customize or extend days for any specific student anytime!`,
          parse_mode: "HTML",
        });
      } catch (e) {
        await callTelegram("sendMessage", { chat_id: chatId, text: `⚠️ Error: ${e.message}` });
      }
      return;
    }

    // Direct Admin Command: /help
    if (text === "/help" || text === "/commands") {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: `🤖 <b>@${BOT_USERNAME} Direct Admin Commands:</b>\n\n` +
          `• <code>/active</code> - View all live online students currently in chat\n` +
          `• <code>/block &lt;email/id&gt;</code> - Restrict a student from chat immediately\n` +
          `• <code>/unblock &lt;email/id&gt;</code> - Restore a student's chat permissions\n` +
          `• <code>/blocked</code> - List all currently restricted students\n` +
          `• <code>/inactive</code> - Check 30-min idle rules & 90-day database deletion countdown\n` +
          `• <code>/clearchat</code> - Purge all messages in Public Chat Hall\n` +
          `• <code>/help</code> - Show this commands manual\n\n` +
          `💬 <i>Any regular text, photo, or PDF you type without a slash (/) will be posted directly to the web Public Chat Hall as 🛡️ Admin!</i>`,
        parse_mode: "HTML",
      });
      return;
    }

    // Command: /setup or /init_topics in a group
    if (
      (chatType === "supergroup" || chatType === "group") &&
      (text === "/setup" || text === "/init_topics" || text.includes("/setup@" + BOT_USERNAME))
    ) {
      if (chatType === "supergroup") {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⚙️ Setting up 6 dedicated Forensic & Public Chat Topics now...`,
        });
        await autoCreateTopicsForSupergroup(chatId);
      } else {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⚠️ Please enable <b>Topics</b> in this group's settings to allow topic creation.`,
          parse_mode: "HTML",
        });
      }
      return;
    }

    // =========================================================================
    // 💬 TWO-WAY PUBLIC CHAT SYNC: TELEGRAM ➔ WEB
    // =========================================================================
    // Checks if incoming message is in General Student Hall topic OR sent in Direct Bot DM
    const effectiveAdminId = chatBotSettings.adminId || activeAdminId;
    const isPublicChatTopic = auditTopics.publicChat && threadId === String(auditTopics.publicChat);
    const isAdminDirectChat = chatType === "private" && (
      (effectiveAdminId && fromId === String(effectiveAdminId)) ||
      !effectiveAdminId // If no admin ID set yet, auto-accept and link on first direct message!
    ) && !text.startsWith("/");

    if (chatType === "private" && !effectiveAdminId && !text.startsWith("/")) {
      activeAdminId = String(chatId);
      chatBotSettings.adminId = String(chatId);
      updateEnvFile("TELEGRAM_CHAT_AUDIT_ADMIN_ID", String(chatId));
      if (dbRef) {
        dbRef.collection("settings").doc("chat_bot").set({ adminId: String(chatId) }, { merge: true }).catch(() => {});
      }
      console.log(`[CHAT-AUDIT-BOT] 🔗 Auto-linked Admin Telegram ID: ${chatId} on first DM message.`);
    }

    if (chatBotSettings.enablePublicChatSync && (isPublicChatTopic || isAdminDirectChat)) {
      if (typeof chatHandlers.injectIncomingPublicMessage === "function") {
        const msgId = `msg_sys_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const createdAt = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString();

        const adminDisplayName = fromName && fromName !== "Admin" ? `${fromName} (🛡️ Admin)` : "🛡️ Admin";
        const senderObj = {
          id: `sys_admin_${Buffer.from(String(fromId || "adm")).toString("hex").slice(0, 8)}`,
          name: adminDisplayName,
          role: "admin",
          isAdmin: true,
          branch: "Admin Team",
          year: "Official",
          college: "FSM Network Hub",
        };

        // Case A: Image / Photo sent from Telegram
        if (Array.isArray(message.photo) && message.photo.length > 0) {
          const largestPhoto = message.photo[message.photo.length - 1];
          const filename = `chat-media-img-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
          const fileUrl = await downloadTelegramFile(largestPhoto.file_id, filename);

          if (fileUrl) {
            const webMsg = {
              id: msgId,
              roomId: "public",
              text: caption || "🖼️ Photo Attachment",
              type: "image",
              fileUrl,
              fileName: `photo_${largestPhoto.file_unique_id || Date.now()}.jpg`,
              fileSize: largestPhoto.file_size || 0,
              sender: senderObj,
              createdAt,
              status: "delivered",
              readBy: [],
              isEdited: false,
              isDeleted: false,
            };
            chatHandlers.injectIncomingPublicMessage(webMsg);
            console.log(`[CHAT-SYNC] 📥 Synced Admin Photo from ${fromName} into Public Chat Hall.`);
            return;
          }
        }

        // Case B: Document (PDF, Word, etc.) sent from Telegram
        if (message.document) {
          const doc = message.document;
          const cleanDocName = (doc.file_name || "document.pdf").replace(/[^a-zA-Z0-9.-]/g, "_");
          const filename = `chat-attachment-${Date.now()}-${cleanDocName}`;
          const fileUrl = await downloadTelegramFile(doc.file_id, filename);

          if (fileUrl) {
            const isPdf = cleanDocName.toLowerCase().endsWith(".pdf") || doc.mime_type === "application/pdf";
            const webMsg = {
              id: msgId,
              roomId: "public",
              text: caption || (isPdf ? `📕 ${doc.file_name || "PDF Document"}` : `📁 ${doc.file_name || "Document"}`),
              type: isPdf ? "pdf" : "document",
              fileUrl,
              fileName: doc.file_name || "document.pdf",
              fileSize: doc.file_size || 0,
              sender: senderObj,
              createdAt,
              status: "delivered",
              readBy: [],
              isEdited: false,
              isDeleted: false,
            };
            chatHandlers.injectIncomingPublicMessage(webMsg);
            console.log(`[CHAT-SYNC] 📥 Synced Telegram Document (${doc.file_name}) from ${fromName} into Public Chat Hall.`);
            return;
          }
        }

        // Case C: Standard Text message sent from Telegram
        if (text) {
          const webMsg = {
            id: msgId,
            roomId: "public",
            text,
            type: "text",
            sender: senderObj,
            createdAt,
            status: "delivered",
            readBy: [],
            isEdited: false,
            isDeleted: false,
          };
          chatHandlers.injectIncomingPublicMessage(webMsg);
          console.log(`[CHAT-SYNC] 📥 Synced Telegram Message from ${fromName}: "${text}" into Public Chat Hall.`);
        }
      }
    }
  } catch (err) {
    console.warn("[CHAT-AUDIT-BOT] Error processing update:", err.message);
  }
}

/**
 * Background Poller for @fsm_chat_bot
 */
async function startChatAuditBotPoller() {
  if (pollerRunning) return;
  pollerRunning = true;

  console.log(`[CHAT-AUDIT-BOT] 🚀 Starting long-poller for @${BOT_USERNAME}...`);

  try {
    await callTelegram("deleteWebhook", { drop_pending_updates: false });
  } catch {}

  const pollLoop = async () => {
    while (pollerRunning) {
      try {
        const res = await callTelegram("getUpdates", {
          offset: lastUpdateId + 1,
          timeout: 10,
          allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member"],
        });

        if (res.ok && Array.isArray(res.result) && res.result.length > 0) {
          for (const update of res.result) {
            lastUpdateId = update.update_id;
            await processUpdate(update);
          }
        }
      } catch (err) {
        await new Promise((r) => setTimeout(r, 3000));
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  pollLoop().catch((err) => console.error("[CHAT-AUDIT-BOT] Poller loop error:", err));
}

// ============================================================================
// 📤 OUTBOUND DISPATCHERS: WEB ➔ TELEGRAM (@fsm_chat_bot)
// ============================================================================

/**
 * Dispatches a new Public Chat Hall message (Text, Image, PDF) to @fsm_chat_bot
 */
async function dispatchPublicChatMessageToTelegram({ message, chatMediaDir }) {
  if (!chatBotSettings.enablePublicChatSync) return false;

  const targetChats = [];
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: auditTopics.publicChat || null,
    });
  }

  // If Supergroup is not set OR Admin DM mirror is enabled, route to Admin Direct DM
  if (effectiveAdminId && (!currentSupergroupId || chatBotSettings.enableAdminDmMirror)) {
    targetChats.push({
      chatId: effectiveAdminId,
      threadId: null,
    });
  }

  if (targetChats.length === 0) return false;

  const senderName = message.sender?.name || "Student";
  const senderBranch = message.sender?.branch || "General";
  const senderIp = message.sender?.ip || message.ip || null;
  const ipBadge = senderIp ? ` • 🌐 <code>${escapeHtml(senderIp)}</code>` : "";
  const text = message.text || "";

  for (const { chatId, threadId } of targetChats) {
    try {
      // 1. If Image message
      if (message.type === "image" && message.fileUrl) {
        let fileBuffer = null;
        if (chatMediaDir) {
          const filenameOnDisk = path.basename(message.fileUrl.split("?")[0]);
          const potentialPath = path.join(chatMediaDir, filenameOnDisk);
          if (fs.existsSync(potentialPath)) {
            try { fileBuffer = fs.readFileSync(potentialPath); } catch {}
          }
        }

        const caption = `🖼️ <b>[PUBLIC CHAT]</b> <b>${escapeHtml(senderName)}</b> (<i>${escapeHtml(senderBranch)}</i>${ipBadge}):\n${escapeHtml(text)}`;

        if (fileBuffer && fileBuffer.length <= 10 * 1024 * 1024) {
          const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
          let formHeader = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
          if (threadId) formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${threadId}\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;

          const payload = Buffer.concat([
            Buffer.from(formHeader),
            fileBuffer,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]);

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: payload,
          });
          continue;
        } else {
          // Direct URL sendPhoto
          const clientUrl = process.env.CLIENT_URL || "https://freestudymaterial.onrender.com";
          const fullUrl = message.fileUrl.startsWith("http") ? message.fileUrl : `${clientUrl}${message.fileUrl}`;
          const body = {
            chat_id: chatId,
            photo: fullUrl,
            caption,
            parse_mode: "HTML",
          };
          if (threadId) body.message_thread_id = threadId;
          await callTelegram("sendPhoto", body);
          continue;
        }
      }

      // 2. If PDF or Document message
      if ((message.type === "pdf" || message.type === "document") && message.fileUrl) {
        let fileBuffer = null;
        if (chatMediaDir) {
          const filenameOnDisk = path.basename(message.fileUrl.split("?")[0]);
          const potentialPath = path.join(chatMediaDir, filenameOnDisk);
          if (fs.existsSync(potentialPath)) {
            try { fileBuffer = fs.readFileSync(potentialPath); } catch {}
          }
        }

        const originalName = message.fileName || (message.type === "pdf" ? "Document.pdf" : "File");
        const caption = `📕 <b>[PUBLIC CHAT]</b> <b>${escapeHtml(senderName)}</b> (<i>${escapeHtml(senderBranch)}</i>${ipBadge}) shared <code>${escapeHtml(originalName)}</code>\n${escapeHtml(text)}`;

        if (fileBuffer && fileBuffer.length <= 50 * 1024 * 1024) {
          const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
          let formHeader = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
          if (threadId) formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${threadId}\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
          formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${originalName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;

          const payload = Buffer.concat([
            Buffer.from(formHeader),
            fileBuffer,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]);

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: "POST",
            headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: payload,
          });
          continue;
        } else {
          // Direct URL sendDocument
          const clientUrl = process.env.CLIENT_URL || "https://freestudymaterial.onrender.com";
          const fullUrl = message.fileUrl.startsWith("http") ? message.fileUrl : `${clientUrl}${message.fileUrl}`;
          const body = {
            chat_id: chatId,
            document: fullUrl,
            caption,
            parse_mode: "HTML",
          };
          if (threadId) body.message_thread_id = threadId;
          await callTelegram("sendDocument", body);
          continue;
        }
      }

      // 3. Regular Text Message
      const body = {
        chat_id: chatId,
        text: `💬 <b>[GENERAL HALL]</b> <b>${escapeHtml(senderName)}</b> (<i>${escapeHtml(senderBranch)}</i>${ipBadge}):\n${escapeHtml(text)}`,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      };
      if (threadId) body.message_thread_id = threadId;
      await callTelegram("sendMessage", body);
    } catch (err) {
      console.warn(`[CHAT-AUDIT-BOT] Error sending public msg to chat ${chatId}:`, err.message);
    }
  }

  return true;
}

/**
 * Dispatches an Edit alert to Telegram when a Public Chat message is edited
 */
async function dispatchPublicChatEditToTelegram({ messageId, oldText, newText, sender }) {
  if (!chatBotSettings.enablePublicChatSync && !chatBotSettings.enableDeletedMessageAlerts) return false;

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;

  // 🛡️ STRICT: Send ONLY to Chat Audit Supergroup (Dedicated Tamper & Audit Topic 35). NEVER to Private DM.
  const targetChats = [];
  const targetThreadId = auditTopics.tamperAudit || auditTopics.deletedMessages || "35";
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetThreadId,
    });
  }

  if (targetChats.length === 0) return false;

  const senderIp = sender?.ip || null;
  const ipBadge = senderIp ? ` | 🌐 <code>${escapeHtml(senderIp)}</code>` : "";

  const textHtml = `✏️ <b>[TAMPER ALERT - MESSAGE EDITED]</b>\n\n` +
    `👤 <b>Student:</b> ${escapeHtml(sender?.name || "Student")} (<code>${escapeHtml(sender?.email || "N/A")}</code>${ipBadge})\n` +
    `🆔 <b>Message ID:</b> <code>${escapeHtml(messageId)}</code>\n` +
    `⏮️ <b>Original Untampered Text:</b>\n"${escapeHtml(oldText)}"\n\n` +
    `⏭️ <b>Modified / Edited Text:</b>\n"<b>${escapeHtml(newText)}</b>"\n\n` +
    `🕒 <b>Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>`;

  for (const { chatId, threadId } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      let res = await callTelegram("sendMessage", body);
      if (!res.ok && body.message_thread_id) {
        delete body.message_thread_id;
        await callTelegram("sendMessage", body);
      }
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Error sending edit alert to ${chatId}:`, e.message);
    }
  }

  return true;
}

/**
 * Dispatches a Tamper / Delete alert to Telegram when a Public Chat message is deleted
 */
async function dispatchPublicChatDeleteToTelegram({ messageId, originalText, fileName, sender }) {
  if (!chatBotSettings.enableDeletedMessageAlerts && !chatBotSettings.enablePublicChatSync) return false;

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;

  // 🛡️ STRICT: Send ONLY to Chat Audit Supergroup (Dedicated Tamper & Audit Topic 35). NEVER to Private DM.
  const targetChats = [];
  const targetThreadId = auditTopics.tamperAudit || auditTopics.deletedMessages || "35";
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetThreadId,
    });
  }

  if (targetChats.length === 0) return false;

  const delSenderIp = sender?.ip || null;
  const delIpBadge = delSenderIp ? ` | 🌐 <code>${escapeHtml(delSenderIp)}</code>` : "";

  const textHtml = `🗑️ <b>[TAMPER ALERT - MESSAGE DELETED]</b>\n\n` +
    `👤 <b>Deleted by:</b> ${escapeHtml(sender?.name || "Student")} (<code>${escapeHtml(sender?.email || "N/A")}</code>${delIpBadge})\n` +
    `🆔 <b>Message ID:</b> <code>${escapeHtml(messageId)}</code>\n` +
    `🔒 <b>Original Untampered Content:</b>\n"${escapeHtml(originalText || "(Media Attachment)")}"` +
    (fileName ? `\n📎 <b>Attached File:</b> <code>${escapeHtml(fileName)}</code>` : "") +
    `\n\n🕒 <b>Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>`;

  for (const { chatId, threadId } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      let res = await callTelegram("sendMessage", body);
      if (!res.ok && body.message_thread_id) {
        delete body.message_thread_id;
        await callTelegram("sendMessage", body);
      }
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Error sending delete alert to ${chatId}:`, e.message);
    }
  }

  return true;
}

/**
 * Dispatches Complete Private Room Forensic Audit to Telegram
 * (Both to Supergroup Topics and Direct to Admin)
 */
async function dispatchChatForensicAudit({
  room,
  teleHtml,
  transcriptText,
  mediaMsgs = [],
  deletedMsgs = [],
  participantAvatars = [],
  chatMediaDir,
  is7DayInactivity = false,
}) {
  if (!chatBotSettings.enableChatAudit) {
    console.log("[CHAT-AUDIT-BOT] Chat audit is disabled in settings, skipping Telegram dispatch.");
    return false;
  }

  const targetChatIds = [];
  const threadMap = {};
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  // Target 1: Admin Direct Message
  if (effectiveAdminId) {
    targetChatIds.push(effectiveAdminId);
  }

  // Target 2: Configured Supergroup (if available)
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChatIds.push(currentSupergroupId);
    if (auditTopics.podAudits) {
      threadMap[currentSupergroupId] = auditTopics.podAudits;
    }
  }

  const uniqueChats = Array.from(new Set(targetChatIds));
  console.log(`[CHAT-AUDIT-BOT] 📡 Dispatching audit for pod "${room.name}" (${is7DayInactivity ? "7-DAY INACTIVITY PURGE" : "AUTO-PURGE"}) to ${uniqueChats.length} destinations...`);

  for (const chatId of uniqueChats) {
    const threadId = threadMap[chatId] || null;

    try {
      // 1. Send HTML Summary
      const safeHtml = teleHtml.length > 3900 ? teleHtml.slice(0, 3900) + "\n\n<i>[Truncated: See full transcript file attached]</i>" : teleHtml;
      const sendMsgBody = {
        chat_id: chatId,
        text: safeHtml,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      if (threadId) sendMsgBody.message_thread_id = threadId;

      await callTelegram("sendMessage", sendMsgBody);

      // 2. Send Full Transcript Document (.txt)
      const cleanRoomName = room.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const isUserManual = teleHtml.includes("USER MANUAL DELETION");
      const is7Day = teleHtml.includes("7-DAY INACTIVITY");
      const deletePrefix = isUserManual ? "User_Delete" : is7Day ? "Auto_Purge_7Day" : "Auto_Purge_0Members";
      const deletionLabel = isUserManual ? "🔴 USER DELETE" : is7Day ? "⏰ AUTO-PURGE (7-Day Limit)" : "⏰ AUTO-PURGE (0 Members)";
      const docFilename = `Audit_Pod_${deletePrefix}_${cleanRoomName}_${Date.now()}.txt`;
      const transcriptBuffer = Buffer.from(transcriptText, "utf-8");

      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
      let formHeader = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
      if (threadId) {
        formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${threadId}\r\n`;
      }
      formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n📜 [${deletionLabel}] Full Forensic Transcript for Pod: ${room.name} (${deletedMsgs.length} deleted msgs captured)\r\n`;
      formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${docFilename}"\r\nContent-Type: text/plain\r\n\r\n`;

      const payload = Buffer.concat([
        Buffer.from(formHeader),
        transcriptBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: payload,
      });

      // 3. Send ALL Original PDF & Image Files directly as documents
      if (chatBotSettings.enableMediaVaultUpload && mediaMsgs.length > 0) {
        const mediaThreadId = auditTopics.mediaVault || threadId;
        for (let i = 0; i < mediaMsgs.length; i++) {
          const att = mediaMsgs[i];
          let fileBuffer = null;
          let originalName = att.fileName || `pod_attachment_${i + 1}`;

          if (att.fileUrl && chatMediaDir) {
            const filenameOnDisk = path.basename(att.fileUrl.split("?")[0]);
            const potentialPath = path.join(chatMediaDir, filenameOnDisk);
            if (fs.existsSync(potentialPath)) {
              try { fileBuffer = fs.readFileSync(potentialPath); } catch {}
            }
          }

          if (!fileBuffer && att.fileUrl && att.fileUrl.startsWith("http")) {
            try {
              const resp = await fetch(att.fileUrl);
              if (resp.ok) {
                const arrBuf = await resp.arrayBuffer();
                fileBuffer = Buffer.from(arrBuf);
              }
            } catch {}
          }

          if (fileBuffer && fileBuffer.length > 0 && fileBuffer.length <= 50 * 1024 * 1024) {
            try {
              const fileMb = (fileBuffer.length / (1024 * 1024)).toFixed(2);
              const delStatus = att.isDeleted ? "⚠️ [USER DELETED THIS FILE LATER]" : "✅ [ACTIVE AT POD CLOSE]";
              const caption =
                `📎 <b>Forensic Pod Attachment (${i + 1}/${mediaMsgs.length})</b>\n\n` +
                `📁 <b>File Name:</b> <code>${originalName}</code>\n` +
                `📦 <b>Size:</b> ${fileMb} MB\n` +
                `👤 <b>Sender:</b> ${att.senderName || "Student"} (📱 <code>${att.senderMobile || "N/A"}</code>)\n` +
                `🕒 <b>Sent At:</b> ${att.createdAt || "N/A"}\n` +
                `🔍 <b>Status:</b> ${delStatus}\n` +
                `🏠 <b>Pod:</b> ${room.name} (ID: <code>${room.id}</code>)`;

              const fileBoundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
              let fileFormHeader = `--${fileBoundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
              if (mediaThreadId) {
                fileFormHeader += `--${fileBoundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${mediaThreadId}\r\n`;
              }
              fileFormHeader += `--${fileBoundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
              fileFormHeader += `--${fileBoundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
              fileFormHeader += `--${fileBoundary}\r\nContent-Disposition: form-data; name="document"; filename="${originalName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;

              const filePayload = Buffer.concat([
                Buffer.from(fileFormHeader),
                fileBuffer,
                Buffer.from(`\r\n--${fileBoundary}--\r\n`),
              ]);

              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
                method: "POST",
                headers: { "Content-Type": `multipart/form-data; boundary=${fileBoundary}` },
                body: filePayload,
              });

              // Anti-rate-limit delay
              await new Promise((r) => setTimeout(r, 600));
            } catch (err) {
              console.warn(`[CHAT-AUDIT-BOT] Upload error for ${originalName}:`, err.message);
            }
          }
        }
      }

      // 4. Send ALL Participant Profile Pictures (DPs) - including all changed historical versions
      if (Array.isArray(participantAvatars) && participantAvatars.length > 0) {
        for (let i = 0; i < participantAvatars.length; i++) {
          const av = participantAvatars[i];
          if (!av.photoUrl) continue;

          let avatarBuffer = null;
          let filename = `dp_${av.userId || i}_${i + 1}.jpg`;

          if (av.photoUrl.startsWith("data:")) {
            try {
              const base64Data = av.photoUrl.split(",")[1];
              if (base64Data) avatarBuffer = Buffer.from(base64Data, "base64");
            } catch (_) {}
          } else if (av.photoUrl.startsWith("http")) {
            try {
              const r = await fetch(av.photoUrl);
              if (r.ok) {
                const ab = await r.arrayBuffer();
                avatarBuffer = Buffer.from(ab);
              }
            } catch (_) {}
          }

          if (avatarBuffer && avatarBuffer.length > 0) {
            try {
              const caption =
                `👤 <b>Forensic Participant DP (${i + 1}/${participantAvatars.length})</b>\n\n` +
                `📛 <b>Student:</b> ${escapeHtml(av.name)} ${av.username ? `(@${escapeHtml(av.username)})` : ""}\n` +
                `📱 <b>Mobile:</b> <code>${escapeHtml(av.mobile || "N/A")}</code>\n` +
                `🕒 <b>Recorded At:</b> ${escapeHtml(av.changedAt || "Session DP")}\n` +
                `🏠 <b>Pod:</b> ${escapeHtml(room.name)} (ID: <code>${room.id}</code>)`;

              const dpBoundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
              let dpHeader = `--${dpBoundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
              if (threadId) {
                dpHeader += `--${dpBoundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${threadId}\r\n`;
              }
              dpHeader += `--${dpBoundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
              dpHeader += `--${dpBoundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
              dpHeader += `--${dpBoundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;

              const dpPayload = Buffer.concat([
                Buffer.from(dpHeader),
                avatarBuffer,
                Buffer.from(`\r\n--${dpBoundary}--\r\n`),
              ]);

              await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: "POST",
                headers: { "Content-Type": `multipart/form-data; boundary=${dpBoundary}` },
                body: dpPayload,
              });

              await new Promise((r) => setTimeout(r, 600));
            } catch (dpErr) {
              console.warn(`[CHAT-AUDIT-BOT] Error dispatching DP for ${av.name}:`, dpErr.message);
            }
          }
        }
      }
    } catch (chatErr) {
      console.warn(`[CHAT-AUDIT-BOT] Failed dispatching to chat ${chatId}:`, chatErr.message);
    }
  }

  return true;
}

/**
 * Send an on-demand test alert to confirm bot connectivity
 */
async function sendTestChatBotAlert(event = "PING") {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;
  const targetChats = [];

  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: auditTopics.publicChat || null,
    });
  }
  if (effectiveAdminId) {
    targetChats.push({ chatId: effectiveAdminId, threadId: null });
  }

  if (targetChats.length === 0) {
    return { success: false, message: "No Supergroup ID or Admin ID configured for @fsm_chat_bot." };
  }

  const topicCount = Object.values(auditTopics).filter(Boolean).length;
  const textHtml = `🔔 <b>[@fsm_chat_bot DIAGNOSTIC TEST PING]</b>\n\n` +
    `🟢 <b>Bot Status:</b> ONLINE & LIVE\n` +
    `🤖 <b>Username:</b> <code>@${BOT_USERNAME}</code>\n` +
    `💬 <b>Public Chat Sync:</b> ${chatBotSettings.enablePublicChatSync ? "ACTIVE (Two-Way Read/Write/Edit/Delete)" : "PAUSED"}\n` +
    `📁 <b>Topics Configured:</b> <b>${topicCount} / 6 Active</b>\n` +
    `⏱️ <b>Chat Retention:</b> ${chatBotSettings.chatRetentionDays || 7} Days Auto-Prune\n` +
    `🛑 <b>Private Pod Inactivity Purge:</b> ${chatBotSettings.privateRoomInactivityDays || 7} Days Auto-Delete\n` +
    `📅 <b>Dispatched At:</b> ${new Date().toLocaleString("en-IN")}`;

  let sent = 0;
  for (const { chatId, threadId } of targetChats) {
    const body = {
      chat_id: chatId,
      text: textHtml,
      parse_mode: "HTML",
    };
    if (threadId) body.message_thread_id = threadId;
    const res = await callTelegram("sendMessage", body);
    if (res.ok) sent++;
  }

  return { success: sent > 0, sentCount: sent };
}

/**
 * Dispatches an Inactivity or Presence alert to Telegram Supergroup
 * (Topic: presence / 37)
 */
async function dispatchChatPresenceAlertToTelegram({ event, user, details, roomId = "public", roomName = "" }) {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  const targetChats = [];

  // 1. DIRECT ADMIN DM (PRIMARY: Always delivered directly to Admin via @fsm_chat_bot)
  if (effectiveAdminId) {
    targetChats.push({
      chatId: effectiveAdminId,
      threadId: null,
      isDirect: true,
    });
  }

  // 2. SUPERGROUP TOPIC (STRICTLY OPTIONAL: Mirrored only if supergroup is configured)
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: auditTopics.presence || null,
      isDirect: false,
    });
  }

  if (targetChats.length === 0) return false;

  const uName = user?.name || "Student";
  const uEmail = user?.email || "N/A";
  const uMobile = user?.mobile || "N/A";
  const uIp = user?.ip || "N/A";

  let icon = "👥";
  let title = "STUDENT PRESENCE EVENT";
  let dbDeletionSection = "";

  if (event === "INACTIVITY_TIMEOUT") {
    icon = "⏳";
    title = "STUDENT INACTIVITY TIMEOUT (30-MIN IDLE)";

    // Calculate database deletion countdown according to dynamic inactivity policy
    const now = Date.now();
    let lastLoginTime = user?.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
    let createdTime = user?.createdAt ? new Date(user.createdAt).getTime() : 0;

    let defaultPurgeDays = 90;
    try {
      const { getDefaultInactivityDays } = require("./accountPurgeService");
      defaultPurgeDays = getDefaultInactivityDays();
    } catch (_) {}

    let userThreshold = defaultPurgeDays;
    let isImmune = Boolean(user?.neverPurge || user?.customInactivityDays >= 9999);

    if ((!lastLoginTime || !createdTime || !userThreshold) && dbRef && user?.id) {
      try {
        const uDoc = await dbRef.collection("users").doc(user.id).get();
        if (uDoc.exists) {
          const d = uDoc.data();
          if (d.lastLoginAt) lastLoginTime = new Date(d.lastLoginAt).getTime();
          if (d.createdAt) createdTime = new Date(d.createdAt).getTime();
          if (d.mobile && (!user.mobile || user.mobile === "N/A")) user.mobile = d.mobile;
          if (typeof d.customInactivityDays === "number" && d.customInactivityDays > 0) {
            userThreshold = d.customInactivityDays;
          }
          if (d.neverPurge === true || d.customInactivityDays >= 9999) {
            isImmune = true;
          }
        }
      } catch (_) {}
    }

    const effectiveTime = Math.max(lastLoginTime, createdTime) || now;
    const inactiveDaysSoFar = Math.floor((now - effectiveTime) / (24 * 60 * 60 * 1000));
    const effectiveLimit = isImmune ? 9999 : userThreshold;
    const daysUntilDbPurge = isImmune ? 9999 : Math.max(0, effectiveLimit - inactiveDaysSoFar);
    const scheduledPurgeDate = isImmune
      ? "Never (Permanent Immunity)"
      : new Date(effectiveTime + effectiveLimit * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

    dbDeletionSection = `\n\n` +
      `🗓️ <b>[DATABASE ACCOUNT DELETION STATUS]</b>\n` +
      `• <b>Account Policy:</b> ${isImmune ? "🛡️ Permanent Immunity Shield (Never Purged)" : `${effectiveLimit}-Day Inactivity Auto-Purge Policy`}\n` +
      `• <b>Inactivity Recorded:</b> Day ${inactiveDaysSoFar} of ${isImmune ? "∞" : effectiveLimit}\n` +
      `• <b>Database Deletion Countdown:</b> ⏳ <b>${isImmune ? "Protected" : `${daysUntilDbPurge} Days Remaining`}</b>\n` +
      `• <b>Scheduled Database Deletion:</b> <code>${scheduledPurgeDate}</code>\n` +
      `• <b>Server Action:</b> Real-time WebSocket disconnected to free RAM & CPU. Student account remains safe in database.\n` +
      `• <b>Manual Adjustment:</b> Tap <code>[➕ +30 Days Grace]</code> or <code>[➖ -15 Days]</code> below to adjust days directly!`;
  } else if (event === "RETENTION_PURGE") {
    icon = "🧹";
    title = "CHAT RETENTION AUTO-PRUNE EXECUTED";
  }

  const textHtml = `${icon} <b>[${title}]</b>\n\n` +
    `👤 <b>Student Name:</b> ${escapeHtml(uName)} (ID: <code>${escapeHtml(user?.id || "N/A")}</code>)\n` +
    `📧 <b>Email:</b> <code>${escapeHtml(uEmail)}</code>\n` +
    (uMobile && uMobile !== "N/A" ? `📱 <b>Mobile:</b> <code>${escapeHtml(uMobile)}</code>\n` : "") +
    `🌐 <b>IP Address:</b> <code>${escapeHtml(uIp)}</code>\n` +
    `🏠 <b>Room Name:</b> ${escapeHtml(roomName || roomId)}\n` +
    `📋 <b>Inactivity Reason:</b> ${escapeHtml(details || "Student was idle for 30 minutes in chat without sending messages.")}` +
    dbDeletionSection + `\n\n` +
    `🕒 <b>Timestamp:</b> ${new Date().toLocaleString("en-IN")}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "👥 View Live Active Students", callback_data: "cmd_active" },
        { text: "🚫 Restrict Student", callback_data: `block_${user?.id || ""}` },
      ],
      [
        { text: "➕ +30 Days Grace", callback_data: `extend_user_${user?.id || ""}_30` },
        { text: "➖ -15 Days", callback_data: `reduce_user_${user?.id || ""}_15` },
      ],
      [
        { text: "🛡️ Toggle Immunity", callback_data: `immunity_user_${user?.id || ""}` },
        { text: "⏳ Inactivity Policy", callback_data: "cmd_inactive" },
      ],
    ],
  };

  for (const { chatId, threadId, isDirect } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      if (isDirect) body.reply_markup = replyMarkup;
      await callTelegram("sendMessage", body);
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Notice sending presence alert to ${chatId}:`, e.message);
    }
  }
  return true;
}

/**
 * Dispatches Complete Chat Purge / Clear History Alert
 * (Topic: deletedMessages / 35 and publicChat / 39)
 */
async function dispatchChatPurgeAlertToTelegram({ roomId, roomName, admin, count }) {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  const targetChats = [];
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: auditTopics.deletedMessages || null,
    });
    if (auditTopics.publicChat && roomId === "public") {
      targetChats.push({
        chatId: currentSupergroupId,
        threadId: auditTopics.publicChat,
      });
    }
  }
  if (effectiveAdminId && (!currentSupergroupId || chatBotSettings.enableAdminDmMirror)) {
    targetChats.push({
      chatId: effectiveAdminId,
      threadId: null,
    });
  }

  if (targetChats.length === 0) return false;

  const adminName = admin?.name || "Administrator";
  const adminEmail = admin?.email || "admin";
  const adminIp = admin?.ip || null;
  const ipBadge = adminIp ? ` | 🌐 <code>${escapeHtml(adminIp)}</code>` : "";

  const textHtml = `🚨 <b>[COMPLETE CHAT PURGED & ERASED]</b>\n\n` +
    `🛡️ <b>Executed By Admin:</b> ${escapeHtml(adminName)} (<code>${escapeHtml(adminEmail)}</code>${ipBadge})\n` +
    `🏠 <b>Room Cleared:</b> ${escapeHtml(roomName || roomId)} (ID: <code>${escapeHtml(roomId)}</code>)\n` +
    `🗑️ <b>Action:</b> Complete chat messages and history permanently purged from active memory and database.\n` +
    `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN")}`;

  for (const { chatId, threadId } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      await callTelegram("sendMessage", body);
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Error sending purge alert to ${chatId}:`, e.message);
    }
  }
  return true;
}

/**
 * Dispatches User Block / Unblock Alert
 * (Topic: presence / 37)
 */
async function dispatchChatBlockAlertToTelegram({ targetUser, block, admin, activeUsers = [] }) {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  const targetChats = [];

  // 1. DIRECT ADMIN DM (PRIMARY: Always delivered directly to Admin via @fsm_chat_bot)
  if (effectiveAdminId) {
    targetChats.push({
      chatId: effectiveAdminId,
      threadId: null,
      isDirect: true,
    });
  }

  // 2. SUPERGROUP TOPIC (STRICTLY OPTIONAL: Mirrored only if supergroup is configured)
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: auditTopics.presence || null,
      isDirect: false,
    });
  }

  if (targetChats.length === 0) return false;

  const targetName = targetUser?.name || targetUser?.id || "Student";
  const targetEmail = targetUser?.email || "N/A";
  const targetMobile = targetUser?.mobile || "N/A";
  const targetIp = targetUser?.ip || targetUser?.lastLoginIp || "N/A";
  const adminName = admin?.name || "Administrator";
  const adminIp = admin?.ip || "N/A";

  const action = block ? "RESTRICTED / BLOCKED 🚫" : "UNRESTRICTED / UNBLOCKED ✅";
  const icon = block ? "🚫" : "✅";

  // Format active online students at this moment
  let activeSection = "";
  if (Array.isArray(activeUsers) && activeUsers.length > 0) {
    const userLines = activeUsers.slice(0, 10).map((u, i) => {
      const uIp = u.ip && u.ip !== "N/A" ? ` | 🌐 <code>${escapeHtml(u.ip)}</code>` : "";
      return `  ${i + 1}. <b>${escapeHtml(u.name || "Student")}</b> (<code>${escapeHtml(u.email || "N/A")}</code> | 🏠 ${escapeHtml(u.roomName || u.roomId || "General")}${uIp})`;
    }).join("\n");
    const more = activeUsers.length > 10 ? `\n  <i>...and ${activeUsers.length - 10} more online students</i>` : "";
    activeSection = `\n\n` +
      `👥 <b>Active Online Students at this Moment (${activeUsers.length} Online):</b>\n` +
      userLines + more;
  } else {
    activeSection = `\n\n` +
      `👥 <b>Active Online Students at this Moment:</b> 0 students online.`;
  }

  const textHtml = `${icon} <b>[STUDENT CHAT PARTICIPATION ${action}]</b>\n\n` +
    `👤 <b>Student Name:</b> ${escapeHtml(targetName)} (ID: <code>${escapeHtml(targetUser?.id || "N/A")}</code>)\n` +
    `📱 <b>Mobile No:</b> <code>${escapeHtml(targetMobile)}</code>\n` +
    `📧 <b>Email:</b> <code>${escapeHtml(targetEmail)}</code>\n` +
    `🌐 <b>IP Address:</b> <code>${escapeHtml(targetIp)}</code>\n` +
    `🛡️ <b>Action Taken By Admin:</b> ${escapeHtml(adminName)} (🌐 IP: <code>${escapeHtml(adminIp)}</code>)` +
    activeSection + `\n\n` +
    `🕒 <b>Timestamp:</b> ${new Date().toLocaleString("en-IN")}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "👥 View Live Active Students", callback_data: "cmd_active" },
        { text: block ? "✅ Unblock Student" : "🚫 Block Student", callback_data: `toggle_block_${targetUser?.id || ""}` },
      ],
      [
        { text: "📋 View Blocked Students", callback_data: "cmd_blocked" },
        { text: "⏳ Inactivity & Deletion Days", callback_data: "cmd_inactive" },
      ],
    ],
  };

  for (const { chatId, threadId, isDirect } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      if (isDirect) body.reply_markup = replyMarkup;
      await callTelegram("sendMessage", body);
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Notice sending block alert to ${chatId}:`, e.message);
    }
  }
  return true;
}

/**
 * Dispatches Comprehensive Student Chat Deletion & Cascade Audit Report
 * Sent to Chat Audit Bot Supergroup (topic: deletedMessages or presence) and Admin DM
 */
async function dispatchUserDeletionChatReportToTelegram({ user, admin, chatSummary = {} }) {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;

  const targetChats = [];

  // 🛡️ STRICT REQUIREMENT: Send ONLY to Chat Audit Supergroup Dedicated Forensic & Purge Topic 72 (Never mixed with topic 35). NEVER to private 1-on-1 Admin DM.
  const targetThreadId = auditTopics.forensicPurge || process.env.TELEGRAM_CHAT_TOPIC_FORENSIC_PURGE || "72";
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetThreadId,
      isDirect: false,
    });
  }

  if (targetChats.length === 0) {
    console.log("[CHAT-AUDIT-BOT] ⚠️ No Chat Audit Supergroup configured; skipping Telegram broadcast.");
    return false;
  }

  const studentName = user.name || "Student Scholar";
  const studentEmail = user.email || "N/A";
  const studentMobile = user.mobile || "N/A";
  const studentCollege = user.college || "N/A";
  const adminName = admin?.name || (admin?.email ? "Administrator" : "Automated Lifecycle Sweeper");
  const adminEmail = admin?.email || "admin";

  const totalMessagesDeleted = Number(chatSummary.messagesCount || 0);
  const roomsInvolved = Array.isArray(chatSummary.rooms) && chatSummary.rooms.length > 0
    ? chatSummary.rooms.join(", ")
    : "Public Room";
  const tursoCleared = chatSummary.tursoRowsDeleted !== undefined ? `${chatSummary.tursoRowsDeleted} rows` : "Cleared";

  const textHtml = `🚨 <b>[STUDENT CHAT HISTORY PURGED & FORENSIC DOSSIER]</b>\n\n` +
    `👤 <b>Student Name:</b> <code>${escapeHtml(studentName)}</code>\n` +
    `📧 <b>Email Address:</b> <code>${escapeHtml(studentEmail)}</code>\n` +
    `📱 <b>Mobile Number:</b> <code>${escapeHtml(studentMobile)}</code>\n` +
    `🏛️ <b>College / Institute:</b> <code>${escapeHtml(studentCollege)}</code>\n\n` +
    `💬 <b>Chat Activity & Deletion Forensic:</b>\n` +
    `• <b>Total Chat Messages Erased:</b> <code>${totalMessagesDeleted} messages (Firebase + Turso)</code>\n` +
    `• <b>Rooms Involved:</b> <code>${escapeHtml(roomsInvolved)}</code>\n` +
    `• <b>Turso Rows Cleared:</b> <code>${escapeHtml(tursoCleared)} (Chat messages, profiles, audits)</code>\n` +
    `• <b>Firebase Firestore:</b> <code>100% Cleared (chat_messages)</code>\n\n` +
    `👮 <b>Action Executed By:</b> <code>${escapeHtml(adminName)} (${escapeHtml(adminEmail)})</code>\n` +
    `⏰ <b>Action Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>\n\n` +
    `🔒 <i>Forensic Audit Record: User identity and all associated chat traces permanently expunged across Firebase and Turso. Broadcasted strictly to Public Chat Audit Supergroup.</i>`;

  for (const { chatId, threadId } of targetChats) {
    try {
      const body = {
        chat_id: chatId,
        text: textHtml,
        parse_mode: "HTML",
      };
      if (threadId) body.message_thread_id = threadId;
      let res = await callTelegram("sendMessage", body);
      // Fallback: If specific forum thread rejected, deliver to supergroup main chat
      if (!res.ok && body.message_thread_id) {
        delete body.message_thread_id;
        await callTelegram("sendMessage", body);
      }
    } catch (e) {
      console.warn(`[CHAT-AUDIT-BOT] Error sending user deletion chat report to ${chatId}:`, e.message);
    }
  }
  return true;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  BOT_TOKEN,
  ADMIN_ID: activeAdminId,
  activeAdminId,
  BOT_USERNAME,
  startChatAuditBotPoller,
  autoCreateTopicsForSupergroup,
  dispatchChatForensicAudit,
  dispatchPublicChatMessageToTelegram,
  dispatchPublicChatEditToTelegram,
  dispatchPublicChatDeleteToTelegram,
  dispatchChatPresenceAlertToTelegram,
  dispatchChatPurgeAlertToTelegram,
  dispatchChatBlockAlertToTelegram,
  dispatchUserDeletionChatReportToTelegram,
  sendTestChatBotAlert,
  getChatBotSettings,
  updateChatBotSettings,
  setChatHandlers,
};

