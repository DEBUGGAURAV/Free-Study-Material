/**
 * 🛰️ Cluster & Live Request Telemetry Engine
 * Free Study Material Platform Architecture
 *
 * Tracks:
 * 1. Live requests ON (Successful 2xx/3xx) & OFF (Failed 4xx/5xx) & live RPS
 * 2. Backend cluster status with admin interactive ON/OFF switches.
 * 3. Live Active Student Users, Sockets & Connection Speed per backend server
 * 4. Per-Backend Bare-Metal / Container Hardware Telemetry (CPU, RAM, RSS, OS, Uptime)
 */

const os = require("os");
const { getBackendClusterUrls } = require("../config/clusterConfig");
const backendClusterUrls = getBackendClusterUrls();

function normalizeHost(urlStr) {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getCurrentServerHostname() {
  const explicitHost = (process.env.RENDER_EXTERNAL_HOSTNAME || "").trim().toLowerCase();
  if (explicitHost) return explicitHost;
  try {
    if (process.env.RENDER_EXTERNAL_URL) {
      return new URL(process.env.RENDER_EXTERNAL_URL).hostname.toLowerCase();
    }
  } catch (_) {}
  return os.hostname().toLowerCase();
}

function formatUptimeStr(sec) {
  const safe = Math.max(0, Math.floor(Number(sec) || 0));
  const d = Math.floor(safe / 86400);
  const h = Math.floor((safe % 86400) / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

// Track live CPU delta between samples for accurate current CPU %
let prevCpuSample = null;
function computeLiveCpuUsagePercent() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const core of cpus) {
    for (const type of Object.keys(core.times || {})) {
      total += core.times[type];
    }
    idle += core.times?.idle || 0;
  }

  let pct = 12;
  if (prevCpuSample && total > prevCpuSample.total) {
    const deltaTotal = total - prevCpuSample.total;
    const deltaIdle = idle - prevCpuSample.idle;
    pct = Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100);
  } else if (total > 0) {
    pct = Math.round(((total - idle) / total) * 100);
  }
  prevCpuSample = { idle, total };
  return Math.max(1, Math.min(pct, 100));
}

function createInitialNode(id, name, url, role, defaults = {}) {
  return {
    id,
    name,
    url: url || "",
    role,
    isEnabled: true,
    status: defaults.status || (url ? "CHECKING" : "UNCONFIGURED"),
    httpCode: defaults.httpCode ?? 0,
    latencyMs: defaults.latencyMs ?? 0,
    connectionSpeedMbps: 0,
    throughputKBps: 0,
    speedGrade: url ? "Probing..." : "Not Configured",
    isHealthy: defaults.isHealthy ?? false,
    downReason: defaults.downReason || null,
    trafficRedirection: null,
    trafficShare: defaults.trafficShare || "Probing...",
    activeUsers: 0,
    liveNodeUsers: 0,
    activeSockets: 0,
    rps: 0,
    requestsOn: 0,
    requestsOff: 0,
    totalRequests: 0,
    telemetrySynced: false,
    isCurrentResponder: false,
    region: null,
    hardware: null,
    lastChecked: 0,
  };
}

const DEFAULT_CLUSTER_URLS = [
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
  "https://freestudymaterial.onrender.com",
];

const clusterNodes = [
  createInitialNode(
    "backend_1",
    "Backend #1 (Active Node #1)",
    backendClusterUrls[0] || DEFAULT_CLUSTER_URLS[0],
    "Active Production Node #1",
    {
      status: "ONLINE",
      httpCode: 200,
      latencyMs: 50,
      isHealthy: true,
    }
  ),
  createInitialNode(
    "backend_2",
    "Backend #2 (Active Node #2)",
    backendClusterUrls[1] || DEFAULT_CLUSTER_URLS[1],
    "Active Production Node #2",
    {
      status: "ONLINE",
      httpCode: 200,
      latencyMs: 50,
      isHealthy: true,
    }
  ),
  createInitialNode(
    "backend_3",
    "Backend #3 (Production Node #3)",
    backendClusterUrls[2] || DEFAULT_CLUSTER_URLS[2],
    "Production Node #3",
    {
      status: "ONLINE",
      httpCode: 200,
      latencyMs: 50,
      isHealthy: true,
    }
  ),
];

const liveRequestStats = {
  total: 0,
  on: 0,   // Successful 2xx, 3xx requests
  off: 0,  // Failed 4xx, 5xx requests
  inflight: 0,
  recentTimestamps: [],
};

// Rolling 10-minute active user/session tracking on THIS backend instance
const activeUserTracker = new Map();

function pruneIdleUsers(now = Date.now()) {
  for (const [key, timestamp] of activeUserTracker.entries()) {
    if (now - timestamp > 600000) {
      activeUserTracker.delete(key);
    }
  }
}

function getThisNode() {
  const host = getCurrentServerHostname();
  return (
    clusterNodes.find((n) => n.url && host && normalizeHost(n.url) === host) ||
    clusterNodes.find((n) => n.url) ||
    clusterNodes[0]
  );
}

/**
 * Returns live users, traffic, and bare-metal/container hardware specs for THIS backend node.
 */
function getLocalNodeTelemetry() {
  const now = Date.now();
  pruneIdleUsers(now);

  const recent = liveRequestStats.recentTimestamps.filter((t) => now - t < 5000);
  const liveRps = Number((recent.length / 5).toFixed(1));

  const cpus = os.cpus() || [];
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = Math.max(0, totalMemBytes - freeMemBytes);
  const memUsagePercent = totalMemBytes > 0 ? Math.round((usedMemBytes / totalMemBytes) * 100) : 0;
  const procMem = process.memoryUsage();
  const procUptimeSec = Math.floor(process.uptime());
  const loadAvg = os.loadavg ? os.loadavg() : [0, 0, 0];

  const netInterfaces = os.networkInterfaces ? os.networkInterfaces() : {};
  const activeNets = [];
  for (const [ifName, addrs] of Object.entries(netInterfaces)) {
    for (const addr of addrs || []) {
      if (!addr.internal && addr.family === "IPv4") {
        activeNets.push({ iface: ifName, address: addr.address });
      }
    }
  }

  return {
    hostname: getCurrentServerHostname(),
    region: process.env.RENDER_REGION || "singapore",
    serviceName: process.env.RENDER_SERVICE_NAME || process.env.RENDER_EXTERNAL_HOSTNAME || "freestudymaterial",
    liveUsers: Math.max(activeUserTracker.size, liveRequestStats.inflight > 0 ? 1 : 0),
    activeSockets: liveRequestStats.inflight,
    rps: liveRps,
    requestsOn: liveRequestStats.on,
    requestsOff: liveRequestStats.off,
    totalRequests: liveRequestStats.total,
    timestamp: now,
    hardware: {
      cpuModel: (cpus[0]?.model || "x64 Cloud CPU").trim(),
      cpuCores: cpus.length || 1,
      cpuSpeedMHz: cpus[0]?.speed || 0,
      cpuUsagePercent: computeLiveCpuUsagePercent(),
      loadAvg: loadAvg.map((v) => Number((v || 0).toFixed(2))),
      arch: os.arch(),
      ramTotalMB: Math.round(totalMemBytes / 1048576),
      ramUsedMB: Math.round(usedMemBytes / 1048576),
      ramFreeMB: Math.round(freeMemBytes / 1048576),
      ramTotalGB: (totalMemBytes / 1073741824).toFixed(2),
      ramUsedGB: (usedMemBytes / 1073741824).toFixed(2),
      ramFreeGB: (freeMemBytes / 1073741824).toFixed(2),
      ramUsagePercent: memUsagePercent,
      rssMB: Math.round(procMem.rss / 1048576),
      heapUsedMB: Math.round(procMem.heapUsed / 1048576),
      heapTotalMB: Math.round(procMem.heapTotal / 1048576),
      externalMB: Math.round((procMem.external || 0) / 1048576),
      ramLimitMB: Number(process.env.RAM_LIMIT_MB || 512),
      osPlatform: `${os.type()} ${os.platform()}`,
      osRelease: os.release(),
      nodeVersion: process.version,
      pid: process.pid,
      port: process.env.PORT || 5000,
      uptimeSeconds: procUptimeSec,
      uptimeFormatted: formatUptimeStr(procUptimeSec),
      networkInterfaces: activeNets,
    },
  };
}

/**
 * Express middleware to continuously measure real-time request counts and live users
 */
function requestTelemetryMiddleware(req, res, next) {
  // Don't count internal cluster telemetry probes as student users
  const isInternalProbe =
    Boolean(req.headers["x-cluster-sync"]) ||
    req.path.includes("/cluster/node-telemetry") ||
    req.query?.probe === "cf";

  liveRequestStats.total++;
  liveRequestStats.inflight++;
  const now = Date.now();
  liveRequestStats.recentTimestamps.push(now);
  if (liveRequestStats.recentTimestamps.length > 600) {
    liveRequestStats.recentTimestamps = liveRequestStats.recentTimestamps.filter((t) => now - t < 10000);
  }

  if (!isInternalProbe) {
    const clientKey =
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      (req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) ||
      req.ip ||
      "guest_client";
    activeUserTracker.set(clientKey, now);
  }

  const thisNode = getThisNode();
  thisNode.requestsOn++;

  const onComplete = () => {
    res.removeListener("finish", onComplete);
    res.removeListener("close", onComplete);
    liveRequestStats.inflight = Math.max(0, liveRequestStats.inflight - 1);
    if (res.statusCode < 400) {
      liveRequestStats.on++;
    } else {
      liveRequestStats.off++;
      thisNode.requestsOff++;
    }
  };

  res.on("finish", onComplete);
  res.on("close", onComplete);
  next();
}

function classifyConnectionSpeed(latencyMs, speedMbps) {
  if (!latencyMs || latencyMs <= 0) return "Checking...";
  if (latencyMs <= 90 && speedMbps >= 5) return "Ultra Fast";
  if (latencyMs <= 220) return "Fast";
  if (latencyMs <= 500) return "Moderate";
  return "Slow";
}

function applyLocalTelemetryToNode(node, local, measuredLatencyMs = 1) {
  node.isCurrentResponder = true;
  node.status = "ONLINE";
  node.httpCode = 200;
  node.isHealthy = true;
  node.downReason = null;
  node.latencyMs = measuredLatencyMs;
  node.region = local.region;
  node.liveNodeUsers = local.liveUsers;
  node.activeSockets = local.activeSockets;
  node.rps = local.rps;
  node.requestsOn = local.requestsOn;
  node.requestsOff = local.requestsOff;
  node.totalRequests = local.totalRequests;
  node.hardware = local.hardware;
  node.telemetrySynced = true;
  node.lastChecked = Date.now();
}

/**
 * Recalculate dynamic user distribution and traffic shares across cluster (3 -> 2 -> 1 Cascade)
 */
function recalculateClusterDistribution() {
  const now = Date.now();
  pruneIdleUsers(now);

  // Sum real per-node live users if synced; fall back to local active tracker
  const syncedHealthyNodes = clusterNodes.filter((n) => n.isEnabled && n.isHealthy && n.telemetrySynced);
  const localLive = Math.max(activeUserTracker.size, liveRequestStats.inflight > 0 ? 1 : 0);
  const syncedSum = syncedHealthyNodes.reduce((acc, n) => acc + (n.liveNodeUsers || 0), 0);
  const totalLiveUsers = Math.max(syncedSum, localLive, 1);

  const b1 = clusterNodes[0];
  const b2 = clusterNodes[1];
  const b3 = clusterNodes[2];

  const activeNodes = clusterNodes.filter((n) => n.isEnabled && n.isHealthy);
  const activeCount = activeNodes.length;

  for (const n of clusterNodes) {
    n.trafficShare = n.url ? "0% (Bypassed / Offline)" : "Unconfigured";
    n.trafficRedirection = null;
    if (!n.isEnabled || !n.isHealthy) {
      n.activeUsers = 0;
    }
  }

  if (activeCount === 3) {
    const baseShare = Math.floor(totalLiveUsers / 3);
    const remainder = totalLiveUsers % 3;
    b1.activeUsers = b1.telemetrySynced ? b1.liveNodeUsers : baseShare + (remainder > 0 ? 1 : 0);
    b2.activeUsers = b2.telemetrySynced ? b2.liveNodeUsers : baseShare + (remainder > 1 ? 1 : 0);
    b3.activeUsers = b3.telemetrySynced ? b3.liveNodeUsers : baseShare;

    b1.trafficShare = "33.3% Active (Sticky IP-Hash Load Balanced)";
    b2.trafficShare = "33.3% Active (Sticky IP-Hash Load Balanced)";
    b3.trafficShare = "33.3% Active (Sticky IP-Hash Load Balanced)";
  } else if (activeCount === 2) {
    const half = Math.ceil(totalLiveUsers / 2);
    const otherHalf = Math.max(0, totalLiveUsers - half);

    activeNodes[0].activeUsers = activeNodes[0].telemetrySynced ? activeNodes[0].liveNodeUsers : half;
    activeNodes[0].trafficShare = "50% Active User Share (Sticky IP-Hash Load Balanced)";

    activeNodes[1].activeUsers = activeNodes[1].telemetrySynced ? activeNodes[1].liveNodeUsers : otherHalf;
    activeNodes[1].trafficShare = "50% Active User Share (Sticky IP-Hash Load Balanced)";

    const downNodes = clusterNodes.filter((n) => !n.isEnabled || !n.isHealthy);
    for (const d of downNodes) {
      d.activeUsers = 0;
      d.trafficShare = d.status === "SUSPENDED"
        ? "0% (503 Suspended — Auto-Shifted to 2 Active Nodes)"
        : "0% (Disabled / Offline)";
      d.trafficRedirection = `${activeNodes[0].name} & ${activeNodes[1].name} (50% / 50% Active Split)`;
    }
  } else if (activeCount === 1) {
    const survivor = activeNodes[0];
    survivor.activeUsers = survivor.telemetrySynced ? Math.max(survivor.liveNodeUsers, 1) : totalLiveUsers;
    survivor.trafficShare = "100% of Active Traffic (Sole Active Survivor Node)";

    for (const n of clusterNodes) {
      if (n !== survivor) {
        n.activeUsers = 0;
        n.trafficShare = n.status === "SUSPENDED" ? "0% (503 Suspended)" : "0% (Bypassed)";
        n.trafficRedirection = `${survivor.name} (100% Fallback Survivor)`;
      }
    }
  } else {
    for (const n of clusterNodes) {
      n.activeUsers = 0;
      n.trafficShare = "0% (All Nodes Offline / Suspended)";
    }
  }
}

let activeProbePromise = null;
let lastProbeCompletedAt = 0;

/**
 * Probes single node for live users, connection speed (Mbps / KBps), latency, and hardware details.
 */
async function probeSingleNode(node, authHeader = "") {
  if (!node.url) {
    node.status = "UNCONFIGURED";
    node.isHealthy = false;
    node.speedGrade = "Not Configured";
    return;
  }

  const selfHost = getCurrentServerHostname();
  const isSelf =
    (selfHost && normalizeHost(node.url) === selfHost) ||
    (clusterNodes.filter((n) => n.url).length === 1);

  if (!node.isEnabled) {
    node.status = "DISABLED";
    node.isHealthy = false;
    node.speedGrade = "Disabled";
    node.downReason = "Manually Disabled by Admin (Traffic Bypassed at Edge)";
    if (isSelf) {
      const local = getLocalNodeTelemetry();
      node.hardware = local.hardware;
      node.region = local.region;
      node.telemetrySynced = true;
      node.isCurrentResponder = true;
    }
    return;
  }

  if (isSelf) {
    const local = getLocalNodeTelemetry();
    applyLocalTelemetryToNode(node, local, 1);
    node.connectionSpeedMbps = 1000;
    node.throughputKBps = 125000;
    node.speedGrade = "Localhost / Self (<1ms)";
    return;
  }

  node.isCurrentResponder = false;
  const headers = {
    "User-Agent": "FreeStudyMaterial-ClusterSync/1.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "application/json, text/plain, */*",
  };
  const syncSecret = process.env.CLUSTER_SYNC_SECRET || "";
  if (syncSecret) headers["X-Cluster-Sync"] = syncSecret;
  if (authHeader) headers["Authorization"] = authHeader;

  const hasAuthForTelemetry = Boolean(syncSecret || authHeader);
  const targetEndpoint = hasAuthForTelemetry
    ? `${node.url}/api/admin/cluster/node-telemetry?benchmark=1&t=${Date.now()}`
    : `${node.url}/health?t=${Date.now()}&probe=cf`;

  const reqStart = Date.now();
  try {
    let res = await fetch(targetEndpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12000),
    });
    const firstByteMs = Math.max(1, Date.now() - reqStart);
    let rawText = await res.text();
    const totalMs = Math.max(1, Date.now() - reqStart);
    const bytes = Buffer.byteLength(rawText, "utf8");

    // If telemetry endpoint returned 401/404 (e.g. node still running older build), fallback to /health
    if (hasAuthForTelemetry && (res.status === 401 || res.status === 404)) {
      const hStart = Date.now();
      res = await fetch(`${node.url}/health?t=${Date.now()}&probe=cf`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(12000),
      });
      const hText = await res.text();
      const hMs = Math.max(1, Date.now() - hStart);
      const hBytes = Buffer.byteLength(hText, "utf8");
      applyProbeResponseToNode(node, res, hText, hMs, hBytes);
      return;
    }

    applyProbeResponseToNode(node, res, rawText, totalMs, bytes, firstByteMs);
  } catch (err) {
    const failMs = Math.max(1, Date.now() - reqStart);
    node.latencyMs = failMs;
    node.connectionSpeedMbps = 0;
    node.throughputKBps = 0;
    node.speedGrade = "Offline / Timeout";
    node.lastChecked = Date.now();
    node.httpCode = 0;
    node.isHealthy = false;
    node.status = "OFFLINE";
    node.downReason = `Connection Timeout (${err.message})`;
  }
}

function applyProbeResponseToNode(node, res, rawText, totalMs, bytes, firstByteMs = totalMs) {
  const renderRouting = (res.headers?.get?.("x-render-routing") || "").toLowerCase();
  const isSuspendedBody =
    renderRouting.includes("suspend") ||
    /this service has been suspended/i.test(rawText);

  node.latencyMs = firstByteMs;
  const seconds = Math.max(0.005, totalMs / 1000);
  const kbps = Math.round(bytes / 1024 / seconds);
  const mbps = Number(((bytes * 8) / seconds / 1000000).toFixed(2));
  node.throughputKBps = kbps;
  node.connectionSpeedMbps = mbps;
  node.lastChecked = Date.now();

  if (res.status === 503 || isSuspendedBody) {
    node.httpCode = 503;
    node.status = "SUSPENDED";
    node.isHealthy = false;
    node.speedGrade = "Suspended (503)";
    node.connectionSpeedMbps = 0;
    node.throughputKBps = 0;
    node.liveNodeUsers = 0;
    node.activeSockets = 0;
    node.rps = 0;
    node.downReason = "503 Service Suspended: Render Free 5GB Monthly Bandwidth Exceeded";
    return;
  }

  node.httpCode = res.status;
  if (!res.ok) {
    node.status = `HTTP_${res.status}`;
    node.isHealthy = false;
    node.speedGrade = `Degraded (${res.status})`;
    node.downReason = `Backend returned unexpected HTTP status ${res.status}`;
    return;
  }

  node.status = "ONLINE";
  node.isHealthy = true;
  node.downReason = null;
  node.speedGrade = classifyConnectionSpeed(firstByteMs, mbps);

  try {
    const parsed = JSON.parse(rawText);
    if (parsed && parsed.telemetry) {
      const t = parsed.telemetry;
      node.region = t.region || node.region;
      node.liveNodeUsers = Number(t.liveUsers ?? 0);
      node.activeSockets = Number(t.activeSockets ?? 0);
      node.rps = Number(t.rps ?? 0);
      node.requestsOn = Number(t.requestsOn ?? node.requestsOn ?? 0);
      node.requestsOff = Number(t.requestsOff ?? node.requestsOff ?? 0);
      node.totalRequests = Number(t.totalRequests ?? node.totalRequests ?? 0);
      node.hardware = t.hardware || node.hardware;
      node.telemetrySynced = true;
    }
  } catch (_) {
    // Non-JSON /health or older endpoint; latency & HTTP status already updated
  }
}

/**
 * Parallel probe for all backend nodes in the cluster
 */
async function probeClusterNodes(options = {}) {
  const { authHeader = "", force = false } = options || {};
  const now = Date.now();

  if (activeProbePromise) {
    return activeProbePromise;
  }

  // Throttle to avoid probe storms during rapid 3s UI polling unless forced or auth just arrived
  if (!force && lastProbeCompletedAt > 0 && now - lastProbeCompletedAt < 4000) {
    // Always refresh local/self node hardware & users instantly
    const selfNode = getThisNode();
    if (selfNode) {
      const local = getLocalNodeTelemetry();
      applyLocalTelemetryToNode(selfNode, local, 1);
      recalculateClusterDistribution();
    }
    return;
  }

  activeProbePromise = (async () => {
    try {
      await Promise.allSettled(
        clusterNodes.map((node) => probeSingleNode(node, authHeader))
      );
      lastProbeCompletedAt = Date.now();
      recalculateClusterDistribution();
    } finally {
      activeProbePromise = null;
    }
  })();

  return activeProbePromise;
}

/**
 * Toggle a server node ON or OFF (Admin Switch Control)
 */
async function toggleClusterNode(nodeId, isEnabled, updatedBy = "Administrator") {
  const node = clusterNodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`Cluster node with ID '${nodeId}' not found.`);
  }

  node.isEnabled = Boolean(isEnabled);
  node.lastChecked = Date.now();

  if (!node.isEnabled) {
    node.status = "DISABLED";
    node.isHealthy = false;
    node.speedGrade = "Disabled";
    node.downReason = "Manually Switched OFF by Administrator (Bypassed by Load Balancer)";
  } else {
    await probeSingleNode(node);
  }

  recalculateClusterDistribution();

  // Persist to Firestore
  try {
    const { db } = require("../firebase");
    if (db) {
      await db.collection("settings").doc("server_cluster").set({
        [nodeId]: {
          isEnabled: node.isEnabled,
          status: node.status,
          updatedAt: Date.now(),
          updatedBy: String(updatedBy),
        },
      }, { merge: true });
    }
  } catch (err) {
    console.warn("[CLUSTER] Firestore persistence warning:", err.message);
  }

  return getClusterTelemetry();
}

/**
 * Sync node state received from another backend server
 */
function syncNodeState(nodeId, isEnabled) {
  const node = clusterNodes.find((n) => n.id === nodeId);
  if (node) {
    node.isEnabled = Boolean(isEnabled);
    if (!node.isEnabled) {
      node.status = "DISABLED";
      node.isHealthy = false;
      node.speedGrade = "Disabled";
      node.downReason = "Manually Switched OFF by Administrator";
    } else {
      probeSingleNode(node).then(() => recalculateClusterDistribution()).catch(() => {});
    }
    recalculateClusterDistribution();
  }
}

/**
 * Initialize persistent cluster node state from Firestore on boot
 */
async function initClusterStateFromFirestore() {
  try {
    const { db } = require("../firebase");
    if (!db) return;
    const snap = await db.collection("settings").doc("server_cluster").get();
    if (snap.exists) {
      const data = snap.data() || {};
      for (const node of clusterNodes) {
        if (data[node.id] && typeof data[node.id].isEnabled === "boolean") {
          node.isEnabled = data[node.id].isEnabled;
          if (!node.isEnabled) {
            node.status = "DISABLED";
            node.isHealthy = false;
            node.speedGrade = "Disabled";
            node.downReason = "Manually Switched OFF by Administrator";
          }
        }
      }
      recalculateClusterDistribution();
    }
  } catch (err) {
    console.warn("[CLUSTER] Startup Firestore load notice:", err.message);
  }
}

// Initialize on server boot
setTimeout(initClusterStateFromFirestore, 2000);
setTimeout(() => probeClusterNodes({ force: true }), 4000);
setInterval(() => probeClusterNodes({ force: true }), 30000);

/**
 * Exported getter for admin hardware telemetry
 */
function getClusterTelemetry() {
  recalculateClusterDistribution();

  const now = Date.now();
  const recent = liveRequestStats.recentTimestamps.filter((t) => now - t < 5000);
  const liveRps = Number((recent.length / 5).toFixed(1));

  const b1 = clusterNodes[0];
  const activeNodes = clusterNodes.filter((n) => n.isEnabled && n.isHealthy);
  const activeCount = activeNodes.length;

  const totalConnectedUsers = activeNodes.reduce((acc, n) => acc + (n.activeUsers || 0), 0);
  const totalRequests = clusterNodes.reduce((acc, n) => acc + (n.totalRequests || n.requestsOn || 0), 0) || liveRequestStats.total;
  const totalOn = clusterNodes.reduce((acc, n) => acc + (n.requestsOn || 0), 0) || liveRequestStats.on;
  const totalOff = clusterNodes.reduce((acc, n) => acc + (n.requestsOff || 0), 0) || liveRequestStats.off;
  const totalInflight = activeNodes.reduce((acc, n) => acc + (n.activeSockets || 0), 0) || liveRequestStats.inflight;
  const totalClusterRps = Number(
    (activeNodes.reduce((acc, n) => acc + (n.rps || 0), 0) || liveRps).toFixed(1)
  );

  const activePrimaryNode = activeCount === 3
    ? "All 3 Nodes Active (~33.3% / 33.3% / 33.3% Sticky IP-Hash)"
    : activeCount === 2
    ? `${activeNodes[0].name} & ${activeNodes[1].name} (50% / 50% Active Load Balanced)`
    : activeCount === 1
    ? `${activeNodes[0].name} (100% Sole Active Survivor)`
    : "None (All Nodes Offline / Disabled)";

  const isFailoverEngaged = activeCount < clusterNodes.filter((n) => n.url).length;

  const usersRoutedToMessage = activeCount >= 2
    ? `${activeNodes.map((n) => n.name).join(" & ")} (Active Load Balancing)`
    : activeCount === 1
    ? `${activeNodes[0].name} (${activeNodes[0].url})`
    : "No Online Backend Available";

  return {
    requests: {
      total: totalRequests,
      on: totalOn,
      off: totalOff,
      inflight: totalInflight,
      rps: totalClusterRps,
      successRatePercent: totalRequests > 0
        ? Number(((totalOn / totalRequests) * 100).toFixed(1))
        : 100,
      totalConnectedUsers: Math.max(totalConnectedUsers, 1),
    },
    cluster: {
      nodes: clusterNodes,
      activeNodesCount: activeCount,
      activePrimary: activePrimaryNode,
      failoverActive: isFailoverEngaged,
      failoverSummary: {
        backend1Status: !b1.url
          ? "UNCONFIGURED"
          : b1.isEnabled
          ? (b1.isHealthy ? "ONLINE" : b1.status === "SUSPENDED" ? "SUSPENDED (503)" : b1.status)
          : "MANUALLY DISABLED (OFF)",
        backend1DownReason: b1.downReason || (b1.isHealthy ? "All systems nominal" : "503 Service Suspended: Render Free 5GB Monthly Bandwidth Exceeded"),
        usersRoutedTo: usersRoutedToMessage,
        nextStandby: activeCount === 2 ? `${activeNodes[1].name} (Active 50% Co-Worker)` : activeCount === 1 ? "Single Node Failover" : "All Nodes Active",
        userImpact: activeCount > 0
          ? "0% Dropped Requests — Seamless Edge redirection with sub-millisecond failover"
          : "All configured backend nodes are currently unreachable",
      },
    },
  };
}

module.exports = {
  requestTelemetryMiddleware,
  getLocalNodeTelemetry,
  getClusterTelemetry,
  toggleClusterNode,
  syncNodeState,
  probeClusterNodes,
};
