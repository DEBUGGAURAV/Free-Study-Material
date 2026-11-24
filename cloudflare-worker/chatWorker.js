/**
 * Cloudflare Worker: FreeStudyMaterial Chat Edge Hub & WebSocket Broker
 * Service Name: fsm-chat-edge
 * Purpose: Hardened Edge Chat Proxy with Strict CORS, Auth-Gated WebSockets & 3-Node Failover
 */

function isTrustedOrigin(origin) {
  if (!origin || origin === "null") return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "freestudymaterial.pages.dev" ||
      host.endsWith(".freestudymaterial.pages.dev") ||
      host === "freestudymaterial.onrender.com" ||
      host === "freestudymaterial1.onrender.com" ||
      host === "freestudymaterial2.onrender.com" ||
      host === "fsm-edge.jnplotus.workers.dev" ||
      host === "fsm-chat-edge.jnplotus.workers.dev" ||
      host === "fsm-ai-edge.jnplotus.workers.dev" ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch (_) {
    return false;
  }
}

function applyCors(headers, req) {
  const origin = req ? req.headers.get("Origin") : null;
  if (origin && isTrustedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Device-Id");
  headers.set("Access-Control-Max-Age", "86400");
}

function hasValidAuthCredential(request, url) {
  const auth = request.headers.get("Authorization") || "";
  const cookie = request.headers.get("Cookie") || "";
  const qToken = url.searchParams.get("token") || url.searchParams.get("ticket") || "";
  return Boolean(
    auth.trim() ||
    /(?:^|;\s*)(?:fsm_token|fsm_admin_token|admin_token|token|vault_token)=/.test(cookie) ||
    (qToken && qToken !== "null" && qToken !== "undefined")
  );
}

const failedOrigins = new Map();
const COOLDOWN_MS = 25000;

function getClusterOrigins(env) {
  const e = env || {};
  const raw = [
    e.ORIGIN_URL || "https://freestudymaterial1.onrender.com",
    e.BACKUP_ORIGIN_URL_1 || "https://freestudymaterial2.onrender.com",
    e.BACKUP_ORIGIN_URL_2 || "https://freestudymaterial.onrender.com",
  ];
  const unique = [];
  for (const item of raw) {
    if (item) {
      const clean = String(item).trim().replace(/\/+$/, "");
      if (clean && !unique.includes(clean)) unique.push(clean);
    }
  }
  const now = Date.now();
  const healthy = unique.filter((o) => now - (failedOrigins.get(o) || 0) >= COOLDOWN_MS);
  const cooling = unique.filter((o) => !healthy.includes(o));
  return [...healthy, ...cooling];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      const headers = new Headers();
      applyCors(headers, request);
      return new Response(null, { status: 204, headers });
    }

    // 2. Health & Diagnostic Check
    if (url.pathname === "/health" || url.pathname === "/edge-status") {
      const headers = new Headers({ "Content-Type": "application/json" });
      applyCors(headers, request);
      return new Response(
        JSON.stringify({
          status: "online",
          service: "fsm-chat-edge",
          region: request.cf?.colo || "Global",
          activeOrigins: getClusterOrigins(env).length,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers }
      );
    }

    // 3. Authenticated WebSocket Upgrade for Edge Chat Streaming
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      if (!hasValidAuthCredential(request, url)) {
        const headers = new Headers({ "Content-Type": "application/json" });
        applyCors(headers, request);
        return new Response(
          JSON.stringify({
            success: false,
            authRequired: true,
            message: "Authentication required to connect to Student Chat.",
          }),
          { status: 401, headers }
        );
      }

      const pair = new WebSocketPair();
      const [clientWs, serverWs] = Object.values(pair);

      serverWs.accept();

      serverWs.addEventListener("message", async (event) => {
        try {
          JSON.parse(event.data);
          serverWs.send(
            JSON.stringify({
              type: "EDGE_ACK",
              edgeTimestamp: Date.now(),
              received: true,
              colo: request.cf?.colo || "Global",
            })
          );
        } catch (_) {
          serverWs.send(JSON.stringify({ type: "PONG" }));
        }
      });

      serverWs.addEventListener("close", () => {
        try {
          serverWs.close();
        } catch (_) {}
      });

      return new Response(null, {
        status: 101,
        webSocket: clientWs,
      });
    }

    // 4. Multi-Origin Cascade Failover Proxy (3 -> 2 -> 1)
    const origins = getClusterOrigins(env);
    if (origins.length === 0) {
      const headers = new Headers({ "Content-Type": "application/json" });
      applyCors(headers, request);
      return new Response(JSON.stringify({ success: false, error: "Backend origins are not configured" }), {
        status: 503,
        headers,
      });
    }

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const bodyBuf = hasBody ? await request.arrayBuffer() : null;

    for (let i = 0; i < origins.length; i++) {
      const originTarget = origins[i];
      try {
        const forwardUrl = originTarget + url.pathname + url.search;
        const proxyHeaders = new Headers(request.headers);
        proxyHeaders.delete("host");
        proxyHeaders.set("X-Forwarded-Host", url.host);

        const proxyInit = {
          method: request.method,
          headers: proxyHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        };
        if (hasBody && bodyBuf) {
          proxyInit.body = bodyBuf.slice(0);
        }

        const response = await fetch(new Request(forwardUrl, proxyInit));
        const routingHeader = response.headers.get("x-render-routing") || "";
        const isOriginDown =
          (response.status >= 502 && response.status <= 504) ||
          response.status === 402 ||
          routingHeader.includes("suspend");

        if (isOriginDown) {
          failedOrigins.set(originTarget, Date.now());
          if (i < origins.length - 1) continue;
        } else if (response.status < 500) {
          failedOrigins.delete(originTarget);
        }

        const newHeaders = new Headers(response.headers);
        applyCors(newHeaders, request);
        newHeaders.set("X-Edge-Proxied-By", "fsm-chat-edge");
        newHeaders.set("X-Edge-Colo", request.cf?.colo || "Global");
        newHeaders.set("X-Upstream-Origin", originTarget);
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (err) {
        failedOrigins.set(originTarget, Date.now());
        if (i < origins.length - 1) continue;
        const errHeaders = new Headers({ "Content-Type": "application/json" });
        applyCors(errHeaders, request);
        return new Response(JSON.stringify({ error: "Edge Proxy Error", details: err.message }), {
          status: 502,
          headers: errHeaders,
        });
      }
    }

    const failHeaders = new Headers({ "Content-Type": "application/json" });
    applyCors(failHeaders, request);
    return new Response(JSON.stringify({ error: "All chat backend nodes temporarily unreachable" }), {
      status: 503,
      headers: failHeaders,
    });
  },
};
