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
  process.env.FRONTEND_URL ||
  process.env.PUBLIC_URL ||
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "https://freestudymaterial.pages.dev";

/**
 * Get active canonical platform URL dynamically.
 * Auto-detects custom domains, Cloudflare Pages, Vercel, Netlify, Render, Railway, etc.
 */
function getSiteUrl(req = null) {
  const envCandidates = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_URL,
    process.env.SITE_URL,
    process.env.APP_URL,
    process.env.WEB_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null,
    process.env.CF_PAGES_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
    process.env.URL, // Netlify production domain
    process.env.DEPLOY_PRIME_URL,
  ];

  for (const candidate of envCandidates) {
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      let trimmed = candidate.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(trimmed)) {
        trimmed = `https://${trimmed}`;
      }
      return trimmed;
    }
  }

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
 * Canonical Universal Public Note URL (Works seamlessly on any host / domain)
 * Directly opens the note in the Virtual PDF Reader on the web.
 * Query format (?noteId=...) is immune to 404s on all static web hosts and SPAs.
 */
function getNotePublicUrl(noteId) {
  if (!noteId) return getSiteUrl();
  const base = getSiteUrl();
  return `${base}/?noteId=${encodeURIComponent(noteId)}`;
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
    return "";
  }
}

module.exports = {
  getSiteUrl,
  getNotePublicUrl,
  getSiteName,
  getVaultName,
  getSiteDomain,
  DEFAULT_SITE_NAME,
  DEFAULT_VAULT_NAME,
  DEFAULT_DOMAIN,
};
