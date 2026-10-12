const express = require("express");
const router = express.Router();

// Ephemeral in-memory P2P Mesh state (zero database overhead)
// Structure: noteId -> Map(peerId -> { peerId, ip, lastSeen, meta })
const meshSeeders = new Map();
// Signaling message queues: peerId -> Array of signals
const signalQueue = new Map();

// Cleanup inactive peers every 30 seconds (peers not heard from in 45s)
setInterval(() => {
  const now = Date.now();
  for (const [noteId, peers] of meshSeeders.entries()) {
    for (const [peerId, data] of peers.entries()) {
      if (now - data.lastSeen > 45000) {
        peers.delete(peerId);
      }
    }
    if (peers.size === 0) {
      meshSeeders.delete(noteId);
    }
  }

  // Cleanup signals older than 30s
  for (const [peerId, signals] of signalQueue.entries()) {
    const freshSignals = signals.filter((s) => now - s.timestamp < 30000);
    if (freshSignals.length === 0) {
      signalQueue.delete(peerId);
    } else {
      signalQueue.set(peerId, freshSignals);
    }
  }
}, 30000);

/**
 * POST /api/p2p/announce
 * Client announces it has cached chunks for noteId and is ready to seed
 */
router.post("/announce", (req, res) => {
  try {
    const { peerId, noteId, meta } = req.body;
    if (!peerId || !noteId) {
      return res.status(400).json({ success: false, message: "peerId and noteId required" });
    }

    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const subnet = clientIp.split(".").slice(0, 3).join("."); // Group by local subnet / Wi-Fi range

    if (!meshSeeders.has(noteId)) {
      meshSeeders.set(noteId, new Map());
    }

    meshSeeders.get(noteId).set(peerId, {
      peerId,
      noteId,
      ip: clientIp,
      subnet,
      meta: meta || {},
      lastSeen: Date.now(),
    });

    return res.json({
      success: true,
      message: "Seeder announced successfully in P2P mesh",
      subnet,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/p2p/peers/:noteId
 * Discover online peers who have the note chunks (prioritizing same subnet/Wi-Fi)
 */
router.get("/peers/:noteId", (req, res) => {
  try {
    const { noteId } = req.params;
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const subnet = clientIp.split(".").slice(0, 3).join(".");
    const currentPeerId = req.query.peerId;

    const peersMap = meshSeeders.get(noteId);
    if (!peersMap || peersMap.size === 0) {
      return res.json({ success: true, peers: [], isLocalAvailable: false });
    }

    const activePeers = [];
    const now = Date.now();

    for (const [peerId, peer] of peersMap.entries()) {
      if (peerId !== currentPeerId && now - peer.lastSeen <= 45000) {
        activePeers.push({
          peerId: peer.peerId,
          isLocalWifi: peer.subnet === subnet,
          lastSeen: peer.lastSeen,
        });
      }
    }

    // Sort: same Wi-Fi subnet peers first!
    activePeers.sort((a, b) => (b.isLocalWifi ? 1 : 0) - (a.isLocalWifi ? 1 : 0));

    return res.json({
      success: true,
      peers: activePeers.slice(0, 5), // Max 5 candidate peers
      isLocalAvailable: activePeers.some((p) => p.isLocalWifi),
      totalPeers: activePeers.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/p2p/signal
 * Relays SDP offer, SDP answer, or ICE candidate between two peers
 */
router.post("/signal", (req, res) => {
  try {
    const { fromPeerId, toPeerId, signal } = req.body;
    if (!toPeerId || !signal) {
      return res.status(400).json({ success: false, message: "toPeerId and signal required" });
    }

    if (!signalQueue.has(toPeerId)) {
      signalQueue.set(toPeerId, []);
    }

    signalQueue.get(toPeerId).push({
      fromPeerId,
      signal,
      timestamp: Date.now(),
    });

    return res.json({ success: true, message: "Signal queued" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/p2p/signals/:peerId
 * Polls pending signaling messages for a peer
 */
router.get("/signals/:peerId", (req, res) => {
  try {
    const { peerId } = req.params;
    const signals = signalQueue.get(peerId) || [];
    signalQueue.set(peerId, []); // Flush queue after retrieval

    return res.json({ success: true, signals });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/p2p/stats
 * Overview of global mesh state
 */
router.get("/stats", (req, res) => {
  let totalSeeders = 0;
  let activeNotesSeeded = meshSeeders.size;
  for (const peers of meshSeeders.values()) {
    totalSeeders += peers.size;
  }

  return res.json({
    success: true,
    activeNotesSeeded,
    totalSeeders,
    protocol: "WebRTC DataChannel Mesh (Campus/Hostel Wi-Fi Accelerator)",
  });
});

module.exports = router;

