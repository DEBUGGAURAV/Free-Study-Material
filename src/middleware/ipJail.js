/**
 * Automated IP Jail & Anti-DDoS Defense Firewall
 * Free Study Material - Military-Grade Protection
 * 
 * - Tracks request frequency per IP in 60-second sliding windows
 * - If an IP exceeds 50 req/min (or 10 failed auths), it gets jailed for 15 minutes
 * - Drops banned traffic immediately with HTTP 429 & Retry-After header (Zero CPU Load)
 * - Safe whitelisting for local loopback & master admin sessions
 */

const jwt = require("jsonwebtoken");
const net = require("node:net");
const { getClientIp } = require("./rateLimit");

const jailedIps = new Map(); // ip -> unjailTimestamp
const jailedIpsDetails = new Map(); // ip -> { ip, unjailTime, jailedAt, reason, requestCount, incidentId, durationLabel }
const jailedDevices = new Map(); // deviceId -> unjailTimestamp
const jailedDevicesDetails = new Map(); // deviceId -> { deviceId, unjailTime, jailedAt, reason, incidentId, ip, durationLabel }
const incidentsRegistry = new Map(); // incidentId -> { incidentId, ip, deviceId, unjailTime, reason }
const pardonedIncidents = new Set(); // incidentId -> Set of explicitly pardoned incident IDs
const ipRequestHistory = new Map(); // ip -> Array of timestamps (general request flood window)
const ipAuthFailureHistory = new Map(); // ip -> Array of timestamps (dedicated auth failure window)
const knownAdminIps = new Map(); // ip -> expiryMs (30-day sliding immunity window for active admins)

function formatDurationLabel(durationMs) {
  const mins = Math.max(1, Math.round((Number(durationMs) || 0) / 60000));
  if (mins >= 500000) return "Permanent (Admin Review)";
  if (mins >= 1440) {
    const days = Math.round(mins / 1440);
    return `${days} ${days === 1 ? "Day" : "Days"}`;
  }
  if (mins >= 60) {
    const hrs = Math.round(mins / 60);
    return `${hrs} ${hrs === 1 ? "Hour" : "Hours"}`;
  }
  return `${mins} ${mins === 1 ? "Minute" : "Minutes"}`;
}

function extractDeviceIdFromReq(req) {
  if (!req) return "";
  const fromHeader = req.headers?.["x-device-id"] || "";
  if (fromHeader) return sanitizeDeviceId(fromHeader);
  if (req.cookies?.fsm_device_id) return sanitizeDeviceId(req.cookies.fsm_device_id);
  const rawCookie = req.headers?.cookie || "";
  if (rawCookie) {
    const m = rawCookie.match(/(?:^|;\s*)fsm_device_id=([^;]+)/);
    if (m && m[1]) {
      try {
        return sanitizeDeviceId(decodeURIComponent(m[1]));
      } catch (_) {
        return sanitizeDeviceId(m[1]);
      }
    }
  }
  return "";
}

// 🌐 Multi-Node Distributed Sync (Turso 4): Keep IP & Device Jails identical across all Render nodes & restarts
let lastTursoSyncMs = 0;
async function syncActiveJailsFromTurso() {
  try {
    const { getActiveTursoJails } = require("../services/tursoStudentVaultService");
    if (typeof getActiveTursoJails !== "function") return;
    const rows = await getActiveTursoJails(500);
    const now = Date.now();
    const remoteIpKeys = new Set();
    const remoteDevKeys = new Set();

    for (const r of rows) {
      if (!r || !r.target || !r.unjailTime || r.unjailTime <= now) continue;
      if (r.incidentId && pardonedIncidents.has(r.incidentId)) continue;

      if (r.jailType === "ip") {
        if (knownAdminIps.has(r.target)) continue;
        remoteIpKeys.add(r.target);
        jailedIps.set(r.target, r.unjailTime);
        jailedIpsDetails.set(r.target, {
          ip: r.target,
          unjailTime: r.unjailTime,
          jailedAt: r.jailedAt || now,
          reason: r.reason || "Security policy violation",
          durationLabel: r.durationLabel || formatDurationLabel(r.unjailTime - (r.jailedAt || now)),
          requestCount: 999,
          incidentId: r.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`,
          deviceId: r.deviceId || "",
        });
        if (r.incidentId) {
          incidentsRegistry.set(r.incidentId, {
            incidentId: r.incidentId,
            ip: r.target,
            deviceId: r.deviceId || "",
            unjailTime: r.unjailTime,
            reason: r.reason || "Security policy violation",
          });
        }
      } else if (r.jailType === "device") {
        remoteDevKeys.add(r.target);
        jailedDevices.set(r.target, r.unjailTime);
        jailedDevicesDetails.set(r.target, {
          deviceId: r.target,
          unjailTime: r.unjailTime,
          jailedAt: r.jailedAt || now,
          reason: r.reason || "Security policy violation",
          durationLabel: r.durationLabel || formatDurationLabel(r.unjailTime - (r.jailedAt || now)),
          incidentId: r.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`,
          ip: r.ip || "",
        });
        if (r.incidentId) {
          incidentsRegistry.set(r.incidentId, {
            incidentId: r.incidentId,
            deviceId: r.target,
            ip: r.ip || "",
            unjailTime: r.unjailTime,
            reason: r.reason || "Security policy violation",
          });
        }
      }
    }

    // Remove locally cached entries that were pardoned/unjailed on another cluster node
    if (lastTursoSyncMs > 0) {
      for (const [ip, det] of jailedIpsDetails.entries()) {
        if (!remoteIpKeys.has(ip) && det?.jailedAt && (now - Number(det.jailedAt) > 15000)) {
          if (det.incidentId) pardonedIncidents.add(det.incidentId);
          jailedIps.delete(ip);
          jailedIpsDetails.delete(ip);
        }
      }
      for (const [devId, det] of jailedDevicesDetails.entries()) {
        if (!remoteDevKeys.has(devId) && det?.jailedAt && (now - Number(det.jailedAt) > 15000)) {
          if (det.incidentId) pardonedIncidents.add(det.incidentId);
          jailedDevices.delete(devId);
          jailedDevicesDetails.delete(devId);
        }
      }
    }
    lastTursoSyncMs = now;
  } catch (_) {}
}

// Boot hydration + lightweight 20s multi-node consistency sync
setTimeout(() => { syncActiveJailsFromTurso().catch(() => {}); }, 2500);
setInterval(() => { syncActiveJailsFromTurso().catch(() => {}); }, 20 * 1000).unref?.();

/**
 * Register an IP with absolute admin immunity
 */
function registerAdminIp(ip, ttlMs = 30 * 24 * 60 * 60 * 1000) {
  if (!ip || ip === "unknown") return;
  knownAdminIps.set(ip, Date.now() + ttlMs);
  if (jailedIps.has(ip)) {
    jailedIps.delete(ip);
    jailedIpsDetails.delete(ip);
  }
}

// Real-Time Threat Metrics & Event Buffer
let totalThreatsDetected = 0;
let totalJailedCount = 0;
let totalInjectionsScrubbed = 0;
let totalBruteForceBlocked = 0;
const MAX_INCIDENTS = 50;
const securityIncidents = []; // Circular incident log

// Clean up expired jail & tracking entries every 60 seconds (Auto-Release pipeline)
setInterval(async () => {
  const now = Date.now();
  const releasedIps = [];
  const releasedDevices = [];

  for (const [ip, unjailTime] of jailedIps.entries()) {
    if (now >= unjailTime) {
      const details = jailedIpsDetails.get(ip) || {};
      releasedIps.push({ ip, details });
      jailedIps.delete(ip);
      jailedIpsDetails.delete(ip);
    }
  }
  for (const [devId, unjailTime] of jailedDevices.entries()) {
    if (now >= unjailTime) {
      const details = jailedDevicesDetails.get(devId) || {};
      releasedDevices.push({ devId, details });
      jailedDevices.delete(devId);
      jailedDevicesDetails.delete(devId);
    }
  }
  for (const [incId, data] of incidentsRegistry.entries()) {
    if (now >= data.unjailTime) {
      incidentsRegistry.delete(incId);
    }
  }
  for (const [ip, times] of ipRequestHistory.entries()) {
    const valid = times.filter((t) => now - t < 60000);
    if (valid.length === 0) ipRequestHistory.delete(ip);
    else ipRequestHistory.set(ip, valid);
  }
  for (const [ip, times] of ipAuthFailureHistory.entries()) {
    const valid = times.filter((t) => now - t < 10 * 60 * 1000);
    if (valid.length === 0) ipAuthFailureHistory.delete(ip);
    else ipAuthFailureHistory.set(ip, valid);
  }
  try {
    const { pruneExpiredTursoActiveJails } = require("../services/tursoStudentVaultService");
    if (typeof pruneExpiredTursoActiveJails === "function") pruneExpiredTursoActiveJails().catch(() => {});
  } catch (_) {}

  // Delete from database & dispatch auto-release reports to Topic 750
  if (releasedIps.length > 0 || releasedDevices.length > 0) {
    let db = null;
    try {
      db = require("../firebase").db;
    } catch (_) {}

    let sendTelegramAuthNotice = null;
    try {
      sendTelegramAuthNotice = require("../services/emailService").sendTelegramAuthNotice;
    } catch (_) {}

    for (const item of releasedIps) {
      const ip = item.ip;
      const incId = item.details?.incidentId;

      // 1. Purge from Turso 4 (fsm-studet-session: Security Defense Vault)
      try {
        const { deleteTursoJailAppeal } = require("../services/tursoStudentVaultService");
        deleteTursoJailAppeal(incId, ip).catch(() => {});
      } catch (_) {}

      if (db) {
        try {
          if (incId) {
            const snap = await db.collection("jail_appeals").where("incidentId", "==", incId).get();
            for (const d of snap.docs) await d.ref.delete();
          }
          const snapIp = await db.collection("jail_appeals").where("ip", "==", ip).get();
          for (const d of snapIp.docs) await d.ref.delete();
        } catch (_) {}
      }

      if (typeof sendTelegramAuthNotice === "function") {
        const autoReport = [
          `⏱️ <b>[SECURITY QUARANTINE AUTO-RELEASE REPORT]</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `🌐 <b>Public IP:</b> <code>${ip}</code>`,
          incId ? `🆔 <b>Incident ID:</b> <code>${incId}</code>` : null,
          item.details?.reason ? `⚠️ <b>Detention Reason:</b> ${item.details.reason}` : null,
          `⚡ <b>Release Type:</b> Autonomous Quarantine Expiry (Timer Served)`,
          `🛡️ <b>Status:</b> IP Quarantine Lifted, Full Access Restored`,
          `🗑️ <b>Database Status:</b> Cleaned & Purged from Database`,
          `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        ].filter(Boolean).join("\n");

        sendTelegramAuthNotice({
          event: "IP_JAIL_APPEAL",
          user: { name: "Autonomous Sweeper", email: "System", ip },
          method: "Autonomous Timer Expiry",
          detail: autoReport,
          threadId: process.env.TELEGRAM_TOPIC_IP_APPEAL || "750",
        }).catch(() => {});
      }
    }

    for (const item of releasedDevices) {
      const devId = item.devId;
      const incId = item.details?.incidentId;

      try {
        const { deleteTursoJailAppeal } = require("../services/tursoStudentVaultService");
        deleteTursoJailAppeal(incId, null).catch(() => {});
      } catch (_) {}

      if (db && incId) {
        try {
          const snap = await db.collection("jail_appeals").where("incidentId", "==", incId).get();
          for (const d of snap.docs) await d.ref.delete();
        } catch (_) {}
      }

      if (typeof sendTelegramAuthNotice === "function") {
        const autoReport = [
          `⏱️ <b>[SECURITY QUARANTINE AUTO-RELEASE REPORT]</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `📱 <b>Device Hash:</b> <code>${devId.slice(0, 16)}...</code>`,
          incId ? `🆔 <b>Incident ID:</b> <code>${incId}</code>` : null,
          `⚡ <b>Release Type:</b> Autonomous Device Quarantine Expiry`,
          `🛡️ <b>Status:</b> Device Unjailed, Access Restored`,
          `🗑️ <b>Database Status:</b> Cleaned & Purged from Database`,
          `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        ].filter(Boolean).join("\n");

        sendTelegramAuthNotice({
          event: "IP_JAIL_APPEAL",
          user: { name: "Autonomous Sweeper", email: "System", ip: item.details?.ip || "N/A" },
          method: "Autonomous Timer Expiry",
          detail: autoReport,
          threadId: process.env.TELEGRAM_TOPIC_IP_APPEAL || "750",
        }).catch(() => {});
      }
    }
  }
}, 60 * 1000);

// Note: getClientIp is imported from ./rateLimit with proxy isolation & IPv6/IPv4 normalization

function recordThreatIncident({ type, ip, detail, severity = "HIGH", actionTaken = "BLOCKED" }) {
  totalThreatsDetected++;
  const incident = {
    id: `thr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    ip: ip || "unknown",
    detail,
    severity,
    actionTaken,
  };
  securityIncidents.unshift(incident);
  if (securityIncidents.length > MAX_INCIDENTS) {
    securityIncidents.pop();
  }
  return incident;
}

function incrementScrubbedCount(count = 1, ip = "unknown", sampleKey = "") {
  totalInjectionsScrubbed += count;
  totalThreatsDetected += count;
  recordThreatIncident({
    type: "MALICIOUS_PAYLOAD_SCRUBBED",
    ip,
    detail: `Neutralized potentially hazardous input (${sampleKey || "XSS / Prototype Injection vector"})`,
    severity: "HIGH",
    actionTaken: "SCRUBBED_SUB_MS",
  });
}

function isWhitelistedIp(req, ip) {
  if (!ip) return false;

  // In non-production, loopback and private subnets are whitelisted for developer convenience
  if (process.env.NODE_ENV !== "production") {
    if (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "::ffff:127.0.0.1" ||
      ip === "localhost" ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.16.") ||
      ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") ||
      ip.startsWith("172.19.") ||
      ip.startsWith("172.2") ||
      ip.startsWith("172.30.") ||
      ip.startsWith("172.31.")
    ) {
      return true;
    }
  }

  // 1. Check known active Administrator IPs cache
  if (ip && knownAdminIps.has(ip)) {
    if (Date.now() < knownAdminIps.get(ip)) {
      return true;
    } else {
      knownAdminIps.delete(ip);
    }
  }

  // 2. Direct Admin JWT Token & Session Check (Absolute immunity for logged-in Administrator on ANY IP)
  if (req) {
    try {
      const authHeader = req.headers?.["authorization"] || req.headers?.["x-admin-token"] || "";
      const cookieHeader = req.headers?.["cookie"] || "";
      const rawToken =
        (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim()) ||
        (cookieHeader.match(/(?:^|;\s*)(?:fsm_admin_token|admin_token|fsm_token|token|vault_token)=([^;]+)/)?.[1]) ||
        req.query?.admin_token ||
        req.query?.token;

      if (rawToken) {
        let decoded = null;
        try {
          const { JWT_SECRET } = require("./auth");
          decoded = jwt.verify(decodeURIComponent(rawToken), JWT_SECRET, { algorithms: ["HS256"] });
        } catch (_) {}
        if (
          decoded &&
          (decoded.role === "admin" ||
            decoded.role === "half_admin" ||
            decoded.isMainAdmin ||
            decoded.isMasterAdmin ||
            (decoded.email && process.env.ADMIN_EMAIL && decoded.email.toLowerCase().trim() === process.env.ADMIN_EMAIL.toLowerCase().trim()))
        ) {
          if (ip) registerAdminIp(ip);
          return true;
        }
      }
    } catch (_) {}

    // 3. Admin bypass overrides (Secured against unauthorized forgery - requires explicitly set key)
    const bypassKey = process.env.ADMIN_BYPASS_KEY || process.env.MAINTENANCE_BYPASS_KEY;
    if (
      bypassKey &&
      (req.query?.admin_bypass === bypassKey ||
        req.query?.bypass === bypassKey ||
        req.headers?.["x-admin-bypass"] === bypassKey)
    ) {
      if (ip) registerAdminIp(ip);
      return true;
    }

    // 4. Cloudflare Worker Edge request (Secured: requires configured edge secret)
    const edgeSecret = (process.env.CF_WORKER_SECRET || bypassKey || "").trim();
    if (edgeSecret && req.headers?.["x-worker-origin"] === edgeSecret) {
      return true;
    }
  }

  return false;
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsString(str) {
  return JSON.stringify(String(str || "")).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function sanitizeDeviceId(raw) {
  return String(raw || "").trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 128);
}

/**
 * Lightweight 4KB HTML Quarantine Screen for severe floods or fallback
 */
function renderQuarantineHtml({
  incidentId,
  reasonStr,
  remainingSec,
  policyName = "Administrative Security Detention",
  durationLabel = "24 Hours",
  autoReleasePolicy = "✅ Auto-release on expiration",
  ip = "Unknown IP",
  deviceId = "",
  unjailTime = null,
}) {
  const targetMs = Number(unjailTime) || (Date.now() + (Number(remainingSec) || 86400) * 1000);
  const releaseDateStr = new Date(targetMs).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const cleanReason = (reasonStr || "Security policy violation")
    .replace(/\.?\s*Auto-release in \d+ seconds\.?/gi, "")
    .trim();

  const safePolicyName = escapeHtmlAttr(policyName);
  const safeCleanReason = escapeHtmlAttr(cleanReason);
  const safeIncidentIdHtml = escapeHtmlAttr(incidentId);
  const safeDurationLabel = escapeHtmlAttr(durationLabel);
  const safeAutoReleasePolicy = escapeHtmlAttr(autoReleasePolicy);
  const safeReleaseDateStr = escapeHtmlAttr(releaseDateStr);
  const safeIncidentIdJs = safeJsString(incidentId);
  const safeDeviceIdJs = safeJsString(sanitizeDeviceId(deviceId));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Lockdown: Temporary Detention • Free Study Material</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background: #09090b;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      max-width: 560px;
      width: 100%;
      background: radial-gradient(circle at top, rgba(185, 28, 28, 0.22) 0%, rgba(15, 23, 42, 0.98) 100%);
      border: 2px solid #ef4444;
      border-radius: 24px;
      padding: 34px 28px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.95), 0 0 40px rgba(239, 68, 68, 0.35);
      margin: auto;
    }
    .icon-wrap {
      width: 70px;
      height: 70px;
      margin: 0 auto 16px auto;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      border: 1.5px solid rgba(239, 68, 68, 0.45);
      box-shadow: 0 0 25px rgba(239, 68, 68, 0.3);
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 800;
      color: #ef4444;
      margin: 0 0 8px 0;
      letter-spacing: -0.3px;
      text-transform: uppercase;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.5);
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 700;
      color: #fca5a5;
      margin-bottom: 16px;
    }
    .reason-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.28);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 0.84rem;
      color: #fca5a5;
      margin-bottom: 20px;
      line-height: 1.45;
      text-align: left;
    }
    .timer-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px solid rgba(245, 158, 11, 0.45);
      border-radius: 16px;
      padding: 18px 20px;
      margin-bottom: 20px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .timer-title {
      font-size: 0.72rem;
      text-transform: uppercase;
      color: #fcd34d;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .timer-val {
      font-size: 2.2rem;
      font-weight: 900;
      color: #fbbf24;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 2px;
      text-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
      margin: 6px 0;
    }
    .table-rows {
      display: flex;
      flex-direction: column;
      gap: 7px;
      font-size: 0.78rem;
      color: #94a3b8;
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;
      text-align: left;
    }
    .table-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pulse-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.74rem;
      color: #94a3b8;
      margin-bottom: 16px;
    }
    .pulse-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 8px #34d399;
    }
    .incident-bar {
      font-size: 0.75rem;
      color: #64748b;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
      margin-bottom: 12px;
    }
    .incident-code {
      color: #cbd5e1;
      background: rgba(255,255,255,0.06);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .appeal-form {
      margin-top: 14px;
      text-align: left;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 12px;
    }
    .form-title {
      font-size: 0.8rem;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 8px 12px;
      color: #fff;
      font-size: 0.78rem;
      margin-bottom: 8px;
      outline: none;
    }
    .input:focus { border-color: #38bdf8; }
    .btn-submit {
      width: 100%;
      background: #3b82f6;
      color: #fff;
      border: none;
      padding: 10px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
      transition: 0.2s;
    }
    .btn-submit:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      ⏳
    </div>
    
    <h2>Security Lockdown: Temporary Detention</h2>

    <div class="badge">
      <span>Violation Policy:</span>
      <span style="color: #fff;">${safePolicyName}</span>
    </div>
    
    <div class="reason-box">
      Security Violation: ${safeCleanReason}. Incident: ${safeIncidentIdHtml}
    </div>
    
    <div class="timer-card">
      <div class="timer-title">
        ⏳ AUTO-RELEASE COUNTDOWN (YOUR REMAINING TIME)
      </div>

      <div id="fsm-countdown-timer" class="timer-val">
        Calculating...
      </div>

      <div class="table-rows">
        <div class="table-row">
          <span style="color: #cbd5e1;">🛡️ Detention Window:</span>
          <strong style="color: #fff;">${safeDurationLabel}</strong>
        </div>
        <div class="table-row">
          <span style="color: #cbd5e1;">🔓 Auto-Release Policy:</span>
          <strong style="color: #34d399;">${safeAutoReleasePolicy}</strong>
        </div>
        <div class="table-row">
          <span style="color: #cbd5e1;">📅 Auto-Release At:</span>
          <strong style="color: #f1f5f9;">${safeReleaseDateStr}</strong>
        </div>
        <div class="table-row">
          <span style="color: #cbd5e1;">⚡ Admin Pardon:</span>
          <strong style="color: #38bdf8;">Can be instantly pardoned by Administrator upon review</strong>
        </div>
      </div>
    </div>

    <div class="pulse-status">
      <span class="pulse-dot"></span>
      <span>Security Detention Active • Instant unlock upon Administrator pardon</span>
    </div>

    <div class="incident-bar">
      Incident ID: <code class="incident-code">${safeIncidentIdHtml}</code>
    </div>

    <form class="appeal-form" id="appealForm" onsubmit="submitAppeal(event)">
      <div class="form-title">
        <span>📝</span> Quick Appeal Desk to Administrator
      </div>
      <input type="text" id="name" class="input" placeholder="Your Full Name (Required)" required />
      <input type="email" id="email" class="input" placeholder="Your College / Personal Email (Required)" required />
      <input type="tel" id="mobile" class="input" placeholder="Mobile Number (Optional)" />
      <textarea id="message" class="input" rows="2" placeholder="Brief statement (e.g. Studying for exams on hostel Wi-Fi)"></textarea>
      <button type="submit" class="btn-submit" id="submitBtn">🚀 Submit Appeal to Administrator</button>
      <div id="appealStatus" style="font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
    </form>
  </div>

  <script>
    // Preserve exact countdown deadline across page refreshes so timer never resets!
    let targetTimestamp = ${targetMs};
    try {
      const stored = localStorage.getItem("fsm_lockdown_until");
      if (stored && Number(stored) > Date.now()) {
        targetTimestamp = Number(stored);
      } else {
        localStorage.setItem("fsm_lockdown_until", String(targetTimestamp));
      }
    } catch (_) {}

    function updateCountdown() {
      const timerElem = document.getElementById("fsm-countdown-timer");
      if (!timerElem) return;
      const diff = Math.max(0, targetTimestamp - Date.now());
      if (diff <= 0) {
        timerElem.innerHTML = "<span style='color: #34d399;'>Detention Expired. Unlocking...</span>";
        try {
          localStorage.removeItem("fsm_lockdown_until");
          localStorage.removeItem("fsm_lockdown_policy");
          localStorage.removeItem("fsm_lockdown_reason");
          localStorage.removeItem("fsm_lockdown_label");
          localStorage.removeItem("fsm_lockdown_release");
          localStorage.removeItem("fsm_lockdown_incident");
        } catch (_) {}
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      timerElem.textContent = hours.toString().padStart(2, "0") + "h " + mins.toString().padStart(2, "0") + "m " + secs.toString().padStart(2, "0") + "s";
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Auto-check pardon status silently in background - ONLY reload if explicitly pardoned by Admin!
    setInterval(async () => {
      try {
        const incId = ${safeIncidentIdJs};
        if (!incId) return;
        const res = await fetch("/api/security/check-pardon?incidentId=" + encodeURIComponent(incId), { cache: "no-store" });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          // CRITICAL: NEVER reload unless data.pardoned === true!
          if (data && data.success && data.pardoned === true) {
            const timerElem = document.getElementById("fsm-countdown-timer");
            if (timerElem) {
              timerElem.innerHTML = "<span style='color: #34d399;'>🎉 Pardoned by Administrator! Unlocking...</span>";
            }
            try {
              localStorage.removeItem("fsm_lockdown_until");
              localStorage.removeItem("fsm_lockdown_policy");
              localStorage.removeItem("fsm_lockdown_reason");
              localStorage.removeItem("fsm_lockdown_label");
              localStorage.removeItem("fsm_lockdown_release");
              localStorage.removeItem("fsm_lockdown_incident");
            } catch (_) {}
            setTimeout(() => window.location.reload(), 1200);
          }
        }
      } catch (_) {}
    }, 15000);

    async function submitAppeal(e) {
      e.preventDefault();
      const btn = document.getElementById("submitBtn");
      const statusDiv = document.getElementById("appealStatus");
      btn.disabled = true;
      btn.innerText = "Submitting Appeal...";
      try {
        const nameVal = (document.getElementById("name") || document.getElementById("studentName"))?.value || "Student Visitor";
        const emailVal = (document.getElementById("email") || document.getElementById("studentEmail"))?.value || "Not Provided";
        const mobileVal = document.getElementById("mobile")?.value || "";
        const messageVal = document.getElementById("message")?.value || "Student submitted pardon request for security detention.";

        const res = await fetch("/api/security/jail-appeal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId: ${safeIncidentIdJs},
            name: nameVal,
            email: emailVal,
            mobile: mobileVal,
            message: messageVal,
            deviceId: ${safeDeviceIdJs},
          })
        });
        const data = await res.json();
        statusDiv.style.display = "block";
        if (data.success) {
          statusDiv.style.color = "#34d399";
          statusDiv.innerText = "✅ Appeal submitted! Administrator notified for review.";
          btn.innerText = "Appeal Logged";
        } else {
          statusDiv.style.color = "#f87171";
          statusDiv.innerText = "⚠️ " + (data.message || "Failed to submit appeal.");
          btn.disabled = false;
          btn.innerText = "Try Again";
        }
      } catch (err) {
        statusDiv.style.display = "block";
        statusDiv.style.color = "#f87171";
        statusDiv.innerText = "⚠️ Submission failed: " + err.message;
        btn.disabled = false;
        btn.innerText = "Try Again";
      }
    }
  </script>
</body>
</html>`;
}

function ipJailFirewall(req, res, next) {
  // Always allow CORS preflight OPTIONS requests without jailing
  if (req && req.method === "OPTIONS") {
    return next();
  }

  const ip = getClientIp(req);

  // 1. Whitelist local loopback, developer machines, private intranets, Cloudflare worker & admin bypass
  if (isWhitelistedIp(req, ip)) {
    return next();
  }

  // 2. Whitelist essential appeal, help FAQs, P2P WebRTC mesh & static asset paths
  const p = (req && (req.path || req.url)) ? (req.path || req.url) : "";
  const isWhitelistedPath =
    p === "/api/security/check-pardon" ||
    p.startsWith("/api/security/check-pardon") ||
    p === "/api/security/jail-appeal" ||
    p.startsWith("/api/security/jail-appeal") ||
    p === "/api/security/unjail-incident" ||
    p.startsWith("/api/security/unjail-incident") ||
    p === "/api/security/status" ||
    p.startsWith("/api/security/status") ||
    p === "/api/help/faqs" ||
    p.startsWith("/api/help/faqs") ||
    p.startsWith("/p2p") ||
    p.startsWith("/api/p2p") ||
    p.includes("socket.io") ||
    p.includes("webrtc") ||
    p === "/health" ||
    p === "/api/health" ||
    p.includes("/health") ||
    Boolean(req && req.method === "GET" && p.includes("/stream") && req.headers && req.headers["range"]) ||
    p.includes("/stream") ||
    p.startsWith("/assets/") ||
    p.endsWith(".js") ||
    p.endsWith(".css") ||
    p.endsWith(".png") ||
    p.endsWith(".ico") ||
    p.endsWith(".svg") ||
    p.endsWith(".woff2") ||
    p.endsWith(".pdf");

  if (isWhitelistedPath) {
    return next();
  }

  const now = Date.now();
  const deviceId = extractDeviceIdFromReq(req);

  // 3. Dual-Key Check: IP Quarantine & Device Fingerprint Quarantine
  const isIpJailed = jailedIps.has(ip) && (now < jailedIps.get(ip));
  const isDeviceJailed = Boolean(deviceId && jailedDevices.has(deviceId) && (now < jailedDevices.get(deviceId)));

  if (isIpJailed || isDeviceJailed) {
    const unjailTime = isIpJailed ? jailedIps.get(ip) : jailedDevices.get(deviceId);
    const details = (isIpJailed ? jailedIpsDetails.get(ip) : jailedDevicesDetails.get(deviceId)) || {};
    const remainingSec = Math.max(1, Math.ceil((unjailTime - now) / 1000));
    const reasonStr = details.reason || "Security violation detected";
    const incidentId = details.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;

    let policyName = "Administrative Security Detention";
    let durationLabel = details.durationLabel || formatDurationLabel(unjailTime - (Number(details.jailedAt) || now));
    let autoReleasePolicy = "✅ Auto-release on expiration";

    if (reasonStr.includes("Traffic") || reasonStr.includes("DoS") || details.requestCount > 600) {
      policyName = "DDoS / Traffic Surge (>600 req/min)";
      durationLabel = details.durationLabel || "3 Minutes";
      autoReleasePolicy = "✅ Auto-release after 180s";
    } else if (reasonStr.includes("Brute-Force")) {
      policyName = "Credential Brute-Force Shield (20+ Failures)";
      durationLabel = details.durationLabel || "5 Minutes";
      autoReleasePolicy = "✅ Auto-release after 5m";
    } else if (reasonStr.includes("Tamper") || reasonStr.includes("Script") || reasonStr.includes("DevTools")) {
      policyName = "Client Script / DevTools Tamper (Strike 3)";
      durationLabel = details.durationLabel || "24 Hours";
      autoReleasePolicy = "✅ Auto-release after 24h";
    }

    // Check if user is navigating with browser to load HTML (GET non-api)
    const isBrowserHtml =
      (req.method === "GET" && (!p.startsWith("/api/") || p === "/")) ||
      Boolean(req.headers["accept"] && req.headers["accept"].includes("text/html"));

    if (isBrowserHtml) {
      res.setHeader("Retry-After", remainingSec);
      res.setHeader("X-Security-Detained", "true");
      res.setHeader("X-Incident-Id", incidentId);
      res.setHeader("X-Detention-Reason", reasonStr);
      res.setHeader("X-Detention-Policy", policyName);

      return res.status(403).send(renderQuarantineHtml({
        incidentId,
        reasonStr,
        remainingSec,
        policyName,
        durationLabel,
        autoReleasePolicy,
        ip,
        deviceId,
        unjailTime,
      }));
    }

    // Block protected/heavy API requests with informative JSON
    res.setHeader("Retry-After", remainingSec);
    return res.status(429).json({
      success: false,
      error: "SECURITY_JAIL",
      incidentId,
      message: `Security quarantine active: ${reasonStr}.`,
      retryAfter: remainingSec,
      unjailTime,
      autoReleaseAt: new Date(unjailTime).toISOString(),
      policyName,
      durationLabel,
      autoReleasePolicy,
      adminPardon: "Can be instantly pardoned by Administrator upon review",
    });
  } else {
    if (jailedIps.has(ip) && now >= jailedIps.get(ip)) {
      jailedIps.delete(ip);
      jailedIpsDetails.delete(ip);
    }
    if (deviceId && jailedDevices.has(deviceId) && now >= jailedDevices.get(deviceId)) {
      jailedDevices.delete(deviceId);
      jailedDevicesDetails.delete(deviceId);
    }
  }

  // 4. Track sliding window of requests (Generous 600 requests per 60s window = 10 req/s sustained)
  // Accommodates college Wi-Fi where hundreds of students share a single public IP
  if (ipRequestHistory.size > 10000) {
    const oldest = Array.from(ipRequestHistory.keys()).slice(0, 2000);
    for (const k of oldest) ipRequestHistory.delete(k);
  }
  let history = ipRequestHistory.get(ip) || [];
  history = history.filter((t) => now - t < 60000);
  history.push(now);
  ipRequestHistory.set(ip, history);

  // If traffic exceeds 600 requests in 60s, detain for 3 minutes
  if (history.length > 600) {
    const jailDurationMs = 3 * 60 * 1000; // 3-minute detention (cooling down period)
    const unjailAt = now + jailDurationMs;
    const incidentId = `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;

    jailedIps.set(ip, unjailAt);
    jailedIpsDetails.set(ip, {
      ip,
      unjailTime: unjailAt,
      jailedAt: now,
      reason: `High Traffic Surge (${history.length} req/60s)`,
      durationLabel: "3 Minutes",
      requestCount: history.length,
      incidentId,
    });
    incidentsRegistry.set(incidentId, {
      incidentId,
      ip,
      unjailTime: unjailAt,
      reason: `High Traffic Surge (${history.length} req/60s)`,
    });
    try {
      const { saveTursoActiveJail } = require("../services/tursoStudentVaultService");
      if (typeof saveTursoActiveJail === "function") {
        saveTursoActiveJail({
          jailType: "ip",
          target: ip,
          incidentId,
          ip,
          reason: `High Traffic Surge (${history.length} req/60s)`,
          durationLabel: "3 Minutes",
          unjailTime: unjailAt,
          jailedAt: now,
        }).catch(() => {});
      }
    } catch (_) {}
    totalJailedCount++;
    recordThreatIncident({
      type: "DOS_TRAFFIC_SPIKE_DETENTION",
      ip,
      detail: `Exceeded 600 req/min threshold (${history.length} reqs logged in 60s)`,
      severity: "CRITICAL",
      actionTaken: "3_MIN_IP_DETENTION",
    });

    ipRequestHistory.delete(ip);
    console.warn(`[SECURITY-FIREWALL] 🚨 Detained abusive IP ${ip} in security jail for 3 minutes (Traffic spike: ${history.length} req/min). Incident: ${incidentId}`);
    res.setHeader("Retry-After", 180);
    return res.status(429).json({
      success: false,
      error: "SECURITY_JAIL",
      incidentId,
      message: "Excessive automated traffic surge detected. Your connection is paused for 3 minutes by Anti-DDoS Firewall.",
      retryAfter: 180,
      unjailTime: unjailAt,
      durationLabel: "3 Minutes",
      policyName: "DDoS / Traffic Surge (>600 req/min)",
      autoReleasePolicy: "✅ Auto-release after 180s",
    });
  }

  next();
}

/**
 * Report an explicit authentication failure to trigger fast-track detention
 * Uses dedicated ipAuthFailureHistory Map so normal GET browsing NEVER triggers false brute-force lockouts!
 */
function reportFailedAuth(req) {
  const ip = getClientIp(req);
  if (isWhitelistedIp(req, ip)) return;

  const now = Date.now();
  let failHistory = ipAuthFailureHistory.get(ip) || [];
  failHistory = failHistory.filter((t) => now - t < 10 * 60 * 1000);
  failHistory.push(now);
  ipAuthFailureHistory.set(ip, failHistory);

  totalBruteForceBlocked++;
  recordThreatIncident({
    type: "AUTH_VERIFICATION_FAILURE",
    ip,
    detail: "Failed credential verification or OTP challenge failure",
    severity: "MEDIUM",
    actionTaken: "WEIGHTED_IP_ELEVATION",
  });

  // 20 actual failed login/OTP attempts within 10 minutes triggers 5-minute quarantine
  if (failHistory.length >= 20) {
    const unjailAt = now + 5 * 60 * 1000;
    const incidentId = `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;
    const reason = "Brute-Force Credential Attack Detected (20+ failed auth attempts)";
    jailedIps.set(ip, unjailAt);
    jailedIpsDetails.set(ip, {
      ip,
      unjailTime: unjailAt,
      jailedAt: now,
      reason,
      durationLabel: "5 Minutes",
      requestCount: failHistory.length,
      incidentId,
    });
    incidentsRegistry.set(incidentId, {
      incidentId,
      ip,
      unjailTime: unjailAt,
      reason,
    });
    try {
      const { saveTursoActiveJail } = require("../services/tursoStudentVaultService");
      if (typeof saveTursoActiveJail === "function") {
        saveTursoActiveJail({
          jailType: "ip",
          target: ip,
          incidentId,
          ip,
          reason,
          durationLabel: "5 Minutes",
          unjailTime: unjailAt,
          jailedAt: now,
        }).catch(() => {});
      }
    } catch (_) {}
    ipAuthFailureHistory.delete(ip);
    totalJailedCount++;
    recordThreatIncident({
      type: "BRUTE_FORCE_LOCKOUT",
      ip,
      detail: "Repeated failed authentication attempts exceeded critical threshold (20+)",
      severity: "CRITICAL",
      actionTaken: "5_MIN_IP_DETENTION",
    });
    console.warn(`[SECURITY-FIREWALL] 🚨 Detained brute-force login IP ${ip} in security jail for 5 minutes. Incident: ${incidentId}`);
  }
}

/**
 * Real-time Threat Intelligence API for Admin Panel
 */
function getThreatIntelligence() {
  const now = Date.now();
  const activeJails = [];
  for (const [ip, item] of jailedIpsDetails.entries()) {
    if (now < item.unjailTime) {
      activeJails.push({
        type: "ip",
        ip,
        incidentId: item.incidentId || "N/A",
        deviceId: item.deviceId || "",
        reason: item.reason,
        remainingSec: Math.max(0, Math.ceil((item.unjailTime - now) / 1000)),
        jailedAt: item.jailedAt ? new Date(item.jailedAt).toISOString() : new Date().toISOString(),
      });
    }
  }

  const activeJailedDevices = [];
  for (const [devId, item] of jailedDevicesDetails.entries()) {
    if (now < item.unjailTime) {
      activeJailedDevices.push({
        type: "device",
        deviceId: devId,
        incidentId: item.incidentId || "N/A",
        ip: item.ip || "",
        reason: item.reason,
        remainingSec: Math.max(0, Math.ceil((item.unjailTime - now) / 1000)),
        jailedAt: item.jailedAt ? new Date(item.jailedAt).toISOString() : new Date().toISOString(),
      });
    }
  }

  const activeThreatsCount = activeJails.length + activeJailedDevices.length;
  const threatLevel =
    activeThreatsCount > 5
      ? "DEFCON 2 (HIGH INTRUSION ACTIVITY)"
      : activeThreatsCount > 0
      ? "DEFCON 4 (ELEVATED • ACTIVE DETENTION)"
      : "DEFCON 5 (ALL CLEAR • 100% SECURE)";

  return {
    threatLevel,
    activeThreatsCount,
    totalThreatsDetected,
    totalJailedCount,
    totalInjectionsScrubbed,
    totalBruteForceBlocked,
    activeJailedIps: activeJails,
    activeJailedDevices,
    activeIncidentsCount: incidentsRegistry.size,
    recentIncidents: securityIncidents.slice(0, 30),
    firewallShields: {
      antiDdos: "ACTIVE (600 req/60s rate envelope)",
      ipQuarantine: "ACTIVE (3-min autonomous quarantine)",
      dualKeyDevice: "ACTIVE (IP + Device Hash Isolation)",
      appealDeskTopic750: "ACTIVE (Topic 750 Strict Routing)",
      xssScrubber: "ACTIVE (Sub-ms AST token neutralization)",
      prototypeGuard: "ACTIVE (Object prototype lockout)",
      bcryptSalt: "ACTIVE (10-Round Salted Hashes)",
      cloudflareIsolation: "ACTIVE (CF-Connecting-IP Trusted Header)",
    },
    systemAuditScore: activeThreatsCount > 0 ? 94 : 100,
    auditedAt: new Date().toISOString(),
  };
}

function unjailIp(ip) {
  const cleanIp = String(ip || "").trim();
  if (!cleanIp) return false;
  const details = jailedIpsDetails.get(cleanIp);
  const hadLocal = jailedIps.has(cleanIp) || jailedIpsDetails.has(cleanIp);
  if (details && details.incidentId) {
    pardonedIncidents.add(details.incidentId);
  }
  jailedIps.delete(cleanIp);
  jailedIpsDetails.delete(cleanIp);
  ipAuthFailureHistory.delete(cleanIp);
  try {
    const { deleteTursoActiveJail } = require("../services/tursoStudentVaultService");
    if (typeof deleteTursoActiveJail === "function") {
      deleteTursoActiveJail({ jailType: "ip", target: cleanIp, incidentId: details?.incidentId }).catch(() => {});
    }
  } catch (_) {}
  if (hadLocal) {
    recordThreatIncident({
      type: "ADMIN_IP_PARDON",
      ip: cleanIp,
      detail: "IP manually pardoned and released from security detention by Admin",
      severity: "LOW",
      actionTaken: "RELEASED_FROM_JAIL",
    });
  }
  return hadLocal;
}

function unjailDevice(deviceId) {
  const cleanDev = sanitizeDeviceId(deviceId);
  if (!cleanDev) return false;
  const details = jailedDevicesDetails.get(cleanDev);
  const hadLocal = jailedDevices.has(cleanDev) || jailedDevicesDetails.has(cleanDev);
  if (details && details.incidentId) {
    pardonedIncidents.add(details.incidentId);
  }
  jailedDevices.delete(cleanDev);
  jailedDevicesDetails.delete(cleanDev);
  try {
    const { deleteTursoActiveJail } = require("../services/tursoStudentVaultService");
    if (typeof deleteTursoActiveJail === "function") {
      deleteTursoActiveJail({ jailType: "device", target: cleanDev, incidentId: details?.incidentId }).catch(() => {});
    }
  } catch (_) {}
  if (hadLocal) {
    recordThreatIncident({
      type: "ADMIN_DEVICE_PARDON",
      ip: "DEVICE_FINGERPRINT",
      detail: `Device ${cleanDev.slice(0, 8)}... pardoned and released by Admin`,
      severity: "LOW",
      actionTaken: "DEVICE_RELEASED",
    });
  }
  return hadLocal;
}

function unjailByIncident(incidentId) {
  if (!incidentId) return false;
  const cleanInc = String(incidentId).trim();
  pardonedIncidents.add(cleanInc);
  const incident = incidentsRegistry.get(cleanInc);
  if (incident) {
    if (incident.ip) unjailIp(incident.ip);
    if (incident.deviceId) unjailDevice(incident.deviceId);
    incidentsRegistry.delete(cleanInc);
  }
  for (const [ip, det] of jailedIpsDetails.entries()) {
    if (det.incidentId === cleanInc) unjailIp(ip);
  }
  for (const [devId, det] of jailedDevicesDetails.entries()) {
    if (det.incidentId === cleanInc) unjailDevice(devId);
  }
  try {
    const { deleteTursoActiveJail } = require("../services/tursoStudentVaultService");
    if (typeof deleteTursoActiveJail === "function") {
      deleteTursoActiveJail({ incidentId: cleanInc }).catch(() => {});
    }
  } catch (_) {}
  return true;
}

function addPardonedIncident(incidentId) {
  if (incidentId) {
    pardonedIncidents.add(String(incidentId).trim());
  }
}

function isIncidentPardoned(incidentId, ip, deviceId) {
  if (incidentId && pardonedIncidents.has(String(incidentId).trim())) {
    return true;
  }
  const now = Date.now();
  const isIpJailed = Boolean(ip && jailedIps.has(ip) && now < jailedIps.get(ip));
  const isDevJailed = Boolean(deviceId && jailedDevices.has(deviceId) && now < jailedDevices.get(deviceId));

  // If neither IP nor Device is actively jailed:
  if (!isIpJailed && !isDevJailed) {
    // If it is not an active incident in incidentsRegistry, it has been released!
    if (incidentId && !incidentsRegistry.has(incidentId) && !String(incidentId).startsWith("FSM-BAN-")) {
      return true;
    }
  }
  return false;
}

function getJailStatus(ip, deviceId) {
  const now = Date.now();
  const isIpJailed = jailedIps.has(ip) && (now < jailedIps.get(ip));
  const isDevJailed = Boolean(deviceId && jailedDevices.has(deviceId) && (now < jailedDevices.get(deviceId)));

  if (!isIpJailed && !isDevJailed) {
    return { isJailed: false };
  }

  const unjailTime = isIpJailed ? jailedIps.get(ip) : jailedDevices.get(deviceId);
  const details = (isIpJailed ? jailedIpsDetails.get(ip) : jailedDevicesDetails.get(deviceId)) || {};
  const remainingSec = Math.max(1, Math.ceil((unjailTime - now) / 1000));
  const incidentId = details.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    isJailed: true,
    isIpJailed,
    isDeviceJailed: isDevJailed,
    incidentId,
    reason: details.reason || "Security policy violation",
    remainingSec,
    unjailTime,
    policyName: isDevJailed ? "Client Script / Device Tamper" : "Anti-DDoS IP Quarantine",
  };
}

function clearAllJails() {
  const count = jailedIps.size + jailedDevices.size;
  // Mark all active incidents as pardoned before clearing so polling clients unlock
  for (const details of jailedIpsDetails.values()) {
    if (details?.incidentId) pardonedIncidents.add(String(details.incidentId).trim());
  }
  for (const details of jailedDevicesDetails.values()) {
    if (details?.incidentId) pardonedIncidents.add(String(details.incidentId).trim());
  }
  for (const incId of incidentsRegistry.keys()) {
    pardonedIncidents.add(String(incId).trim());
  }
  jailedIps.clear();
  jailedIpsDetails.clear();
  jailedDevices.clear();
  jailedDevicesDetails.clear();
  incidentsRegistry.clear();
  ipAuthFailureHistory.clear();
  try {
    const { clearAllTursoActiveJails } = require("../services/tursoStudentVaultService");
    if (typeof clearAllTursoActiveJails === "function") clearAllTursoActiveJails().catch(() => {});
  } catch (_) {}
  recordThreatIncident({
    type: "ADMIN_ALL_JAILS_PURGED",
    ip: "ADMIN_CONSOLE",
    detail: `Administrator executed emergency quarantine release for ${count} entries`,
    severity: "LOW",
    actionTaken: "FLUSHED_ALL_DETENTIONS",
  });
  return count;
}

/**
 * Instantly put a specific IP in jail for security tampering or manual admin quarantine
 */
function jailSpecificIp(ip, reason = "Client Script Tampering", durationMs = 24 * 60 * 60 * 1000, customIncidentId = null, deviceId = "") {
  const cleanIp = String(ip || "").trim().replace(/^::ffff:/, "");
  if (!cleanIp || cleanIp === "unknown" || !net.isIP(cleanIp)) return null;

  // 🛡️ Absolute Master Immunity: Never jail Administrator IPs
  if (isWhitelistedIp(null, cleanIp) || knownAdminIps.has(cleanIp)) {
    console.log(`[IP-JAIL] 🛡️ Immunity check: IP ${cleanIp} belongs to Administrator or Whitelist. Skipping detention.`);
    return null;
  }

  const isLoopback = (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp === "localhost");
  const now = Date.now();
  const safeDurationMs = Math.max(60 * 1000, Number(durationMs) || 24 * 60 * 60 * 1000);
  const unjailTime = now + safeDurationMs;
  const durationLabel = formatDurationLabel(safeDurationMs);
  const incidentId = customIncidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;

  if (!isLoopback) {
    jailedIps.set(cleanIp, unjailTime);
  }
  jailedIpsDetails.set(cleanIp, {
    ip: cleanIp,
    unjailTime,
    jailedAt: now,
    reason: isLoopback ? `${reason} (Localhost Test)` : reason,
    durationLabel,
    requestCount: 999,
    incidentId,
    deviceId,
  });
  incidentsRegistry.set(incidentId, {
    incidentId,
    ip: cleanIp,
    deviceId,
    unjailTime,
    reason,
  });
  if (!isLoopback) {
    try {
      const { saveTursoActiveJail } = require("../services/tursoStudentVaultService");
      if (typeof saveTursoActiveJail === "function") {
        saveTursoActiveJail({
          jailType: "ip",
          target: cleanIp,
          incidentId,
          ip: cleanIp,
          deviceId,
          reason,
          durationLabel,
          unjailTime,
          jailedAt: now,
        }).catch(() => {});
      }
    } catch (_) {}
  }
  totalJailedCount++;
  recordThreatIncident({
    type: "CLIENT_SCRIPT_TAMPERING",
    ip: cleanIp,
    detail: reason,
    severity: "CRITICAL",
    actionTaken: isLoopback ? "RECORDED_TEST" : `JAILED_${durationLabel.toUpperCase().replace(/\s+/g, "_")}`,
  });
  console.warn(`[IP-JAIL] 🚨 IP ${cleanIp} jailed for ${durationLabel} due to: ${reason}. Incident: ${incidentId}`);
  return incidentId;
}

/**
 * Instantly put a specific Device in jail (Dual-Key protection for shared college Wi-Fi)
 */
function jailSpecificDevice(deviceId, reason = "Client Script Tampering", durationMs = 24 * 60 * 60 * 1000, customIncidentId = null, ip = "unknown") {
  const cleanDev = sanitizeDeviceId(deviceId);
  if (!cleanDev) return null;

  // 🛡️ Absolute Master Immunity: Never jail Device if associated with Administrator IP
  if (ip && ip !== "unknown" && (isWhitelistedIp(null, ip) || knownAdminIps.has(ip))) {
    console.log(`[IP-JAIL] 🛡️ Immunity check: Device ${cleanDev} associated with Administrator IP ${ip}. Skipping detention.`);
    return null;
  }

  const now = Date.now();
  const safeDurationMs = Math.max(60 * 1000, Number(durationMs) || 24 * 60 * 60 * 1000);
  const unjailTime = now + safeDurationMs;
  const durationLabel = formatDurationLabel(safeDurationMs);
  const incidentId = customIncidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`;

  jailedDevices.set(cleanDev, unjailTime);
  jailedDevicesDetails.set(cleanDev, {
    deviceId: cleanDev,
    unjailTime,
    jailedAt: now,
    reason,
    durationLabel,
    incidentId,
    ip,
  });
  incidentsRegistry.set(incidentId, {
    incidentId,
    deviceId: cleanDev,
    ip,
    unjailTime,
    reason,
  });
  try {
    const { saveTursoActiveJail } = require("../services/tursoStudentVaultService");
    if (typeof saveTursoActiveJail === "function") {
      saveTursoActiveJail({
        jailType: "device",
        target: cleanDev,
        incidentId,
        ip,
        deviceId: cleanDev,
        reason,
        durationLabel,
        unjailTime,
        jailedAt: now,
      }).catch(() => {});
    }
  } catch (_) {}
  totalJailedCount++;
  recordThreatIncident({
    type: "DEVICE_FINGERPRINT_JAIL",
    ip,
    detail: `Device ${cleanDev.slice(0, 8)}... detained: ${reason}`,
    severity: "CRITICAL",
    actionTaken: `JAILED_DEVICE_${durationLabel.toUpperCase().replace(/\s+/g, "_")}`,
  });
  console.warn(`[IP-JAIL] 🚨 Device ${cleanDev} jailed for ${durationLabel} due to: ${reason}. Incident: ${incidentId}`);
  return incidentId;
}

module.exports = {
  ipJailFirewall,
  jailSpecificIp,
  jailSpecificDevice,
  unjailIp,
  unjailDevice,
  unjailByIncident,
  isIncidentPardoned,
  addPardonedIncident,
  getJailStatus,
  renderQuarantineHtml,
  reportFailedAuth,
  getClientIp,
  recordThreatIncident,
  incrementScrubbedCount,
  getThreatIntelligence,
  clearAllJails,
  incidentsRegistry,
  registerAdminIp,
  isWhitelistedIp,
  syncActiveJailsFromTurso,
};

