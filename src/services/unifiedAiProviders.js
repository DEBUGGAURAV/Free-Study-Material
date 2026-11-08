/**
 * ⚡ Unified Non-Chinese AI Waterfall Engine
 * High-Speed Multi-Tier Academic & Vision Providers:
 *   1. Cerebras Wafer-Scale LPU (USA • 2,000 tok/sec • Llama 3.3 70B)
 *   2. SambaNova Cloud RDU (USA • Llama 3.3 70B & Llama 3.2 Vision)
 *   3. Mistral AI (France - EU • Codestral & Pixtral 12B Math OCR)
 *   4. GitHub Models (Microsoft / Azure USA • GPT-4o-mini Text & Vision)
 *   5. Cohere AI (Canada • Command R+ RAG Citations)
 * 
 * 100% Non-Chinese Allied Providers • 0% Render RAM • Zero-Cost Free Tiers
 */

function getCleanBase64(imageBase64) {
  return String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "").trim();
}

function getSafeMimeType(imageMimeType) {
  return imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";
}

const ACADEMIC_SYSTEM_PROMPT = `You are an elite, supportive academic AI tutor for university engineering and science students.
Answer accurately, concisely, and clearly based primarily on the provided lecture notes and problem context.
Formatting rules:
- Highlight key definitions and formulas in **bold** or LaTeX notation like \\(V = IR\\).
- If page numbers or citations exist, cite them clearly (e.g. "📌 [Reference: Page X]").
- Keep explanations under 220 words with clean bullet points so students can read quickly on mobile.
- End with 1-line "💡 Exam Takeaway".`;

const OCR_SYSTEM_PROMPT = `You are a precision Academic Handwriting & Mathematical OCR engine.
Transcribe ALL handwritten and printed text, mathematical equations, fractions, integrals, subscripts, matrices, and diagram labels visible in this image.
Rules:
- Accurately decode messy cursive handwriting and engineering notation.
- Output clean LaTeX formulas \\( ... \\).
- Output ONLY the transcribed formula/text without quotes, markdown code blocks, or preamble. If completely blank, output EMPTY.`;

/**
 * 1. ⚡ Cerebras Cloud (USA • Wafer-Scale Engine • ~2,000 tok/sec)
 */
async function queryCerebras(query, context = "", options = {}) {
  const apiKey = (process.env.CEREBRAS_API_KEY || "").trim();
  if (!apiKey) throw new Error("CEREBRAS_API_KEY_MISSING");

  const model = options.model || process.env.CEREBRAS_MODEL || "llama-3.3-70b";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 9000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
        max_tokens: options.maxTokens || 550,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cerebras Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty Cerebras response");
    return { answer, model, provider: "cerebras" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 2. 🧠 SambaNova Cloud (USA • RDU Hardware • Llama 3.3 70B & Llama 3.2 Vision)
 */
async function querySambaNovaText(query, context = "", options = {}) {
  const apiKey = (process.env.SAMBANOVA_API_KEY || "").trim();
  if (!apiKey) throw new Error("SAMBANOVA_API_KEY_MISSING");

  const model = options.model || process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
        max_tokens: options.maxTokens || 600,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SambaNova Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty SambaNova response");
    return { answer, model, provider: "sambanova" };
  } finally {
    clearTimeout(timeout);
  }
}

async function querySambaNovaVision(query, context = "", imageBase64, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = (process.env.SAMBANOVA_API_KEY || "").trim();
  if (!apiKey) throw new Error("SAMBANOVA_API_KEY_MISSING");

  const cleanB64 = getCleanBase64(imageBase64);
  const safeMime = getSafeMimeType(imageMimeType);
  const model = options.model || "Meta-Llama-3.2-11B-Vision-Instruct";

  const promptText = options.rawPrompt || `You are an elite academic diagram and formula solver.
First write **📝 Extracted Text / Formula:** in standard LaTeX \\( ... \\), then provide a step-by-step academic solution.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
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
        temperature: typeof options.temperature === "number" ? options.temperature : 0.15,
        max_tokens: options.maxTokens || 700,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SambaNova Vision Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty SambaNova Vision response");
    return { answer, model, provider: "sambanova_vision" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 3. 🇫🇷 Mistral AI (France - EU • Codestral & Pixtral 12B Math Vision)
 */
async function queryMistralText(query, context = "", options = {}) {
  const apiKey = (process.env.MISTRAL_API_KEY || "").trim();
  if (!apiKey) throw new Error("MISTRAL_API_KEY_MISSING");

  const model = options.model || process.env.MISTRAL_MODEL || "mistral-small-latest";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        max_tokens: options.maxTokens || 600,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mistral Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty Mistral response");
    return { answer, model, provider: "mistral" };
  } finally {
    clearTimeout(timeout);
  }
}

async function queryMistralVision(query, context = "", imageBase64, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = (process.env.MISTRAL_API_KEY || "").trim();
  if (!apiKey) throw new Error("MISTRAL_API_KEY_MISSING");

  const cleanB64 = getCleanBase64(imageBase64);
  const safeMime = getSafeMimeType(imageMimeType);
  const model = options.model || "pixtral-12b-2409";

  const promptText = options.rawPrompt || `You are an elite academic handwriting and math specialist.
First write **📝 Extracted Text / Formula:** in clean LaTeX \\( ... \\), then solve step-by-step.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
        max_tokens: options.maxTokens || 700,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mistral Vision Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty Mistral Pixtral response");
    return { answer, model, provider: "mistral_vision" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 4. 🐙 GitHub Models (Microsoft / Azure USA • GPT-4o-mini Text & Vision)
 */
async function queryGitHubModels(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const token = (process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("GITHUB_MODELS_TOKEN_MISSING");

  const model = options.model || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  const cleanB64 = imageBase64 ? getCleanBase64(imageBase64) : null;
  const safeMime = getSafeMimeType(imageMimeType);

  let messages = [];
  if (cleanB64) {
    const promptText = options.rawPrompt || `You are an elite academic tutor.
First write **📝 Extracted Text / Formula:** in standard LaTeX \\( ... \\), then solve step-by-step.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

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
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;

    messages = [
      { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
  }

  try {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: cleanB64 ? 0.15 : 0.2,
        max_tokens: options.maxTokens || 650,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub Models Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty GitHub Models response");
    return { answer, model, provider: cleanB64 ? "github_vision" : "github_models" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 5. 🇨🇦 Cohere AI (Canada • Command R+ Citations & RAG)
 */
async function queryCohere(query, context = "", options = {}) {
  const apiKey = (process.env.COHERE_API_KEY || "").trim();
  if (!apiKey) throw new Error("COHERE_API_KEY_MISSING");

  const model = options.model || "command-r-08-2024";
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cohere Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.message?.content?.[0]?.text || "").trim();
    if (!answer) throw new Error("Empty Cohere response");
    return { answer, model, provider: "cohere" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 6. 🤗 Hugging Face Serverless Router (100% Free • Zero Credit Card)
 * Direct access to Llama 3.3 70B & Llama 3.2 11B Vision
 */
async function queryHuggingFace(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const token = (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "").trim();
  if (!token) throw new Error("HUGGINGFACE_API_KEY_MISSING");

  const cleanB64 = imageBase64 ? getCleanBase64(imageBase64) : null;
  const safeMime = getSafeMimeType(imageMimeType);
  const model = options.model || (cleanB64 ? "meta-llama/Llama-3.2-11B-Vision-Instruct" : "meta-llama/Llama-3.3-70B-Instruct");

  let messages = [];
  if (cleanB64) {
    const promptText = options.rawPrompt || `You are an elite academic diagram and formula solver.
First write **📝 Extracted Text / Formula:** in standard LaTeX \\( ... \\), then provide a step-by-step academic solution.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

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
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;

    messages = [
      { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
  }

  const payload = {
    model,
    messages,
    temperature: cleanB64 ? 0.15 : 0.2,
    max_tokens: options.maxTokens || 650,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    // 1. Primary: Router Endpoint (Fast Western Inference Providers)
    let res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => null);

    // 2. Failover: Direct api-inference endpoint if router rejected token permissions
    if (!res || !res.ok) {
      res = await fetch(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => null);
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text().catch(() => "") : "Network timeout";
      throw new Error(`HuggingFace Error (${res ? res.status : 504}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty HuggingFace response");
    return { answer, model, provider: cleanB64 ? "huggingface_vision" : "huggingface" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 7. 🌐 OpenRouter Free Tier (100% Free • Zero Credit Card • :free models)
 */
async function queryOpenRouter(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");

  const cleanB64 = imageBase64 ? getCleanBase64(imageBase64) : null;
  const safeMime = getSafeMimeType(imageMimeType);
  const model = options.model || (cleanB64 ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "meta-llama/llama-3.3-70b-instruct:free");

  let messages = [];
  if (cleanB64) {
    const promptText = options.rawPrompt || `You are an elite academic diagram and formula solver.
First write **📝 Extracted Text / Formula:** in standard LaTeX \\( ... \\), then provide a step-by-step academic solution.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

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
      ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
      : `[Student Question]:\n${query}`;

    messages = [
      { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
  }

  const payload = {
    messages,
    temperature: cleanB64 ? 0.15 : 0.2,
    max_tokens: options.maxTokens || 650,
    reasoning: { max_tokens: 0 },
  };

  if (cleanB64) {
    payload.model = options.model || "nvidia/nemotron-3.5-super-vl:free";
  } else if (options.model) {
    payload.model = options.model;
  } else {
    payload.models = [
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
    ];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://freestudymaterial.onrender.com",
        "X-Title": "Free Study Material",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty OpenRouter response");
    const resolvedModel = data.model || payload.model || "openrouter-free";
    return { answer, model: resolvedModel, provider: cleanB64 ? "openrouter_vision" : "openrouter" };
  } finally {
    clearTimeout(timeout);
  }
}

function isProviderConfigured(provider) {
  switch (provider) {
    case "github":
      return Boolean((process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "").trim());
    case "huggingface":
    case "hf":
      return Boolean((process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "").trim());
    case "openrouter":
      return Boolean((process.env.OPENROUTER_API_KEY || "").trim());
    case "cerebras":
      return Boolean((process.env.CEREBRAS_API_KEY || "").trim());
    case "sambanova":
      return Boolean((process.env.SAMBANOVA_API_KEY || "").trim());
    case "mistral":
      return Boolean((process.env.MISTRAL_API_KEY || "").trim());
    case "cohere":
      return Boolean((process.env.COHERE_API_KEY || "").trim());
    default:
      return false;
  }
}

module.exports = {
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
  OCR_SYSTEM_PROMPT,
  ACADEMIC_SYSTEM_PROMPT,
};
