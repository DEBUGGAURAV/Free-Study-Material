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
// Live in-memory cache for user security logs and sessions (instant response & fallback)
const userMemorySecurityLogs = new Map();
const userMemorySessions = new Map();

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

  if (userMemorySecurityLogs.size > 2000) {
    userMemorySecurityLogs.clear();
  }
  if (userMemorySessions.size > 2000) {
    userMemorySessions.clear();
  }
}

/**
 * Extract true client IP address behind Cloudflare CDN, Render reverse proxies, and direct TCP sockets.
 * Handles arrays, strings, port suffixes, IPv6 prefix stripping (::ffff:), and filters private proxy IPs.
 */
function extractClientIp(req) {
  if (!req) return "127.0.0.1";
  const headers = req.headers || {};

  // 1. Cloudflare Visitor IP (True original client IP)
  const cfIp = headers["cf-connecting-ip"];
  if (cfIp) {
    const val = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    if (typeof val === "string" && val.trim()) {
      const clean = val.trim().replace(/^::ffff:/, "");
      if (clean && clean !== "127.0.0.1" && clean !== "::1") return clean;
    }
  }

  // 2. Real-IP / True-Client-IP headers (Nginx, Caddy, CDNs)
  const realIp = headers["x-real-ip"] || headers["true-client-ip"] || headers["x-client-ip"];
  if (realIp) {
    const val = Array.isArray(realIp) ? realIp[0] : realIp;
    if (typeof val === "string" && val.trim()) {
      const clean = val.trim().replace(/^::ffff:/, "");
      if (clean && clean !== "127.0.0.1" && clean !== "::1") return clean;
    }
  }

  // 3. X-Forwarded-For header (handles array or comma-separated string)
  const fwd = headers["x-forwarded-for"];
  if (fwd) {
    const fwdStr = Array.isArray(fwd) ? fwd.join(",") : String(fwd);
    const ips = fwdStr
      .split(",")
      .map((s) => s.trim().replace(/^::ffff:/, "").split(":")[0])
      .filter(Boolean);

    // Prefer the first public, non-private IP
    const publicIp = ips.find((ip) => {
      if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return false;
      if (ip.startsWith("10.") || ip.startsWith("192.168.")) return false;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
      return true;
    });
    if (publicIp) return publicIp;
    if (ips[0] && ips[0] !== "127.0.0.1" && ips[0] !== "::1") return ips[0];
  }

  // 4. Express-resolved client IP (Respects app.set("trust proxy", true))
  if (req.ip && typeof req.ip === "string" && req.ip.trim()) {
    const clean = req.ip.trim().replace(/^::ffff:/, "");
    if (clean && clean !== "127.0.0.1" && clean !== "::1") return clean;
  }

  // 5. Socket remote address fallback
  const direct = req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (direct) {
    const clean = String(direct).trim().replace(/^::ffff:/, "");
    if (clean) return clean;
  }

  return "127.0.0.1";
}

/**
 * Decode common Android manufacturer model numbers to human-friendly brand names
 */
function decodeAndroidModel(rawModel) {
  if (!rawModel) return "";
  const m = String(rawModel).trim().replace(/['"]/g, "");
  if (!m || m.toLowerCase() === "k" || m.toLowerCase() === "android") return "";

  // Samsung Galaxy series
  if (/^SM-S9/i.test(m)) return `Samsung Galaxy S Series (${m})`;
  if (/^SM-S/i.test(m)) return `Samsung Galaxy S (${m})`;
  if (/^SM-A/i.test(m)) return `Samsung Galaxy A (${m})`;
  if (/^SM-M/i.test(m)) return `Samsung Galaxy M (${m})`;
  if (/^SM-F/i.test(m)) return `Samsung Galaxy Z (${m})`;
  if (/^SM-E/i.test(m)) return `Samsung Galaxy F (${m})`;
  if (/^SM-T/i.test(m)) return `Samsung Galaxy Tab (${m})`;
  if (/^SM-G/i.test(m)) return `Samsung Galaxy (${m})`;

  // Xiaomi / Redmi / POCO models
  if (/^2[1-5]\d{2}[0-9A-Z]+/i.test(m) || /Redmi|Xiaomi|POCO/i.test(m)) {
    return `Xiaomi / Redmi (${m})`;
  }

  // OnePlus & Oppo models
  if (/^CPH2[0-9]{3}/i.test(m) || /OnePlus/i.test(m)) return `OnePlus (${m})`;
  if (/^CPH[0-9]{3}/i.test(m) || /OPPO/i.test(m)) return `Oppo (${m})`;

  // Realme models
  if (/^RMX[0-9]{4}/i.test(m) || /Realme/i.test(m)) return `Realme (${m})`;

  // Vivo / iQOO models
  if (/^V2[0-9]{3}/i.test(m) || /Vivo|iQOO/i.test(m)) return `Vivo (${m})`;

  // Google Pixel
  if (/Pixel/i.test(m)) return `Google Pixel (${m})`;

  // Motorola
  if (/Moto|XT[0-9]{4}/i.test(m)) return `Motorola (${m})`;

  return m;
}

/**
 * Format an ultra-clear, easily identifiable human device name
 */
function formatDeviceIdentifier({ ua = "", deviceSpecs = null, req = null }) {
  // If client provided a pre-formatted, rich device name, prioritize it!
  if (deviceSpecs && typeof deviceSpecs.deviceName === "string" && deviceSpecs.deviceName.trim().length > 3) {
    const cleanName = deviceSpecs.deviceName.trim().slice(0, 100);
    return {
      deviceName: cleanName,
      deviceType: deviceSpecs.isMobile ? "mobile" : (deviceSpecs.deviceType || "desktop"),
      brand: deviceSpecs.brand || "Student Device",
      os: deviceSpecs.os || "OS",
      browser: deviceSpecs.browser || "Browser",
      screen: deviceSpecs.screen || "",
    };
  }

  // Extract from Client Hints headers if available
  const chPlatform = req?.headers?.["sec-ch-ua-platform"] ? String(req.headers["sec-ch-ua-platform"]).replace(/['"]/g, "").trim() : "";
  const chModel = req?.headers?.["sec-ch-ua-model"] ? String(req.headers["sec-ch-ua-model"]).replace(/['"]/g, "").trim() : "";

  let brand = "";
  let os = "Unknown OS";
  let browser = "Browser";
  let deviceType = "desktop";
  let screenStr = (deviceSpecs && deviceSpecs.screen) ? String(deviceSpecs.screen) : "";
  const modelFromSpecs = (deviceSpecs && deviceSpecs.model) ? String(deviceSpecs.model).trim() : (chModel || "");

  // 1. Android Brand & Model detection from UA, Client Hints, or modelSpecs
  if (/Android/i.test(ua) || chPlatform === "Android" || (deviceSpecs && deviceSpecs.isMobile && /Linux/i.test(ua))) {
    deviceType = "mobile";
    os = "Android";
    const osVer = ua.match(/Android\s([0-9\.]+)/i);
    if (osVer) os = `Android ${osVer[1]}`;

    const checkStr = `${ua} ${modelFromSpecs}`;
    const decodedModel = decodeAndroidModel(modelFromSpecs);

    if (decodedModel) {
      brand = decodedModel;
    } else if (/SM-|Samsung/i.test(checkStr)) {
      brand = modelFromSpecs ? `Samsung Galaxy (${modelFromSpecs})` : "Samsung Galaxy";
    } else if (/Redmi|MI\s|POCO|Xiaomi|2201|2109|2203|2210/i.test(checkStr)) {
      brand = modelFromSpecs ? `Xiaomi / Redmi (${modelFromSpecs})` : "Xiaomi / Redmi";
    } else if (/Pixel/i.test(checkStr)) {
      brand = modelFromSpecs ? `Google Pixel (${modelFromSpecs})` : "Google Pixel";
    } else if (/OnePlus|CPH2/i.test(checkStr)) {
      brand = modelFromSpecs ? `OnePlus (${modelFromSpecs})` : "OnePlus";
    } else if (/Vivo|V2\d{3}|iQOO/i.test(checkStr)) {
      brand = modelFromSpecs ? `Vivo (${modelFromSpecs})` : "Vivo";
    } else if (/Oppo|CPH/i.test(checkStr)) {
      brand = modelFromSpecs ? `Oppo (${modelFromSpecs})` : "Oppo";
    } else if (/Realme|RMX/i.test(checkStr)) {
      brand = modelFromSpecs ? `Realme (${modelFromSpecs})` : "Realme";
    } else if (/Moto|XT/i.test(checkStr)) {
      brand = modelFromSpecs ? `Motorola (${modelFromSpecs})` : "Motorola";
    } else if (deviceSpecs && deviceSpecs.label) {
      brand = deviceSpecs.label;
    } else {
      brand = "Android Phone";
    }
  } else if (/iPhone/i.test(ua) || (chPlatform === "iOS" && !/iPad/i.test(ua))) {
    deviceType = "mobile";
    const iosVer = ua.match(/OS\s([0-9_]+)/i);
    os = iosVer ? `iOS ${iosVer[1].replace(/_/g, ".")}` : "iOS";
    brand = modelFromSpecs ? `Apple ${modelFromSpecs}` : "Apple iPhone";
  } else if (/iPad/i.test(ua) || (chPlatform === "macOS" && req?.headers?.["sec-ch-ua-mobile"] === "?1")) {
    deviceType = "tablet";
    const iosVer = ua.match(/OS\s([0-9_]+)/i);
    os = iosVer ? `iPadOS ${iosVer[1].replace(/_/g, ".")}` : "iPadOS";
    brand = "Apple iPad";
  } else if (/Windows NT 10.0/i.test(ua) || chPlatform === "Windows") {
    deviceType = "desktop";
    brand = "Windows PC";
    os = "Windows 10/11";
  } else if (/Windows/i.test(ua)) {
    deviceType = "desktop";
    brand = "Windows PC";
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(ua) || chPlatform === "macOS") {
    deviceType = "desktop";
    brand = "Apple Mac";
    os = "macOS";
  } else if (/Linux/i.test(ua) || chPlatform === "Linux") {
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
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = deviceType === "mobile" ? "Mobile Safari" : "Safari";
  else if (/Opera|OPR\//i.test(ua)) browser = "Opera";

  // Build clean, easily identifiable title
  let fullTitle = `${brand || "Student Device"} (${os}) • ${browser}`;
  if (screenStr && screenStr !== "0x0") {
    fullTitle += ` • [${screenStr}]`;
  }

  return {
    deviceName: fullTitle,
    deviceType,
    brand: brand || "Student Device",
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
    const ua = req?.headers?.["user-agent"] || "";
    const parsed = formatDeviceIdentifier({ ua, deviceSpecs: deviceSpecs || req?.body?.deviceSpecs, req });
    const ip = extractClientIp(req);

    const city = req?.headers?.["cf-ipcity"] || "";
    const country = req?.headers?.["cf-ipcountry"] || "";
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
      details: `Signed in successfully on ${parsed.deviceName} (${location})`,
      createdAt: now,
    };

    const uId = String(userId);

    // Keep live in-memory ring buffer (Max 15 items - Auto-delete older)
    let memSessions = userMemorySessions.get(uId) || [];
    memSessions = memSessions.filter(s => s.sessionId !== sessionId);
    memSessions.unshift(newSession);
    if (memSessions.length > 15) memSessions = memSessions.slice(0, 15);
    userMemorySessions.set(uId, memSessions);

    let memLogs = userMemorySecurityLogs.get(uId) || [];
    memLogs.unshift(newLog);
    if (memLogs.length > 15) memLogs = memLogs.slice(0, 15);
    userMemorySecurityLogs.set(uId, memLogs);

    if (db) {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get().catch(() => null);
      let currentSessions = [];
      let currentLogs = [];

      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        currentSessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        currentLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
      } else {
        currentSessions = [...memSessions];
        currentLogs = [...memLogs];
      }

      // Filter out expired sessions (> 30 days) and remove duplicate sessionId if any
      const cutoff = now - (30 * 24 * 3600 * 1000);
      currentSessions = currentSessions.filter(s => s.sessionId !== sessionId && Number(s.lastActiveAt) > cutoff);
      // Prepend new session (Max 15 active devices)
      currentSessions.unshift(newSession);
      if (currentSessions.length > 15) currentSessions = currentSessions.slice(0, 15);

      // Prepend new security log (Max 15 security logs - Rolling Auto-Delete Ring Buffer)
      currentLogs.unshift(newLog);
      if (currentLogs.length > 15) currentLogs = currentLogs.slice(0, 15);

      await userRef.set({
        activeSessions: currentSessions,
        securityLogs: currentLogs,
        lastLoginDevice: parsed.deviceName,
        lastLoginIp: ip,
        lastLoginAt: new Date(now).toISOString(),
      }, { merge: true }).catch(() => {});
    }

    return newSession;
  } catch (err) {
    console.warn("[STUDENT-SESSION] recordActiveSession error:", err.message);
    return null;
  }
}

/**
 * Record an arbitrary Security Activity Event (PASSWORD_CHANGED, PASSKEY_ADDED, MOBILE_OTP, etc.)
 * Strictly capped at 15 items: Any older logs beyond 15 are auto-deleted.
 */
async function recordSecurityActivity(userId, { action = "ACTIVITY", details = "", deviceName = "", ipAddress = "", location = "", req = null }) {
  if (!userId) return null;
  const now = Date.now();
  const uId = String(userId);
  let ip = ipAddress;
  let loc = location;
  let devName = deviceName;

  if (req) {
    if (!ip) {
      ip = extractClientIp(req);
    }
    if (!loc) {
      const city = req.headers?.["cf-ipcity"] || "";
      const country = req.headers?.["cf-ipcountry"] || "";
      loc = city && country ? `${city}, ${country}` : (country || "India");
    }
    if (!devName) {
      const ua = req.headers?.["user-agent"] || "";
      const parsed = formatDeviceIdentifier({ ua, req });
      devName = parsed.deviceName;
    }
  }

  const newLog = {
    id: `log_${now}_${crypto.randomBytes(3).toString("hex")}`,
    action: String(action).toUpperCase(),
    deviceName: devName || "Active Device",
    ipAddress: ip || "127.0.0.1",
    location: loc || "India",
    details: details || `${action} activity recorded`,
    createdAt: now,
  };

  // In-memory buffer update (Max 15)
  let memLogs = userMemorySecurityLogs.get(uId) || [];
  memLogs.unshift(newLog);
  if (memLogs.length > 15) memLogs = memLogs.slice(0, 15);
  userMemorySecurityLogs.set(uId, memLogs);

  if (db) {
    try {
      const userRef = db.collection("users").doc(uId);
      const snap = await userRef.get().catch(() => null);
      let logs = [];
      if (snap && snap.exists) {
        const uData = snap.data() || {};
        logs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
      } else {
        logs = [...memLogs];
      }
      logs.unshift(newLog);
      // Auto-delete / cap after 15 events
      if (logs.length > 15) logs = logs.slice(0, 15);
      await userRef.set({ securityLogs: logs, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    } catch (e) {
      console.warn("[STUDENT-SESSION] recordSecurityActivity error:", e.message);
    }
  }

  return newLog;
}

/**
 * Update session last active time in Firestore (Throttled every 10 minutes)
 * Also seamlessly refreshes real client IP and device details if request is passed.
 */
async function touchSessionActive(userId, sessionId, req = null) {
  if (!userId || !sessionId || userId === "admin-root") return;
  const now = Date.now();
  const last = sessionActiveThrottle.get(sessionId) || 0;
  if (now - last < 10 * 60 * 1000) return; // 10-minute throttle

  pruneSessionCaches();
  sessionActiveThrottle.set(sessionId, now);

  const currentIp = req ? extractClientIp(req) : null;

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
          const updatedSess = { ...s, lastActiveAt: now };
          if (currentIp && currentIp !== "127.0.0.1" && (!s.ipAddress || s.ipAddress === "Active IP" || s.ipAddress === "127.0.0.1")) {
            updatedSess.ipAddress = currentIp;
          }
          return updatedSess;
        }
        return s;
      });
      if (updated) {
        await userRef.update({ activeSessions: sessions }).catch(() => {});
      } else {
        // 🛡️ Session is no longer in activeSessions (terminated by user/admin), ensure instant in-memory rejection
        memoryRevokedSessions.add(String(sessionId));
      }
    }
  } catch (_) {}
}

/**
 * Get All Active Sessions for a User
 */
async function getUserActiveSessions(userId, currentSessionId = "") {
  if (!userId) return [];
  const uId = String(userId);
  try {
    let sessions = [];
    let userData = null;
    if (db) {
      const userSnap = await db.collection("users").doc(uId).get().catch(() => null);
      if (userSnap && userSnap.exists) {
        userData = userSnap.data() || {};
        sessions = Array.isArray(userData.activeSessions) ? userData.activeSessions : [];
      }
    }

    // Filter out sessions older than 30 days and revoked sessions
    const cutoff = Date.now() - (30 * 24 * 3600 * 1000);
    sessions = sessions.filter(s => Number(s.lastActiveAt) > cutoff && !memoryRevokedSessions.has(s.sessionId));

    // Fallback to in-memory sessions if empty
    if (sessions.length === 0) {
      const mem = userMemorySessions.get(uId) || [];
      sessions = mem.filter(s => Number(s.lastActiveAt) > cutoff && !memoryRevokedSessions.has(s.sessionId));
    }

    // Build intelligent fallback device name & real IP from user profile if session list is empty
    let fallbackDeviceName = uId === "admin-root" ? "Master Admin Console" : "Student Device";
    let fallbackBrand = uId === "admin-root" ? "Administration Core" : "Active Device";
    let fallbackIp = "Active IP";
    let fallbackType = "desktop";

    if (userData) {
      if (userData.lastLoginDevice && typeof userData.lastLoginDevice === "string" && !userData.lastLoginDevice.includes("Verified Session")) {
        fallbackDeviceName = userData.lastLoginDevice;
      } else if (userData.deviceSpecs?.label) {
        fallbackDeviceName = userData.deviceSpecs.label;
      } else if (Array.isArray(userData.knownDevices) && userData.knownDevices.length > 0) {
        fallbackDeviceName = userData.knownDevices[0].summary || fallbackDeviceName;
        fallbackIp = userData.knownDevices[0].lastIp || fallbackIp;
      }
      if (userData.deviceSpecs?.isMobile) fallbackType = "mobile";
      if (userData.lastLoginIp && userData.lastLoginIp !== "127.0.0.1") {
        fallbackIp = userData.lastLoginIp;
      }
    }

    // If currentSessionId exists but is not in list, add it
    if (currentSessionId && !sessions.some(s => s.sessionId === currentSessionId)) {
      sessions.unshift({
        sessionId: currentSessionId,
        deviceName: fallbackDeviceName,
        deviceType: fallbackType,
        brand: fallbackBrand,
        ipAddress: fallbackIp,
        location: "India",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    if (sessions.length === 0) {
      sessions.push({
        sessionId: currentSessionId || "default-session",
        deviceName: fallbackDeviceName,
        deviceType: fallbackType,
        brand: fallbackBrand,
        ipAddress: fallbackIp,
        location: "India",
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    // Clean any legacy placeholder IPs if real IP is available in user record
    if (userData && userData.lastLoginIp && userData.lastLoginIp !== "127.0.0.1") {
      sessions = sessions.map(s => {
        if (!s.ipAddress || s.ipAddress === "Active IP" || s.ipAddress === "127.0.0.1") {
          return { ...s, ipAddress: userData.lastLoginIp };
        }
        return s;
      });
    }

    // Update in-memory sessions
    userMemorySessions.set(uId, sessions);

    return sessions.map(sess => ({
      ...sess,
      isCurrentDevice: Boolean((currentSessionId && sess.sessionId === currentSessionId) || sessions.length === 1),
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

    // Remove from in-memory cache
    let memSess = userMemorySessions.get(uId) || [];
    const targetMem = memSess.find(s => s.sessionId === sId);
    const targetName = targetMem?.deviceName || "Device";
    memSess = memSess.filter(s => s.sessionId !== sId);
    userMemorySessions.set(uId, memSess);

    const logEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      action: "DEVICE_TERMINATED",
      deviceName: targetName,
      details: `Session on "${targetName}" terminated from ${terminatedByDevice}`,
      createdAt: Date.now(),
    };

    let memLogs = userMemorySecurityLogs.get(uId) || [];
    memLogs.unshift(logEntry);
    if (memLogs.length > 15) memLogs = memLogs.slice(0, 15);
    userMemorySecurityLogs.set(uId, memLogs);

    if (db) {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get().catch(() => null);
      let sessions = [];
      let securityLogs = [];
      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
      } else {
        sessions = [...memSess];
        securityLogs = [...memLogs];
      }

      sessions = sessions.filter(s => s.sessionId !== sId);
      securityLogs.unshift(logEntry);
      // Auto-delete / roll after 15 events
      if (securityLogs.length > 15) securityLogs = securityLogs.slice(0, 15);

      await userRef.set({
        activeSessions: sessions,
        securityLogs: securityLogs,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
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

    let memSess = userMemorySessions.get(uId) || [];
    memSess.forEach(s => {
      if (s.sessionId !== curId) memoryRevokedSessions.add(s.sessionId);
    });
    memSess = memSess.filter(s => s.sessionId === curId);
    userMemorySessions.set(uId, memSess);

    const logEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      action: "ALL_OTHER_DEVICES_TERMINATED",
      details: `Revoked all other active sessions across devices`,
      createdAt: Date.now(),
    };

    let memLogs = userMemorySecurityLogs.get(uId) || [];
    memLogs.unshift(logEntry);
    if (memLogs.length > 15) memLogs = memLogs.slice(0, 15);
    userMemorySecurityLogs.set(uId, memLogs);

    if (db) {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get().catch(() => null);
      let sessions = [];
      let securityLogs = [];
      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
      } else {
        sessions = [...memSess];
        securityLogs = [...memLogs];
      }

      sessions.forEach(s => {
        if (s.sessionId !== curId) memoryRevokedSessions.add(s.sessionId);
      });
      sessions = sessions.filter(s => s.sessionId === curId);

      securityLogs.unshift(logEntry);
      // Auto-delete / roll after 15 events
      if (securityLogs.length > 15) securityLogs = securityLogs.slice(0, 15);

      await userRef.set({
        activeSessions: sessions,
        securityLogs: securityLogs,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
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

    let memSess = userMemorySessions.get(uId) || [];
    memSess.forEach(s => memoryRevokedSessions.add(s.sessionId));
    userMemorySessions.set(uId, []);

    const logEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      action: "ALL_DEVICES_LOGGED_OUT",
      details: `All sessions logged out across all devices`,
      createdAt: Date.now(),
    };

    let memLogs = userMemorySecurityLogs.get(uId) || [];
    memLogs.unshift(logEntry);
    if (memLogs.length > 15) memLogs = memLogs.slice(0, 15);
    userMemorySecurityLogs.set(uId, memLogs);

    if (db) {
      const userRef = db.collection("users").doc(uId);
      const userSnap = await userRef.get().catch(() => null);
      let securityLogs = [];
      if (userSnap && userSnap.exists) {
        const uData = userSnap.data() || {};
        const sessions = Array.isArray(uData.activeSessions) ? uData.activeSessions : [];
        sessions.forEach(s => memoryRevokedSessions.add(s.sessionId));
        securityLogs = Array.isArray(uData.securityLogs) ? uData.securityLogs : [];
      } else {
        securityLogs = [...memLogs];
      }

      securityLogs.unshift(logEntry);
      // Auto-delete / roll after 15 events
      if (securityLogs.length > 15) securityLogs = securityLogs.slice(0, 15);

      await userRef.set({
        activeSessions: [],
        securityLogs: securityLogs,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
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
 * Get Last 15 Security Updates for User from Firestore & Memory
 * Automatically capped at 15 items (older items auto-deleted)
 */
async function getUserSecurityLogs(userId, limit = 15) {
  if (!userId) return [];
  const maxLimit = Math.min(Number(limit) || 15, 15);
  const uId = String(userId);
  try {
    let logs = [];
    let userData = null;
    if (db) {
      const userSnap = await db.collection("users").doc(uId).get().catch(() => null);
      if (userSnap && userSnap.exists) {
        userData = userSnap.data() || {};
        if (Array.isArray(userData.securityLogs) && userData.securityLogs.length > 0) {
          logs = userData.securityLogs;
        }
      }
    }

    // Merge or fallback with in-memory logs
    const memLogs = userMemorySecurityLogs.get(uId) || [];
    if (logs.length === 0 && memLogs.length > 0) {
      logs = memLogs;
    }

    // If still empty (new user or fresh restart), supply initial login log with actual device & IP
    if (logs.length === 0) {
      let initialDevice = uId === "admin-root" ? "Master Admin Console" : "Active Student Device";
      let initialIp = "Active IP";
      if (userData) {
        if (userData.lastLoginDevice && typeof userData.lastLoginDevice === "string" && !userData.lastLoginDevice.includes("Verified Session")) {
          initialDevice = userData.lastLoginDevice;
        } else if (userData.deviceSpecs?.label) {
          initialDevice = userData.deviceSpecs.label;
        } else if (Array.isArray(userData.knownDevices) && userData.knownDevices.length > 0) {
          initialDevice = userData.knownDevices[0].summary || initialDevice;
          initialIp = userData.knownDevices[0].lastIp || initialIp;
        }
        if (userData.lastLoginIp && userData.lastLoginIp !== "127.0.0.1") {
          initialIp = userData.lastLoginIp;
        }
      }

      const initialLog = {
        id: `log_init_${Date.now()}`,
        action: "LOGIN",
        deviceName: initialDevice,
        ipAddress: initialIp,
        location: "India",
        details: `Active Session Verified on ${initialDevice}`,
        createdAt: Date.now(),
      };
      logs = [initialLog];
      // Save in memory
      userMemorySecurityLogs.set(uId, logs);
    }

    // Auto-delete / cap after 15 events
    return logs.slice(0, maxLimit);
  } catch (err) {
    console.warn("[STUDENT-SESSION] getUserSecurityLogs error:", err.message);
    const memLogs = userMemorySecurityLogs.get(uId) || [];
    return memLogs.slice(0, maxLimit);
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
  userMemorySecurityLogs.clear();
  userMemorySessions.clear();
  return { success: true, message: "Revoked session cache cleared." };
}

module.exports = {
  extractClientIp,
  pruneInactiveSessions,
  cleanRevokedSessions,
  recordActiveSession,
  recordSecurityActivity,
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
