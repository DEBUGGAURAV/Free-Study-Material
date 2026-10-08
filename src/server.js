require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Initialize and start Telegram Bot
const bot = require("./telegram/bot");
const { db } = require("./firebase");

// Routes & Middleware
const notesRoutes = require("./routes/notes");
const uploadRoutes = require("./routes/upload");
const { globalLimiter } = require("./middleware/rateLimit");
const { auth } = require("./middleware/auth");

const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

// Automatic 301 Permanent Redirect: free-study-material.onrender.com -> freestudymaterial.onrender.com
app.use((req, res, next) => {
  const host = req.headers.host || "";
  if (host.includes("free-study-material.onrender.com")) {
    return res.redirect(301, `https://freestudymaterial.onrender.com${req.originalUrl}`);
  }
  next();
});

const allowedOrigins = [
  "https://freestudymaterial.onrender.com",
  "https://free-study-material.onrender.com",
  "http://localhost:5173",
  "http://localhost:5000"
];
if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".onrender.com")) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for universal client connectivity
  },
  credentials: true
}));
app.use(express.json({ limit: "100kb" }));

// Rate Limiting on API routes
app.use("/api", globalLimiter);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Free Study Material API & Telegram Storage Bot are running",
    storageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID || "Not configured",
  });
});

// API Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const foldersRoutes = require("./routes/folders");
const noticesRoutes = require("./routes/notices");

// User Profile Routes (/api/me)
const meRouter = express.Router();
meRouter.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.uid || req.user.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user: { id: snap.id, ...snap.data(), passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

meRouter.patch("/", auth, async (req, res) => {
  try {
    const userId = req.user.uid || req.user.userId;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const updates = { ...req.body };
    delete updates.password;
    delete updates.passwordHash;
    delete updates.role;
    delete updates.blocked;
    updates.updatedAt = new Date().toISOString();

    await db.collection("users").doc(userId).set(updates, { merge: true });
    const updatedSnap = await db.collection("users").doc(userId).get();
    res.json({ success: true, user: { id: updatedSnap.id, ...updatedSnap.data(), passwordHash: undefined } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use("/api/me", meRouter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/folders", foldersRoutes);
app.use("/api/notices", noticesRoutes);
app.use("/api/notes/upload", uploadRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notes", notesRoutes);

// Universal direct download routes and aliases
app.use("/api/download", notesRoutes);
app.get("/download/:id", (req, res) => res.redirect(`/api/notes/${req.params.id}/download`));
app.get("/api/download/:id", (req, res) => res.redirect(`/api/notes/${req.params.id}/download`));
app.get("/api/notes/download/:id", (req, res) => res.redirect(`/api/notes/${req.params.id}/download`));

// Dynamic Frontend static assets resolution
const possibleDistPaths = [
  path.join(process.cwd(), "dist"),
  path.join(__dirname, "dist"),
  path.join(__dirname, "../dist")
];
let distPath = possibleDistPaths.find(p => fs.existsSync(path.join(p, "index.html")));
if (!distPath) {
  distPath = path.join(process.cwd(), "dist");
}
console.log(`[Static Server] Serving frontend from: ${distPath}`);
app.use(express.static(distPath));

// API 404 handler
app.use("/api/*", (req, res) => res.status(404).json({ success: false, message: "Endpoint not found" }));

// Client SPA fallback
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(503).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Free Study Material - Starting</title></head>
      <body style="font-family:sans-serif;background:#080b12;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;text-align:center;padding:20px;">
        <h2 style="margin-bottom:8px;">Free Study Material Starting Up</h2>
        <p style="color:#94a3b8;max-width:400px;">The production bundle is initializing. Please refresh in a moment.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Free Study Material Server running on port ${PORT}`);
});
