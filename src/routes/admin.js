const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { invalidateAllCache } = require("../utils/ramCache");

/**
 * GET /api/admin/stats
 * Real-time analytics on storage, compression, and deduplication
 */
router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: true, stats: {} });
    }

    const snapshot = await db.collection("notes").get();
    let totalNotes = 0;
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;
    let totalDuplicates = 0;
    let totalDownloads = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalNotes++;
      const orig = Number(data.fileSize) || 0;
      const comp = Number(data.compressedSize) || orig;

      totalOriginalBytes += orig;
      totalCompressedBytes += comp;

      if (data.isDuplicate) {
        totalDuplicates++;
      }
      totalDownloads += Number(data.downloadsCount) || 0;
    });

    const totalSavedBytes = totalOriginalBytes - totalCompressedBytes;
    const compressionRatio = totalOriginalBytes > 0 
      ? Math.round((totalSavedBytes / totalOriginalBytes) * 100) 
      : 0;

    return res.json({
      success: true,
      stats: {
        totalNotes,
        totalDownloads,
        totalDuplicates,
        totalOriginalBytes,
        totalCompressedBytes,
        totalSavedBytes,
        compressionRatio,
        formattedSaved: (totalSavedBytes / (1024 * 1024)).toFixed(2) + " MB",
        formattedOriginal: (totalOriginalBytes / (1024 * 1024)).toFixed(2) + " MB",
      },
    });
  } catch (err) {
    console.error("[ADMIN] Stats error:", err);
    return res.status(500).json({ success: false, message: "Error calculating stats." });
  }
});

/**
 * PATCH /api/admin/notes/:id/visibility
 */
router.patch("/notes/:id/visibility", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    await db.collection("notes").doc(id).update({
      isVisible: Boolean(isVisible),
      updatedAt: new Date().toISOString(),
    });

    invalidateAllCache();
    return res.json({ success: true, message: "Note visibility updated." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/admin/notes/:id
 */
router.delete("/notes/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    await db.collection("notes").doc(id).delete();
    invalidateAllCache();

    return res.json({ success: true, message: "Note deleted from vault." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
