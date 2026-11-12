/**
 * ============================================================================
 * 🧠 INTELLIGENT CONDITION-BASED INDEXEDDB CACHING ENGINE
 * ============================================================================
 * Automatically pre-caches and preserves academic documents in IndexedDB 
 * based on 3 distinct student conditions:
 * 
 * 1. Condition "Recent": Recently opened / studied notes (Top recent reads)
 * 2. Condition "Subject": Other notes sharing the same subject as current note
 * 3. Condition "New": Newly uploaded / latest university notes
 * 
 * Performance & Guardrails:
 * - Runs in background idle-time (requestIdleCallback / setTimeout)
 * - Zero impact on active PDF canvas reader rendering or student scrolling
 * - Never runs if student enabled "Save-Data" mode in browser
 * - Sequential single-stream background queue (never spikes student Wi-Fi / 4G)
 * ============================================================================
 */

import { getAnyCachedNoteBuffer } from "./offlineQueue";
import "./p2pMesh";
import { saveToClientOfflineStorage } from "./cdnFailover";

let isPrecacheRunning = false;
const precachedIdsInSession = new Set();

/**
 * Safely parse JSON from localStorage
 */
function getStorageItem(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Retrieve notes catalog from client storage
 */
function getStoredCatalog() {
  const cached = getStorageItem("fsm_cached_notes");
  return Array.isArray(cached) ? cached : [];
}

/**
 * Retrieve recent notes list from client storage
 */
function getRecentNotesList() {
  const recent = getStorageItem("fsm_student_recent_notes");
  return Array.isArray(recent) ? recent : [];
}

/**
 * Fetch a single note buffer in the background and store in IndexedDB
 */
async function fetchAndStoreSingleNote(note, conditionTag = "general") {
  if (!note || !note.id) return false;
  const noteId = String(note.id).trim();

  // Skip if already processed in this session
  if (precachedIdsInSession.has(noteId)) return true;

  try {
    // 1. Check if already present in IndexedDB
    const existing = await getAnyCachedNoteBuffer(noteId);
    if (existing && existing.byteLength > 500) {
      precachedIdsInSession.add(noteId);
      return true;
    }

    // 2. Fetch in background (low priority stream)
    const token = typeof window !== "undefined" ? (localStorage.getItem("vault_token") || "") : "";
    const url = `/api/notes/${noteId}/stream.pdf?preview=1${token ? `&token=${encodeURIComponent(token)}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s safety timeout

    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      credentials: "include",
    });
    clearTimeout(timeout);

    if (!res.ok) return false;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream") && res.status !== 206 && res.status !== 200) {
      return false;
    }

    const buffer = await res.arrayBuffer();
    if (buffer && buffer.byteLength > 500) {
      // 3. Save to IndexedDB (fsm_offline_vault AND fsm_p2p_cache_v1)
      saveToClientOfflineStorage(noteId, note, buffer);
      precachedIdsInSession.add(noteId);
      console.log(`[SMART-CACHE] 📦 [Condition: ${conditionTag}] Auto-stored into IndexedDB: "${note.title || noteId}" (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB)`);
      return true;
    }
  } catch (err) {
    console.debug(`[SMART-CACHE] Background note pre-cache notice for ${noteId}:`, err.message);
  }
  return false;
}

/**
 * ⚡ Intelligently pre-caches notes according to conditions:
 *   - Condition 1: Same Subject related notes
 *   - Condition 2: Recently viewed notes
 *   - Condition 3: New / latest notes
 * 
 * @param {object} currentNote - Currently opened note (optional)
 * @param {Array} catalog - Current full notes catalog (optional)
 */
export async function smartPrecacheConditionNotes(currentNote = null, catalog = null) {
  // Prevent parallel overlapping runs
  if (isPrecacheRunning) return;

  // Respect user battery / save-data / slow-network preference
  if (typeof navigator !== "undefined") {
    if (!navigator.onLine) return;
    if (navigator.connection?.saveData === true) return;
    const effType = navigator.connection?.effectiveType;
    if (effType === "slow-2g" || effType === "2g") return;
  }

  isPrecacheRunning = true;

  try {
    const allNotes = Array.isArray(catalog) && catalog.length > 0 ? catalog : getStoredCatalog();
    if (!allNotes || allNotes.length === 0) return;

    const recentNotes = getRecentNotesList();
    const candidates = [];
    const addedIds = new Set();

    if (currentNote && currentNote.id) {
      addedIds.add(String(currentNote.id));
    }

    // =========================================================================
    // CONDITION 1: Same Subject Related Notes
    // =========================================================================
    if (currentNote && currentNote.subject) {
      const targetSubj = String(currentNote.subject).trim().toLowerCase();
      if (targetSubj) {
        const subjectMatches = allNotes.filter((n) => {
          if (!n || !n.id || addedIds.has(String(n.id))) return false;
          const s = String(n.subject || "").trim().toLowerCase();
          return s && (s === targetSubj || s.includes(targetSubj) || targetSubj.includes(s));
        });

        // Take top 2 related subject notes
        for (const n of subjectMatches.slice(0, 2)) {
          candidates.push({ note: n, condition: `Subject: ${currentNote.subject}` });
          addedIds.add(String(n.id));
        }
      }
    }

    // =========================================================================
    // CONDITION 2: Recently Opened / Studied Notes
    // =========================================================================
    for (const r of recentNotes.slice(0, 3)) {
      if (!r || !r.id || addedIds.has(String(r.id))) continue;
      const fullNote = allNotes.find((n) => String(n.id) === String(r.id)) || r;
      candidates.push({ note: fullNote, condition: "Recently Viewed" });
      addedIds.add(String(r.id));
    }

    // =========================================================================
    // CONDITION 3: New / Latest Notes According to Condition
    // =========================================================================
    const sortedLatest = [...allNotes].sort((a, b) => {
      const timeA = a._sortTimestamp || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b._sortTimestamp || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeB - timeA;
    });

    for (const n of sortedLatest.slice(0, 2)) {
      if (!n || !n.id || addedIds.has(String(n.id))) continue;
      candidates.push({ note: n, condition: "New / Latest" });
      addedIds.add(String(n.id));
    }

    // Limit background home precache to max 2 lightweight notes so post-login browsing stays snappy
    const boundedCandidates = currentNote ? candidates.slice(0, 4) : candidates.slice(0, 2);
    for (const item of boundedCandidates) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      const sizeBytes = Number(item.note?.compressedSize || item.note?.fileSize || 0);
      if (sizeBytes > 8 * 1024 * 1024) continue;
      await fetchAndStoreSingleNote(item.note, item.condition);
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (err) {
    console.debug("[SMART-CACHE] Condition pre-cache notice:", err.message);
  } finally {
    isPrecacheRunning = false;
  }
}

/**
 * Idle Catalog Precache for Home Page (deferred so initial post-login render/scroll stays instant)
 */
let idlePrecacheTimer = null;
export function triggerIdleCatalogPrecache(catalog = null) {
  if (typeof window === "undefined") return;
  if (idlePrecacheTimer) clearTimeout(idlePrecacheTimer);
  idlePrecacheTimer = setTimeout(() => {
    idlePrecacheTimer = null;
    const runner = () => smartPrecacheConditionNotes(null, catalog);
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(runner, { timeout: 6000 });
    } else {
      runner();
    }
  }, 10000);
}
