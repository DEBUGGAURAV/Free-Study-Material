const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Local session storage for instant 0ms reconnects
const sessionFilePath = path.join(__dirname, "../../temp/mtproto_session.txt");
let sessionString = "";
if (fs.existsSync(sessionFilePath)) {
  try {
    sessionString = fs.readFileSync(sessionFilePath, "utf8").trim();
  } catch (_) {}
}

const stringSession = new StringSession(sessionString);
let client = null;
let connectPromise = null;

async function getMtprotoClient() {
  if (client && client.connected) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  if (!apiId || !apiHash || !botToken) {
    throw new Error("Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_BOT_TOKEN");
  }

  connectPromise = (async () => {
    try {
      client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false,
        autoReconnect: true,
      });

      await client.start({
        botAuthToken: botToken,
      });

      const savedSession = client.session.save();
      try {
        const dir = path.dirname(sessionFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(sessionFilePath, savedSession, "utf8");
      } catch (_) {}

      console.log("[MTProto] ✅ Connected to Telegram Datacenter via native MTProto protocol! (2GB limit enabled)");
      return client;
    } catch (err) {
      client = null;
      console.error("[MTProto] Connection failed:", err.message);
      throw err;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * Upload file of any size up to 2,000 MB (2 GB) using MTProto parallel workers (40-70 MB/s)
 */
async function uploadFileMtproto({
  filePath,
  title,
  subject,
  threadId,
  targetChatId,
  onProgress
}) {
  const mtClient = await getMtprotoClient();
  const rawChatId = targetChatId || process.env.TELEGRAM_STORAGE_CHAT_ID;
  const chatId = Number(rawChatId) || rawChatId;

  const caption = `📚 ${title}\n📖 Subject: ${subject}\n🌐 Free Study Material Cloud (MTProto 2GB Engine)`;

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const fileName = path.basename(filePath);

  console.log(`[MTProto] 🚀 Streaming "${fileName}" (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to Telegram via 8 parallel MTProto workers...`);

  const result = await mtClient.sendFile(chatId, {
    file: filePath,
    caption,
    workers: 8, // 8 parallel TCP streams for maximum speed (40-70 MB/s)
    replyTo: threadId ? Number(threadId) : undefined,
    progressCallback: (fraction) => {
      if (onProgress) {
        onProgress(fraction);
      }
    }
  });

  const messageId = result.id;
  const docMedia = result.media?.document;

  console.log(`[MTProto] ✅ Successfully archived "${fileName}" (Message ID: ${messageId}) in Telegram!`);

  return {
    messageId,
    chatId: String(rawChatId),
    threadId: threadId ? String(threadId) : "",
    fileId: docMedia?.id ? docMedia.id.toString() : "",
    accessHash: docMedia?.accessHash ? docMedia.accessHash.toString() : "",
    fileName: docMedia?.attributes?.find(a => a.fileName)?.fileName || fileName,
    fileSize: Number(docMedia?.size || fileSize),
  };
}

/**
 * Stream download file from Telegram via MTProto directly into Express HTTP response (supports up to 2GB)
 */
async function streamDownloadMtproto({
  chatId,
  messageId,
  res,
  beforeStream,
  onProgress
}) {
  const mtClient = await getMtprotoClient();
  const targetChat = Number(chatId) || chatId;

  const messages = await mtClient.getMessages(targetChat, { ids: [Number(messageId)] });
  if (!messages || !messages[0] || !messages[0].media) {
    throw new Error("Telegram message or document media not found");
  }

  const media = messages[0].media;
  const fileSize = media.document?.size ? Number(media.document.size) : undefined;

  if (beforeStream) {
    beforeStream({ fileSize, media });
  }

  let isClosed = false;
  res.on("close", () => {
    isClosed = true;
  });

  // Stream in 512KB chunks
  try {
    for await (const chunk of mtClient.iterDownload({
      file: media,
      requestSize: 512 * 1024,
    })) {
      if (isClosed || res.writableEnded || res.destroyed) {
        break;
      }
      res.write(chunk);
      if (onProgress) {
        onProgress(chunk.length);
      }
    }
  } catch (iterErr) {
    if (!isClosed && !res.writableEnded && !res.destroyed) {
      throw iterErr;
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

module.exports = {
  getMtprotoClient,
  uploadFileMtproto,
  streamDownloadMtproto,
};
