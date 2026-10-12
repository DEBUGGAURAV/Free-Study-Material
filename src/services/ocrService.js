const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");

/**
 * Extracts searchable text and formulas from handwritten notes or images using Tesseract OCR
 * @param {string} filePath 
 * @param {string} mimeType 
 * @returns {Promise<string>}
 */
async function extractOcrText(filePath, mimeType = "") {
  const ext = path.extname(filePath).toLowerCase();
  const isImage = mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".bmp"].includes(ext);

  // If not an image, OCR is skipped or deferred
  if (!isImage) {
    return "";
  }

  let worker = null;
  try {
    console.log(`[OCR] Initializing Tesseract OCR worker for: ${path.basename(filePath)}`);
    worker = await createWorker("eng");

    // Perform recognition with a 15-second timeout guard
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("OCR timeout (15s limit reached)")), 15000)
    );

    const recognizePromise = (async () => {
      const ret = await worker.recognize(filePath);
      return ret.data.text || "";
    })();

    const rawText = await Promise.race([recognizePromise, timeoutPromise]);

    // Clean & normalize extracted text
    const cleanedText = rawText
      .replace(/\r\n/g, " ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    console.log(`[OCR] Extracted ${cleanedText.length} characters of handwritten/scanned text.`);
    return cleanedText.substring(0, 8000); // Index up to 8,000 characters
  } catch (err) {
    console.warn("[OCR] Text extraction deferred:", err.message);
    return "";
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {}
    }
  }
}

module.exports = {
  extractOcrText,
};

