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
async function findDuplicateNote(fileHash) {
  if (!db || !fileHash) return null;

  try {
    const snapshot = await db
      .collection("notes")
      .where("fileHash", "==", fileHash)
      .where("status", "==", "ready")
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      console.log(`[DEDUP] Duplicate match found! Hash: ${fileHash.substring(0, 12)}... (Existing Doc: ${doc.id})`);
      return {
        id: doc.id,
        telegramMessageId: data.telegramMessageId,
        telegramFileId: data.telegramFileId,
        fileSize: data.fileSize,
        compressedSize: data.compressedSize,
        mimeType: data.mimeType,
        thumbnailUrl: data.thumbnailUrl,
        downloadUrl: data.downloadUrl,
      };
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
