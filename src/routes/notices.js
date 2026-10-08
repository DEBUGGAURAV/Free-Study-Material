const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

/**
 * GET /api/notices
 * Fetches all active notices (ordered by pinned first, then newest)
 */
router.get("/", async (req, res) => {
  try {
    if (!db) return res.json({ success: true, notices: [] });

    const snap = await db.collection("notices").orderBy("createdAt", "desc").limit(50).get();
    const notices = [];

    snap.forEach((doc) => {
      notices.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort: pinned notices first
    notices.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return res.json({ success: true, notices });
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

    await db.collection("notices").doc(id).delete();
    return res.json({ success: true, message: "Notice deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
