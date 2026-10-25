/**
 * Academic Cloud Global Site & Hosting Configuration (Backend)
 * Centralizes platform branding, domain detection, and multi-cloud hosting settings.
 * 
 * Changing your Site Name or Hosting Platform in the future:
 * Simply set in your .env:
 *   SITE_NAME="Your New Platform Name"
 *   SITE_VAULT_NAME="Your Vault Name"
 *   CLIENT_URL="https://yournewdomain.com"
 */

const DEFAULT_SITE_NAME = process.env.SITE_NAME || "Free Study Material";
const DEFAULT_VAULT_NAME = process.env.SITE_VAULT_NAME || `${DEFAULT_SITE_NAME} Vault`;
const DEFAULT_DOMAIN =
  process.env.CLIENT_URL ||
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://freestudymaterial.onrender.com";

/**
 * Get active canonical platform URL dynamically
 */
function getSiteUrl(req = null) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/+$/, "");
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  if (process.env.RAILWAY_STATIC_URL) return `https://${process.env.RAILWAY_STATIC_URL}`.replace(/\/+$/, "");

  if (req && req.get) {
    const host = req.get("host");
    const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }

  return DEFAULT_DOMAIN.replace(/\/+$/, "");
}

/**
 * Get active platform brand name
 */
function getSiteName() {
  return (process.env.SITE_NAME || process.env.VITE_SITE_NAME || DEFAULT_SITE_NAME).trim();
}

/**
 * Get active platform vault title
 */
function getVaultName() {
  return (process.env.SITE_VAULT_NAME || process.env.VITE_SITE_VAULT_NAME || DEFAULT_VAULT_NAME).trim();
}

/**
 * Get active platform domain name (e.g. "studyvault.in" or "freestudymaterial.onrender.com")
 */
function getSiteDomain(req = null) {
  try {
    const url = new URL(getSiteUrl(req));
    return url.host;
  } catch (_) {
    return "freestudymaterial.onrender.com";
  }
}

module.exports = {
  getSiteUrl,
  getSiteName,
  getVaultName,
  getSiteDomain,
  DEFAULT_SITE_NAME,
  DEFAULT_VAULT_NAME,
  DEFAULT_DOMAIN,
};
