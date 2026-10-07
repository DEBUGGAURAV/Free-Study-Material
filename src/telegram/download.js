const bot = require("./bot");

async function getFileDownloadLink(fileId) {
  try {
    const link = await bot.getFileLink(fileId);
    return link;
  } catch (err) {
    console.error("Failed to get Telegram file link:", err.message);
    throw err;
  }
}

async function getFileStream(fileId) {
  try {
    const stream = bot.getFileStream(fileId);
    return stream;
  } catch (err) {
    console.error("Failed to get Telegram file stream:", err.message);
    throw err;
  }
}

module.exports = {
  getFileDownloadLink,
  getFileStream
};

