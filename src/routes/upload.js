const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { db } = require("../firebase");
const { authenticateToken, requireAuth } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimit");
const { enqueueUpload, getJobStatus } = require("../services/queueService");

// Ensure temp directory exists
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer disk storage for fast chunk streaming into temp/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB Max Limit
  },
});

/**
 * POST /api/upload
 * Accepts files up to 2GB and returns instant receipt (< 2s) while queuing background task
 */
router.post(
  "/",
  uploadLimiter,
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
      }

      const {
        title,
        subject,
        branch,
        semester,
        description,
        tags,
      } = req.body;

      const file = req.file;
      const noteTitle = (title || file.originalname).trim();
      const noteSubject = (subject || "General Engineering").trim();
      const noteBranch = (branch || "CSE").trim();
      const noteSemester = (semester || "Sem 1").trim();

      // Create new document reference in Firestore
      let noteId = null;
      if (db) {
        const docRef = db.collection("notes").doc();
        noteId = docRef.id;

        const noteData = {
          id: noteId,
          title: noteTitle,
          subject: noteSubject,
          branch: noteBranch,
          semester: noteSemester,
          description: description || "",
          tags: tags ? tags.split(",").map((t) => t.trim()) : [],
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          compressedSize: file.size,
          savingsPercent: 0,
          status: "processing", // Immediately in processing
          uploadedBy: req.user?.email || "student@freestudymaterial.com",
          uploaderName: req.user?.name || "Student Contributor",
          viewsCount: 0,
          downloadsCount: 0,
          isVisible: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await docRef.set(noteData);
      } else {
        noteId = `note-${Date.now()}`;
      }

      // Enqueue to Async Background Processing Worker
      enqueueUpload({
        noteId,
        tempFilePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        meta: {
          title: noteTitle,
          subject: noteSubject,
          branch: noteBranch,
          semester: noteSemester,
        },
      });

      // ⏱️ INSTANT RESPONSE: User waits < 2 seconds!
      return res.status(202).json({
        success: true,
        message: "Note uploaded successfully! Background optimization & cloud sync started.",
        noteId,
        status: "processing",
        meta: {
          title: noteTitle,
          size: file.size,
        },
      });
    } catch (err) {
      console.error("[UPLOAD] Ingestion error:", err);
      // Clean up temp file on early error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ success: false, message: "Upload failed: " + err.message });
    }
  }
);

/**
 * GET /api/upload/status/:id
 * Real-time status polling for background processing queue
 */
router.get("/status/:id", (req, res) => {
  const { id } = req.params;
  const status = getJobStatus(id);

  if (!status) {
    return res.json({
      noteId: id,
      status: "ready",
      stage: "Completed & Ready",
      progress: 100,
    });
  }

  return res.json(status);
});

module.exports = router;
