const express = require("express");
const router = express.Router();

const { db, admin } = require("../firebase");
const bot = require("../telegram/bot");
const { optionalAuth, auth } = require("../middleware/auth");
const { readLimiter, downloadLimiter } = require("../middleware/rateLimit");

// Access Control Engine: Decides if a student or user has permission to view/download
function canAccess(note, user) {
  if (!note.visible) {
    // Hidden notes are accessible only to full admins
    return user && (user.role === "admin" || user.isAdmin === true);
  }

  // Admins always have access
  if (user && (user.role === "admin" || user.isAdmin === true)) {
    return true;
  }

  switch (note.visibility) {
    case "public":
      return true;

    case "year":
      if (!user) return false;
      return (
        note.year === Number(user.year) ||
        (Array.isArray(note.allowedYears) && note.allowedYears.includes(Number(user.year)))
      );

    case "filter":
      if (!user) return false;
      return (
        Number(note.year) === Number(user.year) &&
        (!note.branch || note.branch.toLowerCase() === (user.branch || "").toLowerCase()) &&
        (!note.semester || Number(note.semester) === Number(user.semester))
      );

    case "specific_users":
      if (!user || !user.uid) return false;
      return Array.isArray(note.allowedUsers) && note.allowedUsers.includes(user.uid);

    case "admin_only":
      return user && (user.role === "admin" || user.isAdmin === true);

    default:
      return true;
  }
}

// Security: Strip internal Telegram keys and access control lists before sending to client
function sanitizeNote({ telegramChatId, telegramMessageId, telegramFileId, allowedUsers, ...cleanNote }) {
  return cleanNote;
}

// 1. GET /api/notes - List all accessible notes
router.get("/", optionalAuth, readLimiter, async (req, res) => {
  try {
    const snapshot = await db.collection("notes").limit(500).get();
    const notes = [];

    snapshot.forEach((doc) => {
      const note = { id: doc.id, ...doc.data() };
      if (canAccess(note, req.user)) {
        notes.push(sanitizeNote(note));
      }
    });

    res.json({ success: true, count: notes.length, notes });
  } catch (error) {
    console.error("[Notes] Failed to load notes:", error);
    res.status(500).json({ success: false, message: "Failed to load notes" });
  }
});

// 2. GET /api/notes/:id/download - Secure stream download from Telegram storage
router.get("/:id/download", optionalAuth, downloadLimiter, async (req, res) => {
  try {
    const doc = await db.collection("notes").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Note record not found" });
    }

    const note = doc.data();

    // Check Access Permission
    if (!canAccess(note, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to download this note.",
      });
    }

    if (!note.telegramFileId) {
      return res.status(400).json({
        success: false,
        message: "This note does not have an attached Telegram file ID.",
      });
    }

    // Increment download count in Firestore for Analytics & Top Downloads Tracking
    db.collection("notes").doc(req.params.id).update({
      downloadCount: admin.firestore.FieldValue.increment(1),
      lastDownloadedAt: new Date().toISOString()
    }).catch(err => console.warn("[Notes Download] Could not increment counter:", err.message));

    // Stream directly through the server: bot token is NEVER exposed to browser
    const stream = bot.getFileStream(note.telegramFileId);
    const safeName = String(note.fileName || `${note.title || "note"}.pdf`).replace(/[^\w.\- ]/g, "_");

    // Smart Cache Headers: Edge stream caches file for 7 days with background revalidation
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Type", "application/octet-stream");

    stream.on("error", (err) => {
      console.error("[Notes Download] Telegram stream error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: "Failed to stream file from Telegram storage" });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error("[Notes Download] Error:", error);
    res.status(500).json({ success: false, message: "Download failed" });
  }
});

// 3. PATCH /api/notes/:id/visibility - Hide or reveal a note (Part 17)
router.patch("/:id/visibility", auth, async (req, res) => {
  try {
    // Only admins or content admins can toggle visibility
    if (req.user.role !== "admin" && req.user.role !== "content_admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { visible, visibility, allowedUsers, allowedYears } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    if (typeof visible === "boolean") updates.visible = visible;
    if (visibility) updates.visibility = visibility;
    if (Array.isArray(allowedUsers)) updates.allowedUsers = allowedUsers;
    if (Array.isArray(allowedYears)) updates.allowedYears = allowedYears;

    await db.collection("notes").doc(req.params.id).update(updates);

    res.json({
      success: true,
      message: `Note visibility updated to ${updates.visible !== undefined ? updates.visible : "modified"}`,
    });
  } catch (error) {
    console.error("[Notes Visibility] Update error:", error);
    res.status(500).json({ success: false, message: "Failed to update note visibility" });
  }
});

// 4. DELETE /api/notes/:id - Remove note
router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only administrators can delete notes" });
    }

    const doc = await db.collection("notes").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    const note = doc.data();

    // Optionally delete from Telegram supergroup
    if (note.telegramChatId && note.telegramMessageId) {
      try {
        await bot.deleteMessage(note.telegramChatId, note.telegramMessageId);
      } catch (tgErr) {
        console.warn("[Notes Delete] Could not delete message from Telegram:", tgErr.message);
      }
    }

    // Delete metadata from Firestore
    await db.collection("notes").doc(req.params.id).delete();

    res.json({ success: true, message: "Note deleted successfully" });
  } catch (error) {
    console.error("[Notes Delete] Error:", error);
    res.status(500).json({ success: false, message: "Failed to delete note" });
  }
});

// 5. POST /api/notes/purge-stale - Smart Space Management & Old File Auto-Purge
router.post("/purge-stale", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only administrators can perform space management." });
    }

    const { days = 30, maxDeletes = 50, dryRun = false } = req.body;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Number(days));
    const cutoffIso = cutoffDate.toISOString();

    const snapshot = await db.collection("notes").get();
    const staleNotes = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const lastActivity = data.lastDownloadedAt || data.updatedAt || data.createdAt;
      // Mark as stale if not downloaded or updated since cutoff
      if (lastActivity && lastActivity < cutoffIso) {
        staleNotes.push({ id: doc.id, ...data });
      }
    });

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        staleCount: staleNotes.length,
        notesToPurge: staleNotes.slice(0, maxDeletes).map(n => ({ id: n.id, title: n.title, lastActivity: n.lastDownloadedAt || n.createdAt }))
      });
    }

    const toDelete = staleNotes.slice(0, maxDeletes);
    let deletedCount = 0;

    for (const note of toDelete) {
      // Delete message from Telegram if attached
      if (note.telegramChatId && note.telegramMessageId) {
        try {
          await bot.deleteMessage(note.telegramChatId, note.telegramMessageId);
        } catch (tgErr) {
          console.warn("[Purge Stale] Could not remove Telegram message:", tgErr.message);
        }
      }
      // Delete from Firestore
      await db.collection("notes").doc(note.id).delete();
      deletedCount++;
    }

    res.json({
      success: true,
      message: `Smart Space Cleanup completed: ${deletedCount} stale note(s) purged.`,
      purgedCount: deletedCount,
      remainingStaleCount: Math.max(0, staleNotes.length - deletedCount)
    });
  } catch (error) {
    console.error("[Purge Stale] Error:", error);
    res.status(500).json({ success: false, message: "Purge execution failed: " + error.message });
  }
});

module.exports = router;

