const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../firebase");
const { ramCache, invalidateAllCache } = require("../utils/ramCache");
const { downloadLimiter } = require("../middleware/rateLimit");
const { streamDocumentFromChannel } = require("../telegram/mtproto");
const { authenticateToken, requireAdmin, JWT_SECRET } = require("../middleware/auth");
const { sendTelegramAuthNotice } = require("../services/emailService");
const { telegramCircuitBreaker } = require("../utils/circuitBreaker");

let getCdnRetentionSeconds = null;
try {
  getCdnRetentionSeconds = require("./admin").getCdnRetentionSeconds;
} catch {}

/**
 * GET /api/notes/branches
 * Returns all dynamically existing branches (including custom user-created branches)
 */
router.get("/branches", async (req, res) => {
  try {
    const cachedBranches = ramCache.get("branches_list");
    if (cachedBranches) {
      return res.json({ success: true, branches: cachedBranches });
    }

    const defaultBranches = ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"];
    if (!db) {
      return res.json({ success: true, branches: defaultBranches });
    }

    const snap = await db.collection("notes").select("branch").get();
    const branchSet = new Set(defaultBranches);

    snap.forEach((doc) => {
      const b = doc.data()?.branch;
      if (b && b.trim()) branchSet.add(b.trim());
    });

    const branchList = Array.from(branchSet);
    ramCache.set("branches_list", branchList, 120);

    return res.json({ success: true, branches: branchList });
  } catch (err) {
    return res.json({ success: true, branches: ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"] });
  }
});

/**
 * GET /api/notes/subjects
 * Returns all dynamically existing subjects from:
 * 1. Telegram Supergroup Forum Topics (subject_forum_topics)
 * 2. Uploaded notes in database
 * 3. Curated default university subjects
 */
router.get("/subjects", async (req, res) => {
  const defaultSubjects = [
    "Operating Systems",
    "Data Structures & Algorithms",
    "Database Management Systems",
    "Computer Networks",
    "Web Design & Development",
    "Machine Learning",
    "Artificial Intelligence",
    "Software Engineering",
    "Theory of Computation",
    "Compiler Design",
    "Computer Organization & Architecture",
    "Object Oriented Programming (OOP)",
    "Cyber Security & Cryptography",
    "Cloud Computing",
    "Discrete Mathematics",
    "Digital Electronics",
    "Computer Graphics",
  ];

  try {
    const cachedSubjects = ramCache.get("subjects_list");
    if (cachedSubjects) {
      return res.json({ success: true, subjects: cachedSubjects });
    }

    const subjectSet = new Set(defaultSubjects);

    if (db) {
      // 1. Fetch from Telegram Supergroup Forum Topics
      try {
        const topicsSnap = await db.collection("subject_forum_topics").get();
        topicsSnap.forEach((doc) => {
          const s = doc.data()?.subject;
          if (s && s.trim()) subjectSet.add(s.trim());
        });
      } catch (_) {}

      // 2. Fetch from existing notes in database
      try {
        const snap = await db.collection("notes").select("subject").limit(300).get();
        snap.forEach((doc) => {
          const s = doc.data()?.subject;
          if (s && s.trim()) subjectSet.add(s.trim());
        });
      } catch (_) {}
    }

    const subjectList = Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
    ramCache.set("subjects_list", subjectList, 30); // 30s cache for fast live updates

    return res.json({ success: true, subjects: subjectList });
  } catch (err) {
    return res.json({ success: true, subjects: defaultSubjects });
  }
});

/**
 * GET /api/notes/sync-status
 * Real-time 30-Minute Auto-Sync Status & Exact IST Timestamp (Public Endpoint)
 */
router.get("/sync-status", (req, res) => {
  try {
    const syncState = getLastSyncState();
    return res.json({
      success: true,
      lastSync: syncState,
    });
  } catch (err) {
    return res.json({
      success: true,
      lastSync: {
        formattedTime: "Just now",
        trigger: "30-Minute Quota-Saver Auto-Sync",
        mode: "30-Minute Quota-Saver & Event-Driven",
      },
    });
  }
});

/**
 * GET /api/notes
 * Fetches list of notes with in-memory RAM caching for 1ms response
 * Supports limit parameter (e.g. 15 by default, or all=true)
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Platform access restricted: Only registered students can access Free Study Material Vault.",
        notes: [],
        totalCount: 0,
      });
    }

    const { branch, course, year, semester, subject, search, limit, all } = req.query;
    const adminEmail = (process.env.ADMIN_EMAIL || "jnplotus@gmail.com").toLowerCase().trim();
    const isAdmin = req.user?.role === "admin" || (req.user?.email && req.user.email.toLowerCase().trim() === adminEmail);

    const cacheKey = `notes_${branch || "all"}_${course || "all"}_${year || "all"}_${semester || "all"}_${subject || "all"}_${search || "none"}_${limit || "all"}_${isAdmin ? "admin" : "public"}`;
    const cachedData = ramCache.get(cacheKey);

    if (cachedData) {
      res.setHeader("X-Cache", "HIT");
      return res.json({ success: true, notes: cachedData.notes, totalCount: cachedData.totalCount, lastSync: getLastSyncState() });
    }

    if (!db) {
      return res.json({ success: true, notes: [], totalCount: 0, lastSync: getLastSyncState() });
    }

    // High-Performance In-Memory RAM Cache: Avoids hitting Firestore repeatedly
    let rawNotes = ramCache.get("all_raw_notes");
    if (!rawNotes) {
      const snapshot = await db.collection("notes").get();
      rawNotes = [];

      const getNoteTimestamp = (val) => {
        if (!val) return 0;
        if (typeof val === "number") return val;
        if (typeof val.toDate === "function") return val.toDate().getTime();
        if (val._seconds !== undefined) return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);
        if (val.seconds !== undefined) return val.seconds * 1000;
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };

      snapshot.forEach((doc) => {
        const data = doc.data();
        const createdMs = getNoteTimestamp(data.createdAt);
        const updatedMs = getNoteTimestamp(data.updatedAt);
        const effectiveMs = Math.max(createdMs, updatedMs);
        const createdAtIso = createdMs > 0 ? new Date(createdMs).toISOString() : new Date().toISOString();

        rawNotes.push({
          id: doc.id,
          ...data,
          createdAt: createdAtIso,
          _sortTimestamp: effectiveMs,
        });
      });

      // Cache in Node.js RAM for 180 seconds (3 minutes)
      ramCache.set("all_raw_notes", rawNotes, 180);
    }

    let notes = [...rawNotes];

    // Only exclude notes that an admin has explicitly marked hidden (isVisible: false)
    if (!isAdmin) {
      notes = notes.filter((n) => n.isVisible !== false);
    }

    // Flexible Filter by Branch
    if (branch && branch !== "All") {
      notes = notes.filter((n) => (n.branch || "").toLowerCase() === branch.toLowerCase());
    }

    // Flexible Filter by Course / Degree (e.g. B.Tech, BCA, MCA, Diploma, etc.)
    if (course && course !== "All" && course !== "All Courses") {
      notes = notes.filter((n) => (n.course || "").toLowerCase() === course.toLowerCase());
    }

    // Flexible Filter by Year (e.g. 1st Year, 2nd Year, 3rd Year, 4th Year)
    if (year && year !== "All" && year !== "All Years") {
      notes = notes.filter((n) => 
        (n.year || "").toLowerCase() === year.toLowerCase() ||
        (n.semester || "").toLowerCase().includes(year.toLowerCase())
      );
    }

    // Backward-compatible Semester filter if still passed
    if (semester && semester !== "All") {
      notes = notes.filter((n) => 
        (n.semester || "").toLowerCase() === semester.toLowerCase() ||
        (n.year || "").toLowerCase() === semester.toLowerCase()
      );
    }

    if (subject && subject !== "All") {
      notes = notes.filter((n) => (n.subject || "").toLowerCase().includes(subject.toLowerCase()));
    }

    // Universal Search: Matches Title, Subject, Description, Branch, Course, Year, and Tesseract OCR Handwritten Notes!
    if (search && search.trim() !== "") {
      const q = search.toLowerCase();
      notes = notes.filter((n) => {
        const titleMatch = (n.title || "").toLowerCase().includes(q);
        const subjMatch = (n.subject || "").toLowerCase().includes(q);
        const descMatch = (n.description || "").toLowerCase().includes(q);
        const branchMatch = (n.branch || "").toLowerCase().includes(q);
        const courseMatch = (n.course || "").toLowerCase().includes(q);
        const yearMatch = (n.year || "").toLowerCase().includes(q);
        const tagMatch = (n.tags || []).some((t) => t.toLowerCase().includes(q));
        const ocrMatch = (n.ocrText || "").toLowerCase().includes(q);

        if (ocrMatch && !titleMatch && !subjMatch) {
          n.foundViaOcr = true; // Mark as found inside handwritten notes
        }

        return titleMatch || subjMatch || descMatch || branchMatch || courseMatch || yearMatch || tagMatch || ocrMatch;
      });
    }

    // ⚡ STRICT LATEST-FIRST SORT: Highest timestamp always at index 0 (#1 position)
    notes.sort((a, b) => (b._sortTimestamp || 0) - (a._sortTimestamp || 0));

    if (notes.length > 0) {
      notes[0].isLatest = true;
    }

    const totalCount = notes.length;

    // Apply limit if specified (e.g. initial 15 notes)
    if (limit && !all) {
      const numLimit = parseInt(limit, 10);
      if (!isNaN(numLimit) && numLimit > 0) {
        notes = notes.slice(0, numLimit);
      }
    }

    // Cache in RAM for 45 seconds
    ramCache.set(cacheKey, { notes, totalCount }, 45);

    res.setHeader("X-Cache", "MISS");
    return res.json({ success: true, notes, totalCount, lastSync: getLastSyncState() });
  } catch (err) {
    console.error("[NOTES] Query error:", err);
    return res.status(500).json({ success: false, message: "Error fetching notes: " + (err.message || String(err)) });
  }
});

/**
 * GET /api/notes/:id
 * Single note details
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Please sign in or register to access note details." });
    }

    const { id } = req.params;
    if (!db) return res.status(404).json({ success: false, message: "Database not connected" });

    const doc = await db.collection("notes").doc(id).get();
    if (!doc.exists) {
      console.warn(`[NOTES] Requested note ID not found in live collection: "${id}"`);
      const [delNote, delRec] = await Promise.all([
        db.collection("deleted_notes").doc(id).get().catch(() => ({ exists: false })),
        db.collection("deleted_records").doc(`notes_${id}`).get().catch(() => ({ exists: false })),
      ]);
      if (delNote.exists || delRec.exists) {
        const archivedData = delNote.exists ? delNote.data() : delRec.data();
        return res.status(404).json({
          success: false,
          message: `Note "${archivedData.title || id}" has been safely moved to the Restore Vault. An administrator can restore it from Admin Studio.`,
          inRecycleBin: true,
        });
      }
      return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
    }

    return res.json({ success: true, note: { id: doc.id, ...doc.data() } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/notes/:id
 * Admin / Manager edits note metadata (title, subject, branch, semester, description)
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subject, branch, course, year, semester, description, tags, isVisible } = req.body;

    if (!db) return res.status(503).json({ success: false, message: "DB unavailable" });

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (title !== undefined) updateData.title = title.trim();
    if (subject !== undefined) updateData.subject = subject.trim();
    if (branch !== undefined) updateData.branch = branch.trim();
    if (course !== undefined) updateData.course = course.trim();
    if (year !== undefined) updateData.year = year.trim();
    if (semester !== undefined) {
      updateData.semester = semester.trim();
      if (!updateData.year) updateData.year = semester.trim();
    }
    if (description !== undefined) updateData.description = description.trim();
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
    if (isVisible !== undefined) updateData.isVisible = Boolean(isVisible);

    await db.collection("notes").doc(id).update(updateData);
    invalidateAllCache();

    return res.json({ success: true, message: "Note updated successfully in vault!" });
  } catch (err) {
    console.error("[NOTES] Update error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

function renderRestrictedAccessHtml(noteTitle = "Academic Study Note") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restricted Access • Free Study Material Vault</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #080c16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
    }
    .glow {
      position: absolute;
      width: 450px;
      height: 450px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, transparent 70%);
      filter: blur(80px);
      pointer-events: none;
    }
    .card {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 20px;
      padding: 44px 32px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(99, 102, 241, 0.2);
      backdrop-filter: blur(20px);
      position: relative;
      z-index: 2;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #818cf8;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 6px 16px;
      border-radius: 999px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 1.85rem;
      font-weight: 800;
      line-height: 1.25;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #fff 30%, #a5b4fc 70%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .note-name {
      color: #38bdf8;
      font-weight: 600;
      font-size: 0.92rem;
      margin-bottom: 16px;
      word-break: break-word;
    }
    p {
      color: #94a3b8;
      font-size: 0.92rem;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 24px;
      border-radius: 10px;
      font-size: 0.92rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
    }
    .btn-primary:hover {
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.6);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .footer-note {
      margin-top: 24px;
      font-size: 0.78rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="glow" style="top: -120px; right: -120px;"></div>
  <div class="glow" style="bottom: -120px; left: -120px; background: radial-gradient(circle, rgba(56, 189, 248, 0.2) 0%, transparent 70%);"></div>

  <div class="card">
    <div class="badge">
      🔒 Registered Student Access Only
    </div>
    <h1>Free Study Material Vault</h1>
    <div class="note-name">📄 ${noteTitle}</div>
    <p>
      This academic document is exclusively available to registered college students. 
      Please create a <strong>Free Student Account</strong> or Sign In to unlock instant reading and high-speed downloads.
    </p>

    <div class="btn-group">
      <a href="/?auth=signup" class="btn btn-primary">
        🎓 Sign Up
      </a>
      <a href="/?auth=signin" class="btn btn-secondary">
        ⚡ Sign In
      </a>
    </div>

    <div class="footer-note">
      100% Free Lifetime Academic Cloud • No Ads &amp; Popups
    </div>
  </div>
</body>
</html>`;
}

/**
 * GET /api/notes/:id/stream
 * High-speed direct streaming download via Cloudflare Edge CDN Caching
 * Records download activity for student
 */
router.get(["/:id/stream", "/:id/stream.pdf", "/:id/:filename.pdf"], downloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: "Database unavailable" });

    let note = ramCache.get(`note_${id}`);
    if (!note) {
      const doc = await db.collection("notes").doc(id).get();
      if (!doc.exists) {
        console.warn(`[STREAM] Note ID not found in live collection: "${id}"`);
        const [delNote, delRec] = await Promise.all([
          db.collection("deleted_notes").doc(id).get().catch(() => ({ exists: false })),
          db.collection("deleted_records").doc(`notes_${id}`).get().catch(() => ({ exists: false })),
        ]);
        if (delNote.exists || delRec.exists) {
          const archivedData = delNote.exists ? delNote.data() : delRec.data();
          return res.status(404).json({
            success: false,
            message: `Note "${archivedData.title || id}" has been safely moved to the Restore Vault. An administrator can restore it from Admin Studio.`,
            inRecycleBin: true,
          });
        }
        return res.status(404).json({ success: false, message: "Note not found in cloud vault." });
      }
      note = { id: doc.id, ...doc.data() };
      ramCache.set(`note_${id}`, note, 3 * 3600);
    }

    // Verify requesting user token (cookie, query, or auth header)
    let requestingUser = null;
    const token = req.cookies?.fsm_token || req.cookies?.token || req.query.token || req.headers["authorization"]?.split(" ")[1];
    if (token) {
      try {
        requestingUser = jwt.verify(token, JWT_SECRET);
      } catch {}
    }

    // Gated Student Access: If not logged in, prompt user to Sign In / Register
    if (!requestingUser) {
      const isHtmlRequest =
        req.headers["sec-fetch-dest"] === "document" ||
        req.headers["sec-fetch-mode"] === "navigate" ||
        (req.headers["accept"] && req.headers["accept"].includes("text/html")) ||
        (!req.xhr && req.accepts("html"));

      if (isHtmlRequest) {
        return res.status(401).send(renderRestrictedAccessHtml(note.title));
      }
      return res.status(401).json({
        success: false,
        message: "Restricted Access: Free Study Material is exclusively for registered students. Please sign in or register.",
        authRequired: true,
        signInUrl: "/?auth=signin",
        signUpUrl: "/?auth=signup",
      });
    }
    if (!note.telegramMessageId) {
      if (note.driveLink) {
        let driveUrl = note.driveLink;
        const driveMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
          driveUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
        }
        return res.redirect(driveUrl);
      }
      if (note.fileUrl) {
        return res.redirect(note.fileUrl);
      }
      return res.status(400).json({
        success: false,
        message: note.status === "processing" 
          ? "Note is currently being processed in background queue. Please wait a few seconds." 
          : "Note file is missing from cloud vault.",
      });
    }

    // Asynchronously dispatch Real-time Telegram security notice (Zero Database Writes, Instant Delivery)
    if (requestingUser) {
      const isStudent = requestingUser.id && requestingUser.id !== "admin-root";
      sendTelegramAuthNotice({
        event: "NOTE_DOWNLOAD",
        user: {
          id: requestingUser.id,
          name: requestingUser.name || (isStudent ? "Student Scholar" : "Administrator"),
          email: requestingUser.email || "N/A",
          mobile: requestingUser.mobile || (isStudent ? "N/A" : "Admin Session"),
          college: requestingUser.college || (isStudent ? "N/A" : "Central Administration"),
          year: requestingUser.year || (isStudent ? "N/A" : "Master Admin"),
        },
        note: {
          id: note.id || id,
          title: note.title,
          subject: note.subject,
          course: note.course,
          branch: note.branch,
          downloadsCount: note.downloadsCount || 0,
        },
        method: isStudent ? "Cloudflare CDN Edge Stream" : "Admin Direct Stream",
      }).catch((err) => console.warn("[STREAM-TELEGRAM-NOTICE] Notice error:", err.message));
    }

    // Explicit PDF Content-Type & RFC-compliant Content-Disposition for Native PDFium Embedding
    const rawFileName = note.originalName || `${note.title}.pdf`;
    const sanitizedName = rawFileName.replace(/["\r\n\\]/g, "_");
    const isPdf =
      (note.mimeType && note.mimeType.toLowerCase().includes("pdf")) ||
      sanitizedName.toLowerCase().endsWith(".pdf") ||
      !note.mimeType ||
      note.mimeType === "application/octet-stream";
    const contentType = isPdf ? "application/pdf" : (note.mimeType || "application/pdf");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${sanitizedName}"; filename*=UTF-8''${encodeURIComponent(sanitizedName)}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const retentionSeconds = (typeof getCdnRetentionSeconds === "function" ? getCdnRetentionSeconds() : 365 * 86400);

    res.setHeader("Cache-Control", `public, max-age=${retentionSeconds}, immutable`);
    res.setHeader("CDN-Cache-Control", `public, max-age=${retentionSeconds}`);
    res.setHeader("Cloudflare-CDN-Cache-Control", `max-age=${retentionSeconds}`);
    res.setHeader("ETag", `W/"${note.fileHash || note.id}"`);

    // Asynchronously increment download count
    db.collection("notes").doc(id).update({
      downloadsCount: (note.downloadsCount || 0) + 1,
    }).catch(() => {});

    // Stream directly from Telegram DC via MTProto 16-Worker engine guarded by Circuit Breaker
    try {
      await telegramCircuitBreaker.execute(
        async () => {
          return await streamDocumentFromChannel(note.telegramMessageId, res, req.headers.range);
        },
        async (breakerErr) => {
          console.warn(`[STREAM-BREAKER] Triggering resilient fallback for note ${id}:`, breakerErr.message);

          // Secondary Failover: Telegram Bot API direct stream (if bot file ID exists)
          const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
          const botFileId = note.telegramBotFileId || note.telegramFileId;
          if (botFileId && botToken) {
            try {
              const fileMetaRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${botFileId}`);
              const fileMetaData = await fileMetaRes.json();
              if (fileMetaData.ok && fileMetaData.result?.file_path) {
                const rawFileUrl = `https://api.telegram.org/file/bot${botToken}/${fileMetaData.result.file_path}`;
                const fileStreamRes = await fetch(rawFileUrl);
                if (fileStreamRes.ok && fileStreamRes.body) {
                  const { Readable } = require("stream");
                  const nodeReadable = Readable.fromWeb ? Readable.fromWeb(fileStreamRes.body) : fileStreamRes.body;
                  return nodeReadable.pipe(res);
                }
              }
            } catch (botErr) {
              console.warn("[STREAM FAILOVER] Bot API fallback notice:", botErr.message);
            }
          }

          if (note.driveLink) {
            return res.redirect(note.driveLink);
          }

          throw breakerErr;
        }
      );
    } catch (streamErr) {
      console.warn(`[STREAM] MTProto stream notice for note ${id}:`, streamErr.message);

      if (note.driveLink) {
        return res.redirect(note.driveLink);
      }

      throw streamErr;
    }
  } catch (err) {
    console.error("[STREAM] Error streaming note:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Streaming error: " + err.message, retryable: true });
    }
  }
});

module.exports = router;
