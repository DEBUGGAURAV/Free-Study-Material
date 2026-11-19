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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

  const cleaned = cleanMarkdownForCard(content) || "Key formulas & concepts saved for quick exam hall revision.";
  ctx.font = "500 28px Inter, system-ui, -apple-system, sans-serif";
  let bodyLines = wrapCanvasText(ctx, cleaned, BODY_W);
  if (bodyLines.length > 26) {
    bodyLines = [...bodyLines.slice(0, 25), "… Read complete notes & diagrams inside Free Study Material!"];
  }

  ctx.font = "800 44px Inter, system-ui, -apple-system, sans-serif";
  const titleLines = wrapCanvasText(ctx, String(title).slice(0, 110), WIDTH - PAD * 2).slice(0, 2);

  const lineHeight = 40;
  const headerH = 195 + titleLines.length * 52;
  const contentBoxH = Math.max(240, bodyLines.length * lineHeight + 68);
  const footerH = 190;
  const HEIGHT = Math.min(2200, headerH + contentBoxH + footerH + 40);

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // 1. Pure White Luxury Ambient Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#ffffff");
  bgGrad.addColorStop(0.3, "#f8faff");
  bgGrad.addColorStop(0.7, "#f1f5fd");
  bgGrad.addColorStop(1, "#f8fafc");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle decorative glow orbs (Soft Pastel Luxury Accents)
  const glow1 = ctx.createRadialGradient(WIDTH - 110, 120, 20, WIDTH - 110, 120, 320);
  glow1.addColorStop(0, "rgba(99, 102, 241, 0.12)");
  glow1.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer card frame border
  ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 32);
  ctx.stroke();

  // 2. Top Badge Pill
  ctx.font = "800 22px Inter, system-ui, -apple-system, sans-serif";
  const badgeW = Math.min(WIDTH - PAD * 2, ctx.measureText(badgeText).width + 44);
  const badgeGrad = ctx.createLinearGradient(PAD, 62, PAD + badgeW, 108);
  badgeGrad.addColorStop(0, "#4f46e5");
  badgeGrad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 62, badgeW, 46, 23);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 22, 92);

  // 3. Title & Subtitle
  let curY = 160;
  ctx.font = "800 44px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#0f172a";
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += 54;
  }

  ctx.font = "600 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#4f46e5";
  ctx.fillText(String(subtitle).slice(0, 72), PAD, curY + 4);
  curY += 40;

  // 4. Inner Content Panel (Pure White Elevated Box)
  const boxY = curY;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(203, 213, 225, 0.85)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, PAD, boxY, WIDTH - PAD * 2, contentBoxH, 24);
  ctx.fill();
  ctx.stroke();

  let textY = boxY + 52;
  ctx.font = "500 27px Inter, system-ui, -apple-system, sans-serif";
  for (const bLine of bodyLines) {
    if (textY > boxY + contentBoxH - 22) break;
    if (bLine === "") {
      textY += 18;
      continue;
    }
    const isBulletOrHeading = bLine.startsWith("•") || bLine.startsWith("📌") || bLine.startsWith("💡") || bLine.startsWith("⚡");
    ctx.fillStyle = isBulletOrHeading ? "#4338ca" : "#1e293b";
    ctx.fillText(bLine, PAD + 26, textY);
    textY += lineHeight;
  }

  // 5. Branded Bottom Footer + Live Scannable QR Code
  const footerY = HEIGHT - 165;
  ctx.fillStyle = "#f8faff";
  ctx.strokeStyle = "rgba(99, 102, 241, 0.28)";
  drawRoundedRect(ctx, PAD, footerY, WIDTH - PAD * 2, 118, 22);
  ctx.fill();
  ctx.stroke();

  ctx.font = "800 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(`📚 ${siteName}`, PAD + 24, footerY + 46);

  ctx.font = "500 21px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Scan QR to open full PDF notes, AI Tutor & PYQs", PAD + 24, footerY + 84);

  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 96,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    const qrImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    const qrX = WIDTH - PAD - 114;
    const qrY = footerY + 11;
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, qrX - 4, qrY - 4, 104, 104, 12);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, 96, 96);
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
 */
export function generateWhatsAppStoryCardCanvas(note = {}, shareUrl = "") {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const PAD = 80;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  // 1. Pure White Luxury Ambient Gradient (Clean, Crisp High-Contrast)
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#ffffff");
  bgGrad.addColorStop(0.3, "#f8faff");
  bgGrad.addColorStop(0.7, "#f1f5fd");
  bgGrad.addColorStop(1, "#f8fafc");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Subtle Luxury Aurora Ambient Glow Orbs
  const glowTop = ctx.createRadialGradient(WIDTH * 0.82, 220, 20, WIDTH * 0.82, 220, 480);
  glowTop.addColorStop(0, "rgba(99, 102, 241, 0.12)");
  glowTop.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowMid = ctx.createRadialGradient(WIDTH * 0.18, HEIGHT * 0.52, 30, WIDTH * 0.18, HEIGHT * 0.52, 500);
  glowMid.addColorStop(0, "rgba(6, 182, 212, 0.10)");
  glowMid.addColorStop(1, "rgba(6, 182, 212, 0)");
  ctx.fillStyle = glowMid;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowBot = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.86, 40, WIDTH * 0.5, HEIGHT * 0.86, 460);
  glowBot.addColorStop(0, "rgba(16, 185, 129, 0.09)");
  glowBot.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = glowBot;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top Neon Accent Ribbon
  const topRibbonGrad = ctx.createLinearGradient(36, 36, WIDTH - 36, 44);
  topRibbonGrad.addColorStop(0, "#4f46e5");
  topRibbonGrad.addColorStop(0.5, "#06b6d4");
  topRibbonGrad.addColorStop(1, "#10b981");
  ctx.fillStyle = topRibbonGrad;
  drawRoundedRect(ctx, 36, 36, WIDTH - 72, 8, 4);
  ctx.fill();

  // Outer Luxury Frame
  ctx.strokeStyle = "rgba(99, 102, 241, 0.22)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 36, 36, WIDTH - 72, HEIGHT - 72, 44);
  ctx.stroke();

  // 3. Top Platform Badge (Vibrant Gradient Pill)
  const badgeText = "⚡ FREE STUDY MATERIAL VAULT";
  ctx.font = "800 24px Inter, system-ui, -apple-system, sans-serif";
  const badgeW = ctx.measureText(badgeText).width + 56;
  const badgeGrad = ctx.createLinearGradient(PAD, 90, PAD + badgeW, 146);
  badgeGrad.addColorStop(0, "#4f46e5");
  badgeGrad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 90, badgeW, 56, 28);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 28, 127);

  // Verified Status Pill (Emerald Accent Card)
  const verifiedText = "✓ VERIFIED ACADEMIC RESOURCE";
  ctx.font = "800 20px Inter, system-ui, -apple-system, sans-serif";
  const verW = ctx.measureText(verifiedText).width + 36;
  const verX = WIDTH - PAD - verW;
  ctx.fillStyle = "#ecfdf5";
  ctx.strokeStyle = "#a7f3d0";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, verX, 94, verW, 48, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#059669";
  ctx.fillText(verifiedText, verX + 18, 126);

  // 4. Branch / Course Subheader (Indigo Pill Badge)
  let curY = 220;
  const branchText = `${note.branch || "All Branches"} • ${note.course || "B.Tech"} • ${note.subject || "Academic Resource"}`;
  ctx.font = "800 26px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#4f46e5";
  ctx.fillText(branchText.toUpperCase(), PAD, curY);

  // 5. Huge Bold Note Title (Deep Dark Slate with Inter Font)
  curY += 60;
  ctx.font = "900 58px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#0f172a";
  const titleLines = wrapCanvasText(ctx, note.title || "University Lecture Notes", WIDTH - PAD * 2).slice(0, 3);
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += 74;
  }

  // 6. Highlighted Feature Cards Container (Pure White Elevated Card)
  curY += 24;
  const featureBoxH = 430;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(226, 232, 240, 0.95)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, PAD, curY, WIDTH - PAD * 2, featureBoxH, 28);
  ctx.fill();
  ctx.stroke();

  // Features List inside container
  const features = [
    { icon: "📖", title: "Comprehensive Semester Notes", desc: "Curated by top university students & professors" },
    { icon: "🎯", title: "Solved Previous Year Papers (PYQs)", desc: "Step-by-step solutions for maximum exam marks" },
    { icon: "📴", title: "0ms Instant Online Reader", desc: "Save 100% offline on your device — zero paywalls" },
    { icon: "✨", title: "Interactive AI Study Assistant", desc: "Instant 3D flashcards, mind-maps & doubt solver" },
  ];

  let fY = curY + 62;
  for (const feat of features) {
    // Feature icon badge circle
    ctx.fillStyle = "#f8faff";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, PAD + 24, fY - 32, 48, 48, 12);
    ctx.fill();
    ctx.stroke();

    ctx.font = "28px Inter, sans-serif";
    ctx.fillText(feat.icon, PAD + 32, fY + 2);

    ctx.font = "800 28px Inter, system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(feat.title, PAD + 88, fY - 4);

    ctx.font = "500 22px Inter, system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(feat.desc, PAD + 88, fY + 28);

    fY += 94;
  }

  // 7. Centerpiece Scannable QR Code Hub (Pure White + Indigo Accent Card)
  const qrBoxY = curY + featureBoxH + 48;
  const qrBoxH = 550;
  const qrBoxGrad = ctx.createLinearGradient(PAD, qrBoxY, WIDTH - PAD, qrBoxY + qrBoxH);
  qrBoxGrad.addColorStop(0, "#ffffff");
  qrBoxGrad.addColorStop(1, "#f5f7ff");
  ctx.fillStyle = qrBoxGrad;
  ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, PAD, qrBoxY, WIDTH - PAD * 2, qrBoxH, 36);
  ctx.fill();
  ctx.stroke();

  // QR Code Header
  ctx.font = "900 34px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.fillText("📸 Scan with Phone Camera to Open Note", WIDTH / 2, qrBoxY + 68);

  ctx.font = "700 23px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#4f46e5";
  ctx.fillText("Instant 0ms Reader • Zero Login Required to Read", WIDTH / 2, qrBoxY + 108);

  // Synchronous Scannable QR Code
  const qrTargetUrl = shareUrl || `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id || ""}`;
  try {
    const qr = QRCode.create(qrTargetUrl, { errorCorrectionLevel: "M" });
    const numModules = qr.modules.size;
    const qrSize = 270;
    const qrX = (WIDTH - qrSize) / 2;
    const qrY = qrBoxY + 144;
    const cell = qrSize / numModules;

    // Draw clean white background with rounded corners & border
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 22);
    ctx.fill();
    ctx.stroke();

    // Draw dark modules
    ctx.fillStyle = "#0f172a";
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

  // Scannable URL text
  const displayHost = typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "freestudymaterial.pages.dev";
  ctx.textAlign = "center";
  ctx.font = "800 24px 'JetBrains Mono', Consolas, monospace";
  ctx.fillStyle = "#4338ca";
  ctx.fillText(displayHost, WIDTH / 2, qrBoxY + 494);

  // 8. Footer Branding
  ctx.font = "600 21px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Shared from Free Study Material Cloud • 100% Free Lifetime Academic Vault", WIDTH / 2, HEIGHT - 80);

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
