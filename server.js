require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Initialize and start Telegram Bot
const bot = require("./telegram/bot");

// Routes & Middleware
const notesRoutes = require("./routes/notes");
const uploadRoutes = require("./routes/upload");
const { globalLimiter } = require("./middleware/rateLimit");

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// Rate Limiting on API routes
app.use("/api", globalLimiter);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Tech Titan API & Telegram Storage Bot are running",
    storageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID || "Not configured",
  });
});

// API Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const foldersRoutes = require("./routes/folders");
const noticesRoutes = require("./routes/notices");

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/folders", foldersRoutes);
app.use("/api/notices", noticesRoutes);
app.use("/api/notes/upload", uploadRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notes", notesRoutes);

// Serve Frontend static assets from dist folder if it exists
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

// API 404 handler
app.use("/api/*", (req, res) => res.status(404).json({ success: false, message: "Endpoint not found" }));

// Client SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) {
      res.status(404).json({ success: false, message: "Endpoint not found" });
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
