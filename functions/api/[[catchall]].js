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

  // 1.1 Cloudflare Edge CDN Cache Check (Tier 2: 1ms Instant Hit for Authenticated PDF streams)
  const noteStreamMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/(?:stream(?:\.pdf)?|[^/]+\.pdf)$/i);
  const isStreamRequest = request.method === "GET" && Boolean(noteStreamMatch);
  const isDownloadParam = url.searchParams.get("download") === "1";
  const cookieStr = request.headers.get("cookie") || "";
  const hasAuthCredential = Boolean(
    request.headers.get("authorization") ||
    /(?:^|;\s*)(?:fsm_token|fsm_admin_token|admin_token|token|vault_token)=/.test(cookieStr) ||
    url.searchParams.get("token") ||
    url.searchParams.get("ticket")
  );
  const edgeCache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = isStreamRequest
    ? new Request(`${url.origin}/api/notes/${noteStreamMatch[1]}/stream.pdf`, { method: "GET" })
    : null;

  // 🛡️ STRICT LOGIN GATE ("notes sabhi ko dikhein, use wahi kar paaye jo login ho"):
  // Block unauthenticated PDF read & download requests immediately at Cloudflare Pages Edge (0 Render load!)
  if (isStreamRequest && !hasAuthCredential) {
    const unauthHeaders = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": reqOrigin && isTrustedOrigin(reqOrigin) ? reqOrigin : "*",
      ...(reqOrigin && isTrustedOrigin(reqOrigin) ? { "Access-Control-Allow-Credentials": "true" } : {}),
    });
    return new Response(
      JSON.stringify({
        success: false,
        authRequired: true,
        message: "Restricted Access: Please sign in or register to read or download notes.",
      }),
      { status: 401, headers: unauthHeaders }
    );
  }

  // Serve directly from Cloudflare Edge Cache ONLY for authenticated users after verifying /access (Maintenance, Visibility & Download Locks)
  if (isStreamRequest && edgeCache && cacheKey && hasAuthCredential) {
    try {
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const noteId = noteStreamMatch[1];
        const accessHeaders = new Headers();
        for (const hName of ["authorization", "cookie", "cf-connecting-ip", "x-forwarded-for"]) {
          const val = request.headers.get(hName);
          if (val) accessHeaders.set(hName, val);
        }
        const qTok = url.searchParams.get("token");
        if (!accessHeaders.has("authorization") && qTok) {
          accessHeaders.set("Authorization", `Bearer ${qTok}`);
        }
        let accessVerified = false;
        const nowCheck = Date.now();
        const accessOrigins = [...BACKEND_ORIGINS].sort((a, b) => {
          const aDead = (unhealthyOrigins.get(a) || 0) > nowCheck;
          const bDead = (unhealthyOrigins.get(b) || 0) > nowCheck;
          if (aDead === bDead) return 0;
          return aDead ? 1 : -1;
        });
        for (const accOrigin of accessOrigins) {
          const accessUrl = new URL(`/api/notes/${encodeURIComponent(noteId)}/access`, accOrigin);
          for (const pName of ["ticket", "download", "attachment"]) {
            const val = url.searchParams.get(pName);
            if (val) accessUrl.searchParams.set(pName, val);
          }
          try {
            const ac = new AbortController();
            const tId = setTimeout(() => ac.abort(), 3000);
            const accessRes = await fetch(accessUrl.toString(), {
              method: "GET",
              headers: accessHeaders,
              redirect: "manual",
              signal: ac.signal,
            });
            clearTimeout(tId);
            if (accessRes.ok) {
              accessVerified = true;
              break;
            }
            if (accessRes.status >= 400 && accessRes.status < 500) {
              const denyHeaders = new Headers(accessRes.headers);
              denyHeaders.set("Cache-Control", "no-store");
              if (reqOrigin && isTrustedOrigin(reqOrigin)) {
                denyHeaders.set("Access-Control-Allow-Origin", reqOrigin);
                denyHeaders.set("Access-Control-Allow-Credentials", "true");
              } else {
                denyHeaders.set("Access-Control-Allow-Origin", "*");
              }
              return new Response(accessRes.body, { status: accessRes.status, headers: denyHeaders });
            }
            unhealthyOrigins.set(accOrigin, Date.now() + UNHEALTHY_COOLDOWN_MS);
          } catch (_) {
            unhealthyOrigins.set(accOrigin, Date.now() + UNHEALTHY_COOLDOWN_MS);
          }
        }
        if (!accessVerified) {
          // Do NOT bypass auth/access verification on backend timeout — fall through to full proxy failover
          throw new Error("ACCESS_CHECK_UNAVAILABLE");
        }

        const cHeaders = new Headers(cached.headers);
        cHeaders.set("CF-Cache-Status", "HIT");
        cHeaders.set("X-Edge-Cache", "HIT");
        cHeaders.set("X-Real-Source", "CLOUDFLARE_WORKER");
        cHeaders.set("X-Source-Label", "Cloudflare Global Edge CDN (1ms Cache HIT)");
        cHeaders.set("X-Data-Source", "cdn");
        cHeaders.set("Accept-Ranges", "bytes");
        if (reqOrigin && isTrustedOrigin(reqOrigin)) {
          cHeaders.set("Access-Control-Allow-Origin", reqOrigin);
          cHeaders.set("Access-Control-Allow-Credentials", "true");
        } else {
          cHeaders.set("Access-Control-Allow-Origin", "*");
        }
        if (isDownloadParam) {
          const reqFilename = url.searchParams.get("filename") || url.searchParams.get("name");
          if (reqFilename) {
            cHeaders.set("Content-Disposition", `attachment; filename="${encodeURIComponent(reqFilename)}"; filename*=UTF-8''${encodeURIComponent(reqFilename)}`);
          } else {
            const curDisp = cHeaders.get("Content-Disposition") || "";
            if (curDisp.startsWith("inline")) {
              cHeaders.set("Content-Disposition", curDisp.replace(/^inline/, "attachment"));
            }
          }
        }
        const rangeHeader = request.headers.get("Range") || request.headers.get("range");
        if (rangeHeader) {
          const buf = await cached.arrayBuffer();
          const totalSize = buf.byteLength;
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          let start = parseInt(parts[0], 10) || 0;
          let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          if (isNaN(start)) start = 0;
          if (isNaN(end) || end >= totalSize) end = totalSize - 1;
          cHeaders.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
          cHeaders.set("Content-Length", String(Math.max(0, end - start + 1)));
          return new Response(buf.slice(start, end + 1), {
            status: 206,
            headers: cHeaders,
          });
        }
        return new Response(cached.body, {
          status: 200,
          headers: cHeaders,
        });
      }
    } catch (_) {}
  }

  // 1.2 ⚡ Zero-Load Edge Catalog Cache for Public Guest Reads (/api/notes, /api/notices, /api/admin/tech-flags)
  const PUBLIC_CATALOG_PATHS = new Set([
    "/api/notes",
    "/api/notices",
    "/api/notes/branches",
    "/api/notes/subjects",
    "/api/admin/tech-flags",
  ]);
  const isCatalogPurge = (request.method === "PURGE" || url.searchParams.get("purge") === "1") && PUBLIC_CATALOG_PATHS.has(url.pathname) && Boolean(edgeCache);
  if (isCatalogPurge) {
    try {
      const cleanUrl = new URL(url.toString());
      cleanUrl.searchParams.delete("purge");
      const purgeKeys = [
        new Request(cleanUrl.origin + cleanUrl.pathname + cleanUrl.search, { method: "GET" }),
        new Request(cleanUrl.origin + cleanUrl.pathname, { method: "GET" }),
      ];
      await Promise.all(purgeKeys.map((k) => edgeCache.delete(k).catch(() => false)));
    } catch (_) {}
    if (request.method === "PURGE") {
      return new Response(JSON.stringify({ success: true, purged: url.pathname }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": reqOrigin && isTrustedOrigin(reqOrigin) ? reqOrigin : "*",
          ...(reqOrigin && isTrustedOrigin(reqOrigin) ? { "Access-Control-Allow-Credentials": "true" } : {}),
        },
      });
    }
  }
  const isPublicCatalogReq = request.method === "GET" && PUBLIC_CATALOG_PATHS.has(url.pathname) && !hasAuthCredential && url.searchParams.get("purge") !== "1" && Boolean(edgeCache);
  const catalogCacheKey = isPublicCatalogReq ? new Request(url.origin + url.pathname + url.search, { method: "GET" }) : null;
  if (isPublicCatalogReq && catalogCacheKey) {
    try {
      const cachedCatalog = await edgeCache.match(catalogCacheKey);
      if (cachedCatalog) {
        const corsExtra = reqOrigin && isTrustedOrigin(reqOrigin)
          ? { "Access-Control-Allow-Origin": reqOrigin, "Access-Control-Allow-Credentials": "true" }
          : { "Access-Control-Allow-Origin": "*" };
        const clientEtag = request.headers.get("if-none-match");
        const cachedEtag = cachedCatalog.headers.get("etag");
        if (clientEtag && cachedEtag && clientEtag === cachedEtag) {
          return new Response(null, {
            status: 304,
            headers: {
              "ETag": cachedEtag,
              "Cache-Control": cachedCatalog.headers.get("cache-control") || "public, max-age=60, s-maxage=600",
              "X-Edge-Catalog-Cache": "HIT-304",
              ...corsExtra,
            },
          });
        }
        const hitHeaders = new Headers(cachedCatalog.headers);
        hitHeaders.set("X-Edge-Catalog-Cache", "HIT");
        hitHeaders.set("CF-Cache-Status", "HIT");
        if (reqOrigin && isTrustedOrigin(reqOrigin)) {
          hitHeaders.set("Access-Control-Allow-Origin", reqOrigin);
          hitHeaders.set("Access-Control-Allow-Credentials", "true");
        } else {
          hitHeaders.set("Access-Control-Allow-Origin", "*");
        }
        return new Response(cachedCatalog.body, { status: 200, headers: hitHeaders });
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

      // Save streamed PDF document into Cloudflare Edge Cache (Tier 2)
      const isCacheablePdf =
        isStreamRequest &&
        edgeCache &&
        cacheKey &&
        response.status === 200 &&
        response.body &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/json");
      if (isCacheablePdf) {
        try {
          const cacheHeaders = new Headers(resHeaders);
          // CRITICAL: Strip Set-Cookie & Vary so Cloudflare Cache API stores the response instead of silently dropping it!
          cacheHeaders.delete("Set-Cookie");
          cacheHeaders.delete("set-cookie");
          cacheHeaders.delete("Vary");
          cacheHeaders.delete("vary");
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
            context.waitUntil(edgeCache.put(cacheKey, toCache).catch(() => {}));
          } else {
            edgeCache.put(cacheKey, toCache).catch(() => {});
          }
          return new Response(clientBody, {
            status: 200,
            headers: resHeaders,
          });
        } catch (_) {}
      }

      // Save public catalog JSON into Cloudflare Edge Cache (0 Render load on repeat guest views)
      if (isPublicCatalogReq && catalogCacheKey && response.status === 200 && response.body) {
        const respCC = (response.headers.get("cache-control") || "").toLowerCase();
        if (!respCC.includes("private") && !respCC.includes("no-store")) {
          try {
            const catHeaders = new Headers(resHeaders);
            catHeaders.delete("Set-Cookie");
            catHeaders.delete("set-cookie");
            catHeaders.delete("Vary");
            catHeaders.delete("vary");
            const edgeCC = url.pathname === "/api/admin/tech-flags"
              ? "public, max-age=15, s-maxage=15, stale-while-revalidate=60"
              : "public, max-age=60, s-maxage=600, stale-while-revalidate=1800";
            catHeaders.set("Cache-Control", edgeCC);
            catHeaders.set("X-Edge-Catalog-Cache", "HIT");
            const [clientCatBody, cacheCatBody] = response.body.tee();
            const toCacheCat = new Response(cacheCatBody, { status: 200, headers: catHeaders });
            if (typeof context.waitUntil === "function") {
              context.waitUntil(edgeCache.put(catalogCacheKey, toCacheCat).catch(() => {}));
            } else {
              edgeCache.put(catalogCacheKey, toCacheCat).catch(() => {});
            }
            resHeaders.set("X-Edge-Catalog-Cache", "MISS-SAVED");
            return new Response(clientCatBody, {
              status: 200,
              headers: resHeaders,
            });
          } catch (_) {}
        }
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
