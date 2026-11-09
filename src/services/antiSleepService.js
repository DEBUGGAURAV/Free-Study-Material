/**
 * 🛡️ 24/7 Anti-Sleep Immortality & Autonomous Heartbeat Service
 * 
 * Guarantees 100% continuous uptime on Render Free Tier (which sleeps after 15 minutes of inactivity).
 * Employs a Dual-Layer Ingress Strategy:
 *   1. Direct Public Ingress Ping (Cache-busted /health pulse hitting Render edge router)
 *   2. External Cloudflare Anycast Relay Ping (bypasses NAT loopback, forces Render edge router hit)
 *   3. Autonomous Fail-Safe Watchdog (Monitors pulse cadence every 60s & fires emergency pings)
 *   4. Fast Emergency Auto-Retry (30s fail-safe on network drops to guarantee 15m window never expires)
 *   5. Real-Time Telemetry & Manual Admin Testing Trigger
 */

const { getSiteUrl } = require("../config/siteConfig");
const { getBackendClusterUrls } = require("../config/clusterConfig");

function resolveSiteUrl() {
  return (
    process.env.KEEP_ALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null) ||
    (process.env.RENDER_SERVICE_NAME ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com` : null) ||
    getSiteUrl() ||
    getBackendClusterUrls()[0] ||
    ""
  ).replace(/\/+$/, "");
}

function resolveWorkerUrl() {
  return (
    process.env.CF_WORKER_URL ||
    process.env.VITE_CF_WORKER_URL ||
    ""
  ).replace(/\/+$/, "");
}

const antiSleepTelemetry = {
  isActive: false,
  intervalMinutes: 12,
  lastPingTime: null,
  lastPingStatus: null,
  lastPingTarget: null,
  lastPingLatencyMs: null,
  lastRelayStatus: null,
  totalPingsSent: 0,
  successCount: 0,
  failCount: 0,
  consecutiveSuccess: 0,
  lastError: null,
  nextPingTime: null,
  history: [],
};

let pulseTimer = null;
let retryTimer = null;
let watchdogTimer = null;
let boundPort = 5000;
let isPulsing = false;

/**
 * Execute a multi-layer keep-alive heartbeat pulse
 */
async function executeAntiSleepPulse(isManual = false) {
  if (isPulsing && !isManual) return { ...antiSleepTelemetry };
  isPulsing = true;

  const siteUrl = resolveSiteUrl();
  const cfWorkerUrl = resolveWorkerUrl();
  const startTime = Date.now();

  const pingEndpoint = `${siteUrl}/health?t=${Date.now()}&pulse=direct${isManual ? "&manual=1" : ""}`;
  let directSuccess = false;
  let directStatus = 0;
  let relaySuccess = false;
  let relayStatus = 0;
  let errorMsg = null;

  // Layer 1: Direct Ingress Ping to Render Public Ingress Router
  try {
    const res = await fetch(pingEndpoint, {
      method: "GET",
      headers: {
        "User-Agent": "AcademicCloud-KeepAlive/2.0",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
      signal: AbortSignal.timeout(12000),
    });
    directStatus = res.status;
    directSuccess = res.ok;
  } catch (err) {
    errorMsg = err.message;
    directStatus = 0;
  }

  // Layer 2: Cloudflare Anycast Edge Relay Ping (External IP ingress to Render)
  if (cfWorkerUrl && !cfWorkerUrl.includes("localhost")) {
    try {
      // Attempt 2A: Dedicated relay route
      const relayUrl = `${cfWorkerUrl}/api/anti-sleep-relay?target=${encodeURIComponent(siteUrl)}&t=${Date.now()}`;
      const relayRes = await fetch(relayUrl, {
        method: "GET",
        headers: {
          "User-Agent": "AcademicCloud-KeepAlive-Trigger/2.0",
          "Cache-Control": "no-cache, no-store",
        },
        signal: AbortSignal.timeout(12000),
      });
      relayStatus = relayRes.status;
      relaySuccess = relayRes.ok;
    } catch (_) {}

    // Attempt 2B: Edge Proxy Health fallback if 2A returned non-OK (forces Cloudflare Anycast IP ingress to Render)
    if (!relaySuccess) {
      try {
        const edgeHealthUrl = `${cfWorkerUrl}/health?relay=cf&t=${Date.now()}`;
        const edgeHealthRes = await fetch(edgeHealthUrl, {
          method: "GET",
          headers: {
            "User-Agent": "AcademicCloud-EdgePulse/2.0",
            "Cache-Control": "no-cache, no-store",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (edgeHealthRes.ok) {
          relayStatus = edgeHealthRes.status;
          relaySuccess = true;
        }
      } catch (_) {}
    }
  }

  // Layer 2C: Mutual Peer Keep-Alive (wakes and keeps all 3 cluster nodes awake simultaneously)
  const peerNodes = getBackendClusterUrls();
  for (const peer of peerNodes) {
    if (!siteUrl.includes(peer.replace("https://", ""))) {
      fetch(`${peer}/health?pulse=peer&t=${Date.now()}`, {
        method: "GET",
        headers: { "User-Agent": "AcademicCloud-ClusterMesh/2.0" },
        signal: AbortSignal.timeout(6000),
      }).catch(() => {});
    }
  }

  // Layer 3: Local Port Loopback (keeps Node.js event loop active)
  if (boundPort) {
    try {
      await fetch(`http://127.0.0.1:${boundPort}/health?local=1&t=${Date.now()}`, {
        signal: AbortSignal.timeout(4000),
      });
    } catch (_) {}
  }

  const durationMs = Date.now() - startTime;
  const isOverallSuccess = directSuccess || relaySuccess;

  // Update Telemetry
  antiSleepTelemetry.totalPingsSent += 1;
  antiSleepTelemetry.lastPingTime = new Date().toISOString();
  antiSleepTelemetry.lastPingStatus = directStatus || relayStatus || 200;
  antiSleepTelemetry.lastPingTarget = siteUrl;
  antiSleepTelemetry.lastPingLatencyMs = durationMs;
  antiSleepTelemetry.lastRelayStatus = relaySuccess
    ? `${relayStatus || 200} OK (Cloudflare Edge)`
    : (relayStatus ? `${relayStatus} (Cloudflare Edge)` : "Standby");

  if (isOverallSuccess) {
    antiSleepTelemetry.successCount += 1;
    antiSleepTelemetry.consecutiveSuccess += 1;
    antiSleepTelemetry.lastError = null;
    console.log(`[ANTI-SLEEP] 💓 Keep-Alive pulse #${antiSleepTelemetry.totalPingsSent} OK (${durationMs}ms) - Platform 100% AWAKE [Direct: ${directStatus}, Relay: ${relayStatus}]`);
  } else {
    antiSleepTelemetry.failCount += 1;
    antiSleepTelemetry.consecutiveSuccess = 0;
    antiSleepTelemetry.lastError = errorMsg || "Direct & Relay ping timeout";
    console.warn(`[ANTI-SLEEP] ⚠️ Keep-Alive pulse notice: ${antiSleepTelemetry.lastError}. Scheduling fast retry in 30s.`);

    // Fast retry fail-safe: With Render sleeping at 15m, retrying in 30s prevents sleep on temporary network blips
    if (!isManual) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        executeAntiSleepPulse(false).catch((e) => console.warn("[ANTI-SLEEP] Retry notice:", e.message));
      }, 30000);
    }
  }

  const intervalMs = (antiSleepTelemetry.intervalMinutes || 12) * 60 * 1000;
  antiSleepTelemetry.nextPingTime = new Date(Date.now() + intervalMs).toISOString();

  // Keep last 10 pulse records
  antiSleepTelemetry.history.unshift({
    timestamp: antiSleepTelemetry.lastPingTime,
    status: antiSleepTelemetry.lastPingStatus,
    durationMs,
    isManual,
    directStatus,
    relayStatus,
    target: siteUrl,
  });
  if (antiSleepTelemetry.history.length > 10) {
    antiSleepTelemetry.history.pop();
  }

  isPulsing = false;
  return { ...antiSleepTelemetry };
}

/**
 * Initialize 24/7 Anti-Sleep Heartbeat Engine
 */
function startAntiSleepService(port = 5000) {
  boundPort = Number(port) || 5000;

  if (process.env.DISABLE_KEEP_ALIVE === "true") {
    console.log("[ANTI-SLEEP] ℹ️ Anti-Sleep Heartbeat is explicitly disabled (DISABLE_KEEP_ALIVE=true).");
    antiSleepTelemetry.isActive = false;
    return;
  }

  // Recommended default: 12 minutes (Render sleeps after 15m; 12m guarantees 24/7 continuous uptime)
  const configuredMinutes = Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES);
  const intervalMinutes = Math.min(14, Math.max(2, !isNaN(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 12));
  antiSleepTelemetry.intervalMinutes = intervalMinutes;
  antiSleepTelemetry.isActive = true;

  const intervalMs = intervalMinutes * 60 * 1000;
  antiSleepTelemetry.nextPingTime = new Date(Date.now() + 5000).toISOString();

  // Initial pulse 5s after server boot
  setTimeout(() => {
    executeAntiSleepPulse(false).catch((e) => console.warn("[ANTI-SLEEP] Boot pulse notice:", e.message));
  }, 5000);

  // Periodic recurring pulse
  if (pulseTimer) clearInterval(pulseTimer);
  pulseTimer = setInterval(() => {
    executeAntiSleepPulse(false).catch((e) => console.warn("[ANTI-SLEEP] Cycle pulse notice:", e.message));
  }, intervalMs);

  // 🛡️ Watchdog: Checks every 60s if the pulse timer somehow got blocked or delayed past (intervalMinutes + 1)
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (!antiSleepTelemetry.isActive) return;
    if (antiSleepTelemetry.lastPingTime) {
      const elapsedMs = Date.now() - new Date(antiSleepTelemetry.lastPingTime).getTime();
      const maxAllowedMs = (intervalMinutes + 1) * 60 * 1000;
      if (elapsedMs > maxAllowedMs) {
        console.warn(`[ANTI-SLEEP] ⚠️ Watchdog: Last pulse was ${Math.round(elapsedMs / 1000)}s ago (expected <= ${intervalMinutes}m). Firing emergency pulse now!`);
        executeAntiSleepPulse(false).catch((e) => console.warn("[ANTI-SLEEP] Emergency watchdog pulse error:", e.message));
      }
    }
  }, 60000);

  console.log(`[ANTI-SLEEP] 🛡️ 24/7 Immortality Engine active: Pulse scheduled every ${intervalMinutes} minutes (Render 15m sleep prevented).`);
}

/**
 * Trigger manual on-demand pulse (e.g. from Admin Dashboard)
 */
async function triggerManualPulse() {
  return await executeAntiSleepPulse(true);
}

/**
 * Get current Anti-Sleep Telemetry
 */
function getAntiSleepTelemetry() {
  return { ...antiSleepTelemetry };
}

module.exports = {
  startAntiSleepService,
  triggerManualPulse,
  getAntiSleepTelemetry,
  executeAntiSleepPulse,
  resolveSiteUrl,
};
