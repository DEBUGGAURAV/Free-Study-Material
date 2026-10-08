const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

/**
 * Optimizes and compresses a PDF document using pdf-lib stream packaging
 * @param {string} inputFilePath 
 * @returns {Promise<{compressedPath: string, originalSize: number, compressedSize: number, savingsPercent: number}>}
 */
async function compressPdf(inputFilePath) {
  const originalSize = fs.statSync(inputFilePath).size;

  try {
    const fileBytes = await fs.promises.readFile(inputFilePath);
    
    // Load document with ignoreEncryption fallback
    const pdfDoc = await PDFDocument.load(fileBytes, { 
      ignoreEncryption: true,
      updateMetadata: false 
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
      console.log(`[PDF-COMPRESS] Saved ${savingsPercent}%: ${originalSize} -> ${compressedSize} bytes`);
      return {
        compressedPath: inputFilePath,
        originalSize,
        compressedSize,
        savingsPercent,
      };
    } else {
      console.log(`[PDF-COMPRESS] File already maximally compressed (${originalSize} bytes). Kept original.`);
      return {
        compressedPath: inputFilePath,
        originalSize,
        compressedSize: originalSize,
        savingsPercent: 0,
      };
    }
  } catch (err) {
    console.warn(`[PDF-COMPRESS] Compression skipped (non-standard or encrypted PDF):`, err.message);
    return {
      compressedPath: inputFilePath,
      originalSize,
      compressedSize: originalSize,
      savingsPercent: 0,
    };
  }
}

module.exports = {
  compressPdf,
};

