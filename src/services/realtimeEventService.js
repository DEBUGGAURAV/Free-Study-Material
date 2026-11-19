/**
 * Real-Time Catalog Event Dispatcher
 * Dispatches Server-Sent Events (SSE) and WebSocket broadcasts
 * for instant 0ms catalog updates across all browser clients whenever
 * notes are created, deleted, or synchronized (Telegram or Web).
 */

const sseClients = new Set();
let wsBroadcaster = null;

function setWebSocketBroadcaster(broadcaster) {
  wsBroadcaster = broadcaster;
}

function registerSseClient(req, res) {
  // Set headers for standard SSE streaming with compression bypass
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // Initial connection handshake
  try {
    res.write(`data: ${JSON.stringify({ event: "connected", timestamp: Date.now() })}\n\n`);
  } catch (_) {}

  sseClients.add(res);

  // Heartbeat ping every 18 seconds to keep socket active across proxies/Cloudflare
  const pingTimer = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      clearInterval(pingTimer);
      sseClients.delete(res);
    }
  }, 18000);

  req.on("close", () => {
    clearInterval(pingTimer);
    sseClients.delete(res);
  });
}

function broadcastCatalogEvent(payload) {
  if (!payload || !payload.event) return;

  const enriched = {
    ...payload,
    timestamp: Date.now(),
  };

  const dataStr = `data: ${JSON.stringify(enriched)}\n\n`;

  // 1. Broadcast to all active SSE browser clients
  for (const client of sseClients) {
    try {
      client.write(dataStr);
    } catch (_) {
      sseClients.delete(client);
    }
  }

  // 2. Broadcast to WebSocket clients if connected
  if (typeof wsBroadcaster === "function") {
    try {
      wsBroadcaster({
        type: "CATALOG_EVENT",
        ...enriched,
      });
    } catch (_) {}
  }

  console.log(`[REALTIME EVENT] 📡 Broadcast "${payload.event}" to ${sseClients.size} live web client(s).`);
}

function getConnectedClientsCount() {
  return sseClients.size;
}

module.exports = {
  registerSseClient,
  broadcastCatalogEvent,
  setWebSocketBroadcaster,
  getConnectedClientsCount,
};
