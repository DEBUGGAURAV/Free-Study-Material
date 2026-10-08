const bot = require("./bot");
const { uploadFileMtproto } = require("./mtproto");

async function uploadFile({
  filePath,
  title,
  subject,
  threadId,
  onProgress
}) {
  // If MTProto credentials are configured, prioritize native MTProto (supports up to 2GB with 8x parallel speed)
  if (process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH) {
    try {
      const mtResult = await uploadFileMtproto({
        filePath,
        title,
        subject,
        threadId,
        onProgress
      });
      return mtResult;
    } catch (mtErr) {
      console.warn("[Upload] MTProto upload exception, attempting Bot API fallback:", mtErr.message);
    }
  }

  // Fallback to standard Telegram Bot API (capped at 50MB)
  const caption =
    `📚 ${title}\n` +
    `📖 Subject: ${subject}\n` +
    `🌐 Free Study Material`;

  const options = {
    caption
  };

  if (threadId) {
    options.message_thread_id = Number(threadId);
  }

  const message = await bot.sendDocument(
    process.env.TELEGRAM_STORAGE_CHAT_ID,
    filePath,
    options
  );

  return {
    messageId: message.message_id,
    chatId: message.chat.id,
    threadId: message.message_thread_id,
    fileId: message.document?.file_id,
    fileName: message.document?.file_name,
    fileSize: message.document?.file_size
  };
}

module.exports = {
  uploadFile
};
