const DEFAULT_CLUSTER_URLS = [
  "https://freestudymaterial.onrender.com",
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
];

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function getBackendClusterUrls() {
  const configuredUrls = (process.env.BACKEND_CLUSTER_URLS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  if (configuredUrls.length >= 3) return [...new Set(configuredUrls)];

  const fallbackUrl =
    process.env.CLIENT_URL ||
    process.env.SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : "");
  const normalizedFallback = normalizeOrigin(fallbackUrl);

  const result = [];
  if (configuredUrls.length > 0) {
    result.push(...configuredUrls);
  } else if (normalizedFallback) {
    result.push(normalizedFallback);
  }

  for (const def of DEFAULT_CLUSTER_URLS) {
    if (!result.includes(def) && result.length < 3) {
      result.push(def);
    }
  }

  return result.length >= 3 ? result : DEFAULT_CLUSTER_URLS;
}

module.exports = { getBackendClusterUrls, DEFAULT_CLUSTER_URLS };
