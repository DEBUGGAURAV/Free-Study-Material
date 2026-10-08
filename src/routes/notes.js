const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { ramCache, invalidateAllCache } = require("../utils/ramCache");
const { downloadLimiter } = require("../middleware/rateLimit");
const { streamDocumentFromChannel } = require("../telegram/mtproto");
const { authenticateToken, requireAdmin, JWT_SECRET } = require("../middleware/auth");

/**
 * GET /api/notes/branches
 * Returns all dynamically existing branches (including custom user-created branches)
 */
router.get("/branches", async (req, res) => {
  try {
    const cachedBranches = ramCache.get("branches_list");
    if (cachedBranches) {
      return res.json({ success: true, branches: cachedBranches });
    }

    const defaultBranches = ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"];
    if (!db) {
      return res.json({ success: true, branches: defaultBranches });
    }

    const snap = await db.collection("notes").select("branch").get();
    const branchSet = new Set(defaultBranches);

    snap.forEach((doc) => {
      const b = doc.data()?.branch;
      if (b && b.trim()) branchSet.add(b.trim());
    });

    const branchList = Array.from(branchSet);
    ramCache.set("branches_list", branchList, 120);

    return res.json({ success: true, branches: branchList });
  } catch (err) {
    return res.json({ success: true, branches: ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"] });
  }
});

/**
 * GET /api/notes
 * Fetches list of notes with in-memory RAM caching for 1ms response
 * Supports limit parameter (e.g. 15 by default, or all=true)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { branch, semester, subject, search, limit, all } = req.query;
    const isAdmin = req.user?.role === "admin" || req.user?.email === "jnplotus@gmail.com";

    const cacheKey = `notes_${branch || "all"}_${semester || "all"}_${subject || "all"}_${search || "none"}_${limit || "all"}_${isAdmin ? "admin" : "public"}`;
    const cachedData = ramCache.get(cacheKey);

    if (cachedData) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ success: true, notes: cachedData.notes, totalCount: cachedData.totalCount });
    }

    if (!db) {
      return res.json({ success: true, notes: [], totalCount: 0 });
    }

    let query = db.collection("notes");

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
        (n.branch || "").toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort by newest first
    notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const totalCount = notes.length;

    // Apply limit if specified (e.g. initial 15 notes)
    if (limit && !all) {
      const numLimit = parseInt(limit, 10);
      if (!isNaN(numLimit) && numLimit > 0) {
        notes = notes.slice(0, numLimit);
      }
    }

    // Cache in RAM for 45 seconds
    ramCache.set(cacheKey, { notes, totalCount }, 45);

    res.setHeader("X-Cache", "MISS");
    return res.json({ success: true, notes, totalCount });
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
 * PUT /api/notes/:id
 * Admin / Manager edits note metadata (title, subject, branch, semester, description)
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subject, branch, semester, description, tags, isVisible } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) updateData.title = title.trim();
    if (subject !== undefined) updateData.subject = subject.trim();
    if (branch !== undefined) updateData.branch = branch.trim();
    if (semester !== undefined) updateData.semester = semester.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
    if (isVisible !== undefined) updateData.isVisible = Boolean(isVisible);

    await db.collection("notes").doc(id).update(updateData);
    invalidateAllCache();

    return res.json({ success: true, message: "Note updated successfully in vault!" });
  } catch (err) {
    console.error("[NOTES] Update error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/notes/:id/stream
 * High-speed direct streaming download via Telegram MTProto with Cloudflare Edge CDN Caching
 * Records download activity for student
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

    // Try extracting user from query token or auth header for activity tracking
    let requestingUser = null;
    const token = req.query.token || req.headers["authorization"]?.split(" ")[1];
    if (token) {
      try {
        requestingUser = jwt.verify(token, JWT_SECRET);
      } catch {}
    }

    // Asynchronously record download event in student's profile
    if (requestingUser && requestingUser.id && requestingUser.id !== "admin-root") {
      const downloadEvent = {
        id: crypto.randomUUID(),
        type: "download",
        detail: `Downloaded PDF: "${note.title}"`,
        noteId: id,
        timestamp: new Date().toISOString(),
      };
      db.collection("users").doc(requestingUser.id).update({
        activities: ((await db.collection("users").doc(requestingUser.id).get()).data()?.activities || []).concat(downloadEvent).slice(-100),
      }).catch(() => {});
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
