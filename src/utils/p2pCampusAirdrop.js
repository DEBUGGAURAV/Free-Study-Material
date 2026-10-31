/**
 * ============================================================================
 * ⚡ WebRTC Local Campus AirDrop & 1-Tap QR Mesh Engine
 * ============================================================================
 * Direct device-to-device classroom & hostel note transfer without internet
 * 0.0% Server CPU • 0.0% Server Bandwidth • ₹0 Cost Forever
 *
 * Handshake: Zero-server offline handshake via dynamic QR Code tokens
 * Transport: High-speed local Wi-Fi / Hotspot WebRTC DataChannels (30-50 MB/s)
 * Storage:   Native browser IndexedDB Vault
 * ============================================================================
 */

import { getCachedNoteBuffer, cacheNoteBuffer } from "./p2pMesh";

// Standard STUN servers (will silently be bypassed on pure local Wi-Fi / Hotspot networks)
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 2,
};

/**
 * Checks if a note is stored in local browser cache ready for P2P AirDrop
 * @param {string} noteId 
 * @returns {Promise<boolean>}
 */
export async function isNoteReadyForAirdrop(noteId) {
  if (!noteId) return false;
  const buf = await getCachedNoteBuffer(noteId);
  return Boolean(buf && buf.byteLength > 0);
}

/**
 * Encodes an SDP signaling object into a compact QR-friendly string
 */
export function encodeSignalingToken(data) {
  try {
    const jsonStr = JSON.stringify(data);
    return btoa(encodeURIComponent(jsonStr));
  } catch (err) {
    console.warn("[AIRDROP] Token encode fallback:", err);
    return btoa(JSON.stringify(data));
  }
}

/**
 * Decodes a signaling token back into an SDP object with strict validation
 */
export function decodeSignalingToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Empty or invalid token provided.");
  }
  try {
    const raw = token.trim();
    let parsed = null;
    try {
      const decodedUri = decodeURIComponent(atob(raw));
      parsed = JSON.parse(decodedUri);
    } catch (_) {
      parsed = JSON.parse(atob(raw));
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Decoded token is not a valid payload.");
    }
    if (parsed.role !== "airdrop_offer" && parsed.role !== "airdrop_answer") {
      throw new Error("Unrecognized AirDrop token role.");
    }
    if (!parsed.sdp || typeof parsed.sdp !== "string" || !parsed.sdp.includes("v=0")) {
      throw new Error("Invalid or corrupted SDP signaling inside token.");
    }

    return parsed;
  } catch (err) {
    throw new Error("Invalid AirDrop token format: " + (err.message || "Decoding failed"));
  }
}

/**
 * Waits for ICE candidate gathering to finish or reach timeout
 */
function waitForIceGathering(pc, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      return resolve();
    }
    let timer = null;
    const checkState = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", checkState);
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    pc.addEventListener("icegatheringstatechange", checkState);
  });
}

/**
 * Step 1 (Sender / Seeder):
 * Initiates an AirDrop sender session for a noteId.
 * Creates WebRTC Offer, DataChannel, and returns the QR token to display.
 */
export async function createAirDropSenderSession(noteId, callbacks = {}, directBuffer = null) {
  const { onProgress = () => {}, onConnected = () => {}, onError = () => {} } = callbacks;

  let buffer = directBuffer;
  if (!buffer || buffer.byteLength === 0) {
    buffer = await getCachedNoteBuffer(noteId);
  }
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("This note is not yet cached in your device memory. Please open or view it first.");
  }
  if (directBuffer && noteId) {
    cacheNoteBuffer(noteId, directBuffer).catch(() => {});
  }

  const pc = new RTCPeerConnection(ICE_CONFIG);
  const dc = pc.createDataChannel("campus_airdrop_channel", {
    ordered: true,
  });
  dc.binaryType = "arraybuffer";

  const session = {
    role: "sender",
    noteId,
    pc,
    dc,
    buffer,
    active: true,
  };

  dc.onopen = async () => {
    if (!session.active) return;
    try {
      onConnected();
      await seedNoteBufferOverChannel(session.noteId, session.buffer, dc, onProgress);
    } catch (err) {
      if (session.active) onError(err);
    }
  };

  dc.onerror = (e) => {
    if (session.active) onError(new Error("DataChannel error: " + (e.message || "Failed")));
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait briefly to collect local network host ICE candidates
  await waitForIceGathering(pc, 1500);

  const offerPayload = {
    role: "airdrop_offer",
    noteId,
    fileSize: buffer.byteLength,
    sdp: pc.localDescription.sdp,
    v: 1,
  };

  const offerToken = encodeSignalingToken(offerPayload);
  session.offerToken = offerToken;

  return session;
}

/**
 * Step 1.5 (Sender):
 * Receives the Receiver's Answer Token (from camera scan or paste) and completes connection.
 */
export async function completeSenderWithAnswer(session, answerToken) {
  if (!session || !session.pc || !session.active) {
    throw new Error("Active sender session expired. Please restart AirDrop.");
  }

  const payload = decodeSignalingToken(answerToken);
  if (payload.role !== "airdrop_answer" || !payload.sdp) {
    throw new Error("Invalid answer QR token received. Please scan the receiver's answer QR code.");
  }

  await session.pc.setRemoteDescription(new RTCSessionDescription({
    type: "answer",
    sdp: payload.sdp,
  }));

  return true;
}

/**
 * Step 2 (Receiver / Leecher):
 * Accepts an Offer Token from Sender's QR code.
 * Creates WebRTC Answer, waits for DataChannel, and returns Answer Token.
 */
export async function createAirDropReceiverSession(offerToken, callbacks = {}) {
  const { onProgress = () => {}, onComplete = () => {}, onError = () => {} } = callbacks;

  const payload = decodeSignalingToken(offerToken);
  if (payload.role !== "airdrop_offer" || !payload.sdp) {
    throw new Error("Invalid offer QR token. Please scan the sender's AirDrop QR code.");
  }

  const pc = new RTCPeerConnection(ICE_CONFIG);
  const session = {
    role: "receiver",
    noteId: payload.noteId,
    fileSize: payload.fileSize,
    pc,
    dc: null,
    active: true,
  };

  pc.ondatachannel = (event) => {
    const dc = event.channel;
    session.dc = dc;
    dc.binaryType = "arraybuffer";

    setupReceiverDataChannel(dc, session, onProgress, onComplete, onError);
  };

  await pc.setRemoteDescription(new RTCSessionDescription({
    type: "offer",
    sdp: payload.sdp,
  }));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Collect local network ICE candidates
  await waitForIceGathering(pc, 1500);

  const answerPayload = {
    role: "airdrop_answer",
    noteId: payload.noteId,
    sdp: pc.localDescription.sdp,
    v: 1,
  };

  const answerToken = encodeSignalingToken(answerPayload);
  session.answerToken = answerToken;

  return session;
}

/**
 * Closes and cleans up an AirDrop peer session
 */
export function cancelAirDropSession(session) {
  if (!session) return;
  session.active = false;
  try {
    if (session.dc && session.dc.readyState !== "closed") {
      session.dc.close();
    }
  } catch (_) {}
  try {
    if (session.pc && session.pc.signalingState !== "closed") {
      session.pc.close();
    }
  } catch (_) {}
}

/**
 * Internal: Streams a note buffer across an open WebRTC DataChannel
 */
async function seedNoteBufferOverChannel(noteId, buffer, dataChannel, onProgress) {
  if (!buffer || !dataChannel || dataChannel.readyState !== "open") {
    throw new Error("Cannot airdrop: Peer channel not open or buffer missing.");
  }

  const isLowMemory = typeof navigator !== "undefined" && navigator.deviceMemory && navigator.deviceMemory <= 2;
  const CHUNK_SIZE = isLowMemory ? 32 * 1024 : 64 * 1024;
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
  const uint8 = new Uint8Array(buffer);

  // 1. Send Header
  dataChannel.send(JSON.stringify({
    type: "AIRDROP_HEADER",
    noteId,
    totalBytes: buffer.byteLength,
    totalChunks,
  }));

  const maxBufferThreshold = isLowMemory ? 2 * 1024 * 1024 : 6 * 1024 * 1024;
  const startTime = Date.now();

  // 2. Stream binary chunks with flow control
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(buffer.byteLength, start + CHUNK_SIZE);
    const chunk = uint8.slice(start, end);

    // Prevent buffer overflow on low-end hardware
    if (dataChannel.bufferedAmount > maxBufferThreshold) {
      await new Promise((r) => setTimeout(r, 35));
    }

    dataChannel.send(chunk.buffer);

    if (onProgress && (i % 4 === 0 || i === totalChunks - 1)) {
      const elapsedSec = (Date.now() - startTime) / 1000 || 0.1;
      const sentBytes = end;
      const speedMBs = (sentBytes / (1024 * 1024) / elapsedSec).toFixed(1);
      const percent = Math.min(100, Math.round(((i + 1) / totalChunks) * 100));
      onProgress({
        percent,
        speed: `${speedMBs} MB/s`,
        sentBytes,
        totalBytes: buffer.byteLength,
      });
    }
  }

  // 3. Send Completion trailer
  dataChannel.send(JSON.stringify({
    type: "AIRDROP_TRAILER",
    noteId,
    status: "COMPLETE",
  }));

  if (onProgress) {
    onProgress({
      percent: 100,
      speed: "Direct Peer Link",
      sentBytes: buffer.byteLength,
      totalBytes: buffer.byteLength,
    });
  }
}

const MAX_AIRDROP_FILE_SIZE = 250 * 1024 * 1024; // 250 MB campus quota limit

/**
 * Internal: Receives binary chunks, reconstructs note buffer, and caches into IndexedDB
 */
function setupReceiverDataChannel(dc, session, onProgress, onComplete, onError) {
  let header = null;
  let receivedBytes = 0;
  let chunks = [];
  const startTime = Date.now();

  dc.onmessage = async (event) => {
    if (!session.active) return;

    if (typeof event.data === "string") {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "AIRDROP_HEADER") {
          const totalBytes = Number(msg.totalBytes);
          if (!totalBytes || totalBytes <= 0 || totalBytes > MAX_AIRDROP_FILE_SIZE) {
            throw new Error(`File size (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeds campus safety limit (250 MB).`);
          }
          const cleanNoteId = String(msg.noteId || "note").replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 100);
          header = {
            ...msg,
            noteId: cleanNoteId,
            totalBytes,
          };
          receivedBytes = 0;
          chunks = [];
        } else if (msg.type === "AIRDROP_TRAILER") {
          if (!header) {
            throw new Error("Received completion trailer without valid header.");
          }
          // Rebuild complete Uint8Array
          const completeArray = new Uint8Array(receivedBytes);
          let offset = 0;
          for (const c of chunks) {
            completeArray.set(new Uint8Array(c), offset);
            offset += c.byteLength;
          }

          const finalBuffer = completeArray.buffer;

          // Automatically cache into device IndexedDB
          await cacheNoteBuffer(header.noteId, finalBuffer);

          if (onComplete) {
            onComplete({
              noteId: header.noteId,
              buffer: finalBuffer,
              sizeBytes: receivedBytes,
            });
          }
        }
      } catch (err) {
        if (session.active) onError(err);
      }
      return;
    }

    // Binary chunk
    if (event.data instanceof ArrayBuffer) {
      if (receivedBytes + event.data.byteLength > MAX_AIRDROP_FILE_SIZE) {
        try { dc.close(); } catch (_) {}
        if (session.active) onError(new Error("Transfer exceeded safety quota (250 MB)."));
        return;
      }

      chunks.push(event.data);
      receivedBytes += event.data.byteLength;

      if (onProgress && header) {
        const percent = Math.min(99, Math.round((receivedBytes / header.totalBytes) * 100));
        const elapsedSec = (Date.now() - startTime) / 1000 || 0.1;
        const speedMBs = (receivedBytes / (1024 * 1024) / elapsedSec).toFixed(1);
        onProgress({
          percent,
          speed: `${speedMBs} MB/s`,
          receivedBytes,
          totalBytes: header.totalBytes,
        });
      }
    }
  };

  dc.onerror = (e) => {
    if (session.active) onError(new Error("Receiver DataChannel error: " + (e.message || "Failed")));
  };
}
