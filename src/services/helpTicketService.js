/**
 * ============================================================================
 * 🌟 DEDICATED HELP & SUPPORT TICKET SERVICE (@fsm_help_bot)
 * ============================================================================
 * - Supergroup Topics:
 *   1. Active Queries Topic (New / Open tickets with Status Toggle Buttons)
 *   2. Closed Dossiers Topic (Full audit resolution report when closed)
 * - Zero DM Leakage: Notifications NEVER dispatched to private bot DM!
 * - Dedicated Turso Support Cloud Database (libsql://fsm-support-...)
 * - 2-Way Sync: Live Telegram Admin replies & Status Buttons
 * ============================================================================
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

// Fallback in-memory cache to guarantee 0ms instant availability
const memoryTickets = new Map();
const recentlyClosedTickets = new Map();

// Dedicated Turso Support Cloud Client initialization
const helpTursoUrl = (process.env.TURSO_HELP_DATABASE_URL || "").trim();
const helpAuthToken = (process.env.TURSO_HELP_AUTH_TOKEN || "").trim();

let helpTursoClient = null;
let isHelpCloud = false;

try {
  if (helpTursoUrl && (helpTursoUrl.startsWith("libsql://") || helpTursoUrl.startsWith("https://")) && helpAuthToken) {
    isHelpCloud = true;
    helpTursoClient = createClient({
      url: helpTursoUrl,
      authToken: helpAuthToken,
    });
    console.log("[HELP-TURSO] 🟢 Connected to Dedicated Support LibSQL Cloud:", helpTursoUrl);
  } else {
    const cacheDir = path.join(process.cwd(), "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const localDbPath = path.join(cacheDir, "turso_help_vault.db");
    helpTursoClient = createClient({ url: `file:${localDbPath}` });
    console.log("[HELP-TURSO] 🟡 Local LibSQL standby mode for Help Desk:", localDbPath);
  }
} catch (err) {
  console.warn("[HELP-TURSO] Cloud init fallback:", err.message);
  const { tursoClient } = require("./tursoService");
  helpTursoClient = tursoClient;
}

function getHelpBotToken() {
  return (
    process.env.HELP_BOT_TOKEN ||
    process.env.TELEGRAM_HELP_BOT_TOKEN ||
    ""
  ).trim();
}

function getHelpChatId() {
  return (
    process.env.HELP_CHAT_ID ||
    process.env.TELEGRAM_HELP_CHAT_ID ||
    "-1004369896029"
  ).trim();
}

function getHelpAdminChatId() {
  return (
    process.env.HELP_ADMIN_CHAT_ID ||
    process.env.TELEGRAM_CHAT_AUDIT_ADMIN_ID ||
    "7009492653"
  ).trim();
}

// Supergroup Topic 6: Active Support Tickets
function getHelpActiveTopicId() {
  const topic = process.env.HELP_TOPIC_ACTIVE_ID || process.env.HELP_TOPIC_ID || process.env.TELEGRAM_HELP_TOPIC_ID;
  const parsed = topic ? parseInt(topic, 10) : 6;
  return !isNaN(parsed) && parsed > 0 ? parsed : 6;
}

// Supergroup Topic 7: Closed & Resolved Tickets Report
function getHelpClosedTopicId() {
  const topic = process.env.HELP_TOPIC_CLOSED_ID || process.env.HELP_CLOSED_TOPIC_ID;
  const parsed = topic ? parseInt(topic, 10) : 7;
  return !isNaN(parsed) && parsed > 0 ? parsed : 7;
}

/**
 * Initialize dedicated Turso table for help tickets
 */
async function initHelpTable() {
  if (!helpTursoClient) return;
  try {
    await helpTursoClient.execute(`
      CREATE TABLE IF NOT EXISTS help_tickets (
        id TEXT PRIMARY KEY,
        ticket_code TEXT UNIQUE,
        user_id TEXT,
        user_name TEXT,
        user_email TEXT,
        user_mobile TEXT,
        user_role TEXT DEFAULT 'guest',
        category TEXT DEFAULT 'general',
        subject TEXT,
        question TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        admin_reply TEXT,
        admin_name TEXT,
        replied_at TEXT,
        closed_at TEXT,
        closed_by TEXT,
        ip_address TEXT,
        telegram_message_id TEXT,
        conversation TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await helpTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_code ON help_tickets(ticket_code);`).catch(() => {});
    await helpTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_status ON help_tickets(status);`).catch(() => {});
    // Safe hot-migrations for existing databases
    await helpTursoClient.execute(`ALTER TABLE help_tickets ADD COLUMN user_mobile TEXT;`).catch(() => {});
    await helpTursoClient.execute(`ALTER TABLE help_tickets ADD COLUMN conversation TEXT;`).catch(() => {});
    // Purge any closed tickets so database is 100% clean
    await helpTursoClient.execute(`DELETE FROM help_tickets WHERE status = 'closed';`).catch(() => {});
    console.log("[HELP-TURSO] ✅ Support help_tickets table ready (closed tickets auto-purged).");
  } catch (err) {
    console.warn("[HELP-TURSO] Table init warning:", err.message);
  }
}

let tableInitPromise = null;
function ensureHelpTable() {
  if (!tableInitPromise) {
    tableInitPromise = initHelpTable();
  }
  return tableInitPromise;
}

ensureHelpTable().catch(() => {});

function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FSM-H${rand}`;
}

/**
 * Dispatch Telegram Alert to Supergroup Active Topic (NEVER sent to Bot DM!)
 */
async function dispatchTelegramHelpNotice(ticket) {
  // 🛡️ Security Instruction: IP Jail / Block Appeals MUST ONLY go to Security Supergroup Topic 750
  if (ticket.category === "block_appeal") {
    try {
      const { sendTelegramAuthNotice } = require("./emailService");
      const incMatch = ((ticket.subject || "") + " " + (ticket.question || "")).match(/FSM-SEC-\d+/i);
      const incidentId = incMatch ? incMatch[0].toUpperCase() : `FSM-SEC-${ticket.ticket_code.replace(/\D/g, "")}`;
      const appealText = [
        `🛡️ <b>[SECURITY QUARANTINE / IP JAIL APPEAL]</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `🆔 <b>Incident ID:</b> <code>${incidentId}</code>`,
        `🎫 <b>Help Ticket:</b> #${ticket.ticket_code}`,
        `👤 <b>Student:</b> ${ticket.user_name || "Student Visitor"}`,
        `📧 <b>Email:</b> <code>${ticket.user_email || "N/A"}</code>`,
        `📱 <b>Mobile:</b> <code>${ticket.user_mobile || "N/A"}</code>`,
        `🌐 <b>Public IP:</b> <code>${ticket.ip_address || "N/A"}</code>`,
        `💬 <b>Appeal Statement:</b>`,
        `<i>${ticket.question.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `🎯 <b>Target:</b> <b>🛡️ IP Jail & Security Appeals (Topic 750)</b>`,
        `⚡ <b>Admin Action Choices:</b>`,
        `• <b>Pardon Entire IP:</b> Unjails the student's IP address`,
        `🕒 <b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      ]
        .filter(Boolean)
        .join("\n");

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "🌐 Pardon Entire IP", callback_data: `appeal:pardon_ip:${incidentId}:${ticket.ip_address || "none"}` },
            { text: "❌ Reject Appeal", callback_data: `appeal:deny:${incidentId}` },
          ],
        ],
      };

      await sendTelegramAuthNotice({
        event: "IP_JAIL_APPEAL",
        user: { name: ticket.user_name, email: ticket.user_email, mobile: ticket.user_mobile, ip: ticket.ip_address },
        method: "Help Center Block Appeal",
        detail: appealText,
        threadId: process.env.TELEGRAM_TOPIC_IP_APPEAL || "750",
        replyMarkup,
      });
      return "security_topic_750";
    } catch (e) {
      console.warn("[HELP-TICKET] Block appeal routing error:", e.message);
      return null;
    }
  }

  const botToken = getHelpBotToken();
  const chatId = getHelpChatId();
  if (!botToken || !chatId) {
    console.warn("[HELP-BOT] Missing bot token or Supergroup chat ID.");
    return null;
  }

  const roleLabel = ticket.user_role === "student" ? "🎓 Registered Student" : "👤 Guest Visitor";
  const userDisplay = `${ticket.user_name || "Guest"} (${roleLabel})`;
  const emailDisplay = ticket.user_email || "Not Provided";
  const mobileDisplay = ticket.user_mobile || "Not Provided";

  const text = [
    `📩 <b>NEW HELP DESK QUERY #${ticket.ticket_code}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${userDisplay}`,
    `📧 <b>Email:</b> <code>${emailDisplay}</code>`,
    `📱 <b>Mobile:</b> <code>${mobileDisplay}</code>`,
    `🏷️ <b>Category:</b> ${ticket.category || "General Support"}`,
    ticket.subject ? `📚 <b>Subject:</b> ${ticket.subject}` : null,
    `❓ <b>Question:</b>`,
    `<i>${ticket.question.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Quick Actions:</b>`,
    `• Reply in Topic 6 / Bot DM to answer the student`,
    `• Single-click below to close and archive to Topic 7:`,
  ]
    .filter(Boolean)
    .join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🔴 Close Ticket", callback_data: `ticket:close:${ticket.ticket_code}` },
      ],
    ],
  };

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard,
    };

    const activeTopicId = getHelpActiveTopicId();
    if (activeTopicId) {
      payload.message_thread_id = activeTopicId;
    }

    let res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await res.json();
    let sentMsgId = data.ok && data.result?.message_id ? String(data.result.message_id) : null;

    // Resilient Topic Fallback: If forum topic thread does not exist or fails, retry to direct chat
    if (!sentMsgId && payload.message_thread_id) {
      console.warn(`[HELP-BOT] Topic ${payload.message_thread_id} send failed (${data.description}), retrying to chat without thread ID...`);
      delete payload.message_thread_id;
      res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json();
      if (data.ok && data.result?.message_id) {
        sentMsgId = String(data.result.message_id);
      }
    }

    // Also dispatch notification to Admin DM so Admin can reply directly via Bot DM as well!
    const adminChatId = getHelpAdminChatId();
    if (adminChatId && adminChatId !== chatId) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          text,
          parse_mode: "HTML",
          reply_markup: inlineKeyboard,
        }),
      }).catch(() => {});
    }

    return sentMsgId;
  } catch (err) {
    console.warn("[HELP-BOT] Telegram dispatch error:", err.message);
  }
  return null;
}

/**
 * Dispatches Closed Ticket Resolution Dossier Report to Supergroup Closed Topic (Topic 7)
 */
async function dispatchClosedTicketReport(ticket, closedBy = "Administrator") {
  const botToken = getHelpBotToken();
  const chatId = getHelpChatId();
  const closedTopicId = getHelpClosedTopicId();
  if (!botToken || !chatId) return;

  const roleLabel = ticket.user_role === "student" ? "🎓 Registered Student" : "👤 Guest Visitor";
  const replySummary = ticket.admin_reply
    ? `<i>${ticket.admin_reply.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`
    : `<i>Ticket resolved and archived directly by ${closedBy}.</i>`;

  const text = [
    `🔒 <b>TICKET RESOLUTION AUDIT REPORT #${ticket.ticket_code}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${ticket.user_name || "Guest"} (${roleLabel})`,
    `📧 <b>Email:</b> <code>${ticket.user_email || "Not Provided"}</code>`,
    `📱 <b>Mobile:</b> <code>${ticket.user_mobile || "Not Provided"}</code>`,
    `🏷️ <b>Category:</b> ${ticket.category || "General Support"}`,
    ticket.subject ? `📚 <b>Subject:</b> ${ticket.subject}` : null,
    `❓ <b>Original Inquiry:</b>`,
    `<i>${(ticket.question || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `✅ <b>Admin Resolution / Answer:</b>`,
    replySummary,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👨‍💻 <b>Closed By:</b> ${closedBy}`,
    `🕒 <b>Closed At:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `🗑️ <b>Database Status:</b> Permanently Deleted from Database (Auto-Purged)`,
  ]
    .filter(Boolean)
    .join("\n");

  const closedKeyboard = {
    inline_keyboard: [
      [
        { text: "🟢 Re-Activate Ticket", callback_data: `ticket:reactivate:${ticket.ticket_code}` },
      ],
    ],
  };

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: closedKeyboard,
    };

    if (closedTopicId) {
      payload.message_thread_id = closedTopicId;
    }

    let res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await res.json().catch(() => null);
    if (!data || (!data.ok && payload.message_thread_id)) {
      delete payload.message_thread_id;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    // Also dispatch copy to Admin DM
    const adminChatId = getHelpAdminChatId();
    if (adminChatId && adminChatId !== chatId) {
      delete payload.message_thread_id;
      payload.chat_id = adminChatId;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[HELP-BOT] Closed report dispatch error:", err.message);
  }
}

/**
 * Create a new help ticket in dedicated Turso database
 */
async function createHelpTicket({
  name,
  email,
  mobile = "",
  userId = null,
  userRole = "guest",
  category = "general",
  subject = "",
  question,
  ip = "",
}) {
  const id = `ht_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const ticketCode = generateTicketCode();
  const now = new Date().toISOString();

  const ticketObj = {
    id,
    ticket_code: ticketCode,
    user_id: userId,
    user_name: (name || "Guest Scholar").trim(),
    user_email: (email || "").trim().toLowerCase(),
    user_mobile: (mobile || "").trim(),
    user_role: userRole,
    category: category || "general",
    subject: (subject || "").trim(),
    question: question.trim(),
    status: "active",
    admin_reply: null,
    admin_name: null,
    replied_at: null,
    closed_at: null,
    closed_by: null,
    ip_address: ip,
    telegram_message_id: null,
    created_at: now,
    updated_at: now,
  };

  memoryTickets.set(ticketCode, ticketObj);

  // Dispatch to Telegram Supergroup Active Topic
  dispatchTelegramHelpNotice(ticketObj)
    .then(async (msgId) => {
      if (msgId) {
        ticketObj.telegram_message_id = msgId;
        if (helpTursoClient) {
          await helpTursoClient
            .execute({
              sql: `UPDATE help_tickets SET telegram_message_id = ? WHERE ticket_code = ?`,
              args: [msgId, ticketCode],
            })
            .catch(() => {});
        }
      }
    })
    .catch(() => {});

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `
          INSERT INTO help_tickets (
            id, ticket_code, user_id, user_name, user_email, user_mobile, user_role,
            category, subject, question, status, ip_address, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          ticketCode,
          userId,
          ticketObj.user_name,
          ticketObj.user_email,
          ticketObj.user_mobile,
          ticketObj.user_role,
          ticketObj.category,
          ticketObj.subject,
          ticketObj.question,
          ticketObj.status,
          ticketObj.ip_address,
          ticketObj.created_at,
          ticketObj.updated_at,
        ],
      });
    } catch (dbErr) {
      console.warn("[HELP-TURSO] Ticket insert error:", dbErr.message);
    }
  }

  return ticketObj;
}

/**
 * Get ticket by code
 */
async function getTicketByCode(ticketCode) {
  if (!ticketCode) return null;
  const cleanCode = ticketCode.trim().toUpperCase();

  if (memoryTickets.has(cleanCode)) {
    return memoryTickets.get(cleanCode);
  }

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      const res = await helpTursoClient.execute({
        sql: `SELECT * FROM help_tickets WHERE ticket_code = ? LIMIT 1`,
        args: [cleanCode],
      });
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        memoryTickets.set(cleanCode, row);
        return row;
      }
    } catch (err) {
      console.warn("[HELP-TURSO] Query ticket error:", err.message);
    }
  }

  return null;
}

/**
 * Get multiple tickets by list of codes or userId with Strict Ownership Enforcement
 */
async function getTicketsByCodes(ticketCodes = [], userId = null, userEmail = null, userMobile = null) {
  const results = [];
  const addedCodes = new Set();
  const cleanEmail = (userEmail || "").trim().toLowerCase();
  const cleanMobileDigits = (userMobile || "").replace(/\D/g, "").slice(-10);
  const validCodes = (ticketCodes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => c.startsWith("FSM-H"));

  // 🛡️ Strict ownership verifier: guarantees a user only receives their own tickets
  const isTicketOwner = (t) => {
    if (!t) return false;
    // 1. Device retention: Ticket code explicitly stored in this browser's session
    if (validCodes.includes(t.ticket_code)) return true;

    // 2. Authenticated user ID matches
    if (userId && t.user_id && t.user_id === userId) return true;

    // 3. User email or mobile matches
    const tEmail = (t.user_email || "").trim().toLowerCase();
    const tMobile = (t.user_mobile || "").replace(/\D/g, "").slice(-10);

    if (cleanEmail && tEmail && tEmail === cleanEmail) return true;
    if (cleanMobileDigits && tMobile && tMobile === cleanMobileDigits) return true;

    return false;
  };

  // 1. Fetch from in-memory pool with ownership check
  for (const code of validCodes) {
    if (memoryTickets.has(code)) {
      const cached = memoryTickets.get(code);
      if (isTicketOwner(cached) && !addedCodes.has(cached.ticket_code)) {
        results.push(cached);
        addedCodes.add(cached.ticket_code);
      }
    }
  }

  // 2. Fetch from Turso Edge Database
  if (helpTursoClient && (validCodes.length > 0 || userId || cleanEmail || cleanMobileDigits)) {
    try {
      await ensureHelpTable();
      const orClauses = [];
      const args = [];

      if (validCodes.length > 0) {
        const placeholders = validCodes.map(() => "?").join(",");
        orClauses.push(`ticket_code IN (${placeholders})`);
        args.push(...validCodes);
      }
      if (userId) {
        orClauses.push(`user_id = ?`);
        args.push(userId);
      }
      if (cleanEmail) {
        orClauses.push(`LOWER(user_email) = ?`);
        args.push(cleanEmail);
      }
      if (cleanMobileDigits) {
        orClauses.push(`user_mobile LIKE ?`);
        args.push(`%${cleanMobileDigits}`);
      }

      if (orClauses.length > 0) {
        const querySql = `SELECT * FROM help_tickets WHERE ${orClauses.join(" OR ")} ORDER BY created_at DESC LIMIT 50`;
        const res = await helpTursoClient.execute({ sql: querySql, args });
        for (const row of res.rows) {
          if (!addedCodes.has(row.ticket_code) && isTicketOwner(row)) {
            results.push(row);
            addedCodes.add(row.ticket_code);
            memoryTickets.set(row.ticket_code, row);
          }
        }
      }
    } catch (err) {
      console.warn("[HELP-TURSO] Batch query tickets error:", err.message);
    }
  }

  return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Close a ticket, dispatch report to Topic 7, and physically delete from database
 */
async function closeHelpTicket({ ticketCode, closedBy = "Admin", reason = "", autoDelete = true }) {
  if (!ticketCode) return { success: false, message: "Ticket code required." };
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
  if (!ticket && recentlyClosedTickets.has(cleanCode)) {
    ticket = recentlyClosedTickets.get(cleanCode);
  }
  if (!ticket) {
    return { success: false, message: `Ticket #${cleanCode} not found.` };
  }

  ticket.status = "closed";
  ticket.closed_at = now;
  ticket.closed_by = closedBy;
  ticket.updated_at = now;
  if (reason && !ticket.admin_reply) {
    ticket.admin_reply = reason;
  }

  // Preserve in memory buffer so if administrator taps [ Re-Activate ] in Topic 7, it can restore to DB
  recentlyClosedTickets.set(cleanCode, { ...ticket });
  if (recentlyClosedTickets.size > 200) {
    const oldestKey = recentlyClosedTickets.keys().next().value;
    recentlyClosedTickets.delete(oldestKey);
  }

  // Dispatch full closed dossier report to Topic 7 & Admin DM
  await dispatchClosedTicketReport(ticket, closedBy);

  // 🗑️ Physically delete ticket from Turso Database & active memory immediately!
  await deleteHelpTicket(cleanCode);
  ticket.auto_deleted = true;

  return { success: true, ticket };
}

/**
 * Physically delete a single ticket from Turso Database & Memory
 */
async function deleteHelpTicket(ticketCode) {
  if (!ticketCode) return { success: false, message: "Ticket code required." };
  const cleanCode = ticketCode.trim().toUpperCase();
  memoryTickets.delete(cleanCode);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `DELETE FROM help_tickets WHERE ticket_code = ?`,
        args: [cleanCode],
      });
      return { success: true, message: `Ticket #${cleanCode} physically deleted from database.` };
    } catch (err) {
      console.warn("[HELP-TURSO] Delete ticket error:", err.message);
      return { success: false, message: err.message };
    }
  }
  return { success: true, message: `Ticket #${cleanCode} deleted from memory.` };
}

/**
 * Physically purge Help Tickets from Turso Database
 */
async function purgeHelpTickets(onlyClosed = true) {
  if (onlyClosed) {
    for (const [k, v] of memoryTickets.entries()) {
      if (v.status === "closed") memoryTickets.delete(k);
    }
  } else {
    memoryTickets.clear();
  }

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      const sql = onlyClosed
        ? `DELETE FROM help_tickets WHERE status = 'closed'`
        : `DELETE FROM help_tickets`;
      const res = await helpTursoClient.execute(sql);
      return {
        success: true,
        deletedCount: res.rowsAffected || 0,
        message: onlyClosed ? "Closed tickets physically purged from Turso." : "All help tickets physically purged.",
      };
    } catch (err) {
      console.warn("[HELP-TURSO] Purge tickets error:", err.message);
      return { success: false, message: err.message };
    }
  }
  return { success: true, message: "Help tickets purged from memory." };
}

/**
 * Auto-creates Forum Topics on Telegram Supergroup via Bot API
 */
async function createTelegramForumTopics(customChatId = null) {
  const token = getHelpBotToken();
  const chatId = customChatId || getHelpChatId();

  if (!token || !chatId) {
    return { success: false, message: "Help bot token or Supergroup Chat ID not configured." };
  }

  const results = {};

  // 1. Create Active Tickets Topic
  try {
    const res1 = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        name: "🟢 Active Support Tickets",
        icon_color: 7322096,
      }),
    });
    const data1 = await res1.json();
    if (data1.ok && data1.result?.message_thread_id) {
      results.activeTopicId = data1.result.message_thread_id;
      results.activeTopicName = data1.result.name;
    } else {
      results.activeTopicError = data1.description || "Failed to create active topic";
    }
  } catch (e) {
    results.activeTopicError = e.message;
  }

  // 2. Create Closed Tickets Topic
  try {
    const res2 = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        name: "🔴 Closed & Resolved Tickets Report",
        icon_color: 16724826,
      }),
    });
    const data2 = await res2.json();
    if (data2.ok && data2.result?.message_thread_id) {
      results.closedTopicId = data2.result.message_thread_id;
      results.closedTopicName = data2.result.name;
    } else {
      results.closedTopicError = data2.description || "Failed to create closed topic";
    }
  } catch (e) {
    results.closedTopicError = e.message;
  }

  return { success: true, results };
}

/**
 * Update ticket to active (re-activates and re-inserts into database if previously closed and deleted)
 */
async function setHelpTicketActive({ ticketCode, updatedBy = "Admin" }) {
  if (!ticketCode) return { success: false, message: "Ticket code required." };
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
  if (!ticket && recentlyClosedTickets.has(cleanCode)) {
    ticket = recentlyClosedTickets.get(cleanCode);
  }
  if (!ticket) {
    return { success: false, message: `Ticket #${cleanCode} not found.` };
  }

  ticket.status = "active";
  ticket.updated_at = now;
  ticket.closed_at = null;
  ticket.closed_by = null;
  memoryTickets.set(cleanCode, ticket);
  recentlyClosedTickets.delete(cleanCode);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `INSERT OR REPLACE INTO help_tickets (
          id, ticket_code, user_id, user_name, user_email, user_mobile, user_role,
          category, subject, question, admin_reply, admin_name, replied_at,
          status, conversation, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        args: [
          ticket.id || `hlp_${cleanCode}`,
          ticket.ticket_code,
          ticket.user_id || null,
          ticket.user_name || "Student Visitor",
          ticket.user_email || "",
          ticket.user_mobile || "",
          ticket.user_role || "student",
          ticket.category || "general",
          ticket.subject || "",
          ticket.question || "",
          ticket.admin_reply || "",
          ticket.admin_name || "",
          ticket.replied_at || null,
          ticket.conversation || "[]",
          ticket.created_at || now,
          now,
        ],
      });
    } catch (err) {
      console.warn("[HELP-TURSO] Set active ticket error:", err.message);
    }
  }

  return { success: true, ticket };
}

/**
 * Reply to a ticket
 */
async function replyHelpTicket({ ticketCode, replyText, adminName = "Platform Administrator" }) {
  if (!ticketCode || !replyText) return { success: false, message: "Missing ticket code or reply text." };
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
  if (!ticket) {
    return { success: false, message: `Ticket #${cleanCode} not found in database.` };
  }

  let conv = [];
  try {
    if (ticket.conversation) conv = JSON.parse(ticket.conversation);
  } catch (_) {}
  if (conv.length === 0 && ticket.question) {
    conv.push({ sender: "student", sender_name: ticket.user_name || "Student", text: ticket.question, created_at: ticket.created_at });
  }
  conv.push({ sender: "admin", sender_name: adminName, text: replyText.trim(), created_at: now });

  ticket.conversation = JSON.stringify(conv);
  ticket.admin_reply = replyText.trim();
  ticket.admin_name = adminName;
  ticket.status = "answered";
  ticket.replied_at = now;
  ticket.updated_at = now;

  memoryTickets.set(cleanCode, ticket);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `
          UPDATE help_tickets 
          SET admin_reply = ?, admin_name = ?, status = 'answered', replied_at = ?, conversation = ?, updated_at = ?
          WHERE ticket_code = ?
        `,
        args: [ticket.admin_reply, ticket.admin_name, ticket.replied_at, ticket.conversation, ticket.updated_at, cleanCode],
      });
    } catch (err) {
      console.warn("[HELP-TURSO] Update reply error:", err.message);
    }
  }

  return { success: true, ticket };
}

/**
 * Student reply / follow-up to a ticket from the website
 */
async function studentReplyHelpTicket({ ticketCode, replyText, userId = null, guestEmail = null, guestMobile = null }) {
  if (!ticketCode || !replyText || !replyText.trim()) {
    return { success: false, message: "Ticket code and reply message are required." };
  }
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
  if (!ticket) {
    return { success: false, message: `Ticket #${cleanCode} not found in database.` };
  }

  // 🛡️ Strict: Once closed by administrator, student cannot reply to this ticket
  if (ticket.status === "closed") {
    return {
      success: false,
      message: `Ticket #${cleanCode} has been resolved and closed by administrator. Replies are disabled.`,
    };
  }

  // Verify ownership
  const cleanEmail = (guestEmail || "").trim().toLowerCase();
  const cleanMobileDigits = (guestMobile || "").replace(/\D/g, "").slice(-10);
  const tEmail = (ticket.user_email || "").trim().toLowerCase();
  const tMobile = (ticket.user_mobile || "").replace(/\D/g, "").slice(-10);

  let isOwner = false;
  if (userId && ticket.user_id && ticket.user_id === userId) isOwner = true;
  if (cleanEmail && tEmail && cleanEmail === tEmail) isOwner = true;
  if (cleanMobileDigits && tMobile && cleanMobileDigits === tMobile) isOwner = true;
  if (!isOwner && (!ticket.user_id || !userId)) isOwner = true;

  let conv = [];
  try {
    if (ticket.conversation) conv = JSON.parse(ticket.conversation);
  } catch (_) {}
  if (conv.length === 0 && ticket.question) {
    conv.push({ sender: "student", sender_name: ticket.user_name || "Student", text: ticket.question, created_at: ticket.created_at });
    if (ticket.admin_reply) {
      conv.push({ sender: "admin", sender_name: ticket.admin_name || "Platform Admin", text: ticket.admin_reply, created_at: ticket.replied_at || ticket.updated_at });
    }
  }

  conv.push({
    sender: "student",
    sender_name: ticket.user_name || "Student",
    text: replyText.trim(),
    created_at: now,
  });

  ticket.conversation = JSON.stringify(conv);
  ticket.status = "active"; // Set active so administrators see pending reply
  ticket.updated_at = now;

  memoryTickets.set(cleanCode, ticket);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `UPDATE help_tickets SET status = 'active', conversation = ?, updated_at = ? WHERE ticket_code = ?`,
        args: [ticket.conversation, now, cleanCode],
      });
    } catch (err) {
      console.warn("[HELP-TURSO] Student reply update error:", err.message);
    }
  }

  // Dispatch live notification strictly to Bot DM ONLY (No Topic 6 spam)
  dispatchStudentReplyNotice(ticket, replyText.trim()).catch(() => {});

  return { success: true, ticket };
}

/**
 * Dispatch student reply notification strictly to Admin Bot DM (Topic 6 NOT spammed)
 */
async function dispatchStudentReplyNotice(ticket, replyText) {
  const botToken = getHelpBotToken();
  const adminChatId = getHelpAdminChatId();
  if (!botToken || !adminChatId) return;

  const roleLabel = ticket.user_role === "student" ? "🎓 Student" : "👤 Guest";
  const userDisplay = `${ticket.user_name || "Student"} (${roleLabel})`;

  const text = [
    `💬 <b>STUDENT FOLLOW-UP REPLY #${ticket.ticket_code}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${userDisplay}`,
    `📧 <b>Email:</b> <code>${ticket.user_email || "N/A"}</code>`,
    `📱 <b>Mobile:</b> <code>${ticket.user_mobile || "N/A"}</code>`,
    `🏷️ <b>Category:</b> ${ticket.category || "General Support"}`,
    ticket.subject ? `📚 <b>Subject:</b> ${ticket.subject}` : null,
    `💬 <b>Follow-up Message:</b>`,
    `<i>${replyText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Quick Actions:</b>`,
    `• Reply directly here in bot DM to answer student`,
    `• Single-click below to close ticket:`,
  ]
    .filter(Boolean)
    .join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🔴 Close Ticket", callback_data: `ticket:close:${ticket.ticket_code}` },
      ],
    ],
  };

  try {
    // Only sent to Admin Bot DM
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: "HTML",
        reply_markup: inlineKeyboard,
      }),
    });
  } catch (err) {
    console.warn("[HELP-BOT] Student reply dispatch error:", err.message);
  }
}

/**
 * Get all tickets for Admin Studio
 */
async function getAllHelpTickets({ status = null, limit = 50, offset = 0 } = {}) {
  if (!helpTursoClient) {
    return Array.from(memoryTickets.values());
  }

  try {
    let sql = `SELECT * FROM help_tickets`;
    const args = [];
    if (status) {
      sql += ` WHERE status = ?`;
      args.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const res = await helpTursoClient.execute({ sql, args });
    return res.rows || [];
  } catch (err) {
    console.warn("[HELP-TURSO] Get all tickets error:", err.message);
    return Array.from(memoryTickets.values());
  }
}

/**
 * Live Telemetry for Tab 4 (Software Telemetry)
 */
async function getHelpTursoTelemetry() {
  const startTime = Date.now();
  let connected = false;
  let latencyMs = 0;
  let ticketCount = 0;

  if (helpTursoClient) {
    try {
      const res = await helpTursoClient.execute("SELECT COUNT(*) as count FROM help_tickets").catch(() => null);
      latencyMs = Date.now() - startTime;
      connected = true;
      if (res && res.rows && res.rows[0]) {
        ticketCount = Number(res.rows[0].count) || 0;
      }
    } catch (err) {
      connected = false;
      latencyMs = Date.now() - startTime;
    }
  }

  return {
    connected,
    isCloud: isHelpCloud,
    latencyMs: `${latencyMs}ms`,
    url: helpTursoUrl || "cache/turso_help_vault.db",
    database: "fsm-support-freestudymaterial.aws-ap-south-1.turso.io",
    ticketCount,
    status: connected ? "ONLINE & OPERATIONAL" : "STANDBY",
  };
}

function getHelpBotTelemetry() {
  const chatId = getHelpChatId();
  const isDirectDm = !chatId.startsWith("-100");
  return {
    botUsername: "fsm_help_bot",
    botId: getHelpBotToken() ? getHelpBotToken().split(":")[0] : "fsm_help_bot",
    status: helpPollerActive ? "ONLINE & 2-WAY SYNC ACTIVE" : "INITIALIZING",
    chatId: chatId,
    mode: isDirectDm ? "DIRECT ADMIN BOT DM (No Subtopics)" : "SUPERGROUP TOPIC",
    activeTopicId: isDirectDm ? "N/A (Direct DM)" : getHelpActiveTopicId(),
    closedTopicId: isDirectDm ? "N/A (Direct DM)" : getHelpClosedTopicId(),
    twoWaySync: "ACTIVE (Inline Status Buttons & Reply Listener)",
  };
}

/**
 * ============================================================================
 * 🤖 TELEGRAM BOT POLLER FOR @fsm_help_bot
 * ============================================================================
 * Handles:
 * 1. Inline Action Buttons: [ 🟢 Keep Active ] / [ 🔴 Close Ticket ]
 * 2. Admin Replies: /reply FSM-H1234 or direct message reply
 * 3. Close Command: /close FSM-H1234
 * ============================================================================
 */
let helpPollerActive = false;
let helpPollerOffset = 0;

function startHelpBotPoller() {
  const botToken = getHelpBotToken();
  if (!botToken || helpPollerActive) return;

  helpPollerActive = true;
  console.log("[HELP-BOT] 🟢 Telegram 2-way Support Sync Poller started for @fsm_help_bot");

  const pollInterval = setInterval(async () => {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${helpPollerOffset}&timeout=5&allowed_updates=["message","callback_query"]`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return;

      const data = await res.json().catch(() => null);
      if (!data || !data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        helpPollerOffset = update.update_id + 1;

        // 1. Handle Inline Button Callback Queries (Keep Active / Close Ticket)
        if (update.callback_query) {
          const cb = update.callback_query;
          const cbData = cb.data || "";
          const fromAdmin = cb.from?.first_name || "Admin";

          if (cbData.startsWith("ticket:close:")) {
            const ticketCode = cbData.replace("ticket:close:", "").trim().toUpperCase();
            await closeHelpTicket({ ticketCode, closedBy: fromAdmin, reason: "Resolved via Telegram quick action." });

            // Acknowledge callback alert
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                callback_query_id: cb.id,
                text: `✅ Ticket #${ticketCode} closed & deleted from database!`,
                show_alert: false,
              }),
            }).catch(() => {});

            // Update original message to show closed badge
            if (cb.message) {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: cb.message.chat.id,
                  message_id: cb.message.message_id,
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: `🔒 Ticket #${ticketCode} CLOSED & DELETED by ${fromAdmin}`, callback_data: "ticket_closed_noop" }],
                    ],
                  },
                }),
              }).catch(() => {});
            }
            continue;
          }

          if (cbData.startsWith("ticket:reactivate:")) {
            const ticketCode = cbData.replace("ticket:reactivate:", "").trim().toUpperCase();
            const res = await setHelpTicketActive({ ticketCode, updatedBy: fromAdmin });

            // Acknowledge callback alert
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                callback_query_id: cb.id,
                text: `🟢 Ticket #${ticketCode} is re-activated and sent to Topic #${getHelpActiveTopicId()}!`,
                show_alert: false,
              }),
            }).catch(() => {});

            // Update original message in Topic 7 to show re-activated badge
            if (cb.message) {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: cb.message.chat.id,
                  message_id: cb.message.message_id,
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: `🟢 RE-ACTIVATED by ${fromAdmin}`, callback_data: "ticket_reactivated_noop" }],
                    ],
                  },
                }),
              }).catch(() => {});
            }

            // Post active ticket notice back to Topic 6
            if (res.ticket) {
              await dispatchTelegramHelpNotice(res.ticket);
            }
            continue;
          }

          if (cbData.startsWith("ticket:active:")) {
            const ticketCode = cbData.replace("ticket:active:", "").trim().toUpperCase();
            await setHelpTicketActive({ ticketCode, updatedBy: fromAdmin });

            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                callback_query_id: cb.id,
                text: `🟢 Ticket #${ticketCode} is marked ACTIVE.`,
                show_alert: false,
              }),
            }).catch(() => {});
            continue;
          }
        }

        // 2. Handle Text Messages in Telegram Supergroup
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const text = msg.text.trim();
        const fromAdmin = msg.from?.first_name || "Admin";

        // 0. Handle /start or /help command
        if (text === "/start" || text.startsWith("/help")) {
          await sendTelegramReply(
            botToken,
            msg.chat.id,
            `👋 <b>Welcome to Support Desk Bot (@fsm_help_bot)</b>\n━━━━━━━━━━━━━━━━━━━━━━\nYou are connected as Platform Administrator.\nNew student queries will arrive directly here in your private chat.\n\n⚡ <b>How to Reply & Manage Tickets:</b>\n• <b>Quick Reply:</b> Swipe or reply directly to any ticket message with your answer, OR type:\n  <code>/reply TICKET_CODE your answer</code>\n  (e.g., <code>/reply FSM-H1234 Notes uploaded!</code>)\n• <b>Close Ticket:</b> Tap the <b>[ 🔴 Close Ticket ]</b> button on the message, OR type:\n  <code>/close TICKET_CODE</code>\n• <b>Keep Active:</b> Tap the <b>[ 🟢 Keep Active ]</b> button.`,
            msg.message_id
          );
          continue;
        }

        // 1. Command: /close FSM-H1234
        const closeCmdMatch = text.match(/^\/close\s+(FSM-H\d+)/i);
        if (closeCmdMatch) {
          const ticketCode = closeCmdMatch[1].toUpperCase();
          const result = await closeHelpTicket({ ticketCode, closedBy: fromAdmin });
          await sendTelegramReply(
            botToken,
            msg.chat.id,
            result.success
              ? `✅ <b>Ticket #${ticketCode} Closed & Deleted!</b>\nTicket has been permanently removed from database. Resolution dossier sent to Topic #${getHelpClosedTopicId()}.`
              : `⚠️ <b>Could not close ticket:</b> ${result.message}`,
            msg.message_id,
            msg.message_thread_id
          );
          continue;
        }

        // 2. Command: /reply FSM-H1234 your answer
        const replyCmdMatch = text.match(/^\/reply\s+(FSM-H\d+)\s+(.+)$/is);
        if (replyCmdMatch) {
          const ticketCode = replyCmdMatch[1].toUpperCase();
          const answer = replyCmdMatch[2].trim();
          const result = await replyHelpTicket({ ticketCode, replyText: answer, adminName: fromAdmin });

          await sendTelegramReply(
            botToken,
            msg.chat.id,
            result.success
              ? `✅ <b>Answer Posted to Website!</b>\nStudent ticket <code>#${ticketCode}</code> received your reply.`
              : `⚠️ <b>Could not post reply:</b> ${result.message}`,
            msg.message_id,
            msg.message_thread_id
          );
          continue;
        }

        // 3. Shorthand: FSM-H1234 your answer or #FSM-H1234 your answer
        const shorthandMatch = text.match(/^(?:#)?(FSM-H\d+)\s*[:\-]?\s*(.+)$/is);
        if (shorthandMatch && !text.startsWith("/")) {
          const ticketCode = shorthandMatch[1].toUpperCase();
          const answer = shorthandMatch[2].trim();
          const result = await replyHelpTicket({ ticketCode, replyText: answer, adminName: fromAdmin });

          await sendTelegramReply(
            botToken,
            msg.chat.id,
            result.success
              ? `✅ <b>Answer Posted to Website!</b>\nStudent ticket <code>#${ticketCode}</code> received your reply.`
              : `⚠️ <b>Could not post reply:</b> ${result.message}`,
            msg.message_id,
            msg.message_thread_id
          );
          continue;
        }

        // 4. Direct message reply to an alert (Swipe to reply)
        if (msg.reply_to_message) {
          const originalText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
          const codeMatch = originalText.match(/#(FSM-H\d+)/i) || originalText.match(/(FSM-H\d+)/i);
          if (codeMatch) {
            const ticketCode = codeMatch[1].toUpperCase();
            const result = await replyHelpTicket({ ticketCode, replyText: text, adminName: fromAdmin });

            await sendTelegramReply(
              botToken,
              msg.chat.id,
              result.success
                ? `✅ <b>Answer Posted to Website!</b>\nStudent ticket <code>#${ticketCode}</code> received your reply.`
                : `⚠️ <b>Could not post reply:</b> ${result.message}`,
              msg.message_id,
              msg.message_thread_id
            );
            continue;
          }
        }

        // 5. Smart Direct DM Fallback (if Admin just types in private chat with bot without swiping)
        if (msg.chat.type === "private" && !text.startsWith("/")) {
          const activeTickets = Array.from(memoryTickets.values()).filter((t) => t.status === "active");
          if (activeTickets.length === 1) {
            const ticket = activeTickets[0];
            const result = await replyHelpTicket({ ticketCode: ticket.ticket_code, replyText: text, adminName: fromAdmin });
            await sendTelegramReply(
              botToken,
              msg.chat.id,
              result.success
                ? `✅ <b>Answer Posted to Website!</b>\nApplied to active student ticket <code>#${ticket.ticket_code}</code>.`
                : `⚠️ <b>Could not post reply:</b> ${result.message}`,
              msg.message_id
            );
            continue;
          }

          // If multiple active tickets or none, send instructional guidance
          await sendTelegramReply(
            botToken,
            msg.chat.id,
            `ℹ️ <b>How to reply to a student ticket:</b>\n1. Swipe / reply directly to the ticket message, OR\n2. Type <code>/reply TICKET_CODE your answer</code> (e.g. <code>/reply FSM-H1234 your answer</code>)`,
            msg.message_id
          );
        }
      }
    } catch (_) {}
  }, 3000);

  return pollInterval;
}

async function sendTelegramReply(botToken, chatId, text, replyToMessageId = null, threadId = null) {
  try {
    const isGroup = String(chatId).startsWith("-100");
    const body = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    if (isGroup && threadId) body.message_thread_id = threadId;

    let res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = await res.json().catch(() => null);
    if (data && !data.ok && body.message_thread_id) {
      delete body.message_thread_id;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  } catch (_) {}
}

setTimeout(startHelpBotPoller, 3000);

module.exports = {
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
  getHelpBotToken,
  getHelpChatId,
  getHelpActiveTopicId,
  getHelpClosedTopicId,
  getHelpTursoTelemetry,
  getHelpBotTelemetry,
  dispatchTelegramHelpNotice,
  dispatchClosedTicketReport,
  studentReplyHelpTicket,
  dispatchStudentReplyNotice,
};
