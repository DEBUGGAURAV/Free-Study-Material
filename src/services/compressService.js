const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const { attachWorkerWatchdog } = require("../utils/selfHealingWatchdog");

/**
 * Optimizes and compresses a PDF document using an isolated background Worker Thread.
 * Keeps Node.js main event loop at 0% CPU so other users experience 0 ms latency.
 * 
 * @param {string} inputFilePath 
 * @returns {Promise<{compressedPath: string, originalSize: number, compressedSize: number, savingsPercent: number}>}
 */
async function compressPdf(inputFilePath) {
  const originalSize = fs.existsSync(inputFilePath) ? fs.statSync(inputFilePath).size : 0;

  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, "pdfCompressWorker.js");

    const worker = new Worker(workerPath, {
      workerData: { inputFilePath },
    });

    // 🛡️ Watchdog supervision: Auto-recycle hung threads and reclaim memory buffers after 25s
    const watchdog = attachWorkerWatchdog(worker, inputFilePath, originalSize, 25000);

    worker.on("message", (msg) => {
      if (!watchdog.isDone()) {
        watchdog.finish();
        if (msg.success) {
          if (msg.savingsPercent > 0) {
            console.log(`[PDF-WORKER] 🧵 Background Worker Thread saved ${msg.savingsPercent}%: ${msg.originalSize} -> ${msg.compressedSize} bytes`);
          } else {
            console.log(`[PDF-WORKER] 🧵 File already maximally compressed (${msg.originalSize} bytes). Kept original.`);
          }
          resolve({
            compressedPath: msg.compressedPath,
            originalSize: msg.originalSize,
            compressedSize: msg.compressedSize,
            savingsPercent: msg.savingsPercent,
          });
        } else {
          console.warn(`[PDF-WORKER] Worker skipped compression: ${msg.error}`);
          resolve({
            compressedPath: inputFilePath,
            originalSize,
            compressedSize: originalSize,
            savingsPercent: 0,
          });
        }
      }
    });

    worker.on("error", (err) => {
      if (!watchdog.isDone()) {
        watchdog.finish();
        console.warn(`[PDF-WORKER] Worker thread error (falling back to original safely):`, err.message);
        resolve({
          compressedPath: inputFilePath,
          originalSize,
          compressedSize: originalSize,
          savingsPercent: 0,
        });
      }
    });

    worker.on("exit", (code) => {
      if (!watchdog.isDone()) {
        watchdog.finish();
        if (code !== 0) {
          console.warn(`[PDF-WORKER] Worker stopped with exit code ${code}`);
        }
        resolve({
          compressedPath: inputFilePath,
          originalSize,
          compressedSize: originalSize,
          savingsPercent: 0,
        });
      }
    });
  });
}

module.exports = {
  compressPdf,
};
