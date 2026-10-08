const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { ramCache, invalidateAllCache } = require("../utils/ramCache");
const { downloadLimiter } = require("../middleware/rateLimit");
const { streamDocumentFromChannel } = require("../telegram/mtproto");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

/**
 * GET /api/notes
 * Fetches list of notes with in-memory RAM caching for 1ms response
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { branch, semester, subject, search, status } = req.query;
    const isAdmin = req.user?.role === "admin" || req.user?.email === "jnplotus@gmail.com";

    const cacheKey = `notes_${branch || "all"}_${semester || "all"}_${subject || "all"}_${search || "none"}_${isAdmin ? "admin" : "public"}`;
    const cachedData = ramCache.get(cacheKey);

    if (cachedData) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ success: true, notes: cachedData, count: cachedData.length });
    }

    if (!db) {
      return res.json({ success: true, notes: [], count: 0 });
    }

    let query = db.collection("notes");

    // Default: Only ready notes for public
    if (!isAdmin) {
      query = query.where("isVisible", "==", true);
    }

    const snapshot = await query.get();
    let notes = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      notes.push({
        id: doc.id,
        ...data,
      });
    });

    // Client/Server side filtering
    if (branch && branch !== "All") {
      notes = notes.filter((n) => (n.branch || "").toLowerCase() === branch.toLowerCase());
    }

    if (semester && semester !== "All") {
      notes = notes.filter((n) => (n.semester || "").toLowerCase() === semester.toLowerCase());
    }

    if (subject && subject !== "All") {
      notes = notes.filter((n) => (n.subject || "").toLowerCase().includes(subject.toLowerCase()));
    }

    if (search && search.trim() !== "") {
      const q = search.toLowerCase();
      notes = notes.filter((n) =>
        (n.title || "").toLowerCase().includes(q) ||
        (n.subject || "").toLowerCase().includes(q) ||
        (n.description || "").toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort by newest first
    notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Cache in RAM for 60 seconds
    ramCache.set(cacheKey, notes, 60);

    res.setHeader("X-Cache", "MISS");
    return res.json({ success: true, notes, count: notes.length });
  } catch (err) {
    console.error("[NOTES] Query error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notes." });
  }
});

/**
 * GET /api/notes/:id
 * Single note details
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(404).json({ success: false, message: "Database not connected" });

    const doc = await db.collection("notes").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    return res.json({ success: true, note: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/notes/:id/stream
 * High-speed direct streaming download via Telegram MTProto with Cloudflare Edge CDN Caching
 */
router.get("/:id/stream", downloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "Database unavailable" });

    const doc = await db.collection("notes").doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    const note = doc.data();
    if (!note.telegramMessageId) {
      return res.status(400).json({
        success: false,
        message: note.status === "processing" 
          ? "Note is currently being processed in background queue. Please wait a few seconds." 
          : "Note file is missing from cloud vault.",
      });
    }

    // Cloudflare Edge Cache & Browser Cache Headers (Unlimited LRU Cache)
    const sanitizedName = (note.originalName || `${note.title}.pdf`).replace(/"/g, "");
    res.setHeader("Content-Disposition", `inline; filename="${sanitizedName}"`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("CDN-Cache-Control", "public, max-age=31536000");
    res.setHeader("Cloudflare-CDN-Cache-Control", "max-age=31536000");
    res.setHeader("ETag", `W/"${note.fileHash || note.id}"`);

    // Asynchronously increment download count
    db.collection("notes").doc(id).update({
      downloadsCount: (note.downloadsCount || 0) + 1,
    }).catch(() => {});

    // Stream directly from Telegram DC via MTProto 8-Worker engine
    await streamDocumentFromChannel(note.telegramMessageId, res, req.headers.range);
  } catch (err) {
    console.error("[STREAM] Error streaming note:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Streaming error: " + err.message });
    }
  }
});

module.exports = router;
