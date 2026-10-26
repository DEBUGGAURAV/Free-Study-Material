const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { ramCache } = require("../utils/ramCache");

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
 * High-Speed 0ms RAM Cache + Automatic Purge of expired notices
 */
router.get("/", async (req, res) => {
  try {
    const cachedNotices = ramCache.get("active_notices_board");
    if (cachedNotices) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      return res.json({ success: true, notices: cachedNotices, defaultRetentionDays: NOTICE_RETENTION_DAYS });
    }

    if (!db) return res.json({ success: true, notices: [], defaultRetentionDays: NOTICE_RETENTION_DAYS });

    const snap = await db.collection("notices").orderBy("createdAt", "desc").limit(100).get();
    const now = Date.now();
    const defaultCutoff = now - NOTICE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const activeNotices = [];
    const expiredDocs = [];

    snap.forEach((doc) => {
      const data = doc.data();
      const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;
      let isExpired = false;

      // 1. If pinned, never auto-expire
      if (data.isPinned) {
        isExpired = false;
      }
      // 2. If retentionDays is explicitly -1 (Never), do not expire
      else if (data.retentionDays === -1 || data.retentionDays === "-1") {
        isExpired = false;
      }
      // 3. If explicit expiresAt timestamp is set
      else if (data.expiresAt) {
        const expTime = new Date(data.expiresAt).getTime();
        if (!isNaN(expTime) && now > expTime) {
          isExpired = true;
        }
      }
      // 4. If retentionDays is custom positive number
      else if (data.retentionDays && !isNaN(parseInt(data.retentionDays, 10)) && parseInt(data.retentionDays, 10) > 0) {
        const customCutoff = createdTime + parseInt(data.retentionDays, 10) * 24 * 60 * 60 * 1000;
        if (now > customCutoff) {
          isExpired = true;
        }
      }
      // 5. Fallback to global retention policy
      else if (createdTime > 0 && createdTime < defaultCutoff) {
        isExpired = true;
      }

      if (isExpired) {
        expiredDocs.push({ id: doc.id, ...data });
      } else {
        activeNotices.push({ id: doc.id, ...data });
      }
    });

    // Auto-archive expired notices in background to deleted_records (allows recovery in Restore Vault)
    if (expiredDocs.length > 0) {
      Promise.all(
        expiredDocs.map(async (item) => {
          try {
            await db.collection("deleted_records").doc(`notices_${item.id}`).set({
              ...item,
              originalId: item.id,
              collectionName: "notices",
              typeLabel: "Notice",
              title: item.title || "Campus Notice",
              archivedAt: new Date().toISOString(),
              archivedReason: `Auto-deleted: Exceeded notice expiry lifetime policy`,
            });
            await db.collection("notices").doc(item.id).delete();
          } catch {}
        })
      ).catch(() => {});
    }

    // Sort: pinned notices first, then newest createdAt
    activeNotices.sort((a, b) => {
      if (b.isPinned !== a.isPinned) {
        return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      }
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    ramCache.set("active_notices_board", activeNotices, 60);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    return res.json({ success: true, notices: activeNotices, defaultRetentionDays: NOTICE_RETENTION_DAYS });
  } catch (err) {
    console.error("[NOTICES] Fetch error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notices." });
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

    await docRef.set(newNotice);
    ramCache.delete("active_notices_board");

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

    await db.collection("notices").doc(id).update(updateData);
    ramCache.delete("active_notices_board");

    return res.json({ success: true, message: "Notice updated successfully.", notice: { id, ...existingData, ...updateData } });
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
      ramCache.delete("active_notices_board");
    }
    return res.json({ success: true, message: "Notice safely moved to Restore Vault." });
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
