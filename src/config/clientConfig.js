/**
 * Academic Cloud Global Site & Hosting Configuration (Frontend Client)
 * Centralizes platform branding, domain detection, and multi-cloud hosting settings.
 * 
 * Changing your Site Name or Hosting Platform in the future:
 * Simply set in your .env or hosting environment variables:
 *   VITE_SITE_NAME="Your New Platform Name"
 *   VITE_SITE_VAULT_NAME="Your Vault Name"
 *   VITE_SITE_TAGLINE="Academic Cloud & Notes Vault"
 */

export const SITE_NAME =
  import.meta.env.VITE_SITE_NAME || "Free Study Material";

export const SITE_VAULT_NAME =
  import.meta.env.VITE_SITE_VAULT_NAME || `${SITE_NAME} Vault`;

export const SITE_TAGLINE =
  import.meta.env.VITE_SITE_TAGLINE || "Academic Cloud & Notes Vault";

export const SITE_DESCRIPTION =
  import.meta.env.VITE_SITE_DESCRIPTION ||
  `${SITE_NAME} — High performance university study notes, engineering blueprints, and cloud lecture archives.`;

export const DEFAULT_CLUSTER_URLS = [
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
];

export const BACKEND_CLUSTER_URLS = (() => {
  const envUrls = (import.meta.env.VITE_BACKEND_CLUSTER_URLS || "")
    .split(",")
    .map((url) => {
      try {
        const parsed = new URL(String(url || "").trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : "";
      } catch {
        return "";
      }
    })
    .filter((url, index, urls) => url && urls.indexOf(url) === index && !url.includes("freestudymaterial.onrender.com"));

  if (envUrls.length >= 2) return envUrls;
  const merged = [...envUrls];
  for (const def of DEFAULT_CLUSTER_URLS) {
    if (!merged.includes(def) && merged.length < 2) {
      merged.push(def);
    }
  }
  return merged.length >= 2 ? merged : DEFAULT_CLUSTER_URLS;
})();

/**
 * Returns current browser hostname or configured domain
 */
export function getClientDomain() {
  if (typeof window !== "undefined" && window.location && window.location.host) {
    return window.location.host;
  }
  return import.meta.env.VITE_SITE_DOMAIN || "";
}

/**
 * Returns current browser origin or configured client URL
 */
export function getClientOrigin() {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_CLIENT_URL || "";
}
