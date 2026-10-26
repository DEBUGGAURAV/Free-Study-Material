/**
 * 🛡️ Category 1 Feature 3: Device Fingerprinting & New Login Alert Service
 * Detects unrecognized devices / browsers and dispatches instant security alerts.
 */

const crypto = require("crypto");
const { db } = require("../firebase");

/**
 * Extracts friendly OS and Browser description from User-Agent string
 */
function parseUserAgent(uaString = "") {
  const ua = String(uaString || "");
  let browser = "Web Browser";
  let os = "Unknown OS";

  // OS Detection
  if (/Windows NT 10.0/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6.3/i.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6.1/i.test(ua)) os = "Windows 7";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser Detection
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Google Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Apple Safari";
  else if (/Firefox\//i.test(ua)) browser = "Mozilla Firefox";
  else if (/OPR\//i.test(ua)) browser = "Opera";

  return { browser, os, summary: `${browser} on ${os}` };
}

/**
 * Generates a deterministic digital fingerprint hash for the device
 */
function computeDeviceHash(userId, clientFingerprint, userAgent) {
  const uaInfo = parseUserAgent(userAgent);
  const normalizedUa = `${uaInfo.browser}|${uaInfo.os}`;
  const raw = `${userId}:${clientFingerprint || "std"}:${normalizedUa}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Evaluates login device, records device, and triggers alert if new
 * @param {object} user - User document
 * @param {object} req - Express request
 * @param {string} [clientFingerprint] - Client-side provided canvas/screen hash
 * @returns {Promise<{ isNewDevice: boolean, deviceSummary: string, knownDevicesCount: number }>}
 */
async function processLoginDevice(user, req, clientFingerprint = "") {
  if (!user || !user.id) {
    return { isNewDevice: false, deviceSummary: "Standard Device", knownDevicesCount: 1 };
  }

  const userAgent = req.headers["user-agent"] || "Unknown";
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "Unknown";
  const { summary: deviceSummary, browser, os } = parseUserAgent(userAgent);

  const deviceHash = computeDeviceHash(user.id, clientFingerprint, userAgent);
  const now = new Date().toISOString();

  let knownDevices = Array.isArray(user.knownDevices) ? [...user.knownDevices] : [];
  const existingDeviceIndex = knownDevices.findIndex((d) => d.hash === deviceHash);

  let isNewDevice = false;

  if (existingDeviceIndex !== -1) {
    // Update existing device's last seen timestamp and IP
    knownDevices[existingDeviceIndex].lastSeen = now;
    knownDevices[existingDeviceIndex].lastIp = ip;
  } else {
    // New device detected!
    isNewDevice = knownDevices.length > 0; // If they have 0 known devices, this is their first initial device

    const newDeviceEntry = {
      hash: deviceHash,
      summary: deviceSummary,
      browser,
      os,
      firstSeen: now,
      lastSeen: now,
      lastIp: ip,
    };

    // Cap at 10 devices
    knownDevices.unshift(newDeviceEntry);
    if (knownDevices.length > 10) {
      knownDevices = knownDevices.slice(0, 10);
    }
  }

  // Update user document in Firestore asynchronously
  if (db) {
    db.collection("users").doc(user.id).update({
      knownDevices,
      lastLoginDevice: deviceSummary,
      lastLoginAt: now,
      lastLoginIp: ip,
    }).catch((err) => {
      console.warn("[DEVICE-SECURITY] Failed to save device profile:", err.message);
    });
  }

  // Dispatch Security Alert on NEW device login
  if (isNewDevice) {
    try {
      const { sendTelegramAuthNotice } = require("./emailService");
      const scholarName = user.name || "Scholar";
      const scholarEmail = user.email || "N/A";
      const scholarMobile = user.mobile || "N/A";

      sendTelegramAuthNotice({
        event: "SECURITY_UPDATE",
        user: { name: scholarName, email: scholarEmail, mobile: scholarMobile },
        detail: `💻 <b>NEW DEVICE LOGIN ALERT</b>\n\n👤 <b>Scholar:</b> <code>${scholarName}</code>\n📧 <b>Email:</b> <code>${scholarEmail}</code>\n📱 <b>Device:</b> <code>${deviceSummary}</code>\n🌐 <b>IP Address:</b> <code>${ip}</code>\n🕒 <b>Time:</b> <code>${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</code>\n\n🛡️ <i>If this was not you, please change your password or tap "Logout from all devices" immediately.</i>`,
      }).catch(() => {});
    } catch (e) {
      console.warn("[DEVICE-SECURITY] Telegram alert notice:", e.message);
    }
  }

  return {
    isNewDevice,
    deviceSummary,
    knownDevicesCount: knownDevices.length,
  };
}

module.exports = {
  parseUserAgent,
  computeDeviceHash,
  processLoginDevice,
};
