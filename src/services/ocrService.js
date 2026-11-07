const path = require("path");
const fs = require("fs");
const { createWorker } = require("tesseract.js");

// 🛡️ Concurrency Gate: Exactly 1 OCR worker at a time (Render 512MB RAM Guard)
// Each Tesseract WASM instance takes ~120-150MB RAM. Parallel runs would trigger instant SIGKILL.
let activeOcrRunning = false;
const ocrWaitQueue = [];
const MAX_OCR_WAIT_QUEUE_LEN = 5;

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

  // File size guard: Files > 30MB are too heavy for in-memory Tesseract WASM on 512MB container
  try {
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (stat && stat.size > 30 * 1024 * 1024) {
      console.warn(`[OCR] File size ${(stat.size / (1024 * 1024)).toFixed(1)}MB exceeds safe OCR limit (30MB). Skipping OCR.`);
      return "";
    }
  } catch {}

  // If already running, queue execution
  if (activeOcrRunning) {
    if (ocrWaitQueue.length >= MAX_OCR_WAIT_QUEUE_LEN) {
      console.warn(`[OCR] Wait queue full (${ocrWaitQueue.length}). Deferring OCR for ${path.basename(filePath)}.`);
      return "";
    }
    await new Promise((resolve) => ocrWaitQueue.push(resolve));
  }

  activeOcrRunning = true;
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
    activeOcrRunning = false;
    // Release next pending OCR task if any
    if (ocrWaitQueue.length > 0) {
      const nextTask = ocrWaitQueue.shift();
      if (typeof nextTask === "function") nextTask();
    }
  }
}

module.exports = {
  extractOcrText,
};

