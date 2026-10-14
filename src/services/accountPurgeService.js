const { db } = require("../firebase");
const { sendTelegramAuthNotice } = require("./emailService");

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "jnplotus@gmail.com").toLowerCase().trim();
const INACTIVITY_DAYS = 90;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Sweeper: Identifies students who have not logged in for over 90 days,
 * compiles their complete file history & activity dossier, sends a full
 * alert to Telegram Security Bot, safely archives uploaded notes, and
 * permanently deletes the inactive account from the database.
 */
async function purgeInactiveAccounts({ force = false } = {}) {
  if (!db) {
    console.warn("[ACCOUNT PURGE] Firestore database not connected.");
    return { success: false, message: "Database not connected", purgedCount: 0 };
  }

  const now = Date.now();
  const purgedUsers = [];

  try {
    const usersSnap = await db.collection("users").get();
    const candidateDocs = [];

    usersSnap.forEach((doc) => {
      const u = doc.data();
      const email = (u.email || "").toLowerCase().trim();

      // 🛡️ PERMANENT IMMUNITY: Never purge master admin or full admin accounts!
      if (email === MAIN_ADMIN_EMAIL || u.role === "admin" || u.role === "half_admin") {
        return;
      }

      // Determine last active timestamp
      const lastLoginTime = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0;
      const createdTime = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      const effectiveTime = Math.max(lastLoginTime, createdTime);

      if (effectiveTime > 0 && now - effectiveTime > INACTIVITY_MS) {
        candidateDocs.push({
          docId: doc.id,
          userData: u,
          inactivityDays: Math.floor((now - effectiveTime) / (24 * 60 * 60 * 1000)),
        });
      }
    });

    console.log(`[ACCOUNT PURGE] Found ${candidateDocs.length} inactive student accounts (> 90 days).`);

    for (const candidate of candidateDocs) {
      const { docId, userData, inactivityDays } = candidate;
      const email = (userData.email || "").toLowerCase().trim();

      // 1. Fetch complete list of study notes uploaded by this student
      let uploadedNotes = [];
      try {
        const notesSnap = await db.collection("notes").where("uploadedBy", "==", email).get();
        notesSnap.forEach((nDoc) => {
          const nd = nDoc.data();
          uploadedNotes.push({
            id: nDoc.id,
            title: nd.title || "Academic Document",
            subject: nd.subject || "General",
            branch: nd.branch || "General",
            course: nd.course || "B.Tech",
            fileSize: nd.compressedSize || nd.fileSize || 0,
            uploadedAt: nd.createdAt || "",
          });
        });

        // 🛡️ Safely preserve uploaded notes in vault (do not delete study materials!)
        // Simply re-attribute uploader so other students can continue downloading
        for (const nDoc of notesSnap.docs) {
          await nDoc.ref.update({
            uploaderName: `${userData.name || "Student Scholar"} (Archived Account)`,
            isUploaderArchived: true,
          }).catch(() => {});
        }
      } catch (noteErr) {
        console.warn(`[ACCOUNT PURGE] Error querying notes for ${email}:`, noteErr.message);
      }

      // Count downloads from student activities
      const downloadsCount = (userData.activities || []).filter((a) => a.type === "download").length;

      // 2. Dispatch Full Dossier & File History to Telegram Security Bot (Topic 8: accountPurge)
      try {
        await sendTelegramAuthNotice({
          event: "ACCOUNT_PURGE",
          user: {
            id: docId,
            name: userData.name || "Student Scholar",
            email: email,
            mobile: userData.mobile || "N/A",
            college: userData.college || "N/A",
            year: userData.year || "N/A",
            telegramDetails: userData.telegramDetails || null,
            telegramName: userData.telegramName || userData.telegramDetails?.username || "N/A",
            registeredDate: userData.createdAt ? new Date(userData.createdAt).toLocaleDateString("en-IN") : "N/A",
            lastLoginDate: userData.lastLoginAt ? new Date(userData.lastLoginAt).toLocaleDateString("en-IN") : "Never Logged In",
            inactivityDays: inactivityDays,
            uploadedNotes: uploadedNotes,
            downloadsCount: downloadsCount,
          },
          method: "90-Day Automated Lifecycle Sweeper",
        });
      } catch (tgErr) {
        console.warn(`[ACCOUNT PURGE] Telegram alert notice for ${email}:`, tgErr.message);
      }

      // 3. Record in purged_accounts index so Login Screen can give the clear guidance notice
      await db.collection("purged_accounts").doc(email).set({
        userId: docId,
        email: email,
        name: userData.name || "Student Scholar",
        college: userData.college || "N/A",
        purgedAt: new Date().toISOString(),
        reason: "inactivity_90_days",
        inactivityDays: inactivityDays,
        totalUploadedNotes: uploadedNotes.length,
      });

      // Also record in Universal Restore Vault (deleted_records)
      await db.collection("deleted_records").doc(`users_${docId}`).set({
        ...userData,
        originalId: docId,
        collectionName: "users",
        typeLabel: "Student Account (Purged)",
        archivedAt: new Date().toISOString(),
        archivedReason: `Auto-purged: ${inactivityDays} days account inactivity (>90 days limit)`,
      }).catch(() => {});

      // 4. Permanently delete from live 'users' collection
      await db.collection("users").doc(docId).delete();

      purgedUsers.push({
        id: docId,
        email: email,
        name: userData.name,
        inactivityDays,
        uploadedNotesCount: uploadedNotes.length,
      });

      console.log(`[ACCOUNT PURGE] Successfully purged inactive user: ${email} (${inactivityDays} days inactive).`);
    }

    return {
      success: true,
      purgedCount: purgedUsers.length,
      purgedUsers,
      message: `Completed 90-day inactivity check. Safely purged ${purgedUsers.length} inactive student accounts.`,
    };
  } catch (err) {
    console.error("[ACCOUNT PURGE] Sweeper error:", err);
    return { success: false, message: err.message, purgedCount: 0 };
  }
}

module.exports = {
  purgeInactiveAccounts,
  INACTIVITY_DAYS,
};

