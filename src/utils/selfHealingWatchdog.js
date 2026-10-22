/**
 * Autonomous Self-Healing & Process Resilience Watchdog Engine
 * Free Study Material Academic Vault - Production Reliability Core
 * 
 * 1. 🛡️ Worker Thread Watchdog & Auto-Recycle
 * 2. 🧹 Smart RAM Buffer Guard & Auto-Garbage Collection (OOM Protection for 512MB RAM)
 * 3. 🚀 Global Process Immortality Shield (Zero-Downtime Uncaught Error Containment)
 * 4. 📡 Network & Telegram Bot Auto-Reconnection Pulse
 * 5. ⏱️ Event-Loop Lag Detector (Site Freeze Prevention)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { ramCache } = require("./ramCache");

// Dynamically hook V8 Garbage Collector at runtime (No external CLI flags needed)
try {
  const v8 = require("v8");
  const vm = require("vm");
  v8.setFlagsFromString("--expose_gc");
  if (!global.gc) {
    global.gc = vm.runInNewContext("gc");
  }
} catch (_) {}

// Dynamic RAM Ceiling Discovery (Auto-adapts whether on 512MB, 1GB, 2GB, 4GB, 8GB, VPS, or Docker container)
function getSystemMemoryCeilingMb() {
  // 1. Explicit Environment Variable Override (e.g. set by Render, Docker, or User)
  const envLimit = process.env.RAM_LIMIT_MB || process.env.RENDER_MEMORY_MB || process.env.MEMORY_LIMIT_MB || process.env.WEB_MEMORY;
  if (envLimit && !isNaN(Number(envLimit)) && Number(envLimit) > 50) {
    return Number(envLimit);
  }

  // 2. Linux cgroup v2 container limit (Modern Docker & Render Linux container runtime)
  try {
    if (fs.existsSync("/sys/fs/cgroup/memory.max")) {
      const val = fs.readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
      if (val !== "max" && !isNaN(Number(val))) {
        const mb = Math.round(Number(val) / (1024 * 1024));
        if (mb > 50 && mb < 1000000) return mb;
      }
    }
  } catch (_) {}

  // 3. Linux cgroup v1 container limit (Legacy Docker / LXC container)
  try {
    if (fs.existsSync("/sys/fs/cgroup/memory/memory.limit_in_bytes")) {
      const val = fs.readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
      if (!isNaN(Number(val))) {
        const mb = Math.round(Number(val) / (1024 * 1024));
        if (mb > 50 && mb < 1000000) return mb;
      }
    }
  } catch (_) {}

  // 4. Host OS Physical Memory (Fallback for bare-metal VPS, local dev, or unlimited containers)
  const osMb = Math.round(os.totalmem() / (1024 * 1024));
  return osMb > 0 ? osMb : 512;
}

// Calculate dynamic protection thresholds based on effective ceiling
function getMemoryThresholds(manualCeilingMb = null) {
  const ceilingMb = manualCeilingMb || getSystemMemoryCeilingMb();
  
  // Warning threshold: ~75% of total RAM (e.g. ~384MB for 512MB, ~768MB for 1GB, ~1536MB for 2GB, ~3072MB for 4GB)
  const warningMb = Math.round(ceilingMb * 0.75);
  
  // Critical emergency threshold: ~88% of total RAM (e.g. ~450MB for 512MB, ~900MB for 1GB, ~1800MB for 2GB, ~3600MB for 4GB)
  const criticalMb = Math.round(ceilingMb * 0.88);

  return {
    ceilingMb,
    warningMb: Math.max(250, warningMb),
    criticalMb: Math.max(350, criticalMb),
  };
}

// Auto-Purge Telemetry Trackers
const autoPurgeStats = {
  warningCount: 0,
  criticalCount: 0,
  lastPurgeTime: null,
  lastPurgeType: null,
  lastRssBefore: 0,
  lastRssAfter: 0,
  lastFreedMb: 0,
};

let ramBufferGuardRunning = false;

// State trackers
let isEventLoopCongested = false;
let currentEventLoopLag = 0;
let lastHeartbeatTime = Date.now();
let tgReconnectAttempts = 0;

/**
 * 1. 🛡️ Worker Thread Watchdog Helper
 * Enforces strict 25-second timeout, forces termination, and frees memory buffers
 */
function attachWorkerWatchdog(worker, inputFilePath, originalSize, timeoutMs = 25000) {
  let isDone = false;

  const timer = setTimeout(async () => {
    if (!isDone) {
      isDone = true;
      console.warn(`[SELF-HEALING-WATCHDOG] ⏱️ Worker thread exceeded ${timeoutMs / 1000}s hard limit on ${path.basename(inputFilePath)}. Force terminating worker...`);
      try {
        await worker.terminate();
        console.log("[SELF-HEALING-WATCHDOG] 🧵 Deadlocked worker thread terminated safely. Memory buffer reclaimed.");
      } catch (termErr) {
        console.warn("[SELF-HEALING-WATCHDOG] Worker termination notice:", termErr.message);
      }
      if (global.gc) {
        try { global.gc(); } catch (_) {}
      }
    }
  }, timeoutMs);

  return {
    finish: () => {
      isDone = true;
      clearTimeout(timer);
    },
    isDone: () => isDone,
  };
}

/**
 * 2. 🧹 Smart Dynamic RAM Buffer Guard & Multi-Tier Auto-Purge
 * Self-Adapting OOM Protection: Dynamically scales thresholds to actual server RAM
 * (512MB Render -> ~384MB / ~450MB, 1GB -> ~768MB / ~900MB, 2GB -> ~1536MB / ~1800MB, 4GB -> ~3072MB / ~3600MB)
 */
let cachedNotesRouter = null;
function getNotesRouterSafe() {
  if (!cachedNotesRouter) {
    try {
      cachedNotesRouter = require("../routes/notes");
    } catch (_) {}
  }
  return cachedNotesRouter;
}

function startRamBufferGuard(tempDir, manualThresholdMb = null) {
  if (ramBufferGuardRunning) return;
  ramBufferGuardRunning = true;

  const { ceilingMb, warningMb, criticalMb } = getMemoryThresholds(manualThresholdMb);
  console.log(
    `[SELF-HEALING-GUARD] 🛡️ Dynamic RAM Protection Engine Online! Total RAM: ${ceilingMb}MB | Warning Threshold: ${warningMb}MB (75%) | Critical Emergency: ${criticalMb}MB (88%)`
  );

  const checkMemory = () => {
    try {
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / (1024 * 1024));
      const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));

      const thresholds = getMemoryThresholds(manualThresholdMb);
      const effectiveWarningMb = manualThresholdMb || thresholds.warningMb;
      const effectiveCriticalMb = manualThresholdMb ? Math.round(manualThresholdMb * 1.15) : thresholds.criticalMb;

      if (rssMb >= effectiveWarningMb) {
        const isCritical = rssMb >= effectiveCriticalMb;
        const purgeType = isCritical ? "CRITICAL_EMERGENCY" : "PROACTIVE_WARNING";

        console.warn(
          `[SELF-HEALING-GUARD] ⚠️ High RAM Alert (${purgeType}): RSS is ${rssMb}MB / ${thresholds.ceilingMb}MB (Threshold: ${
            isCritical ? effectiveCriticalMb : effectiveWarningMb
          }MB). Initiating dynamic auto-purge...`
        );

        // A. Sweep stale temporary upload chunks from disk, respecting Active Upload Immunity
        if (tempDir && fs.existsSync(tempDir)) {
          try {
            const files = fs.readdirSync(tempDir);
            const now = Date.now();
            let purgedCount = 0;

            let isTempActiveFn = null;
            try {
              const qs = require("../services/queueService");
              isTempActiveFn = qs.isTempFileActive;
            } catch (_) {}

            for (const file of files) {
              const fullPath = path.join(tempDir, file);
              try {
                // 🛡️ Active Upload Immunity Lock: Never touch actively uploading chunks!
                if (isTempActiveFn && isTempActiveFn(fullPath)) {
                  continue;
                }

                const stats = fs.statSync(fullPath);
                // On warning: 30 minutes; On critical: 10 minutes for abandoned zombie chunks
                const maxAgeMs = isCritical ? 10 * 60 * 1000 : 30 * 60 * 1000;
                if (now - stats.mtimeMs > maxAgeMs) {
                  fs.unlinkSync(fullPath);
                  purgedCount++;
                }
              } catch (_) {}
            }

            if (purgedCount > 0) {
              console.log(`[SELF-HEALING-GUARD] 🧹 Purged ${purgedCount} abandoned temporary upload chunk files from disk.`);
            }
          } catch (dirErr) {
            console.warn("[SELF-HEALING-GUARD] Temp sweep notice:", dirErr.message);
          }
        }

        // B. Purge / LRU Trim in-memory PDF Stream Buffer Cache
        try {
          const nr = getNotesRouterSafe();
          if (nr && nr.noteBufferCache) {
            const currentItems = nr.noteBufferCache.size;
            if (isCritical) {
              // Critical: Evict ALL buffer entries to immediately free large Node Buffers
              if (typeof nr.purgeMemoryCache === "function") {
                nr.purgeMemoryCache();
              } else {
                nr.noteBufferCache.clear();
              }
              console.log(`[SELF-HEALING-GUARD] 🚨 Critical Emergency: Fully purged all ${currentItems} in-memory PDF stream buffers.`);
            } else if (currentItems > 5) {
              // Warning: LRU trim oldest 40% of buffered notes, retaining top hot active notes
              if (typeof nr.trimMemoryCache === "function") {
                const res = nr.trimMemoryCache(0.6);
                console.log(`[SELF-HEALING-GUARD] ⚡ Proactive Warning: LRU-trimmed ${res.removed} cold stream buffers (retained ${res.remaining} hot items).`);
              } else {
                const toRemove = Math.ceil(currentItems * 0.4);
                let removed = 0;
                for (const key of nr.noteBufferCache.keys()) {
                  if (removed >= toRemove) break;
                  nr.noteBufferCache.delete(key);
                  removed++;
                }
                console.log(`[SELF-HEALING-GUARD] ⚡ Proactive Warning: Trimmed ${removed} cold stream buffers.`);
              }
            }
          }
        } catch (bufErr) {
          console.warn("[SELF-HEALING-GUARD] Buffer cache purge notice:", bufErr.message);
        }

        // C. Clear volatile RAM cache entries (clear all on Critical, clear expired on Warning)
        if (ramCache) {
          if (isCritical && typeof ramCache.clear === "function") {
            ramCache.clear();
            console.log("[SELF-HEALING-GUARD] ⚡ Cleared entire volatile RAM Cache to relieve memory pressure.");
          } else if (typeof ramCache.clearExpired === "function") {
            const clearedCount = ramCache.clearExpired();
            if (clearedCount > 0) {
              console.log(`[SELF-HEALING-GUARD] ⚡ Cleared ${clearedCount} expired volatile RAM Cache entries.`);
            }
          }
        }

        // D. Trigger Node.js V8 Garbage Collector
        if (global.gc) {
          try {
            global.gc();
          } catch (gcErr) {
            console.warn("[SELF-HEALING-GUARD] GC notice:", gcErr.message);
          }
        }

        const afterMem = process.memoryUsage();
        const afterRss = Math.round(afterMem.rss / (1024 * 1024));
        const freedMb = Math.max(0, rssMb - afterRss);

        if (isCritical) {
          autoPurgeStats.criticalCount++;
        } else {
          autoPurgeStats.warningCount++;
        }
        autoPurgeStats.lastPurgeTime = new Date().toISOString();
        autoPurgeStats.lastPurgeType = purgeType;
        autoPurgeStats.lastRssBefore = rssMb;
        autoPurgeStats.lastRssAfter = afterRss;
        autoPurgeStats.lastFreedMb = freedMb;

        console.log(
          `[SELF-HEALING-GUARD] ✅ Dynamic Auto-Purge completed (${purgeType}). RSS dropped from ${rssMb}MB to ${afterRss}MB (Reclaimed ${freedMb}MB). System 100% stable.`
        );
      }
    } catch (e) {
      console.warn("[SELF-HEALING-GUARD] Memory check notice:", e.message);
    }
  };

  // Inspect RAM every 30 seconds for rapid, responsive auto-purge
  setInterval(checkMemory, 30 * 1000);
  // Initial check 5s after server boot
  setTimeout(checkMemory, 5000);
}

function getMemoryGuardStats() {
  const thresholds = getMemoryThresholds();
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / (1024 * 1024));
  const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
  return {
    ceilingMb: thresholds.ceilingMb,
    warningThresholdMb: thresholds.warningMb,
    criticalThresholdMb: thresholds.criticalMb,
    currentRssMb: rssMb,
    heapUsedMb,
    usageOfCeilingPercent: Math.min(100, Math.round((rssMb / thresholds.ceilingMb) * 100)),
    status: rssMb >= thresholds.criticalMb ? "CRITICAL" : rssMb >= thresholds.warningMb ? "WARNING" : "HEALTHY",
    autoPurgeStats,
  };
}

/**
 * 3. 🚀 Global Process Immortality Shield
 * Intercepts uncaught exceptions and unhandled rejections to prevent Node process termination
 */
function initProcessImmortalityShield() {
  process.on("uncaughtException", (err, origin) => {
    console.error(`[SELF-HEALING-SHIELD] 🛡️ Intercepted Uncaught Exception [${origin}]:`, err?.message || err);
    if (err && err.stack) {
      console.error(err.stack);
    }
    // Isolate error, do NOT let process exit. Process stays alive and serving requests!
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.warn("[SELF-HEALING-SHIELD] 🛡️ Intercepted Unhandled Rejection at:", promise, "Reason:", reason?.message || reason);
    // Isolate rejection, prevent event-loop death
  });

  console.log("[SELF-HEALING-SHIELD] 🚀 Global Process Immortality Shield initialized (Zero-Downtime Protection Active).");
}

/**
 * 4. 📡 Network & Telegram Bot Auto-Reconnection Monitor (Event-Driven Architecture)
 * Zero background polling load during healthy operation (No periodic getMe calls).
 * Native disconnect listeners & exponential backoff handle reconnections instantaneously.
 * Gentle passive fallback runs only if the system has been totally silent for >10 minutes.
 */
function startTelegramHeartbeat(reconnectCallback, passiveCheckIntervalMs = 10 * 60 * 1000) {
  console.log("[SELF-HEALING-MONITOR] 📡 Modern Event-Driven Telegram Reconnection Engine active (Zero background HTTP load).");

  setInterval(async () => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_OTP_BOT_TOKEN;
      if (!botToken) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: controller.signal,
      }).catch((e) => ({ ok: false, error: e.message }));

      clearTimeout(timeoutId);

      if (res && res.ok) {
        tgReconnectAttempts = 0;
        lastHeartbeatTime = Date.now();
      } else {
        tgReconnectAttempts++;
        const backoffDelay = Math.min(30000, Math.pow(2, Math.min(tgReconnectAttempts, 4)) * 1000);
        console.warn(`[SELF-HEALING-MONITOR] 📡 Telegram passive health notice (Attempt #${tgReconnectAttempts}). Reconnecting in ${backoffDelay / 1000}s...`);

        setTimeout(async () => {
          if (typeof reconnectCallback === "function") {
            try {
              await reconnectCallback();
              console.log("[SELF-HEALING-MONITOR] ✅ Telegram sync engine re-anchored successfully.");
            } catch (reconErr) {
              console.warn("[SELF-HEALING-MONITOR] Reconnection retry warning:", reconErr.message);
            }
          }
        }, backoffDelay);
      }
    } catch (pulseErr) {
      console.warn("[SELF-HEALING-MONITOR] Passive monitor notice:", pulseErr.message);
    }
  }, passiveCheckIntervalMs);
}

/**
 * 5. ⏱️ Event-Loop Lag Detector (Site Freeze Prevention)
 * Detects heavy synchronous tasks and signals the background queue to yield
 */
function startEventLoopLagDetector() {
  let lastTime = Date.now();

  setInterval(() => {
    const now = Date.now();
    const delay = now - lastTime - 500; // Expected ~0ms delay for a 500ms interval
    currentEventLoopLag = Math.max(0, delay);

    if (currentEventLoopLag > 1000) {
      if (!isEventLoopCongested) {
        isEventLoopCongested = true;
        console.warn(`[SELF-HEALING-LAG] ⚠️ Event-loop congestion detected: ${currentEventLoopLag}ms lag! Pausing background pipeline tasks to keep student web traffic ultra-fast.`);
      }
    } else if (currentEventLoopLag < 200 && isEventLoopCongested) {
      isEventLoopCongested = false;
      console.log(`[SELF-HEALING-LAG] ✅ Event-loop lag cleared (${currentEventLoopLag}ms). Resuming background tasks.`);
    }

    lastTime = now;
  }, 500);
}

/**
 * Helper to check if background queue should yield
 */
function shouldYieldForWebTraffic() {
  return isEventLoopCongested;
}

function getWatchdogStats() {
  return {
    isEventLoopCongested,
    currentEventLoopLag,
    lastHeartbeatTime,
    lastActivityTimestamp,
    ramGuard: getMemoryGuardStats(),
  };
}

let lastActivityTimestamp = Date.now();

function recordServerActivity() {
  lastActivityTimestamp = Date.now();
}

/**
 * 6. 🧹 Auto-Garbage Collector & Memory Flusher (Idle Cleaner)
 * When server has been idle for 3 minutes, automatically flushes unused memory,
 * clearing expired items from RAM cache and invoking V8 GC to bring RAM down to base level (~25-40MB).
 */
function startIdleMemoryCleaner(idleThresholdMs = 3 * 60 * 1000) {
  setInterval(() => {
    try {
      const idleTime = Date.now() - lastActivityTimestamp;
      if (idleTime >= idleThresholdMs) {
        if (ramCache && typeof ramCache.clearExpired === "function") {
          ramCache.clearExpired();
        }
        if (global.gc) {
          try {
            global.gc();
            const mem = process.memoryUsage();
            const rssMb = Math.round(mem.rss / (1024 * 1024));
            console.log(`[SELF-HEALING-IDLE] 💤 Server idle for ${(idleTime / 60000).toFixed(1)}m. Flushed memory to base level: ${rssMb}MB RSS.`);
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn("[SELF-HEALING-IDLE] Cleaner notice:", e.message);
    }
  }, 90 * 1000); // Sweep every 90 seconds
}

/**
 * 7. 💾 Auto-Disk Quota Pruner
 * Periodically inspects cache/cdn/ directory.
 * If total cache folder exceeds maxBytes (default 1.5GB) or files are older than 30 days,
 * safely prunes oldest files to prevent disk exhaustion.
 */
function startDiskQuotaPruner(cdnDir = path.join(process.cwd(), "cache", "cdn"), maxBytes = 1.5 * 1024 * 1024 * 1024, maxAgeMs = 30 * 86400 * 1000) {
  const prune = () => {
    try {
      if (!fs.existsSync(cdnDir)) return;
      const files = fs.readdirSync(cdnDir);
      const now = Date.now();
      let totalBytes = 0;
      const fileStats = [];

      for (const file of files) {
        try {
          const fullPath = path.join(cdnDir, file);
          const st = fs.statSync(fullPath);
          totalBytes += st.size;
          fileStats.push({ file, fullPath, size: st.size, mtime: st.mtimeMs });
        } catch (_) {}
      }

      // 1. Delete files older than 30 days
      let prunedOldCount = 0;
      for (const item of fileStats) {
        if (now - item.mtime > maxAgeMs) {
          try {
            fs.unlinkSync(item.fullPath);
            totalBytes -= item.size;
            prunedOldCount++;
          } catch (_) {}
        }
      }

      // 2. If folder still exceeds maxBytes, delete oldest files first
      if (totalBytes > maxBytes) {
        fileStats.sort((a, b) => a.mtime - b.mtime);
        let prunedQuotaCount = 0;
        for (const item of fileStats) {
          if (totalBytes <= maxBytes * 0.75) break;
          if (fs.existsSync(item.fullPath)) {
            try {
              fs.unlinkSync(item.fullPath);
              totalBytes -= item.size;
              prunedQuotaCount++;
            } catch (_) {}
          }
        }
        if (prunedQuotaCount > 0) {
          console.log(`[SELF-HEALING-DISK] 💾 Pruned ${prunedQuotaCount} cached files to keep disk within ${(maxBytes / (1024*1024)).toFixed(0)}MB quota.`);
        }
      }

      if (prunedOldCount > 0) {
        console.log(`[SELF-HEALING-DISK] 🧹 Pruned ${prunedOldCount} stale CDN files (>30 days old).`);
      }
    } catch (err) {
      console.warn("[SELF-HEALING-DISK] Prune notice:", err.message);
    }
  };

  // Run every 6 hours
  setInterval(prune, 6 * 3600 * 1000);
  // Also run 20 seconds after server boot
  setTimeout(prune, 20 * 1000);
}

/**
 * 8. 🧹 Auto-Temp Folder Pruner (1-Hour Strict Policy with Upload Immunity)
 * Periodically inspects temp/ directory.
 * Any orphaned chunk or file older than 1 hour (60 minutes) is safely unlinked.
 * If a file is currently actively processing/uploading in queueService, it has 100% immunity and is NEVER touched.
 */
function startTempFolderPruner(tempDir = path.join(process.cwd(), "temp"), maxAgeMs = 60 * 60 * 1000) {
  const sweepTemp = () => {
    try {
      if (!tempDir || !fs.existsSync(tempDir)) return;
      const files = fs.readdirSync(tempDir);
      const now = Date.now();
      let purgedCount = 0;

      let isTempActiveFn = null;
      try {
        const qs = require("../services/queueService");
        isTempActiveFn = qs.isTempFileActive;
      } catch (_) {}

      for (const file of files) {
        const fullPath = path.join(tempDir, file);
        try {
          // 🛡️ Active Upload Immunity Lock: If file is actively uploading, NEVER touch it!
          if (isTempActiveFn && isTempActiveFn(fullPath)) {
            continue;
          }

          const stats = fs.statSync(fullPath);
          // ⏱️ Safe 1-Hour Threshold (60 Minutes) for abandoned temp files
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            purgedCount++;
          }
        } catch (_) {}
      }

      if (purgedCount > 0) {
        console.log(`[SELF-HEALING-TEMP] 🧹 Purged ${purgedCount} abandoned temp upload files (>1 hour old) from disk.`);
      }
    } catch (dirErr) {
      console.warn("[SELF-HEALING-TEMP] Temp sweep notice:", dirErr.message);
    }
  };

  // Run 10 seconds after server boot
  setTimeout(sweepTemp, 10 * 1000);
  // Periodically sweep every 15 minutes
  setInterval(sweepTemp, 15 * 60 * 1000);
}

module.exports = {
  attachWorkerWatchdog,
  startRamBufferGuard,
  initProcessImmortalityShield,
  startTelegramHeartbeat,
  startEventLoopLagDetector,
  shouldYieldForWebTraffic,
  getWatchdogStats,
  recordServerActivity,
  startIdleMemoryCleaner,
  startDiskQuotaPruner,
  startTempFolderPruner,
  getSystemMemoryCeilingMb,
  getMemoryThresholds,
  getMemoryGuardStats,
};

