require("dotenv").config();
try {
  const dns = require("dns");
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
} catch (_) {}
const express = require("express");
const path = require("path");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const os = require("os");

const { globalLimiter } = require("./middleware/rateLimit");
const { getClient, startAutoSyncWorker } = require("./telegram/mtproto");
const { startBotPoller } = require("./telegram/botPoller");
const { startSecurityBotPoller, loadBotSettings } = require("./services/securityBotService");
const { purgeInactiveAccounts } = require("./services/accountPurgeService");
const {
  initProcessImmortalityShield,
  startRamBufferGuard,
  startTelegramHeartbeat,
  startEventLoopLagDetector,
  recordServerActivity,
  startIdleMemoryCleaner,
  startDiskQuotaPruner,
  startTempFolderPruner,
  startChatMediaPruner,
} = require("./utils/selfHealingWatchdog");
const { warmCacheOnBoot } = require("./utils/cacheWarmer");
const { ipJailFirewall } = require("./middleware/ipJail");
const { globalSanitizer } = require("./middleware/sanitize");
const { getPublicNoteMeta, buildOgMetaTagsHtml, escapeXmlAndHtml } = require("./utils/ogPreviewHelper");
const { initTursoTables } = require("./services/tursoService");

// 🚀 Pillar 1: Autonomous Self-Healing, Idle Cleaner, 1-Hour Temp Pruner & Disk Pruner
initProcessImmortalityShield();
startEventLoopLagDetector();
startIdleMemoryCleaner(3 * 60 * 1000); // Purge idle memory after 3 min
startDiskQuotaPruner(); // Auto-prune stale CDN files (>30 days / >1.5GB)
startTempFolderPruner(path.join(__dirname, "../temp"), 60 * 60 * 1000);
startChatMediaPruner(path.join(__dirname, "../cache/chat_media")); // Strict 1-Hour Temp Pruner (Upload Immunity Protected)
startRamBufferGuard(path.join(__dirname, "../temp")); // Dynamic Self-Adapting RAM Guard (Auto-scales to 512MB, 1GB, 2GB, 4GB, 8GB)

// ⚡ Pillar 2: Turso (LibSQL / Edge SQLite) Cloud Initialization
initTursoTables().catch((err) => console.warn("[TURSO] Boot init warning:", err.message));
const { initTursoNoticesCacheTables } = require("./services/tursoNoticesCacheService");
initTursoNoticesCacheTables().catch((err) => console.warn("[TURSO-NOTICES-CACHE] Boot init warning:", err.message));
const { initTursoUsersCacheTables, syncAllUsersToTursoCache } = require("./services/tursoUserCacheService");
initTursoUsersCacheTables().then(() => syncAllUsersToTursoCache()).catch((err) => console.warn("[TURSO-USERS-CACHE] Boot init warning:", err.message));
const { initTursoCircleSearchTables } = require("./services/tursoCircleSearchService");
initTursoCircleSearchTables().catch((err) => console.warn("[TURSO-CIRCLE-SEARCH] Boot init warning:", err.message));

const authRoutes = require("./routes/auth");
const passkeyRoutes = require("./routes/passkey");
const uploadRoutes = require("./routes/upload");
const notesRoutes = require("./routes/notes");
const adminRoutes = require("./routes/admin");
const noticesRoutes = require("./routes/notices");
const p2pRoutes = require("./routes/p2p");
const chatRoutes = require("./routes/chat");
const helpRoutes = require("./routes/help");
const securityRoutes = require("./routes/security");
const examRoutes = require("./routes/exam");
const pushRoutes = require("./routes/push");
const aiRoutes = require("./routes/ai");
const { getSiteUrl, getVaultName, DEFAULT_DOMAIN } = require("./config/siteConfig");
const { startAntiSleepService, getAntiSleepTelemetry } = require("./services/antiSleepService");
const { requestTelemetryMiddleware } = require("./services/clusterTelemetryService");

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

// Trust reverse proxy (Cloudflare / Render - full chain resolution)
app.set("trust proxy", true);

// ⚡ Live Request Telemetry Tracker (In-memory, 0ms overhead)
app.use(requestTelemetryMiddleware);

// Record server activity for idle flusher
app.use((req, res, next) => {
  recordServerActivity();
  next();
});

// 🛡️ Pillar 2: Automated IP Jail & Anti-DDoS Firewall
app.use(ipJailFirewall);

// Security & Header Protection with Production Content Security Policy (CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "blob:",
          "https://challenges.cloudflare.com",
          "https://accounts.google.com",
          "https://*.google.com",
          "https://apis.google.com",
          "https://*.google.com",
          "https://ssl.gstatic.com",
          "https://*.gstatic.com",
          "https://www.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://accounts.google.com",
          "https://*.google.com",
          "https://ssl.gstatic.com",
          "https://*.gstatic.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
          process.env.CF_WORKER_URL,
          "https://*.workers.dev",
          "https://accounts.google.com",
          "https://*.google.com",
          "https://oauth2.googleapis.com",
          "https://play.google.com",
          "https://www.googleapis.com",
          "https://api.telegram.org",
          "https://*.firebaseio.com",
          "https://*.googleapis.com",
          "https://ssl.gstatic.com",
          "https://*.gstatic.com",
          "https://www.gstatic.com",
          "https://cdn.jsdelivr.net",
          "https://tessdata.projectnaptha.com",
          "blob:",
          "data:",
          "ws:",
          "wss:",
        ],
        workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net"],
        frameSrc: [
          "'self'",
          "blob:",
          "data:",
          "https://challenges.cloudflare.com",
          process.env.CF_WORKER_URL,
          "https://*.workers.dev",
          "https://accounts.google.com",
          "https://*.google.com",
          "https://drive.google.com",
          "https://*.google.com",
        ].filter(Boolean),
        frameAncestors: ["'self'"],
        objectSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);

// Strict Production CORS Policy (Supports Render, Railway, Vercel, VPS & Custom Domains)
const allowedOrigins = [
  getSiteUrl(),
  process.env.CLIENT_URL,
  process.env.SITE_URL,
  process.env.CUSTOM_DOMAIN,
  process.env.RENDER_EXTERNAL_URL,
  DEFAULT_DOMAIN,
  process.env.CF_WORKER_URL,
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://localhost:5000", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5000"]
    : []),
].filter(Boolean);

const TRUSTED_CORS_ORIGINS = new Set([
  "https://freestudymaterial.pages.dev",
  "https://freestudymaterial.onrender.com",
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
  "https://fsm-edge.jnplotus.workers.dev",
]);

const TRUSTED_DOMAIN_REGEX = /^https:\/\/(freestudymaterial[12]?\.onrender\.com|freestudymaterial\.pages\.dev|fsm-edge\.jnplotus\.workers\.dev)$/i;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (same-origin navigation, server-to-server, curl),
      // but strictly reject "null" origin (sandboxed iframes / file://) when credentials: true is active
      if (!origin) return callback(null, true);
      if (origin === "null") return callback(null, false);
      const cfWorkerUrl = (process.env.CF_WORKER_URL || "").trim();
      const isTrusted =
        allowedOrigins.includes(origin) ||
        (cfWorkerUrl && origin === cfWorkerUrl) ||
        TRUSTED_CORS_ORIGINS.has(origin) ||
        TRUSTED_DOMAIN_REGEX.test(origin) ||
        (process.env.NODE_ENV !== "production" &&
          (origin.includes("localhost") || origin.includes("127.0.0.1")));

      if (isTrusted) {
        return callback(null, true);
      }
      // Dynamic host match (allows custom domain immediately upon deployment)
      try {
        const originUrl = new URL(origin);
        const configuredUrl = new URL(getSiteUrl());
        if (originUrl.host === configuredUrl.host) {
          return callback(null, true);
        }
      } catch (_) {}
      // Standard W3C CORS: Disallow cross-origin requests by omitting allow headers, NEVER throwing 500 error
      return callback(null, false);
    },
    credentials: true,
  })
);

// High-Efficiency Smart Compression Middleware (bypasses binary download streams)
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      // Don't re-compress binary PDF streams or buffer real-time SSE event streams
      if (
        req.path.includes("/stream") ||
        req.path.includes("live-stream") ||
        (req.headers && req.headers.accept === "text/event-stream") ||
        req.path.endsWith(".pdf") ||
        (res.getHeader && res.getHeader("content-type") && String(res.getHeader("content-type")).includes("application/pdf"))
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// Body & Cookie Parsers
// 🛡️ Global JSON limit is 2MB to prevent Heap Exhaustion. /api/ai is granted 15MB for base64 canvas crops.
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith("/api/ai")) {
    return next();
  }
  return express.json({ limit: "2mb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

// 🛡️ Pillar 2: Global Input Sanitizer & Prototype Pollution Guard
app.use(globalSanitizer);

// Real-Time Health & Keep-Alive Endpoint (Zero Database Quota Used - Zero-Cost Cache Epoch Sync)
app.all(["/health", "/api/health", "/api/anti-sleep-relay", "/api/keepalive", "/api/anti-sleep-pulse"], (req, res) => {
  if (req.method === "HEAD") {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(200).end();
  }
  let epoch = 1;
  let wipeRequired = false;
  try {
    const adminRouter = require("./routes/admin");
    if (adminRouter) {
      if (typeof adminRouter.getClientCacheEpoch === "function") {
        epoch = adminRouter.getClientCacheEpoch();
      }
      const authHeader = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
      const token = authHeader || (req.cookies && req.cookies.vault_token);
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const { JWT_SECRET } = require("./middleware/auth");
          const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
          if (decoded && (adminRouter.isPendingUserStorageWipe(decoded.id) || adminRouter.isPendingUserStorageWipe(decoded.email))) {
            wipeRequired = true;
            adminRouter.clearPendingUserStorageWipe(decoded.id);
            adminRouter.clearPendingUserStorageWipe(decoded.email);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("x-fsm-cache-epoch", String(epoch));
  if (wipeRequired) {
    res.set("x-fsm-wipe-cache", "1");
  }

  res.json({
    status: "online",
    service: "freestudymaterial",
    epoch,
    wipeRequired,
    antiSleep: getAntiSleepTelemetry(),
    timestamp: new Date().toISOString(),
  });
});

// Maintenance Mode Guard (Allows website to remain hosted while temporarily pausing public access)
const { checkMaintenanceMode } = require("./middleware/maintenance");
app.use(checkMaintenanceMode);

// Rate limiter for standard API routes
app.use("/api", globalLimiter);

// 🛡️ Category 2 Feature 4: Same-Origin & CSRF Guard for Mutating Requests
const { sameOriginGuard } = require("./middleware/csrfGuard");
app.use("/api", sameOriginGuard);

// API Routing
app.use("/api/auth/passkey", passkeyRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notices", noticesRoutes);
app.use("/api/p2p", p2pRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/ai", express.json({ limit: "15mb" }), aiRoutes);

// Serve Client Web Application (Vite Dist) & Public Assets with proper PWA Cache-Control
const distPath = path.join(__dirname, "../dist");
const publicPath = path.join(__dirname, "../public");

app.use(
  express.static(publicPath, {
    setHeaders: (res, filePath) => {
      if (filePath.includes("tesseract")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// 🤖 Google SEO: Dynamic robots.txt (allows public catalog, branch & note pages; blocks private APIs & raw streams)
app.get("/robots.txt", (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "freestudymaterial.pages.dev";
  const originUrl = `${proto}://${host}`;
  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    "Allow: /branch/",
    "Allow: /note/",
    "Disallow: /api/admin/",
    "Disallow: /api/auth/",
    "Disallow: /api/chat/",
    "Disallow: /api/security/",
    "Disallow: /api/help/admin/",
    "Disallow: /api/notes/*/stream",
    `Sitemap: ${originUrl}/sitemap.xml`,
    "",
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).send(robotsTxt);
});

// 🗺️ Google SEO: Dynamic 0-Firestore-Read XML Sitemap (served directly from RAM/Turso cache + 1h Edge Cache)
app.get("/sitemap.xml", async (req, res) => {
  try {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.get("host") || "freestudymaterial.pages.dev";
    const originUrl = `${proto}://${host}`;
    let cachedNotes = [];
    try {
      const { getAllCachedNotes } = require("./services/tursoNotesCacheService");
      cachedNotes = (await getAllCachedNotes()) || [];
    } catch (_) {}

    const visibleNotes = cachedNotes.filter((n) => n && n.id && n.isVisible !== false);
    const branches = Array.from(
      new Set(visibleNotes.map((n) => String(n.branch || "").trim().toUpperCase()).filter(Boolean))
    );
    const nowIso = new Date().toISOString().split("T")[0];

    const urlEntries = [
      `  <url><loc>${escapeXmlAndHtml(originUrl)}/</loc><lastmod>${nowIso}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ];

    for (const br of branches) {
      urlEntries.push(
        `  <url><loc>${escapeXmlAndHtml(originUrl)}/branch/${encodeURIComponent(br)}</loc><lastmod>${nowIso}</lastmod><changefreq>daily</changefreq><priority>0.85</priority></url>`
      );
    }

    for (const n of visibleNotes.slice(0, 1000)) {
      const modDate = (n.updatedAt || n.createdAt || nowIso).toString().slice(0, 10);
      urlEntries.push(
        `  <url><loc>${escapeXmlAndHtml(originUrl)}/note/${encodeURIComponent(n.id)}</loc><lastmod>${escapeXmlAndHtml(modDate)}</lastmod><changefreq>weekly</changefreq><priority>0.75</priority></url>`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join("\n")}\n</urlset>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  } catch (err) {
    return res.status(500).send("Sitemap temporarily unavailable");
  }
});

// 🔗 Smart Google SEO + WhatsApp / Telegram Dynamic OG & JSON-LD Injector for Note (/note/ID, /?note=ID) & Branch (/branch/CSE) pages
app.get("*", async (req, res, next) => {
  const pathMatch = req.path.match(/^\/note\/([^/]+)\/?$/i);
  const branchMatch = req.path.match(/^\/branch\/([^/]+)\/?$/i);
  const sharedNoteId = (req.query?.note || req.query?.noteId || (pathMatch && pathMatch[1]) || "").trim();
  const branchSlug = branchMatch ? decodeURIComponent(branchMatch[1]).trim() : "";
  if (
    (!sharedNoteId && !branchSlug) ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/assets/") ||
    /\.(js|css|mjs|map|png|jpg|jpeg|svg|ico|woff2?|json|xml|txt)$/i.test(req.path)
  ) {
    return next();
  }

  try {
    const fs = require("fs");
    const indexPath = path.join(distPath, "index.html");
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const originUrl = `${proto}://${host}`;
    const pageUrl = `${originUrl}${req.originalUrl}`;

    let pageTitle = "Free Study Material — Academic Cloud & Notes Vault";
    let extraMetaHtml = "";

    if (sharedNoteId) {
      const noteMeta = await getPublicNoteMeta(sharedNoteId);
      const ogTags = buildOgMetaTagsHtml(noteMeta, pageUrl, originUrl);
      pageTitle = noteMeta
        ? `${escapeXmlAndHtml(noteMeta.title)} — ${escapeXmlAndHtml(noteMeta.subject)} | Free Study Material`
        : pageTitle;
      const canonicalUrl = `${originUrl}/note/${encodeURIComponent(sharedNoteId)}`;
      const ldJson = noteMeta
        ? `<script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LearningResource",
            name: noteMeta.title,
            educationalLevel: noteMeta.course || "University",
            about: noteMeta.subject || noteMeta.branch || "Engineering",
            inLanguage: "en",
            isAccessibleForFree: true,
            url: canonicalUrl,
            provider: { "@type": "EducationalOrganization", name: "Free Study Material", url: originUrl },
          }).replace(/</g, "\\u003c")}</script>`
        : "";
      extraMetaHtml = `<link rel="canonical" href="${escapeXmlAndHtml(canonicalUrl)}" />${ogTags}${ldJson}`;
    } else if (branchSlug) {
      const cleanBranch = escapeXmlAndHtml(branchSlug.toUpperCase());
      pageTitle = `${cleanBranch} Study Notes & PYQs — Free Study Material`;
      const desc = `Download & read free ${cleanBranch} engineering study notes, handwritten lectures, and previous year question papers on Free Study Material.`;
      const canonicalUrl = `${originUrl}/branch/${encodeURIComponent(branchSlug.toUpperCase())}`;
      extraMetaHtml =
        `<link rel="canonical" href="${escapeXmlAndHtml(canonicalUrl)}" />` +
        `<meta name="description" content="${escapeXmlAndHtml(desc)}" />` +
        `<meta property="og:title" content="${pageTitle}" />` +
        `<meta property="og:description" content="${escapeXmlAndHtml(desc)}" />` +
        `<meta property="og:url" content="${escapeXmlAndHtml(canonicalUrl)}" />`;
    }

    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf8");
      html = html.replace(/<link\s+rel="canonical"[^>]*>/i, "");
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>${extraMetaHtml}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
      return res.status(200).send(html);
    }

    // Minimal crawler-friendly fallback if dist isn't built yet
    return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>${pageTitle}</title>${extraMetaHtml}</head><body><h1>${pageTitle}</h1></body></html>`);
  } catch (_) {
    return next();
  }
});

app.use(
  express.static(distPath, {
    maxAge: "1d",
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("sw.js") || filePath.endsWith("index.html") || filePath.endsWith("manifest.json")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes("tesseract")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/[\\/]assets[\\/].*-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|ttf|mjs|svg|png|jpg|webp)$/i.test(filePath)) {
        // Hashed assets: 100% Immutable 1-Year Disk Cache (0 Render bandwidth on repeat visits!)
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/[\\/]assets[\\/]/.test(filePath)) {
        // Unhashed or worker chunks: Cache for 7 days with stale-while-revalidate
        res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      }
    },
  })
);

// SPA Catch-All Route
app.get("*", (req, res) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/assets/") ||
    /\.(js|css|mjs|map|png|jpg|jpeg|svg|ico|woff2?)$/i.test(req.path)
  ) {
    return res.status(404).json({ success: false, message: "Resource not found" });
  }
  const indexPath = path.join(distPath, "index.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Free Study Material</title></head>
        <body style="font-family:sans-serif;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h1>🚀 Academic Cloud API Online</h1>
            <p>Domain: ${getSiteUrl() || "not configured"}</p>
            <p>Run <code>npm run build</code> to generate frontend bundle.</p>
          </div>
        </body>
        </html>
      `);
    }
  });
});

// 🛡️ Central Graceful Error Handler (Catches all unexpected errors & prevents raw 500 white screens)
app.use((err, req, res, next) => {
  console.warn(`[EXPRESS-ERROR-GUARD] ⚠️ Caught error on ${req.method} ${req.path}:`, err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "An unexpected server condition occurred. Please try again.",
    });
  }
  // For document/page requests, safely serve the React application shell
  const indexPath = path.join(distPath, "index.html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.status(200).sendFile(indexPath, (sendErr) => {
    if (sendErr) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Free Study Material</title></head>
        <body style="font-family:sans-serif;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h1>Free Study Material Vault</h1>
            <p>Academic Cloud is connecting... Please refresh.</p>
            <script>setTimeout(function(){ window.location.reload(); }, 2500);</script>
          </div>
        </body>
        </html>
      `);
    }
  });
});

// Start Server with Real-Time WebSocket Support
const server = http.createServer(app);
// 🛡️ Traffic Spike & Reverse Proxy Keep-Alive Hardening (Prevents 502 Bad Gateway under sudden bursts)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 300000; // 300s (5 minutes) prevents cutting off slow mobile uploads and long PDF streams
if (server.maxRequestsPerSocket !== undefined) {
  server.maxRequestsPerSocket = 1000;
}
chatRoutes.initChatWebSocket(server);

const initialPort = Number(PORT);

function startServer(portToTry, attempt = 1) {
  server.once("error", (err) => {
    if ((err.code === "EADDRINUSE" || err.code === "EACCES") && attempt < 5) {
      console.warn(`[SERVER] Port ${portToTry} unavailable (${err.code}). Auto-switching to ${portToTry + 1}...`);
      startServer(portToTry + 1, attempt + 1);
    } else {
      console.error(`[SERVER] Fatal listen error on port ${portToTry}:`, err.message);
    }
  });

  // 🛡️ High-Concurrency TCP Backlog (2,048 Queue Depth): Prevents ECONNREFUSED under massive traffic surges
  server.listen(portToTry, HOST, 2048, async () => {
    console.log(`=======================================================`);
    console.log(`⚡ ${getVaultName().toUpperCase()} RUNNING ON PORT ${portToTry}`);
    console.log(`🌐 Domain: ${getSiteUrl()}`);
    console.log(`🧬 SHA-256 Deduplication: ENABLED`);
    console.log(`🗜️ PDF Compressor (pdf-lib): ENABLED`);
    console.log(`⚡ Async Background Queue: ENABLED`);
    console.log(`🖼️ Sharp WebP Thumbnails: ENABLED`);
    console.log(`☁️ Cloudflare CDN LRU Headers: ACTIVE`);
    console.log(`=======================================================`);

    // 🛡️ 1. 24/7 Anti-Sleep Immortality Engine (STARTS IMMEDIATELY to guarantee Render stays 100% awake)
    try {
      startAntiSleepService(portToTry);
    } catch (antiSleepErr) {
      console.warn("[ANTI-SLEEP] Init warning:", antiSleepErr.message);
    }

    // 2. Asynchronously connect Telegram MTProto client (Non-blocking background connection)
    (async () => {
      try {
        await getClient();
      } catch (e) {
        console.warn("[MTProto] Telegram connect deferred:", e.message);
      }
    })();

    // 3. Start Realtime Bot API Long-Polling (DM + Group + Subgroup ingest + receipts)
    try {
      startBotPoller();
    } catch (e) {
      console.warn("[BOT POLLER] Poller start deferred:", e.message);
    }

    // 4. Start Event-Driven Two-Way Auto-Sync with Real-Time 10s Fast Liveness Guard
    try {
      startAutoSyncWorker(2 * 60 * 1000);
    } catch (e) {
      console.warn("[MTProto AUTOSYNC] Worker start deferred:", e.message);
    }

    // 5. Load Security Bot Single-Document Settings (Non-blocking)
    if (loadBotSettings) {
      loadBotSettings().catch((e) => console.warn("[SECURITY BOT] Settings load notice:", e.message));
    }

    // Start Dedicated Security OTP Bot Poller (@fsm_security_otp_bot)
    try {
      if (startSecurityBotPoller) startSecurityBotPoller();
    } catch (e) {
      console.warn("[SECURITY BOT] Poller start deferred:", e.message);
    }

    // Start Dedicated Chat Audit & Forensic Bot Poller (@fsm_chat_bot)
    try {
      const { startChatAuditBotPoller } = require("./services/chatAuditBotService");
      startChatAuditBotPoller();
    } catch (e) {
      console.warn("[CHAT AUDIT BOT] Poller start deferred:", e.message);
    }

    // Start Live Firebase User Deletion Watcher (Auto-cascades direct Firebase Console deletions)
    try {
      const { initFirebaseUserDeletionWatcher } = require("./services/userCascadeDeletionService");
      if (initFirebaseUserDeletionWatcher) initFirebaseUserDeletionWatcher();
    } catch (e) {
      console.warn("[CASCADE-WATCHER] Start deferred:", e.message);
    }

    // Periodic 90-Day Inactive Account Purge (Daily sweep + 30s initial warmup)
    try {
      setTimeout(() => {
        purgeInactiveAccounts().catch((e) => console.warn("[ACCOUNT PURGE] Initial sweep error:", e.message));
      }, 30000);
      setInterval(() => {
        purgeInactiveAccounts().catch((e) => console.warn("[ACCOUNT PURGE] Daily sweep error:", e.message));
      }, 24 * 60 * 60 * 1000);
    } catch (e) {
      console.warn("[ACCOUNT PURGE] Scheduler setup error:", e.message);
    }

    // ⏰ Start Telegram Exam Countdown & Daily Revision Buddy Scheduler (0 DB Reads, Pure Edge/RAM)
    try {
      const { startExamCountdownScheduler } = require("./services/examBuddyService");
      if (startExamCountdownScheduler) {
        startExamCountdownScheduler();
      }
    } catch (e) {
      console.warn("[EXAM BUDDY] Scheduler start deferred:", e.message);
    }

    // 🧹 2. Smart Dynamic RAM Buffer Guard & Multi-Tier Auto-Purge
    try {
      const tempDir = path.join(__dirname, "../temp");
      startRamBufferGuard(tempDir);
    } catch (guardErr) {
      console.warn("[SELF-HEALING-GUARD] Init warning:", guardErr.message);
    }

    // 📡 4. Network & Telegram Bot Auto-Reconnection Engine (Modern Event-Driven + Smart Exponential Backoff)
    try {
      startTelegramHeartbeat(async () => {
        try {
          await getClient();
          startBotPoller();
        } catch (_) {}
      });
      console.log("[SELF-HEALING-MONITOR] 📡 Event-Driven Auto-Reconnection Monitor registered.");
    } catch (pulseErr) {
      console.warn("[SELF-HEALING-MONITOR] Init warning:", pulseErr.message);
    }

    // 🏎️ Cold-Start Cache Warmer (Pre-warms top notes into RAM 4s after boot for 0ms initial load)
    try {
      setTimeout(() => {
        warmCacheOnBoot().catch((e) => console.warn("[CACHE-WARMER] Boot warmup warning:", e.message));
      }, 4000);
    } catch (warmerErr) {
      console.warn("[CACHE-WARMER] Init warning:", warmerErr.message);
    }
  });
}

startServer(initialPort);

module.exports = app;
