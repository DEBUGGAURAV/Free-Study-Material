/**
 * 🔗 Smart WhatsApp / Telegram Link Preview Helper
 * Generates sanitized public note metadata, dynamic Open Graph HTML, and 1200x630 PNG preview cards.
 */

const sharp = require("sharp");
const { db } = require("../firebase");
const { ramCache } = require("./ramCache");
const { getAllCachedNotes } = require("../services/tursoNotesCacheService");

function escapeXmlAndHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapTextLines(text, maxCharsPerLine = 34, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Free Study Material Vault"];
  const lines = [];
  let current = "";

  for (const w of words) {
    if ((current + " " + w).trim().length <= maxCharsPerLine) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w.length > maxCharsPerLine ? w.slice(0, maxCharsPerLine - 1) + "…" : w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length + 3) {
    const last = lines[maxLines - 1];
    if (!last.endsWith("…")) {
      lines[maxLines - 1] = last.slice(0, Math.max(4, last.length - 1)) + "…";
    }
  }
  return lines;
}

function sanitizePublicNoteMeta(noteData, id) {
  if (!noteData || noteData.isVisible === false) return null;
  const rawSize = Number(noteData.compressedSize || noteData.fileSize || 0);
  const sizeLabel = rawSize > 0
    ? (rawSize >= 1024 * 1024 ? `${(rawSize / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(rawSize / 1024))} KB`)
    : "";

  return {
    id: String(id || noteData.id || ""),
    title: String(noteData.title || "Academic Study Notes").trim(),
    subject: String(noteData.subject || "General").trim(),
    course: String(noteData.course || "B.Tech").trim(),
    branch: String(noteData.branch || "All Branches").trim(),
    year: String(noteData.year || "").trim(),
    semester: String(noteData.semester || "").trim(),
    category: String(noteData.category || "Notes").trim(),
    unit: String(noteData.unit || "").trim(),
    college: String(noteData.college || "").trim(),
    downloads: Number(noteData.downloads || 0),
    sizeLabel,
  };
}

async function getPublicNoteMeta(noteId) {
  const cleanId = String(noteId || "").trim();
  if (!cleanId) return null;

  const cacheKey = `public_og_meta_${cleanId}`;
  const cached = ramCache.get(cacheKey);
  if (cached === "__NOT_FOUND__") return null;
  if (cached) return cached;

  // 1. Check multi-tier Turso/RAM catalog first (0 extra Firestore reads!)
  try {
    const allNotes = await getAllCachedNotes();
    if (Array.isArray(allNotes)) {
      const match = allNotes.find((n) => n && String(n.id) === cleanId);
      if (match) {
        const meta = sanitizePublicNoteMeta(match, cleanId);
        ramCache.set(cacheKey, meta, 3600);
        return meta;
      }
    }
  } catch (_) {}

  // 2. Fallback to direct Firestore doc read
  if (db) {
    try {
      const doc = await db.collection("notes").doc(cleanId).get();
      if (doc.exists) {
        const meta = sanitizePublicNoteMeta(doc.data(), doc.id);
        ramCache.set(cacheKey, meta, 3600);
        return meta;
      }
    } catch (_) {}
  }

  ramCache.set(cacheKey, "__NOT_FOUND__", 300);
  return null;
}

async function renderNoteOgPngBuffer(noteMeta) {
  const cacheKey = `public_og_png_${noteMeta?.id || "default"}`;
  const cached = ramCache.get(cacheKey);
  if (cached) return cached;

  const titleLines = wrapTextLines(noteMeta?.title || "Free Study Material — Academic Notes & PYQs", 34, 2);
  const subjectText = escapeXmlAndHtml(noteMeta?.subject || "Academic Vault");
  const courseText = escapeXmlAndHtml(noteMeta?.course || "B.Tech");
  const branchText = escapeXmlAndHtml(noteMeta?.branch || "All Branches");
  const termText = escapeXmlAndHtml(noteMeta?.semester || noteMeta?.year || noteMeta?.category || "Verified PDF");
  const collegeText = escapeXmlAndHtml(noteMeta?.college || "Free Study Material Cloud");
  const sizeText = noteMeta?.sizeLabel ? ` • ${escapeXmlAndHtml(noteMeta.sizeLabel)}` : "";

  const titleLine1 = escapeXmlAndHtml(titleLines[0] || "Academic Study Material");
  const titleLine2 = titleLines[1] ? escapeXmlAndHtml(titleLines[1]) : "";

  const svg = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#0b132b"/>
        <stop offset="55%" stop-color="#132043"/>
        <stop offset="100%" stop-color="#0d3b66"/>
      </linearGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#4f46e5"/>
        <stop offset="50%" stop-color="#06b6d4"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
      <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
    </defs>

    <rect width="1200" height="630" fill="url(#bgGrad)"/>
    <circle cx="1090" cy="110" r="280" fill="#4f46e5" fill-opacity="0.22"/>
    <circle cx="110" cy="560" r="240" fill="#06b6d4" fill-opacity="0.18"/>

    <rect x="64" y="56" width="1072" height="518" rx="28" fill="#0f172a" fill-opacity="0.88" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="2.5" filter="url(#cardShadow)"/>
    <rect x="64" y="56" width="1072" height="10" rx="5" fill="url(#accentGrad)"/>

    <!-- Brand Pill -->
    <rect x="110" y="104" width="410" height="48" rx="24" fill="#4f46e5" fill-opacity="0.28" stroke="#818cf8" stroke-opacity="0.75" stroke-width="1.8"/>
    <text x="138" y="136" fill="#c7d2fe" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="1.2">⚡ FREE STUDY MATERIAL VAULT</text>

    <!-- Subject Pill -->
    <rect x="540" y="104" width="320" height="48" rx="24" fill="#06b6d4" fill-opacity="0.25" stroke="#22d3ee" stroke-opacity="0.75" stroke-width="1.8"/>
    <text x="566" y="136" fill="#a5f3fc" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="800">${subjectText.slice(0, 22)}</text>

    <!-- Note Title (Crisp, High Contrast) -->
    <text x="110" y="238" fill="#ffffff" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="56" font-weight="900">${titleLine1}</text>
    ${titleLine2 ? `<text x="110" y="306" fill="#e0e7ff" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="50" font-weight="800">${titleLine2}</text>` : ""}

    <!-- Metadata Pills Row -->
    <rect x="110" y="362" width="210" height="52" rx="14" fill="#1e293b" stroke="#64748b" stroke-width="1.8"/>
    <text x="134" y="396" fill="#f8fafc" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="700">${courseText.slice(0, 14)}</text>

    <rect x="338" y="362" width="330" height="52" rx="14" fill="#1e293b" stroke="#38bdf8" stroke-width="1.8"/>
    <text x="362" y="396" fill="#38bdf8" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="700">${branchText.slice(0, 22)}</text>

    <rect x="686" y="362" width="280" height="52" rx="14" fill="#1e293b" stroke="#fbbf24" stroke-width="1.8"/>
    <text x="710" y="396" fill="#fde047" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="700">${termText.slice(0, 20)}</text>

    <!-- Footer Info -->
    <line x1="110" y1="466" x2="1090" y2="466" stroke="#334155" stroke-width="2"/>
    <text x="110" y="516" fill="#cbd5e1" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="26" font-weight="700">🏫 ${collegeText.slice(0, 36)}${sizeText}</text>
    <rect x="850" y="482" width="240" height="52" rx="26" fill="url(#accentGrad)"/>
    <text x="888" y="516" fill="#ffffff" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="24" font-weight="900">📖 Read Free PDF</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg), { density: 150 })
    .resize(1200, 630, { fit: "contain" })
    .png({ quality: 100, compressionLevel: 6 })
    .toBuffer();
  ramCache.set(cacheKey, pngBuffer, 3600);
  return pngBuffer;
}

function buildOgMetaTagsHtml(noteMeta, pageUrl, originUrl) {
  const title = noteMeta
    ? `${noteMeta.title} — ${noteMeta.subject} (${noteMeta.course})`
    : "Free Study Material — Academic Cloud & Notes Vault";

  const parts = [];
  if (noteMeta?.course) parts.push(noteMeta.course);
  if (noteMeta?.branch) parts.push(noteMeta.branch);
  if (noteMeta?.semester || noteMeta?.year) parts.push(noteMeta.semester || noteMeta.year);
  if (noteMeta?.college) parts.push(noteMeta.college);
  if (noteMeta?.sizeLabel) parts.push(noteMeta.sizeLabel);

  const description = noteMeta
    ? `${parts.join(" • ")} | Verified study notes, PYQs & flashcards — read online or download free on Free Study Material.`
    : "Browse student-shared study notes, previous question papers, and course resources.";

  const cleanOrigin = String(originUrl || "").replace(/\/+$/, "");
  const ogImage = noteMeta?.id
    ? `${cleanOrigin}/api/notes/${encodeURIComponent(noteMeta.id)}/og-image.png`
    : `${cleanOrigin}/favicon.ico`;

  return `
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Free Study Material Vault" />
    <meta property="og:title" content="${escapeXmlAndHtml(title)}" />
    <meta property="og:description" content="${escapeXmlAndHtml(description)}" />
    <meta property="og:url" content="${escapeXmlAndHtml(pageUrl || cleanOrigin)}" />
    <meta property="og:image" content="${escapeXmlAndHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeXmlAndHtml(title)}" />
    <meta name="twitter:description" content="${escapeXmlAndHtml(description)}" />
    <meta name="twitter:image" content="${escapeXmlAndHtml(ogImage)}" />
  `;
}

module.exports = {
  escapeXmlAndHtml,
  getPublicNoteMeta,
  renderNoteOgPngBuffer,
  buildOgMetaTagsHtml,
};
