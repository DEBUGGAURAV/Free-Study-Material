const TelegramBot = require("node-telegram-bot-api");

let bot = null;
const token = process.env.TELEGRAM_BOT_TOKEN;

if (token && token.trim() !== "") {
  try {
    bot = new TelegramBot(token, { polling: false });
    console.log("[TELEGRAM BOT] Bot client initialized.");
  } catch (err) {
    console.error("[TELEGRAM BOT] Initialization error:", err.message);
  }
} else {
  console.warn("[TELEGRAM BOT] Token not set. Creating safe mock wrapper.");
}

// Resilient proxy wrapper: prevents server crashes if bot method called when token not available
const safeBot = new Proxy(bot || {}, {
  get(target, prop) {
    if (prop in target) {
      return typeof target[prop] === "function" ? target[prop].bind(target) : target[prop];
    }
    return async (...args) => {
      console.warn(`[TELEGRAM BOT] Mocking call to '${prop}' (Token not configured).`);
      return { message_id: Math.floor(Math.random() * 100000) };
    };
  },
});

module.exports = safeBot;

