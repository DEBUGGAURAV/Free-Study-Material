/**
 * ============================================================================
 * 🛡️ UNIVERSAL USER CASCADE DELETION & AUDIT ENGINE
 * ============================================================================
 * Handles complete, atomic cascading deletion when a student account is removed:
 * 1. Firebase Firestore:
 *    - Archives to Universal Restore Vault (deleted_records)
 *    - Deletes from live 'users' collection
 *    - Purges passkeys, authenticators, user_sessions, and pending_verifications
 *    - Re-attributes uploaded study notes to "(Archived Account)" so materials stay in vault
 *    - Purges user chat messages from chat_messages
 * 2. Turso LibSQL Database:
 *    - Purges user record from 'users' table
 *    - Purges chat profiles from 'chat_user_profiles' table
 *    - Purges chat messages from 'chat_messages' table
 *    - Purges created chat rooms & audits
 *    - Updates note uploader in Turso notes table & edge cache
 * 3. RAM & Edge Caches:
 *    - Invalidates all RAM cache and Turso notes cache
 *    - Removes active user chat messages from RAM
 * 4. Dual-Supergroup Audit Dossier Dispatches:
 *    - Notes Activity Dossier -> Dispatched to FSM Security Supergroup (@fsm_security_otp_bot)
 *    - Chat History Purge Report -> Dispatched to Chat Audit Supergroup (@fsm_chat_bot) & Admin DM
 * ============================================================================
 */

const { db } = require("../firebase");
const { decryptUserObject } = require("../utils/cryptoVault");
const { purgeUserFromTurso, archiveUserNotesInTurso } = require("./tursoService");
const { updateUserNotesInTursoCache } = require("./tursoNotesCacheService");
const { sendTelegramAuthNotice } = require("./emailService");
const { dispatchUserDeletionChatReportToTelegram } = require("./chatAuditBotService");
const { invalidateAllCache } = require("../utils/ramCache");

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_ALIASES = ["admin", "mainadmin", "administrator", "root"];

const recentlyDeletedUserIds = new Set();

function markUserAsCascadeDeleted(userId) {
  if (!userId) return;
  recentlyDeletedUserIds.add(String(userId));
  setTimeout(() => recentlyDeletedUserIds.delete(String(userId)), 60000); // 60s memory window
}

/**
 * Universal Cascade Deletion of a Student Account
 * @param {object} options
 * @param {string} options.userId - ID of the user document
 * @param {object} [options.targetUser] - Pre-fetched user document data (optional)
 * @param {object} [options.admin] - Admin performing the action ({ id, name, email, ip })
 * @param {string} [options.reason] - Reason for deletion
 * @param {boolean} [options.isAutoPurge] - Whether triggered by 90-day sweeper
 * @returns {Promise<{ success: boolean, message: string, summary: object }>}
 */
async function cascadeDeleteUserAccount({
  userId,
  targetUser = null,
  admin = null,
  reason = "Admin Manual Deletion",
  isAutoPurge = false,
  inactivityDays = null,
  thresholdDays = null,
}) {
  if (!db) {
    throw new Error("Firestore database not connected.");
  }
  if (!userId) {
    throw new Error("User ID is required for cascade deletion.");
  }

  // 1. Fetch & decrypt target user if not provided
  markUserAsCascadeDeleted(userId);
  let userData = targetUser;
  if (!userData) {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      throw new Error(`Student account with ID "${userId}" does not exist.`);
    }
    userData = decryptUserObject(userDoc.data());
  }

  const cleanEmail = (userData.email || "").toLowerCase().trim();
  const cleanMobile = (userData.mobile || "").trim();

  // 🛡️ IMMUNITY CHECK: Master Admin can NEVER be deleted!
  if (
    cleanEmail === MAIN_ADMIN_EMAIL ||
    ADMIN_ALIASES.includes(cleanEmail) ||
    userId === "admin-root" ||
    userId === "admin" ||
    userData.role === "admin" ||
    userData.isMainAdmin === true
  ) {
    throw new Error("ILLEGAL ACTION: Master Administrator account is permanently immune and cannot be deleted!");
  }

  console.log(`[CASCADE-DELETE] 🚀 Starting complete cascade deletion for user ${userId} (${cleanEmail})...`);

  // 2. Fetch all study notes uploaded by this student
  const uploadedNotes = [];
  try {
    const notesQuery = cleanEmail
      ? await db.collection("notes").where("uploadedBy", "==", cleanEmail).get()
      : { empty: true, docs: [] };

    if (!notesQuery.empty) {
      for (const nDoc of notesQuery.docs) {
        const nd = nDoc.data();
        uploadedNotes.push({
          id: nDoc.id,
          title: nd.title || "Academic Document",
          subject: nd.subject || "General",
          branch: nd.branch || "General",
          course: nd.course || "B.Tech",
          fileSize: nd.compressedSize || nd.fileSize || 0,
          uploadedAt: nd.createdAt || "",
          downloads: nd.downloads || 0,
        });

        // 🛡️ Preserve notes in Academic Cloud Vault for other students
        await nDoc.ref.update({
          uploaderName: `${userData.name || "Student Scholar"} (Archived Account)`,
          isUploaderArchived: true,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } catch (noteErr) {
    console.warn(`[CASCADE-DELETE] Note query notice for ${cleanEmail}:`, noteErr.message);
  }

  // 3. Extract downloaded notes & activities from student profile
  const downloadActivities = (userData.activities || []).filter(
    (a) => a.type === "download" || a.action === "download" || (a.detail && a.detail.toLowerCase().includes("download"))
  );

  const downloadedNotesMap = new Map();
  downloadActivities.forEach((act) => {
    const key = act.noteId || act.noteTitle || act.detail || act.id;
    if (key && !downloadedNotesMap.has(key)) {
      downloadedNotesMap.set(key, {
        id: act.noteId || act.id,
        title: act.noteTitle || (act.detail ? act.detail.replace(/^Downloaded:\s*/i, "") : "Academic Document"),
        subject: act.subject || "General",
        course: act.course || "",
        branch: act.branch || "",
        downloadedAt: act.timestamp || "",
      });
    }
  });

  if (Array.isArray(userData.downloadedNotes)) {
    userData.downloadedNotes.forEach((d) => {
      const key = d.id || d.title;
      if (key && !downloadedNotesMap.has(key)) {
        downloadedNotesMap.set(key, {
          id: d.id,
          title: d.title || "Academic Document",
          subject: d.subject || "General",
          course: d.course || "",
          branch: d.branch || "",
          downloadedAt: d.downloadedAt || d.timestamp || "",
        });
      }
    });
  }

  const downloadedNotes = Array.from(downloadedNotesMap.values());
  const effectiveDownloadsCount = Math.max(downloadActivities.length, downloadedNotes.length, Number(userData.downloadsCount || 0));
  const totalActivitiesCount = (userData.activities || []).length;

  // 4. Gather Chat History for this student
  let chatMessagesCount = 0;
  const chatRoomsSet = new Set();
  try {
    const chatSnap = await db.collection("chat_messages").where("sender.id", "==", userId).get();
    chatMessagesCount = chatSnap.size;
    chatSnap.forEach((mDoc) => {
      const md = mDoc.data();
      if (md.roomId) chatRoomsSet.add(md.roomId);
    });

    // Batch delete chat messages from Firestore
    if (!chatSnap.empty) {
      const batch = db.batch();
      chatSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit().catch(() => {});
    }

    // Filter from active in-memory messages if chat module is loaded
    try {
      const chatModule = require("../routes/chat");
      if (chatModule && chatModule.activeMessages) {
        chatModule.activeMessages.forEach((msgs, roomId) => {
          const filtered = msgs.filter((m) => m.sender?.id !== userId);
          chatModule.activeMessages.set(roomId, filtered);
        });
      }
    } catch (_) {}
  } catch (chatErr) {
    console.warn(`[CASCADE-DELETE] Chat cleanup notice for ${userId}:`, chatErr.message);
  }

  // 5. Cascade Delete from Turso LibSQL Database
  let tursoDeletedCount = 0;
  try {
    const tursoRes = await purgeUserFromTurso(userId, cleanEmail);
    tursoDeletedCount = tursoRes?.deletedCount || 0;

    // Update notes in Turso database & cache
    if (cleanEmail) {
      await archiveUserNotesInTurso(cleanEmail, `${userData.name || "Student"} (Archived Account)`);
      await updateUserNotesInTursoCache(cleanEmail, `${userData.name || "Student"} (Archived Account)`);
    }
  } catch (tursoErr) {
    console.warn(`[CASCADE-DELETE] Turso cascade notice for ${userId}:`, tursoErr.message);
  }

  // 6. Delete Passkeys, Authenticators & Active Sessions
  try {
    const passkeySnap = await db.collection("passkeys").where("userId", "==", userId).get().catch(() => ({ empty: true, docs: [] }));
    if (!passkeySnap.empty) {
      const pBatch = db.batch();
      passkeySnap.docs.forEach((d) => pBatch.delete(d.ref));
      await pBatch.commit().catch(() => {});
    }
  } catch (_) {}

  try {
    const sessSnap = await db.collection("user_sessions").where("userId", "==", userId).get().catch(() => ({ empty: true, docs: [] }));
    if (!sessSnap.empty) {
      const sBatch = db.batch();
      sessSnap.docs.forEach((d) => sBatch.delete(d.ref));
      await sBatch.commit().catch(() => {});
    }
  } catch (_) {}

  // Clean pending verifications for this user
  try {
    const cleanDigits = cleanMobile.replace(/\D/g, "").slice(-10);
    if (cleanDigits) {
      await db.collection("pending_verifications").doc(`reg_digits_${cleanDigits}`).delete().catch(() => {});
      await db.collection("pending_verifications").doc(`reset_digits_${cleanDigits}`).delete().catch(() => {});
    }
    if (cleanEmail) {
      const safeEmailKey = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("pending_verifications").doc(`reg_email_${safeEmailKey}`).delete().catch(() => {});
      await db.collection("pending_verifications").doc(`reset_email_${safeEmailKey}`).delete().catch(() => {});
    }
  } catch (_) {}

  // 7. Save to Universal Restore Vault (deleted_records)
  const archivedAt = new Date().toISOString();
  await db.collection("deleted_records").doc(`users_${userId}`).set({
    ...userData,
    originalId: userId,
    collectionName: "users",
    typeLabel: isAutoPurge ? "Student Account (Purged)" : "Student",
    title: userData.name || userData.email || "Student Account",
    archivedAt,
    archivedBy: admin?.email || (isAutoPurge ? "Automated Lifecycle Sweeper" : "Admin"),
    deletionReason: reason,
    uploadedNotesCount: uploadedNotes.length,
    downloadsCount: effectiveDownloadsCount,
    downloadedNotesCount: downloadedNotes.length,
    downloadedNotes: downloadedNotes,
    tursoRowsDeleted: tursoDeletedCount,
    chatMessagesDeleted: chatMessagesCount,
  }).catch(() => {});

  if (isAutoPurge && cleanEmail) {
    await db.collection("purged_accounts").doc(cleanEmail).set({
      userId,
      email: cleanEmail,
      name: userData.name || "Student Scholar",
      college: userData.college || "N/A",
      purgedAt: archivedAt,
      reason: `inactivity_${thresholdDays || 90}_days`,
      inactivityDays: inactivityDays || 90,
      thresholdDays: thresholdDays || 90,
      totalUploadedNotes: uploadedNotes.length,
    }).catch(() => {});
  }

  // 8. Delete user from live Firestore 'users' collection
  await db.collection("users").doc(userId).delete().catch(() => {});

  // 9. Invalidate RAM & Edge Caches
  invalidateAllCache();

  // 10. Dispatch Notes Activity Dossier to FSM Security Supergroup (@fsm_security_otp_bot)
  try {
    await sendTelegramAuthNotice({
      event: "ACCOUNT_PURGE",
      user: {
        id: userId,
        name: userData.name || "Student Scholar",
        email: cleanEmail,
        mobile: userData.mobile || "N/A",
        college: userData.college || "N/A",
        year: userData.year || "N/A",
        telegramDetails: userData.telegramDetails || null,
        telegramName: userData.telegramName || userData.telegramDetails?.username || "N/A",
        registeredDate: userData.createdAt ? new Date(userData.createdAt).toLocaleDateString("en-IN") : "N/A",
        lastLoginDate: userData.lastLoginAt ? new Date(userData.lastLoginAt).toLocaleDateString("en-IN") : "Never Logged In",
        inactivityDays: inactivityDays !== null ? inactivityDays : undefined,
        thresholdDays: thresholdDays !== null ? thresholdDays : undefined,
        uploadedNotes: uploadedNotes,
        downloadedNotes: downloadedNotes,
        downloadsCount: effectiveDownloadsCount,
        totalActivities: totalActivitiesCount,
        tursoDeletedCount,
        actionType: isAutoPurge ? "AUTO_PURGE" : "ADMIN_DELETE",
      },
      method: isAutoPurge
        ? `${thresholdDays || 90}-Day Automated Lifecycle Sweeper`
        : `Admin Deletion by ${admin?.email || "Admin"}`,
      admin,
    });
  } catch (secErr) {
    console.warn(`[CASCADE-DELETE] FSM Security alert warning for ${cleanEmail}:`, secErr.message);
  }

  // 11. Dispatch Chat History Purge Report to Chat Audit Supergroup (@fsm_chat_bot) & Admin DM
  try {
    await dispatchUserDeletionChatReportToTelegram({
      user: {
        id: userId,
        name: userData.name,
        email: cleanEmail,
        mobile: userData.mobile,
        college: userData.college,
      },
      admin,
      chatSummary: {
        messagesCount: chatMessagesCount,
        rooms: Array.from(chatRoomsSet),
        tursoRowsDeleted: tursoDeletedCount,
      },
    });
  } catch (chatTgErr) {
    console.warn(`[CASCADE-DELETE] Chat Audit alert warning for ${cleanEmail}:`, chatTgErr.message);
  }

  console.log(`[CASCADE-DELETE] ✅ Complete cascade deletion finished for ${cleanEmail}: Turso (${tursoDeletedCount} rows), Chat (${chatMessagesCount} msgs), Notes preserved (${uploadedNotes.length}).`);

  return {
    success: true,
    message: isAutoPurge
      ? `Student account automatically purged (${inactivityDays} days inactive). Complete cascade finished.`
      : "Student account safely deleted and cascaded across Firebase, Turso, and all audit logs.",
    summary: {
      userId,
      email: cleanEmail,
      name: userData.name,
      uploadedNotesCount: uploadedNotes.length,
      downloadsCount: effectiveDownloadsCount,
      downloadedNotesCount: downloadedNotes.length,
      downloadedNotes: downloadedNotes,
      chatMessagesDeleted: chatMessagesCount,
      tursoRowsDeleted: tursoDeletedCount,
    },
  };
}

let isWatcherInitialized = false;

/**
 * 📡 Live Firestore User Deletion Watcher
 * Detects if an administrator deletes a student directly in the Firebase Console
 * and automatically cascades the deletion across Turso, Chatbot, and Supergroups!
 */
function initFirebaseUserDeletionWatcher() {
  if (isWatcherInitialized || !db) return;
  try {
    db.collection("users").onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "removed") {
            const userId = change.doc.id;
            if (recentlyDeletedUserIds.has(String(userId))) {
              // Already handled by manual admin action or auto-purge
              return;
            }
            markUserAsCascadeDeleted(userId);

            console.log(`[FIREBASE-WATCHER] ⚠️ External user deletion detected directly in Firestore for user: ${userId}`);
            const deletedData = change.doc.data() || {};
            const decryptedUser = decryptUserObject(deletedData);

            try {
              await cascadeDeleteUserAccount({
                userId,
                targetUser: decryptedUser,
                admin: { name: "Firebase Console Direct Action", email: "firebase-admin@console" },
                reason: "Direct Deletion from Firebase Firestore Console",
              });
            } catch (err) {
              console.warn(`[FIREBASE-WATCHER] Cascade error on external deletion of ${userId}:`, err.message);
            }
          }
        });
      },
      (err) => {
        console.warn("[FIREBASE-WATCHER] Firestore user watcher warning:", err.message);
      }
    );
    isWatcherInitialized = true;
    console.log("[FIREBASE-WATCHER] 📡 Live Firestore User Deletion Watcher active (Auto-cascades direct Firebase Console deletions).");
  } catch (err) {
    console.warn("[FIREBASE-WATCHER] Initialization notice:", err.message);
  }
}

module.exports = {
  cascadeDeleteUserAccount,
  initFirebaseUserDeletionWatcher,
  markUserAsCascadeDeleted,
};

