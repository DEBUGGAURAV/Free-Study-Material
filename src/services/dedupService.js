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
 * Extracts a standardized duplicate metadata payload from a Firestore document
 */
function extractDuplicatePayload(doc) {
  const data = doc.data();
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
          return extractDuplicatePayload(doc);
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
            return extractDuplicatePayload(doc);
          }
        }
      }
    }

    // 3. Smart Size Variance Check (e.g. 1.0MB vs 1.2MB same document with <= 3MB variance)
    if (fileSize && Number(fileSize) > 0 && fileName) {
      try {
        const { getDedupSettings } = require("./dedupSettings");
        const dedupCfg = getDedupSettings();

        if (dedupCfg.enableSmartDeduplication !== false) {
          const maxVarianceBytes = Number(dedupCfg.dedupMaxVarianceBytes || (3 * 1024 * 1024));
          const cleanInput = (fileName || "").toLowerCase().trim();
          const normInput = cleanInput.replace(/[^a-z0-9]/g, "");

          if (normInput.length >= 4) {
            // Query recent notes to check for normalized title matching
            const recentSnap = await db.collection("notes").limit(120).get().catch(() => null);
            if (recentSnap && !recentSnap.empty) {
              for (const doc of recentSnap.docs) {
                if (excludeNoteId && doc.id === excludeNoteId) continue;
                const data = doc.data();
                if (!data.telegramMessageId && !data.driveLink && !data.fileUrl) continue;

                const docName = (data.originalName || data.title || "").toLowerCase().trim();
                const normDoc = docName.replace(/[^a-z0-9]/g, "");

                if (normDoc && (normInput === normDoc || (normInput.length > 8 && normDoc.length > 8 && (normInput.includes(normDoc) || normDoc.includes(normInput))))) {
                  const existingSize = Number(data.fileSize || 0);
                  if (existingSize > 0) {
                    const sizeDiff = Math.abs(Number(fileSize) - existingSize);
                    if (sizeDiff <= maxVarianceBytes) {
                      console.log(
                        `[DEDUP] 🧬 Smart Size Variance match! New: ${(Number(fileSize) / (1024 * 1024)).toFixed(2)}MB, Existing: ${(existingSize / (1024 * 1024)).toFixed(2)}MB (Variance: ${(sizeDiff / 1024).toFixed(1)}KB <= ${(maxVarianceBytes / (1024 * 1024)).toFixed(2)}MB limit). Doc: ${doc.id}`
                      );
                      return extractDuplicatePayload(doc);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[DEDUP] Smart variance evaluation notice:", err.message);
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

