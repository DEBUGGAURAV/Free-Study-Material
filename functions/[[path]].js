/**
 * Cloudflare Pages Hybrid Router (Static Landing '/' + SPA Multi-Page App '/app/')
 * Prevents Cloudflare Pages Pretty-URLs 308 redirect loops that occur with wildcard _redirects -> *.html.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 0. Serve Google Search Console verification file directly (200 OK, avoids Pages Pretty-URL 308 strip on .html)
  if (pathname === "/googled76ca012d3d130b8.html") {
    return new Response("google-site-verification: googled76ca012d3d130b8.html", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 1. Always serve static landing page ('/') and real static assets directly via Pages CDN
  const isStaticFile =
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/app" ||
    pathname === "/app/" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/tesseract/") ||
    /\.(?:js|mjs|css|map|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|json|xml|txt|wasm|gz)$/i.test(pathname);

  if (isStaticFile) {
    return context.next();
  }

  // 2. For SPA multi-page routes (/notes, /branch/*, /note/*, /notices, /chat, /help, /vault):
  // Fetch /app/ (dist/app/index.html) directly from Pages ASSETS binding -> returns 200 OK with ZERO 308 redirect!
  const appAssetUrl = new URL("/app/", url.origin);
  const assetRes = await env.ASSETS.fetch(
    new Request(appAssetUrl.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: request.headers,
    })
  );

  const headers = new Headers(assetRes.headers);
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(assetRes.body, {
    status: 200,
    headers,
  });
}
