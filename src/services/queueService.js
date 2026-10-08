const fs = require("fs");
const path = require("path");
const { db } = require("../firebase");
const { calculateFileHash, findDuplicateNote } = require("./dedupService");
const { compressPdf } = require("./compressService");
const { generateWebPThumbnail } = require("./thumbnailService");
const { uploadToStorageChannel } = require("../telegram/mtproto");
const { invalidateAllCache } = require("../utils/ramCache");

// In-memory queue state for ultra-fast polling
const jobStatusMap = new Map();

/**
 * Enqueues an upload job and processes it asynchronously
 * @param {object} task 
 */
function enqueueUpload(task) {
  const { noteId, tempFilePath, originalName, mimeType, meta } = task;

  jobStatusMap.set(noteId, {
    noteId,
    status: "processing",
    stage: "Calculating SHA-256 Checksum",
    progress: 15,
    timestamp: Date.now(),
  });

  // Run asynchronously without blocking HTTP response
  setImmediate(async () => {
    try {
      console.log(`[QUEUE] Starting async job for Note: ${noteId} (${originalName})`);
      const originalSize = fs.existsSync(tempFilePath) ? fs.statSync(tempFilePath).size : 0;

      // Stage 1: SHA-256 Deduplication check
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Checking SHA-256 Deduplication",
        progress: 30,
      });

      const fileHash = await calculateFileHash(tempFilePath);
      console.log(`[QUEUE] SHA-256 Hash: ${fileHash}`);

      const duplicate = await findDuplicateNote(fileHash);

      if (duplicate) {
        console.log(`[QUEUE] ⚡ Zero-Second Deduplication hit for ${noteId}! Reusing Telegram Ref.`);
        
        // Instant completion via deduplication
        if (db) {
          await db.collection("notes").doc(noteId).update({
            status: "ready",
            telegramMessageId: duplicate.telegramMessageId || null,
            telegramFileId: duplicate.telegramFileId || null,
            fileHash: fileHash,
            fileSize: duplicate.fileSize || originalSize,
            compressedSize: duplicate.compressedSize || originalSize,
            savingsPercent: 100,
            isDuplicate: true,
            thumbnailUrl: duplicate.thumbnailUrl || null,
            downloadUrl: `/api/notes/${noteId}/stream`,
            updatedAt: new Date().toISOString(),
          });
        }

        // Clean up temp file immediately
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }

        jobStatusMap.set(noteId, {
          noteId,
          status: "ready",
          stage: "Completed via SHA-256 Deduplication (0s)",
          progress: 100,
          isDuplicate: true,
          savingsPercent: 100,
        });

        invalidateAllCache();
        return;
      }

      // Stage 2: PDF Compression (pdf-lib)
      let compressedSize = originalSize;
      let savingsPercent = 0;
      const ext = path.extname(originalName).toLowerCase();

      if (ext === ".pdf" || mimeType === "application/pdf") {
        jobStatusMap.set(noteId, {
          noteId,
          status: "processing",
          stage: "Compressing PDF Streams (pdf-lib)",
          progress: 50,
        });

        const compResult = await compressPdf(tempFilePath);
        compressedSize = compResult.compressedSize;
        savingsPercent = compResult.savingsPercent;
      }

      // Stage 3: WebP Thumbnail Generation (Sharp)
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Generating WebP Thumbnail",
        progress: 65,
      });

      let thumbnailUrl = null;
      if (mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        thumbnailUrl = await generateWebPThumbnail(tempFilePath);
      }

      // Stage 4: Telegram MTProto Cloud Push (8-Worker Engine)
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Syncing to Telegram Cloud (MTProto)",
        progress: 80,
      });

      const caption = `[ACADEMIC VAULT]\nTitle: ${meta.title || originalName}\nSubject: ${meta.subject || "General"}\nSem: ${meta.semester || "All"}\nSHA-256: ${fileHash.substring(0, 16)}...`;
      const uploadResult = await uploadToStorageChannel(tempFilePath, caption, originalName);

      // Stage 5: Finalize Firestore Document
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Finalizing Metadata",
        progress: 95,
      });

      if (db) {
        await db.collection("notes").doc(noteId).update({
          status: "ready",
          telegramMessageId: uploadResult.messageId,
          telegramDocumentId: uploadResult.documentId || null,
          telegramChannelId: uploadResult.channelId || null,
          fileHash: fileHash,
          fileSize: originalSize,
          compressedSize: compressedSize,
          savingsPercent: savingsPercent,
          thumbnailUrl: thumbnailUrl,
          downloadUrl: `/api/notes/${noteId}/stream`,
          updatedAt: new Date().toISOString(),
        });
      }

      // Clean up server temp file (100% Zero Persistent Server Disk Usage)
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
        console.log(`[QUEUE] Temp file safely purged: ${tempFilePath}`);
      }

      jobStatusMap.set(noteId, {
        noteId,
        status: "ready",
        stage: "Stored in Telegram Cloud & Ready",
        progress: 100,
        savingsPercent,
      });

      invalidateAllCache();
      console.log(`[QUEUE] Job finished successfully for Note: ${noteId}`);
    } catch (err) {
      console.error(`[QUEUE] Error processing job for Note ${noteId}:`, err);
      
      jobStatusMap.set(noteId, {
        noteId,
        status: "error",
        error: err.message,
        stage: "Failed",
      });

      if (db) {
        await db.collection("notes").doc(noteId).update({
          status: "error",
          errorMessage: err.message,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      // Clean up temp file on error too
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
    }
  });
}

function getJobStatus(noteId) {
  return jobStatusMap.get(noteId) || null;
}

module.exports = {
  enqueueUpload,
  getJobStatus,
};
