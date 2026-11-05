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
 *        • Offline Guard: Atelion Heuristic Math & Notes Solver
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
    "Content-Type, X-AI-Engine, X-Edge-Location, X-Server-Hits, X-Edge-Cache, X-Response-Time"
  );
  headers.set("Access-Control-Max-Age", "86400");
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
 * 🌐 Vision Engine: Google Gemini (Multimodal Images & Handwritten OCR)
 */
async function queryGeminiVision(env, query, context, imageBase64, imageMimeType) {
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const primaryModel = env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const fallbackModel = primaryModel === "gemini-3.5-flash-lite" ? "gemini-flash-lite-latest" : "gemini-3.5-flash-lite";
  const modelsToTry = [primaryModel, fallbackModel];

  const promptText = `You are a brilliant academic tutor for college engineering and science students.
Answer clearly and authoritatively based on the provided notes context or handwritten diagram crop.
Highlight formulas in LaTeX (e.g. \\(V = IR\\)).
Add 1-line "💡 Exam Takeaway" at the end.

${context ? `[Context]:\n${context.slice(0, 3500)}\n\n` : ""}[Question]:\n${query || "Analyze and solve the problem/diagram shown in this study note."}`;

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

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      });

      if (!res.ok) {
        if ((res.status === 503 || res.status === 404) && model !== fallbackModel) {
          continue; // Auto-shift to fallback model on 503 spikes
        }
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
 * 🛡️ Atelion Heuristic Cloud Guard (Offline Fallback)
 */
function queryHeuristicGuard(query, context) {
  if (context && context.trim()) {
    return {
      answer: `🤖 [Atelion Academic Notes Synthesis]\n\nBased on your course notes, here is the direct excerpt matching "${query}":\n\n"${context.slice(0, 320)}..."\n\n💡 Note: Cloud AI engine is currently on offline standby or awaiting keys in Admin Studio.`,
      model: "Atelion Heuristic Guard",
    };
  }
  return {
    answer: `🤖 [Atelion Academic AI Assistant]\n\nCould not connect to Cloud AI engines right now. Please verify API keys in Admin Studio or consult your course notes directly.`,
    model: "Offline Guard",
  };
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

    // Intercept AI endpoints: /api/ai/ask & /api/ai/circle-search
    const isAiEndpoint =
      (url.pathname === "/api/ai/ask" || url.pathname === "/api/ai/circle-search") &&
      request.method === "POST";

    if (isAiEndpoint) {
      try {
        const body = await request.json();
        const { query, context, imageBase64, imageMimeType, noteId, subject } = body;

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

        const queryHash = await computeSha256(cleanQuery || (imageBase64 ? imageBase64.slice(0, 80) : "empty"));

        // ====================================================================
        // STEP 1: CHECK TURSO EDGE CACHE (Sub-5ms, 0 Tokens Burned!)
        // ====================================================================
        if (!isImageOrDiagram) {
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
        }

        // ====================================================================
        // STEP 2: MULTIMODAL ROUTER
        // ====================================================================
        let answer = "";
        let provider = "";
        let model = "";

        if (isImageOrDiagram) {
          // Branch A: Image / Diagram / Handwritten Note Crop -> Google Gemini Vision
          try {
            const vRes = await queryGeminiVision(env, cleanQuery, context, imageBase64, imageMimeType);
            answer = vRes.answer;
            provider = "gemini_vision";
            model = vRes.model;
          } catch (_) {}
        } else {
          // Branch B: Normal Text / Code Query
          // Tier 1: Groq LPU (~800 tok/sec, 0.3s sub-second latency)
          try {
            const gRes = await queryGroq(env, cleanQuery, context);
            answer = gRes.answer;
            provider = "groq_lpu";
            model = gRes.model;
          } catch (groqErr) {
            // Tier 2: Cloudflare Workers AI (Native Edge GPU Inference)
            try {
              const cfRes = await queryCloudflareWorkersAi(env, cleanQuery, context);
              answer = cfRes.answer;
              provider = "cloudflare_workers_ai";
              model = cfRes.model;
            } catch (cfErr) {
              // Tier 3: Standby Failover to Gemini
              try {
                const gemRes = await queryGeminiVision(env, cleanQuery, context, null, null);
                answer = gemRes.answer;
                provider = "gemini_failover";
                model = gemRes.model;
              } catch (_) {}
            }
          }
        }

        // Tier 4: Offline Resilient Guard if all external APIs exhausted
        if (!answer) {
          const hRes = queryHeuristicGuard(cleanQuery, context);
          answer = hRes.answer;
          provider = "heuristic_guard";
          model = hRes.model;
        }

        // ====================================================================
        // STEP 3: PERSISTENCE (Async background write to Turso Cloud)
        // ====================================================================
        if (provider !== "heuristic_guard") {
          ctx.waitUntil(saveToTursoCache(env, queryHash, cleanQuery, answer, provider, model));
        }

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

    // 4. Default Reverse Proxy to Render Origin (for non-AI endpoints or pass-through)
    const originBase = env.ORIGIN_URL || "https://freestudymaterial.onrender.com";
    try {
      const originReqUrl = new URL(url.pathname + url.search, originBase);
      const originRes = await fetch(new Request(originReqUrl.toString(), request));
      const resHeaders = new Headers(originRes.headers);
      applyCors(resHeaders, request);
      return new Response(originRes.body, {
        status: originRes.status,
        headers: resHeaders,
      });
    } catch (err) {
      return new Response("Service unavailable", { status: 503 });
    }
  },
};
