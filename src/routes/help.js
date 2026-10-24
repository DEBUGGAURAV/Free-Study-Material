/**
 * ============================================================================
 * 🌟 HELP & SUPPORT ROUTE (HYBRID SMART HELP CENTER)
 * ============================================================================
 * - Works for both Registered & Guest Students (0ms Latency)
 * - Anti-Spam Rate Limiter + Honeypot Detection
 * - 2-Way Telegram Support Integration
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { authenticateToken, requireAuth } = require("../middleware/auth");
const {
  createHelpTicket,
  getTicketByCode,
  getTicketsByCodes,
  replyHelpTicket,
  getAllHelpTickets,
} = require("../services/helpTicketService");

// Curated Instant Solutions & FAQs (0ms self-service)
const CURATED_FAQS = [
  {
    id: "faq_1",
    category: "download",
    question: "PDF Download kaise karein ya download paused kyo dikha raha hai?",
    answer:
      "Agar download paused dikhe, to घबराएं nahi! Platform me 3-Layer Failover Engine hai. Pehle Storage Server, phir Cloudflare CDN, aur phir Native PDF fallback automatic connect hota hai. 'Retry Download' pe click karein ya direct 'Preview' button se online padhein.",
  },
  {
    id: "faq_2",
    category: "offline",
    question: "Offline bina internet ke notes kaise padhein?",
    answer:
      "Aap kisi bhi note ke samne 'Save Offline' icon pe click kar sakte hain. Note aapke browser ke IndexedDB storage me save ho jayega aur bina kisi internet connection ke bhi instant open hoga.",
  },
  {
    id: "faq_3",
    category: "passkey",
    question: "Passkey (Fingerprint / Face ID) sign-in kaise set karein?",
    answer:
      "Account me login karne ke baad 'Security & Passkey' section me jayein aur 'Register Biometric Passkey' pe tap karein. Iske baad aap bina password dale sirf apne fingerprint ya Face ID se 0ms me sign-in kar sakte hain.",
  },
  {
    id: "faq_4",
    category: "request_notes",
    question: "Kisi subject ke notes missing hain to request kaise karein?",
    answer:
      "Aap is Help Center ke 'Ask Question / Request' tab me ja kar Category me 'Request Missing Notes' select karein aur Subject name & Semester likhein. Humari team 24-48 hours me use upload kar degi.",
  },
  {
    id: "faq_5",
    category: "account",
    question: "Kya Free Study Material 100% free hai?",
    answer:
      "Haan! Free Study Material platform sabhi engineering & academic students ke liye 100% free hai. Yahan sabhi handwritten notes, pyqs, aur textbooks bina kisi subscription ke uplabdh hain.",
  },
  {
    id: "faq_6",
    category: "telegram",
    question: "Telegram Study Group / Bot kaise join karein?",
    answer:
      "Aap humare official Telegram Bot @fsm_chat_bot ya official FSM channel se jud sakte hain jahan daily new notes aur semester updates aate hain.",
  },
];

// Anti-Spam Rate Limiter: Max 6 questions per hour per IP for guests
const helpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Aapne bohot saare sawal bhej diye hain. Kripya 1 ghante baad naya sawal poochein.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/help/faqs
 * Instant searchable FAQs
 */
router.get("/faqs", (req, res) => {
  return res.json({
    success: true,
    faqs: CURATED_FAQS,
  });
});

/**
 * POST /api/help/ask
 * Submit a question (both registered & guest)
 */
router.post("/ask", helpLimiter, async (req, res) => {
  try {
    const { name, email, category, subject, question, hp_website } = req.body;

    // 1. Anti-spam Honeypot Trap
    if (hp_website) {
      console.warn(`[HELP-SPAM-TRAP] Blocked honeypot bot attempt from IP: ${req.ip}`);
      return res.json({
        success: true,
        message: "Question submitted successfully!",
        ticket: { ticket_code: "FSM-H0000", status: "pending" },
      });
    }

    if (!question || question.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "Kripya apna question detail me likhein (minimum 5 characters).",
      });
    }

    // Check if user is logged in
    let user = null;
    try {
      const authHeader = req.headers["authorization"];
      if (authHeader) {
        const token = authHeader.split(" ")[1];
        if (token) {
          const jwt = require("jsonwebtoken");
          const { JWT_SECRET } = require("../middleware/auth");
          user = jwt.verify(token, JWT_SECRET);
        }
      }
    } catch (_) {}

    const clientIp = (
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      "127.0.0.1"
    )
      .split(",")[0]
      .trim()
      .replace(/^::ffff:/, "");

    const ticket = await createHelpTicket({
      name: user?.name || name || "Student Visitor",
      email: user?.email || email || "",
      userId: user?.id || null,
      userRole: user ? (user.role === "admin" ? "admin" : "student") : "guest",
      category: category || "general",
      subject: subject || "",
      question: question.trim(),
      ip: clientIp,
    });

    return res.json({
      success: true,
      message: "Aapka sawal submit ho gaya hai! Admin jald hi reply karenge.",
      ticket: {
        ticket_code: ticket.ticket_code,
        user_name: ticket.user_name,
        category: ticket.category,
        subject: ticket.subject,
        question: ticket.question,
        status: ticket.status,
        created_at: ticket.created_at,
      },
    });
  } catch (err) {
    console.error("[HELP-DESK] Ask query error:", err);
    return res.status(500).json({ success: false, message: "Failed to submit query: " + err.message });
  }
});

/**
 * GET /api/help/ticket/:code
 * Get details of a single ticket
 */
router.get("/ticket/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const ticket = await getTicketByCode(code);
    if (!ticket) {
      return res.status(404).json({ success: false, message: `Ticket #${code} not found.` });
    }

    return res.json({
      success: true,
      ticket: {
        ticket_code: ticket.ticket_code,
        user_name: ticket.user_name,
        category: ticket.category,
        subject: ticket.subject,
        question: ticket.question,
        status: ticket.status,
        admin_reply: ticket.admin_reply,
        admin_name: ticket.admin_name,
        replied_at: ticket.replied_at,
        created_at: ticket.created_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/help/my-tickets
 * Retrieve ticket history for device or user
 */
router.post("/my-tickets", async (req, res) => {
  try {
    const { ticketCodes } = req.body || {};

    let userId = null;
    try {
      const authHeader = req.headers["authorization"];
      if (authHeader) {
        const token = authHeader.split(" ")[1];
        if (token) {
          const jwt = require("jsonwebtoken");
          const { JWT_SECRET } = require("../middleware/auth");
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.id;
        }
      }
    } catch (_) {}

    const tickets = await getTicketsByCodes(Array.isArray(ticketCodes) ? ticketCodes : [], userId);

    return res.json({
      success: true,
      tickets: tickets.map((t) => ({
        ticket_code: t.ticket_code,
        user_name: t.user_name,
        category: t.category,
        subject: t.subject,
        question: t.question,
        status: t.status,
        admin_reply: t.admin_reply,
        admin_name: t.admin_name,
        replied_at: t.replied_at,
        created_at: t.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/help/admin/reply
 * Admin Web reply
 */
router.post("/admin/reply", authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "half_admin")) {
      return res.status(403).json({ success: false, message: "Unauthorized. Administrator access required." });
    }

    const { ticketCode, replyText } = req.body;
    if (!ticketCode || !replyText) {
      return res.status(400).json({ success: false, message: "Ticket code and reply text are required." });
    }

    const result = await replyHelpTicket({
      ticketCode,
      replyText,
      adminName: req.user.name || "Academic Administrator",
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({
      success: true,
      message: `Reply successfully delivered to student on ticket #${ticketCode}!`,
      ticket: result.ticket,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/help/admin/tickets
 * Admin tickets list
 */
router.get("/admin/tickets", authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "half_admin")) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { status, limit, offset } = req.query;
    const tickets = await getAllHelpTickets({
      status: status || null,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });

    return res.json({
      success: true,
      tickets,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

