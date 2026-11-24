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
  const { request } = context;
  const url = new URL(request.url);
  const edgeCache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(`${url.origin}/sitemap.xml`, { method: "GET" });

  if (edgeCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) return hit;
    } catch (_) {}
  }

  for (const origin of BACKEND_ORIGINS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${origin}/sitemap.xml`, {
        method: "GET",
        headers: {
          "X-Forwarded-Host": url.host,
          "X-Forwarded-Proto": "https",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const xml = await res.text();
        if (xml.includes("<urlset")) {
          const out = new Response(xml, {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400",
            },
          });
          if (edgeCache) {
            const p = edgeCache.put(cacheKey, out.clone()).catch(() => {});
            if (typeof context.waitUntil === "function") context.waitUntil(p);
          }
          return out;
        }
      }
    } catch (_) {}
  }

  // Fallback minimal sitemap if all Render nodes are waking up
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

  return new Response(fallbackXml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
