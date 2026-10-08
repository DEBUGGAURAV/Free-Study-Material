const TelegramBot = require("node-telegram-bot-api");
const { db } = require("../firebase");

const token = process.env.TELEGRAM_BOT_TOKEN;

let bot;

if (!token) {
  console.warn("⚠️ [Telegram Bot] WARNING: TELEGRAM_BOT_TOKEN is missing in environment variables! Web server will start, but Telegram bot polling is paused until the token is added in Render Dashboard.");
  bot = new Proxy({}, {
    get(target, prop) {
      if (prop === "on" || prop === "onText") {
        return () => {}; // No-op for registering event listeners
      }
      return async () => {
        throw new Error("TELEGRAM_BOT_TOKEN is missing in server environment variables. Please add it in Render Dashboard.");
      };
    }
  });
} else {
  const https = require("https");

  const agent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxSockets: 50,
    maxFreeSockets: 20,
    timeout: 60000
  });

  bot = new TelegramBot(token, {
    polling: true,
    request: {
      agent
    }
  });

  bot.on("polling_error", (error) => {
    console.error("Telegram polling error:", error.message);
  });
}

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
  // Derive title from caption or filename
  const cleanTitle = caption || fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  const lowerText = `${fileName} ${caption}`.toLowerCase();

  // 1. Explicit Year Detection
  let explicitYear = null;
  if (/\b(4th\s*year|fourth\s*year|year\s*4|4\s*yr|final\s*year|sem\s*[78]|semester\s*[78]|iv\s*year|7th\s*sem|8th\s*sem|\b4th\b|\bfinal\b)\b/i.test(lowerText)) {
    explicitYear = "4th year";
  } else if (/\b(3rd\s*year|third\s*year|year\s*3|3\s*yr|sem\s*[56]|semester\s*[56]|iii\s*year|5th\s*sem|6th\s*sem|\b3rd\b)\b/i.test(lowerText)) {
    explicitYear = "3rd year";
  } else if (/\b(2nd\s*year|second\s*year|year\s*2|2\s*yr|sem\s*[34]|semester\s*[34]|ii\s*year|3rd\s*sem|4th\s*sem|\b2nd\b)\b/i.test(lowerText)) {
    explicitYear = "2nd year";
  } else if (/\b(1st\s*year|first\s*year|year\s*1|1\s*yr|sem\s*[12]|semester\s*[12]|i\s*year|1st\s*sem|2nd\s*sem|\b1st\b)\b/i.test(lowerText)) {
    explicitYear = "1st year";
  }

  // 2. Intelligent Subject Detection with strict word boundaries
  let subject = "General Engineering";
  let defaultYear = "4th year"; // Default senior engineering

  const explicitSubMatch = caption.match(/(?:subject|sub|course):\s*([^\n\r,]+)/i);
  if (explicitSubMatch && explicitSubMatch[1]) {
    subject = explicitSubMatch[1].trim();
  } else if (/\b(cloud\s*computing|cloud\s*tech|cloud\s*architecture|\bcc\b)\b/i.test(lowerText)) {
    subject = "Cloud Computing (CC)";
    defaultYear = "4th year";
  } else if (/\b(cryptography|crypto|cns|cyber\s*sec|information\s*security|network\s*security)\b/i.test(lowerText)) {
    subject = "Cryptography (CNS)";
    defaultYear = "4th year";
  } else if (/\b(artificial\s*intelligence|\bai\b|machine\s*learning|\bml\b|heuristics)\b/i.test(lowerText)) {
    subject = "Artificial Intelligence (AI)";
    defaultYear = "4th year";
  } else if (/\b(deep\s*learning|\bdl\b|neural\s*network|cnn|rnn|transformers)\b/i.test(lowerText)) {
    subject = "Deep Learning";
    defaultYear = "4th year";
  } else if (/\b(computer\s*networks?|\bcn\b|networking|tcp\s*\/?\s*ip|osi\s*model)\b/i.test(lowerText)) {
    subject = "Computer Networks (CN)";
    defaultYear = "4th year";
  } else if (/\b(data\s*structures?|\bdsa\b|algorithms?|\bada\b|daa)\b/i.test(lowerText)) {
    subject = "Data Structures & Algorithms";
    defaultYear = "2nd year";
  } else if (/\b(database|dbms|sql|nosql)\b/i.test(lowerText)) {
    subject = "Database Management (DBMS)";
    defaultYear = "2nd year";
  } else if (/\b(operating\s*systems?|\bos\b|linux\s*kernel)\b/i.test(lowerText)) {
    subject = "Operating Systems (OS)";
    defaultYear = "2nd year";
  } else if (/\b(engineering\s*mathematics|maths?|calculus|matrices|differential)\b/i.test(lowerText)) {
    subject = "Engineering Mathematics";
    defaultYear = "1st year";
  } else if (/\b(physics|laser|optics|quantum)\b/i.test(lowerText)) {
    subject = "Engineering Physics";
    defaultYear = "1st year";
  } else if (/\b(chemistry|polymers)\b/i.test(lowerText)) {
    subject = "Engineering Chemistry";
    defaultYear = "1st year";
  } else if (/\b(web\s*development|web\s*tech|html|react|javascript)\b/i.test(lowerText)) {
    subject = "Web Development";
    defaultYear = "3rd year";
  } else if (/\b(python|python3)\b/i.test(lowerText)) {
    subject = "Python Programming";
    defaultYear = "2nd year";
  } else if (/\b(java|oops?|object\s*oriented)\b/i.test(lowerText)) {
    subject = "Java Programming";
    defaultYear = "2nd year";
  }

  let year = explicitYear || defaultYear;

  // Auto-find or create the corresponding subject folder in Firestore
  let folderId = "";
  try {
    let folderSnap = await db.collection("folders")
      .where("subject", "==", subject)
      .where("year", "==", year)
      .limit(1)
      .get();

    if (folderSnap.empty) {
      folderSnap = await db.collection("folders")
        .where("subject", "==", subject)
        .limit(1)
        .get();
    }

    if (!folderSnap.empty) {
      folderId = folderSnap.docs[0].id;
      const folderData = folderSnap.docs[0].data();
      if (folderData.year && !explicitYear) {
        year = folderData.year;
      }
      console.log(`[Telegram Auto-Sync] 📁 Matched existing folder "${subject}" (${year}) (ID: ${folderId})`);
    } else {
      const newFolder = await db.collection("folders").add({
        name: subject,
        subject,
        year,
        createdBy: "telegram_sync",
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

// Match /delete, /del, or /remove command (reply to note file/message to delete it from website)
bot.onText(/^\/(delete|del|remove)(@\S+)?(\s+(.+))?$/i, async (msg, match) => {
  try {
    const threadId = msg.message_thread_id;
    const sendOptions = {
      reply_to_message_id: msg.message_id,
      parse_mode: "Markdown"
    };
    if (threadId) sendOptions.message_thread_id = threadId;

    const queryArg = match && match[4] ? match[4].trim() : "";
    const replyMsg = msg.reply_to_message;

    let targetNoteSnap = null;
    let targetDocRef = null;
    let deletedNoteData = null;

    // 1. Reply to a document message or note message
    if (replyMsg) {
      if (replyMsg.document && replyMsg.document.file_id) {
        targetNoteSnap = await db.collection("notes")
          .where("telegramFileId", "==", replyMsg.document.file_id)
          .limit(1)
          .get();
      }
      if ((!targetNoteSnap || targetNoteSnap.empty) && replyMsg.message_id) {
        targetNoteSnap = await db.collection("notes")
          .where("telegramMessageId", "==", replyMsg.message_id)
          .limit(1)
          .get();
      }
    }

    // 2. Direct argument: note ID or exact title
    if ((!targetNoteSnap || targetNoteSnap.empty) && queryArg) {
      try {
        const directDoc = await db.collection("notes").doc(queryArg).get();
        if (directDoc.exists) {
          targetDocRef = directDoc.ref;
          deletedNoteData = directDoc.data();
        }
      } catch (_) {}

      if (!targetDocRef) {
        const titleSnap = await db.collection("notes")
          .where("title", "==", queryArg)
          .limit(1)
          .get();
        if (!titleSnap.empty) {
          targetNoteSnap = titleSnap;
        }
      }
    }

    if (targetNoteSnap && !targetNoteSnap.empty) {
      targetDocRef = targetNoteSnap.docs[0].ref;
      deletedNoteData = targetNoteSnap.docs[0].data();
    }

    if (!targetDocRef || !deletedNoteData) {
      return await bot.sendMessage(
        msg.chat.id,
        "⚠️ *Note not found to delete!*\n\n👉 *To delete a note from the website:*\n• Reply directly to any uploaded note document or message with `/del` or `/delete`\n• Or type: `/del <exact note title or ID>`",
        sendOptions
      );
    }

    // Delete note document from Firestore
    await targetDocRef.delete();
    console.log(`[Telegram Auto-Sync] 🗑️ Note "${deletedNoteData.title}" deleted from DB.`);

    // Delete the Telegram file message if bot has delete permission
    if (deletedNoteData.telegramMessageId && deletedNoteData.telegramChatId) {
      try {
        await bot.deleteMessage(deletedNoteData.telegramChatId, deletedNoteData.telegramMessageId);
      } catch (err) {
        console.warn("[Telegram Auto-Sync] Could not delete original TG message:", err.message);
      }
    }
    if (replyMsg) {
      try {
        await bot.deleteMessage(msg.chat.id, replyMsg.message_id);
      } catch (_) {}
    }

    await bot.sendMessage(
      msg.chat.id,
      `🗑️ *Note Deleted Successfully!*\n\n` +
      `📄 *Title:* ${deletedNoteData.title}\n` +
      `📚 *Subject:* ${deletedNoteData.subject} (${deletedNoteData.year || '4th year'})\n` +
      `🌐 *Status:* Note has been permanently removed from Free Study Material website!`,
      sendOptions
    );
  } catch (err) {
    console.error("[Telegram Delete Command] Error:", err.message);
  }
});

// Periodic Auto-Sync Cleaner: Checks if any Telegram messages were deleted directly in the group
async function cleanDeletedTelegramNotes() {
  try {
    const snap = await db.collection("notes").where("uploadedBy", "==", "telegram_direct").get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.telegramChatId && data.telegramMessageId) {
        try {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: data.telegramChatId, message_id: data.telegramMessageId });
        } catch (err) {
          if (err.message && err.message.includes("message to edit not found")) {
            console.log(`[Auto-Sync Cleaner] 🗑️ Note message deleted in Telegram: "${data.title}". Purging from website...`);
            await doc.ref.delete().catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking catch
  }
}

// Run periodic cleaner every 60 seconds
setInterval(cleanDeletedTelegramNotes, 60 * 1000);
// Also run once 5 seconds after startup
setTimeout(cleanDeletedTelegramNotes, 5000);

console.log("Telegram bot started with Two-Way Web Sync & Periodic Auto-Purge");

module.exports = bot;
module.exports.cleanDeletedTelegramNotes = cleanDeletedTelegramNotes;
