const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = (process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex")).trim();

function authenticateToken(req, res, next) {
  // 1. High-security httpOnly cookie (fsm_token)
  // 2. Standard Authorization header (Bearer token)
  // 3. Query param token (?token=...)
  const cookieToken = req.cookies?.fsm_token || req.cookies?.token || req.cookies?.vault_token;
  const authHeader = req.headers?.["authorization"] || req.headers?.authorization;
  const headerToken = authHeader && typeof authHeader === "string" ? authHeader.split(" ")[1] : null;
  const queryToken = req.query?.token;
  const token = cookieToken || headerToken || queryToken;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
      return next();
    }

    // 🛡️ 30-Minute Student Inactivity Check (Server-Side Shield for Mobile & Web)
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const isMainAdmin = user && (user.isMainAdmin || user.isMasterAdmin || (adminEmail && user.email && user.email.toLowerCase().trim() === adminEmail));
    const lastActiveStr = req.cookies?.vault_last_active;

    if (!isMainAdmin && lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
      if (lastActive > 0 && Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
        console.log(`[AUTH-MIDDLEWARE] ⏱️ Server detected 30-min inactivity for ${user.email} (${Math.round((Date.now() - lastActive) / 60000)} mins). Revoking session.`);
        clearAuthCookie(res, req);
        req.user = null;
        return next();
      }
    }

    req.user = user;

    // Refresh vault_last_active cookie periodically (debounced to 30s) on active API requests
    if (req.user && (!lastActiveStr || Date.now() - parseInt(lastActiveStr, 10) > 30000)) {
      const isProd = process.env.NODE_ENV === "production";
      const host = (req && req.get) ? (req.get("host") || "") : "";
      const isLocal = !host || host.includes("localhost") || host.includes("127.0.0.1");
      const secure = isProd && !isLocal;
      res.cookie("vault_last_active", String(Date.now()), {
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
    Boolean(adminEmail && req.user.email && req.user.email.toLowerCase().trim() === adminEmail);
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

  res.cookie("fsm_token", token, {
    httpOnly: true,
    secure: secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  res.cookie("vault_last_active", String(Date.now()), {
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
  JWT_SECRET,
};

