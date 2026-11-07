const express = require("express");
const router = express.Router();
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { db } = require("../firebase");

// Authenticate token on all AI routes so req.user is accurately populated
router.use(authenticateToken);
const {
  generateAcademicAnswer,
  extractHandwritingVision,
  getAiTelemetry,
  updateAiSettings,
  resetDailyCounters,
  testAiProvider,
  incrementCircleSearchUsage,
  setupTelegramAiSupportTopics,
  exportAiSearchReport,
  dispatchAiSearchTelegramAudit,
} = require("../services/aiService");
const {
  getAiSearchLogsFromTurso,
  getAiStudentsSummaryFromTurso,
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

// 🛡️ Periodic Memory Leak Shield: Prune stale rate-limit timestamps every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, time] of studentRateLimitMap.entries()) {
    if (now - time > 60000) studentRateLimitMap.delete(key);
  }
}, 60000);

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
    const { query, context, noteId, subject, imageBase64, imageMimeType, skipCache } = req.body;
    if ((!query || !String(query).trim()) && !imageBase64) {
      return res.status(400).json({ success: false, message: "Query text or image is required" });
    }

    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 5 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Image payload exceeds maximum allowed size of 5MB" });
    }

    const cleanQuery = typeof query === "string" ? query.trim().slice(0, 5000) : "";
    const cleanContext = typeof context === "string" ? context.slice(0, 15000) : "";
    const isConversationalTurn = Boolean(skipCache) || cleanContext.includes("[CONVERSATION_CONTEXT]");
    const hashSeed = isConversationalTurn
      ? `${cleanQuery}__ctx__${cleanContext.slice(-600)}`
      : cleanQuery || (imageBase64 ? String(imageBase64).slice(0, 100) : "empty");
    const queryHash = computeQueryHash(hashSeed);

    // 1. Check L1 RAM & L2 Turso Cloud Cache (0ms response, 0 API quota)
    const cachedSolution = !imageBase64 && !skipCache ? await getCachedCircleSolution(queryHash) : null;
    if (cachedSolution) {
      dispatchAiSearchTelegramAudit({
        user: req.user,
        query: cleanQuery,
        provider: cachedSolution.provider || "turso_cache",
        model: cachedSolution.model || "Turso Edge Cloud Cache",
        latencyMs: Date.now() - startTime,
        cached: true,
        noteId,
        queryType: "ai_query",
      }).catch(() => {});

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
    const result = await generateAcademicAnswer(cleanQuery, fullContext, {
      noteId,
      user: req.user,
      subject,
      imageBase64,
      imageMimeType,
      queryType: "ai_query",
    });

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
    const skipCache = Boolean(req.body?.skipCache);
    const isConversationalTurn = skipCache || cleanContext.includes("[CONVERSATION_CONTEXT]");
    const hashSeed = isConversationalTurn
      ? `${cleanQuery}__ctx__${cleanContext.slice(-600)}`
      : imageBase64
        ? `${cleanQuery}__img__${String(imageBase64).slice(0, 24000)}`
        : (cleanQuery || "empty");
    const queryHash = computeQueryHash(hashSeed);

    // 1. Check L1 RAM & L2 Turso Cache First (0ms / sub-5ms - 0 API cost!)
    const cachedSolution = !skipCache ? await getCachedCircleSolution(queryHash) : null;
    if (cachedSolution) {
      dispatchAiSearchTelegramAudit({
        user: req.user,
        query: cleanQuery || (imageBase64 ? "[Circled Visual Crop / Formula]" : "Circled Academic Question"),
        provider: cachedSolution.provider || "turso_cache",
        model: cachedSolution.model || "Turso Edge Cloud Cache",
        latencyMs: Date.now() - startTime,
        cached: true,
        noteId,
        queryType: "circle_search",
      }).catch(() => {});

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
    const result = await generateAcademicAnswer(cleanQuery, fullContext, {
      noteId,
      user: req.user,
      imageBase64,
      imageMimeType,
      queryType: "circle_search",
    });

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
 * ✍️ POST /api/ai/ocr-handwriting
 * Ultra-fast (~0.45s) Multimodal Vision Handwriting & Math Extractor for Circle to Search
 * Uses separate burst limiter key so circling & immediately clicking "Solve" never triggers 429!
 */
router.post("/ocr-handwriting", async (req, res) => {
  try {
    const isAdmin = req.user?.role === "admin" || req.user?.role === "half_admin" || req.user?.isMainAdmin;
    if (!isAdmin) {
      const ocrKey = req.user?.id ? `ocr_user_${req.user.id}` : `ocr_ip_${req.ip || "127.0.0.1"}`;
      const now = Date.now();
      const last = studentRateLimitMap.get(ocrKey) || 0;
      if (now - last < 350) {
        return res.status(429).json({ success: false, message: "Scanning too fast, please wait a moment." });
      }
      studentRateLimitMap.set(ocrKey, now);
    }

    const { imageBase64, imageMimeType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ success: false, message: "imageBase64 is required" });
    }
    if (imageBase64.length > 5 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Image payload exceeds 5MB limit" });
    }

    const result = await extractHandwritingVision(imageBase64, imageMimeType || "image/jpeg");
    return res.json({
      success: true,
      text: result.text,
      provider: result.provider,
      model: result.model,
      cached: result.cached,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return res.status(422).json({
      success: false,
      message: err.message || "Could not extract handwritten text",
    });
  }
});

/**
 * 🛠️ Robust AI JSON & LaTeX Parser
 * Safely parses LLM JSON outputs containing unescaped LaTeX backslashes or introductory markdown
 */
function safeParseAiJson(rawText) {
  if (!rawText || typeof rawText !== "string") return null;

  // 1. Strip markdown codeblocks
  let cleaned = rawText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // 2. Extract array bounds
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }

  // 3. Try standard parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (_) {}

  // 4. Sanitize unescaped LaTeX backslashes in JSON string
  try {
    const sanitized = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (_) {}

  // 5. Aggressive regex-based card extractor for stubborn LLM formats
  try {
    const cards = [];
    const blockRegex = /"question"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"category"\s*:\s*"([\s\S]*?)")?/g;
    let match;
    while ((match = blockRegex.exec(cleaned)) !== null) {
      cards.push({
        question: match[1].replace(/\\n/g, "\n").trim(),
        answer: match[2].replace(/\\n/g, "\n").trim(),
        category: (match[3] || "Core Concept").trim(),
      });
    }
    if (cards.length > 0) return cards;
  } catch (_) {}

  return null;
}

/**
 * 🛡️ Sanitize AI Executive Summary
 * Prevents cut-off math formulas (e.g. "\(P = \frac{1") at token boundary
 */
function sanitizeAiSummary(summaryText) {
  if (!summaryText) return "";
  let text = String(summaryText).trim();

  // Check unclosed inline math \( ... \)
  const lastOpenMath = text.lastIndexOf("\\(");
  const lastCloseMath = text.lastIndexOf("\\)");
  if (lastOpenMath > lastCloseMath) {
    const lastNewline = text.lastIndexOf("\n");
    if (lastOpenMath > lastNewline && lastNewline > 0) {
      text = text.substring(0, lastNewline).trim();
    } else {
      text = text + " \\)";
    }
  }

  // Check unclosed block math \[ ... \]
  const lastOpenBlock = text.lastIndexOf("\\[");
  const lastCloseBlock = text.lastIndexOf("\\]");
  if (lastOpenBlock > lastCloseBlock) {
    const lastNewline = text.lastIndexOf("\n");
    if (lastOpenBlock > lastNewline && lastNewline > 0) {
      text = text.substring(0, lastNewline).trim();
    } else {
      text = text + " \\]";
    }
  }

  return text;
}

/**
 * Pull rich note metadata & full OCR text from Firestore so flashcards & summaries
 * reflect the complete, authentic contents of the PDF!
 */
async function getNoteFullContext(noteId, clientContext = "") {
  let combined = (clientContext || "").trim();
  if (!noteId || !db) return combined;

  try {
    const doc = await db.collection("notes").doc(noteId).get();
    if (doc.exists) {
      const data = doc.data() || {};
      const ocr = (data.ocrText || "").trim();
      const desc = (data.description || "").trim();
      const extraParts = [];
      if (data.title) extraParts.push(`Document Title: ${data.title}`);
      if (data.subject) extraParts.push(`Academic Subject: ${data.subject}`);
      if (data.branch) extraParts.push(`Branch: ${data.branch}`);
      if (data.semester) extraParts.push(`Semester: ${data.semester}`);
      if (desc && !desc.includes("TECH TITAN STORAGE") && !desc.includes("Synced from Telegram")) {
        extraParts.push(`Document Overview: ${desc}`);
      }
      if (ocr) {
        extraParts.push(`Complete PDF Extracted Content & OCR Text:\n${ocr.slice(0, 10000)}`);
      }
      const noteDetails = extraParts.join("\n\n");
      if (noteDetails) {
        combined = combined ? `${combined}\n\n[Database Note Details & OCR Content]:\n${noteDetails}` : noteDetails;
      }
    }
  } catch (err) {
    console.warn("[AI-ROUTE] Could not pull note document text from database:", err.message);
  }
  return combined;
}

/**
 * 🗂️ POST /api/ai/flashcards
 * Generates or retrieves cached study flashcards for a note/PDF (0ms Turso Cache)
 */
router.post("/flashcards", studentAiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { noteId, title = "Lecture Note", context = "", subject = "", forceFresh = false } = req.body;
    if (!noteId && !context && !title) {
      return res.status(400).json({ success: false, message: "noteId, title or context is required" });
    }

    const cleanTitle = String(title || "Lecture Notes").trim().slice(0, 200);
    const hashKey = `flashcards_${noteId || "note"}_${cleanTitle}`;
    const queryHash = computeQueryHash(hashKey);

    // 1. Check Turso L2 / RAM L1 Cache (0ms Instant Hit)
    const cachedSolution = !forceFresh ? await getCachedCircleSolution(queryHash) : null;
    if (cachedSolution && cachedSolution.answer) {
      let cards = [];
      try {
        cards = JSON.parse(cachedSolution.answer);
      } catch (_) {}

      if (Array.isArray(cards) && cards.length > 0) {
        dispatchAiSearchTelegramAudit({
          user: req.user,
          query: `🗂️ Flashcards: ${cleanTitle}`,
          provider: cachedSolution.provider || "turso_cache",
          model: cachedSolution.model || "Turso Edge Cache (0ms)",
          latencyMs: Date.now() - startTime,
          cached: true,
          noteId,
          noteTitle: cleanTitle,
          queryType: "flashcards",
        }).catch(() => {});

        return res.json({
          success: true,
          flashcards: cards,
          provider: cachedSolution.provider,
          model: cachedSolution.model,
          cached: true,
          cacheSource: cachedSolution.source || "Turso Edge Cache",
          latencyMs: Date.now() - startTime,
        });
      }
    }

    // Pull full authentic PDF OCR text from Firestore & client
    const enrichedContext = await getNoteFullContext(noteId, context);

    // 2. Cache Miss: Generate Fresh Comprehensive Flashcards using AI Waterfall
    const prompt = `You are an expert college professor creating an exhaustive, highly detailed study flashcard deck for engineering/science students studying "${cleanTitle}" [Subject: ${subject || "Engineering"}].
Based on the thorough lecture notes and OCR text provided below, generate 8 to 12 comprehensive, deeply detailed exam flashcards.

Rules for high quality:
1. Cover every major aspect of the document: fundamental principles, crucial formulas, derivations, comparisons, step-by-step algorithms, and common exam questions.
2. In the "answer", do NOT give lazy 1-line answers! Provide full, deep, educational explanations with clear variable meanings, step-by-step reasoning, and standard LaTeX notation like \\(P = \\frac{1}{2}\\rho A v^3\\).
3. Assign appropriate categories: "Core Concept", "Formula & Derivation", "Key Theorem", "Exam Problem", or "Comparison".

Context Notes & Document OCR Text:
${enrichedContext.slice(0, 8500) || cleanTitle}

Return ONLY a valid JSON array of objects with this exact structure without markdown backticks:
[
  {
    "question": "Clear, detailed concept, definition or problem question",
    "answer": "Thorough, comprehensive explanation with formulas if applicable using LaTeX \\(x = \\pm 2\\)",
    "category": "Core Concept"
  }
]`;

    const result = await generateAcademicAnswer(prompt, enrichedContext, {
      noteId,
      user: req.user,
      noteTitle: cleanTitle,
      subject,
      queryType: "flashcards",
      maxTokens: 1800,
    });

    let flashcards = [];
    if (result && result.answer) {
      flashcards = safeParseAiJson(result.answer) || [];
    }

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      flashcards = [
        {
          question: `What are the core engineering concepts in ${cleanTitle}?`,
          answer: enrichedContext.slice(0, 500) || "Comprehensive study of concepts, laws, and exam definitions.",
          category: "Core Concept",
        },
      ];
    }

    // Save to Turso Cache in the same database!
    saveCircleSolution(queryHash, `Flashcards: ${cleanTitle}`, JSON.stringify(flashcards), result.provider, result.model).catch(() => {});

    return res.json({
      success: true,
      flashcards,
      provider: result.provider,
      model: result.model,
      cached: false,
      latencyMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[FLASHCARDS-ROUTE] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to generate flashcards: " + err.message });
  }
});

/**
 * 📄 POST /api/ai/summary
 * Generates or retrieves cached Executive Summary for a note/PDF (0ms Turso Cache)
 */
router.post("/summary", studentAiLimiter, async (req, res) => {
  const startTime = Date.now();
  try {
    const { noteId, title = "Lecture Note", context = "", subject = "", forceFresh = false } = req.body;
    if (!noteId && !context && !title) {
      return res.status(400).json({ success: false, message: "noteId, title or context is required" });
    }

    const cleanTitle = String(title || "Lecture Notes").trim().slice(0, 200);
    const hashKey = `summary_${noteId || "note"}_${cleanTitle}`;
    const queryHash = computeQueryHash(hashKey);

    // 1. Check Turso L2 / RAM L1 Cache (0ms Instant Hit)
    const cachedSolution = !forceFresh ? await getCachedCircleSolution(queryHash) : null;
    const isTruncatedCache = Boolean(
      cachedSolution &&
      cachedSolution.answer &&
      (cachedSolution.answer.trim().endsWith("\\") ||
       cachedSolution.answer.trim().endsWith("\\(") ||
       cachedSolution.answer.trim().endsWith("\\frac{1") ||
       cachedSolution.answer.trim().endsWith("{1") ||
       cachedSolution.answer.trim().endsWith("\\frac{") ||
       !cachedSolution.answer.includes("💡") ||
       cachedSolution.answer.length < 250)
    );

    if (cachedSolution && cachedSolution.answer && !isTruncatedCache) {
      dispatchAiSearchTelegramAudit({
        user: req.user,
        query: `📄 Summary: ${cleanTitle}`,
        provider: cachedSolution.provider || "turso_cache",
        model: cachedSolution.model || "Turso Edge Cache (0ms)",
        latencyMs: Date.now() - startTime,
        cached: true,
        noteId,
        noteTitle: cleanTitle,
        queryType: "summary",
      }).catch(() => {});

      return res.json({
        success: true,
        summary: cachedSolution.answer,
        provider: cachedSolution.provider,
        model: cachedSolution.model,
        cached: true,
        cacheSource: cachedSolution.source || "Turso Edge Cache",
        latencyMs: Date.now() - startTime,
      });
    }

    // Pull full authentic PDF OCR text from Firestore & client
    const enrichedContext = await getNoteFullContext(noteId, context);

    // 2. Cache Miss: Generate Fresh User-Friendly Executive Summary using AI Waterfall
    const prompt = `You are a distinguished university professor creating an authoritative, deeply structured, and user-friendly Executive Study Summary for college students studying "${cleanTitle}" [Subject: ${subject || "Engineering"}].
Based on the complete lecture notes and OCR text below, write an engaging, crystal-clear, exam-oriented synthesis.

Format strictly with these clean, visually distinct sections:
### 🎯 1. Chapter & Topic Blueprint
Explain what this entire material covers in 3-4 friendly, crystal-clear sentences so any student understands the big picture instantly.

### 📌 2. Core Concepts & Crucial Definitions
Provide 6 to 8 deep, high-yield bullet points breaking down each key concept, law, or mechanism in simple, intuitive terms.

### ⚡ 3. Key Formulas, Laws & Theorems
List all important mathematical formulas and laws in standard LaTeX notation like \\(P = \\frac{1}{2}\\rho A v^3\\). Under each formula, clearly state what each variable represents (e.g. \\(P\\) = Power, \\(\\rho\\) = Density, \\(A\\) = Area, \\(v\\) = Velocity).

### 📝 4. Step-by-Step Mechanisms & Working Principles
Explain the physical workflow, algorithm, or derivation steps systematically with numbered steps.

### 🏆 5. Top 5 High-Yield Semester Exam Questions
List 5 essential questions professors frequently ask in university exams along with concise, model scoring answers.

### 💡 6. Rapid Revision Cheat-Sheet
Provide 4-5 bulleted quick-revision golden rules for students to review right before entering the exam hall.

Context Notes & Document OCR Text:
${enrichedContext.slice(0, 9500) || cleanTitle}`;

    const result = await generateAcademicAnswer(prompt, enrichedContext, {
      noteId,
      user: req.user,
      noteTitle: cleanTitle,
      subject,
      queryType: "summary",
      maxTokens: 1800,
    });

    let summaryText = result?.answer || "Summary generation completed.";
    summaryText = sanitizeAiSummary(summaryText);

    // Save to Turso Cache in the same database!
    saveCircleSolution(queryHash, `Summary: ${cleanTitle}`, summaryText, result.provider, result.model).catch(() => {});

    return res.json({
      success: true,
      summary: summaryText,
      provider: result.provider,
      model: result.model,
      cached: false,
      latencyMs: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[SUMMARY-ROUTE] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to generate summary: " + err.message });
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
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : null;
    const userEmail = typeof req.query.userEmail === "string" ? req.query.userEmail.trim() : null;
    const logs = await getAiSearchLogsFromTurso({ limit: safeLimit, search, userId, userEmail });
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🔒 ADMIN AI STUDENTS SUMMARY: GET /api/ai/admin/students
 */
router.get("/admin/students", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const safeLimit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 100) : "";
    const students = await getAiStudentsSummaryFromTurso({ limit: safeLimit, search });
    return res.json({ success: true, count: students.length, students });
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

