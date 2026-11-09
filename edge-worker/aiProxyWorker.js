/**
 * ⚡ Cloudflare Edge AI Proxy Worker: edge-worker/aiProxyWorker.js
 * High-Speed Serverless Edge GPU Router for Free Study Material Platform
 * 
 * ARCHITECTURE (Dual Edge AI Waterfall + Native Cloudflare Workers AI):
 * 1. Step 1: Check Turso Edge Cache (circle_search_cache) -> 0ms / 0 Tokens
 * 2. Step 2: Multimodal Router:
 *    - Image / Diagram / OCR -> Google Gemini 3.5 / Flash-Lite Vision Engine
 *    - Normal Text / Code ->
 *        • Tier 1: Groq Cloud LPU (~800 tok/sec, 0.3s latency)
 *        • Tier 2: Cloudflare Workers AI (Native Edge GPU - @cf/meta/llama-3.1-8b-instruct)
 *        • Tier 3: Gemini Standby Failover (gemini-flash-lite-latest -> gemini-3.5-flash-lite)
 *        • Offline Guard: FSM Heuristic Math & Notes Solver
 * 3. Step 3: Async Persistence -> Background write to Turso Cloud (0ms UI wait)
 * 
 * 0.00% Render CPU Load • 0.00% Render RAM Usage • 100% Mobile Optimized
 */

function applyCors(headers, req) {
  const o = req ? req.headers.get("Origin") : null;
  headers.set("Access-Control-Allow-Origin", o || "*");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Type, X-AI-Engine, X-Edge-Location, X-Server-Hits, X-Edge-Cache, X-Response-Time, X-Upstream-Origin, X-Cluster-Active-Nodes"
  );
  headers.set("Access-Control-Max-Age", "86400");
}

// 🌐 In-Memory Origin Health & Auto-Cascade Cooldown Tracker across Edge executions
const failedOriginCooldowns = new Map(); // originUrl -> failureTimestamp

function getOriginCooldownRemaining(origin) {
  const failedAt = failedOriginCooldowns.get(origin) || 0;
  const elapsed = Date.now() - failedAt;
  return elapsed < 25000 ? 25000 - elapsed : 0; // 25s cooldown
}

function markOriginDown(origin) {
  failedOriginCooldowns.set(origin, Date.now());
}

function markOriginUp(origin) {
  failedOriginCooldowns.delete(origin);
}

// Returns all 3 cluster nodes guaranteed (even if Cloudflare env vars are missing or partial)
function getAllClusterOrigins(env) {
  const list = [
    (env.BACKUP_ORIGIN_URL_1 || "https://freestudymaterial1.onrender.com").replace(/\/+$/, ""),
    (env.BACKUP_ORIGIN_URL_2 || "https://freestudymaterial2.onrender.com").replace(/\/+$/, ""),
    (env.ORIGIN_URL || "https://freestudymaterial.onrender.com").replace(/\/+$/, ""),
  ];
  const unique = [];
  for (const item of list) {
    if (item && !unique.includes(item)) unique.push(item);
  }
  return unique;
}

function hashClientIdentifier(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

async function computeSha256(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const msgBuffer = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Step 1: Check Turso Edge Cache via HTTP Pipeline (Sub-5ms response)
 */
async function checkTursoCache(env, queryHash) {
  const rawUrl = (env.TURSO_CIRCLE_SEARCH_URL || env.TURSO_DATABASE_URL || "").trim();
  const token = (env.TURSO_CIRCLE_SEARCH_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || "").trim();
  if (!rawUrl || !token || !queryHash) return null;

  const httpPipelineUrl = rawUrl.replace("libsql://", "https://") + "/v2/pipeline";
  try {
    const res = await fetch(httpPipelineUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql: "SELECT answer, provider, model FROM circle_search_cache WHERE query_hash = ? LIMIT 1",
              args: [{ type: "text", value: queryHash }],
            },
          },
          { type: "close" },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.results?.[0]?.response?.result?.rows;
    if (rows && rows.length > 0) {
      const row = rows[0];
      return {
        answer: row[0]?.value || "",
        provider: row[1]?.value || "turso_cache",
        model: row[2]?.value || "Turso Edge Cache",
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Step 3: Asynchronously write to Turso Edge Cache (Zero UI wait time)
 */
async function saveToTursoCache(env, queryHash, queryText, answer, provider, model) {
  const rawUrl = (env.TURSO_CIRCLE_SEARCH_URL || env.TURSO_DATABASE_URL || "").trim();
  const token = (env.TURSO_CIRCLE_SEARCH_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || "").trim();
  if (!rawUrl || !token || !queryHash || !answer) return;

  const httpPipelineUrl = rawUrl.replace("libsql://", "https://") + "/v2/pipeline";
  const now = Date.now();

  try {
    await fetch(httpPipelineUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql: `INSERT INTO circle_search_cache (query_hash, query_text, answer, provider, model, created_at, hits, last_accessed)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT(query_hash) DO UPDATE SET hits = hits + 1, last_accessed = ?`,
              args: [
                { type: "text", value: queryHash },
                { type: "text", value: (queryText || "").slice(0, 500) },
                { type: "text", value: answer },
                { type: "text", value: provider || "edge_ai" },
                { type: "text", value: model || "Edge Router" },
                { type: "integer", value: String(now) },
                { type: "integer", value: String(now) },
                { type: "integer", value: String(now) },
              ],
            },
          },
          { type: "close" },
        ],
      }),
    });
  } catch (_) {}
}

/**
 * ⚡ Tier 1: Groq Cloud LPU (~800 tok/sec, 0.3s latency)
 */
async function queryGroq(env, query, context) {
  const apiKey = (env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

  const model = env.GROQ_MODEL || "openai/gpt-oss-20b";
  const systemPrompt = `You are a brilliant, supportive AI academic tutor for college students studying engineering and science.
Answer concisely and clearly based primarily on their provided lecture notes context.
Formatting rules:
- Highlight key definitions and formulas in **bold** or LaTeX format (e.g. \\(V = IR\\)).
- If page numbers exist, cite them clearly (e.g. "📌 [Reference: Page X]").
- Keep under 220 words with clean bullet points.
- End with 1-line "💡 Exam Takeaway".`;

  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("GROQ_429_RATE_LIMIT");
    throw new Error(`Groq API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const answer = (msg?.content || msg?.reasoning || "").trim();
  if (!answer) throw new Error("Empty Groq response");
  return { answer, model };
}

/**
 * 🔥 Tier 2: Cloudflare Workers AI (Native Edge GPU Inference)
 * Runs directly on Cloudflare's Edge GPU in the local data center!
 */
async function queryCloudflareWorkersAi(env, query, context) {
  // If Worker has env.AI binding configured
  if (env.AI && typeof env.AI.run === "function") {
    const systemPrompt = `You are an expert academic tutor for college students studying engineering and science.
Answer concisely and clearly using the provided lecture notes.
Formatting rules:
- Highlight key definitions and formulas in **bold** or LaTeX (\\(x = \\pm 2\\)).
- Cite pages prominently if provided.
- Keep under 220 words.`;

    const userContent = context && context.trim()
      ? `[Notes Context]:\n${context.slice(0, 3000)}\n\n[Question]:\n${query}`
      : query;

    const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const answer = aiRes.response || aiRes.result?.response || "";
    if (answer) {
      return { answer: answer.trim(), model: "@cf/meta/llama-3.1-8b-instruct" };
    }
  }

  // Fallback to Cloudflare REST API if account ID & token are present
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || "").trim();
  const apiToken = (env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || "").trim();
  if (accountId && apiToken) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are an expert academic tutor. Explain clearly with formulas." },
          { role: "user", content: context ? `Context:\n${context.slice(0, 2500)}\n\nQuestion: ${query}` : query },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const answer = data.result?.response || data.response || "";
      if (answer) return { answer: answer.trim(), model: "@cf/meta/llama-3.1-8b-instruct" };
    }
  }

  throw new Error("CLOUDFLARE_WORKERS_AI_UNAVAILABLE");
}

/**
 * ⚡ Vision Engine Tier 1: Groq LPU Multimodal Vision (Llama 4 Scout • ~600 tok/sec)
 */
async function queryGroqVisionEdge(env, promptText, imageBase64, imageMimeType = "image/jpeg", maxTokens = 650) {
  const apiKey = (env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");
  const cleanB64 = String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";

  const models = ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
              ],
            },
          ],
          temperature: 0.15,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim();
      if (answer) return { answer, model };
    } catch (_) {}
  }
  throw new Error("GROQ_VISION_EXHAUSTED");
}

/**
 * 🌐 Vision Engine Tier 2: Google Gemini (Multimodal Images & Handwritten OCR)
 */
async function queryGeminiVision(env, query, context, imageBase64, imageMimeType, customPrompt = null) {
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const primaryModel = env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const modelsToTry = Array.from(new Set([primaryModel, "gemini-2.5-flash-lite", "gemini-flash-latest"]));

  const promptText = customPrompt || `You are a brilliant academic handwriting & diagram specialist for college engineering and science students.
First write **📝 Extracted Text / Formula:** with the exact deciphered handwritten text/math in LaTeX (e.g. \\(V = IR\\)), then solve step-by-step.
Add 1-line "💡 Exam Takeaway" at the end.

${context ? `[Context]:\n${context.slice(0, 3500)}\n\n` : ""}[Question]:\n${query || "Transcribe any handwritten notes/formulas and solve the problem/diagram shown."}`;

  const parts = [{ text: promptText }];
  if (imageBase64) {
    const cleanB64 = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
    parts.push({
      inline_data: {
        mime_type: (imageMimeType && imageMimeType.startsWith("image/")) ? imageMimeType : "image/jpeg",
        data: cleanB64,
      },
    });
  }

  let lastError = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
        }),
      });

      if (!res.ok) {
        if (i < modelsToTry.length - 1) continue;
        throw new Error(`Gemini Error (${res.status})`);
      }

      const data = await res.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (answer) return { answer: answer.trim(), model };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("Gemini all models exhausted");
}

/**
 * ⚡ Cerebras Cloud Wafer-Scale LPU (USA • 2,000 tok/sec King of Speed)
 */
async function queryCerebrasEdge(env, query, context) {
  const apiKey = (env.CEREBRAS_API_KEY || "").trim();
  if (!apiKey) throw new Error("CEREBRAS_API_KEY_MISSING");
  const model = env.CEREBRAS_MODEL || "llama-3.3-70b";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an elite academic tutor. Answer concisely with formulas and bullet points." },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`Cerebras Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty Cerebras response");
  return { answer, model };
}

/**
 * 🧠 SambaNova Cloud (USA • Llama 3.3 70B & Llama 3.2 Vision on RDU)
 */
async function querySambaNovaEdge(env, query, context) {
  const apiKey = (env.SAMBANOVA_API_KEY || "").trim();
  if (!apiKey) throw new Error("SAMBANOVA_API_KEY_MISSING");
  const model = env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;
  const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an elite academic tutor. Answer clearly with formulas." },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 550,
    }),
  });
  if (!res.ok) throw new Error(`SambaNova Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty SambaNova response");
  return { answer, model };
}

async function querySambaNovaVisionEdge(env, promptText, imageBase64, imageMimeType = "image/jpeg", maxTokens = 650) {
  const apiKey = (env.SAMBANOVA_API_KEY || "").trim();
  if (!apiKey) throw new Error("SAMBANOVA_API_KEY_MISSING");
  const cleanB64 = String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";
  const model = "Meta-Llama-3.2-11B-Vision-Instruct";
  const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
          ],
        },
      ],
      temperature: 0.15,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`SambaNova Vision Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty SambaNova Vision response");
  return { answer, model };
}

/**
 * 🇫🇷 Mistral AI (France/EU • Codestral & Pixtral 12B Math Vision)
 */
async function queryMistralTextEdge(env, query, context) {
  const apiKey = (env.MISTRAL_API_KEY || "").trim();
  if (!apiKey) throw new Error("MISTRAL_API_KEY_MISSING");
  const model = env.MISTRAL_MODEL || "mistral-small-latest";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an elite academic tutor. Answer clearly with formulas." },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 550,
    }),
  });
  if (!res.ok) throw new Error(`Mistral Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty Mistral response");
  return { answer, model };
}

async function queryMistralVisionEdge(env, promptText, imageBase64, imageMimeType = "image/jpeg", maxTokens = 650) {
  const apiKey = (env.MISTRAL_API_KEY || "").trim();
  if (!apiKey) throw new Error("MISTRAL_API_KEY_MISSING");
  const cleanB64 = String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "");
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";
  const model = "pixtral-12b-2409";
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
          ],
        },
      ],
      temperature: 0.15,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`Mistral Pixtral Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty Mistral Pixtral response");
  return { answer, model };
}

/**
 * 🐙 GitHub Models (Microsoft Azure USA • GPT-4o-mini Text & Vision)
 */
async function queryGitHubModelsEdge(env, query, context, imageBase64 = null, imageMimeType = "image/jpeg", customPrompt = null) {
  const token = (env.GITHUB_MODELS_TOKEN || env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("GITHUB_MODELS_TOKEN_MISSING");
  const model = "gpt-4o-mini";
  const cleanB64 = imageBase64 ? String(imageBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "") : null;
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";

  let messages = [];
  if (cleanB64) {
    const promptText = customPrompt || `You are an elite academic tutor. Decipher handwriting/diagrams and solve step-by-step.${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;
    messages = [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
        ],
      },
    ];
  } else {
    const userContent = context && context.trim()
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;
    messages = [
      { role: "system", content: "You are an elite academic tutor. Answer clearly with formulas." },
      { role: "user", content: userContent },
    ];
  }

  const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: cleanB64 ? 0.15 : 0.2,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`GitHub Models Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty GitHub Models response");
  return { answer, model };
}

/**
 * 🇨🇦 Cohere AI (Canada • Command R+ Citations)
 */
async function queryCohereEdge(env, query, context) {
  const apiKey = (env.COHERE_API_KEY || "").trim();
  if (!apiKey) throw new Error("COHERE_API_KEY_MISSING");
  const model = "command-r-08-2024";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are an elite academic tutor. Answer clearly with citations." },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Cohere Error (${res.status})`);
  const data = await res.json();
  const answer = (data.message?.content?.[0]?.text || "").trim();
  if (!answer) throw new Error("Empty Cohere response");
  return { answer, model };
}

/**
 * 🤗 Hugging Face Serverless Edge (100% Free • Zero Credit Card)
 */
async function queryHuggingFaceEdge(env, query, context, imageBase64 = null, imageMimeType = "image/jpeg", customPrompt = null) {
  const token = (env.HUGGINGFACE_API_KEY || env.HF_TOKEN || "").trim();
  if (!token) throw new Error("HUGGINGFACE_API_KEY_MISSING");
  const cleanB64 = imageBase64 ? String(imageBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "") : null;
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";
  const model = cleanB64 ? "meta-llama/Llama-3.2-11B-Vision-Instruct" : "meta-llama/Llama-3.3-70B-Instruct";

  let messages = [];
  if (cleanB64) {
    const promptText = customPrompt || `You are an elite academic tutor. Decipher handwriting/diagrams and solve step-by-step.${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;
    messages = [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
        ],
      },
    ];
  } else {
    const userContent = context && context.trim()
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;
    messages = [
      { role: "system", content: "You are an elite academic tutor. Answer clearly with formulas." },
      { role: "user", content: userContent },
    ];
  }

  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: cleanB64 ? 0.15 : 0.2,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`HuggingFace Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty HuggingFace response");
  return { answer, model };
}

/**
 * 🌐 OpenRouter Free Models Edge (100% Free • Zero Credit Card • :free models)
 */
async function queryOpenRouterEdge(env, query, context, imageBase64 = null, imageMimeType = "image/jpeg", customPrompt = null) {
  const apiKey = (env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
  const cleanB64 = imageBase64 ? String(imageBase64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "") : null;
  const safeMime = imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";

  let messages = [];
  if (cleanB64) {
    const promptText = customPrompt || `You are an elite academic tutor. Decipher handwriting/diagrams and solve step-by-step.${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;
    messages = [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: `data:${safeMime};base64,${cleanB64}` } },
        ],
      },
    ];
  } else {
    const userContent = context && context.trim()
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;
    messages = [
      { role: "system", content: "You are an elite academic tutor. Answer clearly with formulas." },
      { role: "user", content: userContent },
    ];
  }

  const payload = {
    messages,
    temperature: cleanB64 ? 0.15 : 0.2,
    max_tokens: 600,
    reasoning: { max_tokens: 0 },
  };

  if (cleanB64) {
    payload.model = "nvidia/nemotron-3.5-super-vl:free";
  } else {
    payload.models = [
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
    ];
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://freestudymaterial.onrender.com",
      "X-Title": "Free Study Material",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenRouter Error (${res.status})`);
  const data = await res.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("Empty OpenRouter response");
  const model = data.model || payload.model || "openrouter-free";
  return { answer, model };
}

/**
 * 🛡️ FSM Heuristic Cloud Guard (Offline Fallback)
 */
function queryHeuristicGuard(query, context) {
  if (context && context.trim()) {
    return {
      answer: `🤖 [FSM Academic Notes Synthesis]\n\nBased on your course notes, here is the direct excerpt matching "${query}":\n\n"${context.slice(0, 320)}..."\n\n💡 Note: Cloud AI engine is currently on offline standby or awaiting keys in Admin Studio.`,
      model: "FSM Heuristic Guard",
    };
  }
  return {
    answer: `🤖 [FSM Academic AI Assistant]\n\nCould not connect to Cloud AI engines right now. Please verify API keys in Admin Studio or consult your course notes directly.`,
    model: "Offline Guard",
  };
}

/**
 * 🤖 Real-Time Telegram Dispatch to "AI Search Logs" Forum Sub-Topic from Edge Worker
 */
async function dispatchTelegramAiNotification(env, query, provider, model, cached, latencyMs, isCircle, user = null) {
  const token = (env.HELP_BOT_TOKEN || env.TELEGRAM_HELP_BOT_TOKEN || "").trim();
  const chatId = (env.HELP_CHAT_ID || env.TELEGRAM_HELP_CHAT_ID || "").trim();
  const topicId = (env.HELP_TOPIC_ACTIVE_ID || env.HELP_TOPIC_ID || "").trim();
  if (!token || !chatId) return;

  try {
    const timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const headline = isCircle ? "⭕ <b>Circle to Search & Solve</b>" : "🤖 <b>AI Academic Query</b>";

    let engineName = String(provider).toUpperCase();
    let engineTier = "Cloud AI";
    const p = String(provider || "").toLowerCase();
    if (cached || p.includes("turso") || p.includes("cache")) {
      engineName = "💾 Turso LibSQL Edge Cloud Cache";
      engineTier = "🎯 Tier 0 (0ms Instant Hit • 0 Tokens Burned)";
    } else if (p.includes("cerebras")) {
      engineName = "⚡ Cerebras Wafer-Scale LPU";
      engineTier = "🚀 Tier 1 (Ultra-Fast 2,000 tok/s Hardware LPU)";
    } else if (p.includes("groq")) {
      engineName = "⚡ Groq Cloud LPU";
      engineTier = "🚀 Tier 2 (Ultra-Fast Hardware LPU)";
    } else if (p.includes("cloudflare") || p.includes("cf")) {
      engineName = "🔥 Cloudflare Workers AI (Native Edge GPU)";
      engineTier = "🌐 Tier 3 (Serverless Edge GPU Inference)";
    } else if (p.includes("gemini")) {
      engineName = "🌐 Google Gemini Flash";
      engineTier = "🧠 Tier 4 (Multimodal Vision & Reasoning)";
    } else if (p.includes("sambanova")) {
      engineName = "🧠 SambaNova Cloud RDU";
      engineTier = "⚡ Tier 5 (Reconfigurable Dataflow Unit • USA)";
    } else if (p.includes("mistral") || p.includes("pixtral")) {
      engineName = "🇫🇷 Mistral AI (Europe)";
      engineTier = "📐 Tier 6 (European Math & LaTeX Vision)";
    } else if (p.includes("github")) {
      engineName = "🐙 GitHub Models (Microsoft Azure)";
      engineTier = "🛡️ Tier 7 (OpenAI GPT-4o-mini Inference)";
    } else if (p.includes("cohere")) {
      engineName = "🇨🇦 Cohere AI (Canada)";
      engineTier = "📌 Tier 8 (Command R+ Citations)";
    } else if (p.includes("heuristic")) {
      engineName = "🛡️ FSM Offline Heuristic Notes Solver";
      engineTier = "📄 Tier 9 (Offline Extractive Fallback)";
    }

    const studentName = (user?.name || user?.userName || "Student Scholar").replace(/[<>]/g, "");
    const studentEmail = (user?.email || "anonymous@student.edu").replace(/[<>]/g, "");
    const studentMobile = user?.mobile || user?.phone || "N/A";

    const text = [
      headline,
      "━━━━━━━━━━━━━━━━━━━━",
      `🧠 <b>AI Used:</b> <b>${engineName}</b>`,
      `📦 <b>Model:</b> <code>${model || "Academic Model"}</code>`,
      `🏷️ <b>Engine Tier:</b> ${engineTier}`,
      `⏱️ <b>Response Time:</b> ${latencyMs}ms`,
      `💾 <b>Cache Status:</b> ${cached ? "🎯 Cache Hit (0ms / 0 Tokens)" : "⚡ Fresh Inference"}`,
      "━━━━━━━━━━━━━━━━━━━━",
      `👤 <b>Student:</b> ${studentName}`,
      `📧 <b>Email:</b> <code>${studentEmail}</code>`,
      `📱 <b>Mobile:</b> <code>${studentMobile}</code>`,
      `❓ <b>Query / Formula:</b>\n<blockquote>${String(query || "").slice(0, 300).replace(/[<>]/g, "")}</blockquote>`,
      `🕒 <b>Timestamp:</b> ${timeStr}`,
    ].join("\n");

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
  } catch (_) {}
}

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const edgeColo = request.cf?.colo || "Global";

    // Handle CORS Preflight
    if (request.method === "OPTIONS") {
      const optHeaders = new Headers();
      applyCors(optHeaders, request);
      return new Response(null, { status: 204, headers: optHeaders });
    }

    // Health Check Endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      const resHeaders = new Headers({ "Content-Type": "application/json" });
      applyCors(resHeaders, request);
      return new Response(
        JSON.stringify(
          {
            status: "online",
            service: "FreeStudyMaterial Edge AI Proxy Router",
            edgeLocation: edgeColo,
            architecture: "Dual AI Waterfall + Cloudflare Workers AI (Edge GPU)",
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
        { status: 200, headers: resHeaders }
      );
    }

    // 🛡️ 24/7 Anti-Sleep Relay Endpoint (Bypasses container NAT loopback, pings origin from external Cloudflare IP)
    if (url.pathname === "/api/anti-sleep-relay" || url.pathname === "/api/keepalive") {
      const targetParam = url.searchParams.get("target") || env.ORIGIN_URL || "https://freestudymaterial1.onrender.com";
      let cleanTarget;
      try {
        const parsed = new URL(targetParam);
        const host = parsed.hostname.toLowerCase();
        const originHost = env.ORIGIN_URL ? new URL(env.ORIGIN_URL).hostname.toLowerCase() : "";
        const isAllowed =
          host === "freestudymaterial.onrender.com" ||
          host.endsWith(".onrender.com") ||
          host === "studyvault.in" ||
          host.endsWith(".studyvault.in") ||
          host === "localhost" ||
          host === "127.0.0.1" ||
          (originHost && host === originHost);
        if (!isAllowed) {
          const deniedHeaders = new Headers({ "Content-Type": "application/json" });
          applyCors(deniedHeaders, request);
          return new Response(JSON.stringify({ success: false, error: "Target host not permitted for relay" }), { status: 403, headers: deniedHeaders });
        }
        cleanTarget = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/health?relay=cf&t=${Date.now()}`;
      } catch {
        const badHeaders = new Headers({ "Content-Type": "application/json" });
        applyCors(badHeaders, request);
        return new Response(JSON.stringify({ success: false, error: "Invalid target URL" }), { status: 400, headers: badHeaders });
      }
      try {
        const pingRes = await fetch(cleanTarget, {
          method: "GET",
          headers: {
            "User-Agent": "Cloudflare-Worker-AntiSleep-Relay/2.0",
            "Cache-Control": "no-cache, no-store",
          },
          signal: AbortSignal.timeout(10000),
        });
        const relayHeaders = new Headers({ "Content-Type": "application/json" });
        applyCors(relayHeaders, request);
        return new Response(JSON.stringify({
          success: pingRes.ok,
          status: pingRes.status,
          target: cleanTarget,
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: relayHeaders });
      } catch (err) {
        const errHeaders = new Headers({ "Content-Type": "application/json" });
        applyCors(errHeaders, request);
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 502, headers: errHeaders });
      }
    }

    // Fast Edge Handwritten OCR endpoint: /api/ai/ocr-handwriting
    if (url.pathname === "/api/ai/ocr-handwriting" && request.method === "POST") {
      try {
        const cloned = request.clone();
        const body = await cloned.json();
        if (body?.imageBase64) {
          const ocrPrompt = `You are a precision Academic Handwriting & Mathematical OCR engine. Transcribe ALL handwritten and printed text, equations, fractions, integrals, subscripts, and symbols visible in this image accurately. Ignore ruled lines or shadows. Output ONLY the raw transcribed text/formula without commentary or quotes.`;
          let ocrText = "";
          let ocrProvider = "";
          let ocrModel = "";
          try {
            const gv = await queryGroqVisionEdge(env, ocrPrompt, body.imageBase64, body.imageMimeType, 400);
            ocrText = gv.answer;
            ocrProvider = "groq_vision_edge";
            ocrModel = gv.model;
          } catch (_) {
            try {
              const gem = await queryGeminiVision(env, "", "", body.imageBase64, body.imageMimeType, ocrPrompt);
              ocrText = gem.answer;
              ocrProvider = "gemini_vision_edge";
              ocrModel = gem.model;
            } catch (_) {
              try {
                const sn = await querySambaNovaVisionEdge(env, ocrPrompt, body.imageBase64, body.imageMimeType, 400);
                ocrText = sn.answer;
                ocrProvider = "sambanova_vision_edge";
                ocrModel = sn.model;
              } catch (_) {
                try {
                  const mis = await queryMistralVisionEdge(env, ocrPrompt, body.imageBase64, body.imageMimeType, 400);
                  ocrText = mis.answer;
                  ocrProvider = "mistral_vision_edge";
                  ocrModel = mis.model;
                } catch (_) {
                  try {
                    const gh = await queryGitHubModelsEdge(env, "", "", body.imageBase64, body.imageMimeType, ocrPrompt);
                    ocrText = gh.answer;
                    ocrProvider = "github_vision_edge";
                    ocrModel = gh.model;
                  } catch (_) {}
                }
              }
            }
          }
          if (ocrText && ocrText !== "EMPTY") {
            const h = new Headers({ "Content-Type": "application/json" });
            applyCors(h, request);
            return new Response(
              JSON.stringify({
                success: true,
                text: ocrText.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim(),
                provider: ocrProvider,
                model: ocrModel,
                latencyMs: Date.now() - startTime,
              }),
              { status: 200, headers: h }
            );
          }
        }
      } catch (_) {
        // Fall through to Render origin if edge keys missing
      }
    }

    // Intercept AI endpoints: /api/ai/ask & /api/ai/circle-search
    const isAiEndpoint =
      (url.pathname === "/api/ai/ask" || url.pathname === "/api/ai/circle-search") &&
      request.method === "POST";

    if (isAiEndpoint) {
      try {
        const clonedAiReq = request.clone();
        const body = await clonedAiReq.json();
        const { query, context, imageBase64, imageMimeType, noteId, subject } = body;

        let user = body?.user || null;
        if (!user) {
          const authHeader = request.headers.get("Authorization") || "";
          if (authHeader.startsWith("Bearer ")) {
            try {
              const jwtPart = authHeader.split(" ")[1]?.split(".")[1];
              if (jwtPart) {
                const b64 = jwtPart.replace(/-/g, "+").replace(/_/g, "/");
                const jsonStr = atob(b64);
                const decoded = JSON.parse(jsonStr);
                user = {
                  name: decoded.name || decoded.userName || "Student Scholar",
                  email: decoded.email || "anonymous@student.edu",
                  mobile: decoded.mobile || decoded.phone || "N/A",
                };
              }
            } catch (_) {}
          }
        }

        const cleanQuery = (query || "").trim();
        const isImageOrDiagram = Boolean(imageBase64);

        if (!cleanQuery && !isImageOrDiagram) {
          const badHeaders = new Headers({ "Content-Type": "application/json" });
          applyCors(badHeaders, request);
          return new Response(JSON.stringify({ success: false, message: "Query prompt or image required" }), {
            status: 400,
            headers: badHeaders,
          });
        }

        const queryHash = await computeSha256(
          isImageOrDiagram
            ? `${cleanQuery}__img__${String(imageBase64).slice(0, 20000)}`
            : (cleanQuery || "empty")
        );

        // ====================================================================
        // STEP 1: CHECK TURSO EDGE CACHE (Sub-5ms, 0 Tokens Burned!)
        // ====================================================================
        const cached = await checkTursoCache(env, queryHash);
        if (cached && cached.answer) {
          const cacheHeaders = new Headers({
            "Content-Type": "application/json",
            "X-AI-Engine": "turso_cache",
            "X-Edge-Cache": "HIT",
            "X-Edge-Location": edgeColo,
            "X-Server-Hits": "0",
            "X-Response-Time": `${Date.now() - startTime}ms`,
          });
          applyCors(cacheHeaders, request);

          ctx.waitUntil(
            dispatchTelegramAiNotification(
              env,
              cleanQuery,
              "turso_cache",
              "Turso Edge Cache (0ms)",
              true,
              Date.now() - startTime,
              url.pathname.includes("circle"),
              user
            )
          );

          return new Response(
            JSON.stringify({
              success: true,
              answer: cached.answer,
              provider: "turso_cache",
              model: "Turso Edge Cache (0ms)",
              cached: true,
              cacheSource: "Turso Edge Cache (0ms • 0 Tokens)",
              edgeLocation: edgeColo,
              latencyMs: Date.now() - startTime,
            }),
            { status: 200, headers: cacheHeaders }
          );
        }

        // ====================================================================
        // STEP 2: MULTIMODAL ROUTER
        // ====================================================================
        let answer = "";
        let provider = "";
        let model = "";

        if (isImageOrDiagram) {
          // Branch A: Image / Diagram / Handwritten Note Crop -> Groq LPU Vision (~0.45s) -> Gemini Vision -> SambaNova -> Mistral -> GitHub
          const visionSolvePrompt = `You are an elite Academic Handwriting & Formula Solver. First write **📝 Extracted Text / Formula:** with the exact deciphered handwritten text/math in LaTeX \\( ... \\), then provide a step-by-step academic solution and 1-line "💡 Exam Takeaway".${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${cleanQuery ? `\n[Question]:\n${cleanQuery}` : ""}`;
          try {
            const gvRes = await queryGroqVisionEdge(env, visionSolvePrompt, imageBase64, imageMimeType, 750);
            answer = gvRes.answer;
            provider = "groq_vision";
            model = gvRes.model;
          } catch (_) {
            try {
              const vRes = await queryGeminiVision(env, cleanQuery, context, imageBase64, imageMimeType);
              answer = vRes.answer;
              provider = "gemini_vision";
              model = vRes.model;
            } catch (_) {
              try {
                const snRes = await querySambaNovaVisionEdge(env, visionSolvePrompt, imageBase64, imageMimeType, 750);
                answer = snRes.answer;
                provider = "sambanova_vision";
                model = snRes.model;
              } catch (_) {
                try {
                  const misRes = await queryMistralVisionEdge(env, visionSolvePrompt, imageBase64, imageMimeType, 750);
                  answer = misRes.answer;
                  provider = "mistral_vision";
                  model = misRes.model;
                } catch (_) {
                  try {
                    const ghRes = await queryGitHubModelsEdge(env, cleanQuery, context, imageBase64, imageMimeType, visionSolvePrompt);
                    answer = ghRes.answer;
                    provider = "github_vision";
                    model = ghRes.model;
                  } catch (_) {}
                }
              }
            }
          }
        } else {
          // Branch B: Normal Text / Code Query
          // Tier 1: Cerebras Cloud (USA • 2,000 tok/sec King of Speed)
          if ((env.CEREBRAS_API_KEY || "").trim()) {
            try {
              const cRes = await queryCerebrasEdge(env, cleanQuery, context);
              answer = cRes.answer;
              provider = "cerebras";
              model = cRes.model;
            } catch (_) {}
          }

          // Tier 2: Groq LPU (~800 tok/sec, 0.3s sub-second latency)
          if (!answer) {
            try {
              const gRes = await queryGroq(env, cleanQuery, context);
              answer = gRes.answer;
              provider = "groq_lpu";
              model = gRes.model;
            } catch (groqErr) {
              // Tier 3: Cloudflare Workers AI (Native Edge GPU Inference)
              try {
                const cfRes = await queryCloudflareWorkersAi(env, cleanQuery, context);
                answer = cfRes.answer;
                provider = "cloudflare_workers_ai";
                model = cfRes.model;
              } catch (cfErr) {
                // Tier 4: Standby Failover to Gemini
                try {
                  const gemRes = await queryGeminiVision(env, cleanQuery, context, null, null);
                  answer = gemRes.answer;
                  provider = "gemini_failover";
                  model = gemRes.model;
                } catch (_) {
                  // Tier 5: SambaNova Cloud (USA • RDU Hardware)
                  try {
                    const snRes = await querySambaNovaEdge(env, cleanQuery, context);
                    answer = snRes.answer;
                    provider = "sambanova";
                    model = snRes.model;
                  } catch (_) {
                    // Tier 6: Mistral AI (France/EU)
                    try {
                      const misRes = await queryMistralTextEdge(env, cleanQuery, context);
                      answer = misRes.answer;
                      provider = "mistral";
                      model = misRes.model;
                    } catch (_) {
                      // Tier 7: GitHub Models (Microsoft USA)
                      try {
                        const ghRes = await queryGitHubModelsEdge(env, cleanQuery, context);
                        answer = ghRes.answer;
                        provider = "github_models";
                        model = ghRes.model;
                      } catch (_) {
                        // Tier 8: Cohere AI (Canada)
                        try {
                          const cohRes = await queryCohereEdge(env, cleanQuery, context);
                          answer = cohRes.answer;
                          provider = "cohere";
                          model = cohRes.model;
                        } catch (_) {}
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Tier 4: If Edge Worker lacks keys or all edge APIs missed, delegate seamlessly to Render Origin!
        if (!answer) {
          throw new Error("DELEGATE_TO_ORIGIN");
        }

        // ====================================================================
        // STEP 3: PERSISTENCE (Async background write to Turso Cloud)
        // ====================================================================
        if (provider !== "heuristic_guard") {
          ctx.waitUntil(saveToTursoCache(env, queryHash, cleanQuery, answer, provider, model));
        }
        ctx.waitUntil(
          dispatchTelegramAiNotification(
            env,
            cleanQuery || (isImageOrDiagram ? "[Circled Image / Formula Crop]" : "Academic Question"),
            provider,
            model,
            false,
            Date.now() - startTime,
            url.pathname.includes("circle"),
            user
          )
        );

        const outHeaders = new Headers({
          "Content-Type": "application/json",
          "X-AI-Engine": provider,
          "X-Edge-Cache": "MISS",
          "X-Edge-Location": edgeColo,
          "X-Server-Hits": "0",
          "X-Response-Time": `${Date.now() - startTime}ms`,
        });
        applyCors(outHeaders, request);

        return new Response(
          JSON.stringify({
            success: true,
            answer,
            provider,
            model,
            cached: false,
            edgeLocation: edgeColo,
            latencyMs: Date.now() - startTime,
          }),
          { status: 200, headers: outHeaders }
        );
      } catch (err) {
        // Fallback to origin proxy if unhandled error
      }
    }

    // 4. Multi-Origin Active User Load Balancer with 3 -> 2 -> 1 Cascade Failover
    const baseOrigins = getAllClusterOrigins(env);

    // Filter currently healthy origins (exclude origins in temporary 25s auto-cooldown)
    const healthyOrigins = baseOrigins.filter((o) => getOriginCooldownRemaining(o) === 0);
    // If all origins are in cooldown (e.g. rare global glitch), fallback to attempting all origins
    const activePool = healthyOrigins.length > 0 ? healthyOrigins : baseOrigins;

    // Sticky User Consistent Hashing (via Client IP or session token)
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";
    const clientHash = hashClientIdentifier(clientIp);

    // Active User Distribution:
    // If 3 servers are healthy: users distributed 33% / 33% / 33%
    // If 1 server goes down (e.g. suspended): remaining 2 servers automatically share 50% / 50%
    // If 2 servers go down: single surviving server automatically receives 100%
    const startIndex = clientHash % activePool.length;
    const prioritizedOrigins = [
      ...activePool.slice(startIndex),
      ...activePool.slice(0, startIndex),
      // Append any cooling-down origins at the end for ultimate disaster recovery
      ...baseOrigins.filter((o) => !activePool.includes(o)),
    ];

    for (let i = 0; i < prioritizedOrigins.length; i++) {
      const origin = prioritizedOrigins[i];
      try {
        const originReqUrl = new URL(url.pathname + url.search, origin);
        const originRes = await fetch(new Request(originReqUrl.toString(), request));

        const cType = (originRes.headers.get("content-type") || "").toLowerCase();
        const routingHeader = originRes.headers.get("x-render-routing") || "";
        const isBadStatus =
          (originRes.status >= 500 && originRes.status <= 504) ||
          originRes.status === 402 ||
          originRes.status === 403;
        const isSuspension =
          routingHeader.includes("suspend") ||
          (cType.includes("text/html") && (url.pathname.startsWith("/api/") || url.pathname.includes("/stream")));

        // If current origin returned failure or suspension, auto-failover to next online node!
        if ((isBadStatus || isSuspension) && i < prioritizedOrigins.length - 1) {
          markOriginDown(origin);
          continue; // Cascade failover to next online node!
        }

        // On successful application response (< 500 and not suspension HTML), restore node to healthy status
        if (originRes.status < 500 && !isHtmlSuspension) {
          markOriginUp(origin);
        }

        const resHeaders = new Headers();
        for (const [k, v] of originRes.headers.entries()) {
          if (k.toLowerCase() !== "set-cookie") {
            resHeaders.set(k, v);
          }
        }
        if (typeof originRes.headers.getSetCookie === "function") {
          for (const c of originRes.headers.getSetCookie()) {
            resHeaders.append("Set-Cookie", c);
          }
        } else {
          const raw = originRes.headers.get("set-cookie");
          if (raw) resHeaders.set("set-cookie", raw);
        }
        applyCors(resHeaders, request);
        resHeaders.set("X-Upstream-Origin", origin);
        resHeaders.set("X-Cluster-Active-Nodes", String(activePool.length));
        return new Response(originRes.body, {
          status: originRes.status,
          headers: resHeaders,
        });
      } catch (err) {
        markOriginDown(origin);
        if (i < prioritizedOrigins.length - 1) continue;
      }
    }
    return new Response("Service unavailable", { status: 503 });
  },

  // 💓 Scheduled Cron Trigger: Pings ALL active Render origins every 12 min to keep them awake!
  async scheduled(event, env, ctx) {
    const targets = getAllClusterOrigins(env);
    for (const target of targets) {
      try {
        await fetch(`${target}/health?cron=cf&t=${Date.now()}`, {
          method: "GET",
          headers: {
            "User-Agent": "Cloudflare-Cron-AntiSleep/2.0",
            "Cache-Control": "no-cache, no-store",
          },
        });
      } catch (_) {}
    }
  },
};
