/**
 * Cloudflare Pages Edge Function: Dynamic XML Sitemap Proxy (/sitemap.xml)
 * Fetches live 0-Firestore-Read XML sitemap from the Render cluster and caches at Edge for 1 hour.
 */

const BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
  "https://freestudymaterial.onrender.com",
];

export async function onRequest(context) {
  const { request, env } = context;
  const method = (request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const edgeCache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`${url.origin}/sitemap.xml`, { method: "GET" });

  const buildXmlResponse = (xml, cacheControl) => {
    const headers = {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheControl,
      "Last-Modified": new Date().toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };
    return new Response(method === "HEAD" ? null : xml, { status: 200, headers });
  };

  if (edgeCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) {
        return method === "HEAD"
          ? new Response(null, { status: 200, headers: hit.headers })
          : hit;
      }
    } catch (_) {}
  }

  // Race all healthy backend nodes in parallel (6.5s ceiling handles US Googlebot PoP -> Render round-trip)
  const fetchOriginSitemap = async (origin) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(`${origin}/sitemap.xml`, {
        method: "GET",
        headers: {
          "X-Forwarded-Host": url.host,
          "X-Forwarded-Proto": "https",
          "Accept": "application/xml, text/xml, */*",
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = (await res.text()).trim();
      if (!xml.includes("<urlset")) throw new Error("Invalid sitemap XML");
      return xml;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const xml = await Promise.any(BACKEND_ORIGINS.map((origin) => fetchOriginSitemap(origin)));
    const cacheableRes = new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400",
        "Last-Modified": new Date().toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (edgeCache) {
      const p = edgeCache.put(cacheKey, cacheableRes.clone()).catch(() => {});
      if (typeof context.waitUntil === "function") context.waitUntil(p);
    }
    return method === "HEAD"
      ? new Response(null, { status: 200, headers: cacheableRes.headers })
      : cacheableRes;
  } catch (_) {}

  // Zero-Latency Static Snapshot Fallback (all 128+ URLs straight from Cloudflare Pages CDN Assets)
  if (env && env.ASSETS) {
    try {
      const staticRes = await env.ASSETS.fetch(new Request(`${url.origin}/sitemap-static.xml`, { method: "GET" }));
      if (staticRes && staticRes.ok) {
        const staticXml = (await staticRes.text()).trim();
        if (staticXml.includes("<urlset")) {
          return buildXmlResponse(staticXml, "public, max-age=600, s-maxage=600");
        }
      }
    } catch (_) {}
  }

  // Final emergency minimal sitemap
  const today = new Date().toISOString().split("T")[0];
  const fallbackXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${url.origin}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${url.origin}/notes</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.95</priority></url>`,
    `  <url><loc>${url.origin}/notices</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`,
    `  <url><loc>${url.origin}/branch/CSE</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`,
    `  <url><loc>${url.origin}/branch/IT</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`,
    `  <url><loc>${url.origin}/branch/ECE</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`,
    `  <url><loc>${url.origin}/branch/ME</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`,
    "</urlset>",
  ].join("\n");

  return buildXmlResponse(fallbackXml, "public, max-age=300, s-maxage=300");
}
