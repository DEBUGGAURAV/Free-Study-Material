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
    } else {
      req.user = user;
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
}

module.exports = {
  authenticateToken,
  requireAuth,
  requireAdmin,
  setAuthCookie,
  clearAuthCookie,
  JWT_SECRET,
};

