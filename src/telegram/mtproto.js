const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");
const fs = require("fs");
const path = require("path");

const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
const apiHash = process.env.TELEGRAM_API_HASH;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const storageChatId = process.env.TELEGRAM_STORAGE_CHAT_ID;

let client = null;
let isConnected = false;
let connectPromise = null;

async function getClient() {
  if (client && isConnected) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      if (!apiId || !apiHash || !botToken) {
        console.warn("[MTProto] Telegram credentials missing. MTProto disabled.");
        return null;
      }

      const stringSession = new StringSession("");
      client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false,
        deviceModel: "AcademicCloud-v3",
        appVersion: "3.0.0",
        systemVersion: "Production",
      });

      await client.start({
        botAuthToken: botToken,
      });

      isConnected = true;
      console.log("[MTProto] Connected directly to Telegram DC via GramJS (8 Workers Engine).");
      return client;
    } catch (err) {
      console.error("[MTProto] Connection failed:", err.message);
      isConnected = false;
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * Uploads a file to the Telegram Storage Channel using MTProto parallel workers (up to 2GB)
 */
async function uploadToStorageChannel(filePath, caption = "", fileName = null) {
  const c = await getClient();
  if (!c) throw new Error("MTProto client not initialized");

  const actualFileName = fileName || path.basename(filePath);
  const targetChannel = storageChatId;

  console.log(`[MTProto] Streaming upload: ${actualFileName} to channel ${targetChannel}`);

  // GramJS uploadFile with 8 parallel worker threads and 512KB chunks
  const fileResult = await c.uploadFile({
    file: filePath,
    workers: 8,
    fileSize: fs.statSync(filePath).size,
  });

  const message = await c.sendFile(targetChannel, {
    file: fileResult,
    caption: caption || `Note Vault: ${actualFileName}`,
    forceDocument: true,
    attributes: [
      new Api.DocumentAttributeFilename({
        fileName: actualFileName,
      }),
    ],
    workers: 8,
  });

  return {
    messageId: message.id,
    channelId: targetChannel,
    documentId: message.media?.document?.id?.toString() || null,
    accessHash: message.media?.document?.accessHash?.toString() || null,
    fileReference: message.media?.document?.fileReference || null,
    size: message.media?.document?.size ? Number(message.media.document.size) : fs.statSync(filePath).size,
  };
}

/**
 * Streams a document from Telegram storage channel directly in 512KB chunks
 */
async function streamDocumentFromChannel(messageId, res, rangeHeader = null) {
  const c = await getClient();
  if (!c) throw new Error("MTProto client not initialized");

  const targetChannel = storageChatId;
  const messages = await c.getMessages(targetChannel, { ids: [Number(messageId)] });
  if (!messages || !messages[0] || !messages[0].media || !messages[0].media.document) {
    throw new Error(`Document not found for message ID ${messageId}`);
  }

  const doc = messages[0].media.document;
  const totalSize = Number(doc.size);

  let start = 0;
  let end = totalSize - 1;
  let isRange = false;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    if (isNaN(start)) start = 0;
    if (isNaN(end) || end >= totalSize) end = totalSize - 1;
    isRange = true;
  }

  const contentLength = end - start + 1;

  // Cloudflare CDN & Fast Download Acceleration Headers
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", doc.mimeType || "application/pdf");
  res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering for zero latency
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("CDN-Cache-Control", "public, max-age=31536000");

  if (isRange) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", contentLength);
  } else {
    res.status(200);
    res.setHeader("Content-Length", totalSize);
  }

  // Stream in 512KB chunks using 8 parallel worker connections
  const chunkSize = 512 * 1024;
  let offset = start;

  for await (const chunk of c.iterDownload({
    file: doc,
    offset: BigInt(offset),
    limit: contentLength,
    chunkSize: chunkSize,
    requestSize: chunkSize,
    workers: 8,
  })) {
    if (res.writableEnded || res.destroyed) break;
    res.write(chunk);
  }

  res.end();
}

module.exports = {
  getClient,
  uploadToStorageChannel,
  streamDocumentFromChannel,
};

