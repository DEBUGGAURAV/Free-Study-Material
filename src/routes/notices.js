const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// Notice Board Lifetime Retention Policy (Default: 7 Days)
const NOTICE_RETENTION_DAYS = parseInt(process.env.NOTICE_RETENTION_DAYS || "7", 10);

/**
 * GET /api/notices
 * Fetches all active notices within retention days (ordered by pinned first, then newest)
 * Automatically purges and archives notices older than NOTICE_RETENTION_DAYS to Restore Vault.
 */
router.get("/", async (req, res) => {
  try {
    if (!db) return res.json({ success: true, notices: [] });

    const snap = await db.collection("notices").orderBy("createdAt", "desc").limit(50).get();
    const cutoffTime = Date.now() - NOTICE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const activeNotices = [];
    const expiredDocs = [];

    snap.forEach((doc) => {
      const data = doc.data();
      const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;

      // Check if notice has exceeded retention days (unpinned notices auto-expire)
      if (createdTime > 0 && createdTime < cutoffTime && !data.isPinned) {
        expiredDocs.push({ id: doc.id, ...data });
      } else {
        activeNotices.push({ id: doc.id, ...data });
      }
    });

    // Auto-delete / auto-archive expired notices in background to prevent DB bloat
    if (expiredDocs.length > 0) {
      Promise.all(
        expiredDocs.map(async (item) => {
          try {
            await db.collection("deleted_records").doc(`notices_${item.id}`).set({
              ...item,
              originalId: item.id,
              collectionName: "notices",
              typeLabel: "Notice",
              archivedAt: new Date().toISOString(),
              archivedReason: `Auto-deleted: Exceeded ${NOTICE_RETENTION_DAYS}-day notice board retention policy`,
            });
            await db.collection("notices").doc(item.id).delete();
          } catch {}
        })
      ).catch(() => {});
    }

    // Sort: pinned notices first
    activeNotices.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return res.json({ success: true, notices: activeNotices, retentionDays: NOTICE_RETENTION_DAYS });
  } catch (err) {
    console.error("[NOTICES] Fetch error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notices." });
  }
});

/**
 * POST /api/notices
 * Admin creates a new notice (with optional link)
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content, link, linkText, isPinned, type } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Notice Title is required." });
    }

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const docRef = db.collection("notices").doc();
    const newNotice = {
      id: docRef.id,
      title: title.trim(),
      content: (content || "").trim(),
      link: (link || "").trim(),
      linkText: (linkText || "Click Here").trim(),
      isPinned: Boolean(isPinned),
      type: type || "info", // info, urgent, new_material
      createdBy: req.user?.email || "Admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(newNotice);

    return res.status(201).json({
      success: true,
      message: "Notice published successfully!",
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
    const { title, content, link, linkText, isPinned, type } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const updateData = {
      title: title.trim(),
      content: (content || "").trim(),
      link: (link || "").trim(),
      linkText: (linkText || "Click Here").trim(),
      isPinned: Boolean(isPinned),
      type: type || "info",
      updatedAt: new Date().toISOString(),
    };

    await db.collection("notices").doc(id).update(updateData);

    return res.json({ success: true, message: "Notice updated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/notices/:id
 * Admin deletes a notice
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "DB unavailable." });

    const doc = await db.collection("notices").doc(id).get();
    if (doc.exists) {
      await db.collection("deleted_records").doc(`notices_${id}`).set({
        ...doc.data(),
        originalId: id,
        collectionName: "notices",
        typeLabel: "Notice",
        title: doc.data().title || "Campus Notice",
        archivedAt: new Date().toISOString(),
        archivedBy: req.user?.email || "Admin",
      });
      await db.collection("notices").doc(id).delete();
    }
    return res.json({ success: true, message: "Notice safely moved to Restore Vault." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

