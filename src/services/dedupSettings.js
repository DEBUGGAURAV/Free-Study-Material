/**
 * ============================================================================
 * 🧬 SMART DEDUPLICATION & SIZE VARIANCE CONFIGURATION SERVICE
 * ============================================================================
 * - Default Variance: 3 MB (3,145,728 Bytes)
 * - Supports exact byte-level threshold tuning and dual MB/Byte controller
 * - Shared across real-time upload queue (dedupService.js) and database sweep (mtproto.js)
 * ============================================================================
 */

const { db } = require("../firebase");

const DEFAULT_MB = 3;
const DEFAULT_BYTES = 3 * 1024 * 1024; // 3,145,728 Bytes

let cachedDedupSettings = {
  enableSmartDeduplication: true,
  dedupMaxVarianceMB: DEFAULT_MB,
  dedupMaxVarianceBytes: DEFAULT_BYTES,
  updatedAt: new Date().toISOString(),
};

function getDedupSettings() {
  return cachedDedupSettings;
}

function updateDedupSettings(newSettings) {
  if (!newSettings || typeof newSettings !== "object") return cachedDedupSettings;

  let mb = newSettings.dedupMaxVarianceMB !== undefined
    ? parseFloat(newSettings.dedupMaxVarianceMB)
    : cachedDedupSettings.dedupMaxVarianceMB;

  if (isNaN(mb) || mb < 0) mb = DEFAULT_MB;

  let bytes = newSettings.dedupMaxVarianceBytes !== undefined
    ? parseInt(newSettings.dedupMaxVarianceBytes, 10)
    : Math.round(mb * 1024 * 1024);

  if (isNaN(bytes) || bytes < 0) bytes = Math.round(mb * 1024 * 1024);

  // Cross-synchronize: If only bytes was provided, recalculate MB
  if (newSettings.dedupMaxVarianceBytes !== undefined && newSettings.dedupMaxVarianceMB === undefined) {
    mb = parseFloat((bytes / (1024 * 1024)).toFixed(2));
  } else if (newSettings.dedupMaxVarianceMB !== undefined && newSettings.dedupMaxVarianceBytes === undefined) {
    bytes = Math.round(mb * 1024 * 1024);
  }

  cachedDedupSettings = {
    ...cachedDedupSettings,
    enableSmartDeduplication:
      newSettings.enableSmartDeduplication !== undefined
        ? Boolean(newSettings.enableSmartDeduplication)
        : cachedDedupSettings.enableSmartDeduplication,
    dedupMaxVarianceMB: mb,
    dedupMaxVarianceBytes: bytes,
    updatedAt: new Date().toISOString(),
  };

  return cachedDedupSettings;
}

// Initial load from single settings document (settings/tech_controls)
(async function initDedupSettings() {
  try {
    if (db) {
      const snap = await db.collection("settings").doc("tech_controls").get().catch(() => null);
      if (snap && snap.exists) {
        const d = snap.data();
        if (d && (d.dedupMaxVarianceMB !== undefined || d.dedupMaxVarianceBytes !== undefined || d.enableSmartDeduplication !== undefined)) {
          updateDedupSettings(d);
          console.log(`[DEDUP-SETTINGS] 🧬 Loaded Smart Dedup Config: ${cachedDedupSettings.dedupMaxVarianceMB} MB (${cachedDedupSettings.dedupMaxVarianceBytes.toLocaleString()} Bytes). Enabled: ${cachedDedupSettings.enableSmartDeduplication}`);
        }
      }
    }
  } catch (err) {
    console.warn("[DEDUP-SETTINGS] Boot initialization notice:", err.message);
  }
})();

module.exports = {
  getDedupSettings,
  updateDedupSettings,
  DEFAULT_MB,
  DEFAULT_BYTES,
};

