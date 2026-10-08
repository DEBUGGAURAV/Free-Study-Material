const TelegramBot = require("node-telegram-bot-api");
const { db } = require("../firebase");

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

// Helper: Auto-sync any document posted directly in Telegram into Firestore
async function syncTelegramDocument(msg) {
  if (!msg || !msg.document) return;

  const doc = msg.document;
  const fileId = doc.file_id;
  const fileName = doc.file_name || "Telegram_Document.pdf";
  const fileSize = doc.file_size || 0;
  const caption = (msg.caption || "").trim();

  // Prevent duplicate insertion if note with same fileId already exists
  try {
    const existing = await db.collection("notes").where("telegramFileId", "==", fileId).limit(1).get();
    if (!existing.empty) {
      console.log(`[Telegram Auto-Sync] Note with fileId ${fileId} already exists in DB.`);
      return;
    }
  } catch (err) {
    console.warn("[Telegram Auto-Sync] Duplicate check error:", err.message);
  }

  // Derive title from caption or filename
  const cleanTitle = caption || fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  // Intelligent Subject & Year Detection
  let subject = "General Engineering";
  let year = "1st year";

  const lowerText = `${fileName} ${caption}`.toLowerCase();

  // Check explicit subject in caption (e.g. "Subject: Operating Systems" or "Sub: DBMS")
  const explicitSubMatch = caption.match(/(?:subject|sub|course):\s*([^\n\r,]+)/i);
  if (explicitSubMatch && explicitSubMatch[1]) {
    subject = explicitSubMatch[1].trim();
  } else if (lowerText.includes("cc") || lowerText.includes("cloud")) {
    subject = "Cloud Computing (CC)";
  } else if (lowerText.includes("cns") || lowerText.includes("crypto") || lowerText.includes("security") || lowerText.includes("cyber")) {
    subject = "Cryptography (CNS)";
  } else if (lowerText.includes("ai") || lowerText.includes("intelligence")) {
    subject = "Artificial Intelligence (AI)";
  } else if (lowerText.includes("deep") || lowerText.includes("dl") || lowerText.includes("neural")) {
    subject = "Deep Learning";
  } else if (lowerText.includes("dsa") || lowerText.includes("data struct") || lowerText.includes("algorithm")) {
    subject = "Data Structures & Algorithms";
  } else if (lowerText.includes("dbms") || lowerText.includes("database") || lowerText.includes("sql")) {
    subject = "Database Management (DBMS)";
  } else if (lowerText.includes("os") || lowerText.includes("operating system") || lowerText.includes("linux")) {
    subject = "Operating Systems (OS)";
  } else if (lowerText.includes("cn") || lowerText.includes("network") || lowerText.includes("tcp")) {
    subject = "Computer Networks (CN)";
  } else if (lowerText.includes("math") || lowerText.includes("calculus") || lowerText.includes("discrete")) {
    subject = "Engineering Mathematics";
  } else if (lowerText.includes("web") || lowerText.includes("html") || lowerText.includes("react") || lowerText.includes("javascript")) {
    subject = "Web Development";
  } else if (lowerText.includes("python")) {
    subject = "Python Programming";
  } else if (lowerText.includes("java")) {
    subject = "Java Programming";
  }

  // Year Detection
  if (lowerText.includes("1st") || lowerText.includes("1 year") || lowerText.includes("first") || lowerText.includes("sem 1") || lowerText.includes("sem 2")) {
    year = "1st year";
  } else if (lowerText.includes("2nd") || lowerText.includes("2 year") || lowerText.includes("second") || lowerText.includes("sem 3") || lowerText.includes("sem 4")) {
    year = "2nd year";
  } else if (lowerText.includes("3rd") || lowerText.includes("3 year") || lowerText.includes("third") || lowerText.includes("sem 5") || lowerText.includes("sem 6")) {
    year = "3rd year";
  } else if (lowerText.includes("4th") || lowerText.includes("4 year") || lowerText.includes("final") || lowerText.includes("sem 7") || lowerText.includes("sem 8")) {
    year = "4th year";
  }

  // Auto-find or create the corresponding subject folder in Firestore
  let folderId = "";
  try {
    const folderSnap = await db.collection("folders")
      .where("subject", "==", subject)
      .limit(1)
      .get();

    if (!folderSnap.empty) {
      folderId = folderSnap.docs[0].id;
      const folderData = folderSnap.docs[0].data();
      if (folderData.year && !lowerText.includes("year") && !lowerText.includes("sem") && !lowerText.includes("1st") && !lowerText.includes("2nd") && !lowerText.includes("3rd") && !lowerText.includes("4th")) {
        year = folderData.year;
      }
      console.log(`[Telegram Auto-Sync] 📁 Matched existing folder "${subject}" (${year}) (ID: ${folderId})`);
    } else {
      const newFolder = await db.collection("folders").add({
        subject,
        year,
        createdAt: new Date().toISOString()
      });
      folderId = newFolder.id;
      console.log(`[Telegram Auto-Sync] 📁 Auto-created subject folder "${subject}" for ${year} (ID: ${folderId})`);
    }
  } catch (fErr) {
    console.warn("[Telegram Auto-Sync] Folder lookup/create error:", fErr.message);
  }

  const noteDoc = {
    title: cleanTitle,
    subject,
    folderId,
    year,
    branch: "CSE",
    semester: 1,
    telegramChatId: String(msg.chat.id),
    telegramThreadId: String(msg.message_thread_id || ""),
    telegramMessageId: msg.message_id,
    telegramFileId: fileId,
    fileName,
    fileSize,
    downloadCount: 0,
    downloads: 0,
    visibility: "public",
    visible: true,
    uploadedBy: "telegram_direct",
    uploadedByName: msg.from?.first_name ? `${msg.from.first_name} (via Telegram)` : "Telegram Storage",
    uploadedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  try {
    const docRef = await db.collection("notes").add(noteDoc);
    console.log(`[Telegram Auto-Sync] ✅ Successfully indexed note "${cleanTitle}" (ID: ${docRef.id}) from Telegram`);

    // Reply confirmation back in Telegram
    const options = {
      reply_to_message_id: msg.message_id,
      parse_mode: "Markdown"
    };
    if (msg.message_thread_id) {
      options.message_thread_id = msg.message_thread_id;
    }

    await bot.sendMessage(
      msg.chat.id,
      `✅ *Note Synced to FreeStudyMaterial Web!*\n\n` +
      `📄 *Title:* ${cleanTitle}\n` +
      `📚 *Subject:* ${subject} • ${year}\n` +
      `💾 *Size:* ${(fileSize / (1024 * 1024)).toFixed(2)} MB\n\n` +
      `🌐 *Status:* Live on website catalog now!`,
      options
    );
  } catch (err) {
    console.error("[Telegram Auto-Sync] Error saving note to Firestore:", err);
  }
}

// Log every incoming message & sync documents
bot.on("message", (msg) => {
  console.log(`[Telegram Log] From: ${msg.from?.first_name || "User"} | Chat: ${msg.chat.id} | Thread: ${msg.message_thread_id || "General"} | Text: ${msg.text || "(Media)"}`);
  if (msg.document) {
    syncTelegramDocument(msg);
  }
});

// Also handle channel posts (if bot is in a broadcast channel)
bot.on("channel_post", (post) => {
  console.log(`[Telegram Channel Post] Chat: ${post.chat.id} | Text: ${post.text || "(Media)"}`);
  if (post.document) {
    syncTelegramDocument(post);
  }
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
      "🤖 FreeStudyMaterial Notes Storage Bot is running and connected to Web Platform!\n\nSend any PDF or document here to sync it to the website automatically.",
      options
    );
    console.log(`[Bot Replied /start] to Chat ID: ${msg.chat.id}`);
  } catch (err) {
    console.error("Error sending /start reply:", err.message);
  }
});

// Match /id or /id@YourBotUsername
bot.onText(/^\/id(@\S+)?/i, async (msg) => {
  try {
    const threadId = msg.message_thread_id || "General Topic";
    const text =
      `📋 *FreeStudyMaterial Storage Details*\n\n` +
      `• *Chat ID:* \`${msg.chat.id}\`\n` +
      `• *Message ID:* \`${msg.message_id}\`\n` +
      `• *Thread ID:* \`${threadId}\`\n` +
      `• *Chat Title:* ${msg.chat.title || "Direct Message"}\n\n` +
      `✅ Auto-sync to Web is active. Drop any file to publish to web!`;

    const options = {
      parse_mode: "Markdown"
    };

    if (msg.message_thread_id) {
      options.message_thread_id = msg.message_thread_id;
    }

    await bot.sendMessage(msg.chat.id, text, options);
  } catch (err) {
    console.error("Error sending /id reply:", err.message);
  }
});

console.log("Telegram bot started with Two-Way Web Sync");

module.exports = bot;
