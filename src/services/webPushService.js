/**
 * 🔔 Native Web Push Notification Service (VAPID + Service Worker)
 * Zero-cost browser push dispatch using Web Push Protocol (FCM / Mozilla / Apple Push).
 * Persists auto-generated VAPID keys in Firestore (`settings/web_push_vapid`) or env vars
 * and stores device subscriptions in `push_subscriptions` with an in-memory cache (0 read waste).
 */

const crypto = require("crypto");
const webpush = require("web-push");
const { db } = require("../firebase");
const { getSiteUrl } = require("../config/siteConfig");

const VAPID_DOC_PATH = "settings";
const VAPID_DOC_ID = "web_push_vapid";
const SUBS_COLLECTION = "push_subscriptions";

let cachedVapidKeys = null;
let vapidInitPromise = null;

// In-memory subscription mirror to minimize Firestore reads and support offline/local dev
const memorySubs = new Map();
let subsLoadedFromDb = false;
let lastSubsLoadAt = 0;
const SUBS_CACHE_TTL_MS = 60 * 1000;

const pushTelemetry = {
  totalSent: 0,
  totalFailed: 0,
  prunedExpired: 0,
  lastBroadcastAt: null,
  lastBroadcastTitle: "",
};

function hashEndpoint(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "")).digest("hex").slice(0, 32);
}

function getContactSubject() {
  const configured = (process.env.VAPID_SUBJECT || "").trim();
  if (configured && (configured.startsWith("mailto:") || configured.startsWith("https://"))) {
    return configured;
  }
  return `mailto:support@${new URL(getSiteUrl() || "https://freestudymaterial.pages.dev").hostname}`;
}

function isWebPushEnabledByAdmin() {
  try {
    const adminRoutes = require("../routes/admin");
    if (adminRoutes && typeof adminRoutes.getTechSettings === "function") {
      const settings = adminRoutes.getTechSettings();
      return settings?.enableWebPush !== false;
    }
  } catch (_) {}
  return true;
}

/**
 * Ensures VAPID keypair exists (env -> Firestore -> auto-generated) and configures web-push.
 */
async function ensureVapidKeys() {
  if (cachedVapidKeys) return cachedVapidKeys;
  if (vapidInitPromise) return vapidInitPromise;

  vapidInitPromise = (async () => {
    const envPublic = (process.env.VAPID_PUBLIC_KEY || "").trim();
    const envPrivate = (process.env.VAPID_PRIVATE_KEY || "").trim();
    const subject = getContactSubject();

    if (envPublic && envPrivate) {
      webpush.setVapidDetails(subject, envPublic, envPrivate);
      cachedVapidKeys = { publicKey: envPublic, privateKey: envPrivate, subject, source: "env" };
      return cachedVapidKeys;
    }

    try {
      if (db) {
        const docRef = db.collection(VAPID_DOC_PATH).doc(VAPID_DOC_ID);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          if (data.publicKey && data.privateKey) {
            webpush.setVapidDetails(subject, data.publicKey, data.privateKey);
            cachedVapidKeys = {
              publicKey: data.publicKey,
              privateKey: data.privateKey,
              subject,
              source: "firestore",
            };
            return cachedVapidKeys;
          }
        }

        const generated = webpush.generateVAPIDKeys();
        await docRef.set({
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
          subject,
          createdAt: new Date().toISOString(),
        });
        webpush.setVapidDetails(subject, generated.publicKey, generated.privateKey);
        cachedVapidKeys = {
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
          subject,
          source: "firestore_generated",
        };
        return cachedVapidKeys;
      }
    } catch (err) {
      console.warn("[WEB-PUSH] Firestore VAPID init fallback:", err.message);
    }

    const ephemeral = webpush.generateVAPIDKeys();
    webpush.setVapidDetails(subject, ephemeral.publicKey, ephemeral.privateKey);
    cachedVapidKeys = {
      publicKey: ephemeral.publicKey,
      privateKey: ephemeral.privateKey,
      subject,
      source: "memory",
    };
    return cachedVapidKeys;
  })();

  try {
    return await vapidInitPromise;
  } finally {
    vapidInitPromise = null;
  }
}

async function loadSubscriptionsIfNeeded(force = false) {
  if (!db) return Array.from(memorySubs.values());
  const now = Date.now();
  if (!force && subsLoadedFromDb && now - lastSubsLoadAt < SUBS_CACHE_TTL_MS) {
    return Array.from(memorySubs.values());
  }

  try {
    const snap = await db.collection(SUBS_COLLECTION).limit(5000).get();
    memorySubs.clear();
    snap.forEach((doc) => {
      const data = doc.data();
      if (data && data.subscription && data.subscription.endpoint) {
        memorySubs.set(doc.id, { id: doc.id, ...data });
      }
    });
    subsLoadedFromDb = true;
    lastSubsLoadAt = now;
  } catch (err) {
    console.warn("[WEB-PUSH] Could not load subscriptions from Firestore:", err.message);
  }
  return Array.from(memorySubs.values());
}

async function getPublicVapidKey() {
  const keys = await ensureVapidKeys();
  return {
    publicKey: keys.publicKey,
    subject: keys.subject,
    source: keys.source,
    enabled: isWebPushEnabledByAdmin(),
  };
}

async function subscribeDevice(subscription, meta = {}) {
  if (!subscription || typeof subscription.endpoint !== "string" || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("Invalid browser PushSubscription object");
  }

  await ensureVapidKeys();
  const id = hashEndpoint(subscription.endpoint);
  const now = new Date().toISOString();
  const record = {
    id,
    subscription: {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    },
    userId: meta.userId || null,
    userEmail: meta.userEmail || null,
    userAgent: String(meta.userAgent || "").slice(0, 180),
    updatedAt: now,
  };

  memorySubs.set(id, record);

  if (db) {
    try {
      await db.collection(SUBS_COLLECTION).doc(id).set(record, { merge: true });
    } catch (err) {
      console.warn("[WEB-PUSH] Firestore save subscription warning:", err.message);
    }
  }

  return { id, subscriberCount: memorySubs.size };
}

async function unsubscribeDevice(endpoint) {
  if (!endpoint || typeof endpoint !== "string") {
    return { removed: false };
  }
  const id = hashEndpoint(endpoint);
  const existed = memorySubs.delete(id);

  if (db) {
    try {
      await db.collection(SUBS_COLLECTION).doc(id).delete();
    } catch (err) {
      console.warn("[WEB-PUSH] Firestore delete subscription warning:", err.message);
    }
  }

  return { removed: existed, subscriberCount: memorySubs.size };
}

async function getPushStats() {
  const keys = await ensureVapidKeys();
  const subs = await loadSubscriptionsIfNeeded(false);
  return {
    enabled: isWebPushEnabledByAdmin(),
    vapidReady: Boolean(keys && keys.publicKey),
    vapidSource: keys?.source || "none",
    subscriberCount: subs.length,
    totalSent: pushTelemetry.totalSent,
    totalFailed: pushTelemetry.totalFailed,
    prunedExpired: pushTelemetry.prunedExpired,
    lastBroadcastAt: pushTelemetry.lastBroadcastAt,
    lastBroadcastTitle: pushTelemetry.lastBroadcastTitle,
  };
}

/**
 * Broadcasts a Web Push payload to all subscribed devices in batches of 20.
 */
async function broadcastPushNotification({
  title = "Free Study Material",
  body = "New study notes & exam updates are live!",
  url = "/",
  tag = "fsm-update",
  ignoreAdminFlag = false,
} = {}) {
  if (!ignoreAdminFlag && !isWebPushEnabledByAdmin()) {
    return { skipped: true, reason: "disabled_by_admin", sent: 0, failed: 0, pruned: 0 };
  }

  await ensureVapidKeys();
  const subs = await loadSubscriptionsIfNeeded(true);
  if (!subs.length) {
    return { skipped: false, reason: "no_subscribers", sent: 0, failed: 0, pruned: 0, totalTargets: 0 };
  }

  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body: String(body).slice(0, 240),
    url: String(url || "/"),
    tag: String(tag || "fsm-update"),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  const CHUNK_SIZE = 20;
  for (let i = 0; i < subs.length; i += CHUNK_SIZE) {
    const chunk = subs.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          await webpush.sendNotification(item.subscription, payload, { TTL: 86400 });
          sent += 1;
        } catch (err) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            pruned += 1;
            await unsubscribeDevice(item.subscription.endpoint);
          } else {
            failed += 1;
          }
        }
      })
    );
  }

  pushTelemetry.totalSent += sent;
  pushTelemetry.totalFailed += failed;
  pushTelemetry.prunedExpired += pruned;
  pushTelemetry.lastBroadcastAt = new Date().toISOString();
  pushTelemetry.lastBroadcastTitle = String(title).slice(0, 120);

  return {
    skipped: false,
    sent,
    failed,
    pruned,
    totalTargets: subs.length,
  };
}

module.exports = {
  getPublicVapidKey,
  subscribeDevice,
  unsubscribeDevice,
  getPushStats,
  broadcastPushNotification,
  hashEndpoint,
};
