/**
 * ============================================================================
 * 🛡️ ZERO-TRUST CLIENT ANTI-TAMPER & DEFENSE SECURITY ROUTE
 * ============================================================================
 * - Captures frontend console tampering, script injections & prototype hijacking
 * - 3-Strike Warning & Auto-Block Enforcement
 * - Direct alerts to Telegram Supergroup Topic 6
 * - Automatic IP Jail Detention & Database Account Ban on 3rd violation
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const { db } = require("../firebase");
const { tursoClient } = require("../services/tursoService");
const {
  jailSpecificIp,
  jailSpecificDevice,
  unjailDevice,
  unjailIp,
  unjailByIncident,
  getJailStatus,
  getClientIp,
} = require("../middleware/ipJail");
const { sendTelegramAuthNotice } = require("../services/emailService");
const { decryptUserObject } = require("../utils/cryptoVault");

// Memory cache to track strikes per IP & user (TTL 24 hours)
const tamperStrikes = new Map(); // key -> { count: number, violations: Array, lastAt: number }
const recentAppeals = new Map(); // key -> timestamp (rate limit appeals)

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tamperStrikes.entries()) {
    if (now - val.lastAt > 24 * 60 * 60 * 1000) {
      tamperStrikes.delete(key);
    }
  }
}, 60 * 60 * 1000);

function safeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseCleanDeviceInfo(ua) {
  if (!ua) return { device: "Unknown Device", browser: "Unknown Browser", os: "Unknown OS", cleanLabel: "Unknown Device" };

  let device = "💻 PC / Desktop";
  let os = "Desktop OS";
  let browser = "Web Browser";

  // OS & Device Detection
  if (/iPhone/i.test(ua)) {
    device = "📱 Apple iPhone";
    const match = ua.match(/OS (\d+[_\d]*)/i);
    os = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  } else if (/iPad/i.test(ua)) {
    device = "📱 Apple iPad";
    os = "iPadOS";
  } else if (/Android/i.test(ua)) {
    device = "📱 Android Mobile / Tablet";
    const match = ua.match(/Android (\d+(\.\d+)*)/i);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (/Windows NT 10\.0/i.test(ua)) {
    device = "💻 PC / Laptop";
    os = "Windows 10/11";
  } else if (/Macintosh/i.test(ua)) {
    device = "💻 Apple Mac";
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    device = "💻 Linux Workstation";
    os = "Linux";
  }

  // Browser Detection (Special attention to iOS CriOS / FxiOS / EdgiOS)
  if (/CriOS\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/CriOS\/(\d+(\.\d+)*)/i)[1];
    browser = `Google Chrome for iOS (CriOS v${v})`;
  } else if (/FxiOS\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/FxiOS\/(\d+(\.\d+)*)/i)[1];
    browser = `Mozilla Firefox for iOS (v${v})`;
  } else if (/EdgiOS\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/EdgiOS\/(\d+(\.\d+)*)/i)[1];
    browser = `Microsoft Edge for iOS (v${v})`;
  } else if (/Edg\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/Edg\/(\d+(\.\d+)*)/i)[1];
    browser = `Microsoft Edge (v${v})`;
  } else if (/Chrome\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/Chrome\/(\d+(\.\d+)*)/i)[1];
    browser = `Google Chrome (v${v})`;
  } else if (/Firefox\/(\d+(\.\d+)*)/i.test(ua)) {
    const v = ua.match(/Firefox\/(\d+(\.\d+)*)/i)[1];
    browser = `Mozilla Firefox (v${v})`;
  } else if (/Version\/(\d+(\.\d+)*).*Safari/i.test(ua)) {
    const v = ua.match(/Version\/(\d+(\.\d+)*)/i)[1];
    browser = `Apple Safari (v${v})`;
  } else if (/Safari/i.test(ua)) {
    browser = `Apple Safari`;
  }

  return { device, os, browser, cleanLabel: `${device} • ${os} • ${browser}` };
}

/**
 * Dispatch Telegram Security Alert directly to Security Supergroup Topic 6
 * (Stopped dispatch to Chat Audit Topic 35 per administrator directive)
 */
async function dispatchTamperTelegramAlert({
  user,
  ip,
  detail,
  strikeCount,
  isBlocked,
  deviceInfo,
  pageUrl,
  forensics,
}) {
  const isBanned = strikeCount >= 3 || isBlocked;
  const statusBadge = isBanned
    ? "🚫 <b>[CRITICAL: USER AUTO-BLOCKED - 3RD DEVTOOLS TAMPER ATTEMPT]</b>"
    : `⚠️ <b>[SECURITY WARNING: DEVTOOLS / CONSOLE INSPECTION DETECTED (Strike ${strikeCount}/3)]</b>`;

  const actionText = isBanned
    ? "❌ <b>Account Permanently Banned in Database & IP Jailed for 24 Hours</b>"
    : "⚠️ <b>On-Screen Warning Modal Displayed to Student</b>";

  const cleanInfo = parseCleanDeviceInfo(deviceInfo);

  const messageText = [
    statusBadge,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${safeHtml(user.name || "Unauthenticated Guest")}`,
    `📧 <b>Email:</b> <code>${safeHtml(user.email || "N/A")}</code>`,
    user.mobile && user.mobile !== "N/A" ? `📱 <b>Mobile:</b> <code>${safeHtml(user.mobile)}</code>` : null,
    `📱 <b>Device:</b> ${cleanInfo.device} (${cleanInfo.os})`,
    `🌐 <b>Browser:</b> ${cleanInfo.browser}`,
    forensics?.ram || user?.memoryEstimate
      ? `⚙️ <b>Hardware:</b> ${safeHtml(forensics?.cores || user?.hardwareCores || "4 Cores")} • <b>${safeHtml(forensics?.ram || user?.memoryEstimate || "Standard RAM")}</b>`
      : user.college && user.college !== "N/A" ? `🏛️ <b>Hardware Profile:</b> ${safeHtml(user.college)}` : null,
    forensics?.gpu || user?.gpuRenderer ? `🎮 <b>GPU Renderer:</b> <code>${safeHtml(forensics?.gpu || user?.gpuRenderer)}</code>` : null,
    forensics?.screen || user?.year ? `🖥️ <b>Display & Screen:</b> ${safeHtml(forensics?.screen || user?.year)}` : null,
    forensics?.touch || user?.touchSpec ? `👆 <b>Input:</b> ${safeHtml(forensics?.touch || user?.touchSpec)}` : null,
    forensics?.network || user?.networkType ? `📶 <b>Network:</b> ${safeHtml(forensics?.network || user?.networkType)}` : null,
    `🌐 <b>IP Address:</b> <code>${safeHtml(ip)}</code>`,
    pageUrl ? `📍 <b>Page / Route:</b> <code>${safeHtml(pageUrl)}</code>` : null,
    `⚠️ <b>Tampering Detected:</b>`,
    `<i>${safeHtml(detail || "Attempted to open DevTools / Inspect Mode")}</i>`,
    `🎯 <b>Total Strikes:</b> <b>${strikeCount} of 3</b>`,
    `🛡️ <b>Action Taken:</b> ${actionText}`,
    `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    `🔬 <b>Raw Client Agent:</b> <pre>${safeHtml(deviceInfo || "N/A")}</pre>`,
  ]
    .filter(Boolean)
    .join("\n");

  // Dispatch strictly to Security Supergroup Topic 6 (@fsm_security_otp_bot)
  try {
    await sendTelegramAuthNotice({
      event: "DEVTOOLS_VIOLATION",
      user: {
        name: user.name || "Tamper Attacker",
        email: user.email || "N/A",
        mobile: user.mobile || "N/A",
        college: user.college || "N/A",
        ip: ip,
      },
      method: "Client-Side Anti-Tamper & DevTools Sensor (disable-devtool)",
      detail: messageText,
      threadId: process.env.TELEGRAM_TOPIC_SECURITY || "6",
    });
  } catch (err) {
    console.warn("[ANTI-TAMPER] Telegram Topic 6 alert notice:", err.message);
  }

  // Note: Topic 35 dispatch has been completely stopped per admin instruction to prevent alert spam in Chat Deletions Topic.
}

/**
 * POST /api/security/tamper-alert
 * Receives tamper beacon from client-side sensor
 */
router.post("/tamper-alert", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const { detail, context, clientStrikes, deviceInfo, pageUrl, user: clientUser, forensics } = req.body || {};

    // 1. Resolve Authenticated User if present
    let authUser = null;
    let userId = null;
    try {
      const authHeader = req.headers["authorization"];
      const token =
        (authHeader ? authHeader.split(" ")[1] : null) ||
        req.cookies?.fsm_token ||
        req.cookies?.token ||
        req.cookies?.vault_token;
      if (token) {
        authUser = jwt.verify(token, JWT_SECRET);
        userId = authUser.id;
      }
    } catch (_) {}

    // Fetch full user details from Firestore if possible, fallback to clientUser or Guest
    let fullUser = authUser || clientUser || { name: "Guest Scholar", email: "N/A", mobile: "N/A" };
    if (clientUser && (!fullUser.email || fullUser.email === "N/A")) {
      fullUser = {
        name: clientUser.name || fullUser.name,
        email: clientUser.email || fullUser.email,
        mobile: clientUser.mobile || fullUser.mobile,
        college: clientUser.college || fullUser.college,
        year: clientUser.year || fullUser.year,
      };
    }
    if (db && userId && userId !== "admin-root") {
      try {
        const snap = await db.collection("users").doc(userId).get();
        if (snap.exists) {
          const decrypted = decryptUserObject(snap.data());
          fullUser = {
            id: userId,
            name: decrypted.name || fullUser.name,
            email: decrypted.email || fullUser.email,
            mobile: decrypted.mobile || fullUser.mobile,
            college: decrypted.college || fullUser.college,
            year: decrypted.year || fullUser.year,
          };
        }
      } catch (_) {}
    }

    // 2. Track Strike Count per User ID, Anonymous Guest UID, or IP Address
    const guestUid = clientUser?.guestUid || null;
    const strikeKey = userId || guestUid || clientIp;
    const now = Date.now();
    let currentRecord = tamperStrikes.get(strikeKey) || { count: 0, violations: [], lastAt: 0 };

    // De-bounce rapid multi-detector bursts: Enforce session separation
    const timeSinceLast = now - (currentRecord.lastAt || 0);
    const clientStrikeNum = Number(clientStrikes);

    if (!isNaN(clientStrikeNum) && clientStrikeNum > 0) {
      // Sync strictly with verified client strike state
      currentRecord.count = clientStrikeNum;
    } else if (timeSinceLast > 3500 || currentRecord.count === 0) {
      // Only increment if at least 3.5 seconds have elapsed since last strike event
      currentRecord.count += 1;
    }

    currentRecord.lastAt = now;
    currentRecord.violations.push({
      time: new Date().toISOString(),
      detail: detail || "Core API tampering",
      ip: clientIp,
      guestUid,
    });
    tamperStrikes.set(strikeKey, currentRecord);

    const effectiveStrikes = currentRecord.count;

    // 3. Check 3-Strike Threshold
    if (effectiveStrikes >= 3) {
      console.warn(`[ANTI-TAMPER] 🚨 3RD STRIKE DETECTED for ${strikeKey} (${fullUser.name} • ${fullUser.email}). AUTO-BLOCKING!`);

      // A. Permanent Block in Firestore Database (if user was authenticated)
      if (db && userId && userId !== "admin-root") {
        try {
          await db.collection("users").doc(userId).update({
            isBlocked: true,
            blockedReason: `Security Violation: Auto-blocked for repeated script/console tampering (3 strikes)`,
            blockedAt: new Date().toISOString(),
          });
          console.warn(`[ANTI-TAMPER] 🔒 User ${userId} (${fullUser.email}) set to isBlocked: true in Firestore.`);
        } catch (dbErr) {
          console.error("[ANTI-TAMPER] DB block error:", dbErr.message);
        }
      }

      // B. Permanent Block in Turso Database
      if (tursoClient && fullUser.email && fullUser.email !== "N/A" && fullUser.email !== "Unauthenticated Guest") {
        try {
          await tursoClient.execute({
            sql: `UPDATE users SET is_blocked = 1 WHERE email = ?`,
            args: [fullUser.email.toLowerCase().trim()],
          }).catch(() => {});
        } catch (_) {}
      }

      // C. 24-Hour IP & Device Dual-Key Detention in Firewall
      const incidentId = req.body?.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;
      const rawDeviceId = (req.headers["x-device-id"] || req.cookies?.fsm_device_id || req.body?.deviceId || forensics?.deviceHash || guestUid || "").trim();

      jailSpecificIp(clientIp, `Repeated client script tampering: 3 strikes exceeded (${fullUser.name} • ${fullUser.email || clientIp})`, 24 * 60 * 60 * 1000, incidentId, rawDeviceId);
      if (rawDeviceId) {
        jailSpecificDevice(rawDeviceId, `Repeated client script tampering: 3 strikes exceeded (${fullUser.name})`, 24 * 60 * 60 * 1000, incidentId, clientIp);
      }

      // D. Dispatch Critical Ban Alert to Telegram Supergroup Topic 6
      await dispatchTamperTelegramAlert({
        user: fullUser,
        ip: clientIp,
        detail: detail || "Repeated script tampering violations",
        strikeCount: effectiveStrikes,
        isBlocked: true,
        deviceInfo,
        pageUrl,
        forensics,
      });

      const detentionMs = 24 * 60 * 60 * 1000;
      const autoReleaseTime = Date.now() + detentionMs;

      return res.json({
        success: true,
        action: "BAN",
        incidentId,
        strikeCount: effectiveStrikes,
        isBlocked: true,
        durationMs: detentionMs,
        durationLabel: "24 Hours",
        policyName: "Client Script / DevTools Tamper (Strike 3)",
        autoReleasePolicy: "✅ Auto-release after 24h",
        adminPardon: "Can be instantly pardoned by Administrator in Telegram Topic 750",
        targetTimestamp: autoReleaseTime,
        autoReleaseAt: new Date(autoReleaseTime).toISOString(),
        message: `Security Violation: Repeated script tampering detected (3/3 strikes). Your connection is detained in security quarantine for 24 Hours. Incident: ${incidentId}`,
      });
    }

    // Less than 3 strikes: Warning Mode
    console.warn(`[ANTI-TAMPER] ⚠️ Strike ${effectiveStrikes}/3 for ${strikeKey} (${fullUser.email}). Warning dispatched.`);

    // Dispatch Warning Alert to Telegram Supergroup Topic 6
    await dispatchTamperTelegramAlert({
      user: fullUser,
      ip: clientIp,
      detail: detail || "Script modification attempt",
      strikeCount: effectiveStrikes,
      isBlocked: false,
      deviceInfo,
      pageUrl,
      forensics,
    });

    return res.json({
      success: true,
      action: "WARN",
      strikeCount: effectiveStrikes,
      isBlocked: false,
      warningMessage: `⚠️ Security Warning (Attempt ${effectiveStrikes} of 3): Unauthorized script modification or console tampering detected. Continuing will result in an immediate permanent ban and database termination.`,
    });
  } catch (err) {
    console.error("[ANTI-TAMPER-ERROR]", err);
    return res.status(500).json({ success: false, message: "Security engine error: " + err.message });
  }
});

/**
 * POST /api/security/anti-bot-alert
 * Dispatches Anti-Bot & Multi-Account Forensics Alert strictly to FSM Security Bot Topic 6
 */
router.post("/anti-bot-alert", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const { user, reason, deviceSpecs, accountsDetected } = req.body || {};

    const messageText = [
      `🤖 <b>[SECURITY ALERT: ANTI-BOT & MULTI-ACCOUNT FORENSICS]</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Student:</b> ${user?.name || "Suspicious Device Session"}`,
      `📧 <b>Email:</b> <code>${user?.email || "N/A"}</code>`,
      `🌐 <b>IP Address:</b> <code>${clientIp}</code>`,
      `💻 <b>Hardware Spec:</b> ${deviceSpecs?.label || (deviceSpecs?.cores ? `${deviceSpecs.cores} Cores, ${deviceSpecs.memoryGB}GB RAM` : "Client Hardware")}`,
      accountsDetected ? `👥 <b>Linked Accounts Detected:</b> <code>${accountsDetected}</code>` : null,
      `⚠️ <b>Forensic Anomaly:</b>`,
      `<i>${reason || "Automated headless browser or multi-account clone cluster detected."}</i>`,
      `🎯 <b>Route Target:</b> <b>FSM Security Supergroup Topic 6</b>`,
      `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendTelegramAuthNotice({
      event: "SECURITY_ALERT",
      user: user || { name: "Anti-Bot Forensics", email: "bot-detection@studyvault.in", ip: clientIp },
      method: "Advanced Anti-Bot & Forensics Engine",
      detail: messageText,
    });

    return res.json({ success: true, message: "Forensic alert recorded." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/security/jail-appeal
 * Allows a quarantined user or shared-campus student to appeal detention
 * Strictly dispatches to Topic 750 (🛡️ IP Jail & Security Appeals)
 */
router.post("/jail-appeal", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const { incidentId, name, email, mobile, message, deviceId } = req.body || {};
    const effectiveDevId = (deviceId || req.headers["x-device-id"] || req.cookies?.fsm_device_id || "").trim();

    const dedupKey = `${clientIp}_${effectiveDevId}`;
    const now = Date.now();
    if (recentAppeals.has(dedupKey) && (now - recentAppeals.get(dedupKey) < 3 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        message: "An appeal was recently submitted for this connection. Please wait a few moments for admin review in Telegram Topic 750.",
      });
    }
    recentAppeals.set(dedupKey, now);

    const safeIncId = (incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`).trim();

    const messageText = [
      `🛡️ <b>[SECURITY QUARANTINE / IP JAIL APPEAL]</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🆔 <b>Incident ID:</b> <code>${safeHtml(safeIncId)}</code>`,
      `👤 <b>Student Name:</b> ${safeHtml(name || "Student Visitor")}`,
      `📧 <b>Email:</b> <code>${safeHtml(email || "Not Provided")}</code>`,
      mobile ? `📱 <b>Mobile:</b> <code>${safeHtml(mobile)}</code>` : null,
      `🌐 <b>Public IP:</b> <code>${safeHtml(clientIp)}</code>`,
      effectiveDevId ? `📱 <b>Device Hash:</b> <code>${safeHtml(effectiveDevId.slice(0, 16))}...</code>` : null,
      `💬 <b>Appeal Statement:</b>`,
      `<i>${safeHtml(message || "Student submitted pardon request for security detention.")}</i>`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🎯 <b>Target:</b> <b>🛡️ IP Jail & Security Appeals (Topic 750)</b>`,
      `⚡ <b>Admin Action Choices:</b>`,
      `• <b>Pardon Device Only:</b> Releases only this student's device (safeguards campus network)`,
      `• <b>Pardon Entire IP:</b> Unjails the entire public IP address for all students`,
      `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ]
      .filter(Boolean)
      .join("\n");

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "📱 Pardon Device Only", callback_data: `appeal:pardon_dev:${safeIncId}:${effectiveDevId || "none"}` },
          { text: "🌐 Pardon Entire IP", callback_data: `appeal:pardon_ip:${safeIncId}:${clientIp}` },
        ],
        [
          { text: "❌ Reject Appeal", callback_data: `appeal:deny:${safeIncId}` },
        ]
      ],
    };

    // Dispatch strictly to Topic 750 in Security Supergroup
    await sendTelegramAuthNotice({
      event: "IP_JAIL_APPEAL",
      user: {
        name: name || "Appealing Student",
        email: email || "N/A",
        mobile: mobile || "N/A",
        ip: clientIp,
      },
      method: "Web Security Appeal Form",
      detail: messageText,
      threadId: process.env.TELEGRAM_TOPIC_IP_APPEAL || "750",
      replyMarkup,
    });

    // Save record to database if available
    if (db) {
      try {
        await db.collection("jail_appeals").add({
          incidentId: safeIncId,
          name: name || "Student",
          email: email || "",
          mobile: mobile || "",
          message: message || "",
          ip: clientIp,
          deviceId: effectiveDevId,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      } catch (_) {}
    }

    return res.json({
      success: true,
      message: `Appeal for incident ${safeIncId} has been successfully logged and sent to Administrator in Telegram Topic 750.`,
      incidentId: safeIncId,
    });
  } catch (err) {
    console.error("[SECURITY-APPEAL-ERROR]", err);
    return res.status(500).json({ success: false, message: "Appeal processing error: " + err.message });
  }
});

/**
 * GET /api/security/status
 * Check current IP & Device security detention status
 */
router.get("/status", (req, res) => {
  const clientIp = getClientIp(req);
  const deviceId = (req.headers["x-device-id"] || req.cookies?.fsm_device_id || req.query?.deviceId || "").trim();
  const status = getJailStatus(clientIp, deviceId);
  return res.json({
    success: true,
    ip: clientIp,
    ...status,
  });
});

function clearTamperStrikes(key) {
  if (key) {
    tamperStrikes.delete(key);
  }
}
router.clearTamperStrikes = clearTamperStrikes;

module.exports = router;

