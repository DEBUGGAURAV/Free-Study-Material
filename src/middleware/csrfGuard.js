/**
 * 🛡️ Category 2 Feature 4: CSRF Protection & Same-Origin Header Guard
 * Enforces browser Sec-Fetch-Site and Origin/Referer header verification
 * on state-changing requests (POST, PUT, DELETE, PATCH).
 */

const { getSiteUrl } = require("../config/siteConfig");

// Mutating HTTP methods requiring CSRF / Same-Origin checks
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Public endpoints exempted (e.g. webhooks, public health, Turnstile verify, telegram webhook, security beacons)
const EXEMPTED_PATHS = [
  "/health",
  "/api/health",
  "/api/auth/register-telegram-initiate",
  "/api/auth/register-telegram-verify",
  "/api/auth/forgot-telegram-initiate",
  "/api/auth/forgot-telegram-verify",
  "/api/auth/register-request-otp",
  "/api/auth/register-verify-otp",
  "/api/auth/login",
  "/api/auth/login-request-otp",
  "/api/auth/login-verify-otp",
  "/api/auth/forgot-password-request-otp",
  "/api/auth/forgot-password-verify-otp",
  "/api/auth/register",
  "/api/auth/google",
  "/api/security/tamper-alert",
  "/api/security/anti-bot-alert",
  "/api/security/jail-appeal",
];

const TRUSTED_DOMAINS = [
  "freestudymaterial.pages.dev",
  "freestudymaterial.onrender.com",
  "freestudymaterial1.onrender.com",
  "freestudymaterial2.onrender.com",
  "fsm-edge.jnplotus.workers.dev",
];

/**
 * Extracts origin host
 */
function extractHost(urlStr) {
  if (!urlStr) return "";
  try {
    const url = new URL(urlStr);
    return url.host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Returns complete set of allowed origin hosts dynamically
 */
function getAllowedHosts(req) {
  const reqHost = req.headers["host"]?.toLowerCase() || "";
  const configuredHost = extractHost(getSiteUrl());
  const clientHost = extractHost(process.env.CLIENT_URL);
  const siteHost = extractHost(process.env.SITE_URL);
  const customHost = extractHost(process.env.CUSTOM_DOMAIN);
  const renderHost = extractHost(process.env.RENDER_EXTERNAL_URL);

  return new Set([
    reqHost,
    configuredHost,
    clientHost,
    siteHost,
    customHost,
    renderHost,
    ...TRUSTED_DOMAINS,
    "localhost:5000",
    "localhost:5173",
    "localhost:3000",
    "127.0.0.1:5000",
    "127.0.0.1:5173",
  ].filter(Boolean));
}

/**
 * Same-Origin CSRF Guard Middleware
 */
function sameOriginGuard(req, res, next) {
  // 1. Safe read-only methods (GET, HEAD, OPTIONS) are exempt
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 2. Exempted public routes (include req.baseUrl since middleware is mounted at /api)
  const cleanPath = `${req.baseUrl || ""}${req.path || ""}`.toLowerCase();
  if (EXEMPTED_PATHS.some((p) => cleanPath === p || cleanPath.startsWith(`${p}/`))) {
    return next();
  }

  // 3. Origin & Referer Verification
  const origin = req.headers["origin"];
  const referer = req.headers["referer"];
  const originHost = extractHost(origin);
  const refererHost = extractHost(referer);
  const checkHost = originHost || refererHost;
  const allowedHosts = getAllowedHosts(req);

  // Reject explicit Origin: null on mutating requests (sandboxed iframe CSRF vector)
  if (origin === "null") {
    console.warn(`[CSRF-GUARD] 🚨 Blocked null-origin mutating request: ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      error: "Cross-Site Request Blocked. Null-origin mutating requests are not permitted.",
      code: "CSRF_NULL_ORIGIN_FORBIDDEN",
    });
  }

  // 4. Modern Browser Sec-Fetch-Site check
  // Possible values: 'same-origin', 'same-site', 'none' (user navigated directly), 'cross-site'
  const secFetchSite = req.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site") {
    // Block if request does not originate from a verified platform frontend (even when Origin/Referer are missing)
    if (!checkHost || !allowedHosts.has(checkHost)) {
      console.warn(`[CSRF-GUARD] 🚨 Blocked cross-site request: ${req.method} ${req.originalUrl} from unauthorized host: ${checkHost || "missing"}`);
      return res.status(403).json({
        error: "Cross-Site Request Blocked. Mutating actions must originate from the verified study platform.",
        code: "CSRF_CROSS_SITE_FORBIDDEN",
      });
    }
  }

  if (checkHost && !allowedHosts.has(checkHost)) {
    console.warn(`[CSRF-GUARD] 🚨 Blocked unauthorized origin: ${checkHost} on ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      error: `Cross-Origin Request Blocked. Origin '${checkHost}' is not authorized.`,
      code: "CSRF_ORIGIN_MISMATCH",
    });
  }

  next();
}

module.exports = {
  sameOriginGuard,
};
