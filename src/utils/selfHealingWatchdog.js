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
const { ramCache } = require("./ramCache");

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
 * 2. 🧹 Smart RAM Buffer Guard & Auto-Garbage Collection
 * Protects Render Free Tier 512MB RAM limit from Out-Of-Memory (SIGKILL 137)
 */
function startRamBufferGuard(tempDir, thresholdMb = 380) {
  const checkMemory = () => {
    try {
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / (1024 * 1024));
      const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));

      if (rssMb >= thresholdMb) {
        console.warn(`[SELF-HEALING-GUARD] ⚠️ High RAM Alert: RSS is ${rssMb}MB (Threshold: ${thresholdMb}MB / 512MB). Initiating aggressive auto-purge...`);

        // A. Purge stale temporary files (>15 mins old) from temp/ directory
        if (tempDir && fs.existsSync(tempDir)) {
          try {
            const files = fs.readdirSync(tempDir);
            const now = Date.now();
            let purgedCount = 0;

            for (const file of files) {
              const fullPath = path.join(tempDir, file);
              try {
                const stats = fs.statSync(fullPath);
                if (now - stats.mtimeMs > 15 * 60 * 1000) {
                  fs.unlinkSync(fullPath);
                  purgedCount++;
                }
              } catch (_) {}
            }

            if (purgedCount > 0) {
              console.log(`[SELF-HEALING-GUARD] 🧹 Purged ${purgedCount} stale temporary upload chunk files from disk.`);
            }
          } catch (dirErr) {
            console.warn("[SELF-HEALING-GUARD] Temp sweep notice:", dirErr.message);
          }
        }

        // B. Clear volatile RAM cache entries to release heap
        if (ramCache && typeof ramCache.clear === "function") {
          ramCache.clear();
          console.log("[SELF-HEALING-GUARD] ⚡ Cleared RAM Cache to relieve memory pressure.");
        }

        // C. Trigger Node.js V8 Garbage Collector if exposed
        if (global.gc) {
          try {
            global.gc();
            const afterMem = process.memoryUsage();
            const afterRss = Math.round(afterMem.rss / (1024 * 1024));
            console.log(`[SELF-HEALING-GUARD] ✅ Garbage Collection completed. RSS lowered from ${rssMb}MB to ${afterRss}MB.`);
          } catch (gcErr) {
            console.warn("[SELF-HEALING-GUARD] GC notice:", gcErr.message);
          }
        }
      }
    } catch (e) {
      console.warn("[SELF-HEALING-GUARD] Memory check notice:", e.message);
    }
  };

  // Inspect RAM every 60 seconds
  setInterval(checkMemory, 60 * 1000);
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
 * 4. 📡 Network & Telegram Bot Auto-Reconnection Pulse
 * Regularly tests Telegram API and MTProto connection; reconnects automatically on network dropouts
 */
function startTelegramHeartbeat(reconnectCallback, intervalMs = 20000) {
  setInterval(async () => {
    try {
      lastHeartbeatTime = Date.now();
      const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_OTP_BOT_TOKEN;
      if (!botToken) return;

      // Fast 3s probe to Telegram GetMe
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: controller.signal,
      }).catch((e) => ({ ok: false, error: e.message }));

      clearTimeout(timeoutId);

      if (res && res.ok) {
        tgReconnectAttempts = 0; // Reset counter on healthy pulse
      } else {
        tgReconnectAttempts++;
        const backoffDelay = Math.min(30000, Math.pow(2, Math.min(tgReconnectAttempts, 4)) * 1000);
        console.warn(`[SELF-HEALING-PULSE] 📡 Telegram connection blip detected (Attempt #${tgReconnectAttempts}). Reconnecting in ${backoffDelay / 1000}s...`);

        setTimeout(async () => {
          if (typeof reconnectCallback === "function") {
            try {
              await reconnectCallback();
              console.log("[SELF-HEALING-PULSE] ✅ Telegram sync engine successfully reconnected.");
            } catch (reconErr) {
              console.warn("[SELF-HEALING-PULSE] Reconnection retry warning:", reconErr.message);
            }
          }
        }, backoffDelay);
      }
    } catch (pulseErr) {
      console.warn("[SELF-HEALING-PULSE] Heartbeat notice:", pulseErr.message);
    }
  }, intervalMs);
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
  const mem = process.memoryUsage();
  return {
    isEventLoopCongested,
    currentEventLoopLagMs: currentEventLoopLag,
    rssMb: Math.round(mem.rss / (1024 * 1024)),
    heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
    uptimeHours: (process.uptime() / 3600).toFixed(2),
  };
}

module.exports = {
  attachWorkerWatchdog,
  startRamBufferGuard,
  initProcessImmortalityShield,
  startTelegramHeartbeat,
  startEventLoopLagDetector,
  shouldYieldForWebTraffic,
  getWatchdogStats,
};
