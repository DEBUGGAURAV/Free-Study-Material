/**
 * Smart file size formatter:
 * Formats byte values accurately, avoiding '0.0 MB' for small documents (e.g. 34 KB).
 * Displays real KB and MB values clearly so user never sees 0.0 MB.
 */
export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!num || isNaN(num) || num <= 0) return "PDF";
  if (num < 1024) return `${num} B`;
  const kb = num / 1024;
  const mb = num / (1024 * 1024);
  const gb = num / (1024 * 1024 * 1024);

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  if (mb < 0.01) {
    return `${kb.toFixed(1)} KB`;
  }
  if (mb < 0.1) {
    return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
  }
  return `${mb.toFixed(2)} MB`;
}

/**
 * Formats size strictly in MB with at least 2 decimals,
 * ensuring non-zero values for small files so progress monitors never show '0.0' or '0.00'.
 */
export function formatMB(bytes) {
  const num = Number(bytes);
  if (!num || isNaN(num) || num <= 0) return "0.01";
  const mb = num / (1024 * 1024);
  return mb < 0.01 ? "0.01" : mb.toFixed(2);
}

/**
 * Resolves the accurate, user-expected PDF download file name from note metadata.
 * Strips illegal characters and guarantees the .pdf extension.
 */
export function getNotePdfFileName(note) {
  if (!note) return "Free_Study_Material.pdf";
  const genericNames = [
    "blob", "blob.pdf", "document", "document.pdf", "file", "file.pdf",
    "stream", "stream.pdf", "download", "download.pdf", "null", "undefined",
    "untitled", "untitled.pdf"
  ];

  let candidate = "";
  const orig = (note.originalName || note.fileName || "").trim();
  const origLower = orig.toLowerCase();
  const title = (note.title || "").trim();
  const titleLower = title.toLowerCase();

  // Prefer originalName if valid and not generic
  if (orig && !genericNames.includes(origLower)) {
    candidate = orig;
  } else if (title && !genericNames.includes(titleLower)) {
    candidate = title;
  } else if (note.subject && note.subject !== "General Academic") {
    candidate = `${note.subject}_Notes`;
  } else {
    candidate = "Free_Study_Material";
  }

  // Remove illegal filesystem characters across Windows/Linux/Mac
  let clean = candidate.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
  if (!clean.toLowerCase().endsWith(".pdf")) {
    clean = `${clean}.pdf`;
  }
  return clean;
}


