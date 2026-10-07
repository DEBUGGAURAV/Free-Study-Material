const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { auth } = require("../middleware/auth");

// GET /api/notices
router.get("/", async (req, res) => {
  try {
    const snap = await db.collection("noticeBoard").orderBy("createdAt", "desc").limit(50).get();
    const notices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(notices);
  } catch (err) {
    try {
      const snap = await db.collection("noticeBoard").limit(50).get();
      res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      res.json([]);
    }
  }
});

// POST /api/notices
router.post("/", auth, async (req, res) => {
  try {
    const { title, message, type = "general", link = "" } = req.body;
    if (!title || !message) return res.status(400).json({ message: "Title and message required" });
    const notice = {
      title,
      message,
      type,
      link,
      author: req.user?.email || "Admin",
      createdAt: new Date().toISOString()
    };
    const created = await db.collection("noticeBoard").add(notice);
    res.status(201).json({ id: created.id, ...notice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/notices/:id
router.patch("/:id", auth, async (req, res) => {
  try {
    await db.collection("noticeBoard").doc(req.params.id).update(req.body);
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/notices/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    await db.collection("noticeBoard").doc(req.params.id).delete();
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

