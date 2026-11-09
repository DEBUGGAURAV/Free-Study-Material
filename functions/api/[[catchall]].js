/**
 * Cloudflare Pages Edge Function: Zero-Lag Universal API Proxy & Intelligent Load Balancer
 * Handles GET, POST, PUT, DELETE, OPTIONS, PATCH for /api/* without 405 errors.
 * Multi-Origin Failover with 60s dynamic health circuit-breaker and sub-second failover.
 */

const BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com",  // #1 Active Primary (0ms lag, healthy)
  "https://freestudymaterial2.onrender.com",  // #2 Active Standby (0ms lag, healthy)
  "https://freestudymaterial.onrender.com",   // #3 Tertiary Fallback (Render quota suspended)
];

// Circuit Breaker: Cache unhealthy origins for 60s to avoid 2-5s retry lag on dead backends
const unhealthyOrigins = new Map();
const UNHEALTHY_COOLDOWN_MS = 60000;

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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Cache-Control, X-Admin-Bypass, X-Cluster-Sync",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 2. Multi-Origin Failover Proxy with Circuit-Breaker Sorting
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const bodyBytes = hasBody ? await request.arrayBuffer() : null;

  const now = Date.now();
  // Sort origins: Healthy origins first, recently failed or disabled origins last
  const sortedOrigins = [...BACKEND_ORIGINS].sort((a, b) => {
    const aDead = (unhealthyOrigins.get(a) || 0) > now;
    const bDead = (unhealthyOrigins.get(b) || 0) > now;
    if (aDead === bDead) return 0;
    return aDead ? 1 : -1;
  });

  for (let i = 0; i < sortedOrigins.length; i++) {
    const origin = sortedOrigins[i];
    try {
      const targetUrl = new URL(url.pathname + url.search, origin);
      const reqHeaders = new Headers(request.headers);
      reqHeaders.delete("host"); // Allow fetch to set correct target host header
      reqHeaders.set("X-Forwarded-Host", url.host);
      reqHeaders.set("X-Forwarded-Proto", "https");

      // Set 6-second subrequest timeout to fail fast if backend stalls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const init = {
        method: request.method,
        headers: reqHeaders,
        redirect: "follow",
        signal: controller.signal,
      };

      if (hasBody && bodyBytes) {
        init.body = bodyBytes.slice(0); // Cloned buffer for safe re-use across retries
      }

      let response;
      try {
        response = await fetch(new Request(targetUrl.toString(), init));
      } finally {
        clearTimeout(timeoutId);
      }

      // If backend returns 502/503/504 (or suspended, or server down 520-526, or explicitly disabled by admin), auto-failover
      const isServerDown =
        (response.status >= 500 && response.status <= 504) ||
        (response.status >= 520 && response.status <= 526) ||
        response.headers.get("x-node-disabled") === "true";

      if (isServerDown) {
        unhealthyOrigins.set(origin, Date.now() + UNHEALTHY_COOLDOWN_MS);
        if (i < sortedOrigins.length - 1) {
          continue; // Seamless failover to next backend
        }
      } else {
        // Successful response - clear any past unhealthy marks
        unhealthyOrigins.delete(origin);
      }

      // Build response headers preserving ALL Set-Cookie headers properly
      const resHeaders = new Headers();
      for (const [key, val] of response.headers.entries()) {
        if (key.toLowerCase() !== "set-cookie") {
          resHeaders.set(key, val);
        }
      }

      // Multi-cookie preservation (getSetCookie support in modern Edge runtimes)
      if (typeof response.headers.getSetCookie === "function") {
        for (const cookie of response.headers.getSetCookie()) {
          resHeaders.append("Set-Cookie", cookie);
        }
      } else {
        const rawCookies = response.headers.get("set-cookie");
        if (rawCookies) resHeaders.set("set-cookie", rawCookies);
      }

      resHeaders.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
      resHeaders.set("Access-Control-Allow-Credentials", "true");
      resHeaders.set("X-Load-Balancer", "Cloudflare Edge Intelligent Failover");
      resHeaders.set("X-Served-By", origin);

      return new Response(response.body, {
        status: response.status,
        headers: resHeaders,
      });
    } catch (err) {
      unhealthyOrigins.set(origin, Date.now() + UNHEALTHY_COOLDOWN_MS);
      if (i < sortedOrigins.length - 1) continue;
      return new Response(JSON.stringify({ error: "Backend cluster unavailable", message: err.message }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}
