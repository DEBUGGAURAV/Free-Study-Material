const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const { db } = require("../firebase");
const { uploadFile } = require("../telegram/upload");
const { getTopicThreadId } = require("../telegram/topics");
const { optionalAuth } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimit");

// Ensure temp directory exists for incoming uploads
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const isMtprotoEnabled = Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH);

const upload = multer({
  storage,
  limits: { fileSize: 2000 * 1024 * 1024 }, // Full 2,000 MB (2 GB) support via MTProto
});

// Middleware wrapper that traps Multer LIMIT_FILE_SIZE and errors gracefully without crashing 500
const handleUploadMiddleware = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          code: "FILE_TOO_LARGE",
          message: "File exceeds 2,000 MB (2 GB) Telegram storage limit.",
        });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    next();
  });
};

router.post("/", optionalAuth, uploadLimiter, handleUploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file attached for upload" });
  }

  const tempFilePath = req.file.path;

  // Only restrict to 50MB if native MTProto is not enabled
  if (!isMtprotoEnabled && req.file.size > 50 * 1024 * 1024) {
    const sizeMb = (req.file.size / (1024 * 1024)).toFixed(1);
    fs.unlink(tempFilePath, () => {});

    return res.status(413).json({
      success: false,
      code: "TELEGRAM_WEB_LIMIT_EXCEEDED",
      fileSizeMb: Number(sizeMb),
      message: `File is ${sizeMb} MB. Telegram's standard Bot API limits direct web browser uploads to 50MB. Drop it directly into our Telegram Bot @TechTitanNotesBot for up to 2GB uploads, or provide a Google Drive link!`,
      botUsername: "TechTitanNotesBot",
      botLink: "https://t.me/TechTitanNotesBot"
    });
  }

  try {
    const {
      title,
      subject,
      topic,
      year,
      branch,
      semester,
      visibility,
      allowedYears,
      allowedUsers,
      threadId: directThreadId,
    } = req.body;

    const noteTitle = (title || req.file.originalname).trim();
    const noteSubject = (subject || "General").trim();

    // Determine target topic thread ID (direct or lookup by subject)
    const threadId = directThreadId || (await getTopicThreadId(noteSubject));

    console.log(`[Upload] Uploading "${noteTitle}" (${req.file.size} bytes) to Telegram thread: ${threadId || "General"}`);

    // Track Telegram Replication Duration & Speed
    const tgStartTime = Date.now();
    const telegramResult = await uploadFile({
      filePath: tempFilePath,
      title: noteTitle,
      subject: noteSubject,
      threadId,
    });
    const tgReplicationDurationMs = Math.max(40, Date.now() - tgStartTime);
    const tgReplicationTimeSec = Number((tgReplicationDurationMs / 1000).toFixed(2));
    const tgSpeedMBps = Number(((req.file.size / (1024 * 1024)) / (tgReplicationDurationMs / 1000)).toFixed(2));
    const edgeDownloadEstSec = Number((req.file.size / (80 * 1024 * 1024)).toFixed(2));
    const tgDownloadEstSec = Number((req.file.size / (6.5 * 1024 * 1024)).toFixed(2));

    // Parse visibility settings
    let parsedAllowedYears = [];
    if (allowedYears) {
      parsedAllowedYears = Array.isArray(allowedYears)
        ? allowedYears.map(Number)
        : JSON.parse(allowedYears);
    }

    let parsedAllowedUsers = [];
    if (allowedUsers) {
      parsedAllowedUsers = Array.isArray(allowedUsers)
        ? allowedUsers
        : JSON.parse(allowedUsers);
    }

    // Auto-create or find folder
    let folderId = "";
    try {
      const folderSnap = await db.collection("folders")
        .where("subject", "==", noteSubject)
        .limit(1)
        .get();

      if (!folderSnap.empty) {
        folderId = folderSnap.docs[0].id;
      } else {
        const newFolder = await db.collection("folders").add({
          subject: noteSubject,
          year: typeof year === "number" ? `${year}st year` : String(year || "1st year"),
          createdAt: new Date().toISOString()
        });
        folderId = newFolder.id;
      }
    } catch (fErr) {
      console.warn("[Upload] Folder auto-create error:", fErr.message);
    }

    // Prepare Firestore metadata record (Never stores raw file, only Telegram pointers)
    const noteDoc = {
      title: noteTitle,
      subject: noteSubject,
      folderId,
      topic: (topic || "").trim(),
      year: Number(year) || 1,
      branch: (branch || "CSE").trim(),
      semester: Number(semester) || 1,

      telegramChatId: String(telegramResult.chatId),
      telegramThreadId: String(telegramResult.threadId || ""),
      telegramMessageId: telegramResult.messageId,
      telegramFileId: telegramResult.fileId,
      fileName: req.file.originalname,
      fileSize: req.file.size,

      visibility: visibility || "public", // "public" | "year" | "filter" | "specific_users" | "admin_only"
      allowedYears: parsedAllowedYears,
      allowedUsers: parsedAllowedUsers,
      visible: true,

      uploadedBy: req.user?.uid || "admin",
      uploadedByName: req.user?.name || "System Admin",
      uploadedAt: new Date().toISOString(),
    };

    // Save to Firestore
    const docRef = await db.collection("notes").add(noteDoc);

    // Clean up temporary local file
    fs.unlink(tempFilePath, (err) => {
      if (err) console.warn("[Upload] Warning deleting temp file:", err.message);
    });

    res.json({
      success: true,
      message: "Note uploaded and archived in Telegram storage successfully",
      note: {
        id: docRef.id,
        title: noteDoc.title,
        subject: noteDoc.subject,
        fileSize: noteDoc.fileSize,
        fileName: noteDoc.fileName,
        threadId: noteDoc.telegramThreadId,
      },
      telemetry: {
        fileSize: req.file.size,
        fileSizeFormatted: (req.file.size / (1024 * 1024)).toFixed(2) + " MB",
        telegramReplicationTimeMs: tgReplicationDurationMs,
        telegramReplicationTimeSec: tgReplicationTimeSec,
        telegramSpeedMBps: tgSpeedMBps,
        cdnStatus: "Edge Cached Ready",
        edgeCdnSpeedEst: "80+ MB/s",
        edgeDownloadEstSec: Math.max(0.05, edgeDownloadEstSec),
        telegramDirectSpeedEst: "6.5 MB/s",
        telegramDownloadEstSec: Math.max(0.2, tgDownloadEstSec)
      }
    });
  } catch (error) {
    console.error("[Upload] Error processing upload:", error);

    // Ensure temp file is cleaned up on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath, () => {});
    }

    res.status(500).json({
      success: false,
      message: "Upload failed: " + (error.message || "Unknown error"),
    });
  }
});

module.exports = router;

