require("dotenv").config();
const express = require("express");
const path = require("path");
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
} = require("./utils/selfHealingWatchdog");
const { warmCacheOnBoot } = require("./utils/cacheWarmer");

// 🚀 3. Global Process Immortality Shield (Zero-Downtime Protection: Intercepts & Isolates Unhandled Errors)
initProcessImmortalityShield();

// ⏱️ 5. Event-Loop Lag Detector (Monitors Event Loop Lag to Prevent Web Freeze)
startEventLoopLagDetector();

const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const notesRoutes = require("./routes/notes");
const adminRoutes = require("./routes/admin");
const noticesRoutes = require("./routes/notices");
const p2pRoutes = require("./routes/p2p");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Cloudflare / Render)
app.set("trust proxy", 1);

// Security & Header Protection with Production Content Security Policy (CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://accounts.google.com",
          "https://apis.google.com",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: [
          "'self'",
          "https://fsm-edge.jnplotus.workers.dev",
          "https://*.workers.dev",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
          "https://api.telegram.org",
          "https://*.firebaseio.com",
          "https://*.googleapis.com",
          "blob:",
          "data:",
          "ws:",
          "wss:",
        ],
        workerSrc: ["'self'", "blob:"],
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

// Strict Production CORS Policy (Supports Render & Cloudflare Worker Edge)
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://freestudymaterial.onrender.com",
  "https://freestudtmaterial.onrender.com",
  "https://fsm-edge.jnplotus.workers.dev",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://localhost:5000", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5000"]
    : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-side keep-alive self-ping, mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith(".workers.dev")) {
        return callback(null, true);
      }
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

// Real-Time Health & Keep-Alive Endpoint (Zero Database Quota Used - Information Leakage Protected)
app.get(["/health", "/api/health"], (req, res) => {
  res.json({
    status: "online",
    service: "freestudymaterial",
    timestamp: new Date().toISOString(),
  });
});

// Rate limiter for standard API routes
app.use("/api", globalLimiter);

// API Routing
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notices", noticesRoutes);
app.use("/api/p2p", p2pRoutes);

// Serve Client Web Application (Vite Dist) with immutable caching for hashed assets
const distPath = path.join(__dirname, "../dist");
app.use(
  express.static(distPath, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      if (filePath.includes("/assets/")) {
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

// Start Server
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`⚡ ACADEMIC CLOUD ENGINE RUNNING ON PORT ${PORT}`);
  console.log(`🌐 Domain: https://freestudymaterial.onrender.com`);
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

  // 🧹 2. Smart RAM Buffer Guard & Auto-Garbage Collection (380MB threshold on Render 512MB RAM)
  try {
    const tempDir = path.join(__dirname, "../temp");
    startRamBufferGuard(tempDir, 380);
    console.log("[SELF-HEALING-GUARD] 🧹 Smart RAM Buffer Guard active (380MB Auto-Purge Threshold).");
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

  // Anti-Sleep Keep-Alive Self-Ping Engine (Prevents Render Free Tier 15-Minute Sleep)
  const KEEP_ALIVE_URL = process.env.RENDER_EXTERNAL_URL || "https://freestudymaterial.onrender.com";
  const KEEP_ALIVE_INTERVAL = 12 * 60 * 1000; // 12 minutes (safely under Render's 15m idle cutoff)

  const pingSelf = async () => {
    try {
      const pingEndpoint = `${KEEP_ALIVE_URL}/health`;
      const res = await fetch(pingEndpoint, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        console.log(`[ANTI-SLEEP] 💓 Self-ping successful: ${pingEndpoint} (Status: ${res.status}) - Render kept awake 24/7`);
      }
    } catch (e) {
      console.warn("[ANTI-SLEEP] Self-ping notice:", e.message);
    }
  };

  // Initial ping after 3 minutes, then recurring every 12 minutes
  setTimeout(pingSelf, 3 * 60 * 1000);
  setInterval(pingSelf, KEEP_ALIVE_INTERVAL);
});

module.exports = app;

