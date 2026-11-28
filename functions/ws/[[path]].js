/**
 * Cloudflare Pages Edge Function: Native WebSocket Passthrough Proxy (/ws/*)
 * Proxies wss://freestudymaterial.pages.dev/ws/chat to the sticky primary Render backend
 * with automatic failover so all connected students share the same live WebSocket broker.
 */

const WS_BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com", // Primary live chat broker (Node #1)
  "https://freestudymaterial2.onrender.com", // Failover live chat broker (Node #2)
  "https://freestudymaterial.onrender.com",  // Failover live chat broker (Node #3)
];

const unhealthyWsOrigins = new Map();
const WS_COOLDOWN_MS = 30000;

function isTrustedWsOrigin(origin) {
  if (!origin || origin === "null") return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "freestudymaterial.pages.dev" ||
      host.endsWith(".freestudymaterial.pages.dev") ||
      host === "freestudymaterial.onrender.com" ||
      host === "freestudymaterial1.onrender.com" ||
      host === "freestudymaterial2.onrender.com" ||
      host === "fsm-chat-edge.jnplotus.workers.dev" ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch (_) {
    return false;
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
  const reqOrigin = request.headers.get("Origin");

  if (reqOrigin && !isTrustedWsOrigin(reqOrigin)) {
    return new Response(JSON.stringify({ success: false, message: "Forbidden WebSocket origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (upgrade !== "websocket") {
    return new Response(JSON.stringify({ success: false, message: "Expected WebSocket upgrade" }), {
      status: 426,
      headers: { "Content-Type": "application/json", "Upgrade": "websocket", "Cache-Control": "no-store" },
    });
  }

  const now = Date.now();
  const sortedOrigins = [...WS_BACKEND_ORIGINS].sort((a, b) => {
    const aDead = (unhealthyWsOrigins.get(a) || 0) > now;
    const bDead = (unhealthyWsOrigins.get(b) || 0) > now;
    if (aDead === bDead) return 0;
    return aDead ? 1 : -1;
  });

  for (let i = 0; i < sortedOrigins.length; i++) {
    const origin = sortedOrigins[i];
    try {
      const targetUrl = new URL(url.pathname + url.search, origin);
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-Proto", "https");

      const upstreamRes = await fetch(
        new Request(targetUrl.toString(), {
          method: request.method,
          headers,
        })
      );

      if (upstreamRes.status === 101 || upstreamRes.webSocket) {
        unhealthyWsOrigins.delete(origin);
        return upstreamRes;
      }

      if (upstreamRes.status >= 500 && i < sortedOrigins.length - 1) {
        unhealthyWsOrigins.set(origin, Date.now() + WS_COOLDOWN_MS);
        continue;
      }

      return upstreamRes;
    } catch (_) {
      unhealthyWsOrigins.set(origin, Date.now() + WS_COOLDOWN_MS);
      if (i < sortedOrigins.length - 1) continue;
    }
  }

  return new Response(JSON.stringify({ success: false, message: "Live chat server is reconnecting. Please retry." }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
