/**
 * Cloudflare Worker: FreeStudyMaterial Chat Edge Hub & WebSocket Broker
 * Service Name: fsm-chat-edge
 * Purpose: 0% Render Load - Direct Edge WebSockets & Rapid Chat Ingestion
 */

function applyCors(headers, req) {
  const origin = req.headers.get("Origin") || "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");
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
          renderLoadBypassed: true,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers }
      );
    }

    // 3. WebSocket Upgrade for Edge Chat Streaming (0% Render Load)
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [clientWs, serverWs] = Object.values(pair);

      serverWs.accept();

      serverWs.addEventListener("message", async (event) => {
        try {
          const data = JSON.parse(event.data);
          // Broadcast echo back to client with edge timestamp
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

    // 4. Default: Forward chat requests to Render backend origin
    const originTarget = (env.ORIGIN_URL || env.BACKUP_ORIGIN_URL_1 || "").replace(/\/+$/, "");
    if (!originTarget) {
      const headers = new Headers({ "Content-Type": "application/json" });
      applyCors(headers, request);
      return new Response(JSON.stringify({ success: false, error: "Backend origin is not configured" }), {
        status: 503,
        headers,
      });
    }
    const forwardUrl = originTarget + url.pathname + url.search;

    const proxyRequest = new Request(forwardUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(proxyRequest);
      const newHeaders = new Headers(response.headers);
      applyCors(newHeaders, request);
      newHeaders.set("X-Edge-Proxied-By", "fsm-chat-edge");
      newHeaders.set("X-Edge-Colo", request.cf?.colo || "Global");
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Edge Proxy Error", details: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
