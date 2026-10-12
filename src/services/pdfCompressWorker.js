const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

async function runCompression() {
  const { inputFilePath } = workerData;

  try {
    const originalSize = fs.statSync(inputFilePath).size;
    const fileBytes = await fs.promises.readFile(inputFilePath);

    // Load document with ignoreEncryption fallback
    const pdfDoc = await PDFDocument.load(fileBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    // Save with object streams enabled (compresses cross-reference tables and streams)
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    const compressedSize = compressedBytes.length;

    // Only overwrite if it actually saved space
    if (compressedSize < originalSize) {
      await fs.promises.writeFile(inputFilePath, compressedBytes);
      const savingsPercent = Math.round(((originalSize - compressedSize) / originalSize) * 100);
      parentPort.postMessage({
        success: true,
        compressedPath: inputFilePath,
        originalSize,
        compressedSize,
        savingsPercent,
      });
    } else {
      parentPort.postMessage({
        success: true,
        compressedPath: inputFilePath,
        originalSize,
        compressedSize: originalSize,
        savingsPercent: 0,
      });
    }
  } catch (err) {
    const originalSize = fs.existsSync(inputFilePath) ? fs.statSync(inputFilePath).size : 0;
    parentPort.postMessage({
      success: false,
      error: err.message,
      compressedPath: inputFilePath,
      originalSize,
      compressedSize: originalSize,
      savingsPercent: 0,
    });
  }
}

runCompression();

