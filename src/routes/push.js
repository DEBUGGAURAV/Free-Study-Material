/**
 * 🔔 Native Web Push Notification Routes (/api/push)
 * Handles VAPID public key delivery, subscription lifecycle, and admin broadcasts.
 */

const express = require("express");
const router = express.Router();
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimit");

// 🛡️ Protect push subscription endpoints against high-volume bot flooding
router.use(apiLimiter);
const {
  getPublicVapidKey,
  subscribeDevice,
  unsubscribeDevice,
  getPushStats,
  broadcastPushNotification,
} = require("../services/webPushService");

function tryDecodeUser(req) {
  try {
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../middleware/auth");
    const cookieToken = req.cookies?.fsm_token || req.cookies?.token || req.cookies?.vault_token;
    const authHeader = req.headers?.authorization;
    const headerToken = authHeader && typeof authHeader === "string" ? authHeader.split(" ")[1] : null;
    const raw = cookieToken || headerToken;
    if (!raw) return null;
    return jwt.verify(raw, JWT_SECRET);
  } catch {
    return null;
  }
}

// 1. Public VAPID Key endpoint (Zero DB cost after boot init)
router.get("/vapid-key", async (req, res) => {
  try {
    const info = await getPublicVapidKey();
    return res.json({
      success: true,
      enabled: info.enabled,
      publicKey: info.publicKey,
      source: info.source,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Subscribe current browser/device PushSubscription
router.post("/subscribe", async (req, res) => {
  try {
    const subscription = req.body?.subscription || req.body;
    const user = tryDecodeUser(req);
    const result = await subscribeDevice(subscription, {
      userId: user?.id || null,
      userEmail: user?.email || null,
      userAgent: req.headers?.["user-agent"] || "",
    });
    return res.status(201).json({
      success: true,
      message: "Push notifications enabled for this device!",
      ...result,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Invalid push subscription" });
  }
});

// 3. Unsubscribe browser/device
router.post("/unsubscribe", async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
    const result = await unsubscribeDevice(endpoint);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Admin Stats (subscriber count + VAPID health + total sent)
router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await getPushStats();
    return res.json({ success: true, stats });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Admin Custom / Test Broadcast Push
router.post("/broadcast", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      title = "📢 Study Alert — Free Study Material",
      body = "New notes & exam PYQs are ready to read!",
      url = "/",
      tag = "fsm-admin-broadcast",
      ignoreAdminFlag = false,
    } = req.body || {};

    const result = await broadcastPushNotification({
      title,
      body,
      url,
      tag,
      ignoreAdminFlag: Boolean(ignoreAdminFlag),
    });

    return res.json({
      success: true,
      result,
      message: result.skipped
        ? "Web Push is currently turned OFF in Admin Panel."
        : `Dispatched to ${result.sent} device(s) (failed: ${result.failed}, pruned: ${result.pruned}).`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
