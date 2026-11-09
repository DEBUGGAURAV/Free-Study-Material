function normalizeOrigin(value) {
  try {
    const url = new URL(value.trim());
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

  if (configuredUrls.length) return [...new Set(configuredUrls)];

  const fallbackUrl =
    process.env.CLIENT_URL ||
    process.env.SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : `http://localhost:${process.env.PORT || 5000}`);
  const normalizedFallback = normalizeOrigin(fallbackUrl);
  return normalizedFallback ? [normalizedFallback] : [];
}

module.exports = { getBackendClusterUrls };
