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

const { ramCache } = require("./utils/ramCache");
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
  getWatchdogStats,
  recordServerActivity,
  startIdleMemoryCleaner,
  startDiskQuotaPruner,
  startTempFolderPruner,
} = require("./utils/selfHealingWatchdog");
const { warmCacheOnBoot } = require("./utils/cacheWarmer");
const { ipJailFirewall } = require("./middleware/ipJail");
const { globalSanitizer } = require("./middleware/sanitize");
const { initTursoTables } = require("./services/tursoService");

// 🚀 Pillar 1: Autonomous Self-Healing, Idle Cleaner, 1-Hour Temp Pruner & Disk Pruner
initProcessImmortalityShield();
startEventLoopLagDetector();
startIdleMemoryCleaner(3 * 60 * 1000); // Purge idle memory after 3 min
startDiskQuotaPruner(); // Auto-prune stale CDN files (>30 days / >1.5GB)
startTempFolderPruner(path.join(__dirname, "../temp"), 60 * 60 * 1000); // Strict 1-Hour Temp Pruner (Upload Immunity Protected)
startRamBufferGuard(path.join(__dirname, "../temp")); // Dynamic Self-Adapting RAM Guard (Auto-scales to 512MB, 1GB, 2GB, 4GB, 8GB)

// ⚡ Pillar 2: Turso (LibSQL / Edge SQLite) Cloud Initialization
initTursoTables().catch((err) => console.warn("[TURSO] Boot init warning:", err.message));

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
const { getSiteUrl, getSiteName, getVaultName, DEFAULT_DOMAIN } = require("./config/siteConfig");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Cloudflare / Render)
app.set("trust proxy", 1);

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
          "https://accounts.google.com",
          "https://apis.google.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: [
          "'self'",
          process.env.CF_WORKER_URL,
          "https://*.workers.dev",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
          "https://api.telegram.org",
          "https://*.firebaseio.com",
          "https://*.googleapis.com",
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
          "https://accounts.google.com",
          "https://drive.google.com",
          "https://*.google.com",
        ],
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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-side keep-alive self-ping, mobile apps, curl)
      if (!origin) return callback(null, true);
      const cfWorkerUrl = (process.env.CF_WORKER_URL || "").trim();
      if (
        allowedOrigins.includes(origin) ||
        (cfWorkerUrl && origin === cfWorkerUrl) ||
        origin.endsWith(".workers.dev") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
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
      return callback(new Error("CORS policy violation: Access from this origin is not permitted."));
    },
    credentials: true,
  })
);

// High-Efficiency Smart Compression Middleware (bypasses binary download streams)
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.includes("/stream")) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// Body & Cookie Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// 🛡️ Pillar 2: Global Input Sanitizer & Prototype Pollution Guard
app.use(globalSanitizer);

// Real-Time Health & Keep-Alive Endpoint (Zero Database Quota Used - Zero-Cost Cache Epoch Sync)
app.all(["/health", "/api/health"], (req, res) => {
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
          const decoded = jwt.decode(token);
          if (decoded && (adminRouter.isPendingUserStorageWipe(decoded.id) || adminRouter.isPendingUserStorageWipe(decoded.email))) {
            wipeRequired = true;
            adminRouter.clearPendingUserStorageWipe(decoded.id);
            adminRouter.clearPendingUserStorageWipe(decoded.email);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  res.set("x-fsm-cache-epoch", String(epoch));
  if (wipeRequired) {
    res.set("x-fsm-wipe-cache", "1");
  }

  res.json({
    status: "online",
    service: "freestudymaterial",
    epoch,
    wipeRequired,
    timestamp: new Date().toISOString(),
  });
});

// Maintenance Mode Guard (Allows website to remain hosted while temporarily pausing public access)
const { checkMaintenanceMode } = require("./middleware/maintenance");
app.use(checkMaintenanceMode);

// Rate limiter for standard API routes
app.use("/api", globalLimiter);

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

app.use(
  express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("sw.js") || filePath.endsWith("index.html") || filePath.endsWith("manifest.json")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes("tesseract") || /[\\/]assets[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// SPA Catch-All Route
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: "API endpoint not found" });
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
            <p>Domain: freestudymaterial.onrender.com</p>
            <p>Run <code>npm run build</code> to generate frontend bundle.</p>
          </div>
        </body>
        </html>
      `);
    }
  });
});

// Start Server with Real-Time WebSocket Support
const server = http.createServer(app);
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

  server.listen(portToTry, "0.0.0.0", async () => {
    console.log(`=======================================================`);
    console.log(`⚡ ${getVaultName().toUpperCase()} RUNNING ON PORT ${portToTry}`);
    console.log(`🌐 Domain: ${getSiteUrl()}`);
    console.log(`🧬 SHA-256 Deduplication: ENABLED`);
    console.log(`🗜️ PDF Compressor (pdf-lib): ENABLED`);
    console.log(`⚡ Async Background Queue: ENABLED`);
    console.log(`🖼️ Sharp WebP Thumbnails: ENABLED`);
    console.log(`☁️ Cloudflare CDN LRU Headers: ACTIVE`);
    console.log(`=======================================================`);

    // Asynchronously connect Telegram MTProto client
    try {
      await getClient();
    } catch (e) {
      console.warn("[MTProto] Telegram connect deferred:", e.message);
    }

    // Start Realtime Bot API Long-Polling (DM + Group + Subgroup ingest + receipts)
    try {
      startBotPoller();
    } catch (e) {
      console.warn("[BOT POLLER] Poller start deferred:", e.message);
    }

    // Start 30-Minute Quota-Saver & Event-Driven Two-Way Auto-Sync
    try {
      startAutoSyncWorker(30 * 60 * 1000);
    } catch (e) {
      console.warn("[MTProto AUTOSYNC] Worker start deferred:", e.message);
    }

    // Load Security Bot Single-Document Settings
    try {
      if (loadBotSettings) await loadBotSettings();
    } catch (e) {
      console.warn("[SECURITY BOT] Settings load notice:", e.message);
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

    // 🛡️ 24/7 Anti-Sleep Immortality Engine (Prevents Render Free Tier 15-Minute Sleep)
    if (process.env.DISABLE_KEEP_ALIVE !== "true") {
      const KEEP_ALIVE_URL = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || getSiteUrl()).replace(/\/+$/, "");
      const intervalMinutes = Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 12;
      const KEEP_ALIVE_INTERVAL = intervalMinutes * 60 * 1000; // 12 minutes (Render sleeps at 15m, 12m guarantees 100% continuous uptime)

      const pingSelf = async (retryCount = 0) => {
        try {
          const pingEndpoint = `${KEEP_ALIVE_URL}/health`;
          const res = await fetch(pingEndpoint, {
            headers: {
              "User-Agent": "AcademicCloud-KeepAlive/2.0",
              "Cache-Control": "no-cache, no-store",
              "Pragma": "no-cache",
            },
            signal: AbortSignal.timeout(12000),
          });
          if (res.ok) {
            console.log(`[ANTI-SLEEP] 💓 24/7 Keep-Alive Ping successful: ${pingEndpoint} (Status: ${res.status}) - Platform stays ACTIVE 24/7 (${intervalMinutes}m pulse)`);
          } else {
            console.warn(`[ANTI-SLEEP] ⚠️ Ping returned status ${res.status} from ${pingEndpoint}. Retrying in 25s...`);
            if (retryCount < 3) {
              setTimeout(() => pingSelf(retryCount + 1), 25000);
            }
          }
        } catch (e) {
          console.warn(`[ANTI-SLEEP] ⚠️ Keep-Alive Ping notice: ${e.message}. Retrying in 25s...`);
          if (retryCount < 3) {
            setTimeout(() => pingSelf(retryCount + 1), 25000);
          }
        }
      };

      // Initial ping after 30 seconds of boot, then recurring every 12 minutes
      setTimeout(() => pingSelf(0), 30 * 1000);
      setInterval(() => pingSelf(0), KEEP_ALIVE_INTERVAL);
    }
  });
}

startServer(initialPort);

module.exports = app;

