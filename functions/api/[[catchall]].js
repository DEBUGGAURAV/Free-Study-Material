/**
 * Cloudflare Pages Edge Function: Zero-Lag Universal API Proxy
 * Handles GET, POST, PUT, DELETE, OPTIONS, PATCH for /api/* without 405 errors.
 * Automatically fails over between Primary and Backup Render backends.
 */

const PRIMARY_ORIGIN = "https://freestudymaterial1.onrender.com";
const BACKUP_ORIGIN = "https://freestudymaterial.onrender.com";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. Handle CORS Preflight OPTIONS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Cache-Control",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 2. Multi-Origin Failover Proxy
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const bodyBytes = hasBody ? await request.arrayBuffer() : null;

  const origins = [PRIMARY_ORIGIN, BACKUP_ORIGIN];
  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i];
    try {
      const targetUrl = new URL(url.pathname + url.search, origin);
      const reqHeaders = new Headers(request.headers);
      reqHeaders.set("X-Forwarded-Host", url.host);
      reqHeaders.set("X-Forwarded-Proto", "https");

      const init = {
        method: request.method,
        headers: reqHeaders,
        redirect: "follow",
      };

      if (hasBody && bodyBytes) {
        init.body = bodyBytes;
      }

      const response = await fetch(new Request(targetUrl.toString(), init));

      // If primary returns 502/503/504 and backup origin is available, auto-failover!
      if (response.status >= 502 && response.status <= 504 && i < origins.length - 1) {
        continue;
      }

      const resHeaders = new Headers(response.headers);
      resHeaders.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
      resHeaders.set("Access-Control-Allow-Credentials", "true");
      resHeaders.set("X-Load-Balancer", "Cloudflare Edge Intelligent Failover");
      resHeaders.set("X-Served-By", origin);
      return new Response(response.body, {
        status: response.status,
        headers: resHeaders,
      });
    } catch (err) {
      if (i < origins.length - 1) continue;
      return new Response(JSON.stringify({ error: "Backend unavailable", message: err.message }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}
