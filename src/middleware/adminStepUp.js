/**
 * 🛡️ Category 2 Feature 5: Admin Step-Up Re-Authentication Middleware
 * Requires re-confirmation of Master Password or Passkey before executing
 * critical administrative actions (Inactivity Purge, CDN Cache Purge, Bulk Note Deletion).
 */

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./auth");

const STEP_UP_DURATION_SEC = 10 * 60; // 10 minutes

/**
 * Creates a signed Step-Up Token after successful re-authentication
 * @param {object} adminUser - Admin user object
 * @returns {string} Signed JWT step-up token
 */
function createStepUpToken(adminUser) {
  return jwt.sign(
    {
      adminId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      stepUp: true,
      issuedAt: Date.now(),
    },
    JWT_SECRET,
    { expiresIn: `${STEP_UP_DURATION_SEC}s` }
  );
}

/**
 * Middleware: Enforces valid Step-Up Token or fresh admin session for sensitive operations
 */
function requireStepUpAuth(req, res, next) {
  const stepUpToken = req.headers["x-step-up-token"] || req.body?.stepUpToken || req.query?.stepUpToken;

  if (stepUpToken) {
    try {
      const decoded = jwt.verify(stepUpToken, JWT_SECRET);
      if (decoded && decoded.stepUp) {
        req.stepUpAuth = decoded;
        return next();
      }
    } catch (_) {}
  }

  // Fresh Session Shield: Allow if authenticated within the last 10 minutes (600s)
  if (req.user && req.user.iat && (Date.now() / 1000 - req.user.iat < STEP_UP_DURATION_SEC)) {
    return next();
  }

  return res.status(428).json({
    error: "Admin Step-Up Re-Authentication Required. Please confirm your Master Password or Passkey to authorize this critical operation.",
    code: "STEP_UP_REQUIRED",
    requiresStepUp: true,
  });
}

module.exports = {
  createStepUpToken,
  requireStepUpAuth,
  STEP_UP_DURATION_SEC,
};

