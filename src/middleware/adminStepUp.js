/**
 * 🛡️ Category 2 Feature 5: Admin Step-Up Re-Authentication Middleware
 * Requires re-confirmation of Master Password or Passkey before executing
 * critical administrative actions (Inactivity Purge, CDN Cache Purge, Bulk Note Deletion).
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "free_study_material_vault_jwt_secure_secret_2026";
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
 * Middleware: Enforces valid Step-Up Token for sensitive operations
 */
function requireStepUpAuth(req, res, next) {
  const stepUpToken = req.headers["x-step-up-token"] || req.body?.stepUpToken || req.query?.stepUpToken;

  if (!stepUpToken) {
    return res.status(428).json({
      error: "Admin Step-Up Re-Authentication Required. Please confirm your Master Password or Passkey to authorize this critical operation.",
      code: "STEP_UP_REQUIRED",
      requiresStepUp: true,
    });
  }

  try {
    const decoded = jwt.verify(stepUpToken, JWT_SECRET);
    if (!decoded || !decoded.stepUp || decoded.role !== "admin") {
      return res.status(403).json({
        error: "Invalid or unauthorized step-up authentication token.",
        code: "STEP_UP_INVALID",
        requiresStepUp: true,
      });
    }

    req.stepUpAuth = decoded;
    next();
  } catch (err) {
    return res.status(428).json({
      error: "Step-Up authorization session has expired (valid for 10 minutes). Please re-confirm your credentials.",
      code: "STEP_UP_EXPIRED",
      requiresStepUp: true,
    });
  }
}

module.exports = {
  createStepUpToken,
  requireStepUpAuth,
  STEP_UP_DURATION_SEC,
};
