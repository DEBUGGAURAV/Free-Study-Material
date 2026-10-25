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
const { getSiteUrl } = require("../config/siteConfig");

const BOT_TOKEN = (process.env.TELEGRAM_CHAT_AUDIT_BOT_TOKEN || "").trim();
let activeAdminId = (process.env.TELEGRAM_CHAT_AUDIT_ADMIN_ID || "").trim();
const BOT_USERNAME = "fsm_chat_bot";

let supergroupId = (process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "").trim();
let auditTopics = {
  podAudits: (process.env.TELEGRAM_CHAT_TOPIC_POD_AUDITS || "31").trim(),
  mediaVault: (process.env.TELEGRAM_CHAT_TOPIC_MEDIA_VAULT || "33").trim(),
  deletedMessages: (process.env.TELEGRAM_CHAT_TOPIC_DELETED || "35").trim(),
  tamperAudit: (process.env.TELEGRAM_CHAT_TOPIC_TAMPER_AUDIT || "35").trim(),
  forensicPurge: (process.env.TELEGRAM_CHAT_TOPIC_FORENSIC_PURGE || "31").trim(),
  presence: (process.env.TELEGRAM_CHAT_TOPIC_PRESENCE || "37").trim(),
  stealth: (process.env.TELEGRAM_CHAT_TOPIC_STEALTH || "1").trim(),
  publicChat: (process.env.TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT || "1").trim(),
};

/**
 * ⚡ Public Chat & Forum Topics Router:
 * Topic 35: ONLY Public Group (General Hall) deleted messages & edit logs. Never private rooms or student presence.
 * Topic 31: Private Study Rooms / Pods complete forensic dossiers & transcripts upon close.
 * Topic 33: Private Chat Media Vault (Permanent Retention for PDF, IMG, Docs).
 * Topic 37: Live Active Students Count & Session Logs (Presence).
 * Topic 1: Unified Public Channel Option (When publicChat is set to '1', public chat messages + deleted alerts + media route to Topic 1).
 */
function isUnifiedTopic1Mode() {
  const topic = String(auditTopics.publicChat || "").trim();
  return topic === "1";
}

function getTargetPublicChatTopic() {
  const topic = String(auditTopics.publicChat || "").trim();
  if (!topic || topic === "off" || topic === "none" || topic === "dm") return null;
  return topic;
}

function getTargetPublicDeletedTopic() {
  // If Unified Topic 1 Mode is active, route deleted alerts to Topic 1
  if (isUnifiedTopic1Mode()) {
    return "1";
  }
  // Otherwise route strictly to Topic 35 (Public Deleted Messages & Tamper Log)
  return auditTopics.deletedMessages || "35";
}

// Bidirectional message mapping: Telegram Message ID <-> Web Public Chat Message ID
const telegramToWebMsgMap = new Map();
const webToTelegramMsgMap = new Map();

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
  enablePublicChatSync: process.env.TELEGRAM_ENABLE_PUBLIC_CHAT_SYNC === "true", // 🔒 Default Inactive (OFF) until activated from Chat Tab
  enableAdminDmMirror: true, // 🛡️ Enabled: Gives Admin direct 1-on-1 Bot DM control over Public Chat
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
  editPublicMessage: null,
  deletePublicMessage: null,
  getActiveUsers: null,
  blockUser: null,
  unblockUser: null,
  getBlockedUsers: null,
  purgePublicChat: null,
  setRetentionDays: null,
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
      const savedTopics = data.topics || {};
      const cleanPublicChat = (savedTopics.publicChat && savedTopics.publicChat.trim()) || "1";
      const cleanStealth = (savedTopics.stealth && savedTopics.stealth.trim()) || "1";

      chatBotSettings = {
        ...chatBotSettings,
        ...data,
        enableAdminDmMirror: data.enableAdminDmMirror !== undefined ? data.enableAdminDmMirror : true,
        supergroupId: (data.supergroupId && data.supergroupId.trim()) || supergroupId || "",
        topics: {
          podAudits: (savedTopics.podAudits && savedTopics.podAudits.trim()) || "31",
          mediaVault: (savedTopics.mediaVault && savedTopics.mediaVault.trim()) || "33",
          deletedMessages: (savedTopics.deletedMessages && savedTopics.deletedMessages.trim()) || "35",
          tamperAudit: (savedTopics.tamperAudit && savedTopics.tamperAudit.trim()) || "35",
          forensicPurge: (savedTopics.forensicPurge && savedTopics.forensicPurge.trim()) || "31",
          presence: (savedTopics.presence && savedTopics.presence.trim()) || "37",
          stealth: cleanStealth,
          publicChat: cleanPublicChat,
        },
      };
      if (chatBotSettings.adminId) {
        activeAdminId = String(chatBotSettings.adminId).trim();
      }
      supergroupId = chatBotSettings.supergroupId;
      auditTopics = { ...chatBotSettings.topics };

      // If old topic 39 was persisted in Firestore, auto-correct it to Topic 1
      if (savedTopics.publicChat === "39" || savedTopics.stealth === "39") {
        dbRef.collection("settings").doc("chat_bot").set({
          topics: { publicChat: "1", stealth: "1" }
        }, { merge: true }).catch(() => {});
      }

      console.log("[CHAT-AUDIT-BOT] ⚙️ Loaded settings from Firestore doc settings/chat_bot:", {
        supergroupId,
        topics: auditTopics,
        adminDmMirror: chatBotSettings.enableAdminDmMirror,
      });
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
 * Helper to call Telegram Bot API with automatic Topic fallback
 */
async function callTelegram(method, body = {}) {
  if (!BOT_TOKEN) return { ok: false, error: "BOT_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok && body.message_thread_id) {
      const desc = String(data.description || "").toLowerCase();
      if (desc.includes("thread not found") || desc.includes("message thread") || desc.includes("thread_id")) {
        console.warn(`[CHAT-AUDIT-BOT] Topic thread ${body.message_thread_id} not found in chat ${body.chat_id}. Retrying with General Topic (1)...`);
        const fallbackBody = { ...body };
        if (String(fallbackBody.message_thread_id) !== "1") {
          fallbackBody.message_thread_id = 1;
        } else {
          delete fallbackBody.message_thread_id;
        }
        const retryRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackBody),
        });
        const retryData = await retryRes.json();
        if (retryData.ok) {
          return retryData;
        }
        if (fallbackBody.message_thread_id) {
          delete fallbackBody.message_thread_id;
          const rootRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody),
          });
          return await rootRes.json();
        }
      }
    }
    return data;
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
  console.log(`[CHAT-AUDIT-BOT] 🛠️ Connecting Supergroup ${cleanChatId} in Public-Chat-Only Mode...`);

  supergroupId = cleanChatId;
  chatBotSettings.supergroupId = cleanChatId;
  updateEnvFile("TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID", cleanChatId);

  // If user already has a topic configured, keep it
  const existingTopic = getTargetPublicChatTopic();
  if (existingTopic && existingTopic !== "1") {
    await callTelegram("sendMessage", {
      chat_id: cleanChatId,
      message_thread_id: existingTopic,
      text: `🟢 <b>Public Community Chat Connected!</b>\n\n` +
        `• <b>Bound Forum Topic:</b> <code>#${existingTopic}</code>\n` +
        `• <b>Subtopics:</b> 🔇 <i>Disabled (Public Only Mode Active)</i>\n\n` +
        `Send <code>/set_topic</code> in any other topic to change it anytime.`,
      parse_mode: "HTML",
    });
    return { publicChat: existingTopic };
  }

  // Create single Public Community Chat topic if not already present
  let publicChatThreadId = "1";
  try {
    const res = await callTelegram("createForumTopic", {
      chat_id: cleanChatId,
      name: "💬 Public Community Chat",
      icon_color: 5322744,
    });

    if (res.ok && res.result?.message_thread_id) {
      publicChatThreadId = String(res.result.message_thread_id);
      console.log(`[CHAT-AUDIT-BOT] ✅ Created Public Community Chat topic -> Thread ID: ${publicChatThreadId}`);
    }
  } catch (e) {
    console.warn(`[CHAT-AUDIT-BOT] Topic creation notice:`, e.message);
  }

  auditTopics.publicChat = publicChatThreadId;
  chatBotSettings.topics.publicChat = publicChatThreadId;
  updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", publicChatThreadId);

  if (dbRef) {
    dbRef.collection("settings").doc("chat_bot").set(chatBotSettings, { merge: true }).catch(() => {});
  }

  // Send Admin summary message
  await callTelegram("sendMessage", {
    chat_id: cleanChatId,
    message_thread_id: publicChatThreadId !== "1" ? publicChatThreadId : undefined,
    text: `🎉 <b>Free Study Material Public Chat & Controller Initialized!</b>\n\n` +
      `🛡️ <b>Supergroup ID:</b> <code>${cleanChatId}</code>\n` +
      `💬 <b>Bound Public Chat Topic:</b> <code>#${publicChatThreadId}</code>\n` +
      `🔇 <b>Subtopics Status:</b> <i>Suppressed (No study pod or transcript spam)</i>\n\n` +
      `💡 <i>To bind Public Chat to any other topic, open that topic and type <code>/set_topic</code>!</i>`,
    parse_mode: "HTML",
  });

  return { publicChat: publicChatThreadId };
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

      if (data === "cmd_clearchat") {
        if (typeof chatHandlers.purgePublicChat === "function") {
          await chatHandlers.purgePublicChat({ name: "Admin (Telegram Bot)", ip: "Telegram Bot Direct" });
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: "🗑️ <b>Public Community Chat Purged:</b>\n\nAll messages have been purged from memory, Turso LibSQL, and database.",
            parse_mode: "HTML",
          });
        }
        return;
      }

      if (data === "cmd_topic_status") {
        const curTopic = auditTopics.publicChat || "Not Set";
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `🎯 <b>Public Chat Topic Status:</b>\n\n` +
            `• <b>Bound Topic ID:</b> <code>#${curTopic}</code>\n` +
            `• <b>Supergroup:</b> <code>${supergroupId || "Direct DM Only"}</code>\n` +
            `• <b>Subtopics:</b> 🔇 <i>Suppressed (Public Chat Only Mode Active)</i>\n\n` +
            `💡 <i>To change topic, open any forum topic in your group and send <code>/set_topic</code>!</i>`,
          parse_mode: "HTML",
        });
        return;
      }

      if (data === "cmd_purgedays" || data === "cmd_inactive") {
        const curChatDays = chatBotSettings.chatRetentionDays || 7;
        const curPodDays = chatBotSettings.privateRoomInactivityDays || 7;
        let defAccountDays = 90;
        try {
          const { getDefaultInactivityDays } = require("./accountPurgeService");
          defAccountDays = getDefaultInactivityDays();
        } catch (_) {}

        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⏱️ <b>[RETENTION & PURGE POLICIES]</b>\n\n` +
            `• <b>Chat Messages Retention:</b> <b>${curChatDays} Days</b>\n` +
            `• <b>Private Pods Inactivity:</b> <b>${curPodDays} Days</b>\n` +
            `• <b>Student Account Inactivity:</b> <b>${defAccountDays} Days</b>\n\n` +
            `<b>Direct Commands:</b>\n` +
            `• <code>/purgedays 14</code> - Set global chat retention to 14 days\n` +
            `• <code>/purgedays student@email.com 60</code> - Set custom days for student\n` +
            `• <code>/extend student@email.com 30</code> - Add +30 days grace\n` +
            `• <code>/decrease student@email.com 15</code> - Reduce 15 days`,
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
        supergroupId = String(chat.id);
        chatBotSettings.supergroupId = String(chat.id);
        updateEnvFile("TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID", String(chat.id));
        if (dbRef) {
          dbRef.collection("settings").doc("chat_bot").set({ supergroupId: String(chat.id) }, { merge: true }).catch(() => {});
        }

        await callTelegram("sendMessage", {
          chat_id: chat.id,
          text: `👑 <b>@${BOT_USERNAME} Connected!</b>\n\n` +
            `• <b>Supergroup ID:</b> <code>${chat.id}</code>\n` +
            `• <b>Mode:</b> 🟢 <b>Public Chat & Controller ONLY</b> (Subtopics Disabled)\n\n` +
            `👉 <i>To bind Public Chat to any topic, open that topic and send <code>/set_topic</code>!</i>`,
          parse_mode: "HTML",
        });
        return;
      }
    }

    // 2. Incoming messages (Text, Photo, Document, Edited Message)
    const isEdit = Boolean(update.edited_message);
    const message = update.message || update.edited_message;
    if (!message) return;

    // Ignore messages sent by bots (including ourselves) to eliminate infinite loops
    if (message.from?.is_bot) return;

    const chatId = message.chat?.id;
    const chatType = message.chat?.type;
    const text = (message.text || "").trim();
    const caption = (message.caption || "").trim();
    const threadId = message.message_thread_id ? String(message.message_thread_id) : null;
    const fromId = String(message.from?.id || "");

    // ✏️ A. REAL-TIME EDIT FROM TELEGRAM TO WEB PUBLIC CHAT
    if (isEdit) {
      const targetTopic = getTargetPublicChatTopic();
      const isPublicChatTopic = targetTopic
        ? (String(threadId || "1") === String(targetTopic))
        : false;
      const isDirectChat = chatType === "private";

      if (isPublicChatTopic || isDirectChat) {
        const teleMsgId = message.message_id;
        const newContent = text || caption || "";
        if (typeof chatHandlers.editPublicMessage === "function") {
          const edited = chatHandlers.editPublicMessage(teleMsgId, newContent);
          if (edited) {
            console.log(`[CHAT-SYNC] ✏️ Synced Telegram message edit (#${teleMsgId}) into Web Public Chat: "${newContent}"`);
          }
        }
      }
      return;
    }

    // 🗑️ B. DELETE MESSAGE FROM TELEGRAM AND WEB (/del or /delete)
    if (text === "/del" || text === "/delete" || text.startsWith("/del ") || text.startsWith("/delete ")) {
      let targetTeleMsgId = null;
      if (message.reply_to_message && message.reply_to_message.message_id) {
        targetTeleMsgId = message.reply_to_message.message_id;
      } else {
        const query = text.replace(/^\/(del|delete)\s*/i, "").trim();
        if (query) targetTeleMsgId = query;
      }

      if (!targetTeleMsgId) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: "ℹ️ <b>Usage:</b> Reply to any message with <code>/del</code> to delete it from both Telegram and Web Public Chat.",
          parse_mode: "HTML",
        });
        return;
      }

      // Delete message from Telegram
      await callTelegram("deleteMessage", {
        chat_id: chatId,
        message_id: targetTeleMsgId,
      });

      // Delete the /del command message itself
      await callTelegram("deleteMessage", {
        chat_id: chatId,
        message_id: message.message_id,
      });

      // Delete from Web Public Chat in real-time
      if (typeof chatHandlers.deletePublicMessage === "function") {
        chatHandlers.deletePublicMessage(targetTeleMsgId);
        console.log(`[CHAT-SYNC] 🗑️ Deleted message (#${targetTeleMsgId}) in Web Public Chat via Telegram /del command.`);
      }
      return;
    }

    // 🤖 C. CLEAN COMMANDS MANUAL (/start and /help)
    if (text === "/start" || text.startsWith("/start") || text === "/help" || text === "/commands") {
      if (chatType === "private") {
        activeAdminId = String(chatId);
        chatBotSettings.adminId = String(chatId);
        updateEnvFile("TELEGRAM_CHAT_AUDIT_ADMIN_ID", String(chatId));
        if (dbRef) {
          dbRef.collection("settings").doc("chat_bot").set({ adminId: String(chatId) }, { merge: true }).catch(() => {});
        }
      }

      await callTelegram("sendMessage", {
        chat_id: chatId,
        message_thread_id: threadId,
        text: `🤖 <b>@${BOT_USERNAME} Command Center</b>\n\n` +
          `• <code>/set_topic</code> - Bind public chat & controller to current topic\n` +
          `• <code>/set_topic &lt;id&gt;</code> - Bind to specific topic ID (or <code>/set_topic off</code>)\n` +
          `• <code>/topic</code> - Check current bound topic & status\n` +
          `• <code>/active</code> - Live active online students\n` +
          `• <code>/block &lt;email or id&gt;</code> - Restrict a student\n` +
          `• <code>/unblock &lt;email or id&gt;</code> - Restore a student\n` +
          `• <code>/blocked</code> - List restricted students\n` +
          `• <code>/clearchat</code> - Purge public chat hall\n` +
          `• <code>/resetcache &lt;email&gt;</code> - Remotely wipe a student's phone cache (0 DB cost)\n` +
          `• <code>/resetallcache</code> - Global fleet storage wipe (0 DB cost)\n\n` +
          `💬 <i>Type any message, photo, or PDF in the bound topic to broadcast directly to Public Hall with your official Admin badge! Reply to any message with <code>/del</code> to delete it.</i>\n\n` +
          `⏱️ <i>Purge Days Control: <code>/purgedays &lt;email&gt; &lt;+days|-days&gt;</code></i>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👥 Live Active Students", callback_data: "cmd_active" },
              { text: "📋 Blocked Students", callback_data: "cmd_blocked" },
            ],
            [
              { text: "🗑️ Purge Public Chat", callback_data: "cmd_clearchat" },
              { text: "🎯 Topic Status", callback_data: "cmd_topic_status" },
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
        message_thread_id: threadId,
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
          message_thread_id: threadId,
          text: "ℹ️ <b>Usage:</b> <code>/block student_email_or_id</code>\n\nExample: <code>/block student@gmail.com</code>",
          parse_mode: "HTML",
        });
        return;
      }
      if (typeof chatHandlers.blockUser === "function") {
        const res = await chatHandlers.blockUser(query, { name: "Administrator", ip: "Telegram Bot Direct" });
        if (res.success) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
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
            message_thread_id: threadId,
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
          message_thread_id: threadId,
          text: "ℹ️ <b>Usage:</b> <code>/unblock student_email_or_id</code>\n\nExample: <code>/unblock student@gmail.com</code>",
          parse_mode: "HTML",
        });
        return;
      }
      if (typeof chatHandlers.unblockUser === "function") {
        const res = await chatHandlers.unblockUser(query, { name: "Administrator", ip: "Telegram Bot Direct" });
        if (res.success) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: `✅ <b>Student Unblocked Successfully:</b>\n\n` +
              `👤 <b>Name:</b> ${escapeHtml(res.targetUser?.name || "Student")}\n` +
              `📧 <b>Email:</b> <code>${escapeHtml(res.targetUser?.email || "N/A")}</code>\n` +
              `Chat participation permissions have been restored.`,
            parse_mode: "HTML",
          });
        } else {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
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
          message_thread_id: threadId,
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
          message_thread_id: threadId,
          text: `🚫 <b>RESTRICTED / BLOCKED STUDENTS (${blocked.length}):</b>\n\n${lines}\n\n<i>Tap button below or use /unblock &lt;email&gt;</i>`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inlineKb },
        });
      }
      return;
    }

    // Direct Admin Command: /clearchat or /purge
    if (text === "/clearchat" || text === "/purge") {
      if (typeof chatHandlers.purgePublicChat === "function") {
        await chatHandlers.purgePublicChat({ name: "Administrator", ip: "Telegram Bot Direct" });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: "🗑️ <b>Public Community Chat Cleared:</b>\n\nAll messages have been purged from memory, Turso LibSQL, and database.",
          parse_mode: "HTML",
        });
      }
      return;
    }

    // Direct Admin Command: /resetcache <email/id>
    if (text.startsWith("/resetcache ") || text === "/resetcache") {
      const query = text.replace(/^\/resetcache\s*/, "").trim();
      if (!query) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: "ℹ️ <b>Usage:</b> <code>/resetcache student@gmail.com</code>\n\nRemotely wipes IndexedDB storage & offline caches on student's device(s) with 0 database reads/writes.",
          parse_mode: "HTML",
        });
        return;
      }
      try {
        const adminRouter = require("../routes/admin");
        const chatRouter = require("../routes/chat");
        if (adminRouter && typeof adminRouter.isPendingUserStorageWipe === "function") {
          adminRouter.clearPendingUserStorageWipe(query);
        }
        let wsSent = false;
        if (chatRouter && typeof chatRouter.broadcastRemoteStorageWipe === "function") {
          wsSent = chatRouter.broadcastRemoteStorageWipe({ studentId: query, email: query });
        }
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `🧹 <b>Targeted Offline Storage Reset Dispatched:</b>\n\n` +
            `👤 <b>Target:</b> <code>${escapeHtml(query)}</code>\n` +
            `⚡ <b>Status:</b> ${wsSent ? "Delivered to active student device in 0ms (WebSocket)" : "Queued in-memory (Student currently offline)"}\n` +
            `💰 <b>Database Cost:</b> 0 Reads / 0 Writes (₹0)\n\n` +
            `All local IndexedDB vaults and Service Worker caches on their device will be cleared automatically.`,
          parse_mode: "HTML",
        });
      } catch (err) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `⚠️ <b>Reset Error:</b> ${escapeHtml(err.message)}`,
          parse_mode: "HTML",
        });
      }
      return;
    }

    // Direct Admin Command: /resetallcache
    if (text === "/resetallcache") {
      try {
        const chatRouter = require("../routes/chat");
        let count = 0;
        if (chatRouter && typeof chatRouter.broadcastRemoteStorageWipeAll === "function") {
          count = chatRouter.broadcastRemoteStorageWipeAll(Date.now());
        }
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `⚡ <b>Platform-Wide Storage Reset Dispatched:</b>\n\n` +
            `📱 <b>Active Sockets Notified:</b> ${count} student device(s)\n` +
            `💰 <b>Database Overhead:</b> 0 Reads / 0 Writes (₹0 Cost)\n` +
            `🖥️ <b>Server CPU Overhead:</b> 0.0%\n\n` +
            `Every student device will automatically reset their local IndexedDB and Service Worker caches upon receiving this signal or on next app launch.`,
          parse_mode: "HTML",
        });
      } catch (err) {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `⚠️ <b>Global Reset Error:</b> ${escapeHtml(err.message)}`,
          parse_mode: "HTML",
        });
      }
      return;
    }

    // ⏱️ D. PURGE DAYS CONTROL: /purgedays <days> OR /purgedays <email> <days> OR /extend /decrease
    if (text.startsWith("/purgedays") || text.startsWith("/retention") || text.startsWith("/extend") || text.startsWith("/decrease") || text.startsWith("/increase")) {
      const parts = text.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();

      // Case 1: /extend <email/id> <days>
      if (cmd.startsWith("/extend") || cmd.startsWith("/increase")) {
        const query = parts[1];
        const days = parseInt(parts[2], 10) || 15;
        if (!query) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: "ℹ️ <b>Usage:</b> <code>/extend student@gmail.com 30</code>\n(Increases inactivity threshold by 30 days)",
            parse_mode: "HTML",
          });
          return;
        }
        await handleAdjustUserPurgeDays(chatId, threadId, query, { action: "increase", days });
        return;
      }

      // Case 2: /decrease <email/id> <days>
      if (cmd.startsWith("/decrease")) {
        const query = parts[1];
        const days = parseInt(parts[2], 10) || 15;
        if (!query) {
          await callTelegram("sendMessage", {
            chat_id: chatId,
            message_thread_id: threadId,
            text: "ℹ️ <b>Usage:</b> <code>/decrease student@gmail.com 15</code>\n(Decreases inactivity threshold by 15 days)",
            parse_mode: "HTML",
          });
          return;
        }
        await handleAdjustUserPurgeDays(chatId, threadId, query, { action: "decrease", days });
        return;
      }

      // Case 3: /purgedays with no arguments -> show help & current policies
      if (parts.length === 1) {
        const curChatDays = chatBotSettings.chatRetentionDays || 7;
        const curPodDays = chatBotSettings.privateRoomInactivityDays || 7;
        let defAccountDays = 90;
        try {
          const { getDefaultInactivityDays } = require("./accountPurgeService");
          defAccountDays = getDefaultInactivityDays();
        } catch (_) {}

        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `⏱️ <b>[CURRENT RETENTION & PURGE POLICIES]</b>\n\n` +
            `• <b>Chat Messages Retention:</b> <b>${curChatDays} Days</b>\n` +
            `• <b>Private Study Pods Inactivity:</b> <b>${curPodDays} Days</b>\n` +
            `• <b>Student Account Inactivity:</b> <b>${defAccountDays} Days</b>\n\n` +
            `<b>Commands to adjust:</b>\n` +
            `• <code>/purgedays 14</code> - Set global chat retention to 14 days\n` +
            `• <code>/purgedays student@gmail.com 60</code> - Set custom days for student\n` +
            `• <code>/extend student@gmail.com 30</code> - Add +30 days grace\n` +
            `• <code>/decrease student@gmail.com 15</code> - Reduce 15 days`,
          parse_mode: "HTML",
        });
        return;
      }

      // Case 4: /purgedays <number> -> sets global retention
      if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        const newDays = Math.max(1, Math.min(365, parseInt(parts[1], 10)));
        await updateChatBotSettings({
          chatRetentionDays: newDays,
          privateRoomInactivityDays: newDays,
        });
        if (typeof chatHandlers.setRetentionDays === "function") {
          chatHandlers.setRetentionDays(newDays);
        }
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `✅ <b>Global Purge & Retention Updated!</b>\n\n` +
            `• <b>Chat Messages Retention:</b> <b>${newDays} Days</b>\n` +
            `• <b>Private Study Pods Inactivity:</b> <b>${newDays} Days</b>\n` +
            `Settings synced to memory, database & Turso cloud.`,
          parse_mode: "HTML",
        });
        return;
      }

      // Case 5: /purgedays <email or id> <days>
      if (parts.length >= 3) {
        const query = parts[1];
        const daysRaw = parts[2];
        const isRelativePlus = daysRaw.startsWith("+");
        const isRelativeMinus = daysRaw.startsWith("-");
        const parsedDays = Math.abs(parseInt(daysRaw, 10)) || 15;
        const action = isRelativeMinus ? "decrease" : isRelativePlus ? "increase" : "set";

        await handleAdjustUserPurgeDays(chatId, threadId, query, { action, days: parsedDays });
        return;
      }
    }

    // Command: /set_topic, /set_public_topic, /bind_topic
    if (
      text === "/set_topic" ||
      text.startsWith("/set_topic ") ||
      text === "/set_public_topic" ||
      text.startsWith("/set_public_topic ") ||
      text === "/bind_topic" ||
      text.startsWith("/bind_topic ")
    ) {
      let specifiedTopic = text.replace(/^\/(set_topic|set_public_topic|bind_topic)\s*/i, "").trim();

      let targetTopic = specifiedTopic;
      if (!targetTopic) {
        if (threadId) {
          targetTopic = String(threadId);
        } else if (chatType === "supergroup" || chatType === "group") {
          targetTopic = "1";
        } else {
          targetTopic = "dm";
        }
      }

      if (targetTopic.toLowerCase() === "off" || targetTopic.toLowerCase() === "none") {
        auditTopics.publicChat = "off";
        chatBotSettings.topics.publicChat = "off";
        updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", "off");
        if (dbRef) {
          dbRef.collection("settings").doc("chat_bot").set({ topics: { publicChat: "off" } }, { merge: true }).catch(() => {});
        }
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `🔇 <b>Topic Routing Disabled!</b>\n\nPublic Chat messages will no longer be forwarded to any forum topic. Messages will only mirror to your 1-on-1 Admin DM.`,
          parse_mode: "HTML",
        });
        return;
      }

      if (targetTopic.toLowerCase() === "dm" || targetTopic.toLowerCase() === "pm") {
        auditTopics.publicChat = "off";
        chatBotSettings.topics.publicChat = "off";
        updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", "off");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          message_thread_id: threadId,
          text: `📱 <b>Direct DM Mode Activated:</b>\n\nPublic Chat messages and moderation controller are now bound exclusively to Admin 1-on-1 DM.`,
          parse_mode: "HTML",
        });
        return;
      }

      const cleanTopic = targetTopic.replace(/[^0-9]/g, "") || "1";
      auditTopics.publicChat = cleanTopic;
      chatBotSettings.topics.publicChat = cleanTopic;
      updateEnvFile("TELEGRAM_CHAT_TOPIC_PUBLIC_CHAT", cleanTopic);

      if (chatType === "supergroup" || chatType === "group") {
        supergroupId = String(chatId);
        chatBotSettings.supergroupId = String(chatId);
        updateEnvFile("TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID", String(chatId));
      }

      if (dbRef) {
        dbRef.collection("settings").doc("chat_bot").set({
          topics: { publicChat: cleanTopic },
          supergroupId: supergroupId || String(chatId),
        }, { merge: true }).catch(() => {});
      }

      console.log(`[CHAT-AUDIT-BOT] 🎯 Public Chat explicitly bound to Topic #${cleanTopic} in Supergroup ${supergroupId || chatId}`);

      await callTelegram("sendMessage", {
        chat_id: chatId,
        message_thread_id: cleanTopic,
        text: `🎯 <b>Public Chat & Controller Bound Successfully!</b>\n\n` +
          `• <b>Bound Forum Topic:</b> <code>#${cleanTopic}</code>\n` +
          `• <b>Supergroup ID:</b> <code>${supergroupId || chatId}</code>\n` +
          `• <b>Status:</b> 🟢 <b>Active & Ready</b>\n\n` +
          `💬 <i>Ab Web Public Chat ke saare student messages aur controller alerts sirf is topic me aayenge. Subtopics (study pods / private rooms) bilkul band hain.</i>\n\n` +
          `Reply to any message with <code>/del</code> to delete it in real-time, or type text to reply as <b>👑 OFFICIAL ADMIN</b>!`,
        parse_mode: "HTML",
      });
      return;
    }

    // Command: /current_topic or /topic
    if (text === "/current_topic" || text === "/topic" || text === "/topic_status") {
      const curTopic = auditTopics.publicChat || "Not Set";
      await callTelegram("sendMessage", {
        chat_id: chatId,
        message_thread_id: threadId,
        text: `ℹ️ <b>Current Public Chat Topic Configuration:</b>\n\n` +
          `• <b>Current Topic ID:</b> <code>#${curTopic}</code>\n` +
          `• <b>Supergroup ID:</b> <code>${supergroupId || "Not Configured"}</code>\n` +
          `• <b>Subtopics:</b> 🔇 <i>Suppressed (Public Chat Only Mode Active)</i>\n\n` +
          `💡 <i>To change or bind to a new topic, open that topic and type <code>/set_topic</code> or use <code>/set_topic &lt;id&gt;</code>.</i>`,
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
          text: `⚙️ Initializing Public Community Chat Topic now...`,
        });
        await autoCreateTopicsForSupergroup(chatId);
      } else {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `⚠️ Please enable <b>Topics</b> in this group's settings to allow topic binding.`,
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
    const targetTopic = getTargetPublicChatTopic();
    const isPublicChatTopic = targetTopic
      ? (String(threadId || "1") === String(targetTopic))
      : false;
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
        const teleMsgId = message.message_id;

        // 🛡️ STRICT REQUIREMENT: Remove personal Telegram name! Display ONLY official Admin badge.
        const senderObj = {
          id: "sys_admin_official",
          name: "👑 OFFICIAL ADMIN",
          role: "admin",
          isAdmin: true,
          isOfficialAdmin: true,
          branch: "Official Desk",
          year: "Authority",
          college: "Free Study Material",
        };

        // Record bidirectional mapping for real-time edits & deletes
        if (teleMsgId) {
          telegramToWebMsgMap.set(String(teleMsgId), msgId);
          webToTelegramMsgMap.set(String(msgId), teleMsgId);
        }

        // Case A: Image / Photo sent from Telegram
        if (Array.isArray(message.photo) && message.photo.length > 0) {
          const largestPhoto = message.photo[message.photo.length - 1];
          const filename = `chat-media-img-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
          const fileUrl = await downloadTelegramFile(largestPhoto.file_id, filename);

          if (fileUrl) {
            const webMsg = {
              id: msgId,
              telegramMsgId: teleMsgId,
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
            console.log(`[CHAT-SYNC] 📥 Synced Admin Photo into Public Chat Hall.`);
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
              telegramMsgId: teleMsgId,
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
            console.log(`[CHAT-SYNC] 📥 Synced Telegram Document (${doc.file_name}) into Public Chat Hall.`);
            return;
          }
        }

        // Case C: Standard Text message sent from Telegram
        if (text) {
          const webMsg = {
            id: msgId,
            telegramMsgId: teleMsgId,
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
          console.log(`[CHAT-SYNC] 📥 Synced Telegram Message into Public Chat Hall: "${text}"`);
        }
      }
    }
  } catch (err) {
    console.warn("[CHAT-AUDIT-BOT] Error processing update:", err.message);
  }
}

/**
 * Helper to adjust purge / inactivity days for a student from Telegram command
 */
async function handleAdjustUserPurgeDays(chatId, threadId, query, { action, days }) {
  try {
    const cleanQuery = String(query || "").trim().toLowerCase();
    if (!cleanQuery) {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        message_thread_id: threadId,
        text: "ℹ️ <b>Usage:</b> <code>/purgedays student@email.com +30</code> (or <code>/extend student@email.com 30</code>)",
        parse_mode: "HTML",
      });
      return;
    }

    let targetId = null;
    let targetName = "Student";
    let targetEmail = cleanQuery;
    let targetMobile = "N/A";

    if (dbRef) {
      const uSnap = await dbRef.collection("users").get();
      uSnap.forEach((doc) => {
        const d = doc.data() || {};
        const dEmail = (d.email || "").toLowerCase().trim();
        const dMobile = (d.mobile || "").trim();
        const dName = (d.name || "").toLowerCase().trim();
        const dId = doc.id.toLowerCase().trim();

        if (dId === cleanQuery || dEmail === cleanQuery || dMobile === cleanQuery) {
          targetId = doc.id;
          targetName = d.name || targetName;
          targetEmail = d.email || targetEmail;
          targetMobile = d.mobile || targetMobile;
        } else if (!targetId && (dEmail.includes(cleanQuery) || dName.includes(cleanQuery))) {
          targetId = doc.id;
          targetName = d.name || targetName;
          targetEmail = d.email || targetEmail;
          targetMobile = d.mobile || targetMobile;
        }
      });
    }

    if (!targetId) {
      targetId = query;
    }

    const { adjustUserInactivity } = require("./accountPurgeService");
    const res = await adjustUserInactivity(targetId, { action, days });

    const actionText = action === "increase"
      ? `Increased by +${days} Days`
      : action === "decrease"
      ? `Decreased by -${days} Days`
      : `Set to ${days} Days`;

    await callTelegram("sendMessage", {
      chat_id: chatId,
      message_thread_id: threadId,
      text: `⏳ <b>[STUDENT INACTIVITY & PURGE DAYS UPDATED]</b>\n\n` +
        `👤 <b>Student Name:</b> ${escapeHtml(res.userName || targetName)}\n` +
        `📧 <b>Email:</b> <code>${escapeHtml(res.userEmail || targetEmail)}</code>\n` +
        `📱 <b>Mobile:</b> <code>${escapeHtml(targetMobile)}</code>\n` +
        `⚡ <b>Action:</b> <b>${actionText}</b>\n` +
        `⏱️ <b>Inactivity Threshold:</b> <b>${res.effectiveThreshold} Days</b> (${res.daysRemaining} days remaining)\n` +
        `🗓️ <b>Scheduled Auto-Purge:</b> <code>${res.scheduledPurgeDate}</code>\n` +
        `\n<i>${escapeHtml(res.message)}</i>`,
      parse_mode: "HTML",
    });
  } catch (err) {
    await callTelegram("sendMessage", {
      chat_id: chatId,
      message_thread_id: threadId,
      text: `⚠️ <b>Failed to update purge days:</b> ${escapeHtml(err.message)}`,
      parse_mode: "HTML",
    });
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
    // Register the strict 5-command menu requested on Telegram
    await callTelegram("setMyCommands", {
      commands: [
        { command: "active", description: "Live active online students" },
        { command: "block", description: "Restrict a student (<email or id>)" },
        { command: "unblock", description: "Restore a student (<email or id>)" },
        { command: "blocked", description: "List restricted students" },
        { command: "clearchat", description: "Purge public chat hall" },
      ],
    });
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
      threadId: getTargetPublicChatTopic(),
    });
  }

  // Dual-delivery & Bot Control: Mirror public messages to Admin Bot DM so Admin has full 1-on-1 supervision & control
  if (effectiveAdminId && (chatBotSettings.enableAdminDmMirror || !currentSupergroupId)) {
    if (String(effectiveAdminId) !== String(currentSupergroupId)) {
      targetChats.push({
        chatId: effectiveAdminId,
        threadId: null,
      });
    }
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

          let resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: payload,
          });
          let photoRes = await resp.json().catch(() => ({}));

          // Fallback if threadId was rejected
          if (!photoRes.ok && threadId) {
            const desc = String(photoRes.description || "").toLowerCase();
            if (desc.includes("thread not found") || desc.includes("message thread")) {
              const retryBoundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
              let retryHeader = `--${retryBoundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
              const retryPayload = Buffer.concat([
                Buffer.from(retryHeader),
                fileBuffer,
                Buffer.from(`\r\n--${retryBoundary}--\r\n`),
              ]);
              resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: "POST",
                headers: { "Content-Type": `multipart/form-data; boundary=${retryBoundary}` },
                body: retryPayload,
              });
              photoRes = await resp.json().catch(() => ({}));
            }
          }

          if (photoRes.ok && photoRes.result?.message_id) {
            const teleMsgId = photoRes.result.message_id;
            message.telegramMsgId = teleMsgId;
            telegramToWebMsgMap.set(String(teleMsgId), message.id);
            webToTelegramMsgMap.set(String(message.id), teleMsgId);
          }
          continue;
        } else {
          // Direct URL sendPhoto
          const clientUrl = getSiteUrl();
          const fullUrl = message.fileUrl.startsWith("http") ? message.fileUrl : `${clientUrl}${message.fileUrl}`;
          const body = {
            chat_id: chatId,
            photo: fullUrl,
            caption,
            parse_mode: "HTML",
          };
          if (threadId) body.message_thread_id = threadId;
          const photoRes = await callTelegram("sendPhoto", body);
          if (photoRes.ok && photoRes.result?.message_id) {
            const teleMsgId = photoRes.result.message_id;
            message.telegramMsgId = teleMsgId;
            telegramToWebMsgMap.set(String(teleMsgId), message.id);
            webToTelegramMsgMap.set(String(message.id), teleMsgId);
          }
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

          let resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: "POST",
            headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: payload,
          });
          let docRes = await resp.json().catch(() => ({}));

          // Fallback if threadId was rejected
          if (!docRes.ok && threadId) {
            const desc = String(docRes.description || "").toLowerCase();
            if (desc.includes("thread not found") || desc.includes("message thread")) {
              const retryBoundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
              let retryHeader = `--${retryBoundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;
              retryHeader += `--${retryBoundary}\r\nContent-Disposition: form-data; name="document"; filename="${originalName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
              const retryPayload = Buffer.concat([
                Buffer.from(retryHeader),
                fileBuffer,
                Buffer.from(`\r\n--${retryBoundary}--\r\n`),
              ]);
              resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
                method: "POST",
                headers: { "Content-Type": `multipart/form-data; boundary=${retryBoundary}` },
                body: retryPayload,
              });
              docRes = await resp.json().catch(() => ({}));
            }
          }

          if (docRes.ok && docRes.result?.message_id) {
            const teleMsgId = docRes.result.message_id;
            message.telegramMsgId = teleMsgId;
            telegramToWebMsgMap.set(String(teleMsgId), message.id);
            webToTelegramMsgMap.set(String(message.id), teleMsgId);
          }
          continue;
        } else {
          // Direct URL sendDocument
          const clientUrl = getSiteUrl();
          const fullUrl = message.fileUrl.startsWith("http") ? message.fileUrl : `${clientUrl}${message.fileUrl}`;
          const body = {
            chat_id: chatId,
            document: fullUrl,
            caption,
            parse_mode: "HTML",
          };
          if (threadId) body.message_thread_id = threadId;
          const docRes = await callTelegram("sendDocument", body);
          if (docRes.ok && docRes.result?.message_id) {
            const teleMsgId = docRes.result.message_id;
            message.telegramMsgId = teleMsgId;
            telegramToWebMsgMap.set(String(teleMsgId), message.id);
            webToTelegramMsgMap.set(String(message.id), teleMsgId);
          }
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
      const res = await callTelegram("sendMessage", body);
      if (res.ok && res.result?.message_id) {
        const teleMsgId = res.result.message_id;
        message.telegramMsgId = teleMsgId;
        telegramToWebMsgMap.set(String(teleMsgId), message.id);
        webToTelegramMsgMap.set(String(message.id), teleMsgId);
      }
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

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";

  // 1. Edit the mirrored message in Telegram Topic 1 in-place
  const teleMsgId = webToTelegramMsgMap.get(String(messageId));
  if (teleMsgId && currentSupergroupId) {
    try {
      const senderName = sender?.name || "Student";
      const senderBranch = sender?.branch || "General";
      const senderIp = sender?.ip ? ` • 🌐 <code>${escapeHtml(sender.ip)}</code>` : "";
      await callTelegram("editMessageText", {
        chat_id: currentSupergroupId,
        message_id: teleMsgId,
        text: `💬 <b>[GENERAL HALL]</b> <b>${escapeHtml(senderName)}</b> (<i>${escapeHtml(senderBranch)}</i>${senderIp}):\n${escapeHtml(newText)} <i>(edited)</i>`,
        parse_mode: "HTML",
      });
    } catch (_) {}
  }

  // 2. Strict Audit Log: Send Tamper Alert to Dedicated Topic (Topic 1 if Topic 1 mode, or Topic 35)
  const targetChats = [];
  const targetThreadId = getTargetPublicDeletedTopic();
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

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";

  // 1. Delete or clear the mirrored message in Telegram Topic 1
  const teleMsgId = webToTelegramMsgMap.get(String(messageId));
  if (teleMsgId && currentSupergroupId) {
    try {
      await callTelegram("deleteMessage", {
        chat_id: currentSupergroupId,
        message_id: teleMsgId,
      });
    } catch (_) {}
  }

  // 2. Strict Audit Log: Send Tamper Alert to Dedicated Topic (Topic 1 if Topic 1 mode, or Topic 35)
  const targetChats = [];
  const targetThreadId = getTargetPublicDeletedTopic();
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
 * 🔒 Dispatches Real-Time Private Chat Media (PDF, Images, Documents) to Topic 33 Vault
 * Strictly for files (EXCEPT pure text messages).
 * Even if user deletes the file in private chat later, this copy stays permanently in Topic 33!
 * Caption explicitly identifies which private chat / pod it came from.
 */
async function dispatchPrivateMediaToTelegramVault({ message, room, chatMediaDir, sender }) {
  if (!chatBotSettings.enableMediaVaultUpload) return false;

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";
  if (!currentSupergroupId || !currentSupergroupId.startsWith("-100")) return false;

  const targetThreadId = auditTopics.mediaVault || "33";

  // Strict Rule: Topic 33 is EXCLUSIVELY for Private Chat Media (PDF, Images, Documents).
  // Public chat media routes to Topic 1 / 39.
  const roomId = room?.id || message?.roomId || "private";
  if (roomId === "public") {
    return false;
  }
  const roomName = room?.name || "Private Study Room";
  const secretCode = room?.secretCode || "N/A";

  const senderName = sender?.name || message?.sender?.name || "Student";
  const senderEmail = sender?.email || message?.sender?.email || "N/A";
  const senderMobile = sender?.mobile || message?.sender?.mobile || "N/A";
  const senderIp = sender?.ip || message?.sender?.ip || message?.ip || "127.0.0.1";

  const originalName = message.fileName || (message.type === "image" ? "pod_photo.jpg" : "pod_document.pdf");
  const fileMb = message.fileSize ? (Number(message.fileSize) / (1024 * 1024)).toFixed(2) : "N/A";

  let fileBuffer = null;
  if (message.fileUrl && chatMediaDir) {
    const filenameOnDisk = path.basename(message.fileUrl.split("?")[0]);
    const potentialPath = path.join(chatMediaDir, filenameOnDisk);
    if (fs.existsSync(potentialPath)) {
      try { fileBuffer = fs.readFileSync(potentialPath); } catch {}
    }
  }

  if (!fileBuffer && message.fileUrl && message.fileUrl.startsWith("http")) {
    try {
      const resp = await fetch(message.fileUrl);
      if (resp.ok) {
        const arrBuf = await resp.arrayBuffer();
        fileBuffer = Buffer.from(arrBuf);
      }
    } catch {}
  }

  const caption =
    `📎 <b>[PRIVATE CHAT MEDIA VAULT - REAL-TIME VAULT]</b>\n\n` +
    `🏠 <b>Pod Origin:</b> <b>${escapeHtml(roomName)}</b>\n` +
    `🆔 <b>Room ID:</b> <code>${escapeHtml(roomId)}</code> (🔑 Code: <code>${escapeHtml(secretCode)}</code>)\n` +
    `👤 <b>Sender:</b> <b>${escapeHtml(senderName)}</b> (📱 <code>${escapeHtml(senderMobile)}</code> | 📧 <code>${escapeHtml(senderEmail)}</code> | 🌐 <code>${escapeHtml(senderIp)}</code>)\n` +
    `📁 <b>File Name:</b> <code>${escapeHtml(originalName)}</code>\n` +
    (fileMb !== "N/A" ? `📦 <b>Size:</b> ${fileMb} MB\n` : "") +
    (message.text ? `💬 <b>Accompanying Text:</b> "${escapeHtml(message.text)}"\n` : "") +
    `🔍 <b>Status:</b> ✅ <b>Active in Private Pod</b>\n` +
    `🔒 <b>Vault Guarantee:</b> Retained permanently in Topic 33 even if deleted from private chat by user.\n` +
    `🕒 <b>Uploaded At:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>`;

  try {
    if (fileBuffer && fileBuffer.length > 0 && fileBuffer.length <= 50 * 1024 * 1024) {
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
      let formHeader = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${currentSupergroupId}\r\n`;
      if (targetThreadId) {
        formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="message_thread_id"\r\n\r\n${targetThreadId}\r\n`;
      }
      formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
      formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`;

      const isImage = (message.type === "image" || /\.(jpe?g|png|webp|gif)$/i.test(originalName));
      const fieldName = isImage ? "photo" : "document";
      const mimeType = isImage ? "image/jpeg" : "application/octet-stream";
      formHeader += `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${originalName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;

      const payload = Buffer.concat([
        Buffer.from(formHeader),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const endpoint = isImage ? "sendPhoto" : "sendDocument";
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.result?.message_id) {
        message.vaultTelegramMsgId = data.result.message_id;
        console.log(`[CHAT-VAULT] 📎 Private media "${originalName}" vaulted to Supergroup Topic 33 (msg #${data.result.message_id}).`);
      }
      return true;
    }
  } catch (err) {
    console.warn(`[CHAT-VAULT] Error vaulting private media "${originalName}":`, err.message);
  }
  return false;
}

/**
 * Dispatches Complete Private Room Forensic Audit to Telegram
 * (Strictly to Supergroup Topics 31 & 33. Never dumped into Admin 1-on-1 DM!)
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

  // Dispatches complete unredacted transcript, deleted messages ledger, and participants to Topic 31 (Pod Vault)

  // 🛡️ STRICT REQUIREMENT: Send forensic dossiers & media vault ONLY to Supergroup topics.
  // NEVER send bulky .txt transcripts, media files, or avatars to Admin 1-on-1 DM!
  const targetChatIds = [];
  const threadMap = {};

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";
  if (currentSupergroupId && currentSupergroupId.startsWith("-100")) {
    targetChatIds.push(currentSupergroupId);
    if (auditTopics.podAudits) {
      threadMap[currentSupergroupId] = auditTopics.podAudits;
    }
  }

  if (targetChatIds.length === 0) return false;

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
              const delStatus = att.isDeleted ? "⚠️ [USER DELETED THIS FILE IN CHAT - PRESERVED IN AUDIT]" : "✅ [ACTIVE AT POD CLOSE]";
              const caption =
                `📎 <b>[PRIVATE CHAT MEDIA VAULT - ARCHIVE COPY]</b>\n\n` +
                `🏠 <b>Pod Origin:</b> <b>${escapeHtml(room.name)}</b>\n` +
                `🆔 <b>Room ID:</b> <code>${room.id}</code> (🔑 Code: <code>${escapeHtml(room.secretCode || "N/A")}</code>)\n` +
                `📁 <b>File Name:</b> <code>${originalName}</code> (${fileMb} MB)\n` +
                `👤 <b>Sender:</b> ${escapeHtml(att.senderName || "Student")} (📱 <code>${escapeHtml(att.senderMobile || "N/A")}</code> | 🌐 <code>${escapeHtml(att.senderIp || "127.0.0.1")}</code>)\n` +
                `🕒 <b>Sent At:</b> ${att.createdAt || "N/A"}\n` +
                `🔍 <b>Condition / Status:</b> <b>${delStatus}</b>`;

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
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";
  const targetTopic = auditTopics.presence || "37";

  const targetChats = [];

  // Strictly route Presence & Session Logs to Topic 37
  if (currentSupergroupId && currentSupergroupId.startsWith("-100") && targetTopic) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetTopic,
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
 * 👥 Dispatches Live Active Students Count & Session Logs to Topic 37
 */
async function dispatchActiveStudentsReportToTelegram() {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";
  const targetThreadId = auditTopics.presence || "37";
  if (!currentSupergroupId || !currentSupergroupId.startsWith("-100")) return false;

  const activeUsers = typeof chatHandlers.getActiveUsers === "function" ? chatHandlers.getActiveUsers() : [];
  let bodyText = "";

  if (activeUsers.length === 0) {
    bodyText = `👥 <b>[LIVE ACTIVE STUDENTS & SESSION LOGS - TOPIC 37]</b>\n\n` +
      `🟢 <b>Active Students Online:</b> <b>0</b>\n` +
      `ℹ️ No students are currently connected to live chat sockets.\n\n` +
      `🕒 <b>Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>`;
  } else {
    const lines = activeUsers.map((u, i) => {
      const connMins = u.connectedAt ? Math.round((Date.now() - u.connectedAt) / 60000) : 0;
      const lastSecs = u.lastInteraction ? Math.round((Date.now() - u.lastInteraction) / 1000) : 0;
      return `<b>${i + 1}. ${escapeHtml(u.name || "Student")}</b> (${escapeHtml(u.role || "student")})\n` +
        `   📧 <code>${escapeHtml(u.email || "N/A")}</code> | 📱 <code>${escapeHtml(u.mobile || "N/A")}</code>\n` +
        `   🏠 Room: <code>${escapeHtml(u.roomName || u.roomId || "General")}</code>\n` +
        `   🌐 IP: <code>${escapeHtml(u.ip || "127.0.0.1")}</code>\n` +
        `   ⏱️ Connected: <b>${connMins} mins ago</b> (Last active ${lastSecs}s ago)`;
    }).join("\n\n");

    bodyText = `👥 <b>[LIVE ACTIVE STUDENTS & SESSION LOGS - TOPIC 37]</b>\n\n` +
      `🟢 <b>Total Students Currently Active:</b> <b>${activeUsers.length} Online</b>\n\n` +
      lines + `\n\n` +
      `🕒 <b>Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>`;
  }

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "🔄 Refresh Active Students", callback_data: "cmd_active" },
        { text: "📋 Blocked Students", callback_data: "cmd_blocked" },
      ],
    ],
  };

  const body = {
    chat_id: currentSupergroupId,
    text: bodyText,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  };
  if (targetThreadId) body.message_thread_id = targetThreadId;

  let res = await callTelegram("sendMessage", body);
  if (!res.ok && body.message_thread_id) {
    delete body.message_thread_id;
    await callTelegram("sendMessage", body);
  }
  return true;
}

/**
 * Dispatches Complete Chat Purge / Clear History Alert
 * (Topic: deletedMessages / 35 and publicChat / 1)
 */
async function dispatchChatPurgeAlertToTelegram({ roomId, roomName, admin, count }) {
  if (roomId !== "public") {
    return false;
  }

  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID;
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;
  const targetTopic = getTargetPublicChatTopic();

  const targetChats = [];
  if (currentSupergroupId && currentSupergroupId.startsWith("-100") && targetTopic) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetTopic,
    });
  }

  if (effectiveAdminId && (chatBotSettings.enableAdminDmMirror || !currentSupergroupId || !targetTopic)) {
    if (String(effectiveAdminId) !== String(currentSupergroupId)) {
      targetChats.push({
        chatId: effectiveAdminId,
        threadId: null,
      });
    }
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
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";
  const effectiveAdminId = chatBotSettings.adminId || activeAdminId;
  const targetTopic = getTargetPublicChatTopic();

  const targetChats = [];

  // Deliver to configured Public Chat Topic
  if (currentSupergroupId && currentSupergroupId.startsWith("-100") && targetTopic) {
    targetChats.push({
      chatId: currentSupergroupId,
      threadId: targetTopic,
      isDirect: false,
    });
  }

  // Deliver to Admin DM
  if (effectiveAdminId && (chatBotSettings.enableAdminDmMirror || !currentSupergroupId || !targetTopic)) {
    if (String(effectiveAdminId) !== String(currentSupergroupId)) {
      targetChats.push({
        chatId: effectiveAdminId,
        threadId: null,
        isDirect: true,
      });
    }
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
 * 🛡️ STRICT USER REQUIREMENT: Send ONLY to Chat Audit Supergroup Topic 114 (NOT Topic 37). NEVER to Admin DM.
 */
async function dispatchUserDeletionChatReportToTelegram({ user, admin, chatSummary = {} }) {
  const currentSupergroupId = supergroupId || process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "";

  const targetChats = [];

  // 🛡️ STRICT USER REQUIREMENT: Send ONLY to Chat Audit Supergroup Topic 114 (NOT Topic 37). NEVER to Admin DM.
  const targetThreadId = process.env.TELEGRAM_CHAT_TOPIC_PURGE_114 || "114";
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
  const inactivityDays = user.inactivityDays !== undefined ? user.inactivityDays : chatSummary.inactivityDays;
  const thresholdDays = user.thresholdDays !== undefined ? user.thresholdDays : chatSummary.thresholdDays;
  const adminName = admin?.name || (admin?.email ? "Administrator" : "Automated Lifecycle Sweeper");
  const adminEmail = admin?.email || "admin";

  const totalMessagesDeleted = Number(chatSummary.messagesCount || 0);
  const roomsInvolved = Array.isArray(chatSummary.rooms) && chatSummary.rooms.length > 0
    ? chatSummary.rooms.join(", ")
    : "Public Room";
  const tursoCleared = chatSummary.tursoRowsDeleted !== undefined ? `${chatSummary.tursoRowsDeleted} rows` : "Cleared";

  const textHtml = `🚨 <b>[STUDENT ACCOUNT CASCADE PURGE REPORT - TOPIC 114]</b>\n\n` +
    `👤 <b>Student Name:</b> <code>${escapeHtml(studentName)}</code>\n` +
    `📧 <b>Email Address:</b> <code>${escapeHtml(studentEmail)}</code>\n` +
    `📱 <b>Mobile Number:</b> <code>${escapeHtml(studentMobile)}</code>\n` +
    `🏛️ <b>College / Institute:</b> <code>${escapeHtml(studentCollege)}</code>\n` +
    (inactivityDays !== undefined
      ? `⌛ <b>Inactivity Days:</b> <code>${inactivityDays} Days${thresholdDays ? ` (Exceeded ${thresholdDays}-Day threshold)` : ""}</code>\n`
      : `⚙️ <b>Purge Trigger:</b> <code>Manual Administrator Cascade</code>\n`) +
    `\n` +
    `⚡ <b>Turso Database Rows Cleared:</b> <code>${escapeHtml(tursoCleared)} (Profiles, messages, audits, sockets)</code>\n` +
    `🔒 <b>Chat & Session Traces Expunged Status:</b> <code>100% Expunged & Cleared (Firestore + Turso LibSQL + Edge RAM)</code>\n` +
    `💬 <b>Total Chat Messages Erased:</b> <code>${totalMessagesDeleted} messages</code>\n` +
    `🏠 <b>Chat Rooms Involved:</b> <code>${escapeHtml(roomsInvolved)}</code>\n\n` +
    `👮 <b>Action Executed By:</b> <code>${escapeHtml(adminName)} (${escapeHtml(adminEmail)})</code>\n` +
    `⏰ <b>Action Timestamp:</b> <code>${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>\n\n` +
    `🔒 <i>Forensic Audit Record: User identity, Turso database rows, and all associated chat & session traces permanently expunged across Firebase and Turso. Delivered strictly to Supergroup Topic 114.</i>`;

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
  dispatchPrivateMediaToTelegramVault,
  dispatchActiveStudentsReportToTelegram,
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

