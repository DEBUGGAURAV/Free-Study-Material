const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { db } = require("../firebase");
const { authenticateToken } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimit");
const { enqueueUpload, getJobStatus, recordPipelineStart } = require("../services/queueService");
const { invalidateAllCache } = require("../utils/ramCache");

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
 * Accepts files up to 2GB, supports custom branch creation, creates auto-notice, and queues async job
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
        customBranch,
        course,
        customCourse,
        year,
        semester,
        description,
        tags,
      } = req.body;

      const file = req.file;
      const noteTitle = (title || file.originalname).trim();
      const noteSubject = (subject || "General Academic").trim();
      
      // Determine final branch: customBranch takes precedence if provided!
      const finalBranch = (customBranch && customBranch.trim() !== "") 
        ? customBranch.trim().toUpperCase() 
        : (branch || "CSE").trim();

      // Determine course (e.g. B.Tech, BCA, MCA, Diploma, M.Tech, etc.)
      const finalCourse = (customCourse && customCourse.trim() !== "")
        ? customCourse.trim().toUpperCase()
        : (course || "B.Tech").trim();

      const noteYear = (year || semester || "All Years").trim();

      // Create new document reference in Firestore
      let noteId = null;
      if (db) {
        const docRef = db.collection("notes").doc();
        noteId = docRef.id;

        const noteData = {
          id: noteId,
          title: noteTitle,
          subject: noteSubject,
          branch: finalBranch,
          course: finalCourse,
          year: noteYear,
          semester: noteYear, // Backward compatibility for legacy clients
          description: description || "",
          tags: tags ? tags.split(",").map((t) => t.trim()) : [],
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          compressedSize: file.size,
          savingsPercent: 0,
          status: "processing",
          uploadedBy: req.user?.email || "student@freestudymaterial.com",
          uploaderName: req.user?.name || "Student Contributor",
          viewsCount: 0,
          downloadsCount: 0,
          isVisible: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _sortTimestamp: Date.now(),
        };

        await docRef.set(noteData);
        invalidateAllCache();

        // Auto-create notice on the Notice Board with direct click link!
        await db.collection("notices").add({
          title: `📚 New Material: ${noteTitle}`,
          content: `New study material has been uploaded for ${finalCourse} (${finalBranch} • ${noteYear}) — Subject: ${noteSubject}. Click below to view and download!`,
          link: `/api/notes/${noteId}/stream`,
          linkText: "Click Here to Read & Download Note",
          type: "new_material",
          isPinned: false,
          createdBy: req.user?.name || "System Vault",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch((e) => console.warn("[UPLOAD] Notice creation notice:", e.message));

        // Log upload activity in student's profile
        if (req.user?.id && req.user.id !== "admin-root") {
          const uploadEvent = {
            id: crypto.randomUUID(),
            type: "upload",
            detail: `Uploaded note: "${noteTitle}" (${finalCourse} - ${finalBranch})`,
            noteId: noteId,
            timestamp: new Date().toISOString(),
          };
          db.collection("users").doc(req.user.id).update({
            activities: ((await db.collection("users").doc(req.user.id).get()).data()?.activities || []).concat(uploadEvent).slice(-100),
          }).catch(() => {});
        }
      } else {
        noteId = `note-${Date.now()}`;
      }

      // Initialize Realtime Pipeline Tracking
      recordPipelineStart({
        noteId,
        title: noteTitle,
        originalName: file.originalname,
        fileSize: file.size,
        formattedSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        mimeType: file.mimetype,
        branch: finalBranch,
        subject: noteSubject,
        course: finalCourse,
        year: noteYear,
        uploaderEmail: req.user?.email || "student@freestudymaterial.com",
        uploaderName: req.user?.name || "Student Contributor",
        uploaderIp: req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
        clientSpeed: req.body.clientSpeed || "High Speed Direct Transfer",
        clientElapsed: req.body.clientElapsed || "1.2s",
      });

      // Enqueue to Async Background Processing Worker
      enqueueUpload({
        noteId,
        tempFilePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        meta: {
          title: noteTitle,
          subject: noteSubject,
          branch: finalBranch,
          course: finalCourse,
          year: noteYear,
        },
      });

      // Instant receipt response (< 2 seconds)
      return res.status(202).json({
        success: true,
        message: "Note uploaded successfully! Background engine is optimizing & syncing.",
        noteId,
        status: "processing",
        meta: {
          title: noteTitle,
          branch: finalBranch,
          size: file.size,
        },
      });
    } catch (err) {
      console.error("[UPLOAD] Ingestion error:", err);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ success: false, message: "Upload failed: " + err.message });
    }
  }
);

/**
 * GET /api/upload/status/:id
 */
router.get("/status/:id", (req, res) => {
  const { id } = req.params;
  const status = getJobStatus(id);

  if (!status) {
    return res.json({
      noteId: id,
      status: "ready",
      stage: "Completed & Ready in Cloud",
      progress: 100,
    });
  }

  return res.json(status);
});

module.exports = router;
