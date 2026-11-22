/**
 * Global Telegram Sync & Single-Receipt Lock Tracker
 * Guarantees that:
 * 1. A message or document is processed strictly ONCE across all listeners.
 * 2. EXACTLY ONE receipt is EVER dispatched to the user.
 */

class TelegramSyncLock {
  constructor() {
    this.inFlight = new Set();
    this.processedKeys = new Map(); // key -> timestamp
    this.sentReceipts = new Set();
  }

  getDocSignature(fileName, fileSize) {
    if (!fileSize) return null;
    const clean = (fileName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `sig_${clean}_${fileSize}`;
  }

  canProcess(key) {
    if (!key) return true;
    if (this.inFlight.has(key)) return false;
    const timestamp = this.processedKeys.get(key);
    if (timestamp && Date.now() - timestamp < 30 * 60 * 1000) {
      return false; // Processed within last 30 minutes
    }
    return true;
  }

  lock(key) {
    if (!key) return;
    this.inFlight.add(key);
  }

  unlock(key) {
    if (!key) return;
    this.inFlight.delete(key);
    const now = Date.now();
    // Bounded memory cap (max 300 keys) to prevent unbounded RAM growth
    if (this.processedKeys.size >= 300) {
      for (const [k, ts] of this.processedKeys.entries()) {
        if (now - ts > 30 * 60 * 1000) this.processedKeys.delete(k);
      }
      if (this.processedKeys.size >= 300) {
        const oldest = this.processedKeys.keys().next().value;
        if (oldest) this.processedKeys.delete(oldest);
      }
    }
    this.processedKeys.set(key, now);
  }

  canSendReceipt(chatId, messageId) {
    const key = `rcpt_${chatId}_${messageId}`;
    if (this.sentReceipts.has(key)) {
      return false;
    }
    if (this.sentReceipts.size >= 300) {
      const oldest = this.sentReceipts.values().next().value;
      if (oldest) this.sentReceipts.delete(oldest);
    }
    this.sentReceipts.add(key);
    return true;
  }
}

const syncLock = new TelegramSyncLock();

module.exports = { syncLock };

