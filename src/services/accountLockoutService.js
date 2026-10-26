/**
 * 🛡️ Category 1 Feature 2: Per-Account Brute Force Lockout Service
 * Protects accounts from distributed proxy-based brute-force attacks.
 * Locks the account for 20 minutes if 5 consecutive failed attempts occur.
 */

const { db } = require("../firebase");

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 20 * 60 * 1000; // 20 minutes

// In-memory cache for 0ms sub-millisecond check
// Key: normalized identifier (clean email or 10-digit mobile)
// Value: { attempts: number, lockedUntil: number, lastAttempt: number }
const lockoutCache = new Map();

/**
 * Normalizes identifier (email lowercase or 10 digits)
 */
function normalizeIdentifier(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "").slice(-10);
  return digits || trimmed;
}

/**
 * Checks if an account is currently locked out
 * @param {string} identifier - Email or mobile
 * @returns {Promise<{ isLocked: boolean, remainingMs: number, remainingMinutes: number }>}
 */
async function checkAccountLockout(identifier) {
  const key = normalizeIdentifier(identifier);
  if (!key) return { isLocked: false, remainingMs: 0, remainingMinutes: 0 };

  const now = Date.now();

  // 1. In-memory check first (fastest)
  const cached = lockoutCache.get(key);
  if (cached && cached.lockedUntil && cached.lockedUntil > now) {
    const remainingMs = cached.lockedUntil - now;
    return {
      isLocked: true,
      remainingMs,
      remainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
    };
  }

  // If cached lock expired, clean it up
  if (cached && cached.lockedUntil && cached.lockedUntil <= now) {
    lockoutCache.delete(key);
  }

  // 2. Firestore check (persists across server restarts and multi-instance)
  if (db) {
    try {
      const docId = key.replace(/[^a-zA-Z0-9]/g, "_");
      const snap = await db.collection("account_lockouts").doc(docId).get();
      if (snap.exists) {
        const data = snap.data();
        if (data && data.lockedUntil && data.lockedUntil > now) {
          const remainingMs = data.lockedUntil - now;
          lockoutCache.set(key, {
            attempts: data.attempts || MAX_FAILED_ATTEMPTS,
            lockedUntil: data.lockedUntil,
            lastAttempt: data.lastAttempt || now,
          });
          return {
            isLocked: true,
            remainingMs,
            remainingMinutes: Math.ceil(remainingMs / (60 * 1000)),
          };
        }
      }
    } catch (err) {
      console.warn("[ACCOUNT-LOCKOUT] Firestore lookup fallback:", err.message);
    }
  }

  return { isLocked: false, remainingMs: 0, remainingMinutes: 0 };
}

/**
 * Records a failed login / OTP verification attempt
 * @param {string} identifier - Email or mobile
 * @param {object} [context] - { ip, userAgent, method }
 * @returns {Promise<{ isLocked: boolean, attempts: number, remainingAttempts: number, lockedUntil?: number }>}
 */
async function recordFailedAttempt(identifier, context = {}) {
  const key = normalizeIdentifier(identifier);
  if (!key) return { isLocked: false, attempts: 0, remainingAttempts: MAX_FAILED_ATTEMPTS };

  const now = Date.now();
  let state = lockoutCache.get(key) || { attempts: 0, lockedUntil: 0, lastAttempt: now };

  // If previous lock expired or last attempt was older than 30 mins, reset counter
  if (now - state.lastAttempt > 30 * 60 * 1000) {
    state.attempts = 0;
    state.lockedUntil = 0;
  }

  state.attempts += 1;
  state.lastAttempt = now;

  let isNewlyLocked = false;
  if (state.attempts >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
    isNewlyLocked = true;
  }

  lockoutCache.set(key, state);

  // Persist to Firestore
  if (db) {
    try {
      const docId = key.replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("account_lockouts").doc(docId).set({
        identifier: key,
        attempts: state.attempts,
        lockedUntil: state.lockedUntil,
        lastAttempt: now,
        lastIp: context.ip || "Unknown",
        lastUserAgent: context.userAgent || "Unknown",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn("[ACCOUNT-LOCKOUT] Failed to persist lockout record:", err.message);
    }
  }

  // Send real-time Security Alert to Telegram Supergroup Topic 6 on Lockout
  if (isNewlyLocked) {
    try {
      const { sendTelegramAuthNotice } = require("./emailService");
      sendTelegramAuthNotice({
        event: "SECURITY_UPDATE",
        user: { email: key.includes("@") ? key : "Account", mobile: !key.includes("@") ? key : "N/A" },
        detail: `🚨 <b>BRUTE-FORCE LOCKOUT TRIGGERED</b>\n\nAccount: <code>${key}</code>\nFailed Attempts: ${state.attempts}\nAction: Account locked for 20 minutes across all IPs.\nOrigin IP: <code>${context.ip || "Unknown"}</code>\nDevice: <code>${context.userAgent || "Unknown"}</code>`,
      }).catch(() => {});
    } catch {}
  }

  const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - state.attempts);
  return {
    isLocked: state.lockedUntil > now,
    attempts: state.attempts,
    remainingAttempts,
    lockedUntil: state.lockedUntil,
    remainingMinutes: state.lockedUntil > now ? Math.ceil((state.lockedUntil - now) / 60000) : 0,
  };
}

/**
 * Resets failed attempts after a successful login or OTP verification
 * @param {string} identifier - Email or mobile
 */
async function clearFailedAttempts(identifier) {
  const key = normalizeIdentifier(identifier);
  if (!key) return;

  lockoutCache.delete(key);

  if (db) {
    try {
      const docId = key.replace(/[^a-zA-Z0-9]/g, "_");
      await db.collection("account_lockouts").doc(docId).delete().catch(() => {});
    } catch {}
  }
}

/**
 * Retrieves all currently active account lockouts (from RAM cache and Firestore)
 */
async function getActiveLockouts() {
  const now = Date.now();
  const list = [];
  const seen = new Set();

  // 1. From memory cache
  for (const [key, state] of lockoutCache.entries()) {
    if (state.lockedUntil && state.lockedUntil > now) {
      seen.add(key);
      list.push({
        identifier: key,
        attempts: state.attempts || MAX_FAILED_ATTEMPTS,
        remainingMinutes: Math.max(1, Math.ceil((state.lockedUntil - now) / 60000)),
        lockedUntil: new Date(state.lockedUntil).toISOString(),
        lastAttempt: state.lastAttempt ? new Date(state.lastAttempt).toISOString() : new Date().toISOString(),
      });
    }
  }

  // 2. From Firestore
  if (db) {
    try {
      const snap = await db.collection("account_lockouts").where("lockedUntil", ">", now).limit(50).get();
      snap.forEach((doc) => {
        const d = doc.data();
        if (d && d.identifier && !seen.has(d.identifier)) {
          seen.add(d.identifier);
          list.push({
            identifier: d.identifier,
            attempts: d.attempts || MAX_FAILED_ATTEMPTS,
            remainingMinutes: Math.max(1, Math.ceil((d.lockedUntil - now) / 60000)),
            lockedUntil: new Date(d.lockedUntil).toISOString(),
            lastAttempt: d.lastAttempt ? new Date(d.lastAttempt).toISOString() : new Date().toISOString(),
            lastIp: d.lastIp || "Unknown",
            lastUserAgent: d.lastUserAgent || "Unknown",
          });
        }
      });
    } catch (_) {}
  }

  return list;
}

module.exports = {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  getActiveLockouts,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
};

