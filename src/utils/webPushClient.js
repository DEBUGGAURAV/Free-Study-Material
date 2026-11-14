/**
 * 🔔 Native Web Push Client Helper (VAPID + Service Worker)
 * Zero-cost browser notifications without third-party push SaaS.
 */

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const clean = String(base64String || "").trim();
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getWebPushStatus() {
  if (!isWebPushSupported()) {
    return { supported: false, subscribed: false, permission: "unsupported" };
  }
  try {
    // Resilient timeout race so we never hang indefinitely on SW ready
    const swRegPromise = (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) return reg;
      } catch (_) {}
      return navigator.serviceWorker.ready;
    })();

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
    const reg = await Promise.race([swRegPromise, timeoutPromise]);

    if (!reg || !reg.pushManager) {
      return { supported: true, subscribed: false, permission: Notification?.permission || "default" };
    }

    const sub = await reg.pushManager.getSubscription().catch(() => null);
    return {
      supported: true,
      subscribed: Boolean(sub),
      permission: Notification?.permission || "default",
      endpoint: sub?.endpoint || null,
    };
  } catch {
    return { supported: true, subscribed: false, permission: Notification?.permission || "default" };
  }
}

export async function subscribeWebPush() {
  if (!isWebPushSupported()) {
    throw new Error("Push notifications are not supported in this browser. On iPhone Safari, use Add to Home Screen first.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const keyRes = await fetch("/api/push/vapid-key", { credentials: "include" });
  const keyData = await keyRes.json();
  if (!keyRes.ok || !keyData.publicKey) {
    throw new Error(keyData.message || "Failed to fetch VAPID public key");
  }
  if (keyData.enabled === false) {
    throw new Error("Push notifications are currently disabled by the Administrator.");
  }

  let reg = null;
  try {
    reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => null);
    }
  } catch (_) {}

  if (!reg) {
    reg = await navigator.serviceWorker.ready;
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
  }

  const saveRes = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const saveData = await saveRes.json();
  if (!saveRes.ok || !saveData.success) {
    throw new Error(saveData.message || "Failed to save device push subscription");
  }

  return { subscribed: true, subscription, subscriberCount: saveData.subscriberCount };
}

export async function unsubscribeWebPush() {
  if (!isWebPushSupported()) return { subscribed: false };
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return { subscribed: false };

  const endpoint = subscription.endpoint;
  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch (_) {}

  await subscription.unsubscribe();
  return { subscribed: false };
}
