/**
 * ============================================================================
 * 🛡️ STUDENT SESSIONS & ACTIVE DEVICE SECURITY SERVICE (FIRESTORE NATIVE)
 * ============================================================================
 * - 100% Pure Firebase Firestore (Zero Turso / Zero External DB Dependency)
 * - Detailed Human-Identifiable Device Names (Brand, OS, Browser, Screen)
 * - Individual Device Remote Termination (Kill any specific phone or laptop)
 * - Current Device Logout from Active Sessions List
 * - All Other Devices Logout (Keep current phone active)
 * - Complete Multi-Device Logout
 * - Rolling 10 Security Activity History (Capped on User Document - Zero Quota Bloat)
 * - In-Memory Revoked Session Cache for 0ms Instant Rejection
 * ============================================================================
 */

const crypto = require("crypto");
const { db } = require("../firebase");

// In-memory set of revoked session IDs for sub-millisecond middleware validation
const memoryRevokedSessions = new Set();
// Throttle session last_active updates in memory (write at most once every 10 mins per session)
const sessionActiveThrottle = new Map();

/**
 * Bounds in-memory caches to prevent memory leaks over long server uptimes
 */
function pruneSessionCaches() {
  const now = Date.now();
  if (sessionActiveThrottle.size > 2000) {
    for (const [sid, timestamp] of sessionActiveThrottle.entries()) {
      if (now - timestamp > 24 * 3600 * 1000) {
        sessionActiveThrottle.delete(sid);
      }
    }
    if (sessionActiveThrottle.size > 5000) {
      sessionActiveThrottle.clear();
    }
  }

  if (memoryRevokedSessions.size > 10000) {
    const items = Array.from(memoryRevokedSessions);
    for (let i = 0; i < 5000; i++) {
      memoryRevokedSessions.delete(items[i]);
    }
  }
}

/**
 * Format an ultra-clear, easily identifiable human device name
 */
function formatDeviceIdentifier({ ua = "", deviceSpecs = null, req = null }) {
  let brand = "";
  let os = "Unknown OS";
  let browser = "Browser";
  let deviceType = "desktop";
  let screenStr = (deviceSpecs && deviceSpecs.screen) ? String(deviceSpecs.screen) : "";
  const modelFromSpecs = (deviceSpecs && deviceSpecs.model) ? String(deviceSpecs.model).trim() : "";

  // 1. Android Brand & Model detection from UA or model
  if (/Android/i.test(ua) || (deviceSpecs && deviceSpecs.isMobile && /Linux/i.test(ua))) {
    deviceType = "mobile";
    os = "Android";
    const osVer = ua.match(/Android\s([0-9\.]+)/i);
    if (osVer) os = `Android ${osVer[1]}`;

    const checkStr = `${ua} ${modelFromSpecs}`;
    if (/SM-|Samsung/i.test(checkStr)) brand = modelFromSpecs ? `Samsung Galaxy (${modelFromSpecs})` : "Samsung Galaxy";
    else if (/Redmi|MI\s|POCO|Xiaomi|2201|2109|2203|2210/i.test(checkStr)) brand = modelFromSpecs ? `Xiaomi / Redmi (${modelFromSpecs})` : "Xiaomi / Redmi";
    else if (/Pixel/i.test(checkStr)) brand = modelFromSpecs ? `Google Pixel (${modelFromSpecs})` : "Google Pixel";
    else if (/OnePlus|CPH2/i.test(checkStr)) brand = modelFromSpecs ? `OnePlus (${modelFromSpecs})` : "OnePlus";
    else if (/Vivo|V2\d{3}/i.test(checkStr)) brand = modelFromSpecs ? `Vivo (${modelFromSpecs})` : "Vivo";
    else if (/Oppo|CPH/i.test(checkStr)) brand = modelFromSpecs ? `Oppo (${modelFromSpecs})` : "Oppo";
    else if (/Realme|RMX/i.test(checkStr)) brand = modelFromSpecs ? `Realme (${modelFromSpecs})` : "Realme";
    else if (/Moto/i.test(checkStr)) brand = modelFromSpecs ? `Motorola (${modelFromSpecs})` : "Motorola";
    else if (modelFromSpecs) brand = modelFromSpecs;
    else brand = "Android Phone";
  } else if (/iPhone/i.test(ua)) {
    deviceType = "mobile";
    brand = "Apple iPhone";
    const iosVer = ua.match(/OS\s([0-9_]+)/i);
    os = iosVer ? `iOS ${iosVer[1].replace(/_/g, ".")}` : "iOS";
  } else if (/iPad/i.test(ua)) {
    deviceType = "tablet";
    brand = "Apple iPad";
    const iosVer = ua.match(/OS\s([0-9_]+)/i);
    os = iosVer ? `iPadOS ${iosVer[1].replace(/_/g, ".")}` : "iPadOS";
  } else if (/Windows NT 10.0/i.test(ua)) {
    deviceType = "desktop";
    brand = "Windows PC";
    os = "Windows 10/11";
  } else if (/Windows/i.test(ua)) {
    deviceType = "desktop";
    brand = "Windows PC";
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceType = "desktop";
    brand = "Apple Mac";
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    deviceType = "desktop";
    brand = "Linux PC";
    os = "Linux";
  }

  // 2. Browser detection
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Brave/i.test(ua)) browser = "Brave Browser";
  else if (/Chrome\//i.test(ua)) browser = /Mobile/i.test(ua) ? "Chrome Mobile" : "Google Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Opera|OPR\//i.test(ua)) browser = "Opera";

  // Build clean, easily identifiable title
  let fullTitle = `${brand} (${os}) • ${browser}`;
  if (screenStr && screenStr !== "0x0") {
    fullTitle += ` • [${screenStr}]`;
  }

  return {
    deviceName: fullTitle,
    deviceType,
    brand: brand || "Device",
    os,
    browser,
    screen: screenStr,
  };
}

/**
 * Record a New Active User Session in Firestore & Log Activity
 */
async function recordActiveSession({ sessionId, userId, req, tokenVersion = 1, deviceSpecs = null }) {
  if (!sessionId || !userId) return null;

  try {
    const ua = req.headers?.["user-agent"] || "";
    const parsed = formatDeviceIdentifier({ ua, deviceSpecs: deviceSpecs || req.body?.deviceSpecs, req });
    const ip = (
      req.headers?.["cf-connecting-ip"] ||
      req.headers?.["x-forwarded-for"]?.split(",")[0] ||
      req.ip ||
      "127.0.0.1"
    ).trim();

    const city = req.headers?.["cf-ipcity"] || "";
    const country = req.headers?.["cf-ipcountry"] || "";
    const location = city && country ? `${city}, ${country}` : (country || "India");

    const now = Date.now();

    const newSession = {
      sessionId: String(sessionId),
      deviceName: parsed.deviceName,
      deviceType: parsed.deviceType,
      brand: parsed.brand,
      os: parsed.os,
      browser: parsed.browser,
      ipAddress: ip,
      location,
      tokenVersion: Number(tokenVersion),
      createdAt: now,
      lastActiveAt: now,
    };

    const newLog = {
      id: `log_${now}_${crypto.randomBytes(3).toString("hex")}`,
      action: "LOGIN",
      deviceName: parsed.deviceName,
      deviceType: parsed.deviceType,
      ipAddress: ip,
      location,
      details: `Signed in successfully on ${parsed.brand} (${location})`,
      createdAt: now,
    };

    if (db && userId !== "admin-root") {
      const userRef = db.collection("users").doc(String(userId));
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        let currentSessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        let currentLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];

        // Filter out expired sessions (> 30 days) and remove duplicate sessionId if any
        const cutoff = now - (30 * 24 * 3600 * 1000);
        currentSessions = currentSessions.filter(s => s.sessionId !== sessionId && Number(s.lastActiveAt) > cutoff);
        // Prepend new session (Max 10 active devices)
        currentSessions.unshift(newSession);
        if (currentSessions.length > 10) currentSessions = currentSessions.slice(0, 10);

        // Prepend new security log (Max 10 security logs - Ring Buffer)
        currentLogs.unshift(newLog);
        if (currentLogs.length > 10) currentLogs = currentLogs.slice(0, 10);

        await userRef.update({
          activeSessions: currentSessions,
          securityLogs: currentLogs,
          lastLoginAt: new Date(now).toISOString(),
        }).catch(() => {});
      }
    }

    return newSession;
  } catch (err) {
    console.warn("[STUDENT-SESSION] recordActiveSession error:", err.message);
    return null;
  }
}

/**
 * Update session last active time in Firestore (Throttled every 10 minutes)
 */
async function touchSessionActive(userId, sessionId) {
  if (!userId || !sessionId || userId === "admin-root") return;
  const now = Date.now();
  const last = sessionActiveThrottle.get(sessionId) || 0;
  if (now - last < 10 * 60 * 1000) return; // 10-minute throttle

  pruneSessionCaches();
  sessionActiveThrottle.set(sessionId, now);

  if (!db) return;
  try {
    const userRef = db.collection("users").doc(String(userId));
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const uData = userSnap.data() || {};
      let sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
      let updated = false;
      sessions = sessions.map(s => {
        if (s.sessionId === sessionId) {
          updated = true;
          return { ...s, lastActiveAt: now };
        }
        return s;
      });
      if (updated) {
        await userRef.update({ activeSessions: sessions }).catch(() => {});
      }
    }
  } catch (_) {}
}

/**
 * Get All Active Sessions for a User
 */
async function getUserActiveSessions(userId, currentSessionId = "") {
  if (!userId) return [];
  try {
    if (userId === "admin-root") {
      return [{
        sessionId: currentSessionId || "admin-session",
        deviceName: "Central Administration Console",
        deviceType: "desktop",
        ipAddress: "127.0.0.1",
        location: "System Core",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        isCurrentDevice: true,
      }];
    }

    if (!db) return [];
    const userSnap = await db.collection("users").doc(String(userId)).get();
    if (!userSnap.exists) return [];

    const uData = userSnap.data() || {};
    let sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];

    // Filter out sessions older than 30 days
    const cutoff = Date.now() - (30 * 24 * 3600 * 1000);
    sessions = sessions.filter(s => Number(s.lastActiveAt) > cutoff && !memoryRevokedSessions.has(s.sessionId));

    // If currentSessionId exists but is not in list, add it
    if (currentSessionId && !sessions.some(s => s.sessionId === currentSessionId)) {
      sessions.unshift({
        sessionId: currentSessionId,
        deviceName: "Active Device (Verified Session)",
        deviceType: "desktop",
        ipAddress: "Active IP",
        location: "India",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    return sessions.map(sess => ({
      ...sess,
      isCurrentDevice: Boolean(currentSessionId && sess.sessionId === currentSessionId),
    }));
  } catch (err) {
    console.warn("[STUDENT-SESSION] getUserActiveSessions error:", err.message);
    return [];
  }
}

/**
 * Terminate a Single Specific Session (Remote Logout on any device, or current device)
 */
async function terminateSingleSession(userId, sessionIdToTerminate, terminatedByDevice = "Current Device") {
  if (!userId || !sessionIdToTerminate) return false;
  try {
    const sId = String(sessionIdToTerminate);
    const uId = String(userId);

    // Instant in-memory rejection
    pruneSessionCaches();
    memoryRevokedSessions.add(sId);

    if (db && uId !== "admin-root") {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        let sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        let securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];

        const targetSess = sessions.find(s => s.sessionId === sId);
        const targetDeviceName = targetSess?.deviceName || "Device";

        // Remove terminated session from active list
        sessions = sessions.filter(s => s.sessionId !== sId);

        // Prepend Security Log
        securityLogs.unshift({
          id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          action: "DEVICE_TERMINATED",
          deviceName: targetDeviceName,
          details: `Session on "${targetDeviceName}" was manually terminated from ${terminatedByDevice}`,
          createdAt: Date.now(),
        });
        if (securityLogs.length > 10) securityLogs = securityLogs.slice(0, 10);

        await userRef.update({
          activeSessions: sessions,
          securityLogs: securityLogs,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return true;
  } catch (err) {
    console.warn("[STUDENT-SESSION] terminateSingleSession error:", err.message);
    return false;
  }
}

/**
 * Terminate All Other Sessions (Keep Current Device Active)
 */
async function terminateAllOtherSessions(userId, currentSessionId = "") {
  if (!userId) return false;
  try {
    const uId = String(userId);
    const curId = String(currentSessionId || "");

    if (db && uId !== "admin-root") {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        let sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        let securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];

        // Revoke all session IDs other than current
        sessions.forEach(s => {
          if (s.sessionId !== curId) {
            memoryRevokedSessions.add(s.sessionId);
          }
        });

        // Keep only current session
        sessions = sessions.filter(s => s.sessionId === curId);

        // Prepend Security Log
        securityLogs.unshift({
          id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          action: "ALL_OTHER_DEVICES_TERMINATED",
          details: `Revoked all other active sessions across phones and PCs`,
          createdAt: Date.now(),
        });
        if (securityLogs.length > 10) securityLogs = securityLogs.slice(0, 10);

        await userRef.update({
          activeSessions: sessions,
          securityLogs: securityLogs,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return true;
  } catch (err) {
    console.warn("[STUDENT-SESSION] terminateAllOtherSessions error:", err.message);
    return false;
  }
}

/**
 * Terminate ALL Sessions for User (Complete Logout Everywhere)
 */
async function terminateAllUserSessions(userId) {
  if (!userId) return false;
  try {
    const uId = String(userId);

    if (db && uId !== "admin-root") {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        let sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        let securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];

        sessions.forEach(s => memoryRevokedSessions.add(s.sessionId));

        // Prepend Security Log
        securityLogs.unshift({
          id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          action: "ALL_DEVICES_LOGGED_OUT",
          details: `All sessions logged out across all devices`,
          createdAt: Date.now(),
        });
        if (securityLogs.length > 10) securityLogs = securityLogs.slice(0, 10);

        await userRef.update({
          activeSessions: [],
          securityLogs: securityLogs,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return true;
  } catch (err) {
    console.warn("[STUDENT-SESSION] terminateAllUserSessions error:", err.message);
    return false;
  }
}

/**
 * Check if a session ID is revoked (0ms memory check)
 */
function isSessionRevokedSync(sessionId) {
  if (!sessionId) return false;
  return memoryRevokedSessions.has(String(sessionId));
}

async function isSessionRevoked(sessionId) {
  return isSessionRevokedSync(sessionId);
}

/**
 * Get Last 10 Security Updates for User from Firestore
 */
async function getUserSecurityLogs(userId, limit = 10) {
  if (!userId) return [];
  try {
    if (userId === "admin-root") return [];
    if (!db) return [];

    const userSnap = await db.collection("users").doc(String(userId)).get();
    if (!userSnap.exists) return [];

    const uData = userSnap.data() || {};
    const logs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
    return logs.slice(0, Number(limit) || 10);
  } catch (err) {
    console.warn("[STUDENT-SESSION] getUserSecurityLogs error:", err.message);
    return [];
  }
}

/**
 * Prune inactive sessions older than X days across all students in Firestore
 */
async function pruneInactiveSessions(days = 30) {
  const cutoff = Date.now() - (Number(days || 30) * 24 * 3600 * 1000);
  let cleanedCount = 0;
  pruneSessionCaches();
  if (!db) return { success: true, count: 0 };
  try {
    const snap = await db.collection("users").get();
    for (const doc of snap.docs) {
      const uData = doc.data() || {};
      const sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
      const valid = sessions.filter(s => Number(s.lastActiveAt) > cutoff);
      if (valid.length !== sessions.length) {
        cleanedCount += (sessions.length - valid.length);
        await doc.ref.update({ activeSessions: valid }).catch(() => {});
      }
    }
    return { success: true, count: cleanedCount };
  } catch (err) {
    return { success: false, error: err.message, count: 0 };
  }
}

/**
 * Flush revoked session in-memory caches
 */
async function cleanRevokedSessions() {
  memoryRevokedSessions.clear();
  sessionActiveThrottle.clear();
  return { success: true, message: "Revoked session cache cleared." };
}

module.exports = {
  pruneInactiveSessions,
  cleanRevokedSessions,
  recordActiveSession,
  touchSessionActive,
  getUserActiveSessions,
  terminateSingleSession,
  terminateAllOtherSessions,
  terminateAllUserSessions,
  isSessionRevoked,
  isSessionRevokedSync,
  getUserSecurityLogs,
  formatDeviceIdentifier,
};
