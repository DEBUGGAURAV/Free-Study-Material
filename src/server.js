require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const os = require("os");

const { ramCache } = require("./utils/ramCache");
const { globalLimiter } = require("./middleware/rateLimit");
const { getClient } = require("./telegram/mtproto");

const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const notesRoutes = require("./routes/notes");
const adminRoutes = require("./routes/admin");
const noticesRoutes = require("./routes/notices");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Cloudflare / Render)
app.set("trust proxy", 1);

// Security & Header Protection
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Policy
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://freestudymaterial.onrender.com",
  "http://localhost:5173",
  "http://localhost:5000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Allow flexible access
    },
    credentials: true,
  })
);

// Smart Gzip HTTP Compression (Bypasses binary streams)
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.includes("/stream")) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
  })
);

// Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Real-Time Health & System Diagnostics (Excluded from rate limiter)
app.get("/api/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "online",
    engine: "Academic Cloud v3 (Ultra-Fast)",
    service: "freestudymaterial",
    domain: "freestudymaterial.onrender.com",
    features: [
      "SHA-256 Deduplication (0s Duplicate Reuse)",
      "PDF Compressor (pdf-lib 75% Data Saver)",
      "PassThrough Streaming (2x Fast IO)",
      "Async Background Queue (< 2s Feedback)",
      "Sharp WebP Thumbnails",
      "Cloudflare CDN Edge LRU Caching",
      "Telegram MTProto 2GB Streaming",
    ],
    uptime: Math.floor(process.uptime()) + "s",
    memoryUsageMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    cacheStats: ramCache.getStats(),
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
});

module.exports = app;

