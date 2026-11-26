const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");
const { NewMessage } = require("telegram/events");
const { CustomFile } = require("telegram/client/uploads");
const bigInt = require("big-integer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { extractAcademicMetadata } = require("../utils/academicMetadata");
const { syncLock } = require("../utils/telegramSyncLock");
const { recordSyncEvent, getLastSyncState } = require("./syncTracker");
const { getSiteUrl, getNotePublicUrl, getVaultName } = require("../config/siteConfig");

const apiId = parseInt((process.env.TELEGRAM_API_ID || "").trim(), 10);
const apiHash = (process.env.TELEGRAM_API_HASH || "").trim();
const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const storageChatId = (process.env.TELEGRAM_STORAGE_CHAT_ID || "").trim();

let client = null;
let isConnected = false;
let connectPromise = null;

// Lazy require to avoid circular dependencies
function getFirestoreDb() {
  try {
    const { db } = require("../firebase");
    return db;
  } catch {
    return null;
  }
}

function purgeNoteFromWebAndCdn(noteId) {
  if (!noteId) return;

  // 1. Purge from NVMe SSD Disk Cache and RAM Buffer
  try {
    const notesRouter = require("../routes/notes");
    if (notesRouter && typeof notesRouter.purgeCdnDiskBuffer === "function") {
      notesRouter.purgeCdnDiskBuffer(noteId);
    }
    if (notesRouter && notesRouter.noteBufferCache) {
      notesRouter.noteBufferCache.delete(noteId);
    }
  } catch (_) {}

  // 2. Purge from Turso LibSQL Edge Database & In-Place L1 RAM Filter (0 full table re-reads)
  try {
    const { removeNoteFromCache } = require("../services/tursoNotesCacheService");
    if (typeof removeNoteFromCache === "function") {
      removeNoteFromCache(noteId).catch(() => {});
    }
  } catch (_) {}

  // 3. Invalidate HTTP response cache keys while preserving warm ramNotesMemory
  try {
    const { ramCache, invalidateAllCache } = require("../utils/ramCache");
    if (ramCache) {
      ramCache.delete(`note_${noteId}`);
      ramCache.delete("all_raw_notes");
    }
    invalidateAllCache({ keepNotesRam: true });
  } catch (_) {}

  try {
    const { tursoClient } = require("../services/tursoService");
    if (tursoClient) {
      tursoClient.execute({
        sql: "DELETE FROM notes_cache WHERE id = ?",
        args: [noteId],
      }).catch(() => {});
      tursoClient.execute({
        sql: "DELETE FROM notes WHERE id = ?",
        args: [noteId],
      }).catch(() => {});
    }
  } catch (_) {}

  // 4. Purge from Cloudflare Edge Worker worldwide POP cache
  try {
    const cfWorker = (process.env.CF_WORKER_URL || process.env.VITE_CF_WORKER_URL || "").trim();
    if (cfWorker) {
      fetch(`${cfWorker}/api/notes/${noteId}/stream?purge=1`, { method: "PURGE" }).catch(() => {});
    }
  } catch (_) {}

  // 5. Broadcast real-time deletion to all connected website browsers (SSE + WebSocket)
  try {
    const { broadcastCatalogEvent } = require("../services/realtimeEventService");
    broadcastCatalogEvent({ event: "note_deleted", noteId });
  } catch (_) {}
}

function clearCache(options = { keepNotesRam: true }) {
  try {
    const { invalidateAllCache } = require("../utils/ramCache");
    invalidateAllCache(options);
  } catch {}
}

function archiveNoteToTursoRecycleBin(noteId, noteData, reason = "Telegram sync deletion") {
  if (!noteId) return;
  try {
    const { saveDeletedRecordToTurso } = require("../services/tursoNotesCacheService");
    saveDeletedRecordToTurso({
      id: `notes_${noteId}`,
      originalDocId: noteId,
      collectionName: "notes",
      title: noteData?.title || "Study Material",
      subject: noteData?.subject || "Academic",
      branch: noteData?.branch || "General",
      data: noteData,
      deletedBy: "Telegram Sync",
      reason: reason,
    }).catch(() => {});
  } catch (_) {}
}

async function getClient() {
  // If client exists and is actively connected, return immediately
  if (client && isConnected && client.connected) return client;

  // If client exists but connection dropped, attempt fast re-connect
  if (client && !client.connected) {
    try {
      console.log("[MTProto] Socket re-connecting to Telegram DC...");
      await client.connect();
      if (client.connected) {
        isConnected = true;
        return client;
      }
    } catch (e) {
      console.warn("[MTProto] Quick socket re-connect warning:", e.message);
      client = null;
      isConnected = false;
    }
  }

  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const activeApiId = parseInt((process.env.TELEGRAM_API_ID || "").trim(), 10);
      const activeApiHash = (process.env.TELEGRAM_API_HASH || "").trim();
      const activeBotToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

      if (!activeApiId || !activeApiHash || !activeBotToken) {
        console.warn("[MTProto] Telegram credentials missing. MTProto disabled.");
        return null;
      }

      const sessionPath = path.join(process.cwd(), ".telegram_session");
      let savedSession = "";
      if (fs.existsSync(sessionPath)) {
        try {
          savedSession = fs.readFileSync(sessionPath, "utf8").trim();
        } catch {}
      }

      const stringSession = new StringSession(savedSession);
      client = new TelegramClient(stringSession, activeApiId, activeApiHash, {
        connectionRetries: 25,
        retryDelay: 1000,
        autoReconnect: true,
        useWSS: false, // Node.js works best with direct TCPFull
        deviceModel: "AcademicCloud-v3",
        appVersion: "3.0.0",
        systemVersion: "Production",
      });

      await client.start({
        botAuthToken: activeBotToken,
      });

      try {
        const exportedSession = client.session.save();
        if (exportedSession) {
          fs.writeFileSync(sessionPath, exportedSession, "utf8");
        }
      } catch {}

      isConnected = true;
      console.log("[MTProto] Connected directly to Telegram DC via GramJS (16 Workers Engine).");

      // Initialize Two-Way Channel Synchronization Listeners
      setupChannelSyncListeners(client);

      return client;
    } catch (err) {
      console.error("[MTProto] Connection failed:", err.message);
      isConnected = false;
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * Two-Way Realtime Channel Synchronization:
 * 1. Storage Channel Ingest: Real-time indexing from main cloud vault channel.
 * 2. Admin Direct DM Ingest: Accepts PDFs sent directly to bot by authorized admins.
 * 3. Topic-Based Group Ingest: Auto-categorizes branch/year from topic threads.
 * 4. Auto-Delete & Topic Purge: Removes notes from web if message or entire topic is deleted.
 */
// In-memory sets to prevent duplicate parallel ingest across Channel, DM and Topic streams
const processingDocIds = new Set();
const processingMsgIds = new Set();

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
 * Checks if a note already exists in the Firestore database to prevent any duplicates
 * Single-field queries with in-memory matching (Zero composite index requirement)
 */
async function isDuplicateNote(db, { docIdStr, msgId, originalName, title, fileSize, fileHash, topicThreadId = null, subject = "" }) {
  if (!db) return null;

  let candidateDoc = null;

  try {
    // 1. Check by telegramDocumentId (GramJS DC unique document ID)
    if (docIdStr) {
      const snap = await db.collection("notes").where("telegramDocumentId", "==", docIdStr.toString()).limit(1).get();
      if (!snap.empty) candidateDoc = snap.docs[0];
    }

    // 2. Check by telegramMessageId
    if (!candidateDoc && msgId && Number(msgId) > 0) {
      const snap = await db.collection("notes").where("telegramMessageId", "==", Number(msgId)).limit(1).get();
      if (!snap.empty) candidateDoc = snap.docs[0];
    }

    // 3. Check by fileHash if provided
    if (!candidateDoc && fileHash) {
      const snap = await db.collection("notes").where("fileHash", "==", fileHash).limit(1).get();
      if (!snap.empty) candidateDoc = snap.docs[0];
    }

    // 4. Single-field query by exact fileSize with in-memory name / title check (Zero composite index required)
    if (!candidateDoc && fileSize && Number(fileSize) > 0) {
      const snap = await db.collection("notes").where("fileSize", "==", Number(fileSize)).limit(10).get();
      if (!snap.empty) {
        const cleanName = (originalName || "").toLowerCase().trim();
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
            candidateDoc = doc;
            break;
          }
        }
      }
    }

    // 5. Query by originalName (tolerates up to 3MB variance for Telegram wrapper / re-compression)
    if (!candidateDoc && originalName) {
      const snap = await db.collection("notes").where("originalName", "==", originalName).limit(10).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
          const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
          if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
            candidateDoc = doc;
            break;
          }
        }
      }
    }

    // 6. Query by exact title with generous size tolerance
    if (!candidateDoc && title) {
      const snap = await db.collection("notes").where("title", "==", title).limit(10).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
          const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
          if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
            candidateDoc = doc;
            break;
          }
        }
      }
    }

    // 7. Normalized title matching via 0ms L1 RAM Cache first (Zero DB Read overhead)
    if (!candidateDoc) {
      const normInput = normalizeNoteTitle(title || originalName);
      if (normInput) {
        let cachedList = null;
        try {
          const { getAllCachedNotes } = require("../services/tursoNotesCacheService");
          cachedList = await getAllCachedNotes();
        } catch (_) {}

        if (Array.isArray(cachedList) && cachedList.length > 0) {
          for (const item of cachedList) {
            const itemId = item.id || item.docId;
            if (!itemId) continue;
            const normDoc = normalizeNoteTitle(item.title || item.originalName);
            if (normDoc && normInput === normDoc) {
              const sizeDiff = Math.abs(Number(item.fileSize || 0) - Number(fileSize || 0));
              const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
              if (!fileSize || !item.fileSize || sizeDiff <= maxDiff || Number(item.fileSize) < 5000 || Number(fileSize) < 5000) {
                candidateDoc = { id: itemId, data: () => item };
                break;
              }
            }
          }
        } else {
          const allNotes = await db.collection("notes").limit(200).get();
          for (const doc of allNotes.docs) {
            const d = doc.data();
            const normDoc = normalizeNoteTitle(d.title || d.originalName);
            if (normDoc && normInput === normDoc) {
              const sizeDiff = Math.abs(Number(d.fileSize || 0) - Number(fileSize || 0));
              const maxDiff = Math.max(3 * 1024 * 1024, Number(fileSize || 0) * 0.25);
              if (!fileSize || !d.fileSize || sizeDiff <= maxDiff || Number(d.fileSize) < 5000 || Number(fileSize) < 5000) {
                candidateDoc = doc;
                break;
              }
            }
          }
        }
      }
    }

    // 🛡️ LIVENESS & TOPIC REPLACEMENT CHECK:
    if (candidateDoc) {
      const d = candidateDoc.data();

      // A. Self-Message Guard: If botPoller just indexed this exact message milliseconds ago, do NOT send a duplicate receipt!
      if (
        msgId &&
        (Number(d.telegramMessageId) === Number(msgId) ||
          Number(d.telegramOriginMessageId) === Number(msgId))
      ) {
        return { isSelfMessage: true, id: candidateDoc.id, data: () => d };
      }

      const oldTopicId = Number(d.telegramTopicId || d.telegramThreadId || 0);
      const incomingTopicId = Number(topicThreadId || 0);

      // B. If the note is being uploaded into a newly created topic (different threadId), check if the old topic was replaced/deleted
      if (oldTopicId > 0 && incomingTopicId > 0 && oldTopicId !== incomingTopicId) {
        let isOldTopicReplaced = false;
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

        if (!isOldTopicReplaced) {
          try {
            if (client) {
              const checkChat = d.telegramOriginChatId || storageChatId;
              if (checkChat) {
                const topicMsgs = await client.getMessages(checkChat, { ids: [oldTopicId] });
                const topicMsg = topicMsgs && topicMsgs[0];
                if (!topicMsg || topicMsg.className === "MessageEmpty") {
                  isOldTopicReplaced = true;
                }
              }
            } else if (incomingTopicId > oldTopicId) {
              isOldTopicReplaced = true;
            }
          } catch (_) {
            if (incomingTopicId > oldTopicId) {
              isOldTopicReplaced = true;
            }
          }
        }

        if (isOldTopicReplaced) {
          console.log(`[MTProto] 🔄 Prior note "${d.title}" belonged to deleted/replaced Topic #${oldTopicId} (New Topic: #${incomingTopicId}). Purging stale record!`);
          archiveNoteToTursoRecycleBin(candidateDoc.id, d, `Telegram Topic #${oldTopicId} Replaced by #${incomingTopicId}`);
          await db.collection("deleted_records").doc(`notes_${candidateDoc.id}`).set({
            ...d,
            originalId: candidateDoc.id,
            collectionName: "notes",
            typeLabel: "Note",
            archivedAt: new Date().toISOString(),
            archivedBy: "Telegram Pre-Upload Stale Purge",
          }).catch(() => {});
          await db.collection("deleted_notes").doc(candidateDoc.id).set({
            ...d,
            archivedAt: new Date().toISOString(),
            archivedBy: "Telegram Pre-Upload Stale Purge",
          }).catch(() => {});
          await db.collection("notes").doc(candidateDoc.id).delete().catch(() => {});
          purgeNoteFromWebAndCdn(candidateDoc.id);
          try {
            const { purgeNotesForReplacedTopic } = require("./botPoller");
            if (typeof purgeNotesForReplacedTopic === "function") {
              await purgeNotesForReplacedTopic({
                oldThreadId: oldTopicId,
                newThreadId: incomingTopicId,
                cleanSubject: subject || d.subject || "",
              });
            }
          } catch (_) {}
          return null;
        }
      }

      // C. Direct Message & Parent Topic Liveness Probe on Telegram
      try {
        if (client) {
          const checkChat = d.telegramOriginChatId || storageChatId;
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
              console.log(`[MTProto] 🔄 Prior note "${d.title}" (ID: ${candidateDoc.id}) or its Topic #${oldTopicId} was deleted on Telegram. Purging stale record to accept fresh re-upload!`);
              archiveNoteToTursoRecycleBin(candidateDoc.id, d, "Telegram Pre-Upload Stale Purge");
              await db.collection("deleted_records").doc(`notes_${candidateDoc.id}`).set({
                ...d,
                originalId: candidateDoc.id,
                collectionName: "notes",
                typeLabel: "Note",
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Pre-Upload Stale Purge",
              }).catch(() => {});
              await db.collection("deleted_notes").doc(candidateDoc.id).set({
                ...d,
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Pre-Upload Stale Purge",
              }).catch(() => {});
              await db.collection("notes").doc(candidateDoc.id).delete().catch(() => {});
              purgeNoteFromWebAndCdn(candidateDoc.id);
              if (isTopicDead && oldTopicId > 0) {
                try {
                  const { purgeNotesForReplacedTopic } = require("./botPoller");
                  if (typeof purgeNotesForReplacedTopic === "function") {
                    await purgeNotesForReplacedTopic({
                      oldThreadId: oldTopicId,
                      newThreadId: incomingTopicId || -1,
                      cleanSubject: subject || d.subject || "",
                    });
                  }
                } catch (_) {}
              }
              return null; // Stale duplicate purged! Allow fresh upload!
            }
          }
        }
      } catch (_) {}
      return candidateDoc;
    }
  } catch (err) {
    console.warn("[MTProto] Duplicate check query warning:", err.message);
  }

  return null;
}

function setupChannelSyncListeners(c) {
  if (!storageChatId) return;

  // 1. Direct Telegram Storage Channel Ingest (Vault Channel Only)
  // Dedicated to indexing files uploaded directly to the central cloud storage channel.
  // User interactions (DMs, Forum Topics, Groups) are exclusively handled by botPoller.js
  // to guarantee EXACTLY ONE receipt and prevent duplicate ingestion races.
  c.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message) return;

      const targetStr = storageChatId ? storageChatId.toString().replace("-100", "") : "";
      const chatStr = (message.chatId || message.peerId?.channelId || message.peerId?.chatId || "").toString().replace("-100", "");

      // 🛡️ DUAL-LISTENER SUPPRESSION:
      // If message did NOT originate directly in the storage channel, botPoller.js is the sole ingest handler.
      if (!targetStr || !chatStr || targetStr !== chatStr) {
        return;
      }

      // Detect Topic Creation via MTProto (`MessageActionTopicCreate`) and immediately purge stale notes from any replaced topic
      if (message.action && message.action.className === "MessageActionTopicCreate" && message.action.title) {
        try {
          const rawTitle = (message.action.title || "").trim();
          const cleanSub = rawTitle.replace(/^[^\w\s]+/, "").trim();
          const normKey = cleanSub.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);
          const newTid = Number(message.id);
          if (cleanSub && newTid > 0) {
            const { purgeNotesForReplacedTopic } = require("./botPoller");
            if (typeof purgeNotesForReplacedTopic === "function") {
              await purgeNotesForReplacedTopic({
                newThreadId: newTid,
                cleanSubject: cleanSub,
                normalizedKey: normKey,
              });
            }
          }
        } catch (_) {}
        return;
      }

      if (!message.media || !message.media.document) return;

      const doc = message.media.document;
      const docIdStr = doc.id?.toString();
      const msgId = Number(message.id);

      // Give botPoller.js a 650ms head-start on Forum Topic / Supergroup uploads so botPoller claims syncLock first
      if ((process.env.TELEGRAM_BOT_TOKEN || "").trim()) {
        await new Promise((r) => setTimeout(r, 650));
      }

      // =========================================================================
      // STORAGE CHANNEL INGEST:
      // If forwarded from botPoller or locked in syncLock, SKIP!
      // =========================================================================
      if (message.fwdFrom) return;
      const chatMsgKey = `msg_${storageChatId}_${msgId}`;
      const rawMsgKey = `msg_${msgId}`;
      if (msgId && (!syncLock.canProcess(rawMsgKey) || !syncLock.canProcess(chatMsgKey))) return;
      if (msgId && !syncLock.canProcess(`stored_${msgId}`)) return;
      if (docIdStr && !syncLock.canProcess(`doc_${docIdStr}`)) return;
      if (processingMsgIds.has(msgId)) return;
      if (docIdStr && processingDocIds.has(docIdStr)) return;

      const db = getFirestoreDb();
      if (!db) return;

      const docAttr = doc.attributes?.find((a) => a instanceof Api.DocumentAttributeFilename);
      const originalName = docAttr?.fileName || `Material_${message.id}.pdf`;
      const caption = message.message || "";
      const fileSize = Number(doc.size || 0);

      const sig = syncLock.getDocSignature(originalName, fileSize);
      if (sig && !syncLock.canProcess(sig)) return;

      // Reserve IMMEDIATELY in memory & syncLock BEFORE any async await calls to prevent race conditions with botPoller
      if (processingMsgIds.size >= 300) {
        const oldestMsg = processingMsgIds.values().next().value;
        if (oldestMsg !== undefined) processingMsgIds.delete(oldestMsg);
      }
      if (processingDocIds.size >= 300) {
        const oldestDoc = processingDocIds.values().next().value;
        if (oldestDoc !== undefined) processingDocIds.delete(oldestDoc);
      }
      processingMsgIds.add(msgId);
      if (docIdStr) processingDocIds.add(docIdStr);
      syncLock.lock(rawMsgKey);
      syncLock.lock(chatMsgKey);
      if (docIdStr) syncLock.lock(`doc_${docIdStr}`);
      if (sig) syncLock.lock(sig);

      try {
        // Topic thread ID detection from GramJS message reply header
        const topicThreadId = message.replyTo?.replyToTopId || message.replyTo?.replyToMsgId || null;
        let threadTitle = "";
        if (topicThreadId) {
          try {
            const { getSubjectFromThreadId } = require("../services/emailService");
            const matchedSubject = await getSubjectFromThreadId(topicThreadId);
            if (matchedSubject) {
              threadTitle = matchedSubject;
            }
          } catch (_) {}
        }

        // Extract dynamic academic metadata from filename & caption
        const meta = extractAcademicMetadata({ fileName: originalName, caption, threadTitle });
        let { title, subject, branch, course, year } = meta;
        if (!subject && threadTitle) {
          subject = threadTitle;
        }
        const fileHash = crypto.createHash("sha256").update(`${originalName}_${fileSize}`).digest("hex");

        // Comprehensive duplicate prevention check (Single-field queries, zero composite index needed)
        const dup = await isDuplicateNote(db, {
          docIdStr,
          msgId,
          originalName,
          title,
          fileSize,
          fileHash,
          topicThreadId,
          subject,
        });
        if (dup) {
          if (dup.isSelfMessage) {
            return;
          }
          console.log(`[MTProto SYNC] 🛡️ Duplicate note ignored in channel: "${title}" (Msg ID: ${msgId}, Doc ID: ${docIdStr})`);

          if (topicThreadId && syncLock.canSendReceipt(storageChatId, msgId)) {
            function formatRealSize(bytes) {
              const num = Number(bytes || 0);
              if (!num || num <= 0) return "0.01 MB (10 KB)";
              const mb = num / (1024 * 1024);
              const kb = num / 1024;
              if (mb < 0.1) return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
              return `${mb.toFixed(2)} MB`;
            }
            const realSize = formatRealSize(fileSize);
            const siteUrl = getSiteUrl();
            const dupNotice =
              `♻️ <b>${getVaultName()} — Duplicate Notice Receipt</b>\n\n` +
              `⚠️ <b>Duplicate File Detected: Already in Cloud Vault!</b>\n` +
              `📄 <b>Title:</b> ${title}\n` +
              `📚 <b>Subject:</b> ${subject}\n` +
              `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
              `💾 <b>Size:</b> ${realSize}\n` +
              `🔗 <b>Direct Link:</b> ${getNotePublicUrl(dup.id || dup.docId || "")}\n` +
              `🌐 <b>Website:</b> ${siteUrl}\n\n` +
              `<i>🛡️ This document is already live on the platform. Duplicate re-upload was safely prevented.</i>`;

            c.sendMessage(storageChatId, {
              message: dupNotice,
              parseMode: "html",
              replyTo: Number(topicThreadId),
            }).catch(() => {});
          }
          return;
        }

        console.log(`[MTProto SYNC] 🚀 Direct Telegram note detected in vault: "${originalName}" (Msg ID: ${message.id})`);

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
        description: caption || "Directly synced from official repository vault.",
        fileName: originalName,
        originalName,
        fileHash,
        mimeType: doc.mimeType || "application/pdf",
        fileSize,
        compressedSize: fileSize,
        savingsPercent: 0,
        telegramMessageId: Number(message.id),
        telegramOriginChatId: storageChatId ? storageChatId.toString() : null,
        telegramOriginMessageId: Number(message.id),
        telegramDocumentId: doc.id?.toString() || null,
        telegramThreadId: topicThreadId,
        telegramTopicId: topicThreadId,
        status: "ready",
        uploadedBy: "telegram-channel-sync",
        uploaderName: "Direct Sync",
        viewsCount: 0,
        downloadsCount: 0,
        isVisible: true,
        downloadUrl: `/api/notes/${noteRef.id}/stream`,
        createdAt: nowIso,
        updatedAt: nowIso,
        _sortTimestamp: nowMs,
      };

      await noteRef.set(noteData);

      // Auto-post to Notice Board & sync L1/L2 Notice Cache immediately
      const autoNoticeData = {
        title: `📚 Cloud Vault: ${title}`,
        content: `New note synced live for ${course} (${branch}) — Subject: ${subject}.`,
        link: `/api/notes/${noteRef.id}/stream`,
        linkText: "Click Here to Read Document",
        type: "new_material",
        isPinned: false,
        createdBy: "Auto-Sync",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const noticeRef = await db.collection("notices").add(autoNoticeData).catch(() => null);
      if (noticeRef && noticeRef.id) {
        try {
          const { upsertNoticeInCache } = require("../services/tursoNoticesCacheService");
          if (typeof upsertNoticeInCache === "function") {
            upsertNoticeInCache({ id: noticeRef.id, ...autoNoticeData }).catch(() => {});
          }
        } catch (_) {}
      }

      // Sync to Turso database and RAM caches (Incremental in-place update -> 0 full table re-reads)
      try {
        const { upsertNoteToTurso } = require("../services/tursoService");
        const { upsertNoteInCache } = require("../services/tursoNotesCacheService");
        const { invalidateAllCache } = require("../utils/ramCache");
        upsertNoteToTurso(noteData).catch((e) => console.warn("[TURSO-MTPROTO] Sync warning:", e.message));
        if (typeof upsertNoteInCache === "function") {
          await upsertNoteInCache(noteData).catch(() => {});
        }
        invalidateAllCache({ keepNotesRam: true });
        try {
          const { broadcastCatalogEvent } = require("../services/realtimeEventService");
          broadcastCatalogEvent({ event: "note_created", note: noteData });
        } catch (_) {}
      } catch (_) {}

      // Deliver instant rich HTML receipt back to the Topic in Telegram!
      if (topicThreadId && syncLock.canSendReceipt(storageChatId, msgId)) {
        function formatRealSize(bytes) {
          const num = Number(bytes || 0);
          if (!num || num <= 0) return "0.01 MB (10 KB)";
          const mb = num / (1024 * 1024);
          const kb = num / 1024;
          if (mb < 0.1) return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
          return `${mb.toFixed(2)} MB`;
        }
        const realSize = formatRealSize(fileSize);
        const siteUrl = getSiteUrl();
        const receiptText =
          `⚡ <b>${getVaultName()} Receipt</b>\n\n` +
          `✅ <b>Note Successfully Indexed to Website!</b>\n` +
          `📄 <b>Title:</b> ${title}\n` +
          `📚 <b>Subject:</b> ${subject}\n` +
          `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
          `💾 <b>Size:</b> ${realSize}\n` +
          `🔗 <b>Direct Link:</b> ${getNotePublicUrl(noteRef.id)}\n` +
          `🌐 <b>Website:</b> ${siteUrl}\n\n` +
          `<i>Note is now live at #1 position and accessible to all registered students.</i>`;

        try {
          await c.sendMessage(storageChatId, {
            message: receiptText,
            parseMode: "html",
            replyTo: Number(topicThreadId),
          });
          console.log(`[MTProto SYNC] ✅ Receipt successfully delivered to Topic #${topicThreadId}`);
        } catch (receiptErr) {
          console.warn("[MTProto SYNC] Topic receipt dispatch warning:", receiptErr.message);
        }
      }

      clearCache();
      console.log(`[MTProto SYNC] Note "${title}" successfully published to web platform!`);
      recordSyncEvent({
        trigger: `Direct Telegram Vault Upload: "${title}"`,
        details: `Indexed into website (#1 Position)`,
        importedCount: 1,
      });
      } finally {
        syncLock.unlock(rawMsgKey);
        syncLock.unlock(chatMsgKey);
        if (docIdStr) syncLock.unlock(`doc_${docIdStr}`);
        if (sig) syncLock.unlock(sig);
      }
    } catch (err) {
      console.warn("[MTProto SYNC] Direct ingest error:", err.message);
    }
  }, new NewMessage({}));

  // 4. Listen for Telegram Message & Topic Deletion updates
  c.addEventHandler(async (update) => {
    try {
      if (
        update instanceof Api.UpdateDeleteChannelMessages ||
        update instanceof Api.UpdateDeleteMessages
      ) {
        const deletedIds = (update.messages || []).map(Number);
        if (deletedIds.length === 0) return;

        const db = getFirestoreDb();
        if (!db) return;

        console.log(`[MTProto SYNC] 🗑️ Telegram deletion detected for message/topic IDs:`, deletedIds);
        recordSyncEvent({
          trigger: `Telegram Deletion Event (IDs: ${deletedIds.join(", ")})`,
          details: `Auto-purged ${deletedIds.length} message(s) from website`,
          purgedCount: deletedIds.length,
        });

        let directPurgedCount = 0;

        for (const delId of deletedIds) {
          // A. Purge note by telegramMessageId (Storage Channel message)
          const snapMsg = await db.collection("notes").where("telegramMessageId", "==", delId).get();
          if (!snapMsg.empty) {
            for (const doc of snapMsg.docs) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Storage Message ${delId} was deleted.`);
              archiveNoteToTursoRecycleBin(doc.id, noteData, "Storage Message Deleted in Telegram");
              await db.collection("deleted_records").doc(`notes_${doc.id}`).set({
                ...noteData,
                originalId: doc.id,
                collectionName: "notes",
                typeLabel: "Note",
                title: noteData.title || "Study Material",
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              });
              await db.collection("deleted_notes").doc(doc.id).set({
                ...noteData,
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              });
              await db.collection("notes").doc(doc.id).delete();
              purgeNoteFromWebAndCdn(doc.id);
              directPurgedCount++;
            }
          }

          // B. Purge note by telegramOriginMessageId (Group / DM original message)
          const snapOrigin = await db.collection("notes").where("telegramOriginMessageId", "==", delId).get();
          if (!snapOrigin.empty) {
            for (const doc of snapOrigin.docs) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Original Message ${delId} was deleted.`);
              archiveNoteToTursoRecycleBin(doc.id, noteData, "Original Message Deleted in Telegram");
              await db.collection("deleted_records").doc(`notes_${doc.id}`).set({
                ...noteData,
                originalId: doc.id,
                collectionName: "notes",
                typeLabel: "Note",
                title: noteData.title || "Study Material",
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              });
              await db.collection("deleted_notes").doc(doc.id).set({
                ...noteData,
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              });
              await db.collection("notes").doc(doc.id).delete();
              purgeNoteFromWebAndCdn(doc.id);
              directPurgedCount++;
            }
          }

          // C. Purge ALL notes where telegramTopicId or telegramThreadId matches delId (topic deleted in Telegram)
          const topicDocsToPurge = [];
          const snapTopic = await db.collection("notes").where("telegramTopicId", "==", delId).get();
          if (!snapTopic.empty) topicDocsToPurge.push(...snapTopic.docs);
          const snapThread = await db.collection("notes").where("telegramThreadId", "==", delId).get();
          if (!snapThread.empty) {
            for (const tDoc of snapThread.docs) {
              if (!topicDocsToPurge.some((d) => d.id === tDoc.id)) topicDocsToPurge.push(tDoc);
            }
          }

          if (topicDocsToPurge.length > 0) {
            for (const doc of topicDocsToPurge) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Topic ${delId} was deleted in Telegram.`);
              archiveNoteToTursoRecycleBin(doc.id, noteData, "Topic Deleted in Telegram");
              await db.collection("deleted_records").doc(`notes_${doc.id}`).set({
                ...noteData,
                originalId: doc.id,
                collectionName: "notes",
                typeLabel: "Note",
                title: noteData.title || "Study Material",
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              }).catch(() => {});
              await db.collection("deleted_notes").doc(doc.id).set({
                ...noteData,
                archivedAt: new Date().toISOString(),
                archivedBy: "Telegram Two-Way Sync Deletion",
              }).catch(() => {});
              await db.collection("notes").doc(doc.id).delete().catch(() => {});
              if (noteData.telegramMessageId && storageChatId && noteData.telegramMessageId !== delId) {
                deleteTelegramMessages([noteData.telegramMessageId], storageChatId).catch(() => {});
              }
              purgeNoteFromWebAndCdn(doc.id);
              directPurgedCount++;
            }
          }
        }

        // Only run lightweight fallback liveness probe if the deleted IDs did not directly match any known message/topic ID
        if (directPurgedCount === 0) {
          await checkNotesLivenessNow().catch(() => {});
        }
        clearCache();
      }
    } catch (err) {
      console.warn("[MTProto SYNC] Delete event error:", err.message);
    }
  });

  console.log("[MTProto] Two-Way Channel Synchronization Active: Real-time Ingest & Auto-Delete ready.");
}

/**
 * Automated Database Deduplication Sweep
 * Sweeps the entire notes collection and removes any duplicates based on:
 * 1. telegramDocumentId (exact match)
 * 2. fileHash (SHA-256 match)
 * 3. telegramMessageId (exact match)
 * 4. normalizedTitle / originalName match (within 3MB metadata/wrapper variance)
 */
async function deduplicateDatabaseNotes() {
  const db = getFirestoreDb();
  if (!db) return { success: false, cleanedCount: 0 };

  let notesList = [];
  try {
    const { getAllCachedNotes } = require("../services/tursoNotesCacheService");
    notesList = await getAllCachedNotes();
  } catch (_) {}

  if (!notesList || notesList.length === 0) {
    try {
      const snap = await db.collection("notes").get();
      notesList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn("[DEDUP] Firestore read notice (falling back):", e.message);
      return { success: false, cleanedCount: 0 };
    }
  }

  const seenDocIds = new Map();
  const seenHashes = new Map();
  const seenTgMsgIds = new Map();
  const seenNormTitles = new Map();
  let duplicateCleanedCount = 0;

  for (const doc of notesList) {
    const data = doc;
    const docIdStr = data.telegramDocumentId;
    const normTitle = normalizeNoteTitle(data.title || data.originalName);

    let isDup = false;
    let reason = "";

    if (docIdStr && seenDocIds.has(docIdStr)) {
      isDup = true;
      reason = "telegramDocumentId match";
    } else if (data.fileHash && seenHashes.has(data.fileHash)) {
      isDup = true;
      reason = "fileHash match";
    } else if (data.telegramMessageId && Number(data.telegramMessageId) > 0 && seenTgMsgIds.has(Number(data.telegramMessageId))) {
      isDup = true;
      reason = "telegramMessageId match";
    } else if (normTitle && seenNormTitles.has(normTitle)) {
      const prev = seenNormTitles.get(normTitle);
      const sizeDiff = Math.abs(Number(data.fileSize || 0) - Number(prev.fileSize || 0));
      let configuredMaxVariance = 3 * 1024 * 1024; // Default 3 MB (3,145,728 Bytes)
      try {
        const { getDedupSettings } = require("../services/dedupSettings");
        const cfg = getDedupSettings();
        if (cfg.enableSmartDeduplication === false) {
          configuredMaxVariance = 0; // Deduplication disabled
        } else {
          configuredMaxVariance = Number(cfg.dedupMaxVarianceBytes || (3 * 1024 * 1024));
        }
      } catch (_) {}

      const maxDiff = Math.max(configuredMaxVariance, Number(data.fileSize || prev.fileSize || 0) * 0.25);
      // If same normalized title and size difference is within configured variance (default 3MB)
      if (sizeDiff <= maxDiff || Number(data.fileSize || 0) < 5000 || Number(prev.fileSize || 0) < 5000) {
        isDup = true;
        reason = `Normalized title match ("${data.title}") with ${(sizeDiff / (1024 * 1024)).toFixed(2)} MB variance (Configured limit: ${(maxDiff / (1024 * 1024)).toFixed(2)} MB / ${maxDiff.toLocaleString()} Bytes)`;
      }
    }

    if (isDup) {
      console.log(`[MTProto DEDUPLICATE] Removing duplicate note "${data.title}" (ID: ${doc.id}) - Reason: ${reason}`);
      await db.collection("deleted_records").doc(`notes_${doc.id}`).set({
        ...data,
        originalId: doc.id,
        collectionName: "notes",
        typeLabel: "Note (Duplicate Auto-Clean)",
        dedupReason: reason,
        archivedAt: new Date().toISOString(),
        archivedBy: "Auto Deduplication Engine",
      }).catch(() => {});
      await db.collection("notes").doc(doc.id).delete();
      purgeNoteFromWebAndCdn(doc.id);
      duplicateCleanedCount++;
    } else {
      if (docIdStr) seenDocIds.set(docIdStr, doc.id);
      if (data.fileHash) seenHashes.set(data.fileHash, doc.id);
      if (data.telegramMessageId && Number(data.telegramMessageId) > 0) seenTgMsgIds.set(Number(data.telegramMessageId), doc.id);
      if (normTitle) seenNormTitles.set(normTitle, { id: doc.id, ...data });
    }
  }

  if (duplicateCleanedCount > 0) {
    clearCache();
  }

  return { success: true, cleanedCount: duplicateCleanedCount };
}

/**
 * Reconciles and synchronizes notes between Telegram channel and website
 * Fully compatible with Telegram Bot accounts using channels.GetMessages (IDs array)
 */
async function syncTelegramChannel() {
  const c = await getClient();
  if (!c) throw new Error("Cloud Storage Telegram client could not connect. Check TELEGRAM_BOT_TOKEN and TELEGRAM_API_ID/HASH in .env");
  const targetStorageChatId = (process.env.TELEGRAM_STORAGE_CHAT_ID || storageChatId || "").trim();
  if (!targetStorageChatId) throw new Error("TELEGRAM_STORAGE_CHAT_ID is not configured in .env");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore DB not connected");

  console.log(`[MTProto RECONCILE] Initiating Bot-compatible channel synchronization...`);

  // 1. Run Automated Database Deduplication Sweep
  const { cleanedCount: duplicateCleanedCount } = await deduplicateDatabaseNotes();

  // 2. Map existing valid notes for reconciliation using Turso cache (0 Firestore reads!)
  let notesList = [];
  try {
    const { getAllCachedNotes } = require("../services/tursoNotesCacheService");
    notesList = await getAllCachedNotes();
  } catch (_) {}

  if (!notesList || notesList.length === 0) {
    try {
      const snap = await db.collection("notes").get();
      notesList = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    } catch (e) {
      console.warn("[MTProto RECONCILE] Firestore read notice (falling back):", e.message);
      notesList = [];
    }
  }

  const existingNotesWithTg = [];
  const knownMsgIds = new Set();

  for (const data of notesList) {
    if (data.telegramMessageId && Number(data.telegramMessageId) > 0) {
      const msgId = Number(data.telegramMessageId);
      existingNotesWithTg.push({ docId: data.id || data.docId, msgId, title: data.title });
      knownMsgIds.add(msgId);
    }
  }

  let purgedCount = 0;
  let importedCount = 0;
  let verifiedCount = 0;

  // 3. Verify existing notes: if any were deleted on Telegram, purge them from Firestore
  if (existingNotesWithTg.length > 0) {
    const idsToCheck = existingNotesWithTg.map((n) => n.msgId);
    for (let i = 0; i < idsToCheck.length; i += 100) {
      const batchIds = idsToCheck.slice(i, i + 100);
      const batchNotes = existingNotesWithTg.slice(i, i + 100);
      const verifiedMsgs = await c.getMessages(targetStorageChatId, { ids: batchIds });

      for (let j = 0; j < batchNotes.length; j++) {
        const vMsg = verifiedMsgs[j];
        if (!vMsg || !vMsg.media || !vMsg.media.document) {
          console.log(`[MTProto RECONCILE] Purging orphaned note "${batchNotes[j].title}" (Msg ID ${batchNotes[j].msgId})`);
          try {
            const curDoc = await db.collection("notes").doc(batchNotes[j].docId).get();
            const noteData = curDoc.exists ? curDoc.data() : { title: batchNotes[j].title, telegramMessageId: batchNotes[j].msgId };
            archiveNoteToTursoRecycleBin(batchNotes[j].docId, noteData, "Telegram Storage Channel Reconcile Purge");
            await db.collection("deleted_records").doc(`notes_${batchNotes[j].docId}`).set({
              ...noteData,
              originalId: batchNotes[j].docId,
              collectionName: "notes",
              typeLabel: "Note",
              title: noteData.title || batchNotes[j].title || "Study Material",
              archivedAt: new Date().toISOString(),
              archivedBy: "Telegram Two-Way Sync Deletion",
              reason: "Document deleted from Telegram academic storage channel",
            }).catch(() => {});
            await db.collection("deleted_notes").doc(batchNotes[j].docId).set({
              ...noteData,
              archivedAt: new Date().toISOString(),
              archivedBy: "Telegram Two-Way Sync Deletion",
              reason: "Document deleted from Telegram academic storage channel",
            }).catch(() => {});
          } catch (_) {}
          await db.collection("notes").doc(batchNotes[j].docId).delete();
          purgeNoteFromWebAndCdn(batchNotes[j].docId);
          purgedCount++;
        } else {
          verifiedCount++;
        }
      }
    }
  }

  // 3. Probe channel IDs for new / un-indexed documents
  const maxKnown = knownMsgIds.size > 0 ? Math.max(...Array.from(knownMsgIds)) : 40;
  const probeMax = Math.max(maxKnown + 50, 100);
  const probeIds = [];
  for (let id = 1; id <= probeMax; id++) {
    probeIds.push(id);
  }

  console.log(`[MTProto RECONCILE] Probing channel IDs 1 to ${probeMax} for un-indexed study material...`);

  for (let i = 0; i < probeIds.length; i += 100) {
    const chunk = probeIds.slice(i, i + 100);
    const msgs = await c.getMessages(targetStorageChatId, { ids: chunk });

    for (const msg of msgs) {
      if (msg && msg.media && msg.media.document) {
        const msgId = Number(msg.id);
        if (knownMsgIds.has(msgId)) continue; // Already processed

        const doc = msg.media.document;
        const docIdStr = doc.id?.toString();
        const docAttr = doc.attributes?.find((a) => a instanceof Api.DocumentAttributeFilename);
        const originalName = docAttr?.fileName || `Material_${msg.id}.pdf`;
        const caption = msg.message || "";
        const docSize = Number(doc.size || 0);

        // Comprehensive duplicate prevention check (title extracted via utility with topic intelligence)
        const recTopicId = msg.replyTo?.replyToTopId || msg.replyTo?.replyToMsgId || null;
        let recThreadTitle = "";
        if (recTopicId) {
          try {
            const { getSubjectFromThreadId } = require("../services/emailService");
            const matched = await getSubjectFromThreadId(recTopicId);
            if (matched) recThreadTitle = matched;
          } catch (_) {}
        }
        const metaRec = extractAcademicMetadata({ fileName: originalName, caption, threadTitle: recThreadTitle });
        const { title, subject, branch, course, year } = metaRec;
        const fileHash = crypto.createHash("sha256").update(`${originalName}_${docSize}`).digest("hex");

        const dup = await isDuplicateNote(db, {
          docIdStr,
          msgId,
          originalName,
          title,
          fileSize: docSize,
          fileHash,
          topicThreadId: recTopicId,
          subject,
        });

        if (dup) {
          knownMsgIds.add(msgId);
          if (docIdStr) processingDocIds.add(docIdStr);
          if (!dup.isSelfMessage) {
            console.log(`[MTProto RECONCILE] 🛡️ Duplicate suppressed: "${title}" (Msg ID: ${msgId}, Doc ID: ${docIdStr})`);
          }
          continue;
        }

        const noteRef = db.collection("notes").doc();
        const now = new Date();
        const nowIso = now.toISOString();
        const nowMs = now.getTime();

        const newSyncedNote = {
          id: noteRef.id,
          title,
          subject,
          branch,
          course,
          year,
          semester: year,
          description: caption || "Imported and synchronized from Cloud Storage Vault.",
          fileName: originalName,
          originalName,
          fileHash,
          mimeType: doc.mimeType || "application/pdf",
          fileSize: docSize,
          compressedSize: docSize,
          savingsPercent: 0,
          telegramMessageId: msgId,
          telegramOriginChatId: targetStorageChatId,
          telegramOriginMessageId: msgId,
          telegramThreadId: recTopicId,
          telegramTopicId: recTopicId,
          telegramDocumentId: doc.id?.toString() || null,
          status: "ready",
          uploadedBy: "cloud-sync-engine",
          uploaderName: "Cloud Synced Note",
          viewsCount: 0,
          downloadsCount: 0,
          isVisible: true,
          downloadUrl: `/api/notes/${noteRef.id}/stream`,
          createdAt: nowIso,
          updatedAt: nowIso,
          _sortTimestamp: nowMs,
        };

        await noteRef.set(newSyncedNote);

        try {
          const { upsertNoteInCache } = require("../services/tursoNotesCacheService");
          const { upsertNoteToTurso } = require("../services/tursoService");
          if (typeof upsertNoteInCache === "function") {
            upsertNoteInCache(newSyncedNote).catch(() => {});
          }
          if (typeof upsertNoteToTurso === "function") {
            upsertNoteToTurso(newSyncedNote).catch(() => {});
          }
        } catch (_) {}

        knownMsgIds.add(msgId);
        if (docIdStr) processingDocIds.add(docIdStr);
        importedCount++;
        console.log(`[MTProto RECONCILE] Imported new material "${title}" (Msg ID: ${msgId})`);

        // Dispatch receipt directly into the channel replying to the uploaded message
        try {
          if (syncLock.canSendReceipt(storageChatId, msgId)) {
            const formatMb = (docSize / (1024 * 1024)).toFixed(2);
            const siteUrl = getSiteUrl();
            const receiptText = `⚡ <b>${getVaultName()} Receipt</b>\n\n` +
              `✅ <b>Note Successfully Indexed to Website!</b>\n` +
              `📄 <b>Title:</b> ${title}\n` +
              `📚 <b>Subject:</b> ${subject}\n` +
              `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
              `💾 <b>Size:</b> ${formatMb} MB\n` +
              `🔗 <b>Direct Link:</b> ${getNotePublicUrl(noteRef.id)}\n` +
              `🌐 <b>Website:</b> ${siteUrl}\n\n` +
              `<i>Note is now live at #1 position and accessible to all registered students.</i>`;

            const activeBotToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
            if (activeBotToken && storageChatId) {
              fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: storageChatId,
                  text: receiptText,
                  reply_to_message_id: msgId,
                  parse_mode: "HTML",
                }),
              }).then(async (r) => {
                const resJson = await r.json();
                if (!resJson.ok) {
                  // Fallback without reply_to_message_id
                  fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chat_id: storageChatId,
                      text: receiptText,
                      parse_mode: "HTML",
                    }),
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        } catch (rcptErr) {
          console.warn("[MTProto RECONCILE] Channel receipt warning:", rcptErr.message);
        }
      }
    }
  }

  // 4. Verify topic-based notes: if their topic was removed in Telegram, purge them
  const topicNotes = (notesList || []).filter((n) => n && (n.telegramTopicId || n.telegramThreadId));
  for (const data of topicNotes) {
    const noteId = data.id || data.docId;
    if (!noteId) continue;
    const topicId = Number(data.telegramTopicId || data.telegramThreadId);
    const topicChat = data.telegramOriginChatId || targetStorageChatId;
    if (!topicId || !topicChat) continue;
    try {
      const topicMsgs = await c.getMessages(topicChat, { ids: [topicId] });
      if (!topicMsgs || !topicMsgs[0] || topicMsgs[0].className === "MessageEmpty") {
        console.log(`[MTProto RECONCILE] Purging note "${data.title}" because its Topic ${topicId} was removed.`);
        archiveNoteToTursoRecycleBin(noteId, data, `Topic ${topicId} removed in Telegram`);
        await db.collection("deleted_records").doc(`notes_${noteId}`).set({
          ...data,
          originalId: noteId,
          collectionName: "notes",
          typeLabel: "Note",
          title: data.title || "Study Material",
          archivedAt: new Date().toISOString(),
          archivedBy: "Telegram Topic Reconcile Purge",
        }).catch(() => {});
        await db.collection("deleted_notes").doc(noteId).set({
          ...data,
          archivedAt: new Date().toISOString(),
          archivedBy: "Telegram Topic Reconcile Purge",
        }).catch(() => {});
        await db.collection("notes").doc(noteId).delete().catch(() => {});
        purgeNoteFromWebAndCdn(noteId);
        purgedCount++;
      }
    } catch {}
  }

  clearCache();

  recordSyncEvent({
    trigger: "Two-Way Channel Reconcile",
    details: `Verified ${verifiedCount}, Imported ${importedCount}, Purged ${purgedCount}`,
    verifiedCount,
    importedCount,
    purgedCount,
  });

  try {
    const { broadcastCatalogEvent } = require("../services/realtimeEventService");
    broadcastCatalogEvent({
      event: "catalog_synced",
      verifiedCount,
      importedCount,
      purgedCount,
      lastSync: getLastSyncState(),
    });
  } catch (_) {}

  return {
    success: true,
    scannedRange: `IDs 1 to ${probeMax}`,
    verifiedCount,
    importedCount,
    duplicateCleanedCount,
    purgedCount,
    lastSync: getLastSyncState(),
    message: `Telegram Two-Way Sync complete! Verified ${verifiedCount} documents, imported ${importedCount} new notes, cleaned ${duplicateCleanedCount} duplicate records, and purged ${purgedCount} deleted items.`,
  };
}

/**
 * Uploads a file to the Telegram Storage Channel using MTProto parallel workers (up to 2GB)
 */
async function uploadToStorageChannel(filePath, caption = "", fileName = null, onProgress = null) {
  const c = await getClient();
  if (!c) throw new Error("MTProto client not initialized");

  const actualFileName = fileName || path.basename(filePath);
  const targetChannel = storageChatId;
  const stats = fs.statSync(filePath);

  console.log(`[MTProto] Streaming upload: ${actualFileName} to channel ${targetChannel} (${stats.size} bytes)`);

  const customFile = new CustomFile(actualFileName, stats.size, filePath);

  const startTime = Date.now();
  let prevLoaded = 0;
  let prevTime = startTime;

  const handleProgress = (progress) => {
    if (typeof onProgress !== "function") return;
    const progressVal = typeof progress === "number" ? progress : (progress?.progress || 0);
    const pct = Math.min(100, Math.round(progressVal * 100));
    const loaded = Math.round(progressVal * stats.size);
    const now = Date.now();
    const diffSec = (now - prevTime) / 1000;
    let speedBytes = diffSec > 0.08 ? (loaded - prevLoaded) / diffSec : 0;
    if (speedBytes <= 0) {
      const totalElapsed = (now - startTime) / 1000;
      speedBytes = totalElapsed > 0 ? loaded / totalElapsed : 0;
    }
    prevLoaded = loaded;
    prevTime = now;
    const speedFormatted = speedBytes >= 1024 * 1024
      ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
      : `${(speedBytes / 1024).toFixed(0)} KB/s`;

    onProgress({
      percent: pct,
      loadedBytes: loaded,
      totalBytes: stats.size,
      loadedMB: (loaded / (1024 * 1024)).toFixed(2),
      totalMB: (stats.size / (1024 * 1024)).toFixed(2),
      speed: speedFormatted,
    });
  };

  const isDirectLarge = stats.size >= 100 * 1024 * 1024;

  // GramJS uploadFile with streaming CustomFile from disk.
  // maxBufferSize set to 4MB forces GramJS to stream via filePath instead of buffering 100MB+ in V8 heap!
  const fileResult = await c.uploadFile({
    file: customFile,
    workers: isDirectLarge ? 4 : 8,
    maxBufferSize: 4 * 1024 * 1024,
    fileSize: stats.size,
    progressCallback: handleProgress,
    onProgress: handleProgress,
  });

  const message = await c.sendFile(targetChannel, {
    file: fileResult,
    caption: caption || `Note Vault: ${actualFileName}`,
    forceDocument: true,
    attributes: [
      new Api.DocumentAttributeFilename({
        fileName: actualFileName,
      }),
    ],
    workers: 16,
  });

  if (message.id) processingMsgIds.add(Number(message.id));
  if (message.media?.document?.id) processingDocIds.add(message.media.document.id.toString());

  return {
    messageId: message.id,
    channelId: targetChannel,
    documentId: message.media?.document?.id?.toString() || null,
    accessHash: message.media?.document?.accessHash?.toString() || null,
    fileReference: message.media?.document?.fileReference || null,
    size: message.media?.document?.size ? Number(message.media.document.size) : fs.statSync(filePath).size,
  };
}

/**
 * Streams a document from Telegram storage channel directly in 512KB chunks
 * Optional cacheOptions: { noteId, cdnCacheDir, onCached } simultaneously writes full stream to Server SSD disk cache!
 */
async function streamDocumentFromChannel(messageId, res, rangeHeader = null, cacheOptions = null) {
  let c = await getClient();
  if (!c) {
    console.log("[MTProto STREAM] MTProto socket initializing, awaiting connection...");
    await new Promise((r) => setTimeout(r, 2500));
    c = await getClient();
  }
  if (!c) throw new Error("MTProto client not initialized. Telegram DC is reconnecting, please retry in a moment.");

  const targetChannel = (process.env.TELEGRAM_STORAGE_CHAT_ID || storageChatId || "").trim();
  const messages = await c.getMessages(targetChannel, { ids: [Number(messageId)] });
  if (!messages || !messages[0] || !messages[0].media || !messages[0].media.document) {
    const err = new Error(`Document not found for message ID ${messageId}`);
    err.isDeleted = true;
    err.code = "TELEGRAM_MESSAGE_DELETED";
    throw err;
  }

  const doc = messages[0].media.document;
  const totalSize = Number(doc.size);

  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    if (isNaN(start)) start = 0;
    if (isNaN(end) || end >= totalSize) end = totalSize - 1;
    isRange = true;
  }

  const contentLength = end - start + 1;

  // Cloudflare CDN & Fast Download Acceleration Headers
  const docMime = (doc.mimeType || "").toLowerCase();
  const isPdf = !docMime || docMime === "application/octet-stream" || docMime.includes("pdf");
  const finalMime = isPdf ? "application/pdf" : (doc.mimeType || "application/pdf");
  res.setHeader("Content-Type", finalMime);
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("CDN-Cache-Control", "public, max-age=31536000");

  if (isRange) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", contentLength);
  } else {
    res.status(200);
    res.setHeader("Content-Length", totalSize);
  }

  // 💽 Simultaneous Zero-RAM Pass-Through Disk Tee (for full non-range streams <= 100MB so 50-65MB exam notes cache on SSD!)
  let diskStream = null;
  let tmpPath = null;
  let binPath = null;
  let metaPath = null;
  if (
    !isRange &&
    cacheOptions &&
    cacheOptions.noteId &&
    cacheOptions.cdnCacheDir &&
    totalSize > 0 &&
    totalSize <= 100 * 1024 * 1024
  ) {
    try {
      const safeId = path.basename(String(cacheOptions.noteId)).replace(/[^a-zA-Z0-9_-]/g, "");
      if (safeId && safeId.length <= 128) {
        binPath = path.join(cacheOptions.cdnCacheDir, `${safeId}.bin`);
        metaPath = path.join(cacheOptions.cdnCacheDir, `${safeId}.meta.json`);
        let existingValid = false;
        if (fs.existsSync(binPath)) {
          try {
            const st = fs.statSync(binPath);
            if (st.size > 200 && (!totalSize || st.size >= totalSize)) {
              existingValid = true;
            } else {
              fs.unlinkSync(binPath);
            }
          } catch (_) {}
        }
        if (!existingValid) {
          if (!fs.existsSync(cacheOptions.cdnCacheDir)) {
            fs.mkdirSync(cacheOptions.cdnCacheDir, { recursive: true });
          }
          tmpPath = path.join(
            cacheOptions.cdnCacheDir,
            `${safeId}.bin.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          );
          diskStream = fs.createWriteStream(tmpPath);
          diskStream.on("error", () => {
            diskStream = null;
          });
        }
      }
    } catch (_) {
      diskStream = null;
    }
  }

  // Stream using 4KB-aligned block boundary for instant sub-second response
  const alignedStart = Math.floor(start / 4096) * 4096;
  let skipInitial = start - alignedStart;

  // Adaptive chunk size: For small range requests (like PDF header/xref), use 128KB for instant sub-300ms response!
  // For larger range or full file, use 512KB for maximum throughput.
  const idealChunk = Math.min(512 * 1024, Math.max(128 * 1024, Math.ceil((contentLength + skipInitial) / 4096) * 4096));
  const chunkSize = idealChunk;
  const location = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: "",
  });

  let bytesWritten = 0;
  try {
    for await (const rawChunk of c.iterDownload({
      file: location,
      offset: bigInt(alignedStart),
      chunkSize: chunkSize,
      requestSize: chunkSize,
      workers: 4,
    })) {
      if (res.writableEnded || res.destroyed) break;

      let chunk = rawChunk;
      if (skipInitial > 0) {
        if (chunk.length <= skipInitial) {
          skipInitial -= chunk.length;
          continue;
        }
        chunk = chunk.slice(skipInitial);
        skipInitial = 0;
      }

      const remaining = contentLength - bytesWritten;
      if (remaining <= 0) break;

      const sliceToWrite = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
      const canContinue = res.write(sliceToWrite);
      if (diskStream) {
        try {
          diskStream.write(sliceToWrite);
        } catch (_) {}
      }
      if (!canContinue && !res.writableEnded && !res.destroyed) {
        await new Promise((resolve) => {
          const onDone = () => {
            res.off("drain", onDone);
            res.off("close", onDone);
            res.off("error", onDone);
            resolve();
          };
          res.once("drain", onDone);
          res.once("close", onDone);
          res.once("error", onDone);
        });
      }
      bytesWritten += sliceToWrite.length;

      if (bytesWritten >= contentLength) break;
    }
  } finally {
    if (diskStream) {
      try {
        await new Promise((resolve) => diskStream.end(resolve));
        if (!isRange && bytesWritten > 200 && (!totalSize || bytesWritten >= totalSize) && tmpPath && binPath && metaPath && fs.existsSync(tmpPath)) {
          const finalBytes = bytesWritten || totalSize;
          await fs.promises.rename(tmpPath, binPath);
          await fs.promises.writeFile(
            metaPath,
            JSON.stringify({
              mimeType: finalMime,
              totalSize: finalBytes,
              cachedAt: Date.now(),
            }),
            "utf8"
          );
          if (typeof cacheOptions?.onCached === "function") {
            cacheOptions.onCached(finalBytes);
          }
          console.log(`[MTProto STREAM] 💽 Auto-saved streamed note ${cacheOptions.noteId} (${(finalBytes / 1048576).toFixed(2)} MB) to Server SSD Disk Cache (Tier 3 ready)!`);
        } else if (tmpPath && fs.existsSync(tmpPath)) {
          await fs.promises.unlink(tmpPath).catch(() => {});
        }
      } catch (cacheErr) {
        console.warn(`[MTProto STREAM] SSD disk promote notice for ${cacheOptions?.noteId}:`, cacheErr.message);
        if (tmpPath && fs.existsSync(tmpPath)) {
          fs.promises.unlink(tmpPath).catch(() => {});
        }
      }
    }
  }

  if (!res.writableEnded) {
    res.end();
  }
}

/**
 * Downloads and returns the entire document buffer from Telegram storage channel.
 * Used for instant, permanent ingestion into Edge CDN, RAM buffer, and local SSD disk.
 */
async function getDocumentBufferFromChannel(messageId) {
  let c = await getClient();
  if (!c) {
    console.log("[MTProto BUFFER] MTProto socket initializing, awaiting connection...");
    await new Promise((r) => setTimeout(r, 2000));
    c = await getClient();
  }
  if (!c) throw new Error("MTProto client not initialized. Telegram DC is reconnecting, please retry in a moment.");

  const targetChannel = (process.env.TELEGRAM_STORAGE_CHAT_ID || storageChatId || "").trim();
  const messages = await c.getMessages(targetChannel, { ids: [Number(messageId)] });
  if (!messages || !messages[0] || !messages[0].media || !messages[0].media.document) {
    const err = new Error(`Document not found for message ID ${messageId}`);
    err.isDeleted = true;
    err.code = "TELEGRAM_MESSAGE_DELETED";
    throw err;
  }

  const doc = messages[0].media.document;
  const totalSize = Number(doc.size);
  const docMime = (doc.mimeType || "").toLowerCase();
  const isPdf = !docMime || docMime === "application/octet-stream" || docMime.includes("pdf");
  const finalMime = isPdf ? "application/pdf" : (doc.mimeType || "application/pdf");

  // 🛡️ OOM Guard: Never assemble multi-megabyte buffers (>45MB) in RAM to prevent container SIGKILL!
  const MAX_SAFE_BUFFER_SIZE = 45 * 1024 * 1024;
  if (totalSize > MAX_SAFE_BUFFER_SIZE) {
    const err = new Error(`Document size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds 45MB safe memory buffer ceiling. Direct chunked streaming must be used.`);
    err.code = "FILE_TOO_LARGE_FOR_RAM_BUFFER";
    err.fileSize = totalSize;
    throw err;
  }

  // Strategy 1: GramJS downloadMedia (Fast parallel worker pipeline with 12s timeout)
  const downloadPromise = (async () => {
    try {
      const dlPromise = c.downloadMedia(messages[0], { workers: 4 });
      const dlTimeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error("GramJS downloadMedia worker stalled")), 10000)
      );
      const downloadedBuf = await Promise.race([dlPromise, dlTimeout]);
      if (downloadedBuf && Buffer.isBuffer(downloadedBuf) && downloadedBuf.length > 0) {
        return {
          buffer: downloadedBuf,
          totalSize: downloadedBuf.length,
          mimeType: finalMime,
        };
      }
    } catch (dlErr) {
      console.warn("[MTProto BUFFER] downloadMedia fallback to iterDownload:", dlErr.message);
    }

    // Strategy 2: Parallel 512KB chunk iteration via iterDownload
    const chunkSize = 512 * 1024;
    const location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });

    const chunks = [];
    for await (const chunk of c.iterDownload({
      file: location,
      offset: bigInt(0),
      chunkSize: chunkSize,
      requestSize: chunkSize,
      workers: 4,
    })) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    return {
      buffer,
      totalSize: buffer.length || totalSize,
      mimeType: finalMime,
    };
  })();

  const totalSizeMb = Math.ceil((totalSize || 1048576) / (1024 * 1024));
  const dynamicTimeoutMs = Math.max(60000, totalSizeMb * 3000); // Minimum 60s, +3s per MB (e.g. 45MB gets 135s)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`MTProto document buffer download timed out after ${Math.round(dynamicTimeoutMs / 1000)}s`)), dynamicTimeoutMs)
  );

  return await Promise.race([downloadPromise, timeoutPromise]);
}

/**
 * Deletes one or more messages from Telegram (Storage Channel or other chat)
 * Enables Two-Way Deletion Sync: Web deletion -> Telegram deletion
 */
async function deleteTelegramMessages(messageIds, channelId = null) {
  try {
    const c = await getClient();
    if (!c) {
      console.warn("[MTProto SYNC] MTProto client unavailable for message deletion.");
      return false;
    }
    const target = channelId || storageChatId;
    if (!target) return false;

    const ids = (Array.isArray(messageIds) ? messageIds : [messageIds])
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);

    if (ids.length === 0) return false;

    // Track deleted IDs in memory to avoid redundant deletion cycles
    ids.forEach((id) => processingMsgIds.add(id));

    await c.deleteMessages(target, ids, { revoke: true });
    console.log(`[MTProto SYNC] 🗑️ Deleted Telegram messages [${ids.join(", ")}] in chat ${target}`);
    return true;
  } catch (err) {
    console.warn(`[MTProto SYNC] Warning deleting Telegram message(s):`, err.message);
    return false;
  }
}

let autoSyncTimer = null;
let isAutoSyncing = false;
let fastLivenessTimer = null;
let isCheckingFastLiveness = false;
let lastLivenessRunAt = 0;

/**
 * Event-Driven Telegram Liveness Verifier
 * Invoked ONLY on actual Telegram deletion events (when ID didn't directly match) or manual admin reconcile.
 * Debounced (25s cooldown) and capped at latest 10 notes from L1 RAM for ultra-low CPU & RAM load!
 */
async function checkNotesLivenessNow(customNotes = null) {
  const now = Date.now();
  if (isCheckingFastLiveness || !client || !client.connected) return;
  if (!customNotes && now - lastLivenessRunAt < 25000) return;
  isCheckingFastLiveness = true;
  lastLivenessRunAt = now;
  try {
    const { getAllCachedNotes } = require("../services/tursoNotesCacheService");
    const allNotes = customNotes || (await getAllCachedNotes());
    if (!allNotes || allNotes.length === 0) return;

    const db = getFirestoreDb();
    if (!db) return;

    // Check only the latest 10 notes (ultra-fast 0-cost RAM inspection, minimal CPU)
    const recentNotes = allNotes.slice(0, 10);

    for (const note of recentNotes) {
      let isDead = false;

      // 1. Check original message in Group / Topic
      if (note.telegramOriginChatId && note.telegramOriginMessageId) {
        try {
          const originMsgs = await client.getMessages(note.telegramOriginChatId, {
            ids: [Number(note.telegramOriginMessageId)],
          });
          if (
            !originMsgs ||
            !originMsgs[0] ||
            originMsgs[0].className === "MessageEmpty" ||
            !originMsgs[0].media
          ) {
            isDead = true;
          }
        } catch (originErr) {
          if (originErr.message && (originErr.message.includes("MESSAGE_ID_INVALID") || originErr.message.includes("TOPIC_DELETED"))) {
            isDead = true;
          }
        }
      }

      // 2. Check storage channel message
      if (!isDead && note.telegramMessageId && storageChatId) {
        try {
          const storageMsgs = await client.getMessages(storageChatId, {
            ids: [Number(note.telegramMessageId)],
          });
          if (
            !storageMsgs ||
            !storageMsgs[0] ||
            storageMsgs[0].className === "MessageEmpty" ||
            !storageMsgs[0].media
          ) {
            isDead = true;
          }
        } catch (_) {}
      }

      // 3. Check if the parent Forum Topic itself was deleted in Telegram
      const targetTopicChat = note.telegramOriginChatId || storageChatId;
      if (!isDead && (note.telegramThreadId || note.telegramTopicId) && targetTopicChat) {
        const tId = Number(note.telegramThreadId || note.telegramTopicId);
        if (tId && tId > 0) {
          try {
            const topicCheck = await client.getMessages(targetTopicChat, { ids: [tId] });
            if (!topicCheck || !topicCheck[0] || topicCheck[0].className === "MessageEmpty") {
              isDead = true;
            }
          } catch (_) {}
        }
      }

      if (isDead) {
        console.log(`[EVENT-LIVENESS] 🗑️ Telegram message deleted for "${note.title}" (ID: ${note.id}). Instantly purging from site...`);
        archiveNoteToTursoRecycleBin(note.id, note, "Telegram message deleted event");
        await db.collection("deleted_records").doc(`notes_${note.id}`).set({
          ...note,
          originalId: note.id,
          collectionName: "notes",
          typeLabel: "Note",
          archivedAt: new Date().toISOString(),
          archivedBy: "Telegram Event Liveness Purge",
        }).catch(() => {});
        await db.collection("deleted_notes").doc(note.id).set({
          ...note,
          archivedAt: new Date().toISOString(),
          archivedBy: "Telegram Event Liveness Purge",
        }).catch(() => {});
        await db.collection("notes").doc(note.id).delete().catch(() => {});
        if (note.telegramMessageId && storageChatId) {
          deleteTelegramMessages([note.telegramMessageId], storageChatId).catch(() => {});
        }
        purgeNoteFromWebAndCdn(note.id);
        recordSyncEvent({
          trigger: `Telegram Deletion Detected: "${note.title}"`,
          details: `Auto-purged from site instantly`,
          purgedCount: 1,
        });
        try {
          const { broadcastCatalogEvent } = require("../services/realtimeEventService");
          broadcastCatalogEvent({ event: "note_deleted", noteId: note.id, title: note.title });
        } catch (_) {}
      }
    }
  } catch (_) {
    // Quiet background guard
  } finally {
    isCheckingFastLiveness = false;
  }
}

/**
 * 100% Pure Event-Driven Two-Way Sync Engine (Zero Periodic Polling / Zero Quota Waste)
 * 1. Executes a single initial reconciliation at boot to catch any offline changes.
 * 2. All subsequent updates (uploads, topic creations, message/topic deletions) happen
 *    strictly in real-time when a Telegram event occurs (or on manual /sync).
 */
function startAutoSyncWorker() {
  if (autoSyncTimer) return;
  console.log("[MTProto AUTOSYNC] ⚡ Pure Event-Driven Two-Way Sync active (0 background polling timers; updates trigger strictly on real Telegram events).");

  const runInitialBootSync = async () => {
    if (isAutoSyncing) return;
    isAutoSyncing = true;
    try {
      console.log("[MTProto AUTOSYNC] 🔄 Executing one-time startup reconciliation...");
      await syncTelegramChannel();
      recordSyncEvent({
        trigger: "Startup One-Time Auto-Sync",
        details: "Initial Boot Sync Complete — Switched to 100% Event-Driven Mode",
      });
    } catch (e) {
      console.warn("[MTProto AUTOSYNC] Initial boot sync notice:", e.message);
    } finally {
      isAutoSyncing = false;
    }
  };

  // Run once after 4 seconds of startup to catch any offline changes; no recurring setInterval!
  autoSyncTimer = setTimeout(runInitialBootSync, 4000);
}

function stopAutoSyncWorker() {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
  if (fastLivenessTimer) {
    clearInterval(fastLivenessTimer);
    fastLivenessTimer = null;
  }
  console.log("[MTProto AUTOSYNC] Auto-Sync worker stopped.");
}

function getMTProtoDetails() {
  const dcId = client?.session?.dcId || 5;
  const serverAddress = client?.session?.serverAddress || (dcId === 5 ? "91.108.56.104" : dcId === 4 ? "149.154.167.91" : dcId === 2 ? "149.154.167.50" : "91.108.56.104");
  const port = client?.session?.port || 443;
  const dcLocationMap = {
    1: "DC 1 (Miami, Florida, USA - Americas Hub)",
    2: "DC 2 (Amsterdam, Netherlands - EU Hub)",
    3: "DC 3 (Miami, Florida, USA - Americas Secondary)",
    4: "DC 4 (Amsterdam, Netherlands - EU Secondary)",
    5: "DC 5 (Singapore, Asia-Pacific - Central Asia & India Hub)",
  };
  return {
    connected: isConnected || (client && client.connected),
    dcId,
    dcIp: `${serverAddress}:${port}`,
    dcLocation: dcLocationMap[dcId] || `DC ${dcId} (Singapore, Asia-Pacific Hub)`,
    protocol: "MTProto 2.0 (GramJS / TCPFull)",
    transport: "High-Speed TCP Socket (16 Parallel Threads)",
    workers: 16,
    deviceModel: "AcademicCloud-v3",
    appVersion: "3.0.0",
    storageChatConfigured: !!storageChatId,
    storageChatId: storageChatId || "",
    autoSyncActive: true,
    autoSyncInterval: "30m Periodic Safety Net",
    autoSyncMode: "30-Minute Quota-Saver & Real-time Event-Driven",
    lastSync: getLastSyncState(),
  };
}

module.exports = {
  getClient,
  uploadToStorageChannel,
  streamDocumentFromChannel,
  getDocumentBufferFromChannel,
  syncTelegramChannel,
  deduplicateDatabaseNotes,
  deleteTelegramMessages,
  startAutoSyncWorker,
  stopAutoSyncWorker,
  checkNotesLivenessNow,
  getMTProtoDetails,
  getLastSyncState,
  recordSyncEvent,
};

