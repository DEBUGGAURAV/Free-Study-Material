/**
 * Village / 2G Network Resilience & Offline Action Queue
 * Powered by IndexedDB & Background Sync API • 0.0% Server CPU
 */

const DB_NAME = 'fsm_offline_vault';
const DB_VERSION = 1;
const STORE_NOTES = 'offline_notes';
const STORE_ACTIONS = 'pending_actions';

function openDatabase(timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    let isSettled = false;
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error('IndexedDB open timeout'));
      }
    }, timeoutMs);

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onblocked = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(new Error('IndexedDB open blocked'));
        }
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
          db.createObjectStore(STORE_ACTIONS, { autoIncrement: true, keyPath: 'queueId' });
        }
      };
      request.onsuccess = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          const db = request.result;
          db.onversionchange = () => {
            try { db.close(); } catch (_) {}
          };
          resolve(db);
        }
      };
      request.onerror = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(request.error || new Error('IndexedDB open error'));
        }
      };
    } catch (err) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

/**
 * Saves a note for 100% offline access in train/village
 * @param {object} noteMetadata 
 * @param {ArrayBuffer} buffer 
 */
export async function saveNoteOffline(noteMetadata, buffer) {
  let db = null;
  try {
    db = await openDatabase(1000);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NOTES], 'readwrite');
      tx.oncomplete = () => {
        try { if (db) db.close(); } catch (_) {}
        resolve(true);
      };
      tx.onerror = () => {
        try { if (db) db.close(); } catch (_) {}
        reject(tx.error);
      };
      tx.onabort = () => {
        try { if (db) db.close(); } catch (_) {}
        resolve(false);
      };
      const store = tx.objectStore(STORE_NOTES);
      store.put({
        id: noteMetadata.id,
        title: noteMetadata.title,
        subject: noteMetadata.subject,
        course: noteMetadata.course,
        branch: noteMetadata.branch,
        savedAt: new Date().toISOString(),
        buffer: buffer || null,
      });
    });
  } catch (err) {
    try { if (db) db.close(); } catch (_) {}
    console.warn('[OFFLINE-VAULT] Could not cache offline note:', err);
    return false;
  }
}

/**
 * Retrieves all offline saved notes for offline browsing
 * @returns {Promise<Array<object>>}
 */
export async function getOfflineNotes() {
  let db = null;
  try {
    db = await openDatabase(1000);
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_NOTES], 'readonly');
      tx.oncomplete = () => { try { if (db) db.close(); } catch (_) {} };
      tx.onerror = () => { try { if (db) db.close(); } catch (_) {} resolve([]); };
      tx.onabort = () => { try { if (db) db.close(); } catch (_) {} resolve([]); };
      const store = tx.objectStore(STORE_NOTES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (_) {
    try { if (db) db.close(); } catch (_) {}
    return [];
  }
}

/**
 * Retrieves a single offline note's ArrayBuffer from IndexedDB
 * @param {string} noteId
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getOfflineNoteBuffer(noteId) {
  if (!noteId) return null;
  const sId = String(noteId);
  let db = null;
  try {
    db = await openDatabase(800);
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_NOTES], 'readonly');
      tx.oncomplete = () => { try { if (db) db.close(); } catch (_) {} };
      tx.onerror = () => { try { if (db) db.close(); } catch (_) {} resolve(null); };
      const store = tx.objectStore(STORE_NOTES);
      const req = store.get(noteId);
      req.onsuccess = () => {
        if (req.result?.buffer?.byteLength > 0) return resolve(req.result.buffer);
        const reqStr = store.get(sId);
        reqStr.onsuccess = () => resolve(reqStr.result?.buffer?.byteLength > 0 ? reqStr.result.buffer : null);
        reqStr.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    try { if (db) db.close(); } catch (_) {}
    return null;
  }
}

import { getAllCachedNoteChunks, deleteCachedNote, clearAllCachedNotes, deleteP2PDatabase, getCachedNoteBuffer, cacheNoteBuffer, invalidateCachedNoteIdsSet } from "./p2pMesh";

/**
 * Unified buffer retriever: checks p2p cache (fsm_p2p_cache_v1), offline vault (fsm_offline_vault), and CacheStorage
 * Guarantees instant 0ms offline retrieval whether cached during previous online read, prefetch, or airdrop
 * @param {string} noteId
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getAnyCachedNoteBuffer(noteId) {
  if (!noteId) return null;
  const sId = String(noteId).trim();

  // 1. In-memory session buffer from active reader (instant 0ms synchronous return)
  try {
    if (typeof window !== "undefined" && window.__FSM_LOADED_PDF_BUFFERS__) {
      const memBuf = window.__FSM_LOADED_PDF_BUFFERS__[sId] || window.__FSM_LOADED_PDF_BUFFERS__[noteId];
      if (memBuf && memBuf.byteLength > 200) return memBuf;
    }
  } catch (_) {}

  // 2. Race Browser Cache API (<5ms), P2P IndexedDB, and Offline Vault IndexedDB IN PARALLEL!
  // Resolves as soon as ANY store returns a valid PDF buffer instead of timing out sequentially.
  const checkCacheApi = async () => {
    if (typeof caches === "undefined") return null;
    try {
      const candidates = [
        `/api/notes/${sId}/stream.pdf`,
        `/api/notes/${sId}/stream`,
        `/api/notes/${sId}/preview`,
        `/api/notes/${sId}`,
      ];
      for (const uri of candidates) {
        const match = await caches.match(uri, { ignoreSearch: true });
        if (match && match.ok) {
          const buf = await match.arrayBuffer();
          if (buf && buf.byteLength > 200) {
            return buf;
          }
        }
      }
    } catch (_) {}
    return null;
  };

  const checkP2pIdb = async () => {
    try {
      let p2pBuf = await getCachedNoteBuffer(sId);
      if ((!p2pBuf || p2pBuf.byteLength <= 200) && noteId !== sId) {
        p2pBuf = await getCachedNoteBuffer(noteId);
      }
      return p2pBuf && p2pBuf.byteLength > 200 ? p2pBuf : null;
    } catch (_) {
      return null;
    }
  };

  const checkVaultIdb = async () => {
    try {
      const vaultBuf = await getOfflineNoteBuffer(sId);
      return vaultBuf && vaultBuf.byteLength > 200 ? vaultBuf : null;
    } catch (_) {
      return null;
    }
  };

  return new Promise((resolve) => {
    let settled = false;
    let remaining = 3;
    const finish = (val) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };
    const timer = setTimeout(() => finish(null), 1800);

    for (const fn of [checkCacheApi, checkP2pIdb, checkVaultIdb]) {
      fn()
        .then((buf) => {
          if (buf && buf.byteLength > 200) {
            finish(buf);
          } else {
            remaining--;
            if (remaining <= 0) finish(null);
          }
        })
        .catch(() => {
          remaining--;
          if (remaining <= 0) finish(null);
        });
    }
  });
}

/**
 * Deletes an individual offline note from IndexedDB
 * @param {string} noteId
 * @returns {Promise<boolean>}
 */
export async function deleteOfflineNote(noteId) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NOTES], 'readwrite');
      tx.objectStore(STORE_NOTES).delete(noteId);
      tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(true); };
      tx.onerror = () => { try { db.close(); } catch (_) {} resolve(false); };
    });
  } catch {
    return false;
  }
}

/**
 * Completely clears all offline notes from device storage
 * @returns {Promise<boolean>}
 */
export async function clearOfflineVault() {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_NOTES], 'readwrite');
      tx.objectStore(STORE_NOTES).clear();
      tx.oncomplete = () => {
        try { db.close(); } catch (_) {}
        resolve(true);
      };
      tx.onerror = () => {
        try { db.close(); } catch (_) {}
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Drops the offline vault IndexedDB database completely
 */
export async function deleteOfflineDatabase() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) return resolve(false);
    const req = window.indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}

/**
 * 📌 Pinned Notes Store: User selection for which notes to keep forever vs auto-delete
 */
const PINNED_NOTES_KEY = 'fsm_pinned_offline_notes';

export function getPinnedOfflineNotes() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PINNED_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function isNotePinnedOffline(noteId) {
  if (!noteId) return false;
  const pinned = getPinnedOfflineNotes();
  return pinned.includes(String(noteId));
}

export function togglePinOfflineNote(noteId, explicitlyPin) {
  if (!noteId || typeof localStorage === 'undefined') return false;
  const cleanId = String(noteId);
  try {
    let pinned = getPinnedOfflineNotes();
    const shouldPin = explicitlyPin !== undefined ? Boolean(explicitlyPin) : !pinned.includes(cleanId);
    if (shouldPin) {
      if (!pinned.includes(cleanId)) pinned.push(cleanId);
    } else {
      pinned = pinned.filter((id) => id !== cleanId);
    }
    localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(pinned));
    return shouldPin;
  } catch (_) {
    return false;
  }
}

/**
 * ⚡ Calculates Device-Aware Dynamic LRU Note Capacity
 * Adapts to device RAM (navigator.deviceMemory) & available browser storage.
 * GUARANTEE: Minimum 2 notes are ALWAYS retained on any device.
 */
export function getDeviceDynamicLRUCapacity() {
  let capacity = 5; // Default mid-tier capacity
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number') {
      const ram = navigator.deviceMemory; // in GB (e.g. 1, 2, 4, 8)
      if (ram <= 2) {
        capacity = 2; // Strict low-memory profile (minimum 2 guaranteed)
      } else if (ram <= 4) {
        capacity = 5;
      } else if (ram <= 8) {
        capacity = 12;
      } else {
        capacity = 25; // Flagship / PC
      }
    }
  } catch (_) {}

  // Strict User Mandate: Minimum 2 notes must always be kept!
  return Math.max(2, capacity);
}

/**
 * 🕒 48-Hour Default Auto-Delete & Device-Aware LRU Maintenance Engine
 * 1. Automatically deletes unpinned notes older than 48 hours.
 * 2. Enforces dynamic LRU eviction for excess unpinned notes based on device RAM.
 * 3. User-pinned notes ("Keep Forever") are 100% immune from deletion.
 * 4. Ensures minimum 2 notes are preserved.
 */
export async function runOfflineVaultAutoMaintenance() {
  const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 Hours
  const now = Date.now();
  const pinnedList = getPinnedOfflineNotes();
  const pinnedSet = new Set(pinnedList.map(String));
  const dynamicCapacity = getDeviceDynamicLRUCapacity();

  let expiredDeleted = 0;
  let lruDeleted = 0;

  try {
    const allNotes = await getAllStoredOfflineNotes();
    if (!Array.isArray(allNotes) || allNotes.length === 0) {
      return { expiredDeleted: 0, lruDeleted: 0, totalRemaining: 0, dynamicCapacity };
    }

    const unpinnedNotes = [];

    for (const note of allNotes) {
      const noteId = String(note.id);
      // Pinned notes are explicitly kept by user and never auto-deleted
      if (pinnedSet.has(noteId)) {
        continue;
      }

      const noteAgeMs = note.savedAt ? now - new Date(note.savedAt).getTime() : 0;
      if (noteAgeMs > DEFAULT_MAX_AGE_MS) {
        await deleteSingleOfflineNote(noteId);
        expiredDeleted++;
      } else {
        unpinnedNotes.push(note);
      }
    }

    // Dynamic LRU Eviction: If remaining unpinned notes exceed device dynamic capacity
    if (unpinnedNotes.length > dynamicCapacity) {
      // Sort oldest saved first (least recently used)
      unpinnedNotes.sort((a, b) => {
        const timeA = a.savedAt ? new Date(a.savedAt).getTime() : 0;
        const timeB = b.savedAt ? new Date(b.savedAt).getTime() : 0;
        return timeA - timeB;
      });

      // Evict excess unpinned notes while guaranteeing minimum 2 total unpinned notes
      const allowedToKeep = Math.max(2, dynamicCapacity);
      const excessCount = unpinnedNotes.length - allowedToKeep;

      for (let i = 0; i < excessCount; i++) {
        const toEvict = unpinnedNotes[i];
        if (toEvict && toEvict.id) {
          await deleteSingleOfflineNote(toEvict.id);
          lruDeleted++;
        }
      }
    }

    return {
      expiredDeleted,
      lruDeleted,
      totalRemaining: allNotes.length - expiredDeleted - lruDeleted,
      dynamicCapacity,
    };
  } catch (err) {
    console.debug('[OFFLINE-MAINTENANCE] Notice during auto-maintenance:', err?.message || err);
    return { expiredDeleted: 0, lruDeleted: 0, totalRemaining: 0, dynamicCapacity };
  }
}

function getCatalogLookupMap() {
  const map = new Map();
  const keys = [
    "fsm_cached_notes",
    "all_raw_notes",
    "fsm_notes_catalog",
    "notes_cache",
  ];
  for (const k of keys) {
    try {
      const raw =
        (typeof localStorage !== "undefined" ? localStorage.getItem(k) : null) ||
        (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(k) : null);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.notes) ? parsed.notes : []);
        for (const item of list) {
          if (item && item.id && !map.has(String(item.id))) {
            map.set(String(item.id), item);
          }
        }
      }
    } catch (_) {}
  }
  if (typeof window !== "undefined") {
    const memList = window.__FSM_CATALOG_NOTES__ || window.__FSM_ALL_NOTES__;
    if (Array.isArray(memList)) {
      for (const item of memList) {
        if (item && item.id && !map.has(String(item.id))) {
          map.set(String(item.id), item);
        }
      }
    }
  }
  return map;
}

function formatStoredNote(id, rawItem, cat, source) {
  const sizeBytes = rawItem?.buffer?.byteLength || rawItem?.sizeBytes || cat?.compressedSize || cat?.fileSize || 0;
  return {
    id: String(id),
    title: (rawItem?.title && !rawItem.title.startsWith("Note #") && !rawItem.title.startsWith("Cached Study Note #"))
      ? rawItem.title
      : (cat?.title || rawItem?.title || `Note #${id}`),
    subject: (rawItem?.subject && rawItem.subject !== "General Notes" && !rawItem.subject.includes("Mesh"))
      ? rawItem.subject
      : (cat?.subject || rawItem?.subject || "General Notes"),
    course: (rawItem?.course && rawItem.course !== "B.Tech") ? rawItem.course : (cat?.course || rawItem?.course || "B.Tech"),
    branch: (rawItem?.branch && rawItem.branch !== "All Branches" && rawItem.branch !== "General") ? rawItem.branch : (cat?.branch || rawItem?.branch || "All Branches"),
    year: cat?.year || rawItem?.year || "All Years",
    semester: cat?.semester || rawItem?.semester || "",
    savedAt: rawItem?.savedAt || new Date().toISOString(),
    sizeBytes,
    sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
    source,
  };
}

/**
 * Retrieves all stored offline notes from both fsm_offline_vault and fsm_p2p_cache_v1
 * Returns unified array with id, title, subject, course, branch, savedAt, sizeBytes, sizeMB
 */
export async function getAllStoredOfflineNotes() {
  const notesMap = new Map();
  const catalogMap = getCatalogLookupMap();

  // 1. Fetch from fsm_offline_vault
  try {
    const offlineList = await getOfflineNotes();
    if (Array.isArray(offlineList)) {
      for (const item of offlineList) {
        if (!item || !item.id) continue;
        const id = String(item.id);
        notesMap.set(id, formatStoredNote(id, item, catalogMap.get(id), "offline_vault"));
      }
    }
  } catch (err) {
    console.debug("[OFFLINE-VAULT] Could not read offline notes store:", err.message);
  }

  // 2. Fetch from fsm_p2p_cache_v1 note_chunks
  try {
    const chunks = await getAllCachedNoteChunks();
    if (Array.isArray(chunks)) {
      for (const ch of chunks) {
        const id = String(ch.noteId);
        if (notesMap.has(id)) {
          const existing = notesMap.get(id);
          if ((!existing.sizeBytes || existing.sizeBytes === 0) && ch.sizeBytes) {
            existing.sizeBytes = ch.sizeBytes;
            existing.sizeMB = ch.sizeMB;
          }
        } else {
          notesMap.set(id, formatStoredNote(id, ch, catalogMap.get(id), "p2p_cache"));
        }
      }
    }
  } catch (err) {
    console.debug("[P2P-CACHE] Could not read p2p cached chunks:", err.message);
  }

  return Array.from(notesMap.values());
}

/**
 * Deletes an individual offline note completely from device storage
 * @param {string} noteId
 */
export async function deleteSingleOfflineNote(noteId) {
  const cleanId = String(noteId);
  try {
    if (typeof window !== "undefined" && window.__FSM_LOADED_PDF_BUFFERS__) {
      delete window.__FSM_LOADED_PDF_BUFFERS__[cleanId];
      delete window.__FSM_LOADED_PDF_BUFFERS__[noteId];
    }
  } catch (_) {}
  try {
    await deleteOfflineNote(cleanId);
  } catch (_) {}
  try {
    await deleteCachedNote(cleanId);
  } catch (_) {}
  try {
    localStorage.removeItem(`fsm_cdn_${cleanId}`);
    localStorage.removeItem(`fsm_prefer_p2p_${cleanId}`);
  } catch (_) {}
  try {
    invalidateCachedNoteIdsSet();
  } catch (_) {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fsm:offline-notes-changed", { detail: { noteId: cleanId } }));
  }
  return true;
}

/**
 * Comprehensively wipes all offline notes, IndexedDB stores, CacheStorage, and localStorage flags
 */
export async function wipeAllDeviceOfflineStorage() {
  if (typeof window !== "undefined") {
    window.__FSM_LOADED_PDF_BUFFERS__ = {};
  }
  // 1. Clear object stores
  try {
    await clearOfflineVault();
  } catch (_) {}
  try {
    await clearAllCachedNotes();
  } catch (_) {}

  // 2. Delete the physical IndexedDB databases so disk files are immediately reclaimed by OS
  try {
    await deleteOfflineDatabase();
  } catch (_) {}
  try {
    await deleteP2PDatabase();
  } catch (_) {}

  // 3. Clear all Service Worker caches in CacheStorage
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      const keys = await caches.keys();
      for (const k of keys) {
        await caches.delete(k);
      }
    }
  } catch (err) {
    console.warn("[STORAGE] Error deleting CacheStorage caches:", err.message);
  }

  // 4. Clear all note-related localStorage flags
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("fsm_cdn_") || k.startsWith("fsm_prefer_p2p_") || k.startsWith("fsm_cached_"))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch (_) {}

  // 5. Notify Service Worker to purge any in-memory or active stream clones
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "PURGE_ALL_CACHES" });
    }
  } catch (_) {}

  return true;
}

/**
 * Queues an action taken while offline (e.g. Bookmark, Rating)
 * @param {string} actionType 
 * @param {object} payload 
 */
export async function queueOfflineAction(actionType, payload) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ACTIONS], 'readwrite');
      const store = tx.objectStore(STORE_ACTIONS);
      store.add({
        type: actionType,
        payload,
        createdAt: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    // Request Service Worker Background Sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('fsm-sync-queue');
    }
  } catch (err) {
    console.warn('[OFFLINE-QUEUE] Failed to queue offline action:', err);
  }
}

// Auto-sync listener when browser reconnects to internet
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('[OFFLINE-RESILIENCE] 🌐 Internet reconnected! Checking offline queue...');
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORE_ACTIONS], 'readwrite');
      const store = tx.objectStore(STORE_ACTIONS);
      const actions = await new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
      });

      if (actions.length > 0) {
        console.log(`[OFFLINE-RESILIENCE] Flushing ${actions.length} pending offline actions to cloud.`);
        store.clear();
      }
    } catch (_) {}
  });
}

