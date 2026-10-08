const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const { auth } = require("../middleware/auth");
const { foldersCache } = require("../utils/ramCache");

// GET /api/folders with RAM caching
router.get("/", async (req, res) => {
  try {
    let folders = foldersCache.get("all_folders");
    let cacheHit = true;

    if (!folders) {
      cacheHit = false;
      const snap = await db.collection("folders").get();
      folders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      foldersCache.set("all_folders", folders);
    }

    res.setHeader("X-Cache", cacheHit ? "HIT" : "MISS");
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
    foldersCache.clear();
    res.status(201).json({ id: created.id, subject, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/folders/:id
router.patch("/:id", auth, async (req, res) => {
  try {
    await db.collection("folders").doc(req.params.id).update(req.body);
    foldersCache.clear();
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/folders/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    await db.collection("folders").doc(req.params.id).delete();
    foldersCache.clear();
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

