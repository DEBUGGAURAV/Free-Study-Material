const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

/**
 * Robust Client IP Extractor
 * Extracts true client IP address behind Cloudflare CDN, Render reverse proxies, and direct TCP sockets.
 * Handles arrays, strings, missing headers, and strips IPv4-mapped IPv6 prefixes (::ffff:).
 * Fully try-catch wrapped to guarantee zero exceptions.
 */
function getClientIp(req) {
  try {
    if (!req) return "127.0.0.1";
    const headers = req.headers || {};

    // 1. Cloudflare Connecting IP (True visitor IP)
    const cfIp = headers["cf-connecting-ip"];
    if (cfIp) {
      const val = Array.isArray(cfIp) ? cfIp[0] : cfIp;
      if (typeof val === "string" && val.trim()) {
        return val.trim().replace(/^::ffff:/, "");
      }
    }

    // 2. X-Forwarded-For (First IP is the client origin hop)
    const xff = headers["x-forwarded-for"];
    if (xff) {
      const rawXff = Array.isArray(xff) ? xff[0] : xff;
      if (typeof rawXff === "string" && rawXff.trim()) {
        const firstIp = rawXff.split(",")[0].trim();
        if (firstIp) return firstIp.replace(/^::ffff:/, "");
      }
    }

    // 3. X-Real-IP
    const realIp = headers["x-real-ip"];
    if (realIp) {
      const val = Array.isArray(realIp) ? realIp[0] : realIp;
      if (typeof val === "string" && val.trim()) {
        return val.trim().replace(/^::ffff:/, "");
      }
    }

    // 4. Express req.ip or socket remote address fallback
    const directIp =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "127.0.0.1";

    return String(directIp).trim().replace(/^::ffff:/, "");
  } catch (err) {
    return "127.0.0.1";
  }
}

/**
 * Checks if requesting user has Admin privileges to grant immunity from rate limits
 */
function isUserAdmin(req) {
  try {
    if (!req) return false;
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const headers = req.headers || {};
    const cookies = req.cookies || {};
    const query = req.query || {};

    const authHeader = typeof headers["authorization"] === "string" ? headers["authorization"] : "";
    const token =
      cookies.fsm_token ||
      cookies.token ||
      cookies.vault_token ||
      query.token ||
      (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);

    if (token && JWT_SECRET) {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (
        decoded.role === "admin" ||
        decoded.role === "half_admin" ||
        Boolean(adminEmail && decoded.email && decoded.email.toLowerCase().trim() === adminEmail)
      ) {
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Checks if requesting client has immunity from rate limits
 * (Admin sessions, developer on localhost/loopback, private intranets, Cloudflare worker edge)
 */
function isImmune(req) {
  try {
    if (!req) return true;
    const ip = getClientIp(req);
    if (
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.16.") ||
      ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") ||
      ip.startsWith("172.19.") ||
      ip.startsWith("172.2") ||
      ip.startsWith("172.30.") ||
      ip.startsWith("172.31.")
    ) {
      return true;
    }

    const query = req.query || {};
    const headers = req.headers || {};

    const bypassKey = process.env.ADMIN_BYPASS_KEY || process.env.MAINTENANCE_BYPASS_KEY || "fsm_admin_override";
    if (
      query.admin_bypass === bypassKey ||
      query.bypass === bypassKey ||
      headers["x-admin-bypass"] === bypassKey
    ) {
      if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || isUserAdmin(req)) {
        return true;
      }
    }

    const host = typeof headers["host"] === "string" ? headers["host"] : "";
    if (headers["x-worker-origin"] || host.includes("workers.dev")) {
      return true;
    }

    return isUserAdmin(req);
  } catch {
    return false;
  }
}

/**
 * Safe rate-limit rejection handler
 * Guards against ERR_HTTP_HEADERS_SENT when responses are already underway or streaming
 */
function createSafeLimiterHandler(defaultMessage) {
  return (req, res, next, options) => {
    try {
      if (res.headersSent || res.writableEnded) {
        return;
      }
      const retryAfter = Math.ceil((options.windowMs || 60000) / 1000);
      try {
        res.setHeader("Retry-After", String(retryAfter));
      } catch {}

      return res.status(options.statusCode || 429).json({
        success: false,
        message: defaultMessage,
        retryAfter,
      });
    } catch (err) {
      if (!res.headersSent && !res.writableEnded) {
        try {
          return res.status(429).json({ success: false, message: defaultMessage });
        } catch {}
      }
    }
  };
}

/**
 * 1. Global API Limiter
 * Generous 5,000 requests per 15 minutes per real client IP.
 * Skips health checks, keep-alive pings, preflight OPTIONS, and immune sessions.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // 🛡️ Disables all internal ERL validation crashes
  passOnStoreError: true, // 🛡️ Prevents memory store errors from crashing requests
  keyGenerator: getClientIp,
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const p = req.path || req.url || "";
    if (p === "/health" || p === "/api/health" || p.includes("/health")) return true;
    return isImmune(req);
  },
  handler: createSafeLimiterHandler(
    "Network traffic alert: High volume of requests from your connection. Please wait a short moment."
  ),
});

/**
 * 2. Download & Stream Limiter
 * Stream chunks from PDFium/PDF.js byte-ranges require high throughput.
 * Allows 3,000 range chunks per 10 minutes per real IP.
 * Students reading large 200-page textbooks will never be cut off.
 */
const downloadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  keyGenerator: getClientIp,
  skip: (req) => req.method === "OPTIONS" || isImmune(req),
  handler: createSafeLimiterHandler(
    "Download rate limit reached. Please wait 1-2 minutes before streaming more notes."
  ),
});

/**
 * 3. Upload Limiter
 * Permits up to 250 note uploads per 15 minutes per IP.
 * Defends against spam bots while accommodating faculty/student contributors.
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  keyGenerator: getClientIp,
  skip: (req) => req.method === "OPTIONS" || isImmune(req),
  handler: createSafeLimiterHandler(
    "Upload rate limit reached. Please wait a moment before uploading more notes."
  ),
});

/**
 * 4. Auth Limiter
 * Hardens login/register/OTP endpoints against brute-force attacks.
 * Permits 100 attempts per 15 minutes per true client IP.
 * Skips passive GET checks (e.g. checking auth status) and preflight OPTIONS.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  keyGenerator: getClientIp,
  skip: (req) => {
    if (req.method === "OPTIONS" || req.method === "GET") return true;
    return isImmune(req);
  },
  handler: createSafeLimiterHandler(
    "Too many authentication attempts. Please wait 15 minutes before trying again."
  ),
});

/**
 * 5. Help Desk Limiter
 * Protects student question submissions against bot spam.
 * Permits 25 questions per hour per real IP, with immunity for admin responses.
 */
const helpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  keyGenerator: getClientIp,
  skip: (req) => req.method === "OPTIONS" || isImmune(req),
  handler: createSafeLimiterHandler(
    "Too many help queries submitted. Please wait 1 hour before submitting another query."
  ),
});

module.exports = {
  getClientIp,
  isImmune,
  isUserAdmin,
  createSafeLimiterHandler,
  globalLimiter,
  downloadLimiter,
  uploadLimiter,
  authLimiter,
  helpLimiter,
};
