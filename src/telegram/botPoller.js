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
const { upsertNoteToTurso } = require("../services/tursoService");
const { getSiteUrl, getNotePublicUrl, getSiteName, getVaultName } = require("../config/siteConfig");

function getBotToken() {
  return (process.env.TELEGRAM_BOT_TOKEN || "").trim();
}
function getStorageChatId() {
  return (process.env.TELEGRAM_STORAGE_CHAT_ID || "").trim();
}

let isPollerRunning = false;
let currentOffset = 0;
const inFlightKeys = new Set();

function normalizeNoteTitle(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Helper: Archives and purges a stale/orphaned note from Firestore, Turso, and RAM cache
 */
async function purgeStaleNoteDoc(docSnapshot, reason = "Telegram Pre-Upload Stale Purge") {
  if (!db || !docSnapshot) return;
  const docId = docSnapshot.id;
  const d = typeof docSnapshot.data === "function" ? docSnapshot.data() : docSnapshot;
  if (!docId || !d) return;

  try {
    console.log(`[BOT POLLER] 🔄 Purging stale note "${d.title || docId}" (ID: ${docId}) — Reason: ${reason}`);
    await db.collection("deleted_records").doc(`notes_${docId}`).set({
      ...d,
      originalId: docId,
      collectionName: "notes",
      typeLabel: "Note",
      archivedAt: new Date().toISOString(),
      archivedBy: reason,
    }).catch(() => {});
    await db.collection("deleted_notes").doc(docId).set({
      ...d,
      archivedAt: new Date().toISOString(),
      archivedBy: reason,
    }).catch(() => {});
    await db.collection("notes").doc(docId).delete().catch(() => {});

    try {
      const { purgeNoteFromWebAndCdn } = require("./mtproto");
      if (typeof purgeNoteFromWebAndCdn === "function") {
        purgeNoteFromWebAndCdn(docId);
      }
    } catch (_) {}

    try {
      const { broadcastCatalogEvent } = require("../services/realtimeEventService");
      broadcastCatalogEvent({ event: "note_deleted", noteId: docId, title: d.title });
    } catch (_) {}
  } catch (err) {
    console.warn("[BOT POLLER] purgeStaleNoteDoc warning:", err.message);
  }
}

/**
 * Helper: When a Forum Topic is deleted and a new Topic is created for the same subject,
 * automatically purge all orphaned notes from the old Topic ID so fresh uploads never trigger false duplicates.
 */
async function purgeNotesForReplacedTopic({ oldThreadId = null, newThreadId, cleanSubject = "", normalizedKey = "" }) {
  if (!db || !newThreadId) return 0;
  const newTid = Number(newThreadId);
  if (!newTid || isNaN(newTid)) return 0;

  let purgedCount = 0;
  const docsToPurge = new Map();

  try {
    // 1. Discover previous threadId from subject_forum_topics before it gets overwritten
    let detectedOldTid = oldThreadId ? Number(oldThreadId) : null;
    if (!detectedOldTid && normalizedKey) {
      try {
        const existingTopicSnap = await db.collection("subject_forum_topics").doc(normalizedKey).get();
        if (existingTopicSnap.exists) {
          const prevTid = Number(existingTopicSnap.data()?.threadId || 0);
          if (prevTid > 0 && prevTid !== newTid) {
            detectedOldTid = prevTid;
          }
        }
      } catch (_) {}
    }

    // 2. Collect all notes matching the old threadId
    if (detectedOldTid && detectedOldTid !== newTid) {
      const [snapTopicNum, snapThreadNum] = await Promise.all([
        db.collection("notes").where("telegramTopicId", "==", detectedOldTid).get().catch(() => ({ empty: true, docs: [] })),
        db.collection("notes").where("telegramThreadId", "==", detectedOldTid).get().catch(() => ({ empty: true, docs: [] })),
      ]);
      for (const doc of snapTopicNum.docs || []) docsToPurge.set(doc.id, doc);
      for (const doc of snapThreadNum.docs || []) docsToPurge.set(doc.id, doc);
    }

    // 3. Also check notes with the same subject that still point to a different (deleted) topic threadId
    if (cleanSubject) {
      const { normalizeSubjectName } = require("../services/emailService");
      const normSub = typeof normalizeSubjectName === "function" ? normalizeSubjectName(cleanSubject) : cleanSubject;
      const subjectCandidates = Array.from(new Set([cleanSubject.trim(), normSub.trim()].filter(Boolean)));

      for (const subName of subjectCandidates) {
        const subSnap = await db.collection("notes").where("subject", "==", subName).get().catch(() => ({ empty: true, docs: [] }));
        for (const doc of subSnap.docs || []) {
          const d = doc.data();
          const noteTid = Number(d.telegramTopicId || d.telegramThreadId || 0);
          if (noteTid > 0 && noteTid !== newTid) {
            // Verify if that old topic is dead on Telegram or matches detectedOldTid
            let oldTopicDead = detectedOldTid && noteTid === detectedOldTid;
            if (!oldTopicDead) {
              try {
                const client = await getClient();
                if (client) {
                  const checkChat = d.telegramOriginChatId || getStorageChatId();
                  if (checkChat) {
                    const tMsgs = await client.getMessages(checkChat, { ids: [noteTid] });
                    if (!tMsgs || !tMsgs[0] || tMsgs[0].className === "MessageEmpty") {
                      oldTopicDead = true;
                    }
                  }
                } else {
                  // If GramJS client is unavailable and a newer topic ID was explicitly created for the same subject
                  if (newTid > noteTid) oldTopicDead = true;
                }
              } catch (_) {
                if (newTid > noteTid) oldTopicDead = true;
              }
            }
            if (oldTopicDead) {
              docsToPurge.set(doc.id, doc);
            }
          }
        }
      }
    }

    for (const [, docSnap] of docsToPurge.entries()) {
      await purgeStaleNoteDoc(docSnap, `Old Topic Replaced by New Topic #${newTid}`);
      purgedCount++;
    }

    if (purgedCount > 0) {
      invalidateAllCache();
      console.log(`[BOT POLLER] 🧹 Auto-purged ${purgedCount} stale note(s) from replaced topic for subject "${cleanSubject || normalizedKey}" (New Topic: #${newTid})`);
    }
  } catch (err) {
    console.warn("[BOT POLLER] purgeNotesForReplacedTopic warning:", err.message);
  }
  return purgedCount;
}

/**
 * Robust Multi-Layer Duplicate Detection Engine (Composite Index Free)
 */
async function checkDuplicateInDatabase({ fileUniqueId, fileName, title, fileSize, fileHash, threadId = null, messageId = null, subject = "" }) {
  if (!db) return null;

  let matchedDoc = null;

  try {
    // 1. Check by telegramDocumentId (Unique across Telegram)
    if (fileUniqueId) {
      const snap = await db.collection("notes").where("telegramDocumentId", "==", fileUniqueId.toString()).limit(1).get();
      if (!snap.empty) matchedDoc = snap.docs[0];
    }

    // 2. Check by fileHash if provided
    if (!matchedDoc && fileHash) {
      const snap = await db.collection("notes").where("fileHash", "==", fileHash).limit(1).get();
      if (!snap.empty) matchedDoc = snap.docs[0];
    }

    // 3. Exact originalName query with generous tolerance (tolerates up to 3MB variance)
    if (!matchedDoc && fileName) {
      const snap = await db.collection("notes").where("originalName", "==", fileName).limit(10).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
          const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
          if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
            matchedDoc = doc;
            break;
          }
        }
      }
    }

    // 4. Exact title query with generous size tolerance
    if (!matchedDoc && title) {
      const snap = await db.collection("notes").where("title", "==", title).limit(10).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
          const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
          if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
            matchedDoc = doc;
            break;
          }
        }
      }
    }

    // 5. Normalized title matching (Catches punctuation and spacing differences)
    if (!matchedDoc) {
      const normInput = normalizeNoteTitle(title || fileName);
      if (normInput) {
        const allNotes = await db.collection("notes").limit(200).get();
        for (const doc of allNotes.docs) {
          const d = doc.data();
          const normDoc = normalizeNoteTitle(d.title || d.originalName);
          if (normDoc && normInput === normDoc) {
            const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
            const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
            if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
              matchedDoc = doc;
              break;
            }
          }
        }
      }
    }

    // 🛡️ LIVENESS & TOPIC REPLACEMENT CHECK:
    // Verify if the matched note's Telegram message AND parent Forum Topic are ACTUALLY still alive!
    if (matchedDoc) {
      const d = matchedDoc.data();

      // A. Self-Message Guard: Never flag the exact message currently being ingested as a duplicate of itself
      if (
        messageId &&
        (Number(d.telegramMessageId) === Number(messageId) ||
          Number(d.telegramOriginMessageId) === Number(messageId))
      ) {
        return { isSelfMessage: true, id: matchedDoc.id, data: () => d };
      }

      const oldTopicId = Number(d.telegramTopicId || d.telegramThreadId || 0);
      const incomingTopicId = Number(threadId || 0);

      // B. If the note is being uploaded into a newly created topic (different threadId), check if the old topic was replaced/deleted
      if (oldTopicId > 0 && incomingTopicId > 0 && oldTopicId !== incomingTopicId) {
        let isOldTopicReplaced = false;

        // Check if subject_forum_topics now points to incomingTopicId instead of oldTopicId
        try {
          const topicSub = (subject || d.subject || "").trim();
          if (topicSub) {
            const normKey = topicSub.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").slice(0, 60);
            const topicDoc = await db.collection("subject_forum_topics").doc(normKey).get();
            if (topicDoc.exists) {
              const activeTid = Number(topicDoc.data()?.threadId || 0);
              if (activeTid > 0 && activeTid !== oldTopicId) {
                isOldTopicReplaced = true;
              }
            }
          }
        } catch (_) {}

        // If the user created a newer topic (incomingTopicId > oldTopicId) for the same subject/file, verify oldTopicId on Telegram
        if (!isOldTopicReplaced) {
          try {
            const client = await getClient();
            if (client) {
              const checkChat = d.telegramOriginChatId || getStorageChatId();
              if (checkChat) {
                const topicMsgs = await client.getMessages(checkChat, { ids: [oldTopicId] });
                const topicMsg = topicMsgs && topicMsgs[0];
                if (!topicMsg || topicMsg.className === "MessageEmpty") {
                  isOldTopicReplaced = true;
                }
              }
            } else if (incomingTopicId > oldTopicId) {
              // Fallback when GramJS client is offline: newer topic ID for same file means topic was recreated
              isOldTopicReplaced = true;
            }
          } catch (_) {
            if (incomingTopicId > oldTopicId) {
              isOldTopicReplaced = true;
            }
          }
        }

        if (isOldTopicReplaced) {
          console.log(`[BOT POLLER] 🔄 Prior note "${d.title}" belonged to deleted/replaced Topic #${oldTopicId} (New Topic: #${incomingTopicId}). Purging stale record!`);
          await purgeStaleNoteDoc(matchedDoc, `Telegram Topic #${oldTopicId} Deleted & Replaced by #${incomingTopicId}`);
          await purgeNotesForReplacedTopic({
            oldThreadId: oldTopicId,
            newThreadId: incomingTopicId,
            cleanSubject: subject || d.subject || "",
          });
          return null; // Stale duplicate purged! Allow fresh upload!
        }
      }

      // C. Direct Message & Parent Topic Liveness Probe on Telegram via GramJS
      try {
        const client = await getClient();
        if (client) {
          const checkChat = d.telegramOriginChatId || getStorageChatId();
          const checkMsgId = Number(d.telegramOriginMessageId || d.telegramMessageId || 0);
          if (checkChat && (checkMsgId > 0 || oldTopicId > 0)) {
            const idsToProbe = [];
            if (checkMsgId > 0) idsToProbe.push(checkMsgId);
            if (oldTopicId > 0 && oldTopicId !== checkMsgId) idsToProbe.push(oldTopicId);

            const remoteMsgs = await client.getMessages(checkChat, { ids: idsToProbe });
            const msgObj = checkMsgId > 0 ? remoteMsgs?.[0] : null;
            const topicObj =
              oldTopicId > 0
                ? oldTopicId === checkMsgId
                  ? remoteMsgs?.[0]
                  : remoteMsgs?.[idsToProbe.indexOf(oldTopicId)]
                : null;

            const isMsgDead =
              checkMsgId > 0 &&
              (!msgObj || msgObj.className === "MessageEmpty" || !msgObj.media);
            const isTopicDead =
              oldTopicId > 0 &&
              (!topicObj || topicObj.className === "MessageEmpty");

            if (isMsgDead || isTopicDead) {
              console.log(`[BOT POLLER] 🔄 Prior note "${d.title}" (ID: ${matchedDoc.id}) or its Topic #${oldTopicId} was deleted on Telegram. Purging stale record to accept fresh re-upload!`);
              await purgeStaleNoteDoc(matchedDoc, "Telegram Pre-Upload Stale Purge");
              if (isTopicDead && oldTopicId > 0) {
                await purgeNotesForReplacedTopic({
                  oldThreadId: oldTopicId,
                  newThreadId: incomingTopicId || -1,
                  cleanSubject: subject || d.subject || "",
                });
              }
              return null; // Stale duplicate purged! Allow fresh upload!
            }
          }
        }
      } catch (livenessErr) {
        console.warn("[BOT POLLER] Duplicate liveness probe warning:", livenessErr.message);
      }
      return matchedDoc;
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
  const activeToken = getBotToken();
  if (activeToken) {
    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      };
      if (replyToMsgId) body.reply_to_message_id = replyToMsgId;
      if (threadId && !isNaN(Number(threadId))) body.message_thread_id = Number(threadId);

      const res = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
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

      // Fallback 1: If reply_to_message_id caused 400 error, retry preserving message_thread_id so topic routing is maintained!
      if (threadId && !isNaN(Number(threadId))) {
        const topicRes = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            message_thread_id: Number(threadId),
            parse_mode: "HTML",
          }),
        });
        const topicData = await topicRes.json();
        if (topicData.ok) {
          console.log(`[BOT POLLER] ✅ Receipt delivered to Topic ${threadId} (replyTo bypassed)`);
          return topicData;
        }
      }

      // Fallback 2: General chat send if threadId was invalid or topic was deleted
      const cleanRes = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
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
      if (threadId && !isNaN(Number(threadId))) {
        opts.replyTo = Number(threadId);
      } else if (replyToMsgId) {
        opts.replyTo = Number(replyToMsgId);
      }
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
  const activeToken = getBotToken();
  const activeStorage = getStorageChatId();
  if (!activeToken || !activeStorage) return null;

  // Primary Path: Bot API forwardMessage
  try {
    const res = await fetch(`https://api.telegram.org/bot${activeToken}/forwardMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: activeStorage,
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
      const forwarded = await client.forwardMessages(activeStorage, {
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
      const threadId = message.message_thread_id || message.message_id;
      const activeBotUser = (process.env.TELEGRAM_BOT_USERNAME || "TechTitanNotesBot").replace(/^@/, "").trim();
      if (topicName && threadId) {
        const cleanSubject = topicName.replace(/^[^\w\s]+/, "").trim();
        const normalizedKey = cleanSubject.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);

        // If a brand new topic was created for this subject, purge any stale notes from the old deleted topic
        if (message.forum_topic_created && cleanSubject) {
          await purgeNotesForReplacedTopic({
            newThreadId: Number(threadId),
            cleanSubject,
            normalizedKey,
          });
        }

        if (cleanSubject) {
          try {
            const { saveSubjectTopicToTurso } = require("../services/tursoNotesCacheService");
            saveSubjectTopicToTurso({
              key: normalizedKey,
              subject: cleanSubject,
              threadId: Number(threadId),
              topicName: topicName,
            }).catch(() => {});
          } catch (_) {}
        }

        if (db && cleanSubject) {
          await db.collection("subject_forum_topics").doc(normalizedKey).set(
            {
              subject: cleanSubject,
              normalizedKey,
              threadId: Number(threadId),
              name: topicName,
              chatId: message.chat.id.toString(),
              botUsername: activeBotUser,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          const { ramCache } = require("../utils/ramCache");
          if (ramCache) {
            ramCache.set("tg_sub_topic_" + normalizedKey, Number(threadId), 86400);
            ramCache.set("tg_topic_sub_" + Number(threadId), cleanSubject, 86400);
            ramCache.delete("subjects_list");
          }
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
  if (!threadTitle && threadId) {
    try {
      const { getSubjectFromThreadId } = require("../services/emailService");
      const matchedSubject = await getSubjectFromThreadId(threadId);
      if (matchedSubject) {
        threadTitle = matchedSubject;
      } else {
        // Fallback: Query topic creation event directly from Telegram DC via GramJS
        const client = await getClient();
        if (client) {
          const topicMsgs = await client.getMessages(chatId, { ids: [Number(threadId)] });
          if (topicMsgs && topicMsgs[0] && topicMsgs[0].action?.title) {
            threadTitle = topicMsgs[0].action.title;
            const cleanSub = threadTitle.replace(/^[^\w\s]+/, "").trim();
            const normKey = cleanSub.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);
            if (cleanSub) {
              await purgeNotesForReplacedTopic({
                newThreadId: Number(threadId),
                cleanSubject: cleanSub,
                normalizedKey: normKey,
              });
              try {
                const { saveSubjectTopicToTurso } = require("../services/tursoNotesCacheService");
                saveSubjectTopicToTurso({
                  key: normKey,
                  subject: cleanSub,
                  threadId: Number(threadId),
                  topicName: threadTitle,
                }).catch(() => {});
              } catch (_) {}
            }
            if (db && cleanSub) {
              db.collection("subject_forum_topics").doc(normKey).set(
                {
                  subject: cleanSub,
                  normalizedKey: normKey,
                  threadId: Number(threadId),
                  name: threadTitle,
                  chatId: chatId.toString(),
                  botUsername: (process.env.TELEGRAM_BOT_USERNAME || "TechTitanNotesBot").replace(/^@/, "").trim(),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              ).catch(() => {});
            }
          }
        }
      }
    } catch (_) {}
  }

  console.log(`[BOT POLLER] 📄 Incoming Document: "${fileName}" (${(fileSize / 1024 / 1024).toFixed(1)} MB) from Chat: ${chatId} (${chatTitle || "DM"})${threadTitle ? ` [Topic: ${threadTitle}]` : ""}`);

  // In-flight concurrency lock & fingerprint check (unified across Bot Poller and MTProto)
  const sig = syncLock.getDocSignature(fileName, fileSize);
  const flightKey = `msg_${chatId}_${messageId}`;
  const rawMsgKey = `msg_${messageId}`;
  const docKey = fileUniqueId ? `doc_${fileUniqueId}` : null;

  if (
    !syncLock.canProcess(flightKey) ||
    !syncLock.canProcess(rawMsgKey) ||
    (docKey && !syncLock.canProcess(docKey)) ||
    (sig && !syncLock.canProcess(sig)) ||
    inFlightKeys.has(flightKey)
  ) {
    console.log(`[BOT POLLER] 🛡️ Duplicate event ignored (In-flight / Locked): "${fileName}"`);
    return;
  }

  inFlightKeys.add(flightKey);
  syncLock.lock(flightKey);
  syncLock.lock(rawMsgKey);
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

    // 🛡️ 4-Layer Single-Field Duplicate Detection Check (Topic & Self-Message Aware)
    const duplicateDoc = await checkDuplicateInDatabase({
      fileUniqueId,
      fileName,
      title,
      fileSize,
      fileHash,
      threadId,
      messageId,
      subject,
    });

    if (duplicateDoc) {
      if (duplicateDoc.isSelfMessage) {
        return;
      }
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

        const siteUrl = getSiteUrl();
        const dupNotice = `♻️ <b>${getVaultName()} — Duplicate Notice Receipt</b>\n\n` +
          `⚠️ <b>Duplicate File Detected: Already in Cloud Vault!</b>\n` +
          `📄 <b>Title:</b> ${dupData.title || title}\n` +
          `📚 <b>Subject:</b> ${dupData.subject || subject}\n` +
          `🎓 <b>Program:</b> ${dupData.course || course} (${dupData.branch || branch} • ${dupData.year || year})\n` +
          `💾 <b>Size:</b> ${realSize}\n` +
          `🔗 <b>Direct Link:</b> ${getNotePublicUrl(duplicateDoc.id)}\n` +
          `🌐 <b>Website:</b> ${siteUrl}\n\n` +
          `<i>🛡️ <b>Deduplication Shield:</b> This document is already indexed and live on the website. Duplicate re-upload was safely prevented to conserve cloud storage. Students can access it directly.</i>`;

        // 1. Send receipt directly to the chat where the student sent the message
        await sendTelegramMessage(chatId, dupNotice, messageId, threadId);

        // 2. Also publish duplicate notice into subject topic in storage supergroup if different chat
        try {
          const storageChat = getStorageChatId();
          if (storageChat && chatId.toString() !== storageChat.toString()) {
            const { getOrCreateSubjectForumTopic } = require("../services/emailService");
            const topicThreadId = await getOrCreateSubjectForumTopic(subject, chatId, getBotToken());
            if (topicThreadId) {
              await sendTelegramMessage(storageChat, dupNotice, null, topicThreadId).catch(() => {});
            }
          }
        } catch {}
      }
      return;
    }

    // Forward document to Central Storage Vault
    let storedMsgId = null;
    const activeStorage = getStorageChatId();
    if (activeStorage && chatId.toString() === activeStorage.toString()) {
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
      fileName: fileName,
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
      telegramTopicId: threadId,
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
    upsertNoteToTurso(noteData).catch((e) => console.warn("[TURSO-BOT] Sync notice:", e.message));
    try {
      const { upsertNoteInCache } = require("../services/tursoNotesCacheService");
      const { invalidateAllCache } = require("../utils/ramCache");
      if (typeof upsertNoteInCache === "function") {
        upsertNoteInCache(noteData).catch(() => {});
      }
      invalidateAllCache();
    } catch (_) {}
    try {
      const { broadcastCatalogEvent } = require("../services/realtimeEventService");
      broadcastCatalogEvent({ event: "note_created", note: noteData });
    } catch (_) {}

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

      const siteUrl2 = getSiteUrl();
      const receiptText = `⚡ <b>${getVaultName()} Receipt</b>\n\n` +
        `✅ <b>Note Successfully Indexed to Website!</b>\n` +
        `📄 <b>Title:</b> ${title}\n` +
        `📚 <b>Subject:</b> ${subject}\n` +
        `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
        `💾 <b>Size:</b> ${realSize}\n` +
        `🔗 <b>Direct Link:</b> ${getNotePublicUrl(noteRef.id)}\n` +
        `🌐 <b>Website:</b> ${siteUrl2}\n\n` +
        `<i>Note is now live at #1 position and accessible to all registered students.</i>`;

      // 1. Send receipt directly to the chat where the student uploaded the note
      await sendTelegramMessage(chatId, receiptText, messageId, threadId);

      // 2. Also publish receipt into the subject forum topic in central storage supergroup
      try {
        const storageChat = getStorageChatId();
        if (storageChat && chatId.toString() !== storageChat.toString()) {
          const { getOrCreateSubjectForumTopic } = require("../services/emailService");
          const topicThreadId = await getOrCreateSubjectForumTopic(subject, chatId, getBotToken());
          if (topicThreadId) {
            await sendTelegramMessage(storageChat, receiptText, null, topicThreadId).catch(() => {});
          }
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
    syncLock.unlock(rawMsgKey);
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
  const activeBotToken = getBotToken();
  if (!activeBotToken) {
    console.warn("[BOT POLLER] TELEGRAM_BOT_TOKEN missing. Poller disabled.");
    return;
  }

  isPollerRunning = true;
  console.log("[BOT POLLER] 🚀 Modern Event-Driven Telegram Bot Poller active (Zero-Load Long-Poll + Smart Backoff).");

  while (isPollerRunning) {
    try {
      const activeToken = getBotToken();
      if (!activeToken) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const url = `https://api.telegram.org/bot${activeToken}/getUpdates?offset=${currentOffset}&timeout=20`;
      const res = await fetch(url, { signal: AbortSignal.timeout(28000) });

      // Handle Telegram HTTP 429 Rate Limit (Safe backoff without getting IP blocked)
      if (res.status === 429) {
        const retryData = await res.json().catch(() => ({}));
        const retryAfter = Number(retryData?.parameters?.retry_after) || 5;
        console.warn(`[BOT POLLER-GUARD] 🛡️ Telegram rate limit (HTTP 429). Safely backing off for ${retryAfter}s (Zero IP block risk).`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // Handle Telegram HTTP 409 Conflict (Redeploy container overlap or local+prod conflict)
      if (res.status === 409) {
        console.warn("[BOT POLLER-GUARD] 🛡️ Telegram 409 Conflict: Another instance or redeploy container is currently polling. Backing off 10s...");
        await new Promise((r) => setTimeout(r, 10000));
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
      } else {
        // Event-driven idle micro-pause: Yield 1 second to Node.js event loop to maintain 0.0% CPU when idle
        await new Promise((r) => setTimeout(r, 1000));
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
  purgeNotesForReplacedTopic,
  sendTelegramMessage,
  forwardToStorageChannel,
  getBotPollerDetails,
};


