/**
 * Ultra-Fast Telegram Realtime Bot Polling & Two-Way Sync Engine
 * 1. Supports Private DMs, Direct Groups, and Subgroups (Forum Topics)
 * 2. Dynamic Subject & Academic Metadata Extraction for CSE / Engineering
 * 3. 4-Layer Duplicate Detection: Suppresses duplicate uploads with informative alert
 * 4. Dual-Pipelined Storage Forwarding (Bot API + GramJS fallback)
 * 5. Instant Rich HTML Receipt delivery to origin chat / topic
 * 6. Web Live Ingest at #1 Position with Automatic RAM Cache Purge
 */

const crypto = require("crypto");
const { db } = require("../firebase");
const { invalidateAllCache } = require("../utils/ramCache");
const { extractAcademicMetadata } = require("../utils/academicMetadata");
const { syncLock } = require("../utils/telegramSyncLock");
const { getClient } = require("./mtproto");
const { recordSyncEvent } = require("./syncTracker");

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

let isPollerRunning = false;
let currentOffset = 0;
const inFlightKeys = new Set();

/**
 * Robust 4-Layer Single-Field Duplicate Detection Engine (Composite Index Free)
 */
async function checkDuplicateInDatabase({ fileUniqueId, fileName, title, fileSize, fileHash }) {
  if (!db) return null;

  try {
    // 1. Check by telegramDocumentId (Unique across Telegram)
    if (fileUniqueId) {
      const snap = await db.collection("notes").where("telegramDocumentId", "==", fileUniqueId.toString()).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }

    // 2. Check by fileHash if provided
    if (fileHash) {
      const snap = await db.collection("notes").where("fileHash", "==", fileHash).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }

    // 3. Single-field query by exact fileSize with in-memory name / title check (Zero composite index required)
    if (fileSize && Number(fileSize) > 0) {
      const snap = await db.collection("notes").where("fileSize", "==", Number(fileSize)).limit(10).get();
      if (!snap.empty) {
        const cleanName = (fileName || "").toLowerCase().trim();
        const cleanTitle = (title || "").toLowerCase().trim();
        for (const doc of snap.docs) {
          const d = doc.data();
          const docOrig = (d.originalName || "").toLowerCase().trim();
          const docTitle = (d.title || "").toLowerCase().trim();
          if (
            (cleanName && docOrig && cleanName === docOrig) ||
            (cleanTitle && docTitle && cleanTitle === docTitle) ||
            (cleanName && docTitle && (cleanName.includes(docTitle) || docTitle.includes(cleanName)))
          ) {
            return doc;
          }
        }
      }
    }

    // 4. Single-field query by exact originalName with in-memory size verification
    if (fileName) {
      const snap = await db.collection("notes").where("originalName", "==", fileName).limit(5).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (!fileSize || !d.fileSize || Math.abs(Number(d.fileSize) - Number(fileSize)) < 1024) {
            return doc;
          }
        }
      }
    }

    // 5. Single-field query by exact title with in-memory size verification
    if (title) {
      const snap = await db.collection("notes").where("title", "==", title).limit(5).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (!fileSize || !d.fileSize || Math.abs(Number(d.fileSize) - Number(fileSize)) < 1024) {
            return doc;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[BOT POLLER] Duplicate check query warning:", err.message);
  }

  return null;
}

/**
 * Sends a message via Telegram Bot HTTP API with clean auto-retry and GramJS fallback
 */
async function sendTelegramMessage(chatId, text, replyToMsgId = null, threadId = null) {
  if (!chatId || !text) return null;

  // 1. Primary Attempt: Telegram Bot HTTP API
  if (botToken) {
    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      };
      if (replyToMsgId) body.reply_to_message_id = replyToMsgId;
      if (threadId && !isNaN(Number(threadId))) body.message_thread_id = Number(threadId);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`[BOT POLLER] ✅ Receipt delivered to Chat: ${chatId}${threadId ? ` [Thread: ${threadId}]` : ""}`);
        return data;
      }

      console.warn(`[BOT POLLER] sendMessage error (${data.description}), retrying clean send to Chat ${chatId}...`);

      // Fallback 1: If threadId or reply_to_message_id caused 400 error, retry with clean payload to chatId
      const cleanRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      });
      const cleanData = await cleanRes.json();
      if (cleanData.ok) {
        console.log(`[BOT POLLER] ✅ Receipt successfully delivered via clean fallback to Chat: ${chatId}`);
        return cleanData;
      }
      console.warn(`[BOT POLLER] Clean sendMessage failed: ${cleanData.description}`);
    } catch (httpErr) {
      console.warn("[BOT POLLER] HTTP error during sendMessage:", httpErr.message);
    }
  }

  // 2. Ultra-Reliable Fallback: GramJS Direct MTProto TCP Socket to Telegram DC
  try {
    const client = await getClient();
    if (client) {
      const opts = {
        message: text,
        parseMode: "html",
      };
      if (replyToMsgId) opts.replyTo = Number(replyToMsgId);
      const res = await client.sendMessage(chatId.toString(), opts);
      return { ok: true, result: { message_id: res.id } };
    }
  } catch (gErr) {
    // If replyTo failed (e.g. topic structure), retry without replyTo
    try {
      const client = await getClient();
      if (client) {
        const res = await client.sendMessage(chatId.toString(), { message: text, parseMode: "html" });
        return { ok: true, result: { message_id: res.id } };
      }
    } catch (gErr2) {
      console.warn("[BOT POLLER] All receipt delivery paths failed:", gErr2.message);
    }
  }

  return null;
}

/**
 * Forwards a message to the Central Storage Channel (HTTP Bot API with GramJS fallback)
 */
async function forwardToStorageChannel(fromChatId, messageId) {
  if (!botToken || !storageChatId) return null;

  // Primary Path: Bot API forwardMessage
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/forwardMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: storageChatId,
        from_chat_id: fromChatId,
        message_id: messageId,
      }),
    });
    const data = await res.json();
    if (data.ok && data.result) {
      return data.result.message_id;
    }
    console.warn("[BOT POLLER] forwardMessage API error response:", data);
  } catch (err) {
    console.warn("[BOT POLLER] Forward via HTTP API failed:", err.message);
  }

  // Secondary Path: GramJS MTProto client fallback
  try {
    const client = await getClient();
    if (client) {
      const forwarded = await client.forwardMessages(storageChatId, {
        messages: [Number(messageId)],
        fromPeer: fromChatId,
      });
      if (forwarded && forwarded[0] && forwarded[0].id) {
        return forwarded[0].id;
      }
    }
  } catch (gErr) {
    console.warn("[BOT POLLER] GramJS forward fallback warning:", gErr.message);
  }

  return null;
}

/**
 * Processes an individual incoming message from Telegram
 */
async function processIncomingMessage(message) {
  if (!message) return;

  // Handle Real-time Telegram Forum Topic Creation & Editing for Subjects via @TechTitanNotesBot
  if (message.forum_topic_created || message.forum_topic_edited) {
    try {
      const topicInfo = message.forum_topic_created || message.forum_topic_edited;
      const topicName = (topicInfo.name || "").trim();
      const threadId = message.message_thread_id;
      if (topicName && threadId) {
        const cleanSubject = topicName.replace(/^[^\w\s]+/, "").trim();
        const normalizedKey = cleanSubject.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);

        if (db && cleanSubject) {
          await db.collection("subject_forum_topics").doc(normalizedKey).set(
            {
              subject: cleanSubject,
              normalizedKey,
              threadId: Number(threadId),
              name: topicName,
              chatId: message.chat.id.toString(),
              botUsername: "TechTitanNotesBot",
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          console.log(`[BOT POLLER] 🔄 Telegram Forum Topic synced to Subjects: "${cleanSubject}" (Thread ID: ${threadId})`);
        }
      }
    } catch (topicErr) {
      console.warn("[BOT POLLER] Forum topic sync warning:", topicErr.message);
    }
    return;
  }

  // Handle /sync command directly from Telegram chat
  if (message.text && message.text.trim().toLowerCase().startsWith("/sync")) {
    try {
      const { syncTelegramChannel } = require("./mtproto");
      const res = await syncTelegramChannel();
      await sendTelegramMessage(
        message.chat.id,
        `⚡ <b>Two-Way Sync Complete!</b>\n\n` +
        `✅ <b>Verified:</b> ${res.verifiedCount} documents\n` +
        `📥 <b>Imported:</b> ${res.importedCount} new notes\n` +
        `🗑️ <b>Purged:</b> ${res.purgedCount} deleted items\n` +
        `🕒 <b>Synced At:</b> ${res.lastSync?.formattedTime || "Just now"}\n\n` +
        `<i>Website database is fully up to date.</i>`,
        message.message_id,
        message.message_thread_id
      );
    } catch (e) {
      await sendTelegramMessage(message.chat.id, `⚠️ <b>Sync Error:</b> ${e.message}`, message.message_id, message.message_thread_id);
    }
    return;
  }

  if (!message.document) return;

  const doc = message.document;
  const fileName = doc.file_name || `Study_Material_${message.message_id}.pdf`;
  const fileSize = Number(doc.file_size || 0);
  const fileUniqueId = doc.file_unique_id;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const threadId = message.message_thread_id || null;
  const caption = message.caption || "";
  const chatTitle = message.chat.title || "";
  const senderName = message.from ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim() : "Student";

  // Derive Topic / Subgroup title if available
  let threadTitle = "";
  if (message.reply_to_message?.forum_topic_created?.name) {
    threadTitle = message.reply_to_message.forum_topic_created.name;
  }

  console.log(`[BOT POLLER] 📄 Incoming Document: "${fileName}" (${(fileSize / 1024 / 1024).toFixed(1)} MB) from Chat: ${chatId} (${chatTitle || "DM"})${threadTitle ? ` [Topic: ${threadTitle}]` : ""}`);

  // In-flight concurrency lock & fingerprint check
  const sig = syncLock.getDocSignature(fileName, fileSize);
  const flightKey = `msg_${chatId}_${messageId}`;
  const docKey = fileUniqueId ? `doc_${fileUniqueId}` : null;

  if (
    !syncLock.canProcess(flightKey) ||
    (docKey && !syncLock.canProcess(docKey)) ||
    (sig && !syncLock.canProcess(sig)) ||
    inFlightKeys.has(flightKey)
  ) {
    console.log(`[BOT POLLER] 🛡️ Duplicate event ignored (In-flight / Locked): "${fileName}"`);
    return;
  }

  inFlightKeys.add(flightKey);
  syncLock.lock(flightKey);
  if (docKey) syncLock.lock(docKey);
  if (sig) syncLock.lock(sig);

  try {
    // Extract Dynamic Academic Metadata
    const metadata = extractAcademicMetadata({
      fileName,
      caption,
      chatTitle,
      threadTitle,
    });

    const { title, subject, branch, course, year } = metadata;
    const fileHash = crypto.createHash("sha256").update(`${fileName}_${fileSize}`).digest("hex");

    // 🛡️ 4-Layer Single-Field Duplicate Detection Check
    const duplicateDoc = await checkDuplicateInDatabase({
      fileUniqueId,
      fileName,
      title,
      fileSize,
      fileHash,
    });

    if (duplicateDoc) {
      const dupData = duplicateDoc.data();
      console.log(`[BOT POLLER] 🛡️ Duplicate recognized: "${title}" (Already in vault: ${duplicateDoc.id})`);

      if (syncLock.canSendReceipt(chatId, messageId)) {
        function formatRealSize(bytes) {
          const num = Number(bytes || 0);
          if (!num || num <= 0) return "0.01 MB (10 KB)";
          const mb = num / (1024 * 1024);
          const kb = num / 1024;
          if (mb < 0.1) {
            return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
          }
          return `${mb.toFixed(2)} MB`;
        }
        const realSize = formatRealSize(fileSize);

        const dupNotice = `♻️ <b>Free Study Material — Duplicate Notice Receipt</b>\n\n` +
          `⚠️ <b>Duplicate File Detected: Already in Cloud Vault!</b>\n` +
          `📄 <b>Title:</b> ${dupData.title || title}\n` +
          `📚 <b>Subject:</b> ${dupData.subject || subject}\n` +
          `🎓 <b>Program:</b> ${dupData.course || course} (${dupData.branch || branch} • ${dupData.year || year})\n` +
          `💾 <b>Size:</b> ${realSize}\n` +
          `🔗 <b>Direct Link:</b> https://freestudymaterial.onrender.com/api/notes/${duplicateDoc.id}/stream\n` +
          `🌐 <b>Website:</b> https://freestudymaterial.onrender.com\n\n` +
          `<i>🛡️ <b>Deduplication Shield:</b> This document is already indexed and live on the website. Duplicate re-upload was safely prevented to conserve cloud storage. Students can access it directly.</i>`;

        // 1. Send receipt directly to the chat where the student sent the message
        await sendTelegramMessage(chatId, dupNotice, messageId, threadId);

        // 2. Also publish duplicate notice into subject topic in storage supergroup if different chat
        try {
          const { getOrCreateSubjectForumTopic } = require("../services/emailService");
          const topicThreadId = await getOrCreateSubjectForumTopic(subject, chatId, botToken);
          const storageChat = (process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004387181748").trim();
          if (storageChat && topicThreadId && chatId.toString() !== storageChat.toString()) {
            await sendTelegramMessage(storageChat, dupNotice, null, topicThreadId).catch(() => {});
          }
        } catch {}
      }
      return;
    }

    // Forward document to Central Storage Vault
    let storedMsgId = null;
    if (storageChatId && chatId.toString() === storageChatId.toString()) {
      storedMsgId = messageId;
    } else {
      storedMsgId = await forwardToStorageChannel(chatId, messageId);
      if (!storedMsgId) {
        storedMsgId = messageId; // Fallback to original message pointer
      }
    }

    // Register stored message in syncLock so MTProto storage channel listener ignores it
    if (storedMsgId) {
      syncLock.lock(`msg_${storedMsgId}`);
      syncLock.lock(`stored_${storedMsgId}`);
    }

    if (!db) {
      console.warn("[BOT POLLER] Database unavailable for indexing.");
      return;
    }

    const noteRef = db.collection("notes").doc();
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    const noteData = {
      id: noteRef.id,
      title,
      subject,
      branch,
      course,
      year,
      semester: year,
      description: caption || `Synced from Telegram: ${chatTitle || (message.chat.type === "private" ? "Direct Bot DM" : "Telegram Group")}`,
      originalName: fileName,
      fileHash,
      mimeType: doc.mime_type || "application/pdf",
      fileSize: fileSize,
      compressedSize: fileSize,
      savingsPercent: 0,
      telegramMessageId: Number(storedMsgId),
      telegramDocumentId: fileUniqueId || doc.file_id,
      telegramBotFileId: doc.file_id,
      telegramOriginChatId: chatId.toString(),
      telegramOriginMessageId: Number(messageId),
      telegramThreadId: threadId,
      status: "ready",
      uploadedBy: "telegram-bot-realtime",
      uploaderName: senderName || "Telegram Student",
      viewsCount: 0,
      downloadsCount: 0,
      isVisible: true,
      downloadUrl: `/api/notes/${noteRef.id}/stream`,
      createdAt: nowIso,
      updatedAt: nowIso,
      _sortTimestamp: nowMs,
    };

    await noteRef.set(noteData);

    // Auto-post to Notice Board
    await db.collection("notices").add({
      title: `📚 Cloud Vault: ${title}`,
      content: `New study material synced live for ${course} (${branch}) — Subject: ${subject}.`,
      link: `/api/notes/${noteRef.id}/stream`,
      linkText: "Click Here to Read & Download Document",
      type: "new_material",
      isPinned: false,
      createdBy: "Auto-Sync Engine",
      createdAt: nowIso,
      updatedAt: nowIso,
    }).catch(() => {});

    // Send EXACTLY ONE Instant Rich HTML Receipt back to Chat / Subgroup / DM
    if (syncLock.canSendReceipt(chatId, messageId)) {
      function formatRealSize(bytes) {
        const num = Number(bytes || 0);
        if (!num || num <= 0) return "0.01 MB (10 KB)";
        const mb = num / (1024 * 1024);
        const kb = num / 1024;
        if (mb < 0.1) {
          return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
        }
        return `${mb.toFixed(2)} MB`;
      }
      const realSize = formatRealSize(fileSize);

      const receiptText = `⚡ <b>Free Study Material Vault Receipt</b>\n\n` +
        `✅ <b>Note Successfully Indexed to Website!</b>\n` +
        `📄 <b>Title:</b> ${title}\n` +
        `📚 <b>Subject:</b> ${subject}\n` +
        `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
        `💾 <b>Size:</b> ${realSize}\n` +
        `🔗 <b>Direct Link:</b> https://freestudymaterial.onrender.com/api/notes/${noteRef.id}/stream\n` +
        `🌐 <b>Website:</b> https://freestudymaterial.onrender.com\n\n` +
        `<i>Note is now live at #1 position and accessible to all registered students.</i>`;

      // 1. Send receipt directly to the chat where the student uploaded the note
      await sendTelegramMessage(chatId, receiptText, messageId, threadId);

      // 2. Also publish receipt into the subject forum topic in central storage supergroup
      try {
        const { getOrCreateSubjectForumTopic } = require("../services/emailService");
        const topicThreadId = await getOrCreateSubjectForumTopic(subject, chatId, botToken);
        const storageChat = (process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004387181748").trim();
        if (storageChat && topicThreadId && chatId.toString() !== storageChat.toString()) {
          await sendTelegramMessage(storageChat, receiptText, null, topicThreadId).catch(() => {});
        }
      } catch (topicNoticeErr) {
        console.warn("[BOT POLLER] Subject topic receipt notice warning:", topicNoticeErr.message);
      }
    }

    invalidateAllCache();
    console.log(`[BOT POLLER] ✅ Successfully published note "${title}" (#1 Position on Web)!`);
    recordSyncEvent({
      trigger: `Direct Telegram ${message.chat.type === "private" ? "DM" : "Message"}: "${title}"`,
      details: `Indexed into website (#1 Position)`,
      importedCount: 1,
    });
  } finally {
    syncLock.unlock(flightKey);
    if (docKey) syncLock.unlock(docKey);
    if (sig) syncLock.unlock(sig);

    setTimeout(() => {
      inFlightKeys.delete(flightKey);
    }, 5000);
  }
}

let consecutiveFailures = 0;
let lastSuccessfulPulse = Date.now();
let lastErrorNotice = null;

/**
 * Real-time High-Speed Long-Polling Loop with Modern Event-Driven Exponential Backoff & 429 Rate Guard
 */
async function startBotPoller() {
  if (isPollerRunning) return;
  if (!botToken) {
    console.warn("[BOT POLLER] TELEGRAM_BOT_TOKEN missing. Poller disabled.");
    return;
  }

  isPollerRunning = true;
  console.log("[BOT POLLER] 🚀 Modern Event-Driven Telegram Bot Poller active (Zero-Load Long-Poll + Smart Backoff).");

  while (isPollerRunning) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${currentOffset}&timeout=5`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });

      // Handle Telegram HTTP 429 Rate Limit (Safe backoff without getting IP blocked)
      if (res.status === 429) {
        const retryData = await res.json().catch(() => ({}));
        const retryAfter = Number(retryData?.parameters?.retry_after) || 5;
        console.warn(`[BOT POLLER-GUARD] 🛡️ Telegram rate limit (HTTP 429). Safely backing off for ${retryAfter}s (Zero IP block risk).`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Telegram API responded with HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.description || "Telegram API returned ok: false");
      }

      // Connection is healthy: reset exponential backoff immediately
      if (consecutiveFailures > 0) {
        console.log(`[BOT POLLER] ✅ Telegram connection healthy and restored. Smart backoff reset to 0ms.`);
        consecutiveFailures = 0;
      }
      lastSuccessfulPulse = Date.now();
      lastErrorNotice = null;

      if (Array.isArray(data.result) && data.result.length > 0) {
        // Acknowledge update offset immediately to prevent duplicate re-deliveries
        const maxUpdateId = Math.max(...data.result.map((u) => u.update_id));
        currentOffset = maxUpdateId + 1;

        // Process incoming updates concurrently with parallel pipeline
        await Promise.allSettled(
          data.result.map(async (update) => {
            if (update.message) {
              await processIncomingMessage(update.message);
            } else if (update.channel_post) {
              await processIncomingMessage(update.channel_post);
            }
          })
        );
      }
    } catch (err) {
      if (!isPollerRunning) break;
      consecutiveFailures++;
      lastErrorNotice = err.message;

      // Smart Exponential Backoff: 2s -> 4s -> 8s -> 16s -> 30s max, with jitter
      const baseDelay = Math.min(30000, Math.pow(2, Math.min(consecutiveFailures, 4)) * 1000);
      const jitter = Math.floor(Math.random() * 800);
      const delay = baseDelay + jitter;

      console.warn(`[BOT POLLER-RECONNECT] 📡 Telegram connection event (Attempt #${consecutiveFailures}): ${err.message}. Retrying with exponential backoff in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function stopBotPoller() {
  isPollerRunning = false;
  console.log("[BOT POLLER] Telegram Bot Poller stopped.");
}

function getBotPollerDetails() {
  return {
    isRunning: isPollerRunning,
    offset: currentOffset,
    consecutiveFailures,
    lastSuccessfulPulse: new Date(lastSuccessfulPulse).toISOString(),
    lastErrorNotice,
    mode: "Event-Driven + Smart Exponential Backoff (2s -> 4s -> 8s -> 16s -> 30s)",
    dispatch: "Parallel Non-blocking (Promise.allSettled)",
    receiptChannel: "Direct Origin Chat / Forum Topic with GramJS Socket Fallback",
    duplicateFilter: "4-Layer Universal Guard (telegramDocumentId + FileSize + Name)",
  };
}

module.exports = {
  startBotPoller,
  stopBotPoller,
  processIncomingMessage,
  checkDuplicateInDatabase,
  sendTelegramMessage,
  forwardToStorageChannel,
  getBotPollerDetails,
};


