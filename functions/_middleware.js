/**
 * Cloudflare Pages Edge Middleware: Smart WhatsApp / Telegram Link Preview
 * Injects dynamic Open Graph (og:title, og:description, og:image) & Twitter Card tags
 * when social/chat link-preview crawlers fetch ?note=<id>, ?noteId=<id>, or /note/<id>.
 * Normal browser traffic passes straight through with 0ms latency overhead.
 */

const BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
];

const CRAWLER_UA_REGEX = /(?:whatsapp|telegrambot|facebookexternalhit|facebot|twitterbot|discordbot|slackbot|linkedinbot|skypeuripreview|embedly|pinterest|vkshare|applebot|googlebot|bingbot|duckduckbot|preview)/i;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchPublicNoteMeta(noteId) {
  for (const origin of BACKEND_ORIGINS) {
    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${origin}/api/notes/${encodeURIComponent(noteId)}/public-meta`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(tId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.note) {
          return data.note;
        }
      }
    } catch (_) {}
  }
  return null;
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET") {
    return context.next();
  }

  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|mjs|map|png|jpg|jpeg|svg|ico|woff2?|json)$/i.test(url.pathname)
  ) {
    return context.next();
  }

  const pathMatch = url.pathname.match(/^\/note\/([^/]+)\/?$/i);
  const noteId = (url.searchParams.get("note") || url.searchParams.get("noteId") || (pathMatch && pathMatch[1]) || "").trim();
  if (!noteId) {
    return context.next();
  }

  const ua = request.headers.get("User-Agent") || "";
  const isCrawler = CRAWLER_UA_REGEX.test(ua) || url.searchParams.get("ogpreview") === "1";
  if (!isCrawler) {
    return context.next();
  }

  const noteMeta = await fetchPublicNoteMeta(noteId);
  if (!noteMeta) {
    return context.next();
  }

  const title = `${noteMeta.title} — ${noteMeta.subject || "Notes"} (${noteMeta.course || "B.Tech"})`;
  const parts = [];
  if (noteMeta.course) parts.push(noteMeta.course);
  if (noteMeta.branch) parts.push(noteMeta.branch);
  if (noteMeta.semester || noteMeta.year) parts.push(noteMeta.semester || noteMeta.year);
  if (noteMeta.college) parts.push(noteMeta.college);
  if (noteMeta.sizeLabel) parts.push(noteMeta.sizeLabel);
  const description = `${parts.join(" • ")} | Verified study notes, PYQs & flashcards — read online or download free on Free Study Material.`;
  const ogImage = `${url.origin}/api/notes/${encodeURIComponent(noteId)}/og-image.png`;

  const ogTags = `
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Free Study Material Vault" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url.toString())}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`;

  const nextResponse = await context.next();
  const cType = (nextResponse.headers.get("Content-Type") || "").toLowerCase();
  if (cType.includes("text/html")) {
    let html = await nextResponse.text();
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>${ogTags}`);
    const headers = new Headers(nextResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=120, s-maxage=600");
    return new Response(html, { status: 200, headers });
  }

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${ogTags}</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
