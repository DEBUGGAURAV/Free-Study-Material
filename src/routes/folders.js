const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { auth } = require("../middleware/auth");

// GET /api/folders
router.get("/", async (req, res) => {
  try {
    const snap = await db.collection("folders").get();
    const folders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(folders);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/folders
router.post("/", auth, async (req, res) => {
  try {
    const { subject, year } = req.body;
    if (!subject || !year) return res.status(400).json({ message: "Subject and year required" });
    const created = await db.collection("folders").add({ subject, year, createdAt: new Date().toISOString() });
    res.status(201).json({ id: created.id, subject, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/folders/:id
router.patch("/:id", auth, async (req, res) => {
  try {
    await db.collection("folders").doc(req.params.id).update(req.body);
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/folders/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    await db.collection("folders").doc(req.params.id).delete();
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

