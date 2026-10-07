const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is missing");
}

const bot = new TelegramBot(token, {
  polling: true
});

bot.on("polling_error", (error) => {
  console.error("Telegram polling error:", error.message);
});

// Log every incoming message so you can see live activity
bot.on("message", (msg) => {
  console.log(`[Telegram Log] From: ${msg.from?.first_name || "User"} | Chat: ${msg.chat.id} | Thread: ${msg.message_thread_id || "General"} | Text: ${msg.text || "(Media)"}`);
});

// Match /start or /start@YourBotUsername
bot.onText(/^\/start(@\S+)?/i, async (msg) => {
  try {
    const options = {};
    if (msg.message_thread_id) {
      options.message_thread_id = msg.message_thread_id;
    }
    await bot.sendMessage(
      msg.chat.id,
      "🤖 Tech Titan Notes Storage Bot is running and ready!",
      options
    );
    console.log(`[Bot Replied /start] to Chat ID: ${msg.chat.id}, Thread ID: ${msg.message_thread_id || "General"}`);
  } catch (err) {
    console.error("Error sending /start reply:", err.message);
  }
});

// Match /id or /id@YourBotUsername with or without trailing text
bot.onText(/^\/id(@\S+)?/i, async (msg) => {
  try {
    const threadId = msg.message_thread_id || "General Topic";
    const text =
      `📋 *Tech Titan Storage Details*\n\n` +
      `• *Chat ID:* \`${msg.chat.id}\`\n` +
      `• *Message ID:* \`${msg.message_id}\`\n` +
      `• *Thread ID:* \`${threadId}\`\n` +
      `• *Chat Title:* ${msg.chat.title || "Direct Message"}`;

    const options = {
      parse_mode: "Markdown"
    };

    if (msg.message_thread_id) {
      options.message_thread_id = msg.message_thread_id;
    }

    await bot.sendMessage(msg.chat.id, text, options);
    console.log(`[Bot Replied /id] Chat ID: ${msg.chat.id}, Thread ID: ${threadId}`);
  } catch (err) {
    console.error("Error sending /id reply:", err.message);
  }
});

console.log("Telegram bot started");

module.exports = bot;
