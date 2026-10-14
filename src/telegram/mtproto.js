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

function clearCache() {
  try {
    const { invalidateAllCache } = require("../utils/ramCache");
    invalidateAllCache();
  } catch {}
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
 * 1. Auto-Ingest: When a document/note is posted directly to Telegram, it appears on the web instantly.
 * 2. Auto-Delete: When a note message is deleted in Telegram, it is removed from the database & CDN.
 */
/**
 * Verifies if a Telegram user is an authorized Administrator (Channel Creator/Admin or Env Admin)
 */
async function isUserAdmin(userId, c) {
  if (!userId) return false;
  const uidStr = userId.toString();
  const envAdmins = (process.env.TELEGRAM_ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

  // If TELEGRAM_ADMIN_IDS is not configured in .env, permit DM uploaders by default so bot is fully functional
  if (envAdmins.length === 0) {
    console.log(`[MTProto SYNC] TELEGRAM_ADMIN_IDS empty; permitting user ID ${uidStr} as administrator`);
    return true;
  }

  if (envAdmins.includes(uidStr)) return true;

  try {
    const channel = await c.getEntity(storageChatId);
    const participant = await c.invoke(new Api.channels.GetParticipant({
      channel,
      participant: userId,
    }));
    if (
      participant?.participant instanceof Api.ChannelParticipantCreator ||
      participant?.participant instanceof Api.ChannelParticipantAdmin
    ) {
      return true;
    }
  } catch {}
  return false;
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

/**
 * Checks if a note already exists in the Firestore database to prevent any duplicates
 * Single-field queries with in-memory matching (Zero composite index requirement)
 */
async function isDuplicateNote(db, { docIdStr, msgId, originalName, title, fileSize, fileHash }) {
  if (!db) return null;

  try {
    // 1. Check by telegramDocumentId (GramJS DC unique document ID)
    if (docIdStr) {
      const snap = await db.collection("notes").where("telegramDocumentId", "==", docIdStr.toString()).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }

    // 2. Check by telegramMessageId
    if (msgId && Number(msgId) > 0) {
      const snap = await db.collection("notes").where("telegramMessageId", "==", Number(msgId)).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }

    // 3. Check by fileHash if provided
    if (fileHash) {
      const snap = await db.collection("notes").where("fileHash", "==", fileHash).limit(1).get();
      if (!snap.empty) return snap.docs[0];
    }

    // 4. Single-field query by exact fileSize with in-memory name / title check (Zero composite index required)
    if (fileSize && Number(fileSize) > 0) {
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
            return doc;
          }
        }
      }
    }

    // 5. Single-field query by exact originalName with in-memory size verification
    if (originalName) {
      const snap = await db.collection("notes").where("originalName", "==", originalName).limit(5).get();
      if (!snap.empty) {
        for (const doc of snap.docs) {
          const d = doc.data();
          if (!fileSize || !d.fileSize || Math.abs(Number(d.fileSize) - Number(fileSize)) < 1024) {
            return doc;
          }
        }
      }
    }

    // 6. Single-field query by exact title with in-memory size verification
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
      if (!message || !message.media || !message.media.document) return;

      const doc = message.media.document;
      const docIdStr = doc.id?.toString();
      const msgId = Number(message.id);

      const targetStr = storageChatId ? storageChatId.toString().replace("-100", "") : "";
      const chatStr = (message.chatId || message.peerId?.channelId || message.peerId?.chatId || "").toString().replace("-100", "");

      // 🛡️ DUAL-LISTENER SUPPRESSION:
      // If message did NOT originate directly in the storage channel, botPoller.js is the sole ingest handler.
      if (!targetStr || !chatStr || targetStr !== chatStr) {
        return;
      }

      // =========================================================================
      // STORAGE CHANNEL INGEST:
      // If forwarded from botPoller or locked in syncLock, SKIP!
      // =========================================================================
      if (message.fwdFrom) return;
      if (msgId && !syncLock.canProcess(`msg_${msgId}`)) return;
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

      // Extract dynamic academic metadata from filename & caption
      const meta = extractAcademicMetadata({ fileName: originalName, caption });
      const { title, subject, branch, course, year } = meta;
      const fileHash = crypto.createHash("sha256").update(`${originalName}_${fileSize}`).digest("hex");

      // Comprehensive duplicate prevention check (Single-field queries, zero composite index needed)
      const dup = await isDuplicateNote(db, {
        docIdStr,
        msgId,
        originalName,
        title,
        fileSize,
        fileHash,
      });
      if (dup) {
        processingMsgIds.add(msgId);
        if (docIdStr) processingDocIds.add(docIdStr);
        console.log(`[MTProto SYNC] 🛡️ Duplicate note ignored in channel: "${title}" (Msg ID: ${msgId}, Doc ID: ${docIdStr})`);
        return;
      }

      // Reserve immediately in memory & syncLock
      processingMsgIds.add(msgId);
      if (docIdStr) processingDocIds.add(docIdStr);
      syncLock.lock(`msg_${msgId}`);
      if (docIdStr) syncLock.lock(`doc_${docIdStr}`);
      if (sig) syncLock.lock(sig);

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
        originalName,
        fileHash,
        mimeType: doc.mimeType || "application/pdf",
        fileSize,
        compressedSize: fileSize,
        savingsPercent: 0,
        telegramMessageId: Number(message.id),
        telegramDocumentId: doc.id?.toString() || null,
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

      // Auto-post to Notice Board
      await db.collection("notices").add({
        title: `📚 Cloud Vault: ${title}`,
        content: `New note synced live for ${course} (${branch}) — Subject: ${subject}.`,
        link: `/api/notes/${noteRef.id}/stream`,
        linkText: "Click Here to Read Document",
        type: "new_material",
        isPinned: false,
        createdBy: "Auto-Sync",
        createdAt: nowIso,
        updatedAt: nowIso,
      }).catch(() => {});

      // NOTE: We intentionally DO NOT send receipts into storageChatId.
      // storageChatId is an internal backend vault, receipts should never clutter it!

      clearCache();
      console.log(`[MTProto SYNC] Note "${title}" successfully published to web platform!`);
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

        for (const delId of deletedIds) {
          // A. Purge note by telegramMessageId (Storage Channel message)
          const snapMsg = await db.collection("notes").where("telegramMessageId", "==", delId).get();
          if (!snapMsg.empty) {
            for (const doc of snapMsg.docs) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Storage Message ${delId} was deleted.`);
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
            }
          }

          // B. Purge note by telegramOriginMessageId (Group / DM original message)
          const snapOrigin = await db.collection("notes").where("telegramOriginMessageId", "==", delId).get();
          if (!snapOrigin.empty) {
            for (const doc of snapOrigin.docs) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Original Message ${delId} was deleted.`);
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
            }
          }

          // C. Purge ALL notes where telegramTopicId matches delId (topic deleted in Telegram)
          const snapTopic = await db.collection("notes").where("telegramTopicId", "==", delId).get();
          if (!snapTopic.empty) {
            for (const doc of snapTopic.docs) {
              const noteData = doc.data();
              console.log(`[MTProto SYNC] Moving note "${noteData.title}" (ID: ${doc.id}) to Restore Vault because Topic ${delId} was deleted in Telegram.`);
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
            }
          }
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
 * 4. originalName / title + fileSize match
 */
async function deduplicateDatabaseNotes() {
  const db = getFirestoreDb();
  if (!db) return { success: false, cleanedCount: 0 };

  const snap = await db.collection("notes").get();
  const seenDocIds = new Map();
  const seenFileKeys = new Map();
  const seenHashes = new Map();
  const seenTgMsgIds = new Map();
  let duplicateCleanedCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const docIdStr = data.telegramDocumentId;
    const fileKey = `${(data.originalName || data.title || "").toLowerCase().trim()}_${data.fileSize || 0}`;

    let isDup = false;
    if (docIdStr && seenDocIds.has(docIdStr)) {
      isDup = true;
    } else if (data.fileHash && seenHashes.has(data.fileHash)) {
      isDup = true;
    } else if (data.telegramMessageId && Number(data.telegramMessageId) > 0 && seenTgMsgIds.has(Number(data.telegramMessageId))) {
      isDup = true;
    } else if (data.fileSize && Number(data.fileSize) > 0 && seenFileKeys.has(fileKey)) {
      isDup = true;
    }

    if (isDup) {
      console.log(`[MTProto DEDUPLICATE] Removing duplicate note "${data.title}" (ID: ${doc.id})`);
      await db.collection("deleted_records").doc(`notes_${doc.id}`).set({
        ...data,
        originalId: doc.id,
        collectionName: "notes",
        typeLabel: "Note (Duplicate Auto-Clean)",
        archivedAt: new Date().toISOString(),
        archivedBy: "Auto Deduplication Engine",
      }).catch(() => {});
      await db.collection("notes").doc(doc.id).delete();
      duplicateCleanedCount++;
    } else {
      if (docIdStr) seenDocIds.set(docIdStr, doc.id);
      if (data.fileHash) seenHashes.set(data.fileHash, doc.id);
      if (data.telegramMessageId && Number(data.telegramMessageId) > 0) seenTgMsgIds.set(Number(data.telegramMessageId), doc.id);
      if (data.fileSize && Number(data.fileSize) > 0) seenFileKeys.set(fileKey, doc.id);
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
  if (!c) throw new Error("Cloud Storage client not connected");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore DB not connected");

  console.log(`[MTProto RECONCILE] Initiating Bot-compatible channel synchronization...`);

  // 1. Run Automated Database Deduplication Sweep
  const { cleanedCount: duplicateCleanedCount } = await deduplicateDatabaseNotes();

  // 2. Map existing valid notes for reconciliation
  const snap = await db.collection("notes").get();
  const existingNotesWithTg = [];
  const knownMsgIds = new Set();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.telegramMessageId && Number(data.telegramMessageId) > 0) {
      const msgId = Number(data.telegramMessageId);
      existingNotesWithTg.push({ docId: doc.id, msgId, title: data.title });
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
      const verifiedMsgs = await c.getMessages(storageChatId, { ids: batchIds });

      for (let j = 0; j < batchNotes.length; j++) {
        const vMsg = verifiedMsgs[j];
        if (!vMsg || !vMsg.media || !vMsg.media.document) {
          console.log(`[MTProto RECONCILE] Purging orphaned note "${batchNotes[j].title}" (Msg ID ${batchNotes[j].msgId})`);
          await db.collection("notes").doc(batchNotes[j].docId).delete();
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
    const msgs = await c.getMessages(storageChatId, { ids: chunk });

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

        // Comprehensive duplicate prevention check (title extracted via utility)
        const metaRec = extractAcademicMetadata({ fileName: originalName, caption });
        const { title, subject, branch, course, year } = metaRec;
        const fileHash = crypto.createHash("sha256").update(`${originalName}_${docSize}`).digest("hex");

        const dup = await isDuplicateNote(db, {
          docIdStr,
          msgId,
          originalName,
          title,
          fileSize: docSize,
          fileHash,
        });

        if (dup) {
          knownMsgIds.add(msgId);
          if (docIdStr) processingDocIds.add(docIdStr);
          console.log(`[MTProto RECONCILE] 🛡️ Duplicate suppressed: "${title}" (Msg ID: ${msgId}, Doc ID: ${docIdStr})`);
          continue;
        }

        const noteRef = db.collection("notes").doc();
        const now = new Date();
        const nowIso = now.toISOString();
        const nowMs = now.getTime();

        await noteRef.set({
          id: noteRef.id,
          title,
          subject,
          branch,
          course,
          year,
          semester: year,
          description: caption || "Imported and synchronized from Cloud Storage Vault.",
          originalName,
          fileHash,
          mimeType: doc.mimeType || "application/pdf",
          fileSize: docSize,
          compressedSize: docSize,
          savingsPercent: 0,
          telegramMessageId: msgId,
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
        });

        knownMsgIds.add(msgId);
        if (docIdStr) processingDocIds.add(docIdStr);
        importedCount++;
        console.log(`[MTProto RECONCILE] Imported new material "${title}" (Msg ID: ${msgId})`);

        // Dispatch receipt directly into the channel replying to the uploaded message
        try {
          if (syncLock.canSendReceipt(storageChatId, msgId)) {
            const formatMb = (docSize / (1024 * 1024)).toFixed(2);
            const receiptText = `⚡ <b>Free Study Material Vault Receipt</b>\n\n` +
              `✅ <b>Note Successfully Indexed to Website!</b>\n` +
              `📄 <b>Title:</b> ${title}\n` +
              `📚 <b>Subject:</b> ${subject}\n` +
              `🎓 <b>Program:</b> ${course} (${branch} • ${year})\n` +
              `💾 <b>Size:</b> ${formatMb} MB\n` +
              `🔗 <b>Direct Link:</b> https://freestudymaterial.onrender.com/api/notes/${noteRef.id}/stream\n` +
              `🌐 <b>Website:</b> https://freestudymaterial.onrender.com\n\n` +
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
  const topicDocs = snap.docs.filter((d) => d.data().telegramTopicId && d.data().telegramOriginChatId);
  for (const tDoc of topicDocs) {
    const data = tDoc.data();
    try {
      const topicMsgs = await c.getMessages(data.telegramOriginChatId, { ids: [Number(data.telegramTopicId)] });
      if (!topicMsgs || !topicMsgs[0]) {
        console.log(`[MTProto RECONCILE] Purging note "${data.title}" because its Topic ${data.telegramTopicId} was removed.`);
        await db.collection("notes").doc(tDoc.id).delete();
        purgedCount++;
      }
    } catch {}
  }

  clearCache();

  return {
    success: true,
    scannedRange: `IDs 1 to ${probeMax}`,
    verifiedCount,
    importedCount,
    duplicateCleanedCount,
    purgedCount,
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

  // GramJS uploadFile with 16 parallel worker threads and RAM custom buffer
  const fileResult = await c.uploadFile({
    file: customFile,
    workers: 16,
    maxBufferSize: 120 * 1024 * 1024,
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
 */
async function streamDocumentFromChannel(messageId, res, rangeHeader = null) {
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
    throw new Error(`Document not found for message ID ${messageId}`);
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
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", doc.mimeType || "application/pdf");
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

  // Stream in 512KB chunks using 16 parallel worker connections
  const chunkSize = 512 * 1024;
  const location = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: "",
  });

  let bytesWritten = 0;
  for await (const chunk of c.iterDownload({
    file: location,
    offset: bigInt(start),
    chunkSize: chunkSize,
    requestSize: chunkSize,
    workers: 16,
  })) {
    if (res.writableEnded || res.destroyed) break;

    const remaining = contentLength - bytesWritten;
    if (remaining <= 0) break;

    if (chunk.length > remaining) {
      res.write(chunk.slice(0, remaining));
      bytesWritten += remaining;
      break;
    } else {
      res.write(chunk);
      bytesWritten += chunk.length;
    }

    if (bytesWritten >= contentLength) break;
  }

  res.end();
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

/**
 * High-Speed Continuous Background Auto-Sync Engine
 * Periodically reconciles channel uploads, deletions, and forum topic removals
 * without waiting for manual admin clicks.
 */
function startAutoSyncWorker(intervalMs = 10 * 60 * 1000) {
  if (autoSyncTimer) return;
  console.log(`[MTProto AUTOSYNC] ⚡ High-Speed Continuous Auto-Sync active (Interval: ${intervalMs / 1000}s).`);

  const runSync = async () => {
    if (isAutoSyncing) return;
    isAutoSyncing = true;
    try {
      await syncTelegramChannel();
    } catch (e) {
      // Non-fatal background sync warning
    } finally {
      isAutoSyncing = false;
    }
  };

  // Run initial auto-sync after 4 seconds of startup
  setTimeout(runSync, 4000);

  // High-frequency recurring background interval
  autoSyncTimer = setInterval(runSync, intervalMs);
}

function stopAutoSyncWorker() {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    console.log("[MTProto AUTOSYNC] Auto-Sync worker stopped.");
  }
}

function getMTProtoDetails() {
  const dcId = client?.session?.dcId || 4;
  const serverAddress = client?.session?.serverAddress || (dcId === 4 ? "91.108.56.104" : dcId === 2 ? "149.154.167.50" : "149.154.167.40");
  const port = client?.session?.port || 443;
  return {
    connected: isConnected || (client && client.connected),
    dcId,
    dcIp: `${serverAddress}:${port}`,
    dcLocation: dcId === 4 ? "DC 4 (Amsterdam, Netherlands - Primary EU/Global)" : dcId === 2 ? "DC 2 (Amsterdam, Netherlands)" : `DC ${dcId}`,
    protocol: "MTProto 2.0 (GramJS / TCPFull)",
    transport: "High-Speed TCP Socket (16 Parallel Threads)",
    workers: 16,
    deviceModel: "AcademicCloud-v3",
    appVersion: "3.0.0",
    storageChatConfigured: !!storageChatId,
    autoSyncActive: !!autoSyncTimer,
    autoSyncInterval: "10m Periodic",
  };
}

module.exports = {
  getClient,
  uploadToStorageChannel,
  streamDocumentFromChannel,
  syncTelegramChannel,
  deduplicateDatabaseNotes,
  deleteTelegramMessages,
  startAutoSyncWorker,
  stopAutoSyncWorker,
  getMTProtoDetails,
};

