const bot = require("./bot");

async function uploadFile({
  filePath,
  title,
  subject,
  threadId
}) {
  const caption =
    `📚 ${title}\n` +
    `📖 Subject: ${subject}\n` +
    `🤖 Tech Titan`;

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

