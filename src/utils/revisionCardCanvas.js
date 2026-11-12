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
