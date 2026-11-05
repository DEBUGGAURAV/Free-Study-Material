const express = require("express");
const router = express.Router();
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  generateAcademicAnswer,
  getAiTelemetry,
  updateAiSettings,
  resetDailyCounters,
  testAiProvider,
} = require("../services/aiService");

// Student Rate Limiter (Prevent single student spamming AI endpoints)
const studentRateLimitMap = new Map();
function studentAiLimiter(req, res, next) {
  const identifier = req.user?.id || req.ip || "127.0.0.1";
  const now = Date.now();
  const lastTime = studentRateLimitMap.get(identifier) || 0;
  // Enforce 3-second cooldown per student
  if (now - lastTime < 3000) {
    return res.status(429).json({
      success: false,
      message: "Please wait 3 seconds before submitting another AI question.",
      retryAfterSeconds: 3,
    });
  }
  studentRateLimitMap.set(identifier, now);

  // Clean old entries periodically
  if (studentRateLimitMap.size > 2000) {
    for (const [key, time] of studentRateLimitMap.entries()) {
      if (now - time > 60000) studentRateLimitMap.delete(key);
    }
  }
  next();
}

/**
 * 🎓 POST /api/ai/ask
 * Primary student endpoint to ask questions about lecture notes
 */
router.post("/ask", studentAiLimiter, async (req, res) => {
  try {
    const { query, context, noteId } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: "Query text is required" });
    }

    const result = await generateAcademicAnswer(query, context, { noteId, user: req.user });
    return res.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      failover: result.failover,
      latencyMs: result.latencyMs,
      cached: result.cached || false,
    });
  } catch (err) {
    console.error("[AI-ROUTE] Error processing query:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate AI response",
    });
  }
});

/**
 * 🌐 GET /api/ai/status
 * Public status check for students
 */
router.get("/status", (req, res) => {
  const telemetry = getAiTelemetry();
  res.json({
    success: true,
    active: telemetry.settings.groqEnabled || telemetry.settings.geminiEnabled,
    groqActive: telemetry.settings.groqEnabled && telemetry.settings.groqApiKeyConfigured,
    geminiActive: telemetry.settings.geminiEnabled && telemetry.settings.geminiApiKeyConfigured,
    totalDailyCapacity: telemetry.usage.totalDailyCapacity,
  });
});

/**
 * 🔒 ADMIN TELEMETRY: GET /api/ai/admin/telemetry
 */
router.get("/admin/telemetry", authenticateToken, requireAdmin, (req, res) => {
  try {
    const telemetry = getAiTelemetry();
    return res.json(telemetry);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN TOGGLE: POST /api/ai/admin/toggle
 */
router.post("/admin/toggle", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { provider, enabled } = req.body;
    const update = {};
    if (provider === "groq") update.groqEnabled = Boolean(enabled);
    else if (provider === "gemini") update.geminiEnabled = Boolean(enabled);
    else if (provider === "edge") update.edgeProxyEnabled = Boolean(enabled);
    else {
      return res.status(400).json({ success: false, message: "Invalid provider specified" });
    }

    const result = await updateAiSettings(update);
    return res.json({ success: true, message: `${provider.toUpperCase()} state updated`, telemetry: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN KEYS: POST /api/ai/admin/keys
 */
router.post("/admin/keys", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { groqApiKey, geminiApiKey } = req.body;
    const update = {};
    if (typeof groqApiKey === "string") update.groqApiKey = groqApiKey.trim();
    if (typeof geminiApiKey === "string") update.geminiApiKey = geminiApiKey.trim();

    const result = await updateAiSettings(update);
    return res.json({ success: true, message: "AI API credentials saved successfully", telemetry: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN RESET: POST /api/ai/admin/reset
 */
router.post("/admin/reset", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await resetDailyCounters();
    return res.json({ success: true, message: "Daily AI usage counters reset to 0", telemetry: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN TEST PING: POST /api/ai/admin/test
 */
router.post("/admin/test", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { provider } = req.body;
    const testResult = await testAiProvider(provider);
    return res.json({ success: true, testResult });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
