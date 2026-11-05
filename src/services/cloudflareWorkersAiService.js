/**
 * 🔥 Dedicated Cloudflare Workers AI Service (Native Edge GPU Inference)
 * Model: @cf/meta/llama-3.1-8b-instruct
 * Quota: 10,000 Neurons / Day FREE (~500-1,000 Llama queries/day)
 * 
 * Acts as Tier 2 Bridge between Groq LPU (Tier 1) and Google Gemini (Tier 3),
 * executing directly on Cloudflare Edge GPUs with zero server memory footprint!
 */

try {
  const dns = require("node:dns");
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
} catch (_) {}

function getCfCredentials() {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    ""
  ).trim();

  const apiToken = (
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    process.env.CLOUDFLARE_API_KEY ||
    ""
  ).trim();

  return { accountId, apiToken };
}

/**
 * Checks if Cloudflare Workers AI is configured with valid credentials
 * @returns {boolean}
 */
function isCloudflareAiAvailable() {
  const { accountId, apiToken } = getCfCredentials();
  return Boolean(accountId && apiToken);
}

/**
 * Query Cloudflare Workers AI Llama 3.1 8B Instruct model
 * @param {string} query 
 * @param {string} context 
 * @param {object} options
 * @returns {Promise<string>}
 */
async function queryCloudflareWorkersAi(query, context = "", options = {}) {
  const { accountId, apiToken } = getCfCredentials();
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_AI_CREDENTIALS_MISSING");
  }

  const systemPrompt = `You are a brilliant, supportive AI academic tutor for college students studying engineering, science, and higher education.
Answer the student's question accurately, concisely, and clearly based primarily on their provided lecture notes context.
Formatting rules:
- Highlight key definitions and formulas in **bold** or LaTeX format (e.g. \\(V = IR\\)).
- If page numbers or excerpts exist in the context, cite them clearly (e.g. "📌 [Reference: Page X]").
- Use clean bullet points for steps, algorithms, or properties.
- Keep the explanation under 220 words so students can grasp it instantly on mobile.
- Add a 1-line "💡 Exam Takeaway" at the end.`;

  const userContent = context && context.trim()
    ? `[Academic Notes Excerpt & Citations]:\n${context.slice(0, 3000)}\n\n[Student Question]:\n${query}`
    : `[Student Question]:\n${query}`;

  const candidateModels = [
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/mistral/mistral-7b-instruct-v0.1",
    "@cf/meta/llama-3.2-1b-instruct",
  ];

  const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : 600;
  let lastError = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error(`CF_WORKERS_AI_RATE_LIMIT_429: ${errText}`);
        }
        // If 502/503 routing error, log and try next model
        console.warn(`[CF-AI] Notice: ${model} returned ${response.status}. Attempting fallback model...`);
        lastError = new Error(`Cloudflare Workers AI Error (${response.status}): ${errText}`);
        continue;
      }

      const data = await response.json();
      const answer = data.result?.response || data.response || "";
      if (!answer) {
        lastError = new Error("Empty response from Cloudflare Workers AI");
        continue;
      }

      return answer.trim();
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (err.name === "AbortError") {
        console.warn(`[CF-AI] ${model} timed out. Trying fallback...`);
      } else {
        console.warn(`[CF-AI] ${model} error:`, err.message);
      }
    }
  }

  throw lastError || new Error("All Cloudflare Workers AI models failed");
}

module.exports = {
  queryCloudflareWorkersAi,
  isCloudflareAiAvailable,
};
