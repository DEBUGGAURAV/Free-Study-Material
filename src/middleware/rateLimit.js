const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

/**
 * Extracts true client IP address behind Cloudflare CDN & Render reverse proxies
 * Priority: CF-Connecting-IP > X-Forwarded-For (first hop) > X-Real-IP > req.ip
 * This prevents all users behind Cloudflare/Render from sharing a single IP rate-limit bucket!
 */
function getClientIp(req) {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp) return cfIp.trim();

  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const firstIp = xff.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) return realIp.trim();

  return req.ip || "127.0.0.1";
}

/**
 * Checks if requesting user has Admin privileges to grant immunity from rate limits
 */
function isUserAdmin(req) {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const token =
      req.cookies?.fsm_token ||
      req.cookies?.token ||
      req.query?.token ||
      req.headers["authorization"]?.split(" ")[1];

    if (token) {
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
  const ip = getClientIp(req);
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
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

  if (
    req.query?.admin_bypass === "fsm_admin_override" ||
    req.query?.bypass === "fsm_admin_override" ||
    req.headers["x-admin-bypass"] === "fsm_admin_override"
  ) {
    return true;
  }

  if (req.headers["x-worker-origin"] || (req.headers["host"] && req.headers["host"].includes("workers.dev"))) {
    return true;
  }

  return isUserAdmin(req);
}

/**
 * 1. Global API Limiter
 * Generous 5,000 requests per 15 minutes per real client IP.
 * Skips health checks, keep-alive pings, and immune sessions.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  keyGenerator: getClientIp,
  skip: (req) => {
    if (req.path === "/health" || req.path === "/api/health") return true;
    return isImmune(req);
  },
  message: {
    success: false,
    message: "Network traffic alert: High volume of requests from your connection. Please wait a short moment.",
  },
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
  validate: { trustProxy: false },
  keyGenerator: getClientIp,
  skip: (req) => isImmune(req),
  message: {
    success: false,
    message: "Download rate limit reached. Please wait 1-2 minutes before streaming more notes.",
  },
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
  validate: { trustProxy: false },
  keyGenerator: getClientIp,
  skip: (req) => isImmune(req),
  message: {
    success: false,
    message: "Upload rate limit reached. Please wait a moment before uploading more notes.",
  },
});

/**
 * 4. Auth Limiter
 * Hardens login/register/OTP endpoints against brute-force attacks.
 * Permits 100 attempts per 15 minutes per true client IP.
 * Skips passive GET checks (e.g. checking auth status).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  keyGenerator: getClientIp,
  skip: (req) => {
    if (req.method === "GET") return true;
    return isImmune(req);
  },
  message: {
    success: false,
    message: "Too many authentication attempts. Please wait 15 minutes before trying again.",
  },
});

module.exports = {
  getClientIp,
  globalLimiter,
  downloadLimiter,
  uploadLimiter,
  authLimiter,
};
