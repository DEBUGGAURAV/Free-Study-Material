/**
 * 🛡️ Category 2 Feature 4: CSRF Protection & Same-Origin Header Guard
 * Enforces browser Sec-Fetch-Site and Origin/Referer header verification
 * on state-changing requests (POST, PUT, DELETE, PATCH).
 */

const { getSiteUrl } = require("../config/siteConfig");

// Mutating HTTP methods requiring CSRF / Same-Origin checks
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Public endpoints exempted (e.g. webhooks, public health, Turnstile verify, telegram webhook if used)
const EXEMPTED_PATHS = [
  "/health",
  "/api/health",
  "/api/auth/register-telegram-initiate",
  "/api/auth/login",
  "/api/auth/register",
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
 * Same-Origin CSRF Guard Middleware
 */
function sameOriginGuard(req, res, next) {
  // 1. Safe read-only methods (GET, HEAD, OPTIONS) are exempt
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 2. Exempted public routes
  const cleanPath = req.path.toLowerCase();
  if (EXEMPTED_PATHS.some((p) => cleanPath === p || cleanPath.startsWith(`${p}/`))) {
    return next();
  }

  // 3. Modern Browser Sec-Fetch-Site check
  // Possible values: 'same-origin', 'same-site', 'none' (user navigated directly), 'cross-site'
  const secFetchSite = req.headers["sec-fetch-site"];
  if (secFetchSite === "cross-site") {
    console.warn(`[CSRF-GUARD] 🚨 Blocked cross-site request: ${req.method} ${req.originalUrl} from IP: ${req.ip}`);
    return res.status(403).json({
      error: "Cross-Site Request Blocked (Sec-Fetch-Site: cross-site). Mutating actions must originate from the verified study platform.",
      code: "CSRF_CROSS_SITE_FORBIDDEN",
    });
  }

  // 4. Origin & Referer Verification
  const origin = req.headers["origin"];
  const referer = req.headers["referer"];

  if (origin || referer) {
    const reqHost = req.headers["host"]?.toLowerCase() || "";
    const originHost = extractHost(origin);
    const refererHost = extractHost(referer);

    const configuredSiteUrl = getSiteUrl();
    const configuredHost = extractHost(configuredSiteUrl);

    const allowedHosts = new Set([
      reqHost,
      configuredHost,
      "freestudymaterial.onrender.com",
      "localhost:5000",
      "localhost:5173",
      "127.0.0.1:5000",
      "127.0.0.1:5173",
    ].filter(Boolean));

    const checkHost = originHost || refererHost;
    if (checkHost && !allowedHosts.has(checkHost)) {
      console.warn(`[CSRF-GUARD] 🚨 Blocked unauthorized origin: ${checkHost} on ${req.method} ${req.originalUrl}`);
      return res.status(403).json({
        error: `Cross-Origin Request Blocked. Origin '${checkHost}' is not authorized.`,
        code: "CSRF_ORIGIN_MISMATCH",
      });
    }
  }

  next();
}

module.exports = {
  sameOriginGuard,
};

