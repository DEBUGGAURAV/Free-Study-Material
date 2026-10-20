/**
 * WebRTC Local Campus Airdrop
 * Direct peer-to-peer classroom & hostel note transfer without internet
 * 0.0% Server CPU • 0.0% Server Bandwidth • ₹0 Cost Forever
 */
import { getCachedNoteBuffer, cacheNoteBuffer } from "./p2pMesh";

/**
 * Checks if a note is stored in local browser cache ready for P2P Airdrop
 * @param {string} noteId 
 * @returns {Promise<boolean>}
 */
export async function isNoteReadyForAirdrop(noteId) {
  const buf = await getCachedNoteBuffer(noteId);
  return Boolean(buf && buf.byteLength > 0);
}

/**
 * Seeds a local note buffer to nearby students over WebRTC DataChannel
 * @param {string} noteId 
 * @param {RTCDataChannel} dataChannel 
 * @param {function} onProgress 
 */
export async function seedNoteToNearbyPeer(noteId, dataChannel, onProgress = () => {}) {
  const buffer = await getCachedNoteBuffer(noteId);
  if (!buffer || !dataChannel || dataChannel.readyState !== "open") {
    throw new Error("Cannot airdrop: Peer channel not open or note not in local memory.");
  }

  const isLowMemory = typeof navigator !== "undefined" && navigator.deviceMemory && navigator.deviceMemory <= 2;
  const CHUNK_SIZE = isLowMemory ? 32 * 1024 : 64 * 1024; // 32KB chunks for low-end 2GB phones
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
  const uint8 = new Uint8Array(buffer);

  // Send metadata header first
  dataChannel.send(JSON.stringify({
    type: "AIRDROP_HEADER",
    noteId,
    totalBytes: buffer.byteLength,
    totalChunks,
  }));

  const maxBufferThreshold = isLowMemory ? 2 * 1024 * 1024 : 8 * 1024 * 1024;

  // Stream binary chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(buffer.byteLength, start + CHUNK_SIZE);
    const chunk = uint8.slice(start, end);

    // Flow control: wait if buffer is full
    if (dataChannel.bufferedAmount > maxBufferThreshold) {
      await new Promise((r) => setTimeout(r, 40));
    }

    dataChannel.send(chunk);
    if (onProgress && i % 4 === 0) {
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
  }

  onProgress(100);
}

