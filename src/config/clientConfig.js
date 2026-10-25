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

/**
 * Returns current browser hostname or configured domain
 */
export function getClientDomain() {
  if (typeof window !== "undefined" && window.location && window.location.host) {
    return window.location.host;
  }
  return import.meta.env.VITE_SITE_DOMAIN || "freestudymaterial.onrender.com";
}

/**
 * Returns current browser origin or configured client URL
 */
export function getClientOrigin() {
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_CLIENT_URL || "https://freestudymaterial.onrender.com";
}
