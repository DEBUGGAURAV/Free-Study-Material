// src/utils/authIndexedDb.js
/**
 * 🛡️ Persistent Client-Side Auth Vault (IndexedDB)
 * Stores authenticated JWT session and student profile across browser sessions,
 * tab closures, and localStorage cache-clear events.
 */

const DB_NAME = "freeStudyAuth";
const DB_VERSION = 2;
const STORE = "session";
const KEY_TOKEN = "jwt";
const KEY_USER = "currentUser";

/** Safely open (or create) the IndexedDB database */
function openDb() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        console.warn("[AuthIndexedDB] Open failed:", request.error);
        resolve(null);
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onblocked = () => {
        console.warn("[AuthIndexedDB] Database open blocked");
        resolve(null);
      };
    } catch (err) {
      console.warn("[AuthIndexedDB] Exception opening db:", err);
      resolve(null);
    }
  });
}

/** Save JWT token and optional student user profile to IndexedDB */
export async function saveAuthSession(token, user = null) {
  if (typeof window !== "undefined") {
    if (token) window.__FSM_AUTH_TOKEN__ = token;
    if (user) window.__FSM_CURRENT_USER__ = user;
    window.__FSM_AUTH_SESSION__ = {
      token: token || window.__FSM_AUTH_TOKEN__ || null,
      user: user || window.__FSM_CURRENT_USER__ || null,
    };
  }
  try {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (token) {
        store.put(token, KEY_TOKEN);
      }
      if (user) {
        store.put(user, KEY_USER);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("[AuthIndexedDB] Save error:", tx.error);
        resolve(false);
      };
      tx.onabort = () => resolve(false);
    });
  } catch (err) {
    console.warn("[AuthIndexedDB] saveAuthSession exception:", err);
    return false;
  }
}

/** Load JWT token and student user profile from IndexedDB */
export async function loadAuthSession() {
  try {
    const db = await openDb();
    if (!db) return { token: null, user: null };
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const reqToken = store.get(KEY_TOKEN);
      const reqUser = store.get(KEY_USER);

      let token = null;
      let user = null;

      reqToken.onsuccess = () => {
        token = reqToken.result || null;
        if (token && typeof window !== "undefined") {
          window.__FSM_AUTH_TOKEN__ = token;
        }
      };
      reqUser.onsuccess = () => {
        user = reqUser.result || null;
        if (user && typeof window !== "undefined") {
          window.__FSM_CURRENT_USER__ = user;
        }
      };

      tx.oncomplete = () => {
        if (typeof window !== "undefined") {
          window.__FSM_AUTH_SESSION__ = { token, user };
        }
        resolve({ token, user });
      };
      tx.onerror = () => {
        resolve({ token: null, user: null });
      };
      tx.onabort = () => {
        resolve({ token: null, user: null });
      };
    });
  } catch (err) {
    console.warn("[AuthIndexedDB] loadAuthSession exception:", err);
    return { token: null, user: null };
  }
}

/** Wipe session store on logout */
export async function clearAuthSession() {
  try {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.delete(KEY_TOKEN);
      store.delete(KEY_USER);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}

// Backwards compatibility aliases
export async function saveAuthToken(token) {
  return saveAuthSession(token, null);
}

export async function loadAuthToken() {
  const session = await loadAuthSession();
  return session.token;
}

export async function clearAuthToken() {
  return clearAuthSession();
}
