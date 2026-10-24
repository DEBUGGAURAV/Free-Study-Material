/**
 * ============================================================================
 * 🌟 SMART HELP & TICKET SERVICE (WITH 2-WAY TELEGRAM SYNC)
 * ============================================================================
 * - Supports both Registered Students & Guest Visitors (0ms latency)
 * - Unique Ticket Code generation (e.g., FSM-H7421)
 * - Persistent Storage in Turso Edge Cloud / SQLite
 * - Instant Telegram Alert with Direct Reply Capture
 * - Admin can reply from Telegram (message reply or /reply command) or Web
 * ============================================================================
 */

const crypto = require("crypto");
const { tursoClient } = require("./tursoService");

// Fallback in-memory cache to guarantee 0ms instant availability
const memoryTickets = new Map();

function getHelpBotToken() {
  return (
    process.env.HELP_BOT_TOKEN ||
    process.env.TELEGRAM_HELP_BOT_TOKEN ||
    process.env.TELEGRAM_CHAT_AUDIT_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    ""
  ).trim();
}

function getHelpChatId() {
  return (
    process.env.HELP_CHAT_ID ||
    process.env.TELEGRAM_HELP_CHAT_ID ||
    process.env.TELEGRAM_CHAT_AUDIT_SUPERGROUP_ID ||
    process.env.TELEGRAM_OTP_CHAT_ID ||
    process.env.TELEGRAM_STORAGE_CHAT_ID ||
    ""
  ).trim();
}

function getHelpTopicId() {
  const topic = process.env.HELP_TOPIC_ID || process.env.TELEGRAM_HELP_TOPIC_ID;
  return topic ? parseInt(topic, 10) : null;
}

/**
 * Initialize Turso table for help tickets
 */
async function initHelpTable() {
  if (!tursoClient) return;
  try {
    await tursoClient.execute(`
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
        status TEXT DEFAULT 'pending',
        admin_reply TEXT,
        admin_name TEXT,
        replied_at TEXT,
        ip_address TEXT,
        telegram_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await tursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_code ON help_tickets(ticket_code);`).catch(() => {});
    await tursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_help_status ON help_tickets(status);`).catch(() => {});
    console.log("[HELP-DESK] 🟢 Turso help_tickets table verified.");
  } catch (err) {
    console.warn("[HELP-DESK] Table init warning:", err.message);
  }
}

let tableInitPromise = null;
function ensureHelpTable() {
  if (!tableInitPromise) {
    tableInitPromise = initHelpTable();
  }
  return tableInitPromise;
}

// Ensure table initializes immediately
ensureHelpTable().catch(() => {});

/**
 * Generate unique ticket code: FSM-H + 4 random digits
 */
function generateTicketCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FSM-H${rand}`;
}

/**
 * Dispatch Telegram Alert to Support Topic / Group
 */
async function dispatchTelegramHelpNotice(ticket) {
  const botToken = getHelpBotToken();
  const chatId = getHelpChatId();
  if (!botToken || !chatId) {
    console.warn("[HELP-DESK] Telegram bot token or chat ID not set. Skipping Telegram notification.");
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
    ticket.subject ? `📚 <b>Subject/Note:</b> ${ticket.subject}` : null,
    `❓ <b>Question:</b>`,
    `<i>${ticket.question.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👉 <b>Direct Telegram Reply:</b>`,
    `Just reply to this message directly, or type:`,
    `<code>/reply ${ticket.ticket_code} your answer here</code>`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };

    const topicId = getHelpTopicId();
    if (topicId) {
      payload.message_thread_id = topicId;
    }

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
    console.warn("[HELP-DESK] Telegram dispatch notice:", err.message);
  }
  return null;
}

/**
 * Create a new help ticket
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
    status: "pending",
    admin_reply: null,
    admin_name: null,
    replied_at: null,
    ip_address: ip,
    telegram_message_id: null,
    created_at: now,
    updated_at: now,
  };

  // Cache in memory
  memoryTickets.set(ticketCode, ticketObj);

  // Dispatch to Telegram in background
  dispatchTelegramHelpNotice(ticketObj)
    .then(async (msgId) => {
      if (msgId) {
        ticketObj.telegram_message_id = msgId;
        if (tursoClient) {
          await tursoClient
            .execute({
              sql: `UPDATE help_tickets SET telegram_message_id = ? WHERE ticket_code = ?`,
              args: [msgId, ticketCode],
            })
            .catch(() => {});
        }
      }
    })
    .catch(() => {});

  // Persist to Turso
  if (tursoClient) {
    try {
      await ensureHelpTable();
      await tursoClient.execute({
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
      console.warn("[HELP-DESK] Turso insert warning:", dbErr.message);
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

  // Check memory first
  if (memoryTickets.has(cleanCode)) {
    return memoryTickets.get(cleanCode);
  }

  if (tursoClient) {
    try {
      await ensureHelpTable();
      const res = await tursoClient.execute({
        sql: `SELECT * FROM help_tickets WHERE ticket_code = ? LIMIT 1`,
        args: [cleanCode],
      });
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        memoryTickets.set(cleanCode, row);
        return row;
      }
    } catch (err) {
      console.warn("[HELP-DESK] Query ticket error:", err.message);
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

  // Check memory
  for (const code of validCodes) {
    if (memoryTickets.has(code)) {
      results.push(memoryTickets.get(code));
    }
  }

  if (tursoClient && (validCodes.length > 0 || userId)) {
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
        const res = await tursoClient.execute({ sql: querySql, args });
        const existingCodes = new Set(results.map((r) => r.ticket_code));
        for (const row of res.rows) {
          if (!existingCodes.has(row.ticket_code)) {
            results.push(row);
            memoryTickets.set(row.ticket_code, row);
          }
        }
      }
    } catch (err) {
      console.warn("[HELP-DESK] Batch query tickets error:", err.message);
    }
  }

  return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Reply to a ticket (from Telegram or Admin Web Studio)
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

  if (tursoClient) {
    try {
      await ensureHelpTable();
      await tursoClient.execute({
        sql: `
          UPDATE help_tickets 
          SET admin_reply = ?, admin_name = ?, status = 'answered', replied_at = ?, updated_at = ?
          WHERE ticket_code = ?
        `,
        args: [ticket.admin_reply, ticket.admin_name, ticket.replied_at, ticket.updated_at, cleanCode],
      });
    } catch (err) {
      console.warn("[HELP-DESK] Update reply error:", err.message);
    }
  }

  return { success: true, ticket };
}

/**
 * Get all tickets for Admin Studio
 */
async function getAllHelpTickets({ status = null, limit = 50, offset = 0 } = {}) {
  if (!tursoClient) {
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

    const res = await tursoClient.execute({ sql, args });
    return res.rows || [];
  } catch (err) {
    console.warn("[HELP-DESK] Get all tickets error:", err.message);
    return Array.from(memoryTickets.values());
  }
}

/**
 * ============================================================================
 * 🤖 TELEGRAM BOT POLLER FOR HELP DESK (2-WAY SYNC)
 * ============================================================================
 * Listens for Admin answers on Telegram and instantly updates website tickets!
 */
let helpPollerActive = false;
let helpPollerOffset = 0;

function startHelpBotPoller() {
  const botToken = getHelpBotToken();
  if (!botToken || helpPollerActive) return;

  helpPollerActive = true;
  console.log("[HELP-BOT] 🟢 Telegram 2-way Support Sync Poller started.");

  const pollInterval = setInterval(async () => {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${helpPollerOffset}&timeout=5&allowed_updates=["message"]`;
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return;

      const data = await res.json().catch(() => null);
      if (!data || !data.ok || !Array.isArray(data.result)) return;

      for (const update of data.result) {
        helpPollerOffset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const text = msg.text.trim();
        const fromAdmin = msg.from?.first_name || "Admin";

        // 1. Direct command: /reply FSM-H1234 your answer
        const replyCmdMatch = text.match(/^\/reply\s+(FSM-H\d+)\s+(.+)$/is);
        if (replyCmdMatch) {
          const ticketCode = replyCmdMatch[1].toUpperCase();
          const answer = replyCmdMatch[2].trim();
          const result = await replyHelpTicket({ ticketCode, replyText: answer, adminName: fromAdmin });

          // Send confirmation back to Telegram
          await sendTelegramReply(
            botToken,
            msg.chat.id,
            result.success
              ? `✅ <b>Answer Posted to Website!</b>\nStudent ticket <code>#${ticketCode}</code> has received your reply instantly.`
              : `⚠️ <b>Could not post reply:</b> ${result.message}`,
            msg.message_id
          );
          continue;
        }

        // 2. Direct message reply to a previous ticket notification
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
                ? `✅ <b>Answer Posted to Website!</b>\nStudent ticket <code>#${ticketCode}</code> has received your reply instantly.`
                : `⚠️ <b>Could not post reply:</b> ${result.message}`,
              msg.message_id
            );
          }
        }
      }
    } catch (err) {
      // Quiet poll catch
    }
  }, 3500);

  return pollInterval;
}

async function sendTelegramReply(botToken, chatId, text, replyToMessageId = null) {
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
    }
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

// Start poller after 3 seconds
setTimeout(startHelpBotPoller, 3000);

module.exports = {
  createHelpTicket,
  getTicketByCode,
  getTicketsByCodes,
  replyHelpTicket,
  getAllHelpTickets,
  getHelpBotToken,
  getHelpChatId,
};

