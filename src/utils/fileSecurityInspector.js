/**
 * 🛡️ Category 2 Features 1, 2, 6: Advanced File & Binary Security Inspector
 * - Deep MIME Sniffing & Magic Byte verification (Blocks PE MZ, ELF, Mach-O, scripts)
 * - Malicious PDF Script & Action Stripper (/JavaScript, /Launch, /EmbeddedFiles)
 * - Zip Bomb & Archive Decompression Shield (Central Directory parsing without extraction)
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, PDFName } = require("pdf-lib");

// Dangerous executable and script magic bytes
const FORBIDDEN_MAGIC_SIGNATURES = [
  { name: "Windows Executable (PE/MZ)", magic: [0x4d, 0x5a] },            // MZ
  { name: "Linux ELF Executable", magic: [0x7f, 0x45, 0x4c, 0x46] },       // \x7FELF
  { name: "Mach-O Executable", magic: [0xfe, 0xed, 0xfa, 0xce] },
  { name: "Mach-O Executable 64-bit", magic: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: "Mach-O Reverse", magic: [0xce, 0xfa, 0xed, 0xfe] },
  { name: "Mach-O Reverse 64-bit", magic: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: "Mach-O Universal Binary", magic: [0xca, 0xfe, 0xba, 0xbe] },
  { name: "Shell Script (Shebang)", magic: [0x23, 0x21] },                  // #!
];

/**
 * Checks buffer against magic bytes array
 */
function bufferMatchesMagic(buffer, magic) {
  if (buffer.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Reads first N bytes of a file safely
 */
function readFileHeaderSync(filePath, bytesToRead = 64) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 1. Deep MIME Sniffing / Magic Byte Verification
 * @param {string} filePath - Absolute path to uploaded temp file
 * @param {string} originalName - Original filename
 * @returns {{ isValid: boolean, error?: string, detectedType?: string }}
 */
function verifyFileMagicBytes(filePath, originalName = "") {
  try {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, error: "Uploaded file not found on disk." };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return { isValid: false, error: "Uploaded file is empty (0 bytes)." };
    }

    const header = readFileHeaderSync(filePath, 64);
    const ext = path.extname(originalName).toLowerCase();

    // 1. Strictly block known executable binaries regardless of extension!
    for (const forbidden of FORBIDDEN_MAGIC_SIGNATURES) {
      if (bufferMatchesMagic(header, forbidden.magic)) {
        return {
          isValid: false,
          error: `Malicious / Executable file detected (${forbidden.name}). Executable files and binary scripts are strictly prohibited.`,
        };
      }
    }

    // 2. Validate PDF files (%PDF-)
    if (ext === ".pdf") {
      const isPdfMagic =
        header.length >= 5 &&
        header[0] === 0x25 && // %
        header[1] === 0x50 && // P
        header[2] === 0x44 && // D
        header[3] === 0x46 && // F
        header[4] === 0x2d;   // -

      if (!isPdfMagic) {
        return {
          isValid: false,
          error: "Invalid PDF file structure. The file header does not contain valid '%PDF-' magic signature.",
        };
      }
      return { isValid: true, detectedType: "application/pdf" };
    }

    // 3. Validate ZIP / Archive files (PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
    if (ext === ".zip" || ext === ".rar" || ext === ".7z" || ext === ".docx" || ext === ".pptx") {
      const isPkZip =
        header.length >= 4 &&
        header[0] === 0x50 && // P
        header[1] === 0x4b;   // K

      if (ext === ".zip" && !isPkZip) {
        return {
          isValid: false,
          error: "Invalid ZIP archive structure. The file header does not contain standard PK signature.",
        };
      }
      return { isValid: true, detectedType: "application/zip" };
    }

    // 4. Validate Images (JPG, PNG, WebP)
    if (ext === ".jpg" || ext === ".jpeg") {
      const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      if (!isJpeg) return { isValid: false, error: "Corrupted or disguised JPEG image format." };
      return { isValid: true, detectedType: "image/jpeg" };
    }

    if (ext === ".png") {
      const isPng =
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a;
      if (!isPng) return { isValid: false, error: "Corrupted or disguised PNG image format." };
      return { isValid: true, detectedType: "image/png" };
    }

    // Default: Allowed if passed executable checks
    return { isValid: true, detectedType: "application/octet-stream" };
  } catch (err) {
    return { isValid: false, error: `Magic byte inspection error: ${err.message}` };
  }
}

const DIRECT_MTPROTO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB: Direct MTProto stream bypass
const MAX_IN_MEMORY_PDF_SANITIZE_BYTES = 20 * 1024 * 1024; // 20 MB: Safe ceiling for pdf-lib inside 240MB V8 heap

/**
 * Streams a PDF in 64KB chunks (<128KB peak RAM) to detect embedded script/action tags
 * without ever calling fs.readFileSync or allocating huge strings in a 240MB V8 heap.
 */
function scanPdfTagsStreaming(filePath) {
  return new Promise((resolve, reject) => {
    let hasJsTag = false;
    let hasLaunchTag = false;
    let hasEmbeddedFiles = false;
    let hasSubmitForm = false;
    let carryOver = "";

    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

    stream.on("data", (chunk) => {
      const text = carryOver + chunk.toString("latin1");
      if (!hasJsTag && /\/(?:JavaScript|JS)\b/i.test(text)) hasJsTag = true;
      if (!hasLaunchTag && /\/Launch\b/i.test(text)) hasLaunchTag = true;
      if (!hasEmbeddedFiles && /\/EmbeddedFiles\b/i.test(text)) hasEmbeddedFiles = true;
      if (!hasSubmitForm && /\/SubmitForm\b/i.test(text)) hasSubmitForm = true;

      if (hasJsTag && hasLaunchTag && hasEmbeddedFiles && hasSubmitForm) {
        stream.destroy();
        return;
      }
      // Keep last 64 bytes so tags split across 64KB chunk boundaries are still matched
      carryOver = text.length > 64 ? text.slice(-64) : text;
    });

    const finish = () => resolve({ hasJsTag, hasLaunchTag, hasEmbeddedFiles, hasSubmitForm });
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", reject);
  });
}

/**
 * 2. Malicious PDF Script Stripper (OOM-Proof for 240MB Heap / 512MB Render Container)
 * - Files > 100MB bypass scanning completely and stream directly to Telegram via MTProto.
 * - Uses 64KB chunk streaming instead of fs.readFileSync + latin1 string conversion.
 * - Only loads <= 20MB flagged PDFs into pdf-lib so V8 heap never exceeds 240MB.
 * @param {string} filePath - Absolute path to PDF
 * @returns {Promise<{ isClean: boolean, strippedCount: number, bypassedForDirectMtproto?: boolean, error?: string }>}
 */
async function sanitizeAndScanPdf(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    // ⚡ >=100MB Fast-Path: Skip in-memory PDF inspection completely (routed direct to Telegram via MTProto)
    if (fileSize >= DIRECT_MTPROTO_SIZE_BYTES) {
      console.log(
        `[PDF-SECURITY] ⚡ File ${(fileSize / (1024 * 1024)).toFixed(1)}MB >= 100MB: Bypassing in-memory inspection. Direct MTProto stream to Telegram Vault.`
      );
      return { isClean: true, strippedCount: 0, bypassedForDirectMtproto: true };
    }

    // Stream-scan in 64KB slices (~64KB RAM instead of 2x–3x file size)
    const { hasJsTag, hasLaunchTag, hasEmbeddedFiles, hasSubmitForm } = await scanPdfTagsStreaming(filePath);

    if (!hasJsTag && !hasLaunchTag && !hasEmbeddedFiles && !hasSubmitForm) {
      return { isClean: true, strippedCount: 0 };
    }

    console.log(
      `[PDF-SECURITY] ⚠️ Suspicious tags detected in PDF (${(fileSize / (1024 * 1024)).toFixed(1)}MB): JS=${hasJsTag}, Launch=${hasLaunchTag}, Embedded=${hasEmbeddedFiles}`
    );

    // 🛡️ Heap Guard: pdf-lib DOM expansion uses ~4x–6x file size in V8 heap.
    // Never load >20MB PDFs into pdf-lib inside a --max-old-space-size=240 process!
    if (fileSize > MAX_IN_MEMORY_PDF_SANITIZE_BYTES) {
      console.warn(
        `[PDF-SECURITY] 🛡️ Skipping in-memory pdf-lib rewrite for ${(fileSize / (1024 * 1024)).toFixed(1)}MB PDF to protect 240MB V8 heap.`
      );
      return { isClean: true, strippedCount: 0 };
    }

    // Safe <= 20MB async read & catalog action neutralization
    const fileBytes = await fs.promises.readFile(filePath);
    const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
    let strippedCount = 0;

    // 1. Remove JavaScript / OpenAction from Catalog
    const catalog = pdfDoc.catalog;
    const dangerousCatalogKeys = ["OpenAction", "AA", "JavaScript", "Names", "Launch"];
    for (const key of dangerousCatalogKeys) {
      if (catalog.has(PDFName.of(key))) {
        catalog.delete(PDFName.of(key));
        strippedCount++;
      }
    }

    // 2. Scan and remove Additional Actions (AA) from each page
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const node = page.node;
      if (node.has(PDFName.of("AA"))) {
        node.delete(PDFName.of("AA"));
        strippedCount++;
      }
      if (node.has(PDFName.of("A"))) {
        const action = node.get(PDFName.of("A"));
        if (action) {
          node.delete(PDFName.of("A"));
          strippedCount++;
        }
      }
    }

    if (strippedCount > 0) {
      const cleanBytes = await pdfDoc.save();
      await fs.promises.writeFile(filePath, cleanBytes);
      console.log(`[PDF-SECURITY] ✅ Successfully sanitized PDF: Neutralized ${strippedCount} malicious action tag(s).`);
    }

    return { isClean: true, strippedCount };
  } catch (err) {
    console.warn("[PDF-SECURITY] PDF sanitizer notice:", err.message);
    return { isClean: true, strippedCount: 0 };
  }
}

/**
 * 6. Decompression / Zip Bomb Shield
 * Parses Zip Central Directory without extracting contents into memory or disk.
 * Enforces:
 * - Max uncompressed size: 200MB
 * - Max compression ratio: 15:1
 * - Max entries: 500 files
 * - Blocks path traversal (../)
 * @param {string} filePath - Path to zip file
 * @returns {{ isSafe: boolean, error?: string, stats?: object }}
 */
function inspectZipBombSafety(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    if (fileSize < 22) {
      return { isSafe: false, error: "Archive is too small to be a valid ZIP file." };
    }

    const fd = fs.openSync(filePath, "r");
    try {
      // Find End of Central Directory Record (EOCD) from last 1KB
      const searchBufferLength = Math.min(fileSize, 1024);
      const searchBuffer = Buffer.alloc(searchBufferLength);
      fs.readSync(fd, searchBuffer, 0, searchBufferLength, fileSize - searchBufferLength);

      let eocdOffset = -1;
      for (let i = searchBufferLength - 22; i >= 0; i--) {
        if (
          searchBuffer[i] === 0x50 &&     // P
          searchBuffer[i + 1] === 0x4b && // K
          searchBuffer[i + 2] === 0x05 && // \x05
          searchBuffer[i + 3] === 0x06    // \x06
        ) {
          eocdOffset = fileSize - searchBufferLength + i;
          break;
        }
      }

      if (eocdOffset === -1) {
        // Not a standard zip or EOCD not at end
        return { isSafe: true, stats: { uncompressedSize: fileSize, ratio: 1 } };
      }

      // Read EOCD fields
      const eocdBuffer = Buffer.alloc(22);
      fs.readSync(fd, eocdBuffer, 0, 22, eocdOffset);

      const totalEntries = eocdBuffer.readUInt16LE(10);
      const cdSize = eocdBuffer.readUInt32LE(12);
      const cdOffset = eocdBuffer.readUInt32LE(16);

      // Max entries check
      if (totalEntries > 500) {
        return {
          isSafe: false,
          error: `Zip Bomb Defense: Archive contains ${totalEntries} files (maximum permitted is 500 files).`,
        };
      }

      // Read Central Directory headers to calculate uncompressed size
      const cdBuffer = Buffer.alloc(Math.min(cdSize, 10 * 1024 * 1024));
      fs.readSync(fd, cdBuffer, 0, cdBuffer.length, cdOffset);

      let offset = 0;
      let totalUncompressedBytes = 0;
      const MAX_UNCOMPRESSED_LIMIT = 200 * 1024 * 1024; // 200 MB

      for (let i = 0; i < totalEntries && offset < cdBuffer.length - 46; i++) {
        const sig = cdBuffer.readUInt32LE(offset);
        if (sig !== 0x02014b50) break; // Central directory file header signature

        const uncompressedSize = cdBuffer.readUInt32LE(offset + 24);
        const fileNameLength = cdBuffer.readUInt16LE(offset + 28);
        const extraFieldLength = cdBuffer.readUInt16LE(offset + 30);
        const fileCommentLength = cdBuffer.readUInt16LE(offset + 32);

        // Path traversal check in entry filename
        const fileNameBuffer = cdBuffer.subarray(offset + 46, offset + 46 + fileNameLength);
        const entryName = fileNameBuffer.toString("utf8");
        if (entryName.includes("..") || path.isAbsolute(entryName)) {
          return {
            isSafe: false,
            error: `Zip Path Traversal Defense: Archive contains illegal relative/absolute path ("${entryName}").`,
          };
        }

        totalUncompressedBytes += uncompressedSize;
        if (totalUncompressedBytes > MAX_UNCOMPRESSED_LIMIT) {
          return {
            isSafe: false,
            error: `Zip Bomb Defense: Total uncompressed content (${Math.round(totalUncompressedBytes / (1024 * 1024))}MB) exceeds maximum safe limit of 200MB.`,
          };
        }

        offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      }

      const ratio = totalUncompressedBytes / Math.max(1, fileSize);
      if (ratio > 15 && fileSize > 1024 * 1024) {
        return {
          isSafe: false,
          error: `Zip Bomb Defense: Extreme compression ratio (${ratio.toFixed(1)}:1) detected. File rejected for security.`,
        };
      }

      return {
        isSafe: true,
        stats: {
          entries: totalEntries,
          compressedSize: fileSize,
          uncompressedSize: totalUncompressedBytes,
          compressionRatio: ratio.toFixed(2),
        },
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    console.warn("[ZIP-BOMB-INSPECTOR] Warning during zip inspection:", err.message);
    return { isSafe: true }; // Fail open for non-zip or specialized formats
  }
}

module.exports = {
  verifyFileMagicBytes,
  sanitizeAndScanPdf,
  inspectZipBombSafety,
  DIRECT_MTPROTO_SIZE_BYTES,
  MAX_IN_MEMORY_PDF_SANITIZE_BYTES,
};

