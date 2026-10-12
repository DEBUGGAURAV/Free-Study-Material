const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

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

    let isDone = false;

    // Safety timeout: if worker takes longer than 25 seconds, terminate and keep original
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        console.warn(`[PDF-WORKER] Compression timed out after 25s for ${path.basename(inputFilePath)}. Using original file.`);
        worker.terminate().catch(() => {});
        resolve({
          compressedPath: inputFilePath,
          originalSize,
          compressedSize: originalSize,
          savingsPercent: 0,
        });
      }
    }, 25000);

    worker.on("message", (msg) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timer);
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
      if (!isDone) {
        isDone = true;
        clearTimeout(timer);
        console.warn(`[PDF-WORKER] Worker thread error (falling back to original):`, err.message);
        resolve({
          compressedPath: inputFilePath,
          originalSize,
          compressedSize: originalSize,
          savingsPercent: 0,
        });
      }
    });

    worker.on("exit", (code) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timer);
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
