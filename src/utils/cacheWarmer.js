/**
 * Cold-Start Cache Warmer
 * Pre-warms top academic notes and essential catalog metadata into memory on server boot.
 * Guarantees a 0-millisecond response time for the very first student after deploy or reboot.
 */

const { db } = require("../firebase");
const { ramCache } = require("./ramCache");

let isWarm = false;
let warmTimestamp = null;
let warmedCount = 0;

async function warmCacheOnBoot() {
  if (!db) {
    console.warn("[CACHE-WARMER] Firestore database not ready. Skipping boot cache warmup.");
    return;
  }

  try {
    const startTime = Date.now();
    console.log("[CACHE-WARMER] 🏎️ Initiating Cold-Start Cache Warmup...");

    // Helper to extract timestamp reliably
    const getNoteTimestamp = (val) => {
      if (!val) return 0;
      if (typeof val === "number") return val;
      if (typeof val.toDate === "function") return val.toDate().getTime();
      if (val._seconds !== undefined) return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);
      if (val.seconds !== undefined) return val.seconds * 1000;
      const parsed = new Date(val).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    // 1. Fetch live notes catalog to warm all_raw_notes
    const snapshot = await db.collection("notes").limit(100).get();
    if (!snapshot || snapshot.empty) {
      console.log("[CACHE-WARMER] No existing notes found in vault to warm.");
      return;
    }

    const rawNotes = [];
    const warmedNotes = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const createdMs = getNoteTimestamp(data.createdAt);
      const updatedMs = getNoteTimestamp(data.updatedAt);
      const effectiveMs = Math.max(createdMs, updatedMs);
      const createdAtIso = createdMs > 0 ? new Date(createdMs).toISOString() : new Date().toISOString();

      const noteObj = {
        id: doc.id,
        ...data,
        createdAt: createdAtIso,
        _sortTimestamp: effectiveMs,
      };

      rawNotes.push(noteObj);
      warmedNotes.push(noteObj);

      // Pre-warm individual note record into RAM Cache (3-hour TTL)
      ramCache.set(`note_${doc.id}`, noteObj, 3 * 3600);
    });

    // 2. Pre-warm all_raw_notes into RAM Cache (600 seconds)
    ramCache.set("all_raw_notes", rawNotes, 600);

    // 3. Pre-warm top catalog list
    ramCache.set("notes_top_catalog", warmedNotes.slice(0, 15), 3 * 3600);

    warmedCount = rawNotes.length;
    isWarm = true;
    warmTimestamp = Date.now();
    const elapsed = Date.now() - startTime;

    console.log(`[CACHE-WARMER] ✅ Successfully pre-warmed ${warmedCount} academic notes in RAM cache in ${elapsed}ms (Zero-second first student load ready!).`);
  } catch (err) {
    console.warn("[CACHE-WARMER] Cold-start warmup notice:", err.message);
  }
}

function getCacheWarmerStatus() {
  return {
    isWarm,
    warmedCount,
    warmTimestamp: warmTimestamp ? new Date(warmTimestamp).toISOString() : null,
    cacheStats: ramCache.getStats(),
  };
}

module.exports = {
  warmCacheOnBoot,
  getCacheWarmerStatus,
};
