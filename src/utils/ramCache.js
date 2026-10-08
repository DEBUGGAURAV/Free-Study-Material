/**
 * Ultra-Fast In-Memory RAM Cache with TTL and Auto-Invalidation
 * Eliminates redundant Firestore reads and provides ~1-3ms response times.
 */

class RamCache {
  constructor(defaultTtlMs = 60000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
  }

  del(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Global cache singletons
const notesCache = new RamCache(45000);   // 45 seconds TTL for notes list
const foldersCache = new RamCache(60000); // 60 seconds TTL for folders

module.exports = {
  notesCache,
  foldersCache,
  RamCache,
};
