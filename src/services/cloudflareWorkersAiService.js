/**
 * 🔥 Dedicated Cloudflare Workers AI Service (Native Edge GPU Inference)
 * Model: @cf/meta/llama-3.1-8b-instruct
 * Quota: 10,000 Neurons / Day FREE (~500-1,000 Llama queries/day)
 * 
 * Acts as Tier 2 Bridge between Groq LPU (Tier 1) and Google Gemini (Tier 3),
 * executing directly on Cloudflare Edge GPUs with zero server memory footprint!
 */

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
 * @returns {Promise<string>}
 */
async function queryCloudflareWorkersAi(query, context = "") {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
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
        max_tokens: 500,
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
      throw new Error(`Cloudflare Workers AI Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const answer = data.result?.response || data.response || "";
    if (!answer) {
      throw new Error("Empty response from Cloudflare Workers AI");
    }

    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  queryCloudflareWorkersAi,
  isCloudflareAiAvailable,
};
