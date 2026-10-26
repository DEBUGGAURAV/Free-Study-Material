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
const { helpLimiter } = require("../middleware/rateLimit");
const { authenticateToken, requireAuth } = require("../middleware/auth");
const {
  createHelpTicket,
  getTicketByCode,
  getTicketsByCodes,
  replyHelpTicket,
  closeHelpTicket,
  setHelpTicketActive,
  deleteHelpTicket,
  purgeHelpTickets,
  createTelegramForumTopics,
  getAllHelpTickets,
  getHelpTursoTelemetry,
  getHelpBotTelemetry,
} = require("../services/helpTicketService");

// Curated Instant Solutions & FAQs (Standard Professional English Language)
const CURATED_FAQS = [
  {
    id: "faq_1",
    category: "download",
    question: "How do I download PDF notes, or what should I do if a download is paused?",
    answer:
      "Free Study Material employs an autonomous 3-layer resilient failover network. Download requests seamlessly cycle through the Primary Storage Vault, Cloudflare Edge CDN, and native streaming fallback. If a download pauses, click 'Retry Download' or use 'Online Preview' for instant in-browser reading.",
  },
  {
    id: "faq_2",
    category: "offline",
    question: "How can I access and read notes offline without an active internet connection?",
    answer:
      "Click the 'Save Offline' button next to any study material. The document will be cached securely in your browser's local IndexedDB vault, allowing instant 0ms access even with zero internet connectivity.",
  },
  {
    id: "faq_3",
    category: "passkey",
    question: "How do I set up and use Biometric Passkey (Fingerprint / Face ID) sign-in?",
    answer:
      "After signing in, navigate to your Profile or Security settings and click 'Register Biometric Passkey'. You can then authenticate in sub-second time using Touch ID, Face ID, or Windows Hello without entering passwords.",
  },
  {
    id: "faq_4",
    category: "request_notes",
    question: "How can I request missing syllabus notes or previous year exam papers?",
    answer:
      "Navigate to the 'Ask Question / Request' tab in this Help Center, select 'Request Missing Notes', and provide your Subject Name, University, and Semester. Our academic team curates and uploads verified materials within 24 to 48 hours.",
  },
  {
    id: "faq_5",
    category: "account",
    question: "Is Free Study Material completely free for all college and university students?",
    answer:
      "Yes, 100% free! All handwritten lecture notes, university exam papers, and engineering textbooks are provided with zero subscription fees, zero paywalls, and unlimited access.",
  },
  {
    id: "faq_6",
    category: "telegram",
    question: "How can I connect with the official Telegram Academic Community & notifications?",
    answer:
      "You can connect through our official Telegram Bot (@fsm_chat_bot or @fsm_security_otp_bot) or join official FSM broadcast channels to receive daily semester updates, exam datesheets, and new study material alerts.",
  },
  {
    id: "faq_security_jail",
    category: "security",
    question: "Why was my IP jailed or account blocked, and what are the detention time limits? (IP Jail Policy)",
    answer:
      "Free Study Material utilizes an automated Zero-Trust Security Engine and Anti-DDoS Firewall to safeguard academic resources. When excessive traffic surges or client-side tampering is detected, temporary security detention is enforced. Detention policies and limits are detailed in the matrix below:",
    table: [
      {
        reason: "DDoS / Traffic Surge (>600 req/min)",
        detentionTime: "3 Minutes",
        autoUnjail: "✅ Auto-release after 180s",
        adminControl: "Instant manual pardon via Tab 14",
      },
      {
        reason: "Client Script / DevTools Tamper (Strike 3)",
        detentionTime: "24 Hours",
        autoUnjail: "✅ Auto-release after 24h",
        adminControl: "Instant manual pardon via Tab 14",
      },
      {
        reason: "Admin Manual IP Jail (Tab 14)",
        detentionTime: "Admin Chosen (1h / 24h / Custom)",
        autoUnjail: "✅ Auto-release on expiration",
        adminControl: "Single-click 'Release / Pardon' via Tab 14",
      },
    ],
    note: "If your account or IP was quarantined by mistake, go to the 'Ask Admin / Request' tab, select Category 'Account Block / IP Jail Appeal', and provide your Incident ID (e.g. FSM-SEC-XXXXXX) so administrators can verify and release it immediately via Tab 14.",
  },
];

// Note: Anti-Spam helpLimiter imported from ../middleware/rateLimit with proxy isolation & immunity

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
router.post("/ask", helpLimiter, authenticateToken, async (req, res) => {
  try {
    const { name, email, mobile, category, subject, question, hp_website } = req.body;

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
        message: "Please write your question in detail (minimum 5 characters).",
      });
    }

    // Check if user is logged in (from authenticateToken middleware)
    let user = req.user || null;
    if (!user) {
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
    }

    // 🔒 STRICT VALIDATION: Unregistered / Guest users MUST provide valid Email AND Mobile Number
    if (!user) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Full Name is required.",
        });
      }
      if (!email || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({
          success: false,
          message: "Email Address is mandatory. Please provide a valid email (e.g. yourname@gmail.com).",
        });
      }
      const cleanMobile = (mobile || "").trim().replace(/[\s-]/g, "");
      if (!cleanMobile || !/^\+?[0-9]{10,13}$/.test(cleanMobile)) {
        return res.status(400).json({
          success: false,
          message: "Mobile Number is mandatory. Please provide a valid 10-digit mobile number.",
        });
      }
    }

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
      mobile: user?.mobile || mobile || "",
      userId: user?.id || null,
      userRole: user ? (user.role === "admin" ? "admin" : "student") : "guest",
      category: category || "general",
      subject: subject || "",
      question: question.trim(),
      ip: clientIp,
    });

    return res.json({
      success: true,
      message: "Your question has been submitted successfully! An administrator will respond shortly.",
      ticket: {
        ticket_code: ticket.ticket_code,
        user_name: ticket.user_name,
        user_email: ticket.user_email,
        user_mobile: ticket.user_mobile,
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
 * Get details of a single ticket with Strict Ownership Enforcement
 */
router.get("/ticket/:code", authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const ticket = await getTicketByCode(code);
    if (!ticket) {
      return res.status(404).json({ success: false, message: `Ticket #${code} not found.` });
    }

    // 🛡️ STRICT TICKET OWNERSHIP LOCK:
    const currentUser = req.user || null;
    const isMainAdmin = currentUser && (currentUser.role === "admin" || currentUser.isMainAdmin || currentUser.role === "half_admin");

    if (!isMainAdmin) {
      // 1. If ticket belongs to a registered student account:
      if (ticket.user_id) {
        if (!currentUser || currentUser.id !== ticket.user_id) {
          return res.status(403).json({
            success: false,
            message: "This ticket belongs to a registered account. Please sign in to the corresponding account to view it.",
          });
        }
      } else {
        // 2. If ticket is a guest inquiry:
        const queryEmail = (req.query.email || req.headers["x-ticket-email"] || "").trim().toLowerCase();
        const queryMobile = (req.query.mobile || req.headers["x-ticket-mobile"] || "").replace(/\D/g, "").slice(-10);

        const currentEmail = (currentUser?.email || "").trim().toLowerCase();
        const currentMobile = (currentUser?.mobile || "").replace(/\D/g, "").slice(-10);

        const ticketEmail = (ticket.user_email || "").trim().toLowerCase();
        const ticketMobile = (ticket.user_mobile || "").replace(/\D/g, "").slice(-10);

        const emailMatches = (queryEmail && ticketEmail && queryEmail === ticketEmail) || (currentEmail && ticketEmail && currentEmail === ticketEmail);
        const mobileMatches = (queryMobile && ticketMobile && queryMobile === ticketMobile) || (currentMobile && ticketMobile && currentMobile === ticketMobile);

        if (!emailMatches && !mobileMatches) {
          return res.status(403).json({
            success: false,
            message: "Access restricted: Please enter the matching Email or Mobile number used when creating this ticket.",
          });
        }
      }
    }

    return res.json({
      success: true,
      ticket: {
        ticket_code: ticket.ticket_code,
        user_name: ticket.user_name,
        user_email: ticket.user_email,
        user_mobile: ticket.user_mobile,
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
 * Retrieve ticket history for device or user (Strictly scoped to owner)
 */
router.post("/my-tickets", authenticateToken, async (req, res) => {
  try {
    const { ticketCodes, email: bodyEmail, mobile: bodyMobile } = req.body || {};

    let user = req.user || null;
    let userId = user?.id || null;
    if (!userId) {
      try {
        const authHeader = req.headers["authorization"];
        if (authHeader) {
          const token = authHeader.split(" ")[1];
          if (token) {
            const jwt = require("jsonwebtoken");
            const { JWT_SECRET } = require("../middleware/auth");
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
            user = decoded;
          }
        }
      } catch (_) {}
    }

    const userEmail = (user?.email || bodyEmail || "").trim().toLowerCase();
    const userMobile = (user?.mobile || bodyMobile || "").trim();

    const tickets = await getTicketsByCodes(
      Array.isArray(ticketCodes) ? ticketCodes : [],
      userId,
      userEmail,
      userMobile
    );

    const safeTickets = Array.isArray(tickets) ? tickets.filter(Boolean) : [];

    return res.json({
      success: true,
      tickets: safeTickets.map((t) => ({
        ticket_code: t.ticket_code || "",
        user_name: t.user_name || "Student",
        user_email: t.user_email || "",
        user_mobile: t.user_mobile || "",
        category: t.category || "general",
        subject: t.subject || "",
        question: t.question || "",
        status: t.status || "active",
        admin_reply: t.admin_reply || null,
        admin_name: t.admin_name || null,
        replied_at: t.replied_at || null,
        created_at: t.created_at || new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.warn("[HELP-MY-TICKETS] Notice:", err.message);
    return res.json({ success: true, tickets: [] });
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

/**
 * POST /api/help/admin/close
 * Admin close ticket, dispatches Topic 2 report, with optional auto-delete
 */
router.post("/admin/close", authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "half_admin")) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { ticketCode, reason, autoDelete } = req.body;
    if (!ticketCode) {
      return res.status(400).json({ success: false, message: "Ticket code required." });
    }

    const result = await closeHelpTicket({
      ticketCode,
      closedBy: req.user.name || "Academic Administrator",
      reason: reason || "Resolved by Administrator via Web Console",
      autoDelete: Boolean(autoDelete),
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/help/admin/active
 * Mark ticket active
 */
router.post("/admin/active", authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "half_admin")) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { ticketCode } = req.body;
    if (!ticketCode) {
      return res.status(400).json({ success: false, message: "Ticket code required." });
    }

    const result = await setHelpTicketActive({
      ticketCode,
      updatedBy: req.user.name || "Academic Administrator",
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/help/admin/ticket/:code
 * Physically delete a ticket from Turso Database & Memory
 */
router.delete("/admin/ticket/:code", authenticateToken, async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "half_admin")) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { code } = req.params;
    const result = await deleteHelpTicket(code);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/help/admin/purge
 * Physically purge tickets from Turso Database
 */
router.delete("/admin/purge", authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only Master Admin can purge database." });
    }

    const onlyClosed = req.query.all !== "true";
    const result = await purgeHelpTickets(onlyClosed);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/help/admin/create-topics
 * Automatically create Telegram Forum Topics in Supergroup
 */
router.post("/admin/create-topics", authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin authorization required." });
    }

    const result = await createTelegramForumTopics(req.body.chatId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/help/admin/telemetry
 * Live telemetry stats
 */
router.get("/admin/telemetry", authenticateToken, async (req, res) => {
  try {
    const turso = await getHelpTursoTelemetry();
    const bot = getHelpBotTelemetry();
    return res.json({ success: true, turso, bot });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

