// src/utils/authIndexedDb.js
const DB_NAME = "freeStudyAuth";
const STORE = "session";
const KEY = "jwt";

/** Open (or create) the IndexedDB database */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

/** Save the JWT token */
export async function saveAuthToken(token) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(token, KEY);
  await tx.complete;
}

/** Load the JWT token – returns null if none stored */
export async function loadAuthToken() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const token = await tx.objectStore(STORE).get(KEY);
  await tx.complete;
  return token || null;
}

/** Clear the token (used on logout) */
export async function clearAuthToken() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(KEY);
  await tx.complete;
}

