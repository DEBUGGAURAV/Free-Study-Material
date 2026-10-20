const { db } = require("../firebase");
const { sendTelegramAuthNotice } = require("./emailService");

const MAIN_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const ADMIN_ALIASES = ["admin", "mainadmin", "administrator", "root"];

let defaultInactivityDays = 90;

/**
 * Initialize dynamic inactivity days from Firestore settings
 */
async function initAccountPurgeSettings() {
  if (!db) return;
  try {
    const doc = await db.collection("settings").doc("account_purge").get();
    if (doc.exists) {
      const data = doc.data();
      if (typeof data.defaultInactivityDays === "number" && data.defaultInactivityDays > 0) {
        defaultInactivityDays = Math.max(1, Math.min(3650, data.defaultInactivityDays));
        console.log(`[ACCOUNT PURGE] 🔄 Loaded custom default inactivity limit: ${defaultInactivityDays} days.`);
      }
    }
  } catch (err) {
    console.warn("[ACCOUNT PURGE] Could not load account_purge settings from DB:", err.message);
  }
}
initAccountPurgeSettings();

function getDefaultInactivityDays() {
  return defaultInactivityDays;
}

async function setDefaultInactivityDays(days) {
  const cleanDays = Math.max(1, Math.min(3650, parseInt(days, 10) || 90));
  defaultInactivityDays = cleanDays;
  if (db) {
    await db.collection("settings").doc("account_purge").set(
      { defaultInactivityDays: cleanDays, updatedAt: new Date().toISOString() },
      { merge: true }
    ).catch(() => {});
  }
  return cleanDays;
}

/**
 * Manually adjust inactivity days or grace period for a specific student/user
 * @param {string} userId - Target user ID
 * @param {object} options - { action: "increase"|"decrease"|"set"|"reset_default"|"toggle_immunity", days: number, resetInactivity: boolean }
 */
async function adjustUserInactivity(userId, { action = "set", days = 0, resetInactivity = false } = {}) {
  if (!db) throw new Error("Database not connected");
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) throw new Error("Student account not found");

  const userData = userDoc.data();
  const currentThreshold =
    typeof userData.customInactivityDays === "number" && userData.customInactivityDays > 0
      ? userData.customInactivityDays
      : defaultInactivityDays;

  let newThreshold = currentThreshold;
  let newGraceDays = typeof userData.inactivityGraceDays === "number" ? userData.inactivityGraceDays : 0;
  let isImmune = Boolean(userData.neverPurge || userData.customInactivityDays >= 9999);
  const updates = { updatedAt: new Date().toISOString() };

  if (resetInactivity) {
    updates.lastLoginAt = new Date().toISOString();
  }

  const stepDays = parseInt(days, 10) || 15;

  if (action === "increase") {
    newThreshold = Math.min(3650, currentThreshold + stepDays);
    updates.customInactivityDays = newThreshold;
    updates.neverPurge = false;
    isImmune = false;
  } else if (action === "decrease") {
    newThreshold = Math.max(1, currentThreshold - stepDays);
    updates.customInactivityDays = newThreshold;
    updates.neverPurge = false;
    isImmune = false;
  } else if (action === "set") {
    if (days === "never" || days >= 9999) {
      updates.customInactivityDays = 9999;
      updates.neverPurge = true;
      isImmune = true;
    } else {
      newThreshold = Math.max(1, Math.min(3650, parseInt(days, 10) || defaultInactivityDays));
      updates.customInactivityDays = newThreshold;
      updates.neverPurge = false;
      isImmune = false;
    }
  } else if (action === "toggle_immunity") {
    isImmune = !isImmune;
    updates.neverPurge = isImmune;
    if (isImmune) {
      updates.customInactivityDays = 9999;
    } else {
      updates.customInactivityDays = defaultInactivityDays;
      newThreshold = defaultInactivityDays;
    }
  } else if (action === "reset_default") {
    updates.customInactivityDays = null;
    updates.inactivityGraceDays = 0;
    updates.neverPurge = false;
    isImmune = false;
    newThreshold = defaultInactivityDays;
  }

  await userRef.update(updates);

  // Compute live statistics for response
  const now = Date.now();
  const lastLoginTime = updates.lastLoginAt
    ? new Date(updates.lastLoginAt).getTime()
    : userData.lastLoginAt
    ? new Date(userData.lastLoginAt).getTime()
    : 0;
  const createdTime = userData.createdAt ? new Date(userData.createdAt).getTime() : 0;
  const effectiveTime = Math.max(lastLoginTime, createdTime) || now;
  const inactiveDays = Math.floor((now - effectiveTime) / (24 * 60 * 60 * 1000));
  const effectiveLimit = isImmune ? 9999 : (newThreshold + newGraceDays);
  const daysRemaining = isImmune ? 9999 : Math.max(0, effectiveLimit - inactiveDays);

  return {
    success: true,
    userId,
    userEmail: userData.email,
    userName: userData.name,
    customInactivityDays: updates.customInactivityDays,
    neverPurge: isImmune,
    effectiveThreshold: effectiveLimit,
    inactivityDays: inactiveDays,
    daysRemaining: daysRemaining,
    scheduledPurgeDate: isImmune
      ? "Never (Protected)"
      : new Date(effectiveTime + effectiveLimit * 86400000).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
    message: isImmune
      ? `Student account granted Permanent Immunity (Never Purged).`
      : `Inactivity auto-purge threshold updated to ${effectiveLimit} days (${daysRemaining} days remaining).`,
  };
}

/**
 * Sweeper: Identifies students who have exceeded their inactivity threshold,
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

      // 🛡️ PERMANENT IMMUNITY SHIELD: Never purge master admin, full admin, or sub-admin accounts!
      if (
        email === MAIN_ADMIN_EMAIL ||
        ADMIN_ALIASES.includes(email) ||
        doc.id === "admin-root" ||
        doc.id === "admin" ||
        u.role === "admin" ||
        u.role === "half_admin" ||
        u.isAdmin === true
      ) {
        return;
      }

      // Check per-user Immunity Flag or Never Purge
      if (u.neverPurge === true || u.customInactivityDays >= 9999) {
        return;
      }

      // Determine user-specific threshold or global threshold
      const userThreshold =
        typeof u.customInactivityDays === "number" && u.customInactivityDays > 0
          ? u.customInactivityDays
          : defaultInactivityDays;
      const userGrace = typeof u.inactivityGraceDays === "number" ? u.inactivityGraceDays : 0;
      const effectiveThresholdDays = userThreshold + userGrace;
      const thresholdMs = effectiveThresholdDays * 24 * 60 * 60 * 1000;

      // Determine last active timestamp
      const lastLoginTime = u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0;
      const createdTime = u.createdAt ? new Date(u.createdAt).getTime() : 0;
      const effectiveTime = Math.max(lastLoginTime, createdTime);

      if (effectiveTime > 0 && now - effectiveTime > thresholdMs) {
        candidateDocs.push({
          docId: doc.id,
          userData: u,
          inactivityDays: Math.floor((now - effectiveTime) / (24 * 60 * 60 * 1000)),
          thresholdDays: effectiveThresholdDays,
        });
      }
    });

    console.log(`[ACCOUNT PURGE] Found ${candidateDocs.length} inactive student accounts exceeding threshold (global default: ${defaultInactivityDays} days).`);

    const { cascadeDeleteUserAccount } = require("./userCascadeDeletionService");

    for (const candidate of candidateDocs) {
      const { docId, userData, inactivityDays, thresholdDays } = candidate;
      const email = (userData.email || "").toLowerCase().trim();

      try {
        const cascadeResult = await cascadeDeleteUserAccount({
          userId: docId,
          targetUser: userData,
          isAutoPurge: true,
          inactivityDays,
          thresholdDays,
          reason: `Auto-purged: ${inactivityDays} days account inactivity (>${thresholdDays} days limit)`,
        });

        purgedUsers.push({
          id: docId,
          email: email,
          name: userData.name,
          inactivityDays,
          thresholdDays,
          uploadedNotesCount: cascadeResult.summary?.uploadedNotesCount || 0,
          tursoRowsDeleted: cascadeResult.summary?.tursoRowsDeleted || 0,
        });

        console.log(`[ACCOUNT PURGE] Successfully purged & cascaded inactive user: ${email} (${inactivityDays}d inactive, limit: ${thresholdDays}d).`);
      } catch (purgeErr) {
        console.error(`[ACCOUNT PURGE] Error cascading inactive account ${email}:`, purgeErr.message);
      }
    }

    return {
      success: true,
      purgedCount: purgedUsers.length,
      purgedUsers,
      defaultInactivityDays,
      message: `Completed inactivity check (${defaultInactivityDays}-day standard). Safely purged ${purgedUsers.length} inactive student accounts.`,
    };
  } catch (err) {
    console.error("[ACCOUNT PURGE] Sweeper error:", err);
    return { success: false, message: err.message, purgedCount: 0 };
  }
}

module.exports = {
  purgeInactiveAccounts,
  getDefaultInactivityDays,
  setDefaultInactivityDays,
  adjustUserInactivity,
  get INACTIVITY_DAYS() {
    return defaultInactivityDays;
  },
};
