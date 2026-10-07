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

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB standard Cloud Bot limit (larger handled via Local Bot API)
});

router.post("/", optionalAuth, uploadLimiter, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file attached for upload" });
  }

  const tempFilePath = req.file.path;

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

    // Upload to Telegram Storage Supergroup
    const telegramResult = await uploadFile({
      filePath: tempFilePath,
      title: noteTitle,
      subject: noteSubject,
      threadId,
    });

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

    // Prepare Firestore metadata record (Never stores raw file, only Telegram pointers)
    const noteDoc = {
      title: noteTitle,
      subject: noteSubject,
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

