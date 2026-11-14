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

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#0b1120");
  bgGrad.addColorStop(0.55, "#111c33");
  bgGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle decorative glow orbs
  const glow1 = ctx.createRadialGradient(WIDTH - 110, 120, 20, WIDTH - 110, 120, 320);
  glow1.addColorStop(0, "rgba(56, 189, 248, 0.22)");
  glow1.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer card frame border
  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 32);
  ctx.stroke();

  // 2. Top Badge Pill
  ctx.font = "800 22px Inter, system-ui, -apple-system, sans-serif";
  const badgeW = Math.min(WIDTH - PAD * 2, ctx.measureText(badgeText).width + 44);
  const badgeGrad = ctx.createLinearGradient(PAD, 62, PAD + badgeW, 108);
  badgeGrad.addColorStop(0, "#0284c7");
  badgeGrad.addColorStop(1, "#6366f1");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 62, badgeW, 46, 23);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 22, 92);

  // 3. Title & Subtitle
  let curY = 160;
  ctx.font = "800 44px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#f8fafc";
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += 54;
  }

  ctx.font = "600 24px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(String(subtitle).slice(0, 72), PAD, curY + 4);
  curY += 40;

  // 4. Inner Content Panel
  const boxY = curY;
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
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
    ctx.fillStyle = isBulletOrHeading ? "#e0f2fe" : "#cbd5e1";
    ctx.fillText(bLine, PAD + 26, textY);
    textY += lineHeight;
  }

  // 5. Branded Bottom Footer + Live Scannable QR Code
  const footerY = HEIGHT - 165;
  ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
  drawRoundedRect(ctx, PAD, footerY, WIDTH - PAD * 2, 118, 22);
  ctx.fill();
  ctx.stroke();

  ctx.font = "800 28px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(`📚 ${siteName}`, PAD + 24, footerY + 46);

  ctx.font = "500 21px Inter, system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
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
 * 📲 1-Tap WhatsApp Status & Story Card Generator (1080x1920 9:16 Vertical HD)
 * Generates an aesthetic, viral academic poster with scannable QR Code and share trigger.
 */
export async function generateWhatsAppStoryCardBlob(note = {}, shareUrl = "") {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const PAD = 80;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");

  // 1. Deep Space Obsidian Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, "#030712");
  bgGrad.addColorStop(0.3, "#0b1329");
  bgGrad.addColorStop(0.7, "#0f172a");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. High-Tech Aurora Ambient Glow Orbs
  const glowTop = ctx.createRadialGradient(WIDTH * 0.8, 240, 20, WIDTH * 0.8, 240, 480);
  glowTop.addColorStop(0, "rgba(56, 189, 248, 0.28)");
  glowTop.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowMid = ctx.createRadialGradient(WIDTH * 0.2, HEIGHT * 0.55, 30, WIDTH * 0.2, HEIGHT * 0.55, 520);
  glowMid.addColorStop(0, "rgba(139, 92, 246, 0.24)");
  glowMid.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glowMid;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowBot = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.85, 40, WIDTH * 0.5, HEIGHT * 0.85, 450);
  glowBot.addColorStop(0, "rgba(16, 185, 129, 0.2)");
  glowBot.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = glowBot;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer Neon Frame
  ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 36, 36, WIDTH - 72, HEIGHT - 72, 44);
  ctx.stroke();

  // 3. Top Platform Badge
  const badgeText = "⚡ FREE STUDY MATERIAL VAULT";
  ctx.font = "800 24px Inter, system-ui, sans-serif";
  const badgeW = ctx.measureText(badgeText).width + 56;
  const badgeGrad = ctx.createLinearGradient(PAD, 90, PAD + badgeW, 146);
  badgeGrad.addColorStop(0, "#0284c7");
  badgeGrad.addColorStop(1, "#6366f1");
  ctx.fillStyle = badgeGrad;
  drawRoundedRect(ctx, PAD, 90, badgeW, 56, 28);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(badgeText, PAD + 28, 127);

  // Verified Status Pill
  ctx.font = "700 22px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#34d399";
  ctx.fillText("✓ VERIFIED ACADEMIC RESOURCE", WIDTH - PAD - 380, 127);

  // 4. Branch / Course Subheader
  let curY = 220;
  const branchText = `${note.branch || "All Branches"} • ${note.course || "B.Tech"} • ${note.subject || "Academic Resource"}`;
  ctx.font = "700 26px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(branchText.toUpperCase(), PAD, curY);

  // 5. Huge Bold Note Title
  curY += 60;
  ctx.font = "900 56px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#f8fafc";
  const titleLines = wrapCanvasText(ctx, note.title || "University Lecture Notes", WIDTH - PAD * 2).slice(0, 3);
  for (const tLine of titleLines) {
    ctx.fillText(tLine, PAD, curY);
    curY += 72;
  }

  // 6. Highlighted Feature Cards Container
  curY += 24;
  const featureBoxH = 430;
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
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
    ctx.font = "32px Inter, sans-serif";
    ctx.fillText(feat.icon, PAD + 32, fY);

    ctx.font = "800 28px Inter, sans-serif";
    ctx.fillStyle = "#f1f5f9";
    ctx.fillText(feat.title, PAD + 84, fY - 4);

    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(feat.desc, PAD + 84, fY + 28);

    fY += 94;
  }

  // 7. Centerpiece Scannable QR Code Hub
  const qrBoxY = curY + featureBoxH + 48;
  const qrBoxH = 550;
  ctx.fillStyle = "linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))";
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
  ctx.lineWidth = 2.5;
  drawRoundedRect(ctx, PAD, qrBoxY, WIDTH - PAD * 2, qrBoxH, 36);
  ctx.fill();
  ctx.stroke();

  // QR Code Header
  ctx.font = "800 34px Inter, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("📸 Scan with Phone Camera to Open Note", WIDTH / 2, qrBoxY + 68);

  ctx.font = "500 23px Inter, sans-serif";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("Instant 0ms Reader • Zero Login Required to Read", WIDTH / 2, qrBoxY + 108);

  // Scannable QR Code
  const qrTargetUrl = shareUrl || `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id || ""}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrTargetUrl, {
      width: 270,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    const qrImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qrDataUrl;
    });

    const qrSize = 270;
    const qrX = (WIDTH - qrSize) / 2;
    const qrY = qrBoxY + 144;

    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 22);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch (_) {}

  // Scannable URL text
  ctx.font = "700 24px 'JetBrains Mono', Consolas, monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("freestudymaterial.pages.dev", WIDTH / 2, qrBoxY + 494);

  // 8. Footer Branding
  ctx.font = "600 21px Inter, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Shared from Free Study Material Cloud • 100% Free Lifetime Academic Vault", WIDTH / 2, HEIGHT - 80);

  ctx.textAlign = "left"; // reset alignment

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Story canvas generation failed"));
    }, "image/png");
  });
}

/**
 * 📲 Share or Download 9:16 WhatsApp Status / Story Card
 */
export async function shareWhatsAppStoryCard(note = {}, shareUrl = "") {
  const targetUrl = shareUrl || `${typeof window !== "undefined" ? window.location.origin : "https://freestudymaterial.pages.dev"}/?note=${note.id || ""}`;
  const blob = await generateWhatsAppStoryCardBlob(note, targetUrl);
  const safeName = String(note.title || "study-note")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32) || "study-note";
  const fileName = `${safeName}-whatsapp-story.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  const shareText = `📚 *${note.title || "Study Note"}*\nSubject: ${note.subject || "Engineering"}\nRead Online & Download 100% Free: ${targetUrl}`;

  // Try Native Share on mobile
  if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${note.title || "Study Note"} — Free Study Material`,
        text: shareText,
        files: [file],
      });
      return { method: "shared", fileName };
    } catch (err) {
      if (err?.name === "AbortError") return { method: "cancelled", fileName };
    }
  }

  // Fallback / Desktop: Download PNG image + Copy Link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  try {
    await navigator.clipboard.writeText(shareText);
  } catch (_) {}

  return { method: "downloaded", fileName };
}
