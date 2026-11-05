const express = require("express");
const router = express.Router();
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// Authenticate token on all AI routes so req.user is accurately populated
router.use(authenticateToken);
const {
  generateAcademicAnswer,
  getAiTelemetry,
  updateAiSettings,
  resetDailyCounters,
  testAiProvider,
  incrementCircleSearchUsage,
  setupTelegramAiSupportTopics,
  exportAiSearchReport,
} = require("../services/aiService");
const {
  getAiSearchLogsFromTurso,
  getAccountPurgeLogsFromTurso,
  exportPurgeAuditReport,
} = require("../services/tursoService");
const {
  computeQueryHash,
  getCachedCircleSolution,
  saveCircleSolution,
  getCircleSearchTelemetry,
} = require("../services/tursoCircleSearchService");

// Student Rate Limiter (Prevent single student spamming AI endpoints, with Admin immunity)
const studentRateLimitMap = new Map();
function studentAiLimiter(req, res, next) {
  // 🛡️ Admin Immunity: Administrators and half-admins are never rate limited
  if (req.user?.role === "admin" || req.user?.role === "half_admin" || req.user?.isMainAdmin) {
    return next();
  }

  const identifier = req.user?.id ? `user_${req.user.id}` : `ip_${req.ip || "127.0.0.1"}`;
  const now = Date.now();
  const lastTime = studentRateLimitMap.get(identifier) || 0;
  
  let cooldownSec = 3;
  try {
    const tel = getAiTelemetry();
    if (req.path.includes("circle") && tel?.settings?.circleSearchCooldownSec !== undefined) {
      cooldownSec = tel.settings.circleSearchCooldownSec;
    }
  } catch (_) {}

  // Enforce cooldown per student
  if (now - lastTime < cooldownSec * 1000) {
    return res.status(429).json({
      success: false,
      message: `Please wait ${cooldownSec} seconds before submitting another question.`,
      retryAfterSeconds: cooldownSec,
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
 * Primary student endpoint to ask questions about lecture notes (Dual Waterfall Engine + Turso Cloud Caching)
 */
router.post("/ask", studentAiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { query, context, noteId, subject, imageBase64, imageMimeType } = req.body;
    if ((!query || !String(query).trim()) && !imageBase64) {
      return res.status(400).json({ success: false, message: "Query text or image is required" });
    }

    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Image payload exceeds maximum allowed size of 5MB" });
    }

    const cleanQuery = typeof query === "string" ? query.trim().slice(0, 5000) : "";
    const cleanContext = typeof context === "string" ? context.slice(0, 15000) : "";
    const queryHash = computeQueryHash(cleanQuery || (imageBase64 ? String(imageBase64).slice(0, 100) : "empty"));

    // 1. Check L1 RAM & L2 Turso Cloud Cache (0ms response, 0 API quota)
    const cachedSolution = !imageBase64 ? await getCachedCircleSolution(queryHash) : null;
    if (cachedSolution) {
      return res.json({
        success: true,
        answer: cachedSolution.answer,
        provider: cachedSolution.provider,
        model: cachedSolution.model,
        cached: true,
        cacheSource: cachedSolution.source || "Turso Cloud Cache",
        hits: cachedSolution.hits,
        latencyMs: Date.now() - startTime,
      });
    }

    // 2. Cache Miss: Run Dual AI Waterfall (Groq LPU Primary -> Gemini 2.0 Failover)
    const fullContext = cleanContext
      ? `[Subject: ${subject || "Engineering/Science"}]\n${cleanContext}`
      : `[Subject: ${subject || "Engineering/Science"}]`;
    const result = await generateAcademicAnswer(cleanQuery, fullContext, { noteId, user: req.user, subject, imageBase64, imageMimeType });

    // 3. Save to Turso Cloud Cache so next student gets 0ms instant response
    if (result && result.answer) {
      saveCircleSolution(queryHash, cleanQuery, result.answer, result.provider, result.model).catch(() => {});
    }

    return res.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      failover: result.failover,
      cached: false,
      cacheSource: "Cloud Engine (Fresh)",
      latencyMs: Date.now() - startTime,
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
 * ⭕ POST /api/ai/circle-search
 * Circle to Search Solver with Instant Turso L2 & RAM L1 Caching
 */
router.post("/circle-search", studentAiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { query, context, noteId, subject, imageBase64, imageMimeType } = req.body;
    if ((!query || !String(query).trim()) && !imageBase64) {
      return res.status(400).json({ success: false, message: "Query text, formula, or crop image is required" });
    }

    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Image payload exceeds maximum allowed size of 5MB" });
    }

    // 0. Check Master Admin Toggle & Daily Limit
    const telemetry = getAiTelemetry();
    if (telemetry?.settings?.circleSearchEnabled === false) {
      return res.status(403).json({
        success: false,
        disabled: true,
        message: "Circle to Search AI is currently paused by admin in Tab 16.",
      });
    }

    const circleUsed = telemetry?.usage?.circleSearchUsedToday || 0;
    const circleLimit = telemetry?.settings?.circleSearchDailyLimit || 2000;
    if (circleUsed >= circleLimit) {
      return res.status(429).json({
        success: false,
        limitExceeded: true,
        message: `Daily Circle to Search quota (${circleLimit} queries) reached for today.`,
      });
    }

    const cleanQuery = typeof query === "string" ? query.trim().slice(0, 5000) : "";
    const cleanContext = typeof context === "string" ? context.slice(0, 15000) : "";
    const queryHash = computeQueryHash(cleanQuery || (imageBase64 ? String(imageBase64).slice(0, 100) : "empty"));

    // 1. Check L1 RAM & L2 Turso Cache First (0ms / sub-5ms - 0 API cost!)
    const cachedSolution = !imageBase64 ? await getCachedCircleSolution(queryHash) : null;
    if (cachedSolution) {
      return res.json({
        success: true,
        answer: cachedSolution.answer,
        provider: cachedSolution.provider,
        model: cachedSolution.model,
        cached: true,
        cacheSource: cachedSolution.source,
        hits: cachedSolution.hits,
        latencyMs: Date.now() - startTime,
      });
    }

    // 2. Cache Miss: Generate fresh solution via Dual Groq / Gemini Engine
    const fullContext = cleanContext
      ? `[Subject: ${subject || "Engineering/Science"}]\n${cleanContext}`
      : `[Subject: ${subject || "Engineering/Science"}]`;
    const result = await generateAcademicAnswer(cleanQuery, fullContext, { noteId, user: req.user, imageBase64, imageMimeType });

    // Track circle search usage
    incrementCircleSearchUsage();

    // 3. Async save to Turso & RAM Cache for next students
    if (result && result.answer) {
      saveCircleSolution(queryHash, cleanQuery, result.answer, result.provider, result.model).catch(() => {});
    }

    return res.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      failover: result.failover,
      cached: false,
      latencyMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[CIRCLE-SEARCH-ROUTE] Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to solve circled query",
    });
  }
});

/**
 * ⭕ GET /api/ai/circle-search/telemetry
 */
router.get("/circle-search/telemetry", async (req, res) => {
  try {
    const stats = await getCircleSearchTelemetry();
    return res.json({ success: true, ...stats });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
    else if (provider === "cloudflare" || provider === "cf" || provider === "cloudflare-ai") update.cloudflareAiEnabled = Boolean(enabled);
    else if (provider === "edge") update.edgeProxyEnabled = Boolean(enabled);
    else if (provider === "circle" || provider === "circle-search") update.circleSearchEnabled = Boolean(enabled);
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
 * 🔒 ADMIN CLOUDFLARE AI CONFIG: POST /api/ai/admin/cloudflare-config
 */
router.post("/admin/cloudflare-config", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { enabled, dailyLimit } = req.body;
    const update = {};
    if (typeof enabled === "boolean") update.cloudflareAiEnabled = enabled;
    if (dailyLimit !== undefined && !isNaN(Number(dailyLimit)) && Number(dailyLimit) > 0) {
      update.cloudflareAiLimit = Number(dailyLimit);
    }

    const result = await updateAiSettings(update);
    return res.json({ success: true, message: "Cloudflare Workers AI settings updated successfully", telemetry: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN CIRCLE SEARCH CONFIG: POST /api/ai/admin/circle-config
 */
router.post("/admin/circle-config", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { enabled, dailyLimit, cooldownSec } = req.body;
    const update = {};
    if (typeof enabled === "boolean") update.circleSearchEnabled = enabled;
    if (dailyLimit !== undefined && !isNaN(Number(dailyLimit))) update.circleSearchDailyLimit = Number(dailyLimit);
    if (cooldownSec !== undefined && !isNaN(Number(cooldownSec))) update.circleSearchCooldownSec = Number(cooldownSec);

    const result = await updateAiSettings(update);
    return res.json({ success: true, message: "Circle to Search settings updated successfully", telemetry: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN KEYS: POST /api/ai/admin/keys
 * Disabled for Zero-Leak Security: keys are loaded purely from server-side .env
 */
router.post("/admin/keys", authenticateToken, requireAdmin, (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Security Notice: API keys are loaded directly from the server .env file (GROQ_API_KEY & GEMINI_API_KEY) to prevent client leaks.",
  });
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

/**
 * 🔒 ADMIN TELEGRAM TOPICS: POST /api/ai/admin/setup-telegram-topics
 */
router.post("/admin/setup-telegram-topics", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await setupTelegramAiSupportTopics();
    return res.json({
      success: result.success,
      message: result.success ? "Support sub-topics successfully configured in FSM Support Supergroup" : "Failed to setup topics",
      result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN RECENT SEARCHES: GET /api/ai/admin/recent-searches
 */
router.get("/admin/recent-searches", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const logs = await getAiSearchLogsFromTurso({ limit: safeLimit, search });
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN EXPORT REPORT: GET /api/ai/admin/export-report
 */
router.get("/admin/export-report", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const format = req.query.format === "pdf" ? "pdf" : (req.query.format === "json" ? "json" : "excel");
    const report = await exportAiSearchReport({ format, search, limit: safeLimit });
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.send(report.data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN RECENT PURGES: GET /api/ai/admin/purge-history
 */
router.get("/admin/purge-history", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const logs = await getAccountPurgeLogsFromTurso({ limit: safeLimit, search });
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN EXPORT PURGE REPORT: GET /api/ai/admin/purge-history/export
 */
router.get("/admin/purge-history/export", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const format = req.query.format === "pdf" ? "pdf" : "excel";
    const report = await exportPurgeAuditReport({ format, search, limit: safeLimit });
    res.setHeader("Content-Type", report.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    return res.send(report.data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

