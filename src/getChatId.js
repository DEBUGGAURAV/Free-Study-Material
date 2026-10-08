require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is missing in your .env file!");
  console.error("Please add TELEGRAM_BOT_TOKEN=your_token_from_botfather to your .env file.");
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: true,
});

console.log("=========================================");
console.log(" Free Study Material Telegram ID Helper is running");
console.log(" Send a message in your group or topic! ");
console.log("=========================================");

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

bot.on("message", (msg) => {
  console.log("\n--- New Telegram Message Received ---");
  console.log("Chat ID:        ", msg.chat.id);
  console.log("Chat Title:     ", msg.chat.title || "(Private Chat)");
  console.log("Message ID:     ", msg.message_id);
  console.log("Thread ID:      ", msg.message_thread_id || "(General Topic)");
  console.log("From:           ", msg.from?.username || msg.from?.first_name || "Unknown");
  console.log("Text:           ", msg.text || "(Media/Document)");
  console.log("--------------------------------------\n");
});

