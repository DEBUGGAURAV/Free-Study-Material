/**
 * Cloudflare Pages Edge Middleware: Google SEO + WhatsApp / Telegram Dynamic Metadata & JSON-LD Injector
 * - Fixes per-route <link rel="canonical">, <meta name="description">, <title>, Open Graph, Twitter Card & Schema.org JSON-LD
 *   across /note/:id, /branch/:branch, and /notices so Google indexes EVERY note and branch page instead of deduplicating into /notes.
 * - Normal browser requests on /branch/* and /notices pay 0ms backend latency; /note/:id metadata fetch runs for crawlers while
 *   still rewriting canonical URL for all requests.
 */

const BACKEND_ORIGINS = [
  "https://freestudymaterial1.onrender.com",
  "https://freestudymaterial2.onrender.com",
  "https://freestudymaterial.onrender.com",
];

const CRAWLER_UA_REGEX = /(?:whatsapp|telegrambot|facebookexternalhit|facebot|twitterbot|discordbot|slackbot|linkedinbot|skypeuripreview|embedly|pinterest|vkshare|applebot|googlebot|google-inspectiontool|bingbot|duckduckbot|yandexbot|baiduspider|preview)/i;

const BRANCH_LABELS = {
  CSE: "Computer Science & Engineering (CSE)",
  IT: "Information Technology (IT)",
  ECE: "Electronics & Communication Engineering (ECE)",
  EE: "Electrical Engineering (EE)",
  ME: "Mechanical Engineering (ME)",
  CE: "Civil Engineering (CE)",
  CIVIL: "Civil Engineering",
  AI: "Artificial Intelligence & Data Science (AI & DS)",
  AIML: "Artificial Intelligence & Machine Learning (AI & ML)",
  DS: "Data Science",
  BCA: "Bachelor of Computer Applications (BCA)",
  MCA: "Master of Computer Applications (MCA)",
  DIPLOMA: "Engineering Diploma",
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function injectSeoHead(html, { title, description, canonicalUrl, ogType = "website", ogImage, jsonLd, noscriptHtml = "" }) {
  // Remove existing duplicate SEO/OG/Twitter/Canonical tags before injecting authoritative per-route tags
  let out = html
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "");

  const seoBlock = `
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:site_name" content="Free Study Material" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />${
      jsonLd ? `\n    <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>` : ""
    }`;

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>${seoBlock}`);
  if (noscriptHtml && out.includes("</body>")) {
    out = out.replace("</body>", `<noscript>${noscriptHtml}</noscript></body>`);
  }
  return out;
}

async function fetchPublicNoteMeta(noteId) {
  const fetchOne = async (origin) => {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`${origin}/api/notes/${encodeURIComponent(noteId)}/public-meta`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success && data.note) return data.note;
      throw new Error("Empty note meta");
    } finally {
      clearTimeout(tId);
    }
  };
  try {
    return await Promise.any(BACKEND_ORIGINS.map((origin) => fetchOne(origin)));
  } catch (_) {
    return null;
  }
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return context.next();
  }

  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/tesseract/") ||
    /\.(js|css|mjs|map|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|json|xml|txt|wasm|gz|html)$/i.test(url.pathname)
  ) {
    return context.next();
  }

  const notePathMatch = url.pathname.match(/^\/note\/([^/]+)\/?$/i);
  const branchPathMatch = url.pathname.match(/^\/branch\/([^/]+)\/?$/i);
  const isNoticesPath = /^\/notices\/?$/i.test(url.pathname);
  const noteId = (url.searchParams.get("note") || url.searchParams.get("noteId") || (notePathMatch && decodeURIComponent(notePathMatch[1])) || "").trim();

  if (!noteId && !branchPathMatch && !isNoticesPath) {
    return context.next();
  }

  const defaultOgImage = `${url.origin}/icon-512.png`;

  // 1. /branch/:branch — 0ms Edge SEO injection (works for Googlebot + all browsers)
  if (branchPathMatch && !noteId) {
    const rawBranch = decodeURIComponent(branchPathMatch[1]).trim();
    const upperBranch = rawBranch.toUpperCase();
    const branchLabel = BRANCH_LABELS[upperBranch] || rawBranch;
    const canonicalUrl = `${url.origin}/branch/${encodeURIComponent(rawBranch)}`;
    const title = `${upperBranch} Handwritten Notes & PYQs PDF — Free Study Material`;
    const description = `Download free ${branchLabel} handwritten lecture notes, previous year question papers (PYQs), unit-wise PDFs, lab manuals, and AI flashcards on Free Study Material.`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "name": `${branchLabel} Study Notes & PYQs`,
          "description": description,
          "url": canonicalUrl,
          "isPartOf": { "@type": "WebSite", "name": "Free Study Material", "url": `${url.origin}/` },
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${url.origin}/` },
            { "@type": "ListItem", "position": 2, "name": "Notes Vault", "item": `${url.origin}/notes` },
            { "@type": "ListItem", "position": 3, "name": upperBranch, "item": canonicalUrl },
          ],
        },
      ],
    };

    const nextResponse = await context.next();
    const cType = (nextResponse.headers.get("Content-Type") || "").toLowerCase();
    if (!cType.includes("text/html")) return nextResponse;

    const html = injectSeoHead(await nextResponse.text(), {
      title,
      description,
      canonicalUrl,
      ogType: "website",
      ogImage: defaultOgImage,
      jsonLd,
      noscriptHtml: `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(url.origin)}/notes">Browse all branches &amp; subjects</a></p></main>`,
    });
    const headers = new Headers(nextResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
  }

  // 2. /notices — 0ms Edge SEO injection
  if (isNoticesPath && !noteId) {
    const canonicalUrl = `${url.origin}/notices`;
    const title = "Campus Notices, Exam Updates & Announcements — Free Study Material";
    const description = "Latest university exam timetables, AKTU/B.Tech circular alerts, syllabus updates, and student announcements on Free Study Material.";
    const nextResponse = await context.next();
    const cType = (nextResponse.headers.get("Content-Type") || "").toLowerCase();
    if (!cType.includes("text/html")) return nextResponse;

    const html = injectSeoHead(await nextResponse.text(), {
      title,
      description,
      canonicalUrl,
      ogType: "website",
      ogImage: defaultOgImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${url.origin}/` },
          { "@type": "ListItem", "position": 2, "name": "Campus Notices", "item": canonicalUrl },
        ],
      },
    });
    const headers = new Headers(nextResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
  }

  // 3. /note/:id or /?note=:id — Dynamic per-note Canonical, Meta, OG & LearningResource Schema
  const canonicalUrl = `${url.origin}/note/${encodeURIComponent(noteId)}`;
  const ua = request.headers.get("User-Agent") || "";
  const isCrawler = CRAWLER_UA_REGEX.test(ua) || url.searchParams.get("ogpreview") === "1";

  const nextResponse = await context.next();
  const cType = (nextResponse.headers.get("Content-Type") || "").toLowerCase();
  if (!cType.includes("text/html")) return nextResponse;

  // For normal interactive browsers: 0ms overhead, just fix canonical URL so client-side SEO tools see exact note canonical
  if (!isCrawler) {
    const rawHtml = await nextResponse.text();
    const fixedHtml = rawHtml.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    );
    const headers = new Headers(nextResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : fixedHtml, { status: 200, headers });
  }

  const noteMeta = await fetchPublicNoteMeta(noteId);
  if (!noteMeta) {
    const rawHtml = await nextResponse.text();
    const fixedHtml = rawHtml.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    );
    const headers = new Headers(nextResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : fixedHtml, { status: 200, headers });
  }

  const title = `${noteMeta.title} — ${noteMeta.subject || "Study Notes"} (${noteMeta.branch || noteMeta.course || "B.Tech"}) | Free Study Material`;
  const parts = [];
  if (noteMeta.subject) parts.push(noteMeta.subject);
  if (noteMeta.course) parts.push(noteMeta.course);
  if (noteMeta.branch) parts.push(noteMeta.branch);
  if (noteMeta.semester || noteMeta.year) parts.push(noteMeta.semester || noteMeta.year);
  if (noteMeta.college) parts.push(noteMeta.college);
  if (noteMeta.sizeLabel) parts.push(noteMeta.sizeLabel);
  const description = `${parts.join(" • ")} | Verified handwritten notes, PYQs & AI flashcards — read online or download free PDF on Free Study Material.`;
  const ogImage = `${url.origin}/api/notes/${encodeURIComponent(noteId)}/og-image.png`;

  const breadcrumbItems = [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": `${url.origin}/` },
    { "@type": "ListItem", "position": 2, "name": "Notes Vault", "item": `${url.origin}/notes` },
  ];
  if (noteMeta.branch) {
    breadcrumbItems.push({
      "@type": "ListItem",
      "position": 3,
      "name": noteMeta.branch,
      "item": `${url.origin}/branch/${encodeURIComponent(noteMeta.branch)}`,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    "position": breadcrumbItems.length + 1,
    "name": noteMeta.title,
    "item": canonicalUrl,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource",
        "name": noteMeta.title,
        "description": description,
        "url": canonicalUrl,
        "image": ogImage,
        "isAccessibleForFree": true,
        "learningResourceType": "Lecture Notes",
        "educationalLevel": noteMeta.course || "B.Tech",
        "about": noteMeta.subject || noteMeta.branch || "Engineering",
        "encodingFormat": "application/pdf",
        "inLanguage": "en",
        "provider": {
          "@type": "EducationalOrganization",
          "name": "Free Study Material",
          "url": `${url.origin}/`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbItems,
      },
    ],
  };

  const noscriptHtml = `<main><h1>${escapeHtml(noteMeta.title)}</h1><p>${escapeHtml(description)}</p><p>Subject: ${escapeHtml(noteMeta.subject || "Academic Notes")} | Branch: ${escapeHtml(noteMeta.branch || "Engineering")} | Course: ${escapeHtml(noteMeta.course || "B.Tech")}</p></main>`;

  const html = injectSeoHead(await nextResponse.text(), {
    title,
    description,
    canonicalUrl,
    ogType: "article",
    ogImage,
    jsonLd,
    noscriptHtml,
  });

  const headers = new Headers(nextResponse.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=120, s-maxage=600");
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
}
