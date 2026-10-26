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
const { jailSpecificIp, getClientIp } = require("../middleware/ipJail");
const { sendTelegramAuthNotice } = require("../services/emailService");
const { decryptUserObject } = require("../utils/cryptoVault");

// Memory cache to track strikes per IP & user (TTL 24 hours)
const tamperStrikes = new Map(); // key -> { count: number, violations: Array, lastAt: number }

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

/**
 * Dispatch Telegram Security Alert directly to Supergroup Topic 6 & Topic 35
 */
async function dispatchTamperTelegramAlert({
  user,
  ip,
  detail,
  strikeCount,
  isBlocked,
  deviceInfo,
  pageUrl,
}) {
  const isBanned = strikeCount >= 3 || isBlocked;
  const statusBadge = isBanned
    ? "🚫 <b>[CRITICAL: USER AUTO-BLOCKED - 3RD DEVTOOLS TAMPER ATTEMPT]</b>"
    : `⚠️ <b>[SECURITY WARNING: DEVTOOLS / CONSOLE INSPECTION DETECTED (Strike ${strikeCount}/3)]</b>`;

  const actionText = isBanned
    ? "❌ <b>Account Permanently Banned in Database & IP Jailed for 24 Hours</b>"
    : "⚠️ <b>On-Screen Warning Modal Displayed to Student</b>";

  const messageText = [
    statusBadge,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${safeHtml(user.name || "Unauthenticated Guest")}`,
    `📧 <b>Email:</b> <code>${safeHtml(user.email || "N/A")}</code>`,
    user.mobile && user.mobile !== "N/A" ? `📱 <b>Mobile:</b> <code>${safeHtml(user.mobile)}</code>` : null,
    user.college && user.college !== "N/A" ? `🏛️ <b>College:</b> ${safeHtml(user.college)}` : null,
    user.year && user.year !== "N/A" ? `🎓 <b>Year:</b> ${safeHtml(user.year)}` : null,
    `🌐 <b>IP Address:</b> <code>${safeHtml(ip)}</code>`,
    pageUrl ? `📍 <b>Page / Route:</b> <code>${safeHtml(pageUrl)}</code>` : null,
    `💻 <b>Client / Device:</b> ${safeHtml(deviceInfo || "Browser Console / DevTools")}`,
    `⚠️ <b>Tampering Detected:</b>`,
    `<i>${safeHtml(detail || "Attempted to open DevTools / Inspect Mode")}</i>`,
    `🎯 <b>Total Strikes:</b> <b>${strikeCount} of 3</b>`,
    `🛡️ <b>Action Taken:</b> ${actionText}`,
    `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  ]
    .filter(Boolean)
    .join("\n");

  // 1. Dispatch directly to Security Supergroup Topic 6 (@fsm_security_otp_bot)
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

  // 2. Also dispatch to Chat Audit Supergroup Topic 35 (@fsm_chat_bot) if configured
  const chatAuditToken = (process.env.TELEGRAM_CHAT_AUDIT_BOT_TOKEN || "").trim();
  const chatAuditGroup = (process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID || "").trim();
  const tamperAuditTopic = (process.env.TELEGRAM_CHAT_TOPIC_TAMPER_AUDIT || "35").trim();
  if (chatAuditToken && chatAuditGroup) {
    try {
      await fetch(`https://api.telegram.org/bot${chatAuditToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatAuditGroup,
          message_thread_id: Number(tamperAuditTopic) || 35,
          text: messageText,
          parse_mode: "HTML",
        }),
      });
    } catch (auditErr) {
      console.warn("[ANTI-TAMPER] Chat Audit Topic 35 notice:", auditErr.message);
    }
  }
}

/**
 * POST /api/security/tamper-alert
 * Receives tamper beacon from client-side sensor
 */
router.post("/tamper-alert", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const { detail, context, clientStrikes, deviceInfo, pageUrl, user: clientUser } = req.body || {};

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
    let currentRecord = tamperStrikes.get(strikeKey) || { count: 0, violations: [], lastAt: Date.now() };

    currentRecord.count += 1;
    currentRecord.lastAt = Date.now();
    currentRecord.violations.push({
      time: new Date().toISOString(),
      detail: detail || "Core API tampering",
      ip: clientIp,
      guestUid,
    });
    tamperStrikes.set(strikeKey, currentRecord);

    const effectiveStrikes = Math.max(currentRecord.count, Number(clientStrikes || 0));

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

      // C. 24-Hour IP Detention in Firewall (Jails IP for all unauthenticated or authenticated traffic)
      jailSpecificIp(clientIp, `Repeated client script tampering: 3 strikes exceeded (${fullUser.name} • ${fullUser.email || clientIp})`);

      // D. Dispatch Critical Ban Alert to Telegram Supergroup Topic 6
      await dispatchTamperTelegramAlert({
        user: fullUser,
        ip: clientIp,
        detail: detail || "Repeated script tampering violations",
        strikeCount: effectiveStrikes,
        isBlocked: true,
        deviceInfo,
        pageUrl,
      });

      return res.json({
        success: true,
        action: "BAN",
        strikeCount: effectiveStrikes,
        isBlocked: true,
        message: "Security Violation: Account permanently blocked for repeated script tampering. Your IP has been jailed.",
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

function clearTamperStrikes(key) {
  if (key) {
    tamperStrikes.delete(key);
  }
}
router.clearTamperStrikes = clearTamperStrikes;

module.exports = router;

