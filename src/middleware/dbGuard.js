const { db } = require("../firebase");

/**
 * Shared Database Availability Guard Middleware
 * Returns 503 Service Unavailable if database connection is down,
 * preventing cascading null pointer exceptions and boilerplate checks in route handlers.
 */
function requireDb(req, res, next) {
  if (!db) {
    return res.status(503).json({
      success: false,
      message: "Database temporarily unavailable.",
    });
  }
  next();
}

/**
 * Synchronous DB check helper for non-middleware contexts
 * @param {import("express").Response} res
 * @param {string} [customMessage]
 * @returns {boolean} true if db is connected, false if 503 response was sent
 */
function checkDb(res, customMessage = "Database temporarily unavailable.") {
  if (!db) {
    res.status(503).json({ success: false, message: customMessage });
    return false;
  }
  return true;
}

module.exports = {
  requireDb,
  checkDb,
};
