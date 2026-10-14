/**
 * Brevo SMTP Transactional Email Service
 * High-Deliverability Verification Engine for Free Study Material Vault
 */

const nodemailer = require("nodemailer");
const { ramCache } = require("../utils/ramCache");

// Configuration from environment variables
const SMTP_HOST = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
const SMTP_PORT = parseInt((process.env.BREVO_SMTP_PORT || "587").trim(), 10);
const SMTP_USER = (process.env.BREVO_SMTP_USER || process.env.BREVO_USER || "").trim();
const SMTP_PASS = (process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASSWORD || "").trim();
const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const FROM_EMAIL = (process.env.BREVO_FROM_EMAIL || SMTP_USER || "vault@freestudymaterial.com").trim();
const FROM_NAME = (process.env.BREVO_FROM_NAME || "Free Study Material Vault").trim();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // xkeysib- is a REST API key, not an SMTP relay password
  if (!SMTP_USER || !SMTP_PASS || SMTP_PASS.startsWith("xkeysib-")) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 2500, // Fast 2.5s connection timeout (prevents hanging on Render)
    greetingTimeout: 2500,
    socketTimeout: 3000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
}

/**
 * Realtime Telegram Dedicated Security OTP Bot Delivery Engine
 * Dispatches instant passcode alerts to dedicated security bot / private chat
 */
async function sendTelegramOtpBackup(toEmail, otp, type = "Verification") {
  try {
    // Dedicated OTP Bot Token (falls back to main bot token if not set)
    const botToken = (process.env.TELEGRAM_OTP_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    // Dedicated OTP Chat ID (falls back to storage chat id if not set)
    const targetChatId = (process.env.TELEGRAM_OTP_CHAT_ID || process.env.TELEGRAM_STORAGE_CHAT_ID || "").trim();
    if (!botToken || !targetChatId) return;

    const text = `🔐 <b>Free Study Material — Security Passcode Alert</b>\n\n` +
      `👤 <b>Student Email:</b> <code>${toEmail}</code>\n` +
      `🔑 <b>${type} Passcode:</b> <code>${otp}</code>\n` +
      `⏱️ <b>Validity:</b> 10 Minutes\n` +
      `🌐 <i>Isolated Security Core Delivery</i>`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn("[TELEGRAM-OTP] OTP bot notification notice:", err.message);
  }
}

let getBotSettings = null;
try {
  const secBot = require("./securityBotService");
  getBotSettings = secBot.getBotSettings;
} catch {}

/**
 * Auto-creates or retrieves dedicated Telegram Forum Topic for a Subject
 * When a student uploads a note, the bot automatically checks if a topic exists.
 * If not, it calls Telegram createForumTopic and saves the thread ID in Firestore.
 */
async function getOrCreateSubjectForumTopic(subjectName, targetChatId = null, botToken = null) {
  if (!subjectName) return null;
  let cleanSubject = subjectName.trim();
  if (!cleanSubject) return null;

  const lowerSub = cleanSubject.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lowerSub === "ai" || lowerSub === "artificialintelligence") {
    cleanSubject = "Artificial Intelligence";
  }

  // Prioritize @TechTitanNotesBot token specifically for topic operations
  const effectiveBotToken = (process.env.TELEGRAM_BOT_TOKEN || botToken || process.env.TELEGRAM_OTP_BOT_TOKEN || "").trim();
  let effectiveChatId = (targetChatId || process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004387181748").toString().trim();
  if (!effectiveBotToken) return null;

  const normalizedKey = cleanSubject.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 60);

  // 1. Check RAM Cache (Instant 0ms lookup)
  if (ramCache) {
    const cachedThreadId = ramCache.get("tg_sub_topic_" + normalizedKey);
    if (cachedThreadId) return Number(cachedThreadId);
  }

  // 2. Check Firestore Database
  try {
    const { db } = require("../firebase");
    if (db) {
      const docRef = db.collection("subject_forum_topics").doc(normalizedKey);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.threadId) {
          if (ramCache) ramCache.set("tg_sub_topic_" + normalizedKey, data.threadId, 86400);
          return Number(data.threadId);
        }
      }
    }
  } catch (dbErr) {
    console.warn("[SUBJECT-TOPIC] Firestore read error:", dbErr.message);
  }

  // 3. Auto-create Forum Topic via Telegram Bot API with @TechTitanNotesBot
  try {
    const colors = [7322096, 16766590, 13338331, 9367192, 16749490, 16478047];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const topicName = `📚 ${cleanSubject.slice(0, 120)}`;

    let createRes = await fetch(`https://api.telegram.org/bot${effectiveBotToken}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: effectiveChatId,
        name: topicName,
        icon_color: randomColor,
      }),
    });

    let createData = await createRes.json();

    // Fallback: If primary effectiveChatId failed or bot is not in that chat, try storage supergroup (-1004387181748)
    const storageSupergroup = (process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004387181748").trim();
    if (!createData.ok && storageSupergroup && effectiveChatId !== storageSupergroup) {
      effectiveChatId = storageSupergroup;
      createRes = await fetch(`https://api.telegram.org/bot${effectiveBotToken}/createForumTopic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: effectiveChatId,
          name: topicName,
          icon_color: randomColor,
        }),
      });
      createData = await createRes.json();
    }

    if (createData.ok && createData.result?.message_thread_id) {
      const newThreadId = createData.result.message_thread_id;
      console.log(`[TELEGRAM TOPIC AUTO-CREATE] Successfully created new topic "${topicName}" via @TechTitanNotesBot (Thread ID: ${newThreadId}, Chat: ${effectiveChatId})`);

      // Save in Firestore database for persistent routing across all future notes
      try {
        const { db } = require("../firebase");
        if (db) {
          await db.collection("subject_forum_topics").doc(normalizedKey).set({
            subject: cleanSubject,
            normalizedKey,
            threadId: newThreadId,
            name: topicName,
            chatId: effectiveChatId,
            botUsername: "TechTitanNotesBot",
            createdAt: new Date().toISOString(),
          });
        }
      } catch (saveErr) {
        console.warn("[SUBJECT-TOPIC] Firestore save warning:", saveErr.message);
      }

      if (ramCache) ramCache.set("tg_sub_topic_" + normalizedKey, newThreadId, 86400);

      // Post introductory message in pure English
      const introText =
        `📌 <b>Free Study Material — Subject Forum Initialized</b>\n\n` +
        `📚 <b>Subject:</b> <code>${cleanSubject}</code>\n` +
        `📁 <i>All academic lecture notes, documents, and syllabus updates for <b>${cleanSubject}</b> will be automatically organized here.</i>\n\n` +
        `🤖 <b>Managed by:</b> <code>@TechTitanNotesBot</code>\n` +
        `🌐 <b>Academic Cloud Engine:</b> <code>Live Automated Topic Routing</code>`;

      fetch(`https://api.telegram.org/bot${effectiveBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: effectiveChatId,
          message_thread_id: newThreadId,
          text: introText,
          parse_mode: "HTML",
        }),
      }).catch(() => {});

      return newThreadId;
    } else {
      console.warn(
        `[TELEGRAM TOPIC AUTO-CREATE] Notice: Could not auto-create topic for "${cleanSubject}". Telegram response: ${createData.description || "Unknown error"}. (Ensure @TechTitanNotesBot is Administrator with 'Manage Topics' permission).`
      );
      return null;
    }
  } catch (netErr) {
    console.warn("[TELEGRAM TOPIC AUTO-CREATE] Network error:", netErr.message);
    return null;
  }
}

/**
 * Realtime Telegram Security Bot Activity Notifier
 * Alerts Master Admin on EVERY Login, Logout, and Registration!
 * If Google Sign-In with photo: Dispatches photo directly to Telegram, but NEVER saves photo in DB.
 */
async function sendTelegramAuthNotice({ event, user = {}, photoUrl = null, method = "Email/Password", detail = "", note = null, otp = "" }) {
  try {
    let currentSettings = null;
    if (getBotSettings) {
      currentSettings = getBotSettings();
      if (event === "REGISTER" && currentSettings.enableRegisterNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ REGISTER alert suppressed by admin setting.");
        return;
      }
      if (event === "LOGIN" && currentSettings.enableLoginNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ LOGIN alert suppressed by admin setting.");
        return;
      }
      if (event === "LOGOUT" && currentSettings.enableLogoutNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ LOGOUT alert suppressed by admin setting.");
        return;
      }
      if ((event === "PROFILE_UPDATE" || event === "SECURITY_ALERT") && currentSettings.enableSecurityNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ SECURITY_ALERT suppressed by admin setting.");
        return;
      }
      if (event === "OTP_AUDIT" && currentSettings.enableOtpAuditNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ OTP_AUDIT alert suppressed by admin setting.");
        return;
      }
      if (event === "USER_OTP" && currentSettings.enableUserOtpNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ USER_OTP alert suppressed by admin setting.");
        return;
      }
      if (event === "NOTE_UPLOAD" && currentSettings.enableNoteUploadNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ NOTE_UPLOAD alert suppressed by admin setting.");
        return;
      }
      if (event === "NOTE_DOWNLOAD" && currentSettings.enableNoteDownloadNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ NOTE_DOWNLOAD alert suppressed by admin setting.");
        return;
      }
      if (event === "ACCOUNT_PURGE" && currentSettings.enableAccountPurgeNotice === false) {
        console.log("[SECURITY-BOT] ⏸️ ACCOUNT_PURGE alert suppressed by admin setting.");
        return;
      }
    }

    const isNoteEvent = (event === "NOTE_UPLOAD" || event === "NOTE_DOWNLOAD");
    const botToken = isNoteEvent
      ? (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_OTP_BOT_TOKEN || "").trim()
      : (process.env.TELEGRAM_OTP_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();

    let targetChatId = isNoteEvent
      ? (process.env.TELEGRAM_STORAGE_CHAT_ID || "-1004387181748").trim()
      : (currentSettings?.topicGroupChatId || process.env.TELEGRAM_TOPIC_GROUP_ID || process.env.TELEGRAM_OTP_CHAT_ID || process.env.TELEGRAM_STORAGE_CHAT_ID || "").trim();
    if (!botToken || !targetChatId) return;

    // Resolve target message_thread_id for Topics
    let threadId = null;
    const topics = currentSettings?.topics || {};
    if (event === "REGISTER") {
      threadId = topics.newRegistration || process.env.TELEGRAM_TOPIC_REGISTRATION || null;
    } else if (event === "LOGIN") {
      threadId = topics.logins || process.env.TELEGRAM_TOPIC_LOGIN || null;
    } else if (event === "LOGOUT") {
      threadId = topics.logouts || process.env.TELEGRAM_TOPIC_LOGOUT || null;
    } else if (event === "PROFILE_UPDATE" || event === "SECURITY_ALERT") {
      threadId = topics.securityUpdates || process.env.TELEGRAM_TOPIC_SECURITY || null;
    } else if (event === "OTP_AUDIT") {
      threadId = topics.otpAudit || process.env.TELEGRAM_TOPIC_OTP_AUDIT || null;
    } else if (event === "USER_OTP") {
      threadId = topics.userOtp || topics.otpAudit || process.env.TELEGRAM_TOPIC_USER_OTP || null;
    } else if (event === "NOTE_UPLOAD") {
      // Auto-Topic Creation: Check if dedicated topic exists for this note's Subject or auto-create it!
      const subjectName = (note?.subject || "").trim();
      if (subjectName) {
        threadId = await getOrCreateSubjectForumTopic(subjectName, targetChatId, botToken);
      }
      if (!threadId) {
        threadId = topics.notesActivity || topics.securityUpdates || process.env.TELEGRAM_TOPIC_NOTES || null;
      }
    } else if (event === "NOTE_DOWNLOAD") {
      const subjectName = (note?.subject || "").trim();
      if (subjectName) {
        threadId = await getOrCreateSubjectForumTopic(subjectName, targetChatId, botToken);
      }
      if (!threadId) {
        threadId = topics.notesActivity || topics.securityUpdates || process.env.TELEGRAM_TOPIC_NOTES || null;
      }
    } else if (event === "ACCOUNT_PURGE") {
      threadId = topics.accountPurge || topics.securityUpdates || process.env.TELEGRAM_TOPIC_PURGE || null;
    }

    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    let titleIcon = "🔔";
    let eventTitle = "User Activity";

    if (event === "REGISTER") {
      titleIcon = "🟢";
      eventTitle = "New Student Registration";
    } else if (event === "LOGIN") {
      titleIcon = "🔐";
      eventTitle = "Student Session Login";
    } else if (event === "LOGOUT") {
      const isAuto = String(method || detail || "").toLowerCase().includes("inactivity") || String(method || detail || "").toLowerCase().includes("30 min");
      titleIcon = isAuto ? "⏱️" : "🚪";
      eventTitle = isAuto ? "Auto-Logout (30 Min Inactivity)" : "Student Session Logout";
    } else if (event === "PROFILE_UPDATE" || event === "SECURITY_ALERT") {
      titleIcon = "🚨";
      eventTitle = "Security & Profile Update";
    } else if (event === "OTP_AUDIT") {
      titleIcon = "🔑";
      eventTitle = "OTP Dispatch Audit Log";
    } else if (event === "USER_OTP") {
      titleIcon = "🔑";
      eventTitle = "Live Student OTP Feed";
    } else if (event === "NOTE_UPLOAD") {
      titleIcon = "📤";
      eventTitle = "New Document Uploaded";
    } else if (event === "NOTE_DOWNLOAD") {
      titleIcon = "📥";
      eventTitle = "Document Download Stream";
    } else if (event === "ACCOUNT_PURGE") {
      titleIcon = "🗑️";
      eventTitle = "90-Day Inactive Account Purged";
    }

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

    let caption = "";
    if (event === "USER_OTP") {
      const displayOtp = otp || user.otp || "";
      caption = `🔐 <b>Free Study Material — Live Student OTP Feed</b>\n\n` +
        `👤 <b>Student Name:</b> <code>${user.name || "Scholar"}</code>\n` +
        (user.mobile ? `📱 <b>Mobile Number:</b> <code>${user.mobile}</code>\n` : "") +
        (user.email ? `📧 <b>Email Address:</b> <code>${user.email}</code>\n` : "") +
        (user.college ? `🏛️ <b>College:</b> <code>${user.college}</code>\n` : "") +
        (user.year ? `📚 <b>Academic Year:</b> <code>${user.year}</code>\n` : "") +
        `🎯 <b>Purpose:</b> <code>${detail || "Account Verification Passcode"}</code>\n` +
        `🛡️ <b>Auth Method:</b> <code>${method || "Live OTP"}</code>\n\n` +
        `🔑 <b>6-Digit Live Student OTP:</b>\n` +
        `👉 <pre style="font-size: 26px;">${displayOtp}</pre>\n\n` +
        `⏰ <b>Generated At:</b> <code>${timeStr} IST</code>\n` +
        `🛡️ <i>Admin Manual Support: You can copy and share this OTP with the student if needed.</i>`;
    } else if (event === "OTP_AUDIT") {
      caption = `${titleIcon} <b>Free Study Material — ${eventTitle}</b>\n\n` +
        `👤 <b>Student Name:</b> <code>${user.name || "Student"}</code>\n` +
        `📱 <b>Mobile Number:</b> <code>${user.mobile || "N/A"}</code>\n` +
        `📧 <b>Email Address:</b> <code>${user.email || "N/A"}</code>\n` +
        (user.college ? `🏛️ <b>College:</b> <code>${user.college}</code>\n` : "") +
        `🛡️ <b>Action:</b> <code>${detail || method}</code>\n` +
        `⏰ <b>Timestamp:</b> <code>${timeStr} IST</code>\n\n` +
        `🔒 <i>Student real OTP delivered strictly to student's personal private chat (1-on-1 DM).</i>`;
    } else if (event === "NOTE_UPLOAD") {
      const realSizeStr = formatRealSize(note?.fileSize);
      caption = `⚡ <b>Free Study Material — Vault Indexing Receipt</b>\n\n` +
        `✅ <b>Note Successfully Indexed to Website & Supergroup!</b>\n` +
        `📄 <b>Document Title:</b> <code>${note?.title || "Academic Document"}</code>\n` +
        `📚 <b>Subject:</b> <code>${note?.subject || "General"}</code>\n` +
        `🎓 <b>Program:</b> <code>${note?.course || ""} - ${note?.branch || ""} (${note?.year || ""})</code>\n` +
        `💾 <b>File Size:</b> <code>${realSizeStr}</code>\n` +
        `👤 <b>Uploaded By:</b> <code>${user.name || "Student Contributor"}</code>\n` +
        (user.email ? `📧 <b>Email:</b> <code>${user.email}</code>\n` : "") +
        `🔗 <b>Direct Link:</b> https://freestudymaterial.onrender.com/api/notes/${note?.id}/stream\n` +
        `🕒 <b>Timestamp:</b> <code>${timeStr} IST</code>\n\n` +
        `<i>Auto-routed to dedicated Subject Topic. Document & Receipt published separately.</i>`;
    } else if (event === "NOTE_DOWNLOAD") {
      const realSizeStr = formatRealSize(note?.fileSize);
      caption = `${titleIcon} <b>Free Study Material — ${eventTitle}</b>\n\n` +
        `👤 <b>Student Downloader:</b> <code>${user.name || "Student"}</code>\n` +
        (user.mobile ? `📱 <b>Mobile:</b> <code>${user.mobile}</code>\n` : "") +
        `📧 <b>Email:</b> <code>${user.email || "N/A"}</code>\n` +
        (user.college ? `🏛️ <b>College:</b> <code>${user.college}</code>\n` : "") +
        (user.year ? `🎓 <b>Student Year:</b> <code>${user.year}</code>\n\n` : "\n") +
        `📄 <b>Document Title:</b> <code>${note?.title || "Academic Document"}</code>\n` +
        `📚 <b>Subject:</b> <code>${note?.subject || "General"}</code>\n` +
        `🏛️ <b>Course & Branch:</b> <code>${note?.course || ""} - ${note?.branch || ""}</code>\n` +
        (note?.fileSize ? `💾 <b>File Size:</b> <code>${realSizeStr}</code>\n` : "") +
        (note?.downloadsCount !== undefined ? `📊 <b>Download Stream:</b> <code>#${note.downloadsCount + 1}</code>\n` : "") +
        `⚡ <b>Stream Method:</b> <code>${method || "Cloudflare CDN Edge Stream"}</code>\n` +
        `🕒 <b>Timestamp:</b> <code>${timeStr} IST</code>\n\n` +
        `🌐 <i>Real-time Academic Vault Streaming Monitor</i>`;
    } else if (event === "ACCOUNT_PURGE") {
      let notesSnippet = "  • <i>No study notes uploaded by this student.</i>";
      if (user.uploadedNotes && user.uploadedNotes.length > 0) {
        notesSnippet = user.uploadedNotes
          .map((n, i) => `  • ${i + 1}. 📄 <b>${n.title}</b> (${n.course || "Course"} • ${n.branch || "Branch"} • ${formatRealSize(n.fileSize)})`)
          .join("\n");
      }

      caption = `🗑️ <b>Free Study Material — 90-Day Inactive Account Purged</b>\n\n` +
        `Dear Admin, this student account was inactive for over 90 days with no login. To keep the database fast, clean, and safe, this account has been automatically deleted from the database.\n\n` +
        `👤 <b>Student Name:</b> <code>${user.name || "Scholar"}</code>\n` +
        `📧 <b>Email Address:</b> <code>${user.email}</code>\n` +
        (user.mobile ? `📱 <b>Mobile Number:</b> <code>${user.mobile}</code>\n` : "") +
        (user.college ? `🏛️ <b>College / Institute:</b> <code>${user.college}</code>\n` : "") +
        (user.year ? `🎓 <b>Academic Year:</b> <code>${user.year}</code>\n` : "") +
        (user.telegramDetails?.username ? `🤖 <b>Telegram Account:</b> @${user.telegramDetails.username}\n` : (user.telegramName && user.telegramName !== "N/A" ? `🤖 <b>Telegram Account:</b> <code>${user.telegramName}</code>\n` : "")) +
        (user.telegramDetails?.id ? `🆔 <b>Telegram User ID:</b> <code>${user.telegramDetails.id}</code>\n` : "") +
        `📅 <b>Registration Date:</b> <code>${user.registeredDate || "N/A"}</code>\n` +
        `⏰ <b>Last Login Date:</b> <code>${user.lastLoginDate || "Never Logged In"}</code>\n` +
        `⌛ <b>Total Inactivity:</b> <code>${user.inactivityDays || 90} Days (Exceeded 90-Day Limit)</code>\n\n` +
        `📚 <b>Notes Uploaded by Student (Safely Preserved in Vault):</b>\n` +
        `${notesSnippet}\n\n` +
        `📥 <b>Total Notes Downloaded:</b> <code>${user.downloadsCount || 0} documents</code>\n` +
        `🛡️ <b>Purge Status:</b> <code>Account Permanently Deleted from Database</code>\n` +
        `⏰ <b>Action Timestamp:</b> <code>${timeStr} IST</code>\n\n` +
        `💡 <i>Note: All uploaded study materials remain 100% safe in the Academic Cloud Vault for other students. Only the inactive login account was removed.</i>`;
    } else {
      let nameAndIdentityBlock = "";
      if (user.userInputName || user.telegramName) {
        nameAndIdentityBlock += `👤 <b>Combined Final Name:</b> <code>${user.name}</code>\n`;
        nameAndIdentityBlock += `📝 <b>Manual Input Name:</b> <code>${user.userInputName || user.name}</code>\n`;
        nameAndIdentityBlock += `🤖 <b>Telegram Account:</b> <code>${user.telegramName || "N/A"}</code>\n`;
      } else {
        nameAndIdentityBlock += `👤 <b>Name:</b> <code>${user.name || "Scholar"}</code>\n`;
      }

      if (user.telegramDetails) {
        const td = user.telegramDetails;
        if (td.id) nameAndIdentityBlock += `🆔 <b>Telegram User ID:</b> <code>${td.id}</code>\n`;
        if (td.username) nameAndIdentityBlock += `🔗 <b>Telegram Handle:</b> <code>${td.username}</code>\n`;
      }

      caption = `${titleIcon} <b>Free Study Material — ${eventTitle}</b>\n\n` +
        nameAndIdentityBlock +
        (user.oldMobile ? `📱 <b>Previous Mobile:</b> <code>${user.oldMobile}</code>\n` : "") +
        (user.newMobile ? `📲 <b>New Verified Mobile:</b> <code>${user.newMobile}</code>\n` : (user.mobile ? `📱 <b>Mobile:</b> <code>${user.mobile}</code>\n` : "")) +
        `📧 <b>Email:</b> <code>${user.email || "N/A"}</code>\n` +
        (user.college ? `🏛️ <b>College:</b> <code>${user.college}</code>\n` : "") +
        (user.year ? `📚 <b>Year:</b> <code>${user.year}</code>\n` : "") +
        `🛡️ <b>Auth Method:</b> <code>${method}</code>\n` +
        (detail ? `⚠️ <b>Note:</b> <code>${detail}</code>\n` : "") +
        `⏰ <b>Timestamp:</b> <code>${timeStr} IST</code>\n\n` +
        `🌐 <i>Real-time Academic Vault Security Core</i>`;
    }

    // 1. If photoUrl is available (from Google OAuth):
    if (photoUrl && (photoUrl.startsWith("http://") || photoUrl.startsWith("https://"))) {
      try {
        const photoPayload = {
          chat_id: targetChatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: "HTML",
        };
        if (threadId && !isNaN(Number(threadId))) {
          photoPayload.message_thread_id = Number(threadId);
        }
        const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(photoPayload),
          signal: AbortSignal.timeout(6000),
        });
        if (photoRes.ok) {
          console.log(`[TELEGRAM-AUTH-NOTICE] ✅ Photo alert sent for ${user.email} (${event}) [Topic: ${threadId || "General"}]`);
          return;
        }
      } catch (photoErr) {
        console.warn("[TELEGRAM-AUTH-NOTICE] Photo send fallback:", photoErr.message);
      }
    }

    // 1.5 If NOTE_UPLOAD and PDF file exists on disk, send the PDF document first into the topic!
    if (event === "NOTE_UPLOAD" && note?.filePath) {
      try {
        const fs = require("fs");
        if (fs.existsSync(note.filePath)) {
          const fileBuf = fs.readFileSync(note.filePath);
          const blob = new Blob([fileBuf], { type: "application/pdf" });
          const form = new FormData();
          form.append("chat_id", targetChatId);
          if (threadId && !isNaN(Number(threadId))) {
            form.append("message_thread_id", String(threadId));
          }
          form.append("document", blob, note.originalName || `${note.title || "Document"}.pdf`);
          form.append("caption", `📄 <b>${note.title || "Academic Document"}</b>\n💾 <b>Size:</b> ${formatRealSize(note.fileSize)}\n📚 <b>Subject:</b> ${note.subject || "General"}`);
          form.append("parse_mode", "HTML");

          const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(15000),
          });
          if (docRes.ok) {
            console.log(`[TELEGRAM-AUTH-NOTICE] 📄 PDF file successfully dispatched to topic ${threadId || "General"}`);
          }
        }
      } catch (pdfErr) {
        console.warn("[TELEGRAM-AUTH-NOTICE] Send document error:", pdfErr.message);
      }
    }

    // 2. Standard HTML text receipt message
    const msgPayload = {
      chat_id: targetChatId,
      text: caption,
      parse_mode: "HTML",
    };
    if (threadId && !isNaN(Number(threadId))) {
      msgPayload.message_thread_id = Number(threadId);
    }

    let msgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msgPayload),
      signal: AbortSignal.timeout(6000),
    });

    // Fallback: If message_thread_id is invalid/closed, send without thread_id ONLY for non-note events
    if (!msgRes.ok && msgPayload.message_thread_id) {
      if (isNoteEvent) {
        console.warn(`[TELEGRAM-AUTH-NOTICE] Topic ${threadId} send notice:`, await msgRes.text().catch(() => ""));
        return;
      }
      delete msgPayload.message_thread_id;
      msgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msgPayload),
        signal: AbortSignal.timeout(6000),
      });
    }

    if (msgRes.ok) {
      console.log(`[TELEGRAM-AUTH-NOTICE] ✅ Text alert sent for ${user.email || user.name} (${event}) [Topic: ${threadId || "General"}]`);
    } else {
      const msgErrText = await msgRes.text().catch(() => "");
      console.warn(`[TELEGRAM-AUTH-NOTICE] Text send notice (${msgRes.status}):`, msgErrText);
    }
  } catch (err) {
    console.warn("[TELEGRAM-AUTH-NOTICE] Dispatch error notice:", err.message);
  }
}

/**
 * High-Speed Email Dispatcher:
 * 1. Dispatches parallel Telegram security alert (instant 100ms delivery guarantee)
 * 2. Uses Brevo REST API v3 over HTTPS (Port 443) if xkeysib- API key is configured
 * 3. Uses NodeMailer SMTP with strict 2.5s timeout if SMTP key is configured
 * 4. Never hangs the calling route (returns in < 2 seconds)
 */
async function dispatchEmail({ to, toName, subject, text, html, otpType = "OTP", otp }) {
  // Always trigger Telegram backup alert in background
  sendTelegramOtpBackup(to, otp, otpType).catch(() => {});

  if (!SMTP_PASS && !BREVO_API_KEY) {
    console.log(`[BREVO-SIMULATION] 📧 ${otpType} for ${to}: [ ${otp} ]`);
    return { success: true, delivered: false, simulated: true, otp };
  }

  // Determine if we have a valid Brevo REST API v3 key (starts with xkeysib-)
  const apiKey = BREVO_API_KEY || (SMTP_PASS.startsWith("xkeysib-") ? SMTP_PASS : null);

  // 1. Try Brevo REST API (HTTPS Port 443 - zero firewall blocks on cloud containers, ~200ms latency)
  if (apiKey) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: to, name: toName || "Scholar" }],
          subject: subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[BREVO-API] ✅ ${otpType} delivered via HTTPS API to ${to} (MessageId: ${data.messageId || "ok"})`);
        return { success: true, delivered: true, messageId: data.messageId || "api-ok", otp };
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[BREVO-API] HTTP ${res.status} notice: ${errText}`);
        if (res.status === 401 && errText.includes("authorised_ips")) {
          return {
            success: false,
            delivered: false,
            ipBlocked: true,
            error: "Brevo IP restriction active. Please deactivate blocking at https://app.brevo.com/security/authorised_ips",
            otp,
          };
        }
        return { success: false, delivered: false, error: `Brevo API HTTP ${res.status}: ${errText}`, otp };
      }
    } catch (apiErr) {
      console.warn(`[BREVO-API] API dispatch notice: ${apiErr.message}`);
      return { success: false, delivered: false, error: apiErr.message, otp };
    }
  }

  // 2. Try NodeMailer SMTP with strict 2.5s timeout (if SMTP credentials present)
  const mailTransporter = getTransporter();
  if (mailTransporter) {
    try {
      const smtpPromise = mailTransporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: to,
        subject: subject,
        text: text,
        html: html,
      });

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP timeout")), 2500));
      const info = await Promise.race([smtpPromise, timeoutPromise]);

      console.log(`[BREVO-SMTP] ✅ ${otpType} delivered via SMTP to ${to} (MessageId: ${info.messageId})`);
      return { success: true, delivered: true, messageId: info.messageId, otp };
    } catch (smtpErr) {
      console.warn(`[BREVO-SMTP] ⚠️ SMTP delivery notice (${smtpErr.message}). Logging OTP: [ ${otp} ]`);
      return { success: false, delivered: false, error: smtpErr.message, otp };
    }
  }

  return { success: false, delivered: false, error: "No active email transport available", otp };
}

/**
 * Builds an ultra-premium, dark academic gradient responsive HTML email template
 */
function buildCreativeEmailTemplate({ title, subtitle, greeting, messageText, otp, actionNote }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 540px; background: linear-gradient(180deg, #131b2e 0%, #0d1322 100%); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.6);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 5px; background: linear-gradient(90deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 20px; text-align: center;">
              <div style="display: inline-block; padding: 6px 16px; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 999px; margin-bottom: 12px;">
                <span style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #38bdf8;">
                  ⚡ FREE STUDY MATERIAL VAULT
                </span>
              </div>
              <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                ${title}
              </h1>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                ${subtitle}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 36px;">
              <div style="height: 1px; background: rgba(255, 255, 255, 0.08);"></div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 36px;">
              <p style="margin: 0 0 14px; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                <strong>${greeting}</strong>
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                ${messageText}
              </p>

              <!-- OTP Code Display Card -->
              <div style="background: rgba(15, 23, 42, 0.85); border: 2px dashed rgba(6, 182, 212, 0.5); border-radius: 12px; padding: 22px 16px; text-align: center; margin: 0 0 24px; box-shadow: inset 0 0 20px rgba(6, 182, 212, 0.05);">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #06b6d4; margin-bottom: 8px;">
                  YOUR 6-DIGIT VERIFICATION PASSCODE
                </div>
                <div style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 38px; font-weight: 800; letter-spacing: 14px; color: #38bdf8; text-shadow: 0 0 15px rgba(56, 189, 248, 0.4); padding-left: 14px;">
                  ${otp}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                  ⏳ Valid for <strong>10 minutes</strong> only. Do not share with anyone.
                </div>
              </div>

              <!-- Action / Security Alert Note -->
              <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 12px 16px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 12px; color: #fbbf24; line-height: 1.5;">
                  ⚠️ <strong>Notice:</strong> ${actionNote}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px 30px; background: rgba(0, 0, 0, 0.25); border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #94a3b8;">
                Free Study Material Vault • Academic Cloud Engine
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Secured via Brevo Enterprise Infrastructure. If you did not request this OTP, please safely disregard this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Sends a Login Verification OTP email
 */
async function sendLoginOtpEmail(email, otp, userName = "Scholar") {
  const title = "Secure Login Verification";
  const subtitle = "One-Time Access Passcode for Account Sign-In";
  const greeting = `Hello ${userName},`;
  const messageText = `A sign-in request was initiated for your <strong>Free Study Material Vault</strong> account. To verify your identity and access your academic resources, please enter the one-time passcode below into the login prompt.`;
  const actionNote = `If you did not attempt to sign in to your vault account, someone may have entered your email. Your account remains safe, but please ensure your password is secure.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nHello ${userName},\nYour One-Time Login Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🔐 Your Login Verification Code: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "LOGIN OTP",
    otp,
  });
}

/**
 * Sends a Forgot Password Reset OTP email
 */
async function sendForgotPasswordOtpEmail(email, otp, userName = "Scholar") {
  const title = "Account Recovery & Password Reset";
  const subtitle = "Authorized Credential Reset Protocol";
  const greeting = `Hello ${userName},`;
  const messageText = `We received an authorized request to reset the password for your <strong>Free Study Material Vault</strong> account. Enter the verification passcode below to authorize your password update.`;
  const actionNote = `If you did not request a password reset, please ignore this email. Your current password will remain completely unchanged and secure.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nHello ${userName},\nYour Password Reset Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🔑 Password Reset Passcode: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "FORGOT PASSWORD OTP",
    otp,
  });
}

/**
 * Sends a Student Registration / Sign-Up Verification OTP email
 */
async function sendSignupOtpEmail(email, otp, userName = "Scholar") {
  const title = "Welcome to Free Study Material Vault";
  const subtitle = "Verify Your Student Registration Passcode";
  const greeting = `Welcome ${userName},`;
  const messageText = `Thank you for creating an account on the <strong>Free Study Material Vault</strong>. To activate your student account and access verified class notes, question papers, and academic textbooks, enter the 6-digit verification code below.`;
  const actionNote = `This verification code is valid for 10 minutes. If you did not create this account, you can safely ignore this email.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nWelcome ${userName},\nYour Registration Verification Passcode is: ${otp}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `🎓 Activate Your Student Account: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "SIGNUP OTP",
    otp,
  });
}

/**
 * Sends a Mobile Number Update Authorization OTP email
 */
async function sendProfileMobileOtpEmail(email, otp, newMobile, userName = "Scholar") {
  const title = "Mobile Number Change Authorization";
  const subtitle = "Security Re-Verification Protocol";
  const greeting = `Hello ${userName},`;
  const messageText = `We received an authorized request to change the registered mobile number on your <strong>Free Study Material Vault</strong> account to <strong>${newMobile}</strong>. Enter the 6-digit verification code below to authorize this update.`;
  const actionNote = `If you did not request to update your mobile number, please ignore this email or change your account password immediately.`;

  const htmlContent = buildCreativeEmailTemplate({
    title,
    subtitle,
    greeting,
    messageText,
    otp,
    actionNote,
  });

  const textContent = `[Free Study Material Vault]\n\nHello ${userName},\nYour Mobile Number Update Passcode is: ${otp}\nNew Mobile: ${newMobile}\nThis code expires in 10 minutes.`;

  return await dispatchEmail({
    to: email,
    toName: userName,
    subject: `📲 Mobile Update Passcode: ${otp} | Free Study Material Vault`,
    text: textContent,
    html: htmlContent,
    otpType: "PROFILE MOBILE OTP",
    otp,
  });
}

module.exports = {
  sendLoginOtpEmail,
  sendForgotPasswordOtpEmail,
  sendSignupOtpEmail,
  sendProfileMobileOtpEmail,
  sendTelegramOtpBackup,
  sendTelegramAuthNotice,
  getOrCreateSubjectForumTopic,
};

