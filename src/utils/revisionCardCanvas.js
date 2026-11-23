/**
 * 📸 1-Click Shareable Formula / Cheat-Sheet Revision Card (Client Canvas -> PNG)
 * 100% Browser-side HD PNG generation (0 server CPU, 0 server bandwidth).
 * Includes automatic Free Study Material branding badge & QR share link.
 */
import QRCode from "qrcode";

function cleanMarkdownForCard(rawText = "") {
  return String(rawText || "")
    .replace(/```mermaid[\s\S]*?```/gi, "[Diagram attached inside Reader]")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/^#{1,4}\s*/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const paragraphs = String(text || "").split("\n");
  const lines = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  const rad = Math.max(0, Math.min(r, Math.floor(rw / 2), Math.floor(rh / 2)));
  ctx.beginPath();
  ctx.moveTo(rx + rad, ry);
  ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
  ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
  ctx.arcTo(rx, ry + rh, rx, ry, rad);
  ctx.arcTo(rx, ry, rx + rw, ry, rad);
  ctx.closePath();
}

const FONT_SANS = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'JetBrains Mono', Consolas, 'SF Mono', monospace";

/**
 * Renders a crisp 1080px-wide HD Cheat-Sheet Revision Card as a PNG Blob.
 */
export async function generateRevisionCardPngBlob({
  title = "Quick Revision Sheet",
  subtitle = "High-Yield Exam Notes & Key Formulas",
  badgeText = "⚡ EXAM CHEAT-SHEET",
  content = "",
  shareUrl = typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev",
  siteName = "Free Study Material",
} = {}) {
  const WIDTH = 1080;
  const PAD = 64;
  const BODY_W = WIDTH - PAD * 2 - 48;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Razor-sharp canvas text smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try {
    ctx.textRendering = "geometricPrecision";
  } catch (_) {}

  const cleaned = cleanMarkdownForCard(content) || "Key formulas & concepts saved for quick exam hall revision.";
  ctx.font = `600 32px ${FONT_SANS}`;
  let bodyLines = wrapCanvasText(ctx, cleaned, BODY_W);
  if (bodyLines.length > 26) {
    bodyLines = [...bodyLines.slice(0, 25), "… Read complete notes & diagrams inside Free Study Material!"];
  }

  ctx.font = `900 52px ${FONT_SANS}`;
  const titleLines = wrapCanvasText(ctx, String(title).slice(0, 110), WIDTH - PAD * 2).slice(0, 2);

  const lineHeight = 48;
  const headerH = 205 + titleLines.length * 60;
  const contentBoxH = Math.max(250, bodyLines.length * lineHeight + 76);
  const footerH = 195;
  const HEIGHT = Math.min(2200, headerH + contentBoxH + footerH + 40);

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // 1. Pure White Luxury Ambient Gradient (Crisp Studio Finish)
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#ffffff");
  bgGrad.addColorStop(0.35, "#f8fafc");
  bgGrad.addColorStop(0.7, "#f1f5f9");
  bgGrad.addColorStop(1, "#f8fafc");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle decorative glow orbs
  const glow1 = ctx.createRadialGradient(WIDTH - 110, 120, 20, WIDTH - 110, 120, 340);
  glow1.addColorStop(0, "rgba(99, 102, 241, 0.15)");
  glow1.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer card frame border (Sharp 3px solid)
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 32);
  ctx.stroke();

  // 2. Top Badge Pill
  ctx.font = `800 26px ${FONT_SANS}`;
  const badgeW = Math.min(WIDTH - PAD * 2, Math.round(ctx.measureText(badgeText).width + 56));
  const badgeGrad = ctx.createLinearGradient(PAD, 60, PAD + badgeW, 112);
  badgeGrad.addColorStop(0, "#4f46e5");
  badgeGrad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 60, badgeW, 52, 26);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 28, 96);

  // 3. Title & Subtitle (High Contrast Obsidian)
  let curY = 180;
  ctx.font = `900 52px ${FONT_SANS}`;
  ctx.fillStyle = "#090d16";
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += 62;
  }

  ctx.font = `800 28px ${FONT_SANS}`;
  ctx.fillStyle = "#4338ca";
  ctx.fillText(String(subtitle).slice(0, 72), PAD, curY + 6);
  curY += 46;

  // 4. Inner Content Panel (Pure White Elevated Studio Box)
  const boxY = curY;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(99, 102, 241, 0.32)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, PAD, boxY, WIDTH - PAD * 2, contentBoxH, 26);
  ctx.fill();
  ctx.stroke();

  let textY = boxY + 58;
  ctx.font = `600 32px ${FONT_SANS}`;
  for (const bLine of bodyLines) {
    if (textY > boxY + contentBoxH - 24) break;
    if (bLine === "") {
      textY += 20;
      continue;
    }
    const isBulletOrHeading = bLine.startsWith("•") || bLine.startsWith("📌") || bLine.startsWith("💡") || bLine.startsWith("⚡");
    ctx.fillStyle = isBulletOrHeading ? "#4338ca" : "#1e293b";
    ctx.fillText(bLine, PAD + 32, textY);
    textY += lineHeight;
  }

  // 5. Branded Bottom Footer + Live Scannable QR Code
  const footerY = HEIGHT - 168;
  ctx.fillStyle = "#f8faff";
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, PAD, footerY, WIDTH - PAD * 2, 120, 22);
  ctx.fill();
  ctx.stroke();

  ctx.font = `900 32px ${FONT_SANS}`;
  ctx.fillStyle = "#090d16";
  ctx.fillText(`📚 ${siteName}`, PAD + 26, footerY + 48);

  ctx.font = `700 24px ${FONT_SANS}`;
  ctx.fillStyle = "#334155";
  ctx.fillText("Scan QR with camera to open full PDF notes & AI Tutor", PAD + 26, footerY + 88);

  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 100,
      margin: 1,
      color: { dark: "#090d16", light: "#ffffff" },
    });
    const qrImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    const qrX = WIDTH - PAD - 118;
    const qrY = footerY + 10;
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, qrX - 4, qrY - 4, 108, 108, 12);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, 100, 100);
  } catch (_) {}

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed"));
    }, "image/png");
  });
}

/**
 * Generates HD PNG Card and invokes Web Share (if mobile/files supported) or instant download.
 */
export async function shareOrDownloadRevisionCard(options = {}) {
  const blob = await generateRevisionCardPngBlob(options);
  const safeName = String(options.title || "revision-card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || "revision-card";
  const fileName = `${safeName}-cheatsheet.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  // Try native share on mobile when file sharing is supported
  if (!options.forceDownload && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${options.title || "Study Cheat-Sheet"} — Free Study Material`,
        text: `Quick Revision Card from Free Study Material: ${options.shareUrl || ""}`,
        files: [file],
      });
      return { method: "shared", fileName };
    } catch (err) {
      if (err?.name === "AbortError") return { method: "cancelled", fileName };
    }
  }

  // Fallback / Desktop: Instant PNG Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { method: "downloaded", fileName };
}

/**
 * Convert Canvas to File object synchronously (0ms delay, preserves browser user-activation)
 */
export function canvasToFile(canvas, fileName = "study-story.png") {
  const dataUrl = canvas.toDataURL("image/png");
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
}

/**
 * 📲 1-Tap WhatsApp Status & Story Card Canvas (1080x1920 9:16 Vertical HD)
 * Synchronous generation with scannable QR Code and Free Study Material branding.
 * Features ultra-crisp typography, integer coordinate antialiasing, and high-contrast styling.
 */
export function generateWhatsAppStoryCardCanvas(note = {}, shareUrl = "") {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const PAD = 72;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  // Razor-sharp canvas antialiasing & image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try {
    ctx.textRendering = "geometricPrecision";
  } catch (_) {}

  // 1. Studio Clean White Luxury Gradient (Crisp, High-Contrast Backdrop)
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#ffffff");
  bgGrad.addColorStop(0.35, "#f8fafc");
  bgGrad.addColorStop(0.7, "#f1f5f9");
  bgGrad.addColorStop(1, "#f8fafc");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. High-Definition Ambient Glowing Orbs
  const glowTop = ctx.createRadialGradient(WIDTH * 0.85, 200, 20, WIDTH * 0.85, 200, 520);
  glowTop.addColorStop(0, "rgba(99, 102, 241, 0.15)");
  glowTop.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowMid = ctx.createRadialGradient(WIDTH * 0.15, HEIGHT * 0.48, 30, WIDTH * 0.15, HEIGHT * 0.48, 540);
  glowMid.addColorStop(0, "rgba(6, 182, 212, 0.14)");
  glowMid.addColorStop(1, "rgba(6, 182, 212, 0)");
  ctx.fillStyle = glowMid;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top Neon Accent Ribbon (10px height, rounded)
  const topRibbonGrad = ctx.createLinearGradient(32, 32, WIDTH - 32, 42);
  topRibbonGrad.addColorStop(0, "#4f46e5");
  topRibbonGrad.addColorStop(0.5, "#06b6d4");
  topRibbonGrad.addColorStop(1, "#10b981");
  ctx.fillStyle = topRibbonGrad;
  drawRoundedRect(ctx, 32, 32, WIDTH - 64, 10, 5);
  ctx.fill();

  // Crisp Outer Luxury Border (2.5px solid)
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, 32, 32, WIDTH - 64, HEIGHT - 64, 40);
  ctx.stroke();

  // 3. Top Platform Badge (Vibrant Gradient Capsule)
  const badgeText = "⚡ FREE STUDY MATERIAL";
  ctx.font = `800 28px ${FONT_SANS}`;
  const badgeW = Math.round(ctx.measureText(badgeText).width + 56);
  const badgeGrad = ctx.createLinearGradient(PAD, 78, PAD + badgeW, 142);
  badgeGrad.addColorStop(0, "#4f46e5");
  badgeGrad.addColorStop(0.65, "#4338ca");
  badgeGrad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 78, badgeW, 64, 32);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, PAD, 78, badgeW, 64, 32);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 28, 120);

  // Verified Status Pill (Emerald Accent Card)
  const verifiedText = "✓ 100% VERIFIED VAULT";
  ctx.font = `800 24px ${FONT_SANS}`;
  const verW = Math.round(ctx.measureText(verifiedText).width + 44);
  const verX = WIDTH - PAD - verW;
  ctx.fillStyle = "#ecfdf5";
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, verX, 80, verW, 60, 30);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#047857";
  ctx.fillText(verifiedText, verX + 22, 119);

  // 4. Branch / Course Category Tag Pill (Elevated Modern Luxury Pill)
  let curY = 176;
  const cleanSubject = String(note.subject || "Academic Notes").trim();
  const cleanCourse = String(note.course || "B.Tech").trim();
  const cleanBranch = String(note.branch || "All Branches").trim();
  const branchText = `📚 ${cleanSubject.toUpperCase()} • ${cleanCourse.toUpperCase()} • ${cleanBranch.toUpperCase()}`;

  // Auto-scale category pill font so long subjects like "MACHINE LEARNING TECHNIQUES (MLT)" never overflow
  const maxPillW = WIDTH - PAD * 2;
  let pillFontSize = 26;
  ctx.font = `800 ${pillFontSize}px ${FONT_SANS}`;
  while (pillFontSize > 19 && ctx.measureText(branchText).width + 50 > maxPillW) {
    pillFontSize -= 1;
    ctx.font = `800 ${pillFontSize}px ${FONT_SANS}`;
  }
  const catH = 54;
  const catW = Math.min(maxPillW, Math.round(ctx.measureText(branchText).width + 50));
  ctx.fillStyle = "#eef2ff";
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, PAD, curY, catW, catH, 27);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3730a3";
  ctx.fillText(branchText, PAD + 25, curY + Math.round(catH / 2 + pillFontSize * 0.34), catW - 50);

  // 5. Bold Commanding Note Title (High-Visibility Obsidian Black Typography)
  // Place baseline well below pill bottom (catH=54 + 38px breathing gap + ~54px font ascent = +146px) so capitals NEVER touch the pill!
  const pillBottom = curY + catH;
  ctx.font = `900 64px ${FONT_SANS}`;
  const rawTitleLines = wrapCanvasText(ctx, note.title || "University Lecture Notes", WIDTH - PAD * 2);
  const titleFontSize = rawTitleLines.length >= 3 ? 58 : 64;
  const titleLineHeight = titleFontSize === 58 ? 72 : 78;
  ctx.font = `900 ${titleFontSize}px ${FONT_SANS}`;
  const titleLines = wrapCanvasText(ctx, note.title || "University Lecture Notes", WIDTH - PAD * 2).slice(0, 3);

  curY = pillBottom + 36 + Math.round(titleFontSize * 0.86);
  ctx.fillStyle = "#090d16"; // Deep Obsidian Black for razor-sharp legibility
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += titleLineHeight;
  }

  // 5B. Quick Metadata Badges Row (Pages / Rating / Free)
  // Align cleanly 28px below the last title line's descender
  const badgeRowY = curY - titleLineHeight + Math.round(titleFontSize * 0.25) + 28;
  const pageCount = Number(note.pageCount || note.pagesCount || 15);
  const metaBadges = [
    { text: `📄 ${pageCount}+ Pages`, color: "#4338ca", bg: "#eef2ff", border: "#a5b4fc" },
    { text: `⭐ 4.9/5 Rating`, color: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
    { text: `🎓 Syllabus Aligned`, color: "#065f46", bg: "#ecfdf5", border: "#6ee7b7" },
    { text: `🔒 100% Free Vault`, color: "#075985", bg: "#f0f9ff", border: "#7dd3fc" },
  ];

  let metaX = PAD;
  ctx.font = `800 24px ${FONT_SANS}`;
  for (const badge of metaBadges) {
    const mW = Math.round(ctx.measureText(badge.text).width + 36);
    if (metaX + mW > WIDTH - PAD) break;

    ctx.fillStyle = badge.bg;
    ctx.strokeStyle = badge.border;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, metaX, badgeRowY, mW, 48, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = badge.color;
    ctx.fillText(badge.text, metaX + 18, badgeRowY + 32);
    metaX += mW + 14;
  }
  curY = badgeRowY + 48 + 32;

  // 6. Highlighted Feature Cards Container (Pure White Elevated Studio Card)
  const featureBoxH = 460;
  // Ambient drop shadow
  ctx.fillStyle = "rgba(15, 23, 42, 0.05)";
  drawRoundedRect(ctx, PAD + 3, curY + 3, WIDTH - PAD * 2, featureBoxH, 28);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, PAD, curY, WIDTH - PAD * 2, featureBoxH, 28);
  ctx.fill();
  ctx.stroke();

  // Section Header
  ctx.font = `900 30px ${FONT_SANS}`;
  ctx.fillStyle = "#090d16";
  ctx.fillText("✨ What's Inside This Vault Study Pack:", PAD + 32, curY + 50);

  // Features List
  const features = [
    { icon: "📖", title: "Comprehensive Semester Notes", desc: "Detailed syllabus coverage curated by university toppers & faculty", color: "#4f46e5", bg: "#eef2ff" },
    { icon: "🎯", title: "Solved Previous Year Papers (PYQs)", desc: "Step-by-step solutions with detailed diagrams & key derivations", color: "#0284c7", bg: "#f0f9ff" },
    { icon: "📴", title: "0ms Instant Offline Reader", desc: "Save 100% offline on your device — zero paywalls & zero ads", color: "#059669", bg: "#ecfdf5" },
    { icon: "⚡", title: "Interactive AI Study Assistant", desc: "Instant 3D flashcards, mind-maps & instant doubt solver", color: "#7c3aed", bg: "#f5f3ff" },
  ];

  let fY = curY + 112;
  for (const feat of features) {
    // Icon Badge (54x54)
    ctx.fillStyle = feat.bg;
    ctx.strokeStyle = feat.color;
    ctx.lineWidth = 1.8;
    drawRoundedRect(ctx, PAD + 30, fY - 32, 54, 54, 16);
    ctx.fill();
    ctx.stroke();

    ctx.font = `30px ${FONT_SANS}`;
    ctx.fillText(feat.icon, PAD + 42, fY + 6);

    // Feature Title - High contrast obsidian black!
    ctx.font = `800 30px ${FONT_SANS}`;
    ctx.fillStyle = "#090d16";
    ctx.fillText(feat.title, PAD + 104, fY - 4);

    // Feature Description - Dark Slate-800 for crystal-clear readability!
    ctx.font = `600 24px ${FONT_SANS}`;
    ctx.fillStyle = "#1e293b";
    ctx.fillText(feat.desc, PAD + 104, fY + 30);

    fY += 88;
  }

  // 7. Centerpiece Scannable QR Code Hub (Pure White + Indigo Accent Card)
  const qrBoxY = curY + featureBoxH + 34;
  const qrBoxH = 550;

  // Shadow
  ctx.fillStyle = "rgba(15, 23, 42, 0.05)";
  drawRoundedRect(ctx, PAD + 3, qrBoxY + 3, WIDTH - PAD * 2, qrBoxH, 36);
  ctx.fill();

  const qrBoxGrad = ctx.createLinearGradient(PAD, qrBoxY, WIDTH - PAD, qrBoxY + qrBoxH);
  qrBoxGrad.addColorStop(0, "#ffffff");
  qrBoxGrad.addColorStop(1, "#f8faff");
  ctx.fillStyle = qrBoxGrad;
  ctx.strokeStyle = "rgba(99, 102, 241, 0.45)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, PAD, qrBoxY, WIDTH - PAD * 2, qrBoxH, 36);
  ctx.fill();
  ctx.stroke();

  // QR Code Header
  ctx.textAlign = "center";
  ctx.font = `900 38px ${FONT_SANS}`;
  ctx.fillStyle = "#090d16";
  ctx.fillText("📸 Scan with Phone Camera to Open Note", WIDTH / 2, qrBoxY + 62);

  ctx.font = `800 26px ${FONT_SANS}`;
  ctx.fillStyle = "#4f46e5";
  ctx.fillText("⚡ Instant 0ms Reader • Zero Login Required to Read", WIDTH / 2, qrBoxY + 104);

  // Synchronous Scannable QR Code
  const qrTargetUrl = shareUrl || `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id || ""}`;
  try {
    const qr = QRCode.create(qrTargetUrl, { errorCorrectionLevel: "M" });
    const numModules = qr.modules.size;
    const qrSize = 280;
    const qrX = Math.round((WIDTH - qrSize) / 2);
    const qrY = Math.round(qrBoxY + 134);
    const cell = qrSize / numModules;

    // White QR container card
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 22);
    ctx.fill();
    ctx.stroke();

    // Draw dark modules with integer pixel coordinates!
    ctx.fillStyle = "#090d16";
    for (let r = 0; r < numModules; r++) {
      const y1 = Math.round(qrY + r * cell);
      const y2 = Math.round(qrY + (r + 1) * cell);
      for (let c = 0; c < numModules; c++) {
        if (qr.modules.get(r, c)) {
          const x1 = Math.round(qrX + c * cell);
          const x2 = Math.round(qrX + (c + 1) * cell);
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
      }
    }
  } catch (err) {
    console.warn("[CANVAS] QR draw error:", err);
  }

  // Scannable URL text Pill
  const displayHost = typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "freestudymaterial.pages.dev";
  const urlPillText = `🔗 ${displayHost}`;
  ctx.font = `800 28px ${FONT_MONO}`;
  const urlPillW = Math.round(ctx.measureText(urlPillText).width + 54);
  const urlPillX = Math.round((WIDTH - urlPillW) / 2);
  const urlPillY = Math.round(qrBoxY + 470);
  ctx.fillStyle = "#eef2ff";
  ctx.strokeStyle = "#818cf8";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, urlPillX, urlPillY, urlPillW, 52, 26);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3730a3";
  ctx.fillText(urlPillText, WIDTH / 2, urlPillY + 36);

  // 8. Footer Branding
  ctx.textAlign = "center";
  ctx.font = `800 26px ${FONT_SANS}`;
  ctx.fillStyle = "#334155";
  ctx.fillText("📚 Free Study Material • 100% Free Lifetime Campus Vault", WIDTH / 2, HEIGHT - 76);

  ctx.textAlign = "left"; // reset alignment
  return canvas;
}

export function generateWhatsAppStoryCardFile(note = {}, shareUrl = "", customFileName = "") {
  const canvas = generateWhatsAppStoryCardCanvas(note, shareUrl);
  const cleanTitle = String(note.title || "study-note")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32) || "study-note";
  const fileName = customFileName || `${cleanTitle}-whatsapp-story.png`;
  return canvasToFile(canvas, fileName);
}

/**
 * 📲 Direct Device Native Share:
 * - Direct OS share options dialog (Android, iOS, Windows, macOS)
 * - PNG image card attached when device supports file sharing
 * - Clean title, course details, and single clickable link
 * - NEVER automatically downloads files on clicking share ("download nhi")
 */
export async function shareWhatsAppStoryCard(note = {}, shareUrl = "") {
  const targetUrl =
    shareUrl ||
    `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id || ""}`;

  const cleanTitle = String(note.title || "Study Note").trim();
  const cleanSubject = note.subject && note.subject !== "General" ? String(note.subject).trim() : "";
  const cleanCourse = note.course ? String(note.course).trim() : "";
  const details = [cleanSubject, cleanCourse].filter(Boolean).join(" • ");

  const clearText = details
    ? `📚 ${cleanTitle} (${details})`
    : `📚 ${cleanTitle}`;

  // Clean text + single clickable URL (clean, no duplicate URLs, no %0A encoding)
  const shareText = `${clearText}\n${targetUrl}`;

  const safeName =
    String(cleanTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 32) || "study-note";
  const fileName = `${safeName}-whatsapp-story.png`;

  // Generate PNG image File 100% synchronously (<5ms) to preserve browser user gesture!
  let file = null;
  try {
    file = generateWhatsAppStoryCardFile(note, targetUrl, fileName);
  } catch (err) {
    console.warn("[SHARE] Synchronous image card generation failed:", err);
  }

  // 1. Native Device System Share Dialog (Runs immediately on user click gesture)
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    // A. Device/OS supports sharing image file + text together (e.g. Android Chrome, iOS Safari)
    if (file && typeof navigator.canShare === "function") {
      const shareDataWithFile = {
        title: cleanTitle,
        text: shareText,
        files: [file],
      };

      if (navigator.canShare(shareDataWithFile)) {
        try {
          await navigator.share(shareDataWithFile);
          try { await navigator.clipboard.writeText(shareText); } catch (_) {}
          return { method: "shared", fileName };
        } catch (err) {
          if (err?.name === "AbortError") {
            // User dismissed/cancelled the OS share window
            return { method: "cancelled", fileName };
          }
          console.warn("[SHARE] File share rejected, falling back to text:", err);
        }
      }
    }

    // B. Native System Share with Clean Text + Single Clickable Link
    // (Used on Windows 10/11 / macOS / desktop browsers where files cannot be shared directly)
    try {
      const shareDataText = {
        title: cleanTitle,
        text: clearText,
        url: targetUrl,
      };

      await navigator.share(shareDataText);
      try { await navigator.clipboard.writeText(shareText); } catch (_) {}
      return { method: "shared", fileName };
    } catch (err) {
      if (err?.name === "AbortError") {
        return { method: "cancelled", fileName };
      }
      console.warn("[SHARE] System text share failed:", err);
    }
  }

  // 2. Fallback for browsers without Web Share API (e.g. desktop Firefox or insecure context):
  // Copy clean text & link to clipboard, and open WhatsApp Web (NO file download!)
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
    }
  } catch (_) {}

  // Open WhatsApp Web share with clean pre-filled text
  try {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  } catch (_) {}

  return { method: "copied", fileName };
}
