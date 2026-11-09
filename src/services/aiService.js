/**
 * 🤖 AI Engine Service: Dual Groq LPU + Gemini 2.0 Flash Failover Architecture
 * High-Capacity, Zero-Server-CPU Academic Inference Engine
 * 
 * Primary: Groq Cloud (Llama 3.1 8B Instant) • 14,400 Requests/Day • ~800 tokens/sec
 * Secondary/Failover: Google Gemini 2.0 Flash • 1,500 Requests/Day
 * Combined Free Daily Quota: 15,900 Requests / Day!
 */

const crypto = require("crypto");
const { db } = require("../firebase");
const { ramCache } = require("../utils/ramCache");
const { logAiSearchToTurso, getAiSearchLogsFromTurso } = require("./tursoService");
const { getHelpBotToken, getHelpChatId } = require("./helpTicketService");
const { queryCloudflareWorkersAi, isCloudflareAiAvailable } = require("./cloudflareWorkersAiService");
const {
  queryNvidiaText,
  queryNvidiaVision,
  queryCerebras,
  querySambaNovaText,
  querySambaNovaVision,
  queryMistralText,
  queryMistralVision,
  queryGitHubModels,
  queryCohere,
  queryHuggingFace,
  queryOpenRouter,
  isProviderConfigured,
} = require("./unifiedAiProviders");

// Default In-Memory Telemetry State
const DEFAULT_AI_SETTINGS = {
  groqEnabled: true,
  geminiEnabled: true,
  cloudflareAiEnabled: true,
  nvidiaEnabled: true,
  githubModelsEnabled: true,
  huggingFaceEnabled: true,
  openRouterEnabled: true,
  cerebrasEnabled: true,
  sambanovaEnabled: true,
  mistralEnabled: true,
  cohereEnabled: true,
  edgeProxyEnabled: true,
  circleSearchEnabled: true, // ⭕ Circle to Search & Solve Master Toggle
  circleSearchDailyLimit: 2000, // ⭕ Daily Limit for Circle to Search Queries
  circleSearchCooldownSec: 3, // ⭕ Cooldown between circle searches
  circleSearchUsedToday: 0,
  groqModel: "openai/gpt-oss-20b",
  geminiModel: "gemini-flash-lite-latest",
  groqLimit: 14400,
  geminiLimit: 1500,
  cloudflareAiLimit: 1000,
  groqUsedToday: 0,
  geminiUsedToday: 0,
  cloudflareAiUsedToday: 0,
  totalQueriesToday: 0,
  failoversToday: 0,
  cachedHitsToday: 0,
  aiSearchTopicId: null, // 🤖 Telegram sub-topic for student AI queries
  purgeAuditTopicId: null, // 🔥 Telegram sub-topic for Firebase/Turso purge logs
  lastResetDate: new Date().toISOString().slice(0, 10),
  groqApiKey: "",
  geminiApiKey: "",
  nvidiaApiKey: "",
  githubToken: "",
  huggingFaceApiKey: "",
  openRouterApiKey: "",
  cerebrasApiKey: "",
  sambanovaApiKey: "",
  mistralApiKey: "",
  cohereApiKey: "",
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
    currentAiSettings.cloudflareAiUsedToday = 0;
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
          nvidiaApiKey: data.nvidiaApiKey || process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "",
          cerebrasApiKey: data.cerebrasApiKey || process.env.CEREBRAS_API_KEY || "",
          sambanovaApiKey: data.sambanovaApiKey || process.env.SAMBANOVA_API_KEY || "",
          mistralApiKey: data.mistralApiKey || process.env.MISTRAL_API_KEY || "",
          githubToken: data.githubToken || process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "",
          huggingFaceApiKey: data.huggingFaceApiKey || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "",
          openRouterApiKey: data.openRouterApiKey || process.env.OPENROUTER_API_KEY || "",
          cohereApiKey: data.cohereApiKey || process.env.COHERE_API_KEY || "",
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
        currentAiSettings.nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "";
        currentAiSettings.githubToken = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "";
        currentAiSettings.huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
        currentAiSettings.openRouterApiKey = process.env.OPENROUTER_API_KEY || "";
        currentAiSettings.cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
        currentAiSettings.sambanovaApiKey = process.env.SAMBANOVA_API_KEY || "";
        currentAiSettings.mistralApiKey = process.env.MISTRAL_API_KEY || "";
        currentAiSettings.cohereApiKey = process.env.COHERE_API_KEY || "";
        await db.collection("settings").doc("ai_engine").set(currentAiSettings, { merge: true });
      }
    } else {
      currentAiSettings.groqApiKey = process.env.GROQ_API_KEY || "";
      currentAiSettings.geminiApiKey = process.env.GEMINI_API_KEY || "";
      currentAiSettings.nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "";
      currentAiSettings.githubToken = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "";
      currentAiSettings.huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
      currentAiSettings.openRouterApiKey = process.env.OPENROUTER_API_KEY || "";
      currentAiSettings.cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
      currentAiSettings.sambanovaApiKey = process.env.SAMBANOVA_API_KEY || "";
      currentAiSettings.mistralApiKey = process.env.MISTRAL_API_KEY || "";
      currentAiSettings.cohereApiKey = process.env.COHERE_API_KEY || "";
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
  if (provider === "nvidia" || provider === "nvidia-nim") {
    return (process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || currentAiSettings.nvidiaApiKey || "").trim();
  }
  if (provider === "cerebras") {
    return (process.env.CEREBRAS_API_KEY || currentAiSettings.cerebrasApiKey || "").trim();
  }
  if (provider === "sambanova") {
    return (process.env.SAMBANOVA_API_KEY || currentAiSettings.sambanovaApiKey || "").trim();
  }
  if (provider === "mistral") {
    return (process.env.MISTRAL_API_KEY || currentAiSettings.mistralApiKey || "").trim();
  }
  if (provider === "github") {
    return (process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || currentAiSettings.githubToken || "").trim();
  }
  if (provider === "huggingface" || provider === "hf") {
    return (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || currentAiSettings.huggingFaceApiKey || "").trim();
  }
  if (provider === "openrouter") {
    return (process.env.OPENROUTER_API_KEY || currentAiSettings.openRouterApiKey || "").trim();
  }
  if (provider === "cohere") {
    return (process.env.COHERE_API_KEY || currentAiSettings.cohereApiKey || "").trim();
  }
  return "";
}

/**
 * Query Groq Cloud LPU API (Llama 3.1 8B Instant)
 */
async function queryGroq(query, context, options = {}) {
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
- Highlight key definitions and formulas in **bold** or standard LaTeX notation like \\(x = \\pm 2\\).
- If page numbers or excerpts exist in the context, cite them clearly (e.g. "📌 [Reference: Page X]").
- Use clean bullet points for steps, algorithms, or properties.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt & Citations]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : 600;

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
        max_tokens: maxTokens,
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
 * ⚡ Query Groq Cloud LPU Multimodal Vision API (Llama 4 Scout / Maverick Vision • ~600 tok/sec)
 * Sub-second (~0.45s) handwritten cursive notes, mathematical derivations & diagram solver!
 */
async function queryGroqVision(query, context, imageBase64, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = getApiKey("groq");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY_MISSING");
  }

  if (!checkAndEnforceMinuteLimit("groq")) {
    throw new Error("GROQ_RPM_LIMIT");
  }

  const cleanB64 = String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
  if (!cleanB64) {
    throw new Error("EMPTY_VISION_IMAGE");
  }
  const safeMime = (imageMimeType && imageMimeType.startsWith("image/")) ? imageMimeType : "image/jpeg";

  const promptText = options.rawPrompt
    ? options.rawPrompt
    : `You are an elite Academic Handwriting & Formula Solver for engineering, science, and college students.
Carefully decipher ALL handwritten strokes in the image (including cursive, slanted, messy ballpoint/pencil notes, mathematical integrals, matrices, subscripts/superscripts, circuit diagrams, and Hinglish/English notes).
1. First, write **📝 Extracted Text / Formula:** followed by the exact cleaned transcription (using LaTeX \\( ... \\) for math).
2. Next, provide a clear, step-by-step academic solution or explanation.
3. End with a 1-line "💡 Exam Takeaway".
${context ? `\n[Notes Context]:\n${context.slice(0, 3000)}\n` : ""}
${query ? `\n[Student Prompt / Hint]:\n${query}` : ""}`;

  const visionModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ];

  const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : 750;
  const temperature = typeof options.temperature === "number" ? options.temperature : 0.2;
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 9500;
  let lastErr = null;

  for (const vModel of visionModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: vModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${safeMime};base64,${cleanB64}`,
                  },
                },
              ],
            },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error(`GROQ_RATE_LIMIT_429: ${errText}`);
        }
        lastErr = new Error(`Groq Vision (${vModel}) Error ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim();
      if (!answer) {
        lastErr = new Error("Empty Groq Vision response");
        continue;
      }
      return { answer, model: vModel };
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (err.message && err.message.includes("GROQ_RATE_LIMIT_429")) {
        break;
      }
    }
  }

  throw lastErr || new Error("Groq Vision failed");
}

/**
 * Query Google Gemini Flash API (Text + High-Precision Multimodal Handwritten Notes & Diagrams)
 */
async function queryGemini(query, context, imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  if (!checkAndEnforceMinuteLimit("gemini")) {
    throw new Error("GEMINI_RPM_LIMIT");
  }

  const systemInstruction = imageBase64
    ? `You are a brilliant academic handwriting & diagram specialist for college students studying engineering, science, and higher education.
Carefully decipher ALL handwritten strokes (including messy cursive, slanted student handwriting, faint pencil/blue pen, integrals, fractions, matrices, subscripts/superscripts, and circuit/physics diagrams).
- First state **📝 Extracted Text / Formula:** with the exact transcribed problem or text in clean LaTeX \\(x = \\pm 2\\).
- Then provide a clear, complete step-by-step solution or explanation using bullet points.
- If page numbers or excerpts exist in context, cite them (e.g. "📌 [From Page X]").
- Add a 1-line "💡 Exam Takeaway" at the end.`
    : `You are a brilliant, friendly academic tutor for college students studying engineering, science, and higher education.
Answer clearly and accurately based on the provided notes context.
- If page numbers or excerpts exist in the context, cite them prominently (e.g. "📌 [From Page X]").
- Highlight key definitions and formulas in **bold** or LaTeX format \\(x = \\pm 2\\).
- Use clean bullet points for steps or derivations.
- Keep the explanation high-yield, structured, and complete.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const promptText = options.rawPrompt
    ? options.rawPrompt
    : `${systemInstruction}\n\n${context ? `[Study Notes Context & Citations]:\n${context.slice(0, 4500)}\n\n` : ""}[Student Question]:\n${query || "Transcribe any handwritten text/formula and solve the problem/diagram shown in this study note."}\n\nProvide an authoritative, student-friendly answer.`;

  const parts = [{ text: promptText }];
  if (imageBase64) {
    const cleanB64 = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
    const safeMime = (imageMimeType && imageMimeType.startsWith("image/")) ? imageMimeType : "image/jpeg";
    parts.push({
      inline_data: {
        mime_type: safeMime,
        data: cleanB64,
      },
    });
  }

  const primaryModel = currentAiSettings.geminiModel || "gemini-flash-lite-latest";
  const modelsToTry = Array.from(
    new Set([primaryModel, "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.0-flash"])
  );

  let lastError = null;
  const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : 750;
  const temperature = typeof options.temperature === "number" ? options.temperature : 0.25;
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 11000;

  for (let idx = 0; idx < modelsToTry.length; idx++) {
    const model = modelsToTry[idx];
    const isLast = idx === modelsToTry.length - 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
            temperature,
            maxOutputTokens: maxTokens,
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
        if (!isLast) {
          console.warn(`[AI-ENGINE] Gemini ${model} returned ${response.status}. Shifting to fallback model...`);
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
      if (!isLast && !String(err.message || "").includes("GEMINI_RATE_LIMIT_429")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

/**
 * ✍️ Ultra-Fast Dedicated Handwritten & Formula Vision OCR (~350ms - 650ms)
 * Uses Groq LPU Vision (Llama 4 Scout) + Gemini Flash-Lite Vision failover with SHA-1 RAM caching
 */
async function extractHandwritingVision(imageBase64, imageMimeType = "image/jpeg") {
  checkDailyReset();
  const cleanB64 = String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
  if (!cleanB64) {
    throw new Error("Image payload is required for handwriting extraction");
  }

  const imgSha = crypto.createHash("sha1").update(cleanB64).digest("hex").slice(0, 28);
  const cacheKey = `ocr_hw_v2_${imgSha}`;
  const cachedText = ramCache.get(cacheKey);
  if (cachedText) {
    return {
      text: cachedText,
      provider: "cache",
      model: "RAM Vision OCR Cache (0ms)",
      cached: true,
      latencyMs: 0,
    };
  }

  const startTime = Date.now();
  const ocrPrompt = `You are a high-speed, 99.9% accurate Academic Handwriting & Mathematical OCR engine.
Transcribe ALL handwritten and printed text, mathematical equations, fractions, integrals, subscripts, superscripts, matrices, chemical formulas, and diagram labels visible in this image.
Strict Rules:
- Accurately decode messy cursive, slanted handwriting, abbreviations, blue/black/pencil strokes, and engineering/science notation using context.
- Write mathematical formulas cleanly (e.g. integral_0^infty e^(-st) sin(wt) dt or clean LaTeX/symbols).
- Ignore notebook ruled lines, page shadows, or scanner watermarks.
- Output ONLY the exact transcribed text/formula. Do NOT wrap in quotes, markdown code fences, or add commentary like "Here is the text:". If completely blank, output EMPTY.`;

  const canUseGroq =
    currentAiSettings.groqEnabled &&
    currentAiSettings.groqUsedToday < currentAiSettings.groqLimit &&
    Boolean(getApiKey("groq"));

  const canUseGemini =
    currentAiSettings.geminiEnabled &&
    currentAiSettings.geminiUsedToday < currentAiSettings.geminiLimit &&
    Boolean(getApiKey("gemini"));

  let extracted = "";
  let provider = "";
  let model = "";

  // Tier 1: Blazing-fast Groq LPU Vision (~0.4s)
  if (canUseGroq) {
    try {
      const gRes = await queryGroqVision("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 6500,
      });
      extracted = (gRes.answer || "").trim();
      provider = "groq_vision";
      model = gRes.model;
      currentAiSettings.groqUsedToday += 1;
    } catch (gErr) {
      console.warn("[HANDWRITING-OCR] Groq Vision notice, failing over to Gemini Vision:", gErr.message);
    }
  }

  // Tier 2: Google Gemini Flash Vision Failover
  if (!extracted && canUseGemini) {
    try {
      const gemText = await queryGemini("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 7500,
      });
      extracted = (gemText || "").trim();
      provider = "gemini_vision";
      model = currentAiSettings.geminiModel || "gemini-flash-lite-latest";
      currentAiSettings.geminiUsedToday += 1;
    } catch (gemErr) {
      console.warn("[HANDWRITING-OCR] Gemini Vision notice:", gemErr.message);
    }
  }

  // Tier 2B: NVIDIA NIM Llama 3.2 Vision Failover (H100 Tensor Core GPU)
  if (!extracted && currentAiSettings.nvidiaEnabled !== false && Boolean(getApiKey("nvidia"))) {
    try {
      const nvRes = await queryNvidiaVision("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 8000,
        apiKey: getApiKey("nvidia"),
      });
      extracted = (nvRes.answer || "").trim();
      provider = "nvidia_vision";
      model = nvRes.model;
    } catch (nvErr) {
      console.warn("[HANDWRITING-OCR] NVIDIA NIM Vision notice:", nvErr.message);
    }
  }

  // Tier 3: SambaNova Cloud Llama 3.2 Vision Failover
  if (!extracted && currentAiSettings.sambanovaEnabled !== false && isProviderConfigured("sambanova")) {
    try {
      const snRes = await querySambaNovaVision("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 8000,
      });
      extracted = (snRes.answer || "").trim();
      provider = "sambanova_vision";
      model = snRes.model;
    } catch (snErr) {
      console.warn("[HANDWRITING-OCR] SambaNova Vision notice:", snErr.message);
    }
  }

  // Tier 4: Mistral Pixtral 12B Math & OCR Vision Failover (France - EU)
  if (!extracted && currentAiSettings.mistralEnabled !== false && isProviderConfigured("mistral")) {
    try {
      const misRes = await queryMistralVision("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 8000,
      });
      extracted = (misRes.answer || "").trim();
      provider = "mistral_vision";
      model = misRes.model;
    } catch (misErr) {
      console.warn("[HANDWRITING-OCR] Mistral Pixtral notice:", misErr.message);
    }
  }

  // Tier 5: GitHub Models GPT-4o-mini Vision Failover (Microsoft Azure)
  if (!extracted && currentAiSettings.githubModelsEnabled !== false && isProviderConfigured("github")) {
    try {
      const ghRes = await queryGitHubModels("", "", cleanB64, imageMimeType, {
        rawPrompt: ocrPrompt,
        maxTokens: 420,
        temperature: 0.05,
        timeoutMs: 8000,
      });
      extracted = (ghRes.answer || "").trim();
      provider = "github_vision";
      model = ghRes.model;
    } catch (ghErr) {
      console.warn("[HANDWRITING-OCR] GitHub Models Vision notice:", ghErr.message);
    }
  }

  if (!extracted || extracted === "EMPTY") {
    throw new Error("Could not detect readable handwriting in selection");
  }

  // Strip accidental surrounding quotes or markdown fences
  extracted = extracted
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (extracted) {
    ramCache.set(cacheKey, extracted, 14400); // Cache 4 hours
  }

  return {
    text: extracted,
    provider,
    model,
    cached: false,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * ⚡ Main Execution: Dual Groq + Gemini Failover Waterfall
 */
async function generateAcademicAnswer(query, context = "", options = {}) {
  checkDailyReset();
  const cleanQuery = (query || "").trim();
  if (!cleanQuery && !options.imageBase64) {
    throw new Error("Question prompt or diagram image is required");
  }

  // 1. Check In-Memory Cache (Always include image SHA-1 when imageBase64 is present so distinct crops never collide!)
  const imgHashPart = options.imageBase64
    ? `_img_${crypto.createHash("sha1").update(String(options.imageBase64).slice(0, 24000)).digest("hex").slice(0, 20)}`
    : "";
  const effectiveKeyStr = `${cleanQuery.toLowerCase()}${imgHashPart}`;
  const cacheKey = effectiveKeyStr
    ? `ai_ans_${crypto.createHash("sha1").update(effectiveKeyStr).digest("hex").slice(0, 32)}`
    : null;
  const cachedAnswer = cacheKey ? ramCache.get(cacheKey) : null;
  const user = options.user || null;
  const noteId = options.noteId || null;
  const noteTitle = options.noteTitle || null;
  const queryType = options.queryType || (options.isCircleSearch ? "circle_search" : "ai_query");

  if (cachedAnswer) {
    currentAiSettings.cachedHitsToday += 1;
    currentAiSettings.totalQueriesToday += 1;

    // Asynchronously log cached search to Turso and Telegram
    logAiSearchToTurso({
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
      userMobile: user?.mobile,
      query: cleanQuery || "Academic Diagram / Formula Solver",
      provider: "cache",
      model: "In-Memory Edge Cache (0ms)",
      latencyMs: 0,
      cached: 1,
      noteId,
      noteTitle,
    }).catch(() => {});

    dispatchAiSearchTelegramAudit({
      user,
      query: cleanQuery || "Academic Diagram / Formula Solver",
      provider: "cache",
      model: "In-Memory Edge Cache",
      latencyMs: 0,
      cached: true,
      noteId,
      noteTitle,
      queryType,
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
  // Intent 1: Photo / Screenshot / Diagram / Handwritten Note -> Dual Multimodal Vision Waterfall!
  // Tier 1A: Groq LPU Vision (Llama 4 Scout ~0.5s speed & 14,400 RPD quota) -> Tier 1B: Gemini Flash Vision!
  if (isImageOrDiagram) {
    const canUseGroqVision =
      currentAiSettings.groqEnabled &&
      currentAiSettings.groqUsedToday < currentAiSettings.groqLimit &&
      Boolean(getApiKey("groq"));

    if (canUseGroqVision) {
      try {
        const gvRes = await queryGroqVision(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = gvRes.answer;
        currentAiSettings.groqUsedToday += 1;
        finalProvider = "groq_vision";
        finalModel = gvRes.model;
      } catch (gvErr) {
        console.warn("[AI-ENGINE] ⚠️ Groq Vision notice:", gvErr.message, "-> Shifting to Gemini Vision...");
        failoverOccurred = true;
      }
    }

    const canUseGemini =
      !finalAnswer &&
      currentAiSettings.geminiEnabled &&
      currentAiSettings.geminiUsedToday < currentAiSettings.geminiLimit &&
      Boolean(getApiKey("gemini"));

    if (canUseGemini) {
      try {
        finalAnswer = await queryGemini(cleanQuery, context, imageBase64, imageMimeType, options);
        currentAiSettings.geminiUsedToday += 1;
        finalProvider = "gemini";
        finalModel = currentAiSettings.geminiModel;
      } catch (geminiErr) {
        console.warn("[AI-ENGINE] ⚠️ Gemini image analysis notice:", geminiErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1B: NVIDIA NIM Llama 3.2 Vision Failover (NVIDIA H100 GPU)
    if (!finalAnswer && currentAiSettings.nvidiaEnabled !== false && Boolean(getApiKey("nvidia"))) {
      try {
        const nvRes = await queryNvidiaVision(cleanQuery, context, imageBase64, imageMimeType, {
          ...options,
          apiKey: getApiKey("nvidia"),
        });
        finalAnswer = nvRes.answer;
        finalProvider = "nvidia_vision";
        finalModel = nvRes.model;
      } catch (nvErr) {
        console.warn("[AI-ENGINE] ⚠️ NVIDIA NIM Vision notice:", nvErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1C: SambaNova Cloud Llama 3.2 Vision Failover
    if (!finalAnswer && currentAiSettings.sambanovaEnabled !== false && isProviderConfigured("sambanova")) {
      try {
        const snRes = await querySambaNovaVision(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = snRes.answer;
        finalProvider = "sambanova_vision";
        finalModel = snRes.model;
      } catch (snErr) {
        console.warn("[AI-ENGINE] ⚠️ SambaNova Vision notice:", snErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1D: Mistral Pixtral 12B Math & OCR Vision Failover (France - EU)
    if (!finalAnswer && currentAiSettings.mistralEnabled !== false && isProviderConfigured("mistral")) {
      try {
        const misRes = await queryMistralVision(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = misRes.answer;
        finalProvider = "mistral_vision";
        finalModel = misRes.model;
      } catch (misErr) {
        console.warn("[AI-ENGINE] ⚠️ Mistral Pixtral notice:", misErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1E: GitHub Models GPT-4o-mini Vision Failover (Microsoft Azure • Zero Card)
    if (!finalAnswer && currentAiSettings.githubModelsEnabled !== false && isProviderConfigured("github")) {
      try {
        const ghRes = await queryGitHubModels(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = ghRes.answer;
        finalProvider = "github_vision";
        finalModel = ghRes.model;
      } catch (ghErr) {
        console.warn("[AI-ENGINE] ⚠️ GitHub Models Vision notice:", ghErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1F: Hugging Face Serverless Vision (Zero Card • Llama 3.2 11B Vision)
    if (!finalAnswer && currentAiSettings.huggingFaceEnabled !== false && isProviderConfigured("huggingface")) {
      try {
        const hfRes = await queryHuggingFace(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = hfRes.answer;
        finalProvider = "huggingface_vision";
        finalModel = hfRes.model;
      } catch (hfErr) {
        console.warn("[AI-ENGINE] ⚠️ Hugging Face Vision notice:", hfErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1G: OpenRouter Free Vision (Zero Card • Llama 3.2 Vision Free)
    if (!finalAnswer && currentAiSettings.openRouterEnabled !== false && isProviderConfigured("openrouter")) {
      try {
        const orRes = await queryOpenRouter(cleanQuery, context, imageBase64, imageMimeType, options);
        finalAnswer = orRes.answer;
        finalProvider = "openrouter_vision";
        finalModel = orRes.model;
      } catch (orErr) {
        console.warn("[AI-ENGINE] ⚠️ OpenRouter Vision notice:", orErr.message);
        failoverOccurred = true;
      }
    }

    // Tier 1H: If vision models had an issue AND we already have pre-extracted query text, solve via Groq text LPU!
    if (!finalAnswer && cleanQuery && cleanQuery.length > 5 && !cleanQuery.startsWith("Question / Diagram from Page")) {
      const canUseGroqText =
        currentAiSettings.groqEnabled &&
        currentAiSettings.groqUsedToday < currentAiSettings.groqLimit &&
        Boolean(getApiKey("groq"));
      if (canUseGroqText) {
        try {
          finalAnswer = await queryGroq(cleanQuery, context, options);
          currentAiSettings.groqUsedToday += 1;
          finalProvider = "groq";
          finalModel = currentAiSettings.groqModel;
        } catch (_) {}
      }
    }
  }

  // Intent 2: Normal Text Doubt / Query -> Unified High-Speed Waterfall Architecture
  // Tier 1 (Text): Cerebras Cloud Wafer-Scale LPU (USA • 2,000 tok/sec King of Speed)
  if (!finalAnswer && !isImageOrDiagram) {
    const canUseCerebras = currentAiSettings.cerebrasEnabled !== false &&
                           isProviderConfigured("cerebras");
    if (canUseCerebras) {
      try {
        const cRes = await queryCerebras(cleanQuery, context, options);
        finalAnswer = cRes.answer;
        finalProvider = "cerebras";
        finalModel = cRes.model;
      } catch (cErr) {
        console.warn("[AI-ENGINE] ⚠️ Cerebras notice:", cErr.message, "-> Shifting to Groq LPU...");
        failoverOccurred = true;
      }
    }
  }

  // Tier 2 (Text): Groq Cloud LPU (~800 tok/sec, 0.3s sub-second speed champion)
  if (!finalAnswer && !isImageOrDiagram) {
    const canUseGroq = currentAiSettings.groqEnabled && 
                       currentAiSettings.groqUsedToday < currentAiSettings.groqLimit && 
                       Boolean(getApiKey("groq"));

    if (canUseGroq) {
      try {
        finalAnswer = await queryGroq(cleanQuery, context, options);
        currentAiSettings.groqUsedToday += 1;
        finalProvider = "groq";
        finalModel = currentAiSettings.groqModel;
      } catch (groqErr) {
        console.warn("[AI-ENGINE] ⚠️ Groq primary notice:", groqErr.message, "-> Activating Tier 3 Failover...");
        failoverOccurred = true;
        currentAiSettings.failoversToday += 1;
      }
    } else {
      failoverOccurred = true;
    }
  }

  // Tier 3 (Text): Cloudflare Workers AI (Native Edge GPU - @cf/meta/llama-3.1-8b-instruct)
  if (!finalAnswer && !isImageOrDiagram) {
    const canUseCfAi = currentAiSettings.cloudflareAiEnabled !== false &&
                       (currentAiSettings.cloudflareAiUsedToday || 0) < (currentAiSettings.cloudflareAiLimit || 1000) &&
                       isCloudflareAiAvailable();
    if (canUseCfAi) {
      try {
        finalAnswer = await queryCloudflareWorkersAi(cleanQuery, context, options);
        currentAiSettings.cloudflareAiUsedToday = (currentAiSettings.cloudflareAiUsedToday || 0) + 1;
        finalProvider = "cloudflare_workers_ai";
        finalModel = "@cf/meta/llama-3.1-8b-instruct";
      } catch (cfErr) {
        console.warn("[AI-ENGINE] ⚠️ Cloudflare Workers AI notice:", cfErr.message, "-> Shifting to Gemini Tier 4...");
      }
    }
  }

  // Tier 4 (Text): Google Gemini Flash Failover
  if (!finalAnswer && !isImageOrDiagram) {
    const canUseGemini = currentAiSettings.geminiEnabled && 
                         currentAiSettings.geminiUsedToday < currentAiSettings.geminiLimit && 
                         Boolean(getApiKey("gemini"));
    if (canUseGemini) {
      try {
        finalAnswer = await queryGemini(cleanQuery, context, null, "image/jpeg", options);
        currentAiSettings.geminiUsedToday += 1;
        finalProvider = "gemini";
        finalModel = currentAiSettings.geminiModel;
      } catch (geminiErr) {
        console.warn("[AI-ENGINE] ⚠️ Gemini failover notice:", geminiErr.message);
      }
    }
  }

  // Tier 4B (Text): NVIDIA NIM DGX Cloud (Llama 3.3 70B • TensorRT-LLM on H100 GPU)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.nvidiaEnabled !== false && Boolean(getApiKey("nvidia"))) {
    try {
      const nvRes = await queryNvidiaText(cleanQuery, context, {
        ...options,
        apiKey: getApiKey("nvidia"),
      });
      finalAnswer = nvRes.answer;
      finalProvider = "nvidia";
      finalModel = nvRes.model;
      failoverOccurred = true;
    } catch (nvErr) {
      console.warn("[AI-ENGINE] ⚠️ NVIDIA NIM text notice:", nvErr.message);
    }
  }

  // Tier 5 (Text): SambaNova Cloud (Llama 3.3 70B on RDU • USA)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.sambanovaEnabled !== false && isProviderConfigured("sambanova")) {
    try {
      const snRes = await querySambaNovaText(cleanQuery, context, options);
      finalAnswer = snRes.answer;
      finalProvider = "sambanova";
      finalModel = snRes.model;
      failoverOccurred = true;
    } catch (snErr) {
      console.warn("[AI-ENGINE] ⚠️ SambaNova text notice:", snErr.message);
    }
  }

  // Tier 6 (Text): Mistral AI (Codestral / Mistral Small • France - EU)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.mistralEnabled !== false && isProviderConfigured("mistral")) {
    try {
      const misRes = await queryMistralText(cleanQuery, context, options);
      finalAnswer = misRes.answer;
      finalProvider = "mistral";
      finalModel = misRes.model;
      failoverOccurred = true;
    } catch (misErr) {
      console.warn("[AI-ENGINE] ⚠️ Mistral text notice:", misErr.message);
    }
  }

  // Tier 7 (Text): GitHub Models (OpenAI GPT-4o-mini • Microsoft Azure USA • Zero Card)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.githubModelsEnabled !== false && isProviderConfigured("github")) {
    try {
      const ghRes = await queryGitHubModels(cleanQuery, context, null, "image/jpeg", options);
      finalAnswer = ghRes.answer;
      finalProvider = "github_models";
      finalModel = ghRes.model;
      failoverOccurred = true;
    } catch (ghErr) {
      console.warn("[AI-ENGINE] ⚠️ GitHub Models notice:", ghErr.message);
    }
  }

  // Tier 8 (Text): Hugging Face Serverless (Llama 3.3 70B • Zero Card)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.huggingFaceEnabled !== false && isProviderConfigured("huggingface")) {
    try {
      const hfRes = await queryHuggingFace(cleanQuery, context, null, "image/jpeg", options);
      finalAnswer = hfRes.answer;
      finalProvider = "huggingface";
      finalModel = hfRes.model;
      failoverOccurred = true;
    } catch (hfErr) {
      console.warn("[AI-ENGINE] ⚠️ Hugging Face notice:", hfErr.message);
    }
  }

  // Tier 9 (Text): OpenRouter Free Tier (Llama 3.3 70B Free • Zero Card)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.openRouterEnabled !== false && isProviderConfigured("openrouter")) {
    try {
      const orRes = await queryOpenRouter(cleanQuery, context, null, "image/jpeg", options);
      finalAnswer = orRes.answer;
      finalProvider = "openrouter";
      finalModel = orRes.model;
      failoverOccurred = true;
    } catch (orErr) {
      console.warn("[AI-ENGINE] ⚠️ OpenRouter notice:", orErr.message);
    }
  }

  // Tier 10 (Text): Cohere AI (Command R+ Citations • Canada)
  if (!finalAnswer && !isImageOrDiagram && currentAiSettings.cohereEnabled !== false && isProviderConfigured("cohere")) {
    try {
      const cohRes = await queryCohere(cleanQuery, context, options);
      finalAnswer = cohRes.answer;
      finalProvider = "cohere";
      finalModel = cohRes.model;
      failoverOccurred = true;
    } catch (cohErr) {
      console.warn("[AI-ENGINE] ⚠️ Cohere notice:", cohErr.message);
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
    if (cacheKey) {
      ramCache.set(cacheKey, finalAnswer, 7200);
    }
  }

  saveAiSettingsToDb().catch(() => {});
  const latencyMs = Date.now() - startTime;

  // Asynchronously log search to Turso and Telegram sub-topic
  logAiSearchToTurso({
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
    userMobile: user?.mobile,
    query: cleanQuery || (isImageOrDiagram ? "[Circled Image / Formula Crop]" : "Academic Diagram / Formula Solver"),
    provider: finalProvider,
    model: finalModel,
    latencyMs,
    cached: 0,
    noteId,
    noteTitle,
  }).catch(() => {});

  dispatchAiSearchTelegramAudit({
    user,
    query: cleanQuery || (isImageOrDiagram ? "[Circled Visual Crop / Formula]" : "Academic Diagram / Formula Solver"),
    provider: finalProvider,
    model: finalModel,
    latencyMs,
    cached: false,
    noteId,
    noteTitle,
    queryType,
    failover: failoverOccurred,
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
      cloudflareAiEnabled: currentAiSettings.cloudflareAiEnabled !== false,
      cloudflareAiLimit: currentAiSettings.cloudflareAiLimit || 1000,
      cloudflareAiConfigured: isCloudflareAiAvailable(),
      cloudflareModel: "@cf/meta/llama-3.1-8b-instruct",
      nvidiaEnabled: currentAiSettings.nvidiaEnabled !== false,
      nvidiaConfigured: Boolean(getApiKey("nvidia")),
      nvidiaModel: "meta/llama-3.3-70b-instruct",
      githubModelsEnabled: currentAiSettings.githubModelsEnabled !== false,
      githubModelsConfigured: isProviderConfigured("github"),
      huggingFaceEnabled: currentAiSettings.huggingFaceEnabled !== false,
      huggingFaceConfigured: isProviderConfigured("huggingface"),
      openRouterEnabled: currentAiSettings.openRouterEnabled !== false,
      openRouterConfigured: isProviderConfigured("openrouter"),
      cerebrasEnabled: currentAiSettings.cerebrasEnabled !== false,
      cerebrasConfigured: isProviderConfigured("cerebras"),
      sambanovaEnabled: currentAiSettings.sambanovaEnabled !== false,
      sambanovaConfigured: isProviderConfigured("sambanova"),
      mistralEnabled: currentAiSettings.mistralEnabled !== false,
      mistralConfigured: isProviderConfigured("mistral"),
      cohereEnabled: currentAiSettings.cohereEnabled !== false,
      cohereConfigured: isProviderConfigured("cohere"),
      groqStorageSource: process.env.GROQ_API_KEY ? "ENV" : (currentAiSettings.groqApiKey ? "DATABASE" : "NONE"),
      geminiStorageSource: process.env.GEMINI_API_KEY ? "ENV" : (currentAiSettings.geminiApiKey ? "DATABASE" : "NONE"),
      aiSearchTopicId: currentAiSettings.aiSearchTopicId || null,
      purgeAuditTopicId: currentAiSettings.purgeAuditTopicId || null,
      cfAiWorkerUrl: process.env.CF_AI_WORKER_URL || (process.env.CF_CHAT_WORKER_URL ? process.env.CF_CHAT_WORKER_URL.replace("fsm-chat-edge", "fsm-ai-edge") : "https://fsm-ai-edge.jnplotus.workers.dev"),
    },
    usage: {
      groqUsedToday: currentAiSettings.groqUsedToday,
      groqRemainingToday: Math.max(0, currentAiSettings.groqLimit - currentAiSettings.groqUsedToday),
      groqPercent: Number(((currentAiSettings.groqUsedToday / currentAiSettings.groqLimit) * 100).toFixed(1)),
      geminiUsedToday: currentAiSettings.geminiUsedToday,
      geminiRemainingToday: Math.max(0, currentAiSettings.geminiLimit - currentAiSettings.geminiUsedToday),
      geminiPercent: Number(((currentAiSettings.geminiUsedToday / currentAiSettings.geminiLimit) * 100).toFixed(1)),
      cloudflareAiUsedToday: currentAiSettings.cloudflareAiUsedToday || 0,
      cloudflareAiRemainingToday: Math.max(0, (currentAiSettings.cloudflareAiLimit || 1000) - (currentAiSettings.cloudflareAiUsedToday || 0)),
      cloudflareAiPercent: Number((((currentAiSettings.cloudflareAiUsedToday || 0) / (currentAiSettings.cloudflareAiLimit || 1000)) * 100).toFixed(1)),
      circleSearchUsedToday: currentAiSettings.circleSearchUsedToday || 0,
      circleSearchRemainingToday: Math.max(0, (currentAiSettings.circleSearchDailyLimit || 2000) - (currentAiSettings.circleSearchUsedToday || 0)),
      circleSearchPercent: Number((((currentAiSettings.circleSearchUsedToday || 0) / (currentAiSettings.circleSearchDailyLimit || 2000)) * 100).toFixed(1)),
      totalDailyCapacity: currentAiSettings.groqLimit + currentAiSettings.geminiLimit + (currentAiSettings.cloudflareAiLimit || 1000),
      totalDailyUsed: currentAiSettings.groqUsedToday + currentAiSettings.geminiUsedToday + (currentAiSettings.cloudflareAiUsedToday || 0),
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
      cloudflareAiStatus: currentAiSettings.cloudflareAiEnabled === false ? "PAUSED" : ((currentAiSettings.cloudflareAiUsedToday || 0) >= (currentAiSettings.cloudflareAiLimit || 1000) ? "QUOTA_EXHAUSTED" : "HEALTHY_ACTIVE"),
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
  cloudflareAiEnabled,
  edgeProxyEnabled,
  circleSearchEnabled,
  circleSearchDailyLimit,
  circleSearchCooldownSec,
  groqApiKey,
  geminiApiKey,
  nvidiaApiKey,
  cerebrasApiKey,
  sambanovaApiKey,
  mistralApiKey,
  githubToken,
  huggingFaceApiKey,
  openRouterApiKey,
  cohereApiKey,
  nvidiaEnabled,
  huggingFaceEnabled,
  openRouterEnabled,
  cerebrasEnabled,
  sambanovaEnabled,
  mistralEnabled,
  githubModelsEnabled,
  cohereEnabled,
  groqLimit,
  geminiLimit,
  cloudflareAiLimit,
}) {
  if (typeof groqEnabled === "boolean") currentAiSettings.groqEnabled = groqEnabled;
  if (typeof geminiEnabled === "boolean") currentAiSettings.geminiEnabled = geminiEnabled;
  if (typeof cloudflareAiEnabled === "boolean") currentAiSettings.cloudflareAiEnabled = cloudflareAiEnabled;
  if (typeof nvidiaEnabled === "boolean") currentAiSettings.nvidiaEnabled = nvidiaEnabled;
  if (typeof edgeProxyEnabled === "boolean") currentAiSettings.edgeProxyEnabled = edgeProxyEnabled;
  if (typeof circleSearchEnabled === "boolean") currentAiSettings.circleSearchEnabled = circleSearchEnabled;
  if (typeof circleSearchDailyLimit === "number" && circleSearchDailyLimit > 0) currentAiSettings.circleSearchDailyLimit = circleSearchDailyLimit;
  if (typeof circleSearchCooldownSec === "number" && circleSearchCooldownSec >= 0) currentAiSettings.circleSearchCooldownSec = circleSearchCooldownSec;
  if (typeof huggingFaceEnabled === "boolean") currentAiSettings.huggingFaceEnabled = huggingFaceEnabled;
  if (typeof openRouterEnabled === "boolean") currentAiSettings.openRouterEnabled = openRouterEnabled;
  if (typeof cerebrasEnabled === "boolean") currentAiSettings.cerebrasEnabled = cerebrasEnabled;
  if (typeof sambanovaEnabled === "boolean") currentAiSettings.sambanovaEnabled = sambanovaEnabled;
  if (typeof mistralEnabled === "boolean") currentAiSettings.mistralEnabled = mistralEnabled;
  if (typeof githubModelsEnabled === "boolean") currentAiSettings.githubModelsEnabled = githubModelsEnabled;
  if (typeof cohereEnabled === "boolean") currentAiSettings.cohereEnabled = cohereEnabled;

  if (typeof groqApiKey === "string" && groqApiKey.trim()) {
    currentAiSettings.groqApiKey = groqApiKey.trim();
  }
  if (typeof geminiApiKey === "string" && geminiApiKey.trim()) {
    currentAiSettings.geminiApiKey = geminiApiKey.trim();
  }
  if (typeof nvidiaApiKey === "string" && nvidiaApiKey.trim()) {
    currentAiSettings.nvidiaApiKey = nvidiaApiKey.trim();
  }
  if (typeof githubToken === "string" && githubToken.trim()) {
    currentAiSettings.githubToken = githubToken.trim();
  }
  if (typeof huggingFaceApiKey === "string" && huggingFaceApiKey.trim()) {
    currentAiSettings.huggingFaceApiKey = huggingFaceApiKey.trim();
  }
  if (typeof openRouterApiKey === "string" && openRouterApiKey.trim()) {
    currentAiSettings.openRouterApiKey = openRouterApiKey.trim();
  }
  if (typeof cerebrasApiKey === "string" && cerebrasApiKey.trim()) {
    currentAiSettings.cerebrasApiKey = cerebrasApiKey.trim();
  }
  if (typeof sambanovaApiKey === "string" && sambanovaApiKey.trim()) {
    currentAiSettings.sambanovaApiKey = sambanovaApiKey.trim();
  }
  if (typeof mistralApiKey === "string" && mistralApiKey.trim()) {
    currentAiSettings.mistralApiKey = mistralApiKey.trim();
  }
  if (typeof cohereApiKey === "string" && cohereApiKey.trim()) {
    currentAiSettings.cohereApiKey = cohereApiKey.trim();
  }

  if (typeof groqLimit === "number" && groqLimit > 0) currentAiSettings.groqLimit = groqLimit;
  if (typeof geminiLimit === "number" && geminiLimit > 0) currentAiSettings.geminiLimit = geminiLimit;
  if (typeof cloudflareAiLimit === "number" && cloudflareAiLimit > 0) currentAiSettings.cloudflareAiLimit = cloudflareAiLimit;

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
  currentAiSettings.cloudflareAiUsedToday = 0;
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
    const res = await queryGemini("Test ping. Reply 'Gemini Ready' in 3 words.", "College test");
    return { provider: "gemini", success: true, answer: res, latencyMs: Date.now() - start };
  } else if (provider === "cloudflare") {
    const res = await queryCloudflareWorkersAi("Test ping. Reply 'Cloudflare AI Ready' in 3 words.", "College test");
    return { provider: "cloudflare", success: true, answer: res, latencyMs: Date.now() - start };
  } else if (provider === "nvidia" || provider === "nvidia-nim") {
    const apiKey = getApiKey("nvidia");
    if (!apiKey) throw new Error("NVIDIA_API_KEY is missing. Add it in Render or Admin Studio.");
    const res = await queryNvidiaText("Test ping. Reply 'NVIDIA NIM Ready' in 3 words.", "College test", { apiKey });
    return { provider: "nvidia", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "turso") {
    const { getCachedCircleSolution, computeQueryHash } = require("./tursoCircleSearchService");
    await getCachedCircleSolution(computeQueryHash("test-ping"));
    return { provider: "turso", success: true, answer: "Turso LibSQL Edge Cloud Ready (0ms Cache Active)", latencyMs: Date.now() - start };
  } else if (provider === "cerebras") {
    const res = await queryCerebras("Test ping. Reply 'Cerebras LPU Ready' in 3 words.", "College test");
    return { provider: "cerebras", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "sambanova") {
    const res = await querySambaNovaText("Test ping. Reply 'SambaNova RDU Ready' in 3 words.", "College test");
    return { provider: "sambanova", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "mistral") {
    const res = await queryMistralText("Test ping. Reply 'Mistral Ready' in 3 words.", "College test");
    return { provider: "mistral", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "github") {
    const res = await queryGitHubModels("Test ping. Reply 'GitHub Models Ready' in 3 words.", "College test");
    return { provider: "github", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "cohere") {
    const res = await queryCohere("Test ping. Reply 'Cohere Ready' in 3 words.", "College test");
    return { provider: "cohere", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "huggingface" || provider === "hf") {
    const res = await queryHuggingFace("Test ping. Reply 'HuggingFace Ready' in 3 words.", "College test");
    return { provider: "huggingface", success: true, answer: res.answer, latencyMs: Date.now() - start };
  } else if (provider === "openrouter") {
    const res = await queryOpenRouter("Test ping. Reply 'OpenRouter Ready' in 3 words.", "College test");
    return { provider: "openrouter", success: true, answer: res.answer, latencyMs: Date.now() - start };
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
 * 🏷️ Helper to identify which AI engine answered and format user-friendly display labels
 */
function getAiEngineAuditDetails(provider, model, cached) {
  const p = String(provider || "").toLowerCase();

  if (cached || p === "cache" || p === "turso_cache" || p === "turso") {
    return {
      name: "💾 Turso LibSQL Edge Cloud Cache",
      tier: "🎯 Tier 0 (0ms Instant Hit • 0 Tokens Burned)",
      model: model || "Turso Edge Key-Value Store",
      speed: "⚡ Sub-5ms Instant",
    };
  }

  if (p.includes("cloudflare") || p.includes("cf")) {
    return {
      name: "🔥 Cloudflare Workers AI (Native Edge GPU)",
      tier: "🌐 Tier 2 (Serverless Edge GPU Inference)",
      model: model || "@cf/meta/llama-3.1-8b-instruct",
      speed: "⚡ ~0.3s Edge GPU",
    };
  }

  if (p.includes("groq")) {
    return {
      name: "⚡ Groq Cloud LPU",
      tier: "🚀 Tier 1 (Ultra-Fast Hardware LPU)",
      model: model || "openai/gpt-oss-20b",
      speed: "⚡ ~800 tokens/sec",
    };
  }

  if (p.includes("gemini")) {
    return {
      name: "🌐 Google Gemini Flash",
      tier: "🧠 Tier 3 (Multimodal Vision & Deep Academic Reasoning)",
      model: model || "gemini-flash-lite-latest",
      speed: "⚡ ~0.4s Cloud TPU",
    };
  }

  if (p.includes("nvidia")) {
    return {
      name: "🟢 NVIDIA NIM DGX Cloud",
      tier: "⚡ Hardware Tensor Core Tier (NVIDIA H100 GPU)",
      model: model || "meta/llama-3.3-70b-instruct",
      speed: "⚡ ~250 tok/sec (TensorRT-LLM)",
    };
  }

  if (p.includes("cerebras")) {
    return {
      name: "⚡ Cerebras Wafer-Scale LPU",
      tier: "🚀 Tier 1 (Ultra-Fast 2,000 tok/s Hardware LPU)",
      model: model || "llama-3.3-70b",
      speed: "⚡ ~2,000 tok/sec (0.15s)",
    };
  }

  if (p.includes("sambanova")) {
    return {
      name: "🧠 SambaNova Cloud RDU",
      tier: "⚡ Tier 5 (Reconfigurable Dataflow Unit • USA)",
      model: model || "Meta-Llama-3.3-70B / 3.2 Vision",
      speed: "⚡ ~300 tok/sec",
    };
  }

  if (p.includes("mistral") || p.includes("pixtral")) {
    return {
      name: "🇫🇷 Mistral AI (Europe)",
      tier: "📐 Tier 6 (European Math & LaTeX Vision)",
      model: model || "Mistral / Pixtral 12B",
      speed: "⚡ ~200 tok/sec",
    };
  }

  if (p.includes("github")) {
    return {
      name: "🐙 GitHub Models (Microsoft Azure)",
      tier: "🛡️ Tier 7 (OpenAI GPT-4o-mini Inference)",
      model: model || "gpt-4o-mini",
      speed: "⚡ Microsoft Cloud",
    };
  }

  if (p.includes("cohere")) {
    return {
      name: "🇨🇦 Cohere AI (Canada)",
      tier: "📌 Tier 8 (Command R+ Citations)",
      model: model || "command-r-08-2024",
      speed: "⚡ Enterprise Cloud",
    };
  }

  if (p.includes("huggingface") || p.includes("hf")) {
    return {
      name: "🤗 Hugging Face Serverless",
      tier: "🚀 Serverless Router (Llama 3.3 70B & 3.2 Vision)",
      model: model || "meta-llama/Llama-3.3-70B-Instruct",
      speed: "⚡ Serverless Cloud",
    };
  }

  if (p.includes("openrouter")) {
    return {
      name: "🌐 OpenRouter Free Engine",
      tier: "🚀 Free Model Router",
      model: model || "meta-llama/llama-3.3-70b-instruct:free",
      speed: "⚡ Cloud Router",
    };
  }

  if (p.includes("heuristic") || p.includes("standby") || p.includes("offline")) {
    return {
      name: "🛡️ FSM Offline Heuristic Notes Solver",
      tier: "📄 Tier 4 (Offline Extractive Fallback)",
      model: model || "Extractive RAG (Offline)",
      speed: "⚡ ~0ms Local",
    };
  }

  return {
    name: `🤖 ${String(provider || "AI Engine").toUpperCase()}`,
    tier: "Cloud AI Inference",
    model: model || "Academic Model",
    speed: "⚡ Cloud",
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
  queryType = "ai_query",
  failover = false,
}) {
  const token = getHelpBotToken();
  const chatId = getHelpChatId();
  // Support dynamic thread ID from admin settings, or fallback to environment variables
  const topicId = currentAiSettings.aiSearchTopicId || process.env.HELP_TOPIC_ACTIVE_ID || process.env.HELP_TOPIC_ID || null;
  if (!token || !chatId) return false;

  try {
    const studentName = (user?.name || user?.userName || "Student Scholar").replace(/[<>]/g, "");
    const studentEmail = (user?.email || "anonymous@student.edu").replace(/[<>]/g, "");
    const studentMobile = user?.mobile || user?.phone || "N/A";
    const cleanQuery = String(query || "").slice(0, 400).replace(/[<>]/g, "");
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const isCircle = queryType === "circle_search" || String(queryType).includes("circle");
    const isFlashcards = queryType === "flashcards" || String(queryType).includes("flashcard");
    const isSummary = queryType === "summary" || String(queryType).includes("summary");

    let headline = `🤖 <b>AI Academic Query</b>`;
    if (isCircle) headline = `⭕ <b>Circle to Search & Solve</b>`;
    else if (isFlashcards) headline = `🗂️ <b>Note Study Flashcards</b>`;
    else if (isSummary) headline = `📄 <b>Note Executive Summary</b>`;

    const engine = getAiEngineAuditDetails(provider, model, cached);

    const text = [
      headline,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🧠 <b>AI Used:</b> <b>${engine.name}</b>`,
      `📦 <b>Model:</b> <code>${engine.model}</code>`,
      `🏷️ <b>Engine Tier:</b> ${engine.tier}`,
      failover ? `🛡️ <b>Auto-Failover:</b> ⚠️ Primary engine shifted to failover backup` : "",
      `⏱️ <b>Response Time:</b> ${latencyMs || 0}ms (${engine.speed})`,
      `💾 <b>Cache Status:</b> ${cached ? "🎯 Cache Hit (0ms / 0 Tokens)" : "⚡ Fresh Inference"}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Student:</b> ${studentName}`,
      `📧 <b>Email:</b> <code>${studentEmail}</code>`,
      `📱 <b>Mobile:</b> <code>${studentMobile}</code>`,
      noteTitle ? `📚 <b>Document:</b> ${noteTitle.replace(/[<>]/g, "")}` : "",
      `❓ <b>Query / Formula:</b>\n<blockquote>${cleanQuery}</blockquote>`,
      `🕒 <b>Timestamp:</b> ${timeStr}`,
    ].filter(Boolean).join("\n");

    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (topicId) {
      payload.message_thread_id = Number(topicId);
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    let s = String(val).replace(/"/g, '""');
    // Prevent CSV Formula Injection in Microsoft Excel (CWE-1236)
    if (/^[=+@\-\t\r]/.test(s)) {
      s = `'${s}`;
    }
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
  extractHandwritingVision,
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

