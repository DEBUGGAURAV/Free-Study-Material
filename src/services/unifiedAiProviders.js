/**
 * Unified AI Provider Services
 * Multi-Tier Academic & Vision Providers:
 *   1. GitHub Models (Microsoft / Azure USA • GPT-4o-mini Text & Vision)
 * 
 * 100% Non-Chinese Allied Providers • 0% Render RAM • Zero-Cost Free Tiers
 */

function getCleanBase64(imageBase64) {
  return String(imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, "").trim();
}

function getSafeMimeType(imageMimeType) {
  return imageMimeType && imageMimeType.startsWith("image/") ? imageMimeType : "image/jpeg";
}

function getConfiguredModel(override, envKey, fallback = "") {
  const model = String(override || process.env[envKey] || fallback || "").trim();
  if (!model) throw new Error(`${envKey}_MISSING`);
  return model;
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
 * GitHub Models (Microsoft / Azure USA • GPT-4o-mini Text & Vision)
 */
async function queryGitHubModels(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const token = (process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("GITHUB_MODELS_TOKEN_MISSING");

  const model = getConfiguredModel(options.model, "GITHUB_MODELS_MODEL", "openai/gpt-4o-mini");
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
    const res = await fetch("https://models.github.ai/inference/chat/completions", {
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
 * Hugging Face Serverless Router (100% Free • Zero Credit Card)
 * Direct access to Llama 3.3 70B & Llama 3.2 11B Vision
 */
async function queryHuggingFace(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const token = (process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "").trim();
  if (!token) throw new Error("HUGGINGFACE_API_KEY_MISSING");

  const cleanB64 = imageBase64 ? getCleanBase64(imageBase64) : null;
  const safeMime = getSafeMimeType(imageMimeType);
  const defaultHf = cleanB64 ? "meta-llama/Llama-3.2-11B-Vision-Instruct" : "meta-llama/Llama-3.3-70B-Instruct";
  const model = getConfiguredModel(options.model, cleanB64 ? "HUGGINGFACE_VISION_MODEL" : "HUGGINGFACE_MODEL", defaultHf);

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
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HuggingFace Error (${res.status}): ${errText.slice(0, 200)}`);
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
 * OpenRouter Free Tier (100% Free • Zero Credit Card • :free models)
 */
async function queryOpenRouter(query, context = "", imageBase64 = null, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");

  const cleanB64 = imageBase64 ? getCleanBase64(imageBase64) : null;
  const safeMime = getSafeMimeType(imageMimeType);
  const defaultOr = cleanB64 ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "meta-llama/llama-3.3-70b-instruct:free";
  const model = getConfiguredModel(options.model, cleanB64 ? "OPENROUTER_VISION_MODEL" : "OPENROUTER_MODEL", defaultOr);

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
    payload.model = model;
  } else if (options.model) {
    payload.model = options.model;
  } else {
    payload.models = String(process.env.OPENROUTER_MODELS || "nvidia/nemotron-3.5-lightning:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.APP_URL || process.env.CLIENT_URL || process.env.SITE_URL
          ? { "HTTP-Referer": process.env.APP_URL || process.env.CLIENT_URL || process.env.SITE_URL }
          : {}),
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

/**
 * NVIDIA NIM (NVIDIA Inference Microservices • DGX Cloud • H100 Tensor Core GPUs)
 * Text: nvidia/nemotron-3.5-lightning-30b-a3b (llama-3.3-70b reached end of life)
 * Vision: nvidia/nemotron-3.5-super-vl-120b-a12b
 * enable_thinking=false keeps the answer in `content` instead of reasoning tokens.
 */
async function queryNvidiaText(query, context = "", options = {}) {
  const apiKey = (options.apiKey || process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "").trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY_MISSING");

  const model = getConfiguredModel(options.model, "NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt]:\n${context.slice(0, 3500)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: options.rawPrompt ? options.rawPrompt : ACADEMIC_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
        max_tokens: options.maxTokens || 650,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NVIDIA NIM Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty NVIDIA NIM response");
    return { answer, model, provider: "nvidia" };
  } finally {
    clearTimeout(timeout);
  }
}

async function queryNvidiaVision(query, context = "", imageBase64, imageMimeType = "image/jpeg", options = {}) {
  const apiKey = (options.apiKey || process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "").trim();
  if (!apiKey) throw new Error("NVIDIA_API_KEY_MISSING");

  const cleanB64 = getCleanBase64(imageBase64);
  const safeMime = getSafeMimeType(imageMimeType);
  const model = getConfiguredModel(options.model, "NVIDIA_VISION_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b");

  const promptText = options.rawPrompt || `You are an elite academic diagram and formula solver.
First write **📝 Extracted Text / Formula:** in standard LaTeX \\( ... \\), then provide a step-by-step academic solution.
End with 1-line "💡 Exam Takeaway".
${context ? `\n[Context]:\n${context.slice(0, 3000)}` : ""}${query ? `\n[Question]:\n${query}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
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
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NVIDIA NIM Vision Error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw new Error("Empty NVIDIA NIM Vision response");
    return { answer, model, provider: "nvidia_vision" };
  } finally {
    clearTimeout(timeout);
  }
}

function isProviderConfigured(provider) {
  switch (provider) {
    case "nvidia":
    case "nvidia-nim":
      return Boolean((process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "").trim());
    case "github":
      return Boolean((process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "").trim());
    case "huggingface":
    case "hf":
      return Boolean((process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "").trim());
    case "openrouter":
      return Boolean((process.env.OPENROUTER_API_KEY || "").trim());
    default:
      return false;
  }
}

module.exports = {
  queryNvidiaText,
  queryNvidiaVision,
  queryGitHubModels,
  queryHuggingFace,
  queryOpenRouter,
  isProviderConfigured,
  OCR_SYSTEM_PROMPT,
  ACADEMIC_SYSTEM_PROMPT,
};
