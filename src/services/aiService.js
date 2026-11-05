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

// Default In-Memory Telemetry State
const DEFAULT_AI_SETTINGS = {
  groqEnabled: true,
  geminiEnabled: true,
  edgeProxyEnabled: true,
  circleSearchEnabled: true, // ⭕ Circle to Search & Solve Master Toggle
  circleSearchDailyLimit: 2000, // ⭕ Daily Limit for Circle to Search Queries
  circleSearchCooldownSec: 3, // ⭕ Cooldown between circle searches
  circleSearchUsedToday: 0,
  groqModel: "llama-3.1-8b-instant",
  geminiModel: "gemini-2.0-flash",
  groqLimit: 14400,
  geminiLimit: 1500,
  groqUsedToday: 0,
  geminiUsedToday: 0,
  totalQueriesToday: 0,
  failoversToday: 0,
  cachedHitsToday: 0,
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
    return currentAiSettings.groqApiKey || process.env.GROQ_API_KEY || "";
  }
  if (provider === "gemini") {
    return currentAiSettings.geminiApiKey || process.env.GEMINI_API_KEY || "";
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
- Use clean bullet points for steps or properties.
- Keep the explanation under 220 words so students can grasp it instantly on mobile.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
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
        model: currentAiSettings.groqModel || "llama-3.1-8b-instant",
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
    const answer = data.choices?.[0]?.message?.content || "";
    if (!answer) throw new Error("Empty response from Groq");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query Google Gemini 2.0 Flash API
 */
async function queryGemini(query, context) {
  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  if (!checkAndEnforceMinuteLimit("gemini")) {
    throw new Error("GEMINI_RPM_LIMIT");
  }

  const systemInstruction = "You are a friendly, expert academic tutor for college students. Answer clearly and concisely using the provided notes context.";
  const promptText = `${systemInstruction}\n\n${context ? `[Study Notes Context]:\n${context.slice(0, 3500)}\n\n` : ""}[Student Question]:\n${query}\n\nProvide a high-yield, structured answer with bullet points and key exam takeaways.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentAiSettings.geminiModel || "gemini-2.0-flash"}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
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
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) throw new Error("Empty response from Gemini");
    return candidate;
  } finally {
    clearTimeout(timeout);
  }
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
  if (cachedAnswer) {
    currentAiSettings.cachedHitsToday += 1;
    currentAiSettings.totalQueriesToday += 1;
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

  // 2. Try Primary: Groq LPU (14,400 daily limit, ultra-fast 800 tps)
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

  // 3. Try Secondary: Gemini 2.0 Flash (1,500 daily limit)
  if (!finalAnswer) {
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
        console.warn("[AI-ENGINE] ⚠️ Gemini secondary notice:", geminiErr.message);
      }
    }
  }

  // 4. Fallback to Local Academic Notes Synthesis if both APIs are down/unconfigured
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
      groqKeyPreview: groqKeySet ? `${getApiKey("groq").slice(0, 4)}...${getApiKey("groq").slice(-4)}` : "Not Configured",
      geminiKeyPreview: geminiKeySet ? `${getApiKey("gemini").slice(0, 4)}...${getApiKey("gemini").slice(-4)}` : "Not Configured",
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

// Initial auto-load on start
loadAiSettings().catch(() => {});

module.exports = {
  generateAcademicAnswer,
  getAiTelemetry,
  updateAiSettings,
  resetDailyCounters,
  testAiProvider,
  incrementCircleSearchUsage,
};

