/**
 * Academic Cloud Global Site & Hosting Configuration (Backend)
 * Centralizes platform branding, domain detection, and multi-cloud hosting settings.
 *
 * Host Portability:
 * To move your frontend to ANY new host (Cloudflare Pages, Vercel, Netlify, custom domain):
 *   1. Just set CLIENT_URL="https://your-new-domain.com" (1 env var), OR
 *   2. Simply open/upload from your new domain — active frontend origin is auto-detected from requests!
 * Dead/retired backend hosts (e.g. freestudymaterial.onrender.com) are automatically skipped.
 */

const DEFAULT_SITE_NAME = process.env.SITE_NAME || "Free Study Material";
const DEFAULT_VAULT_NAME = process.env.SITE_VAULT_NAME || `${DEFAULT_SITE_NAME} Vault`;
const FALLBACK_PUBLIC_SITE = "https://freestudymaterial.pages.dev";

// Retired/suspended hosts that must NEVER be emitted in public Telegram receipts or user links
const RETIRED_SITE_HOSTS = new Set(["freestudymaterial.onrender.com"]);

// Remember the most recent valid public frontend origin observed on incoming requests
let rememberedPublicSiteUrl = "";

function normalizePublicSiteUrl(rawUrl, { allowRenderBackend = false } = {}) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return "";
    }
    if (RETIRED_SITE_HOSTS.has(host)) {
      return "";
    }
    if (!allowRenderBackend && /^freestudymaterial\d*\.onrender\.com$/i.test(host)) {
      return "";
    }
    return parsed.origin.replace(/\/+$/, "");
  } catch (_) {
    return "";
  }
}

/**
 * Remember an active public frontend domain (e.g., from Origin / X-Forwarded-Host)
 * so Telegram Bot/MTProto receipts automatically point to your newest host even without editing Render env vars.
 */
function rememberActiveSiteUrl(rawUrl) {
  const clean = normalizePublicSiteUrl(rawUrl, { allowRenderBackend: false });
  if (clean) {
    rememberedPublicSiteUrl = clean;
  }
  return clean;
}

function extractRequestOrigin(req) {
  if (!req || !req.headers) return "";
  const originHdr = req.headers.origin;
  if (originHdr) {
    const clean = normalizePublicSiteUrl(originHdr, { allowRenderBackend: false });
    if (clean) return clean;
  }
  const refererHdr = req.headers.referer;
  if (refererHdr) {
    const clean = normalizePublicSiteUrl(refererHdr, { allowRenderBackend: false });
    if (clean) return clean;
  }
  const fwdHost = req.headers["x-forwarded-host"];
  const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "https";
  if (fwdHost) {
    const firstHost = String(fwdHost).split(",")[0].trim();
    const clean = normalizePublicSiteUrl(`${proto}://${firstHost}`, { allowRenderBackend: false });
    if (clean) return clean;
  }
  const hostHdr = req.get ? req.get("host") : req.headers.host;
  if (hostHdr) {
    const clean = normalizePublicSiteUrl(`${proto}://${hostHdr}`, { allowRenderBackend: false });
    if (clean) return clean;
  }
  return "";
}

const DEFAULT_DOMAIN =
  normalizePublicSiteUrl(process.env.PUBLIC_SITE_URL) ||
  normalizePublicSiteUrl(process.env.CLIENT_URL) ||
  normalizePublicSiteUrl(process.env.FRONTEND_URL) ||
  normalizePublicSiteUrl(process.env.PUBLIC_URL) ||
  normalizePublicSiteUrl(process.env.SITE_URL) ||
  normalizePublicSiteUrl(process.env.CF_PAGES_URL) ||
  normalizePublicSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  normalizePublicSiteUrl(process.env.VERCEL_URL) ||
  normalizePublicSiteUrl(process.env.RAILWAY_PUBLIC_DOMAIN) ||
  normalizePublicSiteUrl(process.env.RAILWAY_STATIC_URL) ||
  FALLBACK_PUBLIC_SITE;

/**
 * Get active canonical public frontend URL dynamically.
 * Priority:
 *   1. Active live request frontend origin (if req is passed — auto-adapts to ANY new host immediately!)
 *   2. Explicit public frontend env vars (PUBLIC_SITE_URL, CLIENT_URL, FRONTEND_URL, PUBLIC_URL, SITE_URL, APP_URL, WEB_URL, CF_PAGES_URL, Vercel, Netlify, Railway)
 *   3. Remembered active frontend domain from recent web requests
 *   4. Canonical public fallback (https://freestudymaterial.pages.dev)
 * Retired dead hosts (freestudymaterial.onrender.com) are NEVER returned.
 */
function getSiteUrl(req = null) {
  // 1. Live request origin (makes moving to a new host 100% automatic on web uploads!)
  if (req && typeof req === "object") {
    const fromReq = extractRequestOrigin(req);
    if (fromReq) {
      rememberedPublicSiteUrl = fromReq;
      return fromReq;
    }
  } else if (typeof req === "string") {
    const explicit = normalizePublicSiteUrl(req, { allowRenderBackend: true });
    if (explicit) return explicit;
  }

  // 2. Explicit public frontend environment variables (skipping retired dead Render node)
  const envCandidates = [
    process.env.PUBLIC_SITE_URL,
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_URL,
    process.env.SITE_URL,
    process.env.APP_URL,
    process.env.WEB_URL,
    process.env.CF_PAGES_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
    process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null,
    process.env.URL, // Netlify production domain
    process.env.DEPLOY_PRIME_URL,
  ];

  for (const candidate of envCandidates) {
    const clean = normalizePublicSiteUrl(candidate, { allowRenderBackend: false });
    if (clean) return clean;
  }

  // 3. Remembered live frontend domain observed from traffic
  if (rememberedPublicSiteUrl) {
    return rememberedPublicSiteUrl;
  }

  // 4. Healthy active Render node fallback ONLY if explicitly configured and non-retired
  const renderCandidate = normalizePublicSiteUrl(
    process.env.RENDER_EXTERNAL_URL ||
      (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : ""),
    { allowRenderBackend: true }
  );
  if (FALLBACK_PUBLIC_SITE) {
    return FALLBACK_PUBLIC_SITE;
  }
  return renderCandidate || FALLBACK_PUBLIC_SITE;
}

/**
 * Relative Host-Independent Note Path (works on ANY host/domain you deploy to!)
 */
function getNoteRelativePath(noteId) {
  if (!noteId) return "/notes";
  return `/note/${encodeURIComponent(String(noteId).trim())}`;
}

/**
 * Canonical Universal Public Note URL (Works seamlessly on Cloudflare Pages, Vercel, Netlify, Render, or any custom domain)
 * Clean /note/:id route opens the note directly with 200 OK (zero redirect loops, zero 503 dead Render URLs).
 */
function getNotePublicUrl(noteId, reqOrBase = null) {
  const base = getSiteUrl(reqOrBase);
  if (!noteId) return base;
  return `${base}${getNoteRelativePath(noteId)}`;
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
 * Get active platform domain name (e.g. "freestudymaterial.pages.dev" or "studyvault.in")
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
  getNoteRelativePath,
  rememberActiveSiteUrl,
  getSiteName,
  getVaultName,
  getSiteDomain,
  DEFAULT_SITE_NAME,
  DEFAULT_VAULT_NAME,
  DEFAULT_DOMAIN,
};
