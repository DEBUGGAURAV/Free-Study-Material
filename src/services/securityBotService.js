/**
 * Dedicated Security & Authentication Telegram Bot Engine (@fsm_security_otp_bot)
 * Handles:
 * 1. Instant Registration Passcode generation & delivery
 * 2. Automatic Telegram ID / Name capture: User Name (${inputName} (${tgName}))
 * 3. 2-Step Password Recovery: Verifies Mobile Number first, then verifies Email address
 * 4. Zero Brevo Email consumption (protects monthly transactional quota)
 */

const crypto = require("crypto");
const { db } = require("../firebase");
const { blindIndex, decryptUserObject } = require("../utils/cryptoVault");

const botToken = (process.env.TELEGRAM_OTP_BOT_TOKEN || "").trim();
const BOT_USERNAME = "fsm_security_otp_bot";

// Shared In-Memory Stores
// Key: regToken or mobile or email
const pendingRegistrations = new Map();

// Key: resetToken or mobile or email
const pendingPasswordResets = new Map();

// Key: Telegram chat_id -> { action, mobile, email, expiresAt }
const userBotStates = new Map();


// Runtime Security Bot Controls (Single Document Commit Pattern to prevent database bloat)
let botSettings = {
  enableOtp: true,             // Deliver OTP via bot
  enableRegisterNotice: true,  // 🟢 Alert on new student registration
  enableLoginNotice: true,     // 🔐 Alert on student login
  enableLogoutNotice: true,    // 🚪 Alert on student logout
  enableSecurityNotice: true,  // 🚨 Alert on profile updates & security events
  enableOtpAuditNotice: true,  // 🔑 Alert on OTP dispatches (Audit only)
  enableUserOtpNotice: true,   // 🔑 Real-time Live OTP Passcode Feed for Admin manual assistance
  enableNoteUploadNotice: true,    // 📤 Alert on note upload (notice only, zero PDF file sent)
  enableNoteDownloadNotice: true,  // 📥 Alert on note download (full student & note details)
  enableAccountPurgeNotice: true,  // 🗑️ Alert on 90-day inactive account auto-purge
  topicGroupChatId: process.env.TELEGRAM_TOPIC_GROUP_ID || "",        // Supergroup chat ID (e.g. -100...)
  topics: {
    newRegistration: process.env.TELEGRAM_TOPIC_REGISTRATION || "2",       // 🟢 Topic ID for New Registrations
    logins: process.env.TELEGRAM_TOPIC_LOGIN || "3",                // 🔐 Topic ID for Logins
    logouts: process.env.TELEGRAM_TOPIC_LOGOUT || "5",               // 🚪 Topic ID for Logouts
    securityUpdates: process.env.TELEGRAM_TOPIC_SECURITY || "6",       // 🚨 Topic ID for Security & Profile Updates
    otpAudit: process.env.TELEGRAM_TOPIC_OTP_AUDIT || "7",              // 🔑 Topic ID for OTP Audit Logs
    notesActivity: process.env.TELEGRAM_TOPIC_NOTES || "8",         // 📚 Topic ID for Notes Activity (Uploads)
    downloadManager: process.env.TELEGRAM_TOPIC_DOWNLOAD_MANAGER || "8", // 📥 Topic ID for Notes Downloads (https://t.me/c/3943130538/8)
    userOtp: process.env.TELEGRAM_TOPIC_USER_OTP || "55",               // 🔑 Topic ID for Live Student OTP Feed
    accountPurge: process.env.TELEGRAM_TOPIC_PURGE || "59",          // 🗑️ Topic ID for 90-Day Inactive Account Purges
  },
  updatedAt: new Date().toISOString(),
};

function getBotSettings() {
  return { ...botSettings };
}

async function updateBotSettings(newSettings) {
  botSettings = {
    ...botSettings,
    ...newSettings,
    topics: {
      ...botSettings.topics,
      ...(newSettings.topics || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  // Commit to a single document in Firestore to prevent database bloat!
  if (db) {
    try {
      await db.collection("settings").doc("security_bot").set(botSettings, { merge: true });
      console.log("[SECURITY BOT] Settings committed to database doc settings/security_bot:", botSettings);
    } catch (err) {
      console.warn("[SECURITY BOT] Failed to commit settings to database:", err.message);
    }
  }

  return botSettings;
}

async function loadBotSettings() {
  if (!db) return botSettings;
  try {
    const doc = await db.collection("settings").doc("security_bot").get();
    if (doc.exists) {
      const data = doc.data();
      botSettings = {
        enableOtp: typeof data.enableOtp === "boolean" ? data.enableOtp : true,
        enableRegisterNotice: typeof data.enableRegisterNotice === "boolean" ? data.enableRegisterNotice : true,
        enableLoginNotice: typeof data.enableLoginNotice === "boolean" ? data.enableLoginNotice : true,
        enableLogoutNotice: typeof data.enableLogoutNotice === "boolean" ? data.enableLogoutNotice : true,
        enableSecurityNotice: typeof data.enableSecurityNotice === "boolean" ? data.enableSecurityNotice : true,
        enableOtpAuditNotice: typeof data.enableOtpAuditNotice === "boolean" ? data.enableOtpAuditNotice : true,
        enableUserOtpNotice: typeof data.enableUserOtpNotice === "boolean" ? data.enableUserOtpNotice : true,
        enableNoteUploadNotice: typeof data.enableNoteUploadNotice === "boolean" ? data.enableNoteUploadNotice : true,
        enableNoteDownloadNotice: typeof data.enableNoteDownloadNotice === "boolean" ? data.enableNoteDownloadNotice : true,
        enableAccountPurgeNotice: typeof data.enableAccountPurgeNotice === "boolean" ? data.enableAccountPurgeNotice : true,
        topicGroupChatId: data.topicGroupChatId || "",
        topics: {
          newRegistration: data.topics?.newRegistration || "",
          logins: data.topics?.logins || "",
          logouts: data.topics?.logouts || "",
          securityUpdates: data.topics?.securityUpdates || "",
          otpAudit: data.topics?.otpAudit || "",
          notesActivity: data.topics?.notesActivity || "",
          userOtp: data.topics?.userOtp || "",
          accountPurge: data.topics?.accountPurge || "",
        },
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
      console.log("[SECURITY BOT] Loaded settings from database doc settings/security_bot:", botSettings);
    } else {
      await db.collection("settings").doc("security_bot").set(botSettings, { merge: true });
    }
  } catch (err) {
    console.warn("[SECURITY BOT] Settings load fallback to in-memory:", err.message);
  }
  return botSettings;
}

/**
 * Helper to extract all possible search keys from any string or object
 */
function extractCandidateKeys(input) {
  const keys = new Set();
  if (!input) return [];

  const addKey = (val) => {
    if (!val || typeof val !== "string") return;
    const trimmed = val.trim();
    if (!trimmed) return;
    keys.add(trimmed);
    keys.add(trimmed.toLowerCase());
    const digits = trimmed.replace(/\D/g, "").slice(-10);
    if (digits && digits.length >= 10) {
      keys.add(digits);
      keys.add(`+91${digits}`);
      keys.add(`91${digits}`);
    }
    if (trimmed.startsWith("reg_")) {
      keys.add(trimmed.replace(/^reg_/, ""));
    }
    if (trimmed.startsWith("reset_")) {
      keys.add(trimmed.replace(/^reset_/, ""));
    }
  };

  if (typeof input === "string") {
    addKey(input);
  } else if (typeof input === "number") {
    addKey(String(input));
  } else if (typeof input === "object") {
    const { regToken, resetToken, mobile, email, key, identifier, digits } = input;
    [regToken, resetToken, key, identifier, digits].forEach(addKey);
    if (mobile) addKey(String(mobile));
    if (email) addKey(String(email));
  }

  return Array.from(keys);
}

/**
 * Strips undefined properties recursively so Firestore writes never fail
 */
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) {
      clean[k] = null;
    } else {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}

/**
 * Stores a registration record in RAM Map under all aliases
 */
function storeRegistrationInRam(record) {
  if (!record) return;
  const cleanMobile = String(record.mobile || "").trim();
  const cleanEmail = String(record.email || "").trim().toLowerCase();
  const digits = cleanMobile.replace(/\D/g, "").slice(-10);

  if (record.regToken) pendingRegistrations.set(record.regToken, record);
  if (cleanMobile) pendingRegistrations.set(cleanMobile, record);
  if (digits) pendingRegistrations.set(digits, record);
  if (cleanEmail) pendingRegistrations.set(cleanEmail, record);
}

/**
 * Stores a password reset record in RAM Map under all aliases
 */
function storeResetInRam(record) {
  if (!record) return;
  const cleanMobile = String(record.mobile || "").trim();
  const cleanEmail = String(record.email || "").trim().toLowerCase();
  const digits = cleanMobile.replace(/\D/g, "").slice(-10);

  if (record.resetToken) pendingPasswordResets.set(record.resetToken, record);
  if (cleanMobile) pendingPasswordResets.set(cleanMobile, record);
  if (digits) pendingPasswordResets.set(digits, record);
  if (cleanEmail) pendingPasswordResets.set(cleanEmail, record);
}

/**
 * Retrieve record from in-memory Map using candidate keys
 */
function getPendingFromMemory(store, candidateKeys) {
  for (const k of candidateKeys) {
    const record = store.get(k);
    if (record) {
      if (Date.now() > record.expiresAt) {
        store.delete(k);
      } else {
        return record;
      }
    }
  }
  return null;
}

/**
 * Persist verification session to Firestore to survive server restarts / multi-process
 */
async function saveVerificationToFirestore(type, record) {
  if (!db || !record) return;
  try {
    const digits = String(record.mobile || "").replace(/\D/g, "").slice(-10);
    const token = record.regToken || record.resetToken || "";
    const cleanEmail = String(record.email || "").toLowerCase().trim();
    const docData = sanitizeForFirestore({
      type,
      token: token || null,
      mobile: record.mobile || null,
      digits: digits || null,
      email: cleanEmail || null,
      otp: String(record.otp || "").trim(),
      data: record,
      expiresAt: record.expiresAt || (Date.now() + 15 * 60 * 1000),
      createdAt: record.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    const batch = db.batch();
    if (digits && digits.length >= 10) {
      batch.set(db.collection("pending_verifications").doc(`${type}_digits_${digits}`), docData);
    }
    if (token) {
      batch.set(db.collection("pending_verifications").doc(`${type}_token_${token}`), docData);
      if (token.startsWith(`${type}_`)) {
        const rawToken = token.replace(`${type}_`, "");
        batch.set(db.collection("pending_verifications").doc(`${type}_token_${rawToken}`), docData);
      }
    }
    if (cleanEmail && cleanEmail.includes("@")) {
      const safeEmailKey = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
      batch.set(db.collection("pending_verifications").doc(`${type}_email_${safeEmailKey}`), docData);
    }
    await batch.commit();
  } catch (err) {
    console.warn(`[SECURITY-BOT] Failed to save ${type} verification to Firestore:`, err.message);
  }
}

/**
 * Retrieve verification record from Firestore if server restarted
 */
async function getVerificationFromFirestore(type, candidateKeys) {
  if (!db) return null;
  try {
    for (const k of candidateKeys) {
      const digits = k.replace(/\D/g, "").slice(-10);
      const safeEmailKey = k.replace(/[^a-zA-Z0-9]/g, "_");
      const docIds = [
        `${type}_token_${k}`,
        digits && digits.length >= 10 ? `${type}_digits_${digits}` : null,
        k.includes("@") ? `${type}_email_${safeEmailKey}` : null,
      ].filter(Boolean);

      for (const docId of docIds) {
        const snap = await db.collection("pending_verifications").doc(docId).get();
        if (snap.exists) {
          const doc = snap.data();
          if (doc && doc.expiresAt && Date.now() <= doc.expiresAt && doc.data) {
            return doc.data;
          }
        }
      }
    }

    // Secondary fallback: Query by digits in pending_verifications
    for (const k of candidateKeys) {
      const digits = k.replace(/\D/g, "").slice(-10);
      if (digits && digits.length >= 10) {
        const snap = await db.collection("pending_verifications")
          .where("type", "==", type)
          .where("digits", "==", digits)
          .limit(1)
          .get();
        if (!snap.empty) {
          const doc = snap.docs[0].data();
          if (doc && doc.expiresAt && Date.now() <= doc.expiresAt && doc.data) {
            return doc.data;
          }
        }
      }
      if (k && (k.startsWith("reg_") || k.startsWith("reset_"))) {
        const snap = await db.collection("pending_verifications")
          .where("type", "==", type)
          .where("token", "==", k)
          .limit(1)
          .get();
        if (!snap.empty) {
          const doc = snap.docs[0].data();
          if (doc && doc.expiresAt && Date.now() <= doc.expiresAt && doc.data) {
            return doc.data;
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[SECURITY-BOT] Firestore ${type} verification lookup notice:`, err.message);
  }
  return null;
}

/**
 * Delete verification session on completion or expiry
 */
async function deleteVerificationRecord(type, record) {
  if (!record) return;
  const store = type === "reg" ? pendingRegistrations : pendingPasswordResets;
  const token = record.regToken || record.resetToken;
  const cleanMobile = (record.mobile || "").trim();
  const digits = cleanMobile.replace(/\D/g, "").slice(-10);
  const cleanEmail = (record.email || "").toLowerCase().trim();

  if (token) store.delete(token);
  if (cleanMobile) store.delete(cleanMobile);
  if (digits) store.delete(digits);
  if (cleanEmail) store.delete(cleanEmail);

  if (!db) return;
  try {
    const batch = db.batch();
    if (digits) batch.delete(db.collection("pending_verifications").doc(`${type}_digits_${digits}`));
    if (token) batch.delete(db.collection("pending_verifications").doc(`${type}_token_${token}`));
    if (cleanEmail) {
      const safeEmailKey = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
      batch.delete(db.collection("pending_verifications").doc(`${type}_email_${safeEmailKey}`));
    }
    await batch.commit().catch(() => {});
  } catch {}
}

/**
 * Creates or updates a pending registration session
 */
async function createPendingRegistration({ name, mobile, email, college, year, password }) {
  if (!botSettings.enableOtp) {
    throw new Error("Telegram Bot OTP verification is currently disabled by administrator. Please use Email OTP or Google Sign-In.");
  }
  const cleanMobile = String(mobile || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const digits = cleanMobile.replace(/\D/g, "").slice(-10);
  const candidateKeys = extractCandidateKeys({ mobile: cleanMobile, email: cleanEmail });

  // Check RAM and Firestore for unexpired session
  let existingReg = getPendingFromMemory(pendingRegistrations, candidateKeys);
  if (!existingReg) {
    existingReg = await getVerificationFromFirestore("reg", candidateKeys);
  }

  // Preserve existing unexpired OTP and token so multiple triggers keep the exact same OTP
  const otp = (existingReg && Date.now() < existingReg.expiresAt && existingReg.otp)
    ? existingReg.otp
    : crypto.randomInt(100000, 999999).toString();

  const regToken = existingReg?.regToken || ("reg_" + crypto.randomBytes(6).toString("hex"));

  const record = {
    regToken,
    name: (name || existingReg?.name || "Scholar").trim(),
    mobile: cleanMobile || (digits ? `+91${digits}` : ""),
    email: cleanEmail || existingReg?.email || "",
    college: (college || existingReg?.college || "Academic Institute").trim(),
    year: (year || existingReg?.year || "1st Year").trim(),
    password: password || existingReg?.password || "",
    otp,
    tgName: existingReg?.tgName || null,
    tgChatId: existingReg?.tgChatId || null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins validity
    attempts: 0,
    phoneVerified: false,
    verified: false,
  };

  storeRegistrationInRam(record);
  await saveVerificationToFirestore("reg", record);

  return { regToken, otp, botUsername: BOT_USERNAME, botLink: `https://t.me/${BOT_USERNAME}?start=${regToken}` };
}

async function getPendingRegistration(keyOrObj) {
  if (!keyOrObj) return null;
  const candidateKeys = extractCandidateKeys(keyOrObj);
  let record = getPendingFromMemory(pendingRegistrations, candidateKeys);
  if (!record) {
    record = await getVerificationFromFirestore("reg", candidateKeys);
    if (record) {
      storeRegistrationInRam(record);
    }
  }
  return record;
}

async function verifyRegistrationOtp(keyOrObj, inputOtp) {
  const record = await getPendingRegistration(keyOrObj);
  if (!record) {
    return { valid: false, message: "No active registration request found or session expired. Please try again." };
  }
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 6) {
    await deleteVerificationRecord("reg", record);
    return { valid: false, message: "Too many incorrect attempts. Please initiate a new verification." };
  }

  const cleanInput = String(inputOtp || "").replace(/\D/g, "");
  const cleanStored = String(record.otp || "").replace(/\D/g, "");

  if (cleanInput.length !== 6 || cleanInput !== cleanStored) {
    return { valid: false, message: "Invalid 6-digit OTP code. Please check your Telegram chat." };
  }

  record.verified = true;
  await deleteVerificationRecord("reg", record);

  return { valid: true, data: record };
}

/**
 * Creates or updates a pending password reset session
 */
async function createPendingReset({ mobile, email, userId, userName, college }) {
  if (!botSettings.enableOtp) {
    throw new Error("Telegram Bot OTP verification is currently disabled by administrator. Please use Email OTP recovery.");
  }
  const cleanMobile = String(mobile || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const digits = cleanMobile.replace(/\D/g, "").slice(-10);
  const candidateKeys = extractCandidateKeys({ mobile: cleanMobile, email: cleanEmail });

  let existingRecord = getPendingFromMemory(pendingPasswordResets, candidateKeys);
  if (!existingRecord) {
    existingRecord = await getVerificationFromFirestore("reset", candidateKeys);
  }

  const otp = (existingRecord && Date.now() < existingRecord.expiresAt && existingRecord.otp)
    ? existingRecord.otp
    : crypto.randomInt(100000, 999999).toString();

  const resetToken = existingRecord?.resetToken || ("reset_" + crypto.randomBytes(6).toString("hex"));

  const record = {
    resetToken,
    mobile: cleanMobile || (digits ? `+91${digits}` : ""),
    email: cleanEmail || existingRecord?.email || "",
    userId: userId || existingRecord?.userId || null,
    userName: (userName || existingRecord?.userName || "Scholar").trim(),
    college: college && college !== "Academic Institute" ? college : (existingRecord?.college || ""),
    otp,
    tgChatId: existingRecord?.tgChatId || null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0,
    phoneVerified: false,
    verified: false,
    botUsername: BOT_USERNAME,
    botLink: `https://t.me/${BOT_USERNAME}?start=${resetToken}`,
  };

  storeResetInRam(record);
  await saveVerificationToFirestore("reset", record);

  return record;
}

async function getPendingReset(keyOrObj) {
  if (!keyOrObj) return null;
  const candidateKeys = extractCandidateKeys(keyOrObj);
  let record = getPendingFromMemory(pendingPasswordResets, candidateKeys);
  if (!record) {
    record = await getVerificationFromFirestore("reset", candidateKeys);
    if (record) {
      storeResetInRam(record);
    }
  }
  return record;
}

async function verifyResetOtp(keyOrObj, inputOtp) {
  const record = await getPendingReset(keyOrObj);
  if (!record) {
    return { valid: false, message: "No active password recovery request found or code expired." };
  }
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 6) {
    await deleteVerificationRecord("reset", record);
    return { valid: false, message: "Too many incorrect attempts. Please request a new recovery code." };
  }

  const cleanInput = String(inputOtp || "").replace(/\D/g, "");
  const cleanStored = String(record.otp || "").replace(/\D/g, "");

  if (cleanInput.length !== 6 || cleanInput !== cleanStored) {
    return { valid: false, message: "Invalid 6-digit recovery code. Please check your Telegram chat." };
  }

  record.verified = true;
  await deleteVerificationRecord("reset", record);

  return { valid: true, data: record };
}

/**
 * Sends a Telegram Message to any user chat
 */
async function sendTelegramDirect(chatId, text, replyMarkup = null) {
  if (!botToken || !chatId) return null;
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000),
    });
    return await res.json().catch(() => null);
  } catch (err) {
    console.warn("[SECURITY-BOT] Message send warning:", err.message);
    return null;
  }
}

/**
 * Dispatches Registration Passcode to user's Telegram chat
 */
async function dispatchRegistrationOtp(chatId, record, tgUser = {}) {
  const userObj = tgUser || {};
  const tgFullName = [userObj.first_name, userObj.last_name].filter(Boolean).join(" ");
  const tgUsername = userObj.username ? `@${userObj.username}` : "";
  const tgDisplayName = tgFullName && tgUsername
    ? `${tgFullName} / ${tgUsername}`
    : (tgFullName || tgUsername || (userObj.id ? `User_${userObj.id}` : "Verified Student"));

  record.tgName = tgDisplayName;
  record.tgChatId = chatId;
  record.tgDetails = {
    id: userObj.id || null,
    firstName: userObj.first_name || "",
    lastName: userObj.last_name || "",
    username: tgUsername,
    fullName: tgFullName,
    displayName: tgDisplayName,
  };
  record.phoneVerified = true;
  record.verified = true;
  record.verifiedAt = Date.now();

  storeRegistrationInRam(record);
  await saveVerificationToFirestore("reg", record);

  userBotStates.set(chatId, {
    action: "otp_dispatched_reg",
    regRecord: record,
    lastInteraction: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  const studentName = record.name || "Scholar";
  const combinedName = tgDisplayName && !studentName.includes(`(${tgDisplayName})`)
    ? `${studentName} (${tgDisplayName})`
    : studentName;

  const displayMobile = record.mobile || "Verified Telegram Number";
  const displayEmail = record.email || "Pending Website Confirmation";
  const displayCollege = record.college && record.college !== "Academic Institute" ? record.college : "";
  const displayYear = record.year || "1st Year";

  const message = `🎓 <b>Free Study Material — Student Registration Passcode</b>\n\n` +
    `👤 <b>Student Name:</b> <code>${combinedName}</code>\n` +
    `📱 <b>Mobile Number:</b> <code>${displayMobile}</code>\n` +
    (record.email ? `📧 <b>Email Address:</b> <code>${displayEmail}</code>\n` : "") +
    (displayCollege ? `🏛️ <b>College:</b> <code>${displayCollege}</code>\n` : "") +
    (displayYear ? `📚 <b>Academic Year:</b> <code>${displayYear}</code>\n\n` : "\n") +
    `🔑 <b>Your 6-Digit Verification Code:</b>\n` +
    `👉 <pre style="font-size: 26px; font-weight: bold; letter-spacing: 2px;">${record.otp}</pre>\n\n` +
    `⏱️ <b>Validity:</b> 15 Minutes\n` +
    `🛡️ <i>Enter this 6-digit code in the registration form on our website to verify your mobile and activate your account.</i>\n` +
    `⚡ <i>Delivered securely via Telegram Security Bot Core (Zero Email Quota Used).</i>`;

  const restartKeyboard = {
    keyboard: [
      [{ text: "🔄 Restart Bot" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };

  await sendTelegramDirect(chatId, message, restartKeyboard);

  try {
    const { sendTelegramAuthNotice } = require("./emailService");
    // 1. Audit Log to Supergroup
    sendTelegramAuthNotice({
      event: "OTP_AUDIT",
      user: {
        name: combinedName,
        mobile: record.mobile,
        email: record.email || "",
        college: record.college || "",
        year: record.year || "",
      },
      method: "Telegram Bot DM",
      detail: "Student Registration Verification Passcode",
    }).catch(() => {});

    // 2. Real-time Live OTP Passcode Feed to dedicated topic for manual student sharing
    sendTelegramAuthNotice({
      event: "USER_OTP",
      user: {
        name: combinedName,
        mobile: record.mobile,
        email: record.email || "",
        college: record.college || "",
        year: record.year || "",
      },
      otp: record.otp,
      method: "Telegram Bot DM",
      detail: "Student Registration Passcode",
    }).catch(() => {});
  } catch {}
}

/**
 * Dispatches Password Reset Passcode to user's Telegram chat
 */
async function dispatchPasswordResetOtp(chatId, record) {
  if (!record) return;
  record.tgChatId = chatId;
  record.phoneVerified = true;
  record.verified = true;
  record.verifiedAt = Date.now();
  storeResetInRam(record);
  saveVerificationToFirestore("reset", record).catch(() => {});

  userBotStates.set(chatId, {
    lastInteraction: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const displayName = record.userName || record.name || "Scholar";
  const displayMobile = record.mobile || "N/A";
  const displayEmail = record.email || "N/A";
  const displayOtp = record.otp || "";
  const displayCollege = record.college && record.college !== "Academic Institute" ? record.college : "";

  const message = `✅ <b>Email Address Verified Successfully!</b>\n\n` +
    `🔑 <b>Free Study Material — Password Recovery Passcode</b>\n\n` +
    `👤 <b>Account Holder:</b> <code>${displayName}</code>\n` +
    `📱 <b>Registered Mobile:</b> <code>${displayMobile}</code>\n` +
    `📧 <b>Registered Email:</b> <code>${displayEmail}</code>\n` +
    (displayCollege ? `🏛️ <b>College:</b> <code>${displayCollege}</code>\n\n` : "\n") +
    `🔐 <b>Your 6-Digit Password Reset Code:</b>\n` +
    `👉 <pre style="font-size: 24px;">${displayOtp}</pre>\n\n` +
    `⏱️ <b>Validity:</b> 10 Minutes\n` +
    `🛡️ <i>Enter this code and your new password on the website to update your credentials safely.</i>\n` +
    `⚡ <i>Delivered securely via Telegram Security Bot Core (Zero Email Quota Used).</i>`;

  const resetRestartKeyboard = {
    keyboard: [
      [{ text: "🔄 Restart Bot" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };

  await sendTelegramDirect(chatId, message, resetRestartKeyboard);

  try {
    const { sendTelegramAuthNotice } = require("./emailService");
    // 1. Audit Log to Supergroup
    sendTelegramAuthNotice({
      event: "OTP_AUDIT",
      user: {
        name: displayName,
        mobile: displayMobile,
        email: displayEmail,
        college: displayCollege,
      },
      method: "Telegram Bot DM",
      detail: "Password Recovery Verification Passcode",
    }).catch(() => {});

    // 2. Real-time Live OTP Passcode Feed to dedicated 7th topic for manual student sharing
    sendTelegramAuthNotice({
      event: "USER_OTP",
      user: {
        name: displayName,
        mobile: displayMobile,
        email: displayEmail,
        college: displayCollege,
      },
      otp: displayOtp,
      method: "Telegram Bot DM",
      detail: "Password Reset Passcode",
    }).catch(() => {});
  } catch {}
}

let isSecurityPollerActive = false;
let securityPollerOffset = 0;

// Proactive 15-minute inactivity session memory cleanup (silent without user notification)
setInterval(() => {
  const now = Date.now();
  for (const [chatId, state] of userBotStates.entries()) {
    if (state && state.expiresAt && now > state.expiresAt) {
      userBotStates.delete(chatId);
    }
  }
}, 60 * 1000);

/**
 * Main Long-Polling Worker for @fsm_security_otp_bot
 */
async function startSecurityBotPoller() {
  if (isSecurityPollerActive || !botToken) return;
  isSecurityPollerActive = true;
  console.log(`[SECURITY BOT] 🚀 Dedicated Auth Bot Poller started for @${BOT_USERNAME}`);

  while (isSecurityPollerActive) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${securityPollerOffset}&timeout=8`, {
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      for (const update of data.result) {
        securityPollerOffset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.from) continue;

        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();
        const contact = msg.contact;
        const user = msg.from;

        // Auto-detect when a new Topic is created or edited directly in Telegram Supergroup!
        if (msg.forum_topic_created) {
          const rawName = msg.forum_topic_created.name || "";
          const cleanName = rawName.replace(/^[📚📖📁📌\s]+/, "").trim();
          const threadId = msg.message_thread_id;
          if (cleanName && threadId) {
            const normalizedKey = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);
            console.log(`[TOPIC SYNC] Detected newly created topic in Telegram: "${cleanName}" (Thread ID: ${threadId})`);
            if (db) {
              await db.collection("subject_forum_topics").doc(normalizedKey).set({
                subject: cleanName,
                normalizedKey,
                threadId: threadId,
                name: rawName,
                chatId: String(msg.chat.id),
                createdAt: new Date().toISOString(),
              }, { merge: true }).catch(() => {});
            }
          }
        } else if (msg.forum_topic_edited && msg.forum_topic_edited.name) {
          const rawName = msg.forum_topic_edited.name || "";
          const cleanName = rawName.replace(/^[📚📖📁📌\s]+/, "").trim();
          const threadId = msg.message_thread_id;
          if (cleanName && threadId && db) {
            const normalizedKey = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);
            await db.collection("subject_forum_topics").doc(normalizedKey).set({
              subject: cleanName,
              normalizedKey,
              threadId: threadId,
              name: rawName,
              chatId: String(msg.chat.id),
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          }
        }

        // Inactivity timeout cleanup on incoming user interaction (silently reset without jarring blocker)
        const activeState = userBotStates.get(chatId);
        if (activeState && activeState.expiresAt && Date.now() > activeState.expiresAt) {
          userBotStates.delete(chatId);
        }

        // Refresh user interaction activity timer on incoming message
        userBotStates.set(chatId, {
          ...(activeState || {}),
          lastInteraction: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1000,
        });

        // Check if admin paused OTP delivery
        if (!botSettings.enableOtp && (text.startsWith("/start reg_") || text.startsWith("/start reset_") || /^\d{10}$/.test(text.replace(/[\s-]/g, "")) || (text.includes("@") && text !== "/start"))) {
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Service Notice</b>\n\nTelegram Bot OTP verification is currently paused by administrator. Please use <b>Email OTP</b> or <b>Continue with Google</b> on the web portal.`
          );
          continue;
        }

        // 1. Check for /start with payload (e.g. /start reg_123 or /start reset_123)
        if (text.startsWith("/start")) {
          const parts = text.split(" ");
          const param = parts[1] ? parts[1].trim() : "";

          if (param.startsWith("reg_")) {
            const regRecord = await getPendingRegistration(param);
            if (regRecord) {
              userBotStates.set(chatId, {
                action: "waiting_verified_contact_reg",
                regRecord,
                lastInteraction: Date.now(),
                expiresAt: Date.now() + 15 * 60 * 1000,
              });

              const contactKeyboard = {
                keyboard: [
                  [{ text: "📲 Verify & Share My Telegram Number", request_contact: true }],
                  [{ text: "🔄 Restart Bot" }],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              };

              await sendTelegramDirect(
                chatId,
                `🎓 <b>Student Registration Details (Form Filled Data)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 <b>Student Name:</b> <code>${regRecord.name}</code>\n` +
                  `📧 <b>Gmail Address:</b> <code>${regRecord.email}</code>\n` +
                  `📱 <b>Mobile Number:</b> <code>${regRecord.mobile}</code>\n` +
                  (regRecord.college ? `🏛️ <b>College / University:</b> <code>${regRecord.college}</code>\n` : "") +
                  (regRecord.year ? `📚 <b>Academic Year:</b> <code>${regRecord.year}</code>\n` : "") +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛡️ <b>Step 1: Mobile Ownership Verification</b>\n` +
                  `To verify that you own mobile number <code>${regRecord.mobile}</code> and receive your 6-digit registration OTP, please tap the button below:`,
                contactKeyboard
              );
              continue;
            } else {
              userBotStates.delete(chatId);
              await sendTelegramDirect(
                chatId,
                `⚠️ <b>Registration Session Expired or Invalid</b>\n\n` +
                  `Aapka website registration session expire ho chuka hai ya link invalid hai.\n` +
                  `Kripya pehle website par jayein, form fill karein, aur naye link par click karein.\n\n` +
                  `🌐 <a href="https://freestudymaterial.com">freestudymaterial.com</a>`,
                { remove_keyboard: true }
              );
              continue;
            }
          }

          if (param.startsWith("reset_")) {
            const resetRecord = await getPendingReset(param);
            if (resetRecord) {
              userBotStates.set(chatId, {
                action: "waiting_verified_contact_reset",
                resetRecord,
                lastInteraction: Date.now(),
                expiresAt: Date.now() + 15 * 60 * 1000,
              });

              const contactKeyboard = {
                keyboard: [
                  [{ text: "📲 Verify & Share My Telegram Number", request_contact: true }],
                  [{ text: "🔄 Restart Bot" }],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              };

              await sendTelegramDirect(
                chatId,
                `🔑 <b>Password Reset Details (Form Filled Data)</b>\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `👤 <b>Account Holder:</b> <code>${resetRecord.userName || "Scholar"}</code>\n` +
                  `📧 <b>Registered Email:</b> <code>${resetRecord.email}</code>\n` +
                  `📱 <b>Registered Mobile:</b> <code>${resetRecord.mobile}</code>\n` +
                  (resetRecord.college ? `🏛️ <b>College:</b> <code>${resetRecord.college}</code>\n` : "") +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛡️ <b>Step 1: Mobile Ownership Verification</b>\n` +
                  `To verify that you own mobile number <code>${resetRecord.mobile}</code> and receive your 6-digit password reset OTP, please tap the button below:`,
                contactKeyboard
              );
              continue;
            } else {
              userBotStates.delete(chatId);
              await sendTelegramDirect(
                chatId,
                `⚠️ <b>Password Reset Session Expired or Invalid</b>\n\n` +
                  `Aapka password reset session expire ho chuka hai ya link invalid hai.\n` +
                  `Kripya pehle website par jayein, Forgot Password form bharein, aur naye link par click karein.\n\n` +
                  `🌐 <a href="https://freestudymaterial.com">freestudymaterial.com</a>`,
                { remove_keyboard: true }
              );
              continue;
            }
          }

          // 3. Plain /start (User opened bot directly without form token):
          userBotStates.delete(chatId);
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n\n` +
              `Aapne abhi tak website par <b>Student Registration</b> ya <b>Forgot Password</b> form fill nahi kiya hai.\n\n` +
              `🛡️ <b>Security Policy:</b>\n` +
              `Direct Telegram se bina website form bhare OTP generate nahi kiya ja sakta.\n\n` +
              `👉 <b>Aapko kya karna hai:</b>\n` +
              `1️⃣ Website open karein: <a href="https://freestudymaterial.com">freestudymaterial.com</a>\n` +
              `2️⃣ <b>Registration</b> ya <b>Forgot Password</b> form bharein.\n` +
              `3️⃣ Form bharne ke baad wahan <b>"Verify via Telegram"</b> button par click karein.\n\n` +
              `Form bhar kar aane par bot automatically aapka data show karega aur mobile verify hote hi OTP deliver karega!`,
            { remove_keyboard: true }
          );
          continue;
        }

        // Reject plain commands like /register, /forgot, /reset, "1", "2" if user didn't fill form
        if (
          text === "1" ||
          text === "1️⃣" ||
          text === "1️⃣ Student Registration" ||
          text === "2" ||
          text === "2️⃣" ||
          text === "2️⃣ Forgot Password" ||
          text === "/register" ||
          text === "/forgot" ||
          text === "/reset"
        ) {
          userBotStates.delete(chatId);
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n\n` +
              `Direct Telegram se OTP generate nahi kiya ja sakta.\n\n` +
              `Kripya pehle <a href="https://freestudymaterial.com">freestudymaterial.com</a> par ja kar form bharein, aur wahan diye gaye link se aayein!`,
            { remove_keyboard: true }
          );
          continue;
        }

        // 3. Restart Bot / Help / Main Menu return
        if (
          text === "🔙 Main Menu" ||
          text.toLowerCase() === "menu" ||
          text === "🔄 Restart Bot" ||
          text.toLowerCase() === "restart" ||
          text.toLowerCase() === "restart bot" ||
          text === "/restart" ||
          text === "/help"
        ) {
          userBotStates.delete(chatId);
          await sendTelegramDirect(
            chatId,
            `👋 <b>Free Study Material Security Verification Bot</b>\n\n` +
              `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n` +
              `Direct Telegram se bina website form bhare OTP generate nahi kiya ja sakta.\n\n` +
              `👉 <b>Steps:</b>\n` +
              `1️⃣ Pehle website open karein: <a href="https://freestudymaterial.com">freestudymaterial.com</a>\n` +
              `2️⃣ <b>Registration</b> ya <b>Forgot Password</b> form bharein.\n` +
              `3️⃣ Wahan diye gaye <b>"Verify via Telegram"</b> button par click karein.\n\n` +
              `Form submit hone par bot automatically aapka bhara hua data show karega aur phone verify hote hi OTP generate karega!`,
            { remove_keyboard: true }
          );
          continue;
        }

        const currentState = userBotStates.get(chatId);

        // 3. User shared native verified contact (Cryptographically guaranteed by Telegram):
        if (contact && contact.phone_number) {
          // Cryptographic check: must be sender's own contact
          if (contact.user_id && contact.user_id !== user.id) {
            await sendTelegramDirect(
              chatId,
              `⚠️ <b>Security Alert:</b> Sharing forwarded or another user's contact is not permitted. Please share your own verified contact.`
            );
            continue;
          }

          const verifiedTgMobile = contact.phone_number.replace(/\D/g, "").slice(-10);

          // Case A: User was in registration verification flow
          if (currentState && currentState.action === "waiting_verified_contact_reg" && currentState.regRecord) {
            const formMobile = currentState.regRecord.mobile.replace(/\D/g, "").slice(-10);

            // STRICT VALIDATION MATCH: Form Mobile Number === Telegram Verified Contact
            if (verifiedTgMobile !== formMobile) {
              const restartKeyboard = {
                keyboard: [
                  [{ text: "🔄 Restart Bot" }],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              };
              await sendTelegramDirect(
                chatId,
                `❌ <b>Mobile Number Mismatch!</b>\n\n` +
                  `• <b>Website Form Mobile:</b> <code>${formMobile}</code>\n` +
                  `• <b>Telegram Verified Number:</b> <code>${verifiedTgMobile}</code>\n\n` +
                  `🛡️ <b>Security Rule:</b>\n` +
                  `You entered <code>${formMobile}</code> on the website, whereas your Telegram verified number is <code>${verifiedTgMobile}</code>.\n\n` +
                  `To protect against unauthorized access and account fraud, both phone numbers must match exactly.\n` +
                  `Please enter your registered number (<code>${verifiedTgMobile}</code>) on the website or tap <b>[ 🔄 Restart Bot ]</b> below.`,
                restartKeyboard
              );
              userBotStates.delete(chatId);
              continue;
            }

            // SUCCESS! Numbers match 100%! Single consolidated notification:
            await dispatchRegistrationOtp(chatId, currentState.regRecord, user);
            userBotStates.delete(chatId);
            continue;
          }

          // Case A2: User was in password reset verification flow (/start reset_...)
          if (currentState && currentState.action === "waiting_verified_contact_reset" && currentState.resetRecord) {
            const formMobile = currentState.resetRecord.mobile.replace(/\D/g, "").slice(-10);

            if (verifiedTgMobile !== formMobile) {
              await sendTelegramDirect(
                chatId,
                `❌ <b>Mobile Number Mismatch!</b>\n\n` +
                  `• <b>Account Registered Mobile:</b> <code>${formMobile}</code>\n` +
                  `• <b>Telegram Verified Number:</b> <code>${verifiedTgMobile}</code>\n\n` +
                  `Dono mobile numbers match nahi ho rahe hain. Kripya registered phone number se hi Telegram contact share karein.`,
                { remove_keyboard: true }
              );
              userBotStates.delete(chatId);
              continue;
            }

            // SUCCESS! Both Mobile & Email were already filled & verified on website form!
            // Directly dispatch OTP and mark session verified so website auto-fills it!
            await dispatchPasswordResetOtp(chatId, currentState.resetRecord);
            userBotStates.delete(chatId);
            continue;
          }

          // Case B: User directly shared contact without opening from website form link -> STRICTLY REJECT!
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n\n` +
              `Aapne website par Registration ya Forgot Password ka form fill nahi kiya hai.\n` +
              `Direct Telegram se bina website form bhare OTP generate nahi kiya ja sakta.\n\n` +
              `👉 <b>Kripya pehle website par jayein:</b>\n` +
              `1️⃣ Website open karein: <a href="https://freestudymaterial.com">freestudymaterial.com</a>\n` +
              `2️⃣ <b>Registration</b> ya <b>Forgot Password</b> form bharein.\n` +
              `3️⃣ Form bharne ke baad wahan <b>"Verify via Telegram"</b> button par tap karein.\n\n` +
              `Form bhar kar aane par bot automatically aapka data show karega aur mobile verify hote hi OTP deliver karega!`,
            { remove_keyboard: true }
          );
          userBotStates.delete(chatId);
          continue;
        }

        // 4. User sent a 10-digit Mobile Number via Plain Text:
        const digitsOnly = text.replace(/\D/g, "");
        if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
          const pendingReset = await getPendingReset(digitsOnly);
          const pendingReg = await getPendingRegistration(digitsOnly);

          if (pendingReset) {
            userBotStates.set(chatId, {
              action: "waiting_verified_contact_reset",
              resetRecord: pendingReset,
              lastInteraction: Date.now(),
              expiresAt: Date.now() + 10 * 60 * 1000,
            });
            const contactKeyboard = {
              keyboard: [
                [{ text: "📲 Verify & Share My Telegram Number", request_contact: true }],
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };
            await sendTelegramDirect(
              chatId,
              `🔑 <b>Password Reset Details (Form Filled Data)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 <b>Account Holder:</b> <code>${pendingReset.userName || "Scholar"}</code>\n` +
                `📧 <b>Registered Email:</b> <code>${pendingReset.email}</code>\n` +
                `📱 <b>Registered Mobile:</b> <code>${pendingReset.mobile}</code>\n` +
                (pendingReset.college ? `🏛️ <b>College:</b> <code>${pendingReset.college}</code>\n` : "") +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🛡️ <b>Step 1: Mobile Ownership Verification</b>\n` +
                `To verify that you own mobile number <code>${pendingReset.mobile}</code> and receive your 6-digit password reset OTP, please tap the button below:`,
              contactKeyboard
            );
            continue;
          }

          if (pendingReg) {
            userBotStates.set(chatId, {
              action: "waiting_verified_contact_reg",
              regRecord: pendingReg,
              lastInteraction: Date.now(),
              expiresAt: Date.now() + 10 * 60 * 1000,
            });
            const contactKeyboard = {
              keyboard: [
                [{ text: "📲 Verify & Share My Telegram Number", request_contact: true }],
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };
            await sendTelegramDirect(
              chatId,
              `🎓 <b>Student Registration Details (Form Filled Data)</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 <b>Student Name:</b> <code>${pendingReg.name}</code>\n` +
                `📧 <b>Gmail Address:</b> <code>${pendingReg.email}</code>\n` +
                `📱 <b>Mobile Number:</b> <code>${pendingReg.mobile}</code>\n` +
                (pendingReg.college ? `🏛️ <b>College / University:</b> <code>${pendingReg.college}</code>\n` : "") +
                (pendingReg.year ? `📚 <b>Academic Year:</b> <code>${pendingReg.year}</code>\n` : "") +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🛡️ <b>Step 1: Mobile Ownership Verification</b>\n` +
                `To verify that you own mobile number <code>${pendingReg.mobile}</code> and receive your 6-digit registration OTP, please tap the button below:`,
              contactKeyboard
            );
            continue;
          }

          // No active website session found for this mobile number:
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Website Session Not Found!</b>\n\n` +
              `Mobile number <code>${digitsOnly}</code> ke liye website par koi pending registration ya password reset session nahi mila.\n\n` +
              `👉 Kripya pehle <a href="https://freestudymaterial.com">freestudymaterial.com</a> par jayein aur form bharein!`,
            { remove_keyboard: true }
          );
          continue;
        }

        // 5. User sent an Email Address (contains @):
        if (text.includes("@")) {
          const cleanEmail = text.trim().toLowerCase();

          // A. If user was waiting for email in Forgot Password flow (contact already verified):
          if (currentState && currentState.action === "waiting_email_reset") {
            const expectedEmail = (
              currentState.resetRecord?.email ||
              currentState.userData?.email ||
              ""
            ).toLowerCase().trim();

            if (expectedEmail && cleanEmail === expectedEmail) {
              // Matches! Use existing pending reset record or generate one
              let resetRecord = currentState.resetRecord;
              if (!resetRecord) {
                resetRecord = await createPendingReset({
                  mobile: currentState.mobile,
                  email: expectedEmail,
                  userId: currentState.userId,
                  userName: currentState.userData?.name || "Scholar",
                  college: currentState.userData?.college || "Academic Institute",
                });
              }

              // Single consolidated message: dispatchPasswordResetOtp delivers verified badge + details + OTP
              await dispatchPasswordResetOtp(chatId, resetRecord);
              userBotStates.delete(chatId);
              continue;
            } else {
              const restartKeyboard = {
                keyboard: [
                  [{ text: "🔄 Restart Bot" }],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              };
              await sendTelegramDirect(
                chatId,
                `❌ <b>Email Address Mismatch!</b>\n\nThe email address you entered (<code>${cleanEmail}</code>) does not match the account registered with mobile number <code>${currentState.mobile}</code>.\n\nPlease type your correct registered email address, or tap <b>[ 🔄 Restart Bot ]</b> below.`,
                restartKeyboard
              );
              continue;
            }
          }

          // If not in waiting_email_reset, reject direct OTP generation
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n\n` +
              `Direct Telegram se bina form bhare OTP generate nahi kiya ja sakta.\n\n` +
              `👉 Kripya pehle <a href="https://freestudymaterial.com">freestudymaterial.com</a> par jayein aur Registration ya Forgot Password form bharein!`,
            { remove_keyboard: true }
          );
          continue;
        }


        // 6. If user is waiting for email but input didn't contain @
        if (currentState && currentState.action === "waiting_email_reset") {
          const restartKeyboard = {
            keyboard: [
              [{ text: "🔄 Restart Bot" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };
          await sendTelegramDirect(
            chatId,
            `⚠️ <b>Invalid Email Format</b>\n\nPlease enter your valid registered Email Address, or tap <b>[ 🔄 Restart Bot ]</b> to start over:`,
            restartKeyboard
          );
          continue;
        }

        // Fallback for direct / unhandled text messages
        await sendTelegramDirect(
          chatId,
          `⚠️ <b>Website Form Fill Karna Zaroori Hai!</b>\n\n` +
            `Direct Telegram se bina website form bhare OTP generate nahi kiya ja sakta.\n\n` +
            `👉 <b>Aapko kya karna hai:</b>\n` +
            `1️⃣ Website open karein: <a href="https://freestudymaterial.com">freestudymaterial.com</a>\n` +
            `2️⃣ <b>Registration</b> ya <b>Forgot Password</b> form bharein.\n` +
            `3️⃣ Form bharne ke baad wahan <b>"Verify via Telegram"</b> button par tap karein.\n\n` +
            `Form bhar kar aane par bot automatically aapka data show karega aur mobile verify hote hi OTP deliver karega!`,
          { remove_keyboard: true }
        );
      }
    } catch (pollErr) {
      // Handled silently to prevent crash on connection drop
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

module.exports = {
  createPendingRegistration,
  getPendingRegistration,
  verifyRegistrationOtp,
  createPendingReset,
  getPendingReset,
  verifyResetOtp,
  startSecurityBotPoller,
  BOT_USERNAME,
  getBotSettings,
  updateBotSettings,
  loadBotSettings,
  pendingRegistrations,
  pendingPasswordResets,
};

