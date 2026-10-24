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
    ""
  ).trim();
}

// Supergroup Topic 1: Active Inquiries
function getHelpActiveTopicId() {
  const topic = process.env.HELP_TOPIC_ACTIVE_ID || process.env.HELP_TOPIC_ID || process.env.TELEGRAM_HELP_TOPIC_ID;
  return topic ? parseInt(topic, 10) : 1;
}

// Supergroup Topic 2: Closed Resolution Dossiers
function getHelpClosedTopicId() {
  const topic = process.env.HELP_TOPIC_CLOSED_ID || process.env.HELP_CLOSED_TOPIC_ID || "2";
  return topic ? parseInt(topic, 10) : 2;
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await helpTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_code ON help_tickets(ticket_code);`).catch(() => {});
    await helpTursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_status ON help_tickets(status);`).catch(() => {});
    console.log("[HELP-TURSO] ✅ Support help_tickets table ready.");
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
  const botToken = getHelpBotToken();
  const chatId = getHelpChatId();
  if (!botToken || !chatId) {
    console.warn("[HELP-BOT] Missing bot token or Supergroup chat ID.");
    return null;
  }

  const roleLabel = ticket.user_role === "student" ? "🎓 Registered Student" : "👤 Guest Visitor";
  const userDisplay = `${ticket.user_name || "Guest"} (${roleLabel})`;
  const emailDisplay = ticket.user_email || "Not Provided (Guest)";

  const text = [
    `📩 <b>NEW HELP DESK QUERY #${ticket.ticket_code}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Student:</b> ${userDisplay}`,
    `📧 <b>Email:</b> <code>${emailDisplay}</code>`,
    `🏷️ <b>Category:</b> ${ticket.category || "General Support"}`,
    ticket.subject ? `📚 <b>Subject:</b> ${ticket.subject}` : null,
    `❓ <b>Question:</b>`,
    `<i>${ticket.question.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ <b>Ticket Status Management:</b>`,
    `Tap below to toggle whether this ticket is <b>Active</b> or <b>Closed</b>:`,
  ]
    .filter(Boolean)
    .join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🟢 Keep Active", callback_data: `ticket:active:${ticket.ticket_code}` },
        { text: "🔴 Close Ticket", callback_data: `ticket:close:${ticket.ticket_code}` },
      ],
    ],
  };

  try {
    const payload = {
      chat_id: chatId,
      message_thread_id: getHelpActiveTopicId(),
      text,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard,
    };

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.ok && data.result?.message_id) {
      return String(data.result.message_id);
    }
  } catch (err) {
    console.warn("[HELP-BOT] Telegram dispatch error:", err.message);
  }
  return null;
}

/**
 * Dispatches Closed Ticket Resolution Dossier Report to Supergroup Closed Topic (Topic 2)
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
    `📁 <b>Storage Vault:</b> Dedicated Turso Support Cloud (Archived)`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: closedTopicId,
        text,
        parse_mode: "HTML",
      }),
    });
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
            id, ticket_code, user_id, user_name, user_email, user_role,
            category, subject, question, status, ip_address, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          ticketCode,
          userId,
          ticketObj.user_name,
          ticketObj.user_email,
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
 * Get multiple tickets by list of codes or userId
 */
async function getTicketsByCodes(ticketCodes = [], userId = null) {
  const results = [];
  const validCodes = (ticketCodes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => c.startsWith("FSM-H"));

  for (const code of validCodes) {
    if (memoryTickets.has(code)) {
      results.push(memoryTickets.get(code));
    }
  }

  if (helpTursoClient && (validCodes.length > 0 || userId)) {
    try {
      await ensureHelpTable();
      let querySql = "";
      let args = [];

      if (validCodes.length > 0 && userId) {
        const placeholders = validCodes.map(() => "?").join(",");
        querySql = `SELECT * FROM help_tickets WHERE ticket_code IN (${placeholders}) OR user_id = ? ORDER BY created_at DESC LIMIT 50`;
        args = [...validCodes, userId];
      } else if (validCodes.length > 0) {
        const placeholders = validCodes.map(() => "?").join(",");
        querySql = `SELECT * FROM help_tickets WHERE ticket_code IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`;
        args = validCodes;
      } else if (userId) {
        querySql = `SELECT * FROM help_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`;
        args = [userId];
      }

      if (querySql) {
        const res = await helpTursoClient.execute({ sql: querySql, args });
        const existingCodes = new Set(results.map((r) => r.ticket_code));
        for (const row of res.rows) {
          if (!existingCodes.has(row.ticket_code)) {
            results.push(row);
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
 * Close a ticket and dispatch report to Topic 2
 */
async function closeHelpTicket({ ticketCode, closedBy = "Admin", reason = "", autoDelete = false }) {
  if (!ticketCode) return { success: false, message: "Ticket code required." };
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
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

  memoryTickets.set(cleanCode, ticket);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `UPDATE help_tickets SET status = 'closed', closed_at = ?, closed_by = ?, updated_at = ? WHERE ticket_code = ?`,
        args: [now, closedBy, now, cleanCode],
      });
    } catch (err) {
      console.warn("[HELP-TURSO] Close ticket error:", err.message);
    }
  }

  // Dispatch full closed dossier report to Topic 2
  await dispatchClosedTicketReport(ticket, closedBy);

  // Automatic Data Delete after report send (if requested)
  if (autoDelete) {
    await deleteHelpTicket(cleanCode);
    ticket.auto_deleted = true;
  }

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
 * Update ticket to active
 */
async function setHelpTicketActive({ ticketCode, updatedBy = "Admin" }) {
  if (!ticketCode) return { success: false, message: "Ticket code required." };
  const cleanCode = ticketCode.trim().toUpperCase();
  const now = new Date().toISOString();

  let ticket = await getTicketByCode(cleanCode);
  if (!ticket) {
    return { success: false, message: `Ticket #${cleanCode} not found.` };
  }

  ticket.status = "active";
  ticket.updated_at = now;
  memoryTickets.set(cleanCode, ticket);

  if (helpTursoClient) {
    try {
      await ensureHelpTable();
      await helpTursoClient.execute({
        sql: `UPDATE help_tickets SET status = 'active', updated_at = ? WHERE ticket_code = ?`,
        args: [now, cleanCode],
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
          SET admin_reply = ?, admin_name = ?, status = 'answered', replied_at = ?, updated_at = ?
          WHERE ticket_code = ?
        `,
        args: [ticket.admin_reply, ticket.admin_name, ticket.replied_at, ticket.updated_at, cleanCode],
      });
    } catch (err) {
      console.warn("[HELP-TURSO] Update reply error:", err.message);
    }
  }

  return { success: true, ticket };
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
  return {
    botUsername: "fsm_help_bot",
    botId: getHelpBotToken() ? getHelpBotToken().split(":")[0] : "fsm_help_bot",
    status: helpPollerActive ? "ONLINE & 2-WAY SYNC ACTIVE" : "INITIALIZING",
    chatId: getHelpChatId(),
    activeTopicId: getHelpActiveTopicId(),
    closedTopicId: getHelpClosedTopicId(),
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
                text: `✅ Ticket #${ticketCode} closed & archived to Topic 2!`,
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
                      [{ text: `🔒 Ticket #${ticketCode} CLOSED by ${fromAdmin}`, callback_data: "ticket_closed_noop" }],
                    ],
                  },
                }),
              }).catch(() => {});
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

        // Command: /close FSM-H1234
        const closeCmdMatch = text.match(/^\/close\s+(FSM-H\d+)/i);
        if (closeCmdMatch) {
          const ticketCode = closeCmdMatch[1].toUpperCase();
          const result = await closeHelpTicket({ ticketCode, closedBy: fromAdmin });
          await sendTelegramReply(
            botToken,
            msg.chat.id,
            result.success
              ? `✅ <b>Ticket #${ticketCode} Closed!</b>\nResolution dossier has been archived to Topic 2.`
              : `⚠️ <b>Could not close ticket:</b> ${result.message}`,
            msg.message_id,
            msg.message_thread_id
          );
          continue;
        }

        // Command: /reply FSM-H1234 your answer
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

        // Direct message reply to an alert
        if (msg.reply_to_message && msg.reply_to_message.text) {
          const originalText = msg.reply_to_message.text;
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
          }
        }
      }
    } catch (_) {}
  }, 3000);

  return pollInterval;
}

async function sendTelegramReply(botToken, chatId, text, replyToMessageId = null, threadId = null) {
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    if (threadId) body.message_thread_id = threadId;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
};
