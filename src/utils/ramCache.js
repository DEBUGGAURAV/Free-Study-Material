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
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
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

function invalidateAllCache() {
  ramCache.clear();
  console.log("[RAM CACHE] Cache invalidated.");
}

module.exports = {
  ramCache,
  invalidateAllCache,
};

