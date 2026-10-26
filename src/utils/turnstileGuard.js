/**
 * 🛡️ Category 2 Feature 3: Cloudflare Turnstile Smart Anti-Bot Guard
 * Verifies Turnstile response tokens on sensitive public forms (Registration, Login, Uploads)
 * Protects against scrapers, bot scripts, and DDoS credential stuffing without annoying CAPTCHAs.
 */

const TURNSTILE_SECRET_KEY = (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "").trim();
const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies Cloudflare Turnstile Token
 * @param {string} token - The turnstile response token from the client widget
 * @param {string} [remoteIp] - User's IP address
 * @returns {Promise<{ success: boolean, error?: string, bypassed?: boolean }>}
 */
async function verifyTurnstileToken(token, remoteIp = "") {
  // If no secret key is configured in environment, gracefully bypass (dev / test mode)
  if (!TURNSTILE_SECRET_KEY) {
    return { success: true, bypassed: true };
  }

  if (!token || typeof token !== "string") {
    return {
      success: false,
      error: "Smart Anti-Bot Verification required. Please complete the security check.",
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[TURNSTILE] Verification server returned HTTP ${response.status}`);
      // Fail open on Cloudflare server errors to prevent legitimate students from being locked out
      return { success: true, bypassed: true };
    }

    const result = await response.json();
    if (result.success) {
      return { success: true, bypassed: false };
    }

    return {
      success: false,
      error: "Anti-bot challenge verification failed or expired. Please refresh and try again.",
      codes: result["error-codes"],
    };
  } catch (err) {
    console.warn("[TURNSTILE] Verification network error:", err.message);
    // Fail-open on transient network connectivity issues
    return { success: true, bypassed: true };
  }
}

module.exports = {
  verifyTurnstileToken,
  isTurnstileConfigured: () => Boolean(TURNSTILE_SECRET_KEY),
};

