const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

// Shared live maintenance state (initialized from techSettings)
let maintenanceConfig = {
  active: false,
  title: "Scheduled System Upgrade in Progress",
  message: "We are currently performing scheduled platform upgrades to optimize performance, cloud CDN caching, and security. Free Study Material will be back online shortly!",
  estimatedEnd: "",
  bypassKey: "fsm_admin_override",
  expiresAt: null,
};

/**
 * Checks whether maintenance is actively enforcing access pause
 */
function isMaintenanceActive() {
  if (maintenanceConfig.active === true) {
    // If an auto-expiration timer was set, check if it expired
    if (maintenanceConfig.expiresAt && Date.now() > maintenanceConfig.expiresAt) {
      maintenanceConfig.active = false;
      maintenanceConfig.expiresAt = null;
      return false;
    }
    return true;
  }

  // Auto-Curfew Mode: Only active if Admin explicitly configured "auto_curfew"
  if (maintenanceConfig.estimatedEnd === "auto_curfew") {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const istMinutesTotal = utcHours * 60 + utcMinutes + 330;
    const istHour = Math.floor((istMinutesTotal / 60) % 24);
    if (istHour >= 1 && istHour < 5) {
      return true;
    }
  }

  return false;
}

/**
 * Updates in-memory maintenance configuration (called when admin toggles setting)
 */
function updateMaintenanceConfig(config = {}) {
  let expiresAt = null;
  if (config.estimatedEnd === "15 minutes") expiresAt = Date.now() + 15 * 60 * 1000;
  else if (config.estimatedEnd === "30 minutes") expiresAt = Date.now() + 30 * 60 * 1000;
  else if (config.estimatedEnd === "1 hour") expiresAt = Date.now() + 60 * 60 * 1000;
  else if (config.estimatedEnd === "2 hours") expiresAt = Date.now() + 120 * 60 * 1000;

  maintenanceConfig = {
    ...maintenanceConfig,
    ...config,
    expiresAt: expiresAt !== null ? expiresAt : maintenanceConfig.expiresAt,
  };
  return maintenanceConfig;
}

function getMaintenanceConfig() {
  return maintenanceConfig;
}

/**
 * Checks if the requesting user has valid admin session
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

  // Check URL query or header bypass key
  const queryBypass = req.query?.admin_bypass || req.query?.bypass;
  const headerBypass = req.headers["x-admin-bypass"];
  if (
    maintenanceConfig.bypassKey &&
    (queryBypass === maintenanceConfig.bypassKey || headerBypass === maintenanceConfig.bypassKey)
  ) {
    return true;
  }

  // Allow admin inspector and valid stream ticket access
  if (req.query?.admin_inspect === "1" || req.query?.ticket) {
    return true;
  }

  return false;
}

/**
 * Maintenance Mode Middleware:
 * Allows website to remain 100% hosted while temporarily closing public access.
 * Admins retain full access.
 */
function checkMaintenanceMode(req, res, next) {
  if (!isMaintenanceActive()) {
    return next();
  }

  // 1. Always allow health checks & ping routes
  if (req.path === "/health" || req.path === "/api/health") {
    return next();
  }

  // 2. Always allow public static assets (CSS, JS, images, fonts)
  if (
    req.path.startsWith("/assets/") ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".css") ||
    req.path.endsWith(".png") ||
    req.path.endsWith(".jpg") ||
    req.path.endsWith(".svg") ||
    req.path.endsWith(".ico") ||
    req.path.endsWith(".woff2") ||
    req.path.endsWith(".woff")
  ) {
    return next();
  }

  // 3. Always allow tech-flags check so frontend can display maintenance screen
  if (req.path === "/api/admin/tech-flags" || req.path === "/api/admin/maintenance/status") {
    return next();
  }

  // 4. Allow admin login & authentication verification routes so administrators can authenticate
  if (
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/verify" ||
    req.path === "/api/auth/logout" ||
    req.path === "/api/auth/google" ||
    req.path === "/api/auth/google-login" ||
    req.path === "/api/auth/login-request-otp" ||
    req.path === "/api/auth/login-verify-otp" ||
    req.path === "/api/auth/passkey/login-options" ||
    req.path === "/api/auth/passkey/login-verify" ||
    req.path.startsWith("/api/admin/")
  ) {
    return next();
  }

  // 5. If user is an Admin, allow full seamless access!
  if (isUserAdmin(req)) {
    res.setHeader("X-Maintenance-Mode", "admin-bypass");
    return next();
  }

  // 6. For API calls by non-admins, return HTTP 503 with maintenance info
  if (req.path.startsWith("/api/")) {
    return res.status(503).json({
      success: false,
      maintenance: true,
      title: maintenanceConfig.title,
      message: maintenanceConfig.message,
      estimatedEnd: maintenanceConfig.estimatedEnd || null,
    });
  }

  // 7. For direct browser HTML navigation, let index.html load so React can render the rich Maintenance UI
  return next();
}

module.exports = {
  checkMaintenanceMode,
  updateMaintenanceConfig,
  getMaintenanceConfig,
  isMaintenanceActive,
};

