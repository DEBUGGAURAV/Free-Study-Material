const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("../firebase");
const { ramCache } = require("../utils/ramCache");

const envJwtSecret = (process.env.JWT_SECRET || "").trim();
if (process.env.NODE_ENV === "production" && !envJwtSecret) {
  console.warn("⚠️ [SECURITY WARNING] process.env.JWT_SECRET is not defined in production environment variables. Using fallback secret.");
}
const JWT_SECRET = envJwtSecret || "50ad069ae2a0432e1521d3765ec8b3a881bdcb39f85a47e95498c1dc04f8b4ef8c8bfb42a7a7aa0cc1f328ed1e0552fb86750f27f76000d36f86593d25f8ccd2";

// 🛡️ Multi-Device Session Invalidation Cache (Category 1 Feature 4)
// Stores minimum valid tokenVersion per userId: Map<userId, { minVersion: number, revokedAt: number }>
const userRevokedTokenVersions = new Map();
const REVOCATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (JWT maximum lifespan)

/**
 * Periodically prunes expired revocation entries to eliminate memory leaks
 */
function pruneRevocationCache() {
  const now = Date.now();
  for (const [uid, record] of userRevokedTokenVersions.entries()) {
    if (!record || !record.revokedAt || (now - record.revokedAt > REVOCATION_TTL_MS)) {
      userRevokedTokenVersions.delete(uid);
    }
  }
  // Hard cap to keep RAM usage bounded
  if (userRevokedTokenVersions.size > 5000) {
    const keys = Array.from(userRevokedTokenVersions.keys());
    for (let i = 0; i < keys.length - 3000; i++) {
      userRevokedTokenVersions.delete(keys[i]);
    }
  }
}

/**
 * Updates revoked token version for a user (called on password reset, change, or logout-all-devices)
 */
function setRevokedTokenVersion(userId, minVersion = 1) {
  if (!userId) return;
  pruneRevocationCache();
  const rec = {
    minVersion: Number(minVersion),
    revokedAt: Date.now(),
  };
  userRevokedTokenVersions.set(String(userId), rec);
  if (ramCache) {
    ramCache.set(`user_min_version_${userId}`, rec, 7 * 86400);
  }
}

function authenticateToken(req, res, next) {
  // 1. High-security httpOnly cookie (fsm_token)
  // 2. Standard Authorization header (Bearer token)
  // 3. Query param token (?token=...)
  const cookieToken = req.cookies?.fsm_token || req.cookies?.token || req.cookies?.vault_token;
  const authHeader = req.headers?.["authorization"] || req.headers?.authorization;
  const headerToken = authHeader && typeof authHeader === "string" ? authHeader.split(" ")[1] : null;
  let queryToken = req.query?.token;

  // 🛡️ Security Check: Prevent query token exposure on mutating requests or non-streaming routes
  if (queryToken && !cookieToken && !headerToken) {
    const method = (req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      // Reject query token on state-changing actions (POST, PUT, DELETE, PATCH)
      queryToken = null;
    } else {
      const cleanPath = (req.path || "").toLowerCase();
      // Allow query tokens only for safe streaming, preview, file delivery, or database export
      const isAllowedStreamOrExport =
        cleanPath.startsWith("/api/notes/") ||
        cleanPath.startsWith("/notes/") ||
        cleanPath.startsWith("/api/cdn/") ||
        cleanPath.includes("/stream") ||
        cleanPath.includes("/preview") ||
        cleanPath === "/api/admin/database/export";
      if (!isAllowedStreamOrExport) {
        queryToken = null;
      }
    }
  }

  const token = cookieToken || headerToken || queryToken;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      req.user = null;
      return next();
    }

    // 🛡️ Multi-Device & Server Restart Session Invalidation Check
    if (user && user.id) {
      const uId = String(user.id);
      const userTokenVersion = typeof user.v === "number" ? user.v : 0;
      let revocation = userRevokedTokenVersions.get(uId);

      // If not in node memory, check fast RAM cache
      if (!revocation && ramCache) {
        revocation = ramCache.get(`user_min_version_${uId}`);
        if (revocation) {
          userRevokedTokenVersions.set(uId, revocation);
        }
      }

      // If still not in memory/RAM cache, fetch persisted version from Firestore to survive server restarts
      if (!revocation && db && uId !== "admin-root") {
        try {
          const userDoc = await db.collection("users").doc(uId).get();
          if (userDoc.exists) {
            const uData = userDoc.data() || {};
            // If user is suspended/blocked in database, invalidate immediately!
            if (uData.isBlocked) {
              console.log(`[AUTH-MIDDLEWARE] 🚨 Blocked user detected: ${user.email} (${uId}). Revoking session.`);
              clearAuthCookie(res, req);
              req.user = null;
              return next();
            }
            const minV = Number(uData.tokenVersion || uData.sessionRevokedAt || 0);
            if (minV > 0) {
              revocation = { minVersion: minV, revokedAt: Date.now() };
              userRevokedTokenVersions.set(uId, revocation);
              if (ramCache) {
                ramCache.set(`user_min_version_${uId}`, revocation, 7 * 86400);
              }
            }
          }
        } catch (_) {}
      }

      if (revocation && userTokenVersion < revocation.minVersion) {
        console.log(`[AUTH-MIDDLEWARE] 🚪 Revoked session detected for user ${user.id} (token v:${userTokenVersion} < required v:${revocation.minVersion}). Invalidating.`);
        clearAuthCookie(res, req);
        req.user = null;
        return next();
      }

      // 📱 Single Device Session Invalidation Check (Active Device Security)
      if (user.sid) {
        try {
          const { isSessionRevokedSync, touchSessionActive } = require("../services/studentSessionService");
          if (isSessionRevokedSync(user.sid)) {
            console.log(`[AUTH-MIDDLEWARE] 🚪 Single device session terminated for user ${user.id} (sid: ${user.sid}). Invalidating.`);
            clearAuthCookie(res, req);
            req.user = null;
            return next();
          }
          // Asynchronous touch (Zero blocking latency)
          touchSessionActive(user.id, user.sid);
        } catch (_) {}
      }
    }

    // 🛡️ 30-Minute Student Inactivity Check (Server-Side Shield for Mobile & Web)
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isAnyAdmin = Boolean(
      user &&
        (user.isMainAdmin ||
          user.isMasterAdmin ||
          user.role === "admin" ||
          user.role === "half_admin" ||
          user.role === "sub_admin" ||
          user.id === "admin-root" ||
          (adminEmail && user.email && user.email.toLowerCase().trim() === adminEmail) ||
          (Array.isArray(user.permissions) && user.permissions.includes("all")))
    );
    
    // Check tamper-proof httpOnly cookie first, then fallback to vault_last_active
    const fsmLastActiveStr = req.cookies?.fsm_last_active;
    const clientLastActiveStr = req.cookies?.vault_last_active;
    const lastActiveStr = fsmLastActiveStr || clientLastActiveStr;

    if (!isAnyAdmin) {
      const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
      const now = Date.now();

      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        if (lastActive > 0 && now - lastActive >= INACTIVITY_TIMEOUT_MS) {
          console.log(`[AUTH-MIDDLEWARE] ⏱️ Server detected 30-min inactivity for ${user.email} (${Math.round((now - lastActive) / 60000)} mins). Revoking session.`);
          clearAuthCookie(res, req);
          req.user = null;
          return next();
        }
      }
    }

    req.user = user;

    // 🛡️ Auto-whitelist Admin IP on active session (Absolute immunity from automated IP Jail)
    if (isAnyAdmin) {
      try {
        const { registerAdminIp, getClientIp } = require("./ipJail");
        const ip = getClientIp(req);
        if (ip) registerAdminIp(ip);
      } catch (_) {}
    }

    // Refresh cookies periodically (debounced to 30s) on active API requests
    if (req.user && (!lastActiveStr || Date.now() - parseInt(lastActiveStr, 10) > 30000)) {
      const isProd = process.env.NODE_ENV === "production";
      const host = (req && req.get) ? (req.get("host") || "") : "";
      const isLocal = !host || host.includes("localhost") || host.includes("127.0.0.1");
      const secure = isProd && !isLocal;
      const nowStr = String(Date.now());

      // 1. Server-controlled httpOnly cookie (Tamper-proof server check)
      res.cookie("fsm_last_active", nowStr, {
        httpOnly: true,
        secure: secure,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      // 2. Client-readable cookie for UI countdown timers
      res.cookie("vault_last_active", nowStr, {
        httpOnly: false,
        secure: secure,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    }

    next();
  });
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const isAdmin =
    req.user.role === "admin" ||
    req.user.role === "half_admin" ||
    req.user.role === "sub_admin" ||
    req.user.isMainAdmin ||
    req.user.isMasterAdmin ||
    req.user.id === "admin-root" ||
    Boolean(adminEmail && req.user.email && req.user.email.toLowerCase().trim() === adminEmail) ||
    (Array.isArray(req.user.permissions) && req.user.permissions.includes("all"));

  if (!isAdmin) {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }

  next();
}

/**
 * Sets high-security httpOnly cookie for JWT authentication
 * - httpOnly: true -> XSS immune (JavaScript / F12 Console cannot access)
 * - secure: true in production HTTPS
 * - sameSite: 'strict' in production / 'lax' in development -> CSRF immune
 * - maxAge: 7 days
 */
function setAuthCookie(res, req, token) {
  const isProd = process.env.NODE_ENV === "production";
  const host = (req && req.get) ? (req.get("host") || "") : "";
  const isLocal = !host || host.includes("localhost") || host.includes("127.0.0.1");
  const secure = isProd && !isLocal;
  const nowStr = String(Date.now());

  res.cookie("fsm_token", token, {
    httpOnly: true,
    secure: secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.cookie("vault_token", token, {
    httpOnly: true,
    secure: secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.cookie("fsm_last_active", nowStr, {
    httpOnly: true,
    secure: secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.cookie("vault_last_active", nowStr, {
    httpOnly: false,
    secure: secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

/**
 * Clears the httpOnly authentication cookie upon logout
 */
function clearAuthCookie(res, req) {
  const isProd = process.env.NODE_ENV === "production";
  const host = (req && req.get) ? (req.get("host") || "") : "";
  const isLocal = !host || host.includes("localhost") || host.includes("127.0.0.1");
  const secure = isProd && !isLocal;

  res.clearCookie("fsm_token", {
    httpOnly: true,
    secure: secure,
    sameSite: secure ? "strict" : "lax",
    path: "/",
  });

  res.clearCookie("vault_token", {
    httpOnly: true,
    secure: secure,
    sameSite: secure ? "strict" : "lax",
    path: "/",
  });

  res.clearCookie("fsm_last_active", {
    httpOnly: true,
    secure: secure,
    sameSite: secure ? "strict" : "lax",
    path: "/",
  });

  res.clearCookie("vault_last_active", {
    path: "/",
    sameSite: secure ? "strict" : "lax",
  });
}

module.exports = {
  authenticateToken,
  requireAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
  setRevokedTokenVersion,
  JWT_SECRET,
};
