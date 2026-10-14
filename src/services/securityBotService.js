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
  topicGroupChatId: process.env.TELEGRAM_TOPIC_GROUP_ID || "-1003943130538",        // Supergroup chat ID (e.g. -100...)
  topics: {
    newRegistration: process.env.TELEGRAM_TOPIC_REGISTRATION || "2",       // 🟢 Topic ID for New Registrations
    logins: process.env.TELEGRAM_TOPIC_LOGIN || "3",                // 🔐 Topic ID for Logins
    logouts: process.env.TELEGRAM_TOPIC_LOGOUT || "5",               // 🚪 Topic ID for Logouts
    securityUpdates: process.env.TELEGRAM_TOPIC_SECURITY || "6",       // 🚨 Topic ID for Security & Profile Updates
    otpAudit: process.env.TELEGRAM_TOPIC_OTP_AUDIT || "7",              // 🔑 Topic ID for OTP Audit Logs
    notesActivity: process.env.TELEGRAM_TOPIC_NOTES || "8",         // 📚 Topic ID for Notes Activity (Uploads & Downloads)
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
 * Creates or updates a pending registration session
 */
function createPendingRegistration({ name, mobile, email, college, year, password }) {
  if (!botSettings.enableOtp) {
    throw new Error("Telegram Bot OTP verification is currently disabled by administrator. Please use Email OTP or Google Sign-In.");
  }
  const regToken = "reg_" + crypto.randomBytes(6).toString("hex");
  const otp = crypto.randomInt(100000, 999999).toString();
  const cleanMobile = mobile.trim();
  const cleanEmail = email.trim().toLowerCase();

  const record = {
    regToken,
    name: name.trim(),
    mobile: cleanMobile,
    email: cleanEmail,
    college: (college || "Academic Institute").trim(),
    year: (year || "1st Year").trim(),
    password,
    otp,
    tgName: null,
    tgChatId: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins validity
    attempts: 0,
  };

  // Map by regToken, mobile, and email
  pendingRegistrations.set(regToken, record);
  pendingRegistrations.set(cleanMobile, record);
  pendingRegistrations.set(cleanEmail, record);

  return { regToken, otp, botUsername: BOT_USERNAME, botLink: `https://t.me/${BOT_USERNAME}?start=${regToken}` };
}

function getPendingRegistration(key) {
  if (!key) return null;
  const cleanKey = String(key).trim().toLowerCase();
  const record = pendingRegistrations.get(cleanKey);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    pendingRegistrations.delete(cleanKey);
    return null;
  }
  return record;
}

function verifyRegistrationOtp(key, inputOtp) {
  const record = getPendingRegistration(key);
  if (!record) {
    return { valid: false, message: "No active registration request found or session expired. Please try again." };
  }
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 6) {
    pendingRegistrations.delete(record.regToken);
    pendingRegistrations.delete(record.mobile);
    pendingRegistrations.delete(record.email);
    return { valid: false, message: "Too many incorrect attempts. Please initiate a new verification." };
  }
  if (!record.verified) {
    return {
      valid: false,
      message: "Security check failed: Mobile number has not been verified via Telegram. Please open @fsm_security_otp_bot and tap [ 📲 Verify & Share My Telegram Number ] to authenticate your number first.",
    };
  }
  if (record.otp !== String(inputOtp).trim()) {
    return { valid: false, message: "Invalid 6-digit OTP code. Please check your Telegram chat." };
  }

  // Success -> clean up keys
  pendingRegistrations.delete(record.regToken);
  pendingRegistrations.delete(record.mobile);
  pendingRegistrations.delete(record.email);

  return { valid: true, data: record };
}

/**
 * Creates or updates a pending password reset session
 */
function createPendingReset({ mobile, email, userId, userName, college }) {
  if (!botSettings.enableOtp) {
    throw new Error("Telegram Bot OTP verification is currently disabled by administrator. Please use Email OTP recovery.");
  }
  const resetToken = "reset_" + crypto.randomBytes(6).toString("hex");
  const otp = crypto.randomInt(100000, 999999).toString();
  const cleanMobile = String(mobile || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  const record = {
    resetToken,
    mobile: cleanMobile,
    email: cleanEmail,
    userId,
    userName: userName || "Scholar",
    college: college && college !== "Academic Institute" ? college : "",
    otp,
    tgChatId: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0,
    verified: false,
    botUsername: BOT_USERNAME,
    botLink: `https://t.me/${BOT_USERNAME}?start=${resetToken}`,
  };

  pendingPasswordResets.set(resetToken, record);
  pendingPasswordResets.set(cleanMobile, record);
  pendingPasswordResets.set(cleanEmail, record);

  return record;
}

function getPendingReset(key) {
  if (!key) return null;
  const cleanKey = String(key).trim().toLowerCase();
  const record = pendingPasswordResets.get(cleanKey);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    pendingPasswordResets.delete(cleanKey);
    return null;
  }
  return record;
}

function verifyResetOtp(key, inputOtp) {
  const record = getPendingReset(key);
  if (!record) {
    return { valid: false, message: "No active password recovery request found or code expired." };
  }
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 6) {
    pendingPasswordResets.delete(record.resetToken);
    pendingPasswordResets.delete(record.mobile);
    pendingPasswordResets.delete(record.email);
    return { valid: false, message: "Too many incorrect attempts. Please request a new recovery code." };
  }
  if (!record.verified) {
    return {
      valid: false,
      message: "Security check failed: Identity has not been verified via Telegram. Please open @fsm_security_otp_bot and tap [ 📲 Verify & Share My Telegram Number ] first.",
    };
  }
  if (record.otp !== String(inputOtp).trim()) {
    return { valid: false, message: "Invalid 6-digit recovery code. Please check your Telegram chat." };
  }

  pendingPasswordResets.delete(record.resetToken);
  pendingPasswordResets.delete(record.mobile);
  pendingPasswordResets.delete(record.email);

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
  record.verified = true;
  record.verifiedAt = Date.now();

  userBotStates.set(chatId, {
    lastInteraction: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const combinedName = `${record.name} (${tgDisplayName})`;

  const message = `🎓 <b>Free Study Material — Student Registration Passcode</b>\n\n` +
    `👤 <b>Student Name:</b> <code>${combinedName}</code>\n` +
    `📱 <b>Mobile Number:</b> <code>${record.mobile}</code>\n` +
    `📧 <b>Email Address:</b> <code>${record.email}</code>\n` +
    `🏛️ <b>College:</b> <code>${record.college}</code>\n` +
    `📚 <b>Academic Year:</b> <code>${record.year}</code>\n\n` +
    `🔑 <b>Your 6-Digit Verification Code:</b>\n` +
    `👉 <pre style="font-size: 24px;">${record.otp}</pre>\n\n` +
    `⏱️ <b>Validity:</b> 10 Minutes\n` +
    `🛡️ <i>Enter this code into the registration prompt on the website to activate your account.</i>\n` +
    `⚡ <i>Delivered securely via Telegram Bot Core (Zero Email Quota Used).</i>`;

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
        email: record.email,
        college: record.college,
        year: record.year,
      },
      method: "Telegram Bot DM",
      detail: "Student Registration Verification Passcode",
    }).catch(() => {});

    // 2. Real-time Live OTP Passcode Feed to dedicated 7th topic for manual student sharing
    sendTelegramAuthNotice({
      event: "USER_OTP",
      user: {
        name: combinedName,
        mobile: record.mobile,
        email: record.email,
        college: record.college,
        year: record.year,
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
  record.verified = true;
  record.verifiedAt = Date.now();

  userBotStates.set(chatId, {
    lastInteraction: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const displayName = record.userName || record.name || "Scholar";
  const displayMobile = record.mobile || "N/A";
  const displayEmail = record.email || "N/A";
  const displayOtp = record.otp || "";
  const displayCollege = record.college && record.college !== "Academic Institute" ? record.college : "";

  const message = `🔑 <b>Free Study Material — Password Recovery Passcode</b>\n\n` +
    `👤 <b>Account Holder:</b> <code>${displayName}</code>\n` +
    `📱 <b>Registered Mobile:</b> <code>${displayMobile}</code>\n` +
    `📧 <b>Registered Email:</b> <code>${displayEmail}</code>\n` +
    (displayCollege ? `🏛️ <b>College:</b> <code>${displayCollege}</code>\n\n` : "\n") +
    `🔐 <b>Your 6-Digit Password Reset Code:</b>\n` +
    `👉 <pre style="font-size: 24px;">${displayOtp}</pre>\n\n` +
    `⏱️ <b>Validity:</b> 10 Minutes\n` +
    `🛡️ <i>Enter this code and your new password on the website to update your credentials safely.</i>\n` +
    `⚡ <i>Delivered securely via Telegram Bot Core (Zero Email Quota Used).</i>`;

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

// Proactive 10-minute inactivity session sweeper
setInterval(async () => {
  if (!botToken) return;
  const now = Date.now();
  for (const [chatId, state] of userBotStates.entries()) {
    if (state && state.expiresAt && now > state.expiresAt) {
      userBotStates.delete(chatId);
      const initialOptionsKeyboard = {
        keyboard: [
          [{ text: "1️⃣ Student Registration" }],
          [{ text: "2️⃣ Forgot Password" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      };
      await sendTelegramDirect(
        chatId,
        `⏱️ <b>Session Expired (10-Minute Inactivity Timeout)</b>\n\n` +
          `You have been inactive for more than 10 minutes. For security reasons, your previous session has been automatically closed.\n\n` +
          `👇 Please select an option below to start a new session:`,
        initialOptionsKeyboard
      ).catch(() => {});
    }
  }
}, 15 * 1000);

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

        // 10-minute inactivity timeout check on incoming user interaction
        const activeState = userBotStates.get(chatId);
        if (activeState && activeState.expiresAt && Date.now() > activeState.expiresAt && !text.startsWith("/start")) {
          userBotStates.delete(chatId);
          const initialOptionsKeyboard = {
            keyboard: [
              [{ text: "1️⃣ Student Registration" }],
              [{ text: "2️⃣ Forgot Password" }],
              [{ text: "🔄 Restart Bot" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };
          await sendTelegramDirect(
            chatId,
            `⏱️ <b>Session Expired (10-Minute Inactivity Timeout)</b>\n\n` +
              `You have been inactive for more than 10 minutes. For security reasons, your previous session has been automatically closed.\n\n` +
              `👇 Please select an option below to start a new session:`,
            initialOptionsKeyboard
          );
          continue;
        }

        // Refresh user interaction activity timer on incoming message
        userBotStates.set(chatId, {
          ...(activeState || {}),
          lastInteraction: Date.now(),
          expiresAt: Date.now() + 10 * 60 * 1000,
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
            const regRecord = getPendingRegistration(param);
            if (regRecord) {
              userBotStates.set(chatId, {
                action: "waiting_verified_contact_reg",
                regRecord,
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
                `🎓 <b>Student Registration Security Check</b>\n\n` +
                  `👤 <b>Student Name:</b> <code>${regRecord.name}</code>\n` +
                  `📱 <b>Website Mobile:</b> <code>${regRecord.mobile}</code>\n` +
                  `📧 <b>Website Email:</b> <code>${regRecord.email}</code>\n\n` +
                  `🛡️ <b>Security Rule:</b> To confirm you are the true owner of mobile number <code>${regRecord.mobile}</code>, please tap the button below to share your verified Telegram contact:`,
                contactKeyboard
              );
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
                `⚠️ <b>Session Expired or Not Found</b>\n\nPlease fill the registration form on the website again and click <i>Get OTP via Telegram Bot</i>.`,
                restartKeyboard
              );
              continue;
            }
          }

          if (param.startsWith("reset_")) {
            const resetRecord = getPendingReset(param);
            if (resetRecord) {
              userBotStates.set(chatId, {
                action: "waiting_verified_contact_reset",
                resetRecord,
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
                `🔑 <b>Password Reset Security Check</b>\n\n` +
                  `👤 <b>Account Holder:</b> <code>${resetRecord.userName || "Scholar"}</code>\n` +
                  `📱 <b>Website Mobile:</b> <code>${resetRecord.mobile}</code>\n` +
                  `📧 <b>Website Email:</b> <code>${resetRecord.email}</code>\n\n` +
                  `🛡️ <b>Security Rule:</b> To confirm you are the true owner of mobile number <code>${resetRecord.mobile}</code>, please tap the button below to share your verified Telegram contact:`,
                contactKeyboard
              );
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
                `⚠️ <b>Password Reset Request Expired</b>\n\nPlease enter your Mobile Number and Email on the website to request a fresh password recovery code.`,
                restartKeyboard
              );
              continue;
            }
          }

          // 3. Plain /start (User opened bot and tapped or typed /start manually without token)
          userBotStates.set(chatId, {
            lastInteraction: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
          });

          const initialOptionsKeyboard = {
            keyboard: [
              [{ text: "1️⃣ Student Registration" }],
              [{ text: "2️⃣ Forgot Password" }],
              [{ text: "🔄 Restart Bot" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };

          await sendTelegramDirect(
            chatId,
            `👋 <b>Welcome to Free Study Material Security Bot!</b>\n\n` +
              `I can securely deliver your verification passcodes and assist with account access:\n\n` +
              `1️⃣ <b>Student Registration:</b> Select this option to verify your student account.\n` +
              `2️⃣ <b>Forgot Password:</b> Select this option to recover your account safely.`,
            initialOptionsKeyboard
          );
          continue;
        }

        // 2. User chose Option 1: Student Registration
        if (
          text === "1" ||
          text === "1️⃣" ||
          text === "1️⃣ Student Registration" ||
          text.toLowerCase() === "student registration" ||
          text === "/register"
        ) {
          userBotStates.set(chatId, {
            action: "waiting_verified_contact_reg_generic",
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
            `1️⃣ <b>Student Registration Verification</b>\n\n` +
              `Enter your details on our website and choose Telegram Bot Verification.\n\n` +
              `📲 <i>Tap the button below to verify your phone number:</i>`,
            contactKeyboard
          );
          continue;
        }

        // 2. User chose Option 2: Forgot Password
        if (
          text === "2" ||
          text === "2️⃣" ||
          text === "2️⃣ Forgot Password" ||
          text.toLowerCase() === "forgot password" ||
          text === "/forgot" ||
          text === "/reset"
        ) {
          userBotStates.set(chatId, {
            action: "waiting_verified_contact_reset_generic",
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
            `2️⃣ <b>Forgot Password Recovery</b>\n\n` +
              `Tap the button below to verify your Telegram contact and recover your account:\n\n` +
              `📲 <i>Tap the button below to verify your phone number:</i>`,
            contactKeyboard
          );
          continue;
        }

        // 3. Restart Bot / Main Menu return
        if (
          text === "🔙 Main Menu" ||
          text.toLowerCase() === "menu" ||
          text === "🔄 Restart Bot" ||
          text.toLowerCase() === "restart" ||
          text.toLowerCase() === "restart bot" ||
          text === "/restart"
        ) {
          userBotStates.set(chatId, {
            lastInteraction: Date.now(),
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
          const initialOptionsKeyboard = {
            keyboard: [
              [{ text: "1️⃣ Student Registration" }],
              [{ text: "2️⃣ Forgot Password" }],
              [{ text: "🔄 Restart Bot" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };

          await sendTelegramDirect(
            chatId,
            `👋 <b>Welcome to Free Study Material Security Bot!</b>\n\n` +
              `I can instantly generate and deliver your verification passcodes:\n\n` +
              `1️⃣ <b>Student Registration:</b> Enter your details on our website and choose Telegram Bot Verification.\n` +
              `2️⃣ <b>Forgot Password:</b> Select this option to start secure password recovery.`,
            initialOptionsKeyboard
          );
          continue;
        }

        // 4. Help Command
        if (text === "/help") {
          const initialOptionsKeyboard = {
            keyboard: [
              [{ text: "1️⃣ Student Registration" }],
              [{ text: "2️⃣ Forgot Password" }],
              [{ text: "🔄 Restart Bot" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          };
          await sendTelegramDirect(
            chatId,
            `👋 <b>Welcome to Free Study Material Security Bot!</b>\n\n` +
              `I can instantly generate and deliver your verification passcodes:\n\n` +
              `1️⃣ <b>Student Registration:</b> Enter your details on our website and choose Telegram Bot Verification.\n` +
              `2️⃣ <b>Forgot Password:</b> Select this option to start secure password recovery.`,
            initialOptionsKeyboard
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

            // SUCCESS! Numbers match 100%!
            await sendTelegramDirect(
              chatId,
              `✅ <b>Mobile Number Verified Successfully!</b>\nTelegram contact matches website form (<code>${formMobile}</code>).`,
              { remove_keyboard: true }
            );
            await dispatchRegistrationOtp(chatId, currentState.regRecord, user);
            userBotStates.delete(chatId);
            continue;
          }

          // Case A2: User was in password reset verification flow (/start reset_...)
          if (currentState && currentState.action === "waiting_verified_contact_reset" && currentState.resetRecord) {
            const formMobile = currentState.resetRecord.mobile.replace(/\D/g, "").slice(-10);

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
                  `• <b>Account Mobile:</b> <code>${formMobile}</code>\n` +
                  `• <b>Telegram Verified Number:</b> <code>${verifiedTgMobile}</code>\n\n` +
                  `Please share contact from your registered Telegram phone number or tap <b>[ 🔄 Restart Bot ]</b> below.`,
                restartKeyboard
              );
              userBotStates.delete(chatId);
              continue;
            }

            // SUCCESS! Numbers match 100%!
            await sendTelegramDirect(
              chatId,
              `✅ <b>Mobile Number Verified Successfully!</b>`,
              { remove_keyboard: true }
            );
            await dispatchPasswordResetOtp(chatId, currentState.resetRecord);
            userBotStates.delete(chatId);
            continue;
          }

          // Case B: Generic Forgot Password (user clicked 2️⃣ Forgot Password in bot)
          if (
            currentState &&
            (currentState.action === "waiting_mobile_reset" || currentState.action === "waiting_verified_contact_reset_generic")
          ) {
            const restartKeyboard = {
              keyboard: [
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };

            if (db) {
              try {
                const snap = await db.collection("users").where("mobile", "==", verifiedTgMobile).limit(1).get();
                if (!snap.empty) {
                  const userDoc = snap.docs[0];
                  const userData = userDoc.data();
                  userBotStates.set(chatId, {
                    action: "waiting_email_reset",
                    mobile: verifiedTgMobile,
                    userId: userDoc.id,
                    userData,
                    expiresAt: Date.now() + 10 * 60 * 1000,
                  });
                  await sendTelegramDirect(
                    chatId,
                    `✅ <b>Step 1 Verified: Mobile Number confirmed!</b>\n\n` +
                      `👤 <b>Student Name:</b> <code>${userData.name || "Scholar"}</code>\n` +
                      `📱 <b>Mobile:</b> <code>${verifiedTgMobile}</code>\n\n` +
                      `👉 <b>Step 2:</b> Now please enter your registered <b>Email Address</b> manually to verify ownership and receive your password reset passcode:`,
                    restartKeyboard
                  );
                  continue;
                } else {
                  await sendTelegramDirect(
                    chatId,
                    `❌ <b>No Account Found</b>\n\nNo registered student account was found with mobile number <code>${verifiedTgMobile}</code>.\n\nPlease register on the website or tap <b>[ 🔄 Restart Bot ]</b> below.`,
                    restartKeyboard
                  );
                  userBotStates.delete(chatId);
                  continue;
                }
              } catch (dbErr) {
                console.warn("[SECURITY-BOT] DB lookup notice:", dbErr.message);
              }
            }
          }

          // Case C: Generic Student Registration (user clicked 1️⃣ Student Registration in bot)
          if (
            currentState &&
            currentState.action === "waiting_verified_contact_reg_generic"
          ) {
            const restartKeyboard = {
              keyboard: [
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };

            const directPendingReg = getPendingRegistration(verifiedTgMobile);
            if (directPendingReg) {
              await sendTelegramDirect(
                chatId,
                `✅ <b>Mobile Number Verified!</b> Dispatched passcode for <code>${directPendingReg.name}</code>.`,
                restartKeyboard
              );
              await dispatchRegistrationOtp(chatId, directPendingReg, user);
              userBotStates.delete(chatId);
              continue;
            }

            if (db) {
              try {
                const snap = await db.collection("users").where("mobile", "==", verifiedTgMobile).limit(1).get();
                if (!snap.empty) {
                  await sendTelegramDirect(
                    chatId,
                    `ℹ️ <b>Mobile Number Already Registered</b>\n\n` +
                      `Mobile <code>${verifiedTgMobile}</code> is already registered with a student account.\n\n` +
                      `• If you forgot your password, please select <b>2️⃣ Forgot Password</b>.\n` +
                      `• Or tap <b>[ 🔄 Restart Bot ]</b> below to start fresh.`,
                    initialOptionsKeyboard
                  );
                  userBotStates.delete(chatId);
                  continue;
                }
              } catch {}
            }

            await sendTelegramDirect(
              chatId,
              `✅ <b>Mobile Number Verified: <code>${verifiedTgMobile}</code></b>\n\n` +
                `Your phone number has been verified successfully!\n\n` +
                `👉 <b>Next Step:</b> Please open our website, fill out the <b>Student Sign Up</b> form using mobile number <code>${verifiedTgMobile}</code>, and choose <i>Telegram Bot Verification</i> to activate your account.`,
              restartKeyboard
            );
            userBotStates.delete(chatId);
            continue;
          }

          // Case D: Direct Pending Registration match
          const directPendingReg = getPendingRegistration(verifiedTgMobile);
          if (directPendingReg) {
            const restartKeyboard = {
              keyboard: [
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };
            await sendTelegramDirect(
              chatId,
              `✅ <b>Mobile Number Verified!</b> Dispatched passcode for <code>${directPendingReg.name}</code>.`,
              restartKeyboard
            );
            await dispatchRegistrationOtp(chatId, directPendingReg, user);
            userBotStates.delete(chatId);
            continue;
          }

          // Case E: Direct Pending Reset match
          const directPendingReset = getPendingReset(verifiedTgMobile);
          if (directPendingReset) {
            const restartKeyboard = {
              keyboard: [
                [{ text: "🔄 Restart Bot" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: false,
            };
            await sendTelegramDirect(
              chatId,
              `✅ <b>Mobile Number Verified!</b> Dispatched password recovery code for <code>${directPendingReset.userName}</code>.`,
              restartKeyboard
            );
            await dispatchPasswordResetOtp(chatId, directPendingReset);
            userBotStates.delete(chatId);
            continue;
          }

          // Case D: Default contact received without prior state
          if (db) {
            try {
              const snap = await db.collection("users").where("mobile", "==", verifiedTgMobile).limit(1).get();
              if (!snap.empty) {
                const userDoc = snap.docs[0];
                const userData = userDoc.data();
                userBotStates.set(chatId, {
                  action: "waiting_email_reset",
                  mobile: verifiedTgMobile,
                  userId: userDoc.id,
                  userData,
                  expiresAt: Date.now() + 10 * 60 * 1000,
                });
                const restartKeyboard = {
                  keyboard: [
                    [{ text: "🔄 Restart Bot" }],
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: false,
                };
                await sendTelegramDirect(
                  chatId,
                  `👋 <b>Welcome back ${userData.name || "Scholar"}!</b>\n\n` +
                    `Your mobile <code>${verifiedTgMobile}</code> is registered.\n` +
                    `To reset your password, please enter your registered <b>Email Address</b>:`,
                  restartKeyboard
                );
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
                  `ℹ️ <b>No Pending Registration Found</b>\n\n` +
                    `No pending registration found for <code>${verifiedTgMobile}</code>.\n` +
                    `Please fill the registration form on our website first and choose <i>Telegram Bot Verification</i>.`,
                  restartKeyboard
                );
                continue;
              }
            } catch {}
          }
        }

        // 4. User sent a 10-digit Mobile Number via Plain Text:
        const digitsOnly = text.replace(/\D/g, "");
        if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
          const pendingReset = getPendingReset(digitsOnly);
          const pendingReg = getPendingRegistration(digitsOnly);

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
              `🔑 <b>Password Reset Authorization</b>\n\n` +
                `Account found for mobile <code>${digitsOnly}</code> (<code>${pendingReset.userName}</code>).\n\n` +
                `🛡️ <b>Security Check:</b> To confirm you own this number, please tap the button below to share your verified Telegram contact:`,
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
              `🎓 <b>Student Registration Authorization</b>\n\n` +
                `Registration found for mobile <code>${digitsOnly}</code> (<code>${pendingReg.name}</code>).\n\n` +
                `🛡️ <b>Security Check:</b> To confirm you own this number, please tap the button below to share your verified Telegram contact:`,
              contactKeyboard
            );
            continue;
          }

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
            `👇 Please tap the <b>[ 📲 Verify & Share My Telegram Number ]</b> button below:`,
            contactKeyboard
          );
          continue;
        }

        // 5. User sent an Email Address (contains @):
        if (text.includes("@")) {
          const cleanEmail = text.trim().toLowerCase();

          // A. If user was waiting for email in Forgot Password flow (contact already verified):
          if (currentState && currentState.action === "waiting_email_reset") {
            const expectedEmail = (currentState.userData?.email || "").toLowerCase().trim();

            if (expectedEmail && cleanEmail === expectedEmail) {
              // Matches! Generate Password Reset OTP!
              const resetRecord = createPendingReset({
                mobile: currentState.mobile,
                email: expectedEmail,
                userId: currentState.userId,
                userName: currentState.userData?.name || "Scholar",
                college: currentState.userData?.college || "Academic Institute",
              });

              const restartKeyboard = {
                keyboard: [
                  [{ text: "🔄 Restart Bot" }],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              };
              await sendTelegramDirect(
                chatId,
                `✅ <b>Step 2 Verified: Email address confirmed!</b>\nDispatched password reset passcode.`,
                restartKeyboard
              );
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
                `❌ <b>Email Address Mismatch!</b>\n\nThe email address <code>${cleanEmail}</code> does not match the account registered with mobile <code>${currentState.mobile}</code>.\n\nPlease enter the correct registered email address or tap <b>[ 🔄 Restart Bot ]</b> below.`,
                restartKeyboard
              );
              continue;
            }
          }

          // If not in waiting_email_reset, prompt to verify contact first
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
            `🛡️ <b>Security Verification Required</b>\n\nPlease verify your mobile number first by tapping <b>[ 📲 Verify & Share My Telegram Number ]</b> below:`,
            contactKeyboard
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

        // Fallback friendly instruction
        const fallbackOptionsKeyboard = {
          keyboard: [
            [{ text: "1️⃣ Student Registration" }],
            [{ text: "2️⃣ Forgot Password" }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        };
        await sendTelegramDirect(
          chatId,
          `👋 <b>Welcome to Free Study Material Security Bot!</b>\n\n` +
            `I can instantly generate and deliver your verification passcodes:\n\n` +
            `1️⃣ <b>Student Registration:</b> Enter your details on our website and choose Telegram Bot Verification.\n` +
            `2️⃣ <b>Forgot Password:</b> Select this option to start secure password recovery.\n\n` +
            `👇 <i>Please choose an option below:</i>`,
          fallbackOptionsKeyboard
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

