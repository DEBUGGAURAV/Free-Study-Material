const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { ramCache } = require("../utils/ramCache");
const {
  getAllCachedNotices,
  upsertNoticeInCache,
  removeNoticeFromCache,
  bulkRemoveNoticesFromCache,
  clearAllNoticesFromCache,
  updateNoticePinInCache,
  updateNoticeExpiryInCache,
  refreshNoticesCacheFromFirestore,
  getTursoNoticesTelemetry,
} = require("../services/tursoNoticesCacheService");

// Notice Board Lifetime Retention Policy (Default: 7 Days)
const NOTICE_RETENTION_DAYS = parseInt(process.env.NOTICE_RETENTION_DAYS || "7", 10);

/**
 * Helper to compute expiresAt ISO string from retentionDays
 */
function calculateExpiresAt(retentionDays, baseDate = Date.now()) {
  const days = parseInt(retentionDays, 10);
  if (days === -1 || days === 0) return null; // Never expires
  if (isNaN(days) || days < 0) {
    return new Date(baseDate + NOTICE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(baseDate + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * GET /api/notices
 * Fetches all active notices (ordered by pinned first, then newest)
 * 3-Tier Layered Caching:
 *  - L1: Node.js In-Memory RAM (0ms)
 *  - L2: Turso LibSQL Edge Database on Dedicated Cache Cloud (sub-5ms, ZERO Firestore Reads)
 *  - L3: Firestore fallback (Only on cold start)
 */
router.get("/", async (req, res) => {
  try {
    const notices = await getAllCachedNotices();

    res.setHeader("X-Cache", "TURSO-EDGE-ACTIVE");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    return res.json({
      success: true,
      notices: notices || [],
      defaultRetentionDays: NOTICE_RETENTION_DAYS,
    });
  } catch (err) {
    console.error("[NOTICES] Fetch error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notices." });
  }
});

/**
 * GET /api/notices/telemetry
 * Telemetry status of Turso Edge Notice Cache
 */
router.get("/telemetry", async (req, res) => {
  try {
    const telemetry = await getTursoNoticesTelemetry();
    return res.json({ success: true, telemetry });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notices/sync-cache
 * Force resync Turso Edge Cache from Firestore (Admin only)
 */
router.post("/sync-cache", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const syncedNotices = await refreshNoticesCacheFromFirestore();
    return res.json({
      success: true,
      message: `Successfully synchronized ${syncedNotices.length} notices into Turso Edge Cache!`,
      count: syncedNotices.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notices
 * Admin creates a new notice with custom expiry and pin status
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content, link, linkText, isPinned, type, retentionDays } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Notice Title is required." });
    }

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const docRef = db.collection("notices").doc();
    const rDays = retentionDays !== undefined ? parseInt(retentionDays, 10) : NOTICE_RETENTION_DAYS;
    const expiresAt = calculateExpiresAt(rDays);

    const newNotice = {
      id: docRef.id,
      title: title.trim(),
      content: (content || "").trim(),
      link: (link || "").trim(),
      linkText: (linkText || "Click Here").trim(),
      isPinned: Boolean(isPinned),
      type: type || "info", // info, urgent, exam, syllabus, material
      retentionDays: rDays,
      expiresAt: expiresAt,
      createdBy: req.user?.email || "Admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Write to Master Firestore
    await docRef.set(newNotice);

    // 2. Synchronize to Turso Edge Cache (L2) & In-Memory RAM (L1)
    await upsertNoticeInCache(newNotice);
    ramCache.delete("active_notices_board");

    return res.status(201).json({
      success: true,
      message: "Notice published & cached on Turso Edge successfully!",
      notice: newNotice,
    });
  } catch (err) {
    console.error("[NOTICES] Create error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/notices/:id
 * Admin updates existing notice
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, link, linkText, isPinned, type, retentionDays } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const existingDoc = await db.collection("notices").doc(id).get();
    if (!existingDoc.exists) {
      return res.status(404).json({ success: false, message: "Notice not found." });
    }

    const existingData = existingDoc.data();
    const createdTime = existingData.createdAt ? new Date(existingData.createdAt).getTime() : Date.now();
    const rDays = retentionDays !== undefined ? parseInt(retentionDays, 10) : (existingData.retentionDays || NOTICE_RETENTION_DAYS);
    const expiresAt = calculateExpiresAt(rDays, createdTime);

    const updateData = {
      title: title ? title.trim() : existingData.title,
      content: content !== undefined ? content.trim() : (existingData.content || ""),
      link: link !== undefined ? link.trim() : (existingData.link || ""),
      linkText: linkText !== undefined ? linkText.trim() : (existingData.linkText || "Click Here"),
      isPinned: isPinned !== undefined ? Boolean(isPinned) : Boolean(existingData.isPinned),
      type: type || existingData.type || "info",
      retentionDays: rDays,
      expiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.email || "Admin",
    };

    // 1. Update Master Firestore
    await db.collection("notices").doc(id).update(updateData);

    // 2. Update Turso Edge Cache & RAM
    const mergedNotice = { id, ...existingData, ...updateData };
    await upsertNoticeInCache(mergedNotice);
    ramCache.delete("active_notices_board");

    return res.json({ success: true, message: "Notice updated & synced on Turso Edge.", notice: mergedNotice });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/notices/:id/pin
 * Toggle pin/unpin status directly
 */
router.patch("/:id/pin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPinned } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const docRef = db.collection("notices").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, message: "Notice not found." });
    }

    const nextPinned = isPinned !== undefined ? Boolean(isPinned) : !docSnap.data().isPinned;
    await docRef.update({
      isPinned: nextPinned,
      updatedAt: new Date().toISOString(),
    });

    // Mirror in Turso Cache
    await updateNoticePinInCache(id, nextPinned);
    ramCache.delete("active_notices_board");

    return res.json({
      success: true,
      message: nextPinned ? "Notice pinned to top!" : "Notice unpinned.",
      isPinned: nextPinned,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/notices/:id/expiry
 * Quick update retention days / expiry
 */
router.patch("/:id/expiry", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { retentionDays } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const docRef = db.collection("notices").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ success: false, message: "Notice not found." });
    }

    const createdTime = docSnap.data().createdAt ? new Date(docSnap.data().createdAt).getTime() : Date.now();
    const rDays = parseInt(retentionDays, 10);
    const expiresAt = calculateExpiresAt(rDays, createdTime);

    await docRef.update({
      retentionDays: rDays,
      expiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
    });

    // Mirror in Turso Cache
    await updateNoticeExpiryInCache(id, rDays, expiresAt);
    ramCache.delete("active_notices_board");

    return res.json({
      success: true,
      message: rDays === -1 ? "Notice set to Never Expire." : `Notice expiry updated to ${rDays} days.`,
      retentionDays: rDays,
      expiresAt,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/notices/:id
 * Admin deletes a single notice (safely archived to deleted_records for Restore Vault)
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const doc = await db.collection("notices").doc(id).get();
    if (doc.exists) {
      // Archive to Restore Vault
      await db.collection("deleted_records").doc(`notices_${id}`).set({
        ...doc.data(),
        originalId: id,
        collectionName: "notices",
        typeLabel: "Notice",
        title: doc.data().title || "Campus Notice",
        archivedAt: new Date().toISOString(),
        archivedBy: req.user?.email || "Admin",
        archivedReason: "Admin manual delete",
      });
      await db.collection("notices").doc(id).delete();

      // Purge from Turso Edge Cache
      await removeNoticeFromCache(id);
      ramCache.delete("active_notices_board");
    }
    return res.json({ success: true, message: "Notice safely moved to Restore Vault & purged from Turso." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notices/bulk-delete
 * Admin bulk deletes selected notices by IDs (tick lagake delete)
 */
router.post("/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { noticeIds } = req.body;
    if (!Array.isArray(noticeIds) || noticeIds.length === 0) {
      return res.status(400).json({ success: false, message: "Please select at least one notice to delete." });
    }

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    let deletedCount = 0;
    const batchOps = noticeIds.map(async (id) => {
      try {
        const docRef = db.collection("notices").doc(id);
        const snap = await docRef.get();
        if (snap.exists) {
          await db.collection("deleted_records").doc(`notices_${id}`).set({
            ...snap.data(),
            originalId: id,
            collectionName: "notices",
            typeLabel: "Notice",
            title: snap.data().title || "Campus Notice",
            archivedAt: new Date().toISOString(),
            archivedBy: req.user?.email || "Admin",
            archivedReason: "Admin bulk delete",
          });
          await docRef.delete();
          deletedCount++;
        }
      } catch (e) {
        console.warn(`[NOTICES] Failed to delete notice ${id}:`, e.message);
      }
    });

    await Promise.all(batchOps);

    // Purge bulk IDs from Turso Edge Cache
    await bulkRemoveNoticesFromCache(noticeIds);
    ramCache.delete("active_notices_board");

    return res.json({
      success: true,
      message: `${deletedCount} notice(s) safely deleted and archived to Restore Vault.`,
      deletedCount,
    });
  } catch (err) {
    console.error("[NOTICES] Bulk delete error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notices/delete-all
 * Admin deletes ALL notices from notice board (sabhi notice delete karna)
 */
router.post("/delete-all", authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const snap = await db.collection("notices").get();
    if (snap.empty) {
      await clearAllNoticesFromCache();
      return res.json({ success: true, message: "Notice board is already empty.", deletedCount: 0 });
    }

    let deletedCount = 0;
    const deletePromises = snap.docs.map(async (doc) => {
      try {
        await db.collection("deleted_records").doc(`notices_${doc.id}`).set({
          ...doc.data(),
          originalId: doc.id,
          collectionName: "notices",
          typeLabel: "Notice",
          title: doc.data().title || "Campus Notice",
          archivedAt: new Date().toISOString(),
          archivedBy: req.user?.email || "Admin",
          archivedReason: "Admin purge all notices",
        });
        await doc.ref.delete();
        deletedCount++;
      } catch (e) {
        console.warn(`[NOTICES] Error purging doc ${doc.id}:`, e.message);
      }
    });

    await Promise.all(deletePromises);

    // Clear Turso Edge Cache
    await clearAllNoticesFromCache();
    ramCache.delete("active_notices_board");

    return res.json({
      success: true,
      message: `All ${deletedCount} notices have been deleted and archived to Restore Vault.`,
      deletedCount,
    });
  } catch (err) {
    console.error("[NOTICES] Purge all error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
