const crypto = require("crypto");
const fs = require("fs");
const { db } = require("../firebase");

/**
 * Calculates SHA-256 checksum of a file on disk using streaming pipeline
 * @param {string} filePath 
 * @returns {Promise<string>} Hexadecimal SHA-256 digest
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Checks Firestore if this exact file hash has already been stored
 * @param {string} fileHash 
 * @returns {Promise<object|null>} Existing document data or null
 */
async function findDuplicateNote(fileHash, fileName = null, fileSize = null, excludeNoteId = null) {
  if (!db) return null;

  try {
    // 1. By fileHash
    if (fileHash) {
      const snapshot = await db
        .collection("notes")
        .where("fileHash", "==", fileHash)
        .limit(10)
        .get();

      if (!snapshot.empty) {
        for (const doc of snapshot.docs) {
          if (excludeNoteId && doc.id === excludeNoteId) continue;
          const data = doc.data();
          // Must have a real storage reference to be a valid duplicate!
          if (!data.telegramMessageId && !data.driveLink && !data.fileUrl) continue;

          console.log(`[DEDUP] Duplicate match found via SHA-256! (Existing Doc: ${doc.id})`);
          return {
            id: doc.id,
            telegramMessageId: data.telegramMessageId || null,
            telegramFileId: data.telegramFileId || null,
            driveLink: data.driveLink || null,
            fileUrl: data.fileUrl || null,
            fileSize: data.fileSize,
            compressedSize: data.compressedSize,
            mimeType: data.mimeType,
            thumbnailUrl: data.thumbnailUrl,
            downloadUrl: data.downloadUrl,
          };
        }
      }
    }

    // 2. By fileSize and fileName (detects notes synced from Telegram without prior SHA-256)
    if (fileSize && Number(fileSize) > 0) {
      const sizeSnap = await db
        .collection("notes")
        .where("fileSize", "==", Number(fileSize))
        .limit(20)
        .get();

      if (!sizeSnap.empty) {
        for (const doc of sizeSnap.docs) {
          if (excludeNoteId && doc.id === excludeNoteId) continue;
          const data = doc.data();
          // Must have a real storage reference to be a valid duplicate!
          if (!data.telegramMessageId && !data.driveLink && !data.fileUrl) continue;

          const cleanInput = (fileName || "").toLowerCase().trim();
          const cleanDoc = (data.originalName || data.title || "").toLowerCase().trim();

          if (
            cleanInput === cleanDoc ||
            cleanInput.replace(/[^a-z0-9]/g, "") === cleanDoc.replace(/[^a-z0-9]/g, "")
          ) {
            console.log(`[DEDUP] Duplicate match found via File Signature! (Existing Doc: ${doc.id})`);
            return {
              id: doc.id,
              telegramMessageId: data.telegramMessageId || null,
              telegramFileId: data.telegramFileId || null,
              driveLink: data.driveLink || null,
              fileUrl: data.fileUrl || null,
              fileSize: data.fileSize,
              compressedSize: data.compressedSize,
              mimeType: data.mimeType,
              thumbnailUrl: data.thumbnailUrl,
              downloadUrl: data.downloadUrl,
            };
          }
        }
      }
    }
  } catch (err) {
    console.error("[DEDUP] Error querying duplicates from Firestore:", err.message);
  }

  return null;
}

module.exports = {
  calculateFileHash,
  findDuplicateNote,
};

