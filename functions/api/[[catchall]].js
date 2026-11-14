/**
 * Cloudflare Pages Edge Function: Zero-Lag Universal API Proxy & Intelligent Load Balancer
 * Handles GET, POST, PUT, DELETE, OPTIONS, PATCH for /api/* without 405 errors.
 * Multi-Origin Failover with 60s dynamic health circuit-breaker and sub-second failover.
 */

const BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com",  // Active Healthy Node #1
  "https://freestudymaterial2.onrender.com",  // Active Healthy Node #2
  "https://freestudymaterial.onrender.com",   // Node #3
];

// Circuit Breaker: Cache unhealthy origins for 60s to avoid 2-5s retry lag on dead backends
const unhealthyOrigins = new Map();
const UNHEALTHY_COOLDOWN_MS = 60000;

const TRUSTED_ORIGINS = new Set([
  "https://freestudymaterial.pages.dev",
  "https://freestudymaterial.onrender.com",
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
  "https://fsm-edge.jnplotus.workers.dev",
]);

function isTrustedOrigin(origin) {
  if (!origin || origin === "null") return false;
  if (TRUSTED_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "freestudymaterial.pages.dev" ||
      host === "freestudymaterial.onrender.com" ||
      host === "freestudymaterial1.onrender.com" ||
      host === "freestudymaterial2.onrender.com" ||
      host === "fsm-edge.jnplotus.workers.dev" ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return true;
    }
  } catch (_) {}
  return false;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. Handle CORS Preflight OPTIONS
  const reqOrigin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    const corsHeaders = {
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Cache-Control, X-Admin-Bypass, X-Cluster-Sync, X-Direct-Origin, Range",
      "Access-Control-Max-Age": "86400",
    };
    if (reqOrigin && isTrustedOrigin(reqOrigin)) {
      corsHeaders["Access-Control-Allow-Origin"] = reqOrigin;
      corsHeaders["Access-Control-Allow-Credentials"] = "true";
    } else {
      corsHeaders["Access-Control-Allow-Origin"] = "*";
    }
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 1.1 Cloudflare Edge CDN Cache Check (Tier 2: 1ms Instant Hit for PDF streams)
  const isStreamRequest = request.method === "GET" && url.pathname.includes("/stream");
  const edgeCache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = isStreamRequest ? new Request(url.origin + url.pathname, { method: "GET" }) : null;

  if (isStreamRequest && edgeCache && cacheKey) {
    try {
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const cHeaders = new Headers(cached.headers);
        cHeaders.set("CF-Cache-Status", "HIT");
        cHeaders.set("X-Edge-Cache", "HIT");
        cHeaders.set("X-Real-Source", "CLOUDFLARE_WORKER");
        cHeaders.set("X-Data-Source", "cdn");
        if (reqOrigin && isTrustedOrigin(reqOrigin)) {
          cHeaders.set("Access-Control-Allow-Origin", reqOrigin);
          cHeaders.set("Access-Control-Allow-Credentials", "true");
        } else {
          cHeaders.set("Access-Control-Allow-Origin", "*");
        }
        return new Response(cached.body, {
          status: cached.status,
          headers: cHeaders,
        });
      }
    } catch (_) {}
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
      reqHeaders.set("Connection", "keep-alive");

      // Set 22-second subrequest timeout to safely accommodate Render container spin-ups
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);

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
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const isServerDown =
        (response.status >= 500 && response.status <= 504) ||
        (response.status >= 520 && response.status <= 526) ||
        response.status === 402 ||
        response.headers.get("x-node-disabled") === "true" ||
        (contentType.includes("text/html") && url.pathname.startsWith("/api/"));

      if (isServerDown) {
        unhealthyOrigins.set(origin, Date.now() + UNHEALTHY_COOLDOWN_MS);
        if (i < sortedOrigins.length - 1) {
          continue; // Seamless failover to next backend
        }
        // If all backends failed or last one is down/HTML/suspended -> NEVER return raw HTML to an /api/* endpoint!
        const isTrusted = reqOrigin && isTrustedOrigin(reqOrigin);
        return new Response(
          JSON.stringify({
            success: false,
            error: "CLUSTER_WAKING_UP",
            message: "Cloud cluster node is spinning up. Please click refresh.",
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": isTrusted ? reqOrigin : "*",
              ...(isTrusted ? { "Access-Control-Allow-Credentials": "true" } : {}),
            },
          }
        );
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

      if (reqOrigin && isTrustedOrigin(reqOrigin)) {
        resHeaders.set("Access-Control-Allow-Origin", reqOrigin);
        resHeaders.set("Access-Control-Allow-Credentials", "true");
      } else {
        resHeaders.set("Access-Control-Allow-Origin", "*");
      }
      resHeaders.set("X-Load-Balancer", "Cloudflare Edge Intelligent Failover");
      resHeaders.set("X-Served-By", origin);

      // Save streamed document into Cloudflare Edge Cache (Tier 2)
      if (isStreamRequest && edgeCache && cacheKey && response.status === 200 && response.body) {
        try {
          const cacheHeaders = new Headers(resHeaders);
          cacheHeaders.set("Cache-Control", "public, max-age=604800, s-maxage=604800, immutable");
          cacheHeaders.set("CF-Cache-Status", "HIT");
          cacheHeaders.set("X-Edge-Cache", "HIT");
          cacheHeaders.set("X-Real-Source", "CLOUDFLARE_WORKER");
          cacheHeaders.set("X-Data-Source", "cdn");
          const [clientBody, cacheBody] = response.body.tee();
          const toCache = new Response(cacheBody, {
            status: 200,
            headers: cacheHeaders,
          });
          if (typeof context.waitUntil === "function") {
            context.waitUntil(edgeCache.put(cacheKey, toCache));
          } else {
            edgeCache.put(cacheKey, toCache).catch(() => {});
          }
          return new Response(clientBody, {
            status: 200,
            headers: resHeaders,
          });
        } catch (_) {}
      }

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
