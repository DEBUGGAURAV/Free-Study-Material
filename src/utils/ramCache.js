/**
 * Ultra-fast In-Memory RAM Cache for Academic Vault
 */
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return item.data;
  }

  set(key, data, ttlSeconds = 60) {
    // Delete existing key first so re-insertion refreshes Map insertion order (LRU behavior)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= 400) {
      this.clearExpired();
      // Hard cap at 400 keys to keep RAM footprint < 3MB
      while (this.cache.size >= 400) {
        const oldestKey = this.cache.keys().next().value;
        if (!oldestKey) break;
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    this.cache.delete(key);
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  clearExpired() {
    const now = Date.now();
    let count = 0;
    for (const [key, item] of this.cache.entries()) {
      if (item && item.expiresAt && now > item.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      keysCount: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits + this.misses > 0 
        ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1) + "%" 
        : "0%",
    };
  }
}

const ramCache = new MemoryCache();

function invalidateAllCache(options = {}) {
  // Selectively preserve auth_user_* and tg_sub_topic_* / tg_topic_sub_* so user logins and topic mappings don't trigger unnecessary DB reads
  for (const key of Array.from(ramCache.cache.keys())) {
    if (
      !options.full &&
      (key.startsWith("auth_user_") ||
        key.startsWith("tg_sub_topic_") ||
        key.startsWith("tg_topic_sub_") ||
        key.startsWith("user_min_version_"))
    ) {
      continue;
    }
    ramCache.cache.delete(key);
  }
  if (!options.keepNotesRam) {
    try {
      const { invalidateTursoNotesCache } = require("../services/tursoNotesCacheService");
      invalidateTursoNotesCache();
    } catch (_) {}
  }
  console.log("[RAM CACHE] Cache invalidated (Selective Event-Driven Mode).");
}

module.exports = {
  ramCache,
  invalidateAllCache,
};

