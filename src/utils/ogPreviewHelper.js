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
  if (cached !== undefined) return cached;

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

  ramCache.set(cacheKey, null, 300);
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
        <stop offset="0%" stop-color="#4361ee"/>
        <stop offset="100%" stop-color="#0f9f8f"/>
      </linearGradient>
    </defs>

    <rect width="1200" height="630" fill="url(#bgGrad)"/>
    <circle cx="1090" cy="110" r="240" fill="#4361ee" fill-opacity="0.16"/>
    <circle cx="110" cy="560" r="210" fill="#0f9f8f" fill-opacity="0.14"/>

    <rect x="64" y="56" width="1072" height="518" rx="28" fill="#0f172a" fill-opacity="0.72" stroke="#38bdf8" stroke-opacity="0.28" stroke-width="2"/>
    <rect x="64" y="56" width="1072" height="8" rx="4" fill="url(#accentGrad)"/>

    <!-- Brand Pill -->
    <rect x="110" y="106" width="375" height="44" rx="22" fill="#4361ee" fill-opacity="0.22" stroke="#60a5fa" stroke-opacity="0.45"/>
    <text x="136" y="135" fill="#93c5fd" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="1.2">FREE STUDY MATERIAL VAULT</text>

    <!-- Subject Pill -->
    <rect x="505" y="106" width="290" height="44" rx="22" fill="#0f9f8f" fill-opacity="0.22" stroke="#2dd4bf" stroke-opacity="0.45"/>
    <text x="530" y="135" fill="#5eead4" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700">${subjectText.slice(0, 22)}</text>

    <!-- Note Title -->
    <text x="110" y="242" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800">${titleLine1}</text>
    ${titleLine2 ? `<text x="110" y="308" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="800">${titleLine2}</text>` : ""}

    <!-- Metadata Pills Row -->
    <rect x="110" y="365" width="200" height="48" rx="12" fill="#1e293b" stroke="#475569"/>
    <text x="132" y="396" fill="#cbd5e1" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600">${courseText.slice(0, 14)}</text>

    <rect x="328" y="365" width="310" height="48" rx="12" fill="#1e293b" stroke="#475569"/>
    <text x="350" y="396" fill="#38bdf8" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600">${branchText.slice(0, 22)}</text>

    <rect x="656" y="365" width="270" height="48" rx="12" fill="#1e293b" stroke="#475569"/>
    <text x="678" y="396" fill="#fde047" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600">${termText.slice(0, 20)}</text>

    <!-- Footer Info -->
    <line x1="110" y1="468" x2="1090" y2="468" stroke="#334155" stroke-width="1.5"/>
    <text x="110" y="518" fill="#94a3b8" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="600">College: ${collegeText.slice(0, 38)}${sizeText}</text>
    <rect x="865" y="486" width="225" height="48" rx="24" fill="url(#accentGrad)"/>
    <text x="900" y="518" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700">Read Free PDF</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
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
