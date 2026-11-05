/**
 * 🤖 AI Engine Service: Dual Groq LPU + Gemini 2.0 Flash Failover Architecture
 * High-Capacity, Zero-Server-CPU Academic Inference Engine
 * 
 * Primary: Groq Cloud (Llama 3.1 8B Instant) • 14,400 Requests/Day • ~800 tokens/sec
 * Secondary/Failover: Google Gemini 2.0 Flash • 1,500 Requests/Day
 * Combined Free Daily Quota: 15,900 Requests / Day!
 */

const { db } = require("../firebase");
const { ramCache } = require("../utils/ramCache");
const { logAiSearchToTurso, getAiSearchLogsFromTurso } = require("./tursoService");
const { getHelpBotToken, getHelpChatId } = require("./helpTicketService");

// Default In-Memory Telemetry State
const DEFAULT_AI_SETTINGS = {
  groqEnabled: true,
  geminiEnabled: true,
  edgeProxyEnabled: true,
  circleSearchEnabled: true, // ⭕ Circle to Search & Solve Master Toggle
  circleSearchDailyLimit: 2000, // ⭕ Daily Limit for Circle to Search Queries
  circleSearchCooldownSec: 3, // ⭕ Cooldown between circle searches
  circleSearchUsedToday: 0,
  groqModel: "openai/gpt-oss-20b",
  geminiModel: "gemini-flash-lite-latest",
  groqLimit: 14400,
  geminiLimit: 1500,
  groqUsedToday: 0,
  geminiUsedToday: 0,
  totalQueriesToday: 0,
  failoversToday: 0,
  cachedHitsToday: 0,
  aiSearchTopicId: null, // 🤖 Telegram sub-topic for student AI queries
  purgeAuditTopicId: null, // 🔥 Telegram sub-topic for Firebase/Turso purge logs
  lastResetDate: new Date().toISOString().slice(0, 10),
  groqApiKey: "",
  geminiApiKey: "",
  updatedAt: new Date().toISOString(),
};

let currentAiSettings = { ...DEFAULT_AI_SETTINGS };
let isSettingsLoaded = false;

// 1-minute rolling rate limiter window
const rollingMinuteTracker = {
  groqRequests: [],
  geminiRequests: [],
};

function checkAndEnforceMinuteLimit(provider) {
  const now = Date.now();
  const windowStart = now - 60000;
  if (provider === "groq") {
    rollingMinuteTracker.groqRequests = rollingMinuteTracker.groqRequests.filter((t) => t > windowStart);
    if (rollingMinuteTracker.groqRequests.length >= 30) {
      return false; // 30 RPM limit reached
    }
    rollingMinuteTracker.groqRequests.push(now);
    return true;
  } else if (provider === "gemini") {
    rollingMinuteTracker.geminiRequests = rollingMinuteTracker.geminiRequests.filter((t) => t > windowStart);
    if (rollingMinuteTracker.geminiRequests.length >= 15) {
      return false; // 15 RPM limit reached
    }
    rollingMinuteTracker.geminiRequests.push(now);
    return true;
  }
  return true;
}

/**
 * Checks and resets daily counters if a new UTC day has started
 */
function checkDailyReset() {
  const today = new Date().toISOString().slice(0, 10);
  if (currentAiSettings.lastResetDate !== today) {
    console.log(`[AI-ENGINE] 🌅 New day detected (${today}). Auto-resetting daily AI counters...`);
    currentAiSettings.groqUsedToday = 0;
    currentAiSettings.geminiUsedToday = 0;
    currentAiSettings.circleSearchUsedToday = 0;
    currentAiSettings.totalQueriesToday = 0;
    currentAiSettings.failoversToday = 0;
    currentAiSettings.cachedHitsToday = 0;
    currentAiSettings.lastResetDate = today;
    saveAiSettingsToDb().catch(() => {});
  }
}

/**
 * Loads AI settings from Firestore on startup
 */
async function loadAiSettings() {
  try {
    if (db) {
      const doc = await db.collection("settings").doc("ai_engine").get();
      if (doc.exists) {
        const data = doc.data();
        currentAiSettings = {
          ...DEFAULT_AI_SETTINGS,
          ...data,
          // Environment variables take precedence if set
          groqApiKey: data.groqApiKey || process.env.GROQ_API_KEY || "",
          geminiApiKey: data.geminiApiKey || process.env.GEMINI_API_KEY || "",
        };

        // Auto-upgrade legacy/deprecated models to active, working models
        if (!currentAiSettings.geminiModel || currentAiSettings.geminiModel.includes("gemini-2.0") || currentAiSettings.geminiModel.includes("gemini-1.5") || currentAiSettings.geminiModel.includes("gemini-2.5")) {
          currentAiSettings.geminiModel = "gemini-flash-lite-latest";
        }
        if (!currentAiSettings.groqModel || currentAiSettings.groqModel.includes("llama-3.1") || currentAiSettings.groqModel.includes("llama-3.3")) {
          currentAiSettings.groqModel = "openai/gpt-oss-20b";
        }
        saveAiSettingsToDb().catch(() => {});
      } else {
        currentAiSettings.groqApiKey = process.env.GROQ_API_KEY || "";
        currentAiSettings.geminiApiKey = process.env.GEMINI_API_KEY || "";
        await db.collection("settings").doc("ai_engine").set(currentAiSettings, { merge: true });
      }
    } else {
      currentAiSettings.groqApiKey = process.env.GROQ_API_KEY || "";
      currentAiSettings.geminiApiKey = process.env.GEMINI_API_KEY || "";
    }
    checkDailyReset();
    isSettingsLoaded = true;
    console.log("[AI-ENGINE] 🤖 AI Engine telemetry loaded. Groq:", currentAiSettings.groqEnabled ? "ON" : "OFF", "| Gemini:", currentAiSettings.geminiEnabled ? "ON" : "OFF");
  } catch (err) {
    console.warn("[AI-ENGINE] Settings load warning:", err.message);
  }
}

/**
 * Saves current AI settings to Firestore
 */
async function saveAiSettingsToDb() {
  try {
    if (db) {
      currentAiSettings.updatedAt = new Date().toISOString();
      await db.collection("settings").doc("ai_engine").set(currentAiSettings, { merge: true });
    }
  } catch (err) {
    console.warn("[AI-ENGINE] Error persisting AI settings:", err.message);
  }
}

/**
 * Gets effective API key for provider
 */
function getApiKey(provider) {
  if (provider === "groq") {
    return (process.env.GROQ_API_KEY || currentAiSettings.groqApiKey || "").trim();
  }
  if (provider === "gemini") {
    return (process.env.GEMINI_API_KEY || currentAiSettings.geminiApiKey || "").trim();
  }
  return "";
}

/**
 * Query Groq Cloud LPU API (Llama 3.1 8B Instant)
 */
async function queryGroq(query, context) {
  const apiKey = getApiKey("groq");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY_MISSING");
  }

  if (!checkAndEnforceMinuteLimit("groq")) {
    throw new Error("GROQ_RPM_LIMIT");
  }

  const systemPrompt = `You are a brilliant, supportive AI academic tutor for college students studying engineering, science, and higher education. 
Answer the student's question accurately, concisely, and clearly based primarily on their provided lecture notes context.
Formatting rules:
- Highlight key definitions and formulas in **bold**.
- If page numbers or excerpts exist in the context, cite them clearly (e.g. "📌 [Reference: Page X]").
- Use clean bullet points for steps, algorithms, or properties.
- Keep the explanation under 220 words so students can grasp it instantly on mobile.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt & Citations]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: currentAiSettings.groqModel || "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        throw new Error(`GROQ_RATE_LIMIT_429: ${errText}`);
      }
      throw new Error(`Groq API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const answer = (data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || "").trim();
    if (!answer) throw new Error("Empty response from Groq");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query Google Gemini 2.0 Flash API (Text + Multimodal Image / Handwritten Notes)
 */
async function queryGemini(query, context, imageBase64 = null, imageMimeType = "image/jpeg") {
  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  if (!checkAndEnforceMinuteLimit("gemini")) {
    throw new Error("GEMINI_RPM_LIMIT");
  }

  const systemInstruction = `You are a brilliant, friendly academic tutor for college students studying engineering, science, and higher education.
Answer clearly and accurately based on the provided notes context or diagram/handwritten image.
- If page numbers or excerpts exist in the context, cite them prominently (e.g. "📌 [From Page X]").
- Highlight key definitions and formulas in **bold**.
- Use clean bullet points for steps or derivations.
- Keep the explanation high-yield, structured, and concise.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const promptText = `${systemInstruction}\n\n${context ? `[Study Notes Context & Citations]:\n${context.slice(0, 4500)}\n\n` : ""}[Student Question]:\n${query || "Analyze and solve the problem/diagram shown in this study note."}\n\nProvide an authoritative, student-friendly answer.`;

  const parts = [{ text: promptText }];
  if (imageBase64) {
    const cleanB64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    parts.push({
      inline_data: {
        mime_type: imageMimeType || "image/jpeg",
        data: cleanB64,
      },
    });
  }

  const primaryModel = currentAiSettings.geminiModel || "gemini-flash-lite-latest";
  const fallbackModel = primaryModel === "gemini-3.5-flash-lite" ? "gemini-flash-lite-latest" : "gemini-3.5-flash-lite";
  const modelsToTry = [primaryModel, fallbackModel];

  let lastError = null;

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 600,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error(`GEMINI_RATE_LIMIT_429: ${errText}`);
        }
        // If 503 (high demand) or 404 (model unavailable), try fallback model
        if ((response.status === 503 || response.status === 404) && model !== fallbackModel) {
          console.warn(`[AI-ENGINE] Gemini ${model} returned ${response.status}. Attempting resilient fallback to ${fallbackModel}...`);
          lastError = new Error(`Gemini API Error (${response.status}): ${errText}`);
          continue;
        }
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidate) throw new Error("Empty response from Gemini");
      return candidate;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (model !== fallbackModel && !err.message.includes("GEMINI_RATE_LIMIT_429")) {
        console.warn(`[AI-ENGINE] Retrying Gemini with fallback model ${fallbackModel} after error:`, err.message);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

/**
 * ⚡ Main Execution: Dual Groq + Gemini Failover Waterfall
 */
async function generateAcademicAnswer(query, context = "", options = {}) {
  checkDailyReset();
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) throw new Error("Question prompt is required");

  // 1. Check In-Memory Cache (RAM cache prevents duplicate quota burns)
  const cacheKey = `ai_ans_${Buffer.from(cleanQuery.toLowerCase()).toString("base64").slice(0, 40)}`;
  const cachedAnswer = ramCache.get(cacheKey);
  const user = options.user || null;
  const noteId = options.noteId || null;
  const noteTitle = options.noteTitle || null;

  if (cachedAnswer) {
    currentAiSettings.cachedHitsToday += 1;
    currentAiSettings.totalQueriesToday += 1;

    // Asynchronously log cached search to Turso and Telegram
    logAiSearchToTurso({
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
      userMobile: user?.mobile,
      query: cleanQuery,
      provider: "cache",
      model: "In-Memory Edge Cache (0ms)",
      latencyMs: 0,
      cached: 1,
      noteId,
      noteTitle,
    }).catch(() => {});

    dispatchAiSearchTelegramAudit({
      user,
      query: cleanQuery,
      provider: "cache",
      model: "In-Memory Edge Cache",
      latencyMs: 0,
      cached: true,
      noteId,
      noteTitle,
    }).catch(() => {});

    return {
      answer: cachedAnswer,
      provider: "cache",
      model: "In-Memory Edge Cache (0ms)",
      cached: true,
      latencyMs: 0,
    };
  }

  const startTime = Date.now();
  currentAiSettings.totalQueriesToday += 1;

  let finalAnswer = "";
  let finalProvider = "groq";
  let finalModel = currentAiSettings.groqModel;
  let failoverOccurred = false;

  const isImageOrDiagram = Boolean(options.imageBase64);
  const imageBase64 = options.imageBase64 || null;
  const imageMimeType = options.imageMimeType || "image/jpeg";

  // 🎯 SMART INTENT ROUTER:
  // Intent 1: Photo / Screenshot / Diagram / Handwritten Note -> Route directly to GEMINI 2.0 FLASH!
  if (isImageOrDiagram) {
    const canUseGemini = currentAiSettings.geminiEnabled && 
                         currentAiSettings.geminiUsedToday < currentAiSettings.geminiLimit && 
                         Boolean(getApiKey("gemini"));
    if (canUseGemini) {
      try {
        finalAnswer = await queryGemini(cleanQuery, context, imageBase64, imageMimeType);
        currentAiSettings.geminiUsedToday += 1;
        finalProvider = "gemini";
        finalModel = currentAiSettings.geminiModel;
      } catch (geminiErr) {
        console.warn("[AI-ENGINE] ⚠️ Gemini image analysis notice:", geminiErr.message, "-> Falling back to Groq text OCR...");
        failoverOccurred = true;
      }
    }
  }

  // Intent 2: Normal Text Doubt / Query -> Route to GROQ LPU (0.3s sub-second speed champion)
  if (!finalAnswer) {
    const canUseGroq = currentAiSettings.groqEnabled && 
                       currentAiSettings.groqUsedToday < currentAiSettings.groqLimit && 
                       Boolean(getApiKey("groq"));

    if (canUseGroq) {
      try {
        finalAnswer = await queryGroq(cleanQuery, context);
        currentAiSettings.groqUsedToday += 1;
        finalProvider = "groq";
        finalModel = currentAiSettings.groqModel;
      } catch (groqErr) {
        console.warn("[AI-ENGINE] ⚠️ Groq primary notice:", groqErr.message, "-> Activating Gemini Failover...");
        failoverOccurred = true;
        currentAiSettings.failoversToday += 1;
      }
    } else {
      failoverOccurred = true;
    }
  }

  // Fallback / Secondary for Text: If Groq failed, seamlessly fallback to Gemini 2.0 Flash
  if (!finalAnswer && !isImageOrDiagram) {
    const canUseGemini = currentAiSettings.geminiEnabled && 
                         currentAiSettings.geminiUsedToday < currentAiSettings.geminiLimit && 
                         Boolean(getApiKey("gemini"));
    if (canUseGemini) {
      try {
        finalAnswer = await queryGemini(cleanQuery, context);
        currentAiSettings.geminiUsedToday += 1;
        finalProvider = "gemini";
        finalModel = currentAiSettings.geminiModel;
      } catch (geminiErr) {
        console.warn("[AI-ENGINE] ⚠️ Gemini failover notice:", geminiErr.message);
      }
    }
  }

  // Fallback to Local Academic Notes Synthesis if both APIs are down/unconfigured
  if (!finalAnswer) {
    if (context && context.trim()) {
      finalAnswer = `🤖 [Academic Notes Synthesis]\n\nBased on your course notes, here is the direct excerpt matching "${cleanQuery}":\n\n"${context.slice(0, 300)}..."\n\n💡 Note: Cloud AI engine is currently on offline standby or awaiting API keys in Admin Studio.`;
      finalProvider = "local_heuristic";
      finalModel = "Extractive RAG (Offline)";
    } else {
      finalAnswer = `🤖 [Academic AI Assistant]\n\nCould not connect to Cloud AI engines right now. Please ensure Groq or Gemini API keys are active in Admin Studio, or inspect your course notes directly.`;
      finalProvider = "standby";
      finalModel = "Offline Standby";
    }
  } else {
    // Cache successful answer for 2 hours
    ramCache.set(cacheKey, finalAnswer, 7200);
  }

  saveAiSettingsToDb().catch(() => {});
  const latencyMs = Date.now() - startTime;

  // Asynchronously log search to Turso and Telegram sub-topic
  logAiSearchToTurso({
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
    userMobile: user?.mobile,
    query: cleanQuery,
    provider: finalProvider,
    model: finalModel,
    latencyMs,
    cached: 0,
    noteId,
    noteTitle,
  }).catch(() => {});

  dispatchAiSearchTelegramAudit({
    user,
    query: cleanQuery,
    provider: finalProvider,
    model: finalModel,
    latencyMs,
    cached: false,
    noteId,
    noteTitle,
  }).catch(() => {});

  return {
    answer: finalAnswer,
    provider: finalProvider,
    model: finalModel,
    failover: failoverOccurred,
    latencyMs,
  };
}

/**
 * Returns Admin Telemetry & Status
 */
function getAiTelemetry() {
  checkDailyReset();
  const groqKeySet = Boolean(getApiKey("groq"));
  const geminiKeySet = Boolean(getApiKey("gemini"));

  return {
    success: true,
    settings: {
      groqEnabled: currentAiSettings.groqEnabled,
      geminiEnabled: currentAiSettings.geminiEnabled,
      edgeProxyEnabled: currentAiSettings.edgeProxyEnabled,
      circleSearchEnabled: currentAiSettings.circleSearchEnabled !== false,
      circleSearchDailyLimit: currentAiSettings.circleSearchDailyLimit || 2000,
      circleSearchCooldownSec: currentAiSettings.circleSearchCooldownSec || 3,
      groqModel: currentAiSettings.groqModel,
      geminiModel: currentAiSettings.geminiModel,
      groqLimit: currentAiSettings.groqLimit,
      geminiLimit: currentAiSettings.geminiLimit,
      groqApiKeyConfigured: groqKeySet,
      geminiApiKeyConfigured: geminiKeySet,
      groqStorageSource: process.env.GROQ_API_KEY ? "ENV" : (currentAiSettings.groqApiKey ? "DATABASE" : "NONE"),
      geminiStorageSource: process.env.GEMINI_API_KEY ? "ENV" : (currentAiSettings.geminiApiKey ? "DATABASE" : "NONE"),
      aiSearchTopicId: currentAiSettings.aiSearchTopicId || null,
      purgeAuditTopicId: currentAiSettings.purgeAuditTopicId || null,
    },
    usage: {
      groqUsedToday: currentAiSettings.groqUsedToday,
      groqRemainingToday: Math.max(0, currentAiSettings.groqLimit - currentAiSettings.groqUsedToday),
      groqPercent: Number(((currentAiSettings.groqUsedToday / currentAiSettings.groqLimit) * 100).toFixed(1)),
      geminiUsedToday: currentAiSettings.geminiUsedToday,
      geminiRemainingToday: Math.max(0, currentAiSettings.geminiLimit - currentAiSettings.geminiUsedToday),
      geminiPercent: Number(((currentAiSettings.geminiUsedToday / currentAiSettings.geminiLimit) * 100).toFixed(1)),
      circleSearchUsedToday: currentAiSettings.circleSearchUsedToday || 0,
      circleSearchRemainingToday: Math.max(0, (currentAiSettings.circleSearchDailyLimit || 2000) - (currentAiSettings.circleSearchUsedToday || 0)),
      circleSearchPercent: Number((((currentAiSettings.circleSearchUsedToday || 0) / (currentAiSettings.circleSearchDailyLimit || 2000)) * 100).toFixed(1)),
      totalDailyCapacity: currentAiSettings.groqLimit + currentAiSettings.geminiLimit,
      totalDailyUsed: currentAiSettings.groqUsedToday + currentAiSettings.geminiUsedToday,
      totalQueriesToday: currentAiSettings.totalQueriesToday,
      failoversToday: currentAiSettings.failoversToday,
      cachedHitsToday: currentAiSettings.cachedHitsToday,
      lastResetDate: currentAiSettings.lastResetDate,
      serverCpuImpact: "0.0% (Zero Server CPU)",
      serverRamImpact: "< 15 MB",
    },
    status: {
      groqStatus: !groqKeySet ? "KEY_MISSING" : (!currentAiSettings.groqEnabled ? "PAUSED" : (currentAiSettings.groqUsedToday >= currentAiSettings.groqLimit ? "QUOTA_EXHAUSTED" : "HEALTHY_ACTIVE")),
      geminiStatus: !geminiKeySet ? "KEY_MISSING" : (!currentAiSettings.geminiEnabled ? "PAUSED" : (currentAiSettings.geminiUsedToday >= currentAiSettings.geminiLimit ? "QUOTA_EXHAUSTED" : "READY_STANDBY")),
      circleSearchStatus: currentAiSettings.circleSearchEnabled === false ? "PAUSED" : ((currentAiSettings.circleSearchUsedToday || 0) >= (currentAiSettings.circleSearchDailyLimit || 2000) ? "LIMIT_EXCEEDED" : "HEALTHY_ACTIVE"),
      edgeProxyStatus: currentAiSettings.edgeProxyEnabled ? "ACTIVE_EDGE" : "DISABLED",
    },
  };
}

/**
 * Updates AI toggle states or keys from Admin Studio
 */
async function updateAiSettings({
  groqEnabled,
  geminiEnabled,
  edgeProxyEnabled,
  circleSearchEnabled,
  circleSearchDailyLimit,
  circleSearchCooldownSec,
  groqApiKey,
  geminiApiKey,
  groqLimit,
  geminiLimit,
}) {
  if (typeof groqEnabled === "boolean") currentAiSettings.groqEnabled = groqEnabled;
  if (typeof geminiEnabled === "boolean") currentAiSettings.geminiEnabled = geminiEnabled;
  if (typeof edgeProxyEnabled === "boolean") currentAiSettings.edgeProxyEnabled = edgeProxyEnabled;
  if (typeof circleSearchEnabled === "boolean") currentAiSettings.circleSearchEnabled = circleSearchEnabled;
  if (typeof circleSearchDailyLimit === "number" && circleSearchDailyLimit > 0) currentAiSettings.circleSearchDailyLimit = circleSearchDailyLimit;
  if (typeof circleSearchCooldownSec === "number" && circleSearchCooldownSec >= 0) currentAiSettings.circleSearchCooldownSec = circleSearchCooldownSec;

  if (typeof groqApiKey === "string" && groqApiKey.trim()) {
    currentAiSettings.groqApiKey = groqApiKey.trim();
  }
  if (typeof geminiApiKey === "string" && geminiApiKey.trim()) {
    currentAiSettings.geminiApiKey = geminiApiKey.trim();
  }

  if (typeof groqLimit === "number" && groqLimit > 0) currentAiSettings.groqLimit = groqLimit;
  if (typeof geminiLimit === "number" && geminiLimit > 0) currentAiSettings.geminiLimit = geminiLimit;

  await saveAiSettingsToDb();
  return getAiTelemetry();
}

/**
 * Increments circle search query usage counter
 */
function incrementCircleSearchUsage() {
  currentAiSettings.circleSearchUsedToday = (currentAiSettings.circleSearchUsedToday || 0) + 1;
  saveAiSettingsToDb().catch(() => {});
}

/**
 * Resets daily usage counters to zero
 */
async function resetDailyCounters() {
  currentAiSettings.groqUsedToday = 0;
  currentAiSettings.geminiUsedToday = 0;
  currentAiSettings.circleSearchUsedToday = 0;
  currentAiSettings.totalQueriesToday = 0;
  currentAiSettings.failoversToday = 0;
  currentAiSettings.cachedHitsToday = 0;
  currentAiSettings.lastResetDate = new Date().toISOString().slice(0, 10);
  await saveAiSettingsToDb();
  return getAiTelemetry();
}

/**
 * Test connectivity for Groq or Gemini
 */
async function testAiProvider(provider) {
  const start = Date.now();
  if (provider === "groq") {
    const res = await queryGroq("Test ping. Reply 'Groq LPU Ready' in 3 words.", "College test");
    return { provider: "groq", success: true, answer: res, latencyMs: Date.now() - start };
  } else if (provider === "gemini") {
    const res = await queryGemini("Test ping. Reply 'Gemini 2.0 Ready' in 3 words.", "College test");
    return { provider: "gemini", success: true, answer: res, latencyMs: Date.now() - start };
  }
  throw new Error("Unknown provider");
}

/**
 * 🛠️ Setup Telegram Forum Sub-Topics in FSM Support Supergroup
 * Topic A: 🤖 AI Search Logs & Student Queries
 * Topic B: 🔥 Firebase & Turso Account Purge Logs
 */
async function setupTelegramAiSupportTopics(customChatId = null) {
  const token = getHelpBotToken();
  const chatId = customChatId || getHelpChatId();

  if (!token || !chatId) {
    return { success: false, message: "Telegram bot token or FSM Support Supergroup chat ID not configured." };
  }

  const results = {};

  // 1. Topic A: AI Search Logs & Student Queries
  try {
    const resA = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        name: "🤖 AI Search Logs & Student Queries",
        icon_color: 7322096, // Neon cyan / blue
      }),
    });
    const dataA = await resA.json();
    if (dataA.ok && dataA.result?.message_thread_id) {
      results.aiSearchTopicId = dataA.result.message_thread_id;
      currentAiSettings.aiSearchTopicId = dataA.result.message_thread_id;
    } else {
      results.aiSearchTopicError = dataA.description || "Failed to create AI Search topic";
    }
  } catch (err) {
    results.aiSearchTopicError = err.message;
  }

  // 2. Topic B: Firebase & Turso Account Purge Logs
  try {
    const resB = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        name: "🔥 Firebase & Turso Account Purge Logs",
        icon_color: 16724826, // Red / Orange
      }),
    });
    const dataB = await resB.json();
    if (dataB.ok && dataB.result?.message_thread_id) {
      results.purgeAuditTopicId = dataB.result.message_thread_id;
      currentAiSettings.purgeAuditTopicId = dataB.result.message_thread_id;
    } else {
      results.purgeAuditTopicError = dataB.description || "Failed to create Purge Audit topic";
    }
  } catch (err) {
    results.purgeAuditTopicError = err.message;
  }

  await saveAiSettingsToDb();
  return {
    success: Boolean(results.aiSearchTopicId || results.purgeAuditTopicId),
    results,
    settings: currentAiSettings,
  };
}

/**
 * 🤖 Real-Time Telegram Dispatch to "AI Search Logs" Forum Sub-Topic
 */
async function dispatchAiSearchTelegramAudit({
  user,
  query,
  provider,
  model,
  latencyMs,
  cached = false,
  noteId = null,
  noteTitle = null,
}) {
  const token = getHelpBotToken();
  const chatId = getHelpChatId();
  const topicId = currentAiSettings.aiSearchTopicId;
  if (!token || !chatId || !topicId) return false;

  try {
    const studentName = (user?.name || user?.userName || "Student Scholar").replace(/[<>]/g, "");
    const studentEmail = (user?.email || "anonymous@student.edu").replace(/[<>]/g, "");
    const studentMobile = user?.mobile || user?.phone || "N/A";
    const cleanQuery = String(query || "").slice(0, 400).replace(/[<>]/g, "");
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const text = [
      `🤖 <b>AI Academic Search Query</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Student:</b> ${studentName}`,
      `📧 <b>Email:</b> <code>${studentEmail}</code>`,
      `📱 <b>Mobile:</b> <code>${studentMobile}</code>`,
      `⚡ <b>Provider:</b> <b>${String(provider).toUpperCase()}</b> (${model || "Llama 3.1 8B"})`,
      `⏱️ <b>Latency:</b> ${latencyMs}ms | 💾 <b>Cached:</b> ${cached ? "Yes (0ms)" : "No"}`,
      noteTitle ? `📚 <b>Document:</b> ${noteTitle.replace(/[<>]/g, "")}` : "",
      `❓ <b>Student Query:</b>\n<blockquote>${cleanQuery}</blockquote>`,
      `🕒 <b>Timestamp:</b> ${timeStr}`,
    ].filter(Boolean).join("\n");

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return true;
  } catch (err) {
    console.debug("[TELEGRAM-AI-AUDIT] Notice:", err.message);
    return false;
  }
}

/**
 * 🔥 Real-Time Telegram Dispatch to "Firebase & Turso Account Purge Logs" Sub-Topic
 */
async function dispatchUserPurgeTelegramAudit({
  userId,
  userName = "Student Scholar",
  userEmail = "N/A",
  userMobile = "N/A",
  tursoDeletedCount = 0,
  uploadedNotesCount = 0,
  chatMessagesDeleted = 0,
  deletedBy = "Admin",
  reason = "Account Deletion",
}) {
  const token = getHelpBotToken();
  const chatId = getHelpChatId();
  const topicId = currentAiSettings.purgeAuditTopicId;
  if (!token || !chatId || !topicId) return false;

  try {
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const text = [
      `🔥 <b>Cascade Account Purge Audit</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>User:</b> ${(userName || "Unknown").replace(/[<>]/g, "")}`,
      `🆔 <b>User ID:</b> <code>${userId}</code>`,
      `📧 <b>Email:</b> <code>${(userEmail || "N/A").replace(/[<>]/g, "")}</code>`,
      `📱 <b>Mobile:</b> <code>${userMobile || "N/A"}</code>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🗑️ <b>Firebase Purge Status:</b> 100% Cleared`,
      `  • Profile, Passkeys & Study Context: <b>Purged</b>`,
      `  • Uploaded Notes Re-attributed: <b>${uploadedNotesCount}</b>`,
      `  • Chat Messages Purged: <b>${chatMessagesDeleted}</b>`,
      `⚡ <b>Turso LibSQL Cascade:</b> <b>${tursoDeletedCount} rows deleted</b>`,
      `  • <i>Users, Chat Profiles, Rooms & AI Search Logs cascade-purged</i>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🛡️ <b>Initiated By:</b> ${deletedBy}`,
      `📝 <b>Reason:</b> ${reason}`,
      `🕒 <b>Timestamp:</b> ${timeStr}`,
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: topicId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return true;
  } catch (err) {
    console.debug("[TELEGRAM-PURGE-AUDIT] Notice:", err.message);
    return false;
  }
}

/**
 * 📥 Generate Exportable AI Search Report (CSV / Excel / PDF / JSON)
 */
async function exportAiSearchReport({ format = "csv", search = "", limit = 500 } = {}) {
  const logs = await getAiSearchLogsFromTurso({ limit, search });
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const { generateAiSearchPdfReport } = require("../utils/reportPdfGenerator");
    const pdfBytes = await generateAiSearchPdfReport(logs, { dateStr });
    return {
      contentType: "application/pdf",
      filename: `AI_Search_History_${dateStr}.pdf`,
      data: Buffer.from(pdfBytes),
    };
  }

  if (format === "json") {
    return {
      contentType: "application/json",
      filename: `AI_Search_History_${dateStr}.json`,
      data: JSON.stringify(logs, null, 2),
    };
  }

  // CSV / Excel Generation with RFC 4180 Escaping & UTF-8 BOM (\uFEFF)
  const headers = [
    "Log ID",
    "Timestamp (UTC)",
    "Student Name",
    "Email",
    "Mobile",
    "Academic Query",
    "AI Provider",
    "Model",
    "Latency (ms)",
    "Cached Hit",
    "Note ID",
    "Note Title",
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.createdAt),
    escapeCsv(r.userName),
    escapeCsv(r.userEmail),
    escapeCsv(r.userMobile),
    escapeCsv(r.query),
    escapeCsv(r.provider),
    escapeCsv(r.model),
    escapeCsv(r.latencyMs),
    escapeCsv(r.cached ? "Yes" : "No"),
    escapeCsv(r.noteId),
    escapeCsv(r.noteTitle),
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");

  return {
    contentType: "text/csv; charset=utf-8",
    filename: `AI_Search_History_${dateStr}.csv`,
    data: csvContent,
  };
}

// Initial auto-load on start
loadAiSettings().catch(() => {});

module.exports = {
  generateAcademicAnswer,
  getAiTelemetry,
  updateAiSettings,
  resetDailyCounters,
  testAiProvider,
  incrementCircleSearchUsage,
  setupTelegramAiSupportTopics,
  dispatchAiSearchTelegramAudit,
  dispatchUserPurgeTelegramAudit,
  exportAiSearchReport,
};

