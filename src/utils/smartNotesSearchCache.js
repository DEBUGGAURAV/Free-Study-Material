/**
 * ⚡ Browser-Side Smart Search Cache (MiniSearch + IndexedDB)
 * Zero Firestore Reads during typing, branch switching, or offline browsing.
 * Supports:
 *   - Sub-millisecond prefix & fuzzy typo-tolerant search
 *   - Multi-field relevance boosting (title > subject > branch/course > description)
 *   - Persistent IndexedDB catalog caching across reloads & offline sessions
 */

import MiniSearch from "minisearch";

const DB_NAME = "fsm_search_catalog_db";
const DB_VERSION = 1;
const STORE_CATALOG = "catalog";

let activeIndex = null;
let cachedCatalogList = [];
let catalogMap = new Map();

function openCatalogDb(timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB unavailable"));
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("IndexedDB open timeout"));
      }
    }, timeoutMs);

    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_CATALOG)) {
          db.createObjectStore(STORE_CATALOG, { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const db = req.result;
          db.onversionchange = () => {
            try { db.close(); } catch (_) {}
          };
          resolve(db);
        }
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(req.error || new Error("IndexedDB open error"));
        }
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

function normalizeText(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function buildSmartSearchIndex(notesList = []) {
  const validNotes = Array.isArray(notesList) ? notesList.filter((n) => n && n.id) : [];
  cachedCatalogList = validNotes;
  catalogMap = new Map();

  const docs = validNotes.map((n) => {
    const id = String(n.id);
    catalogMap.set(id, n);
    return {
      id,
      title: normalizeText(n.title),
      subject: normalizeText(n.subject),
      branch: normalizeText(n.branch),
      course: normalizeText(n.course),
      year: normalizeText(n.year),
      semester: normalizeText(n.semester),
      category: normalizeText(n.category),
      description: normalizeText(n.description),
      uploaderName: normalizeText(n.uploaderName),
      college: normalizeText(n.college),
      tags: Array.isArray(n.tags) ? n.tags.join(" ") : normalizeText(n.tags),
      ocrText: normalizeText(n.ocrText).slice(0, 2000),
    };
  });

  const mini = new MiniSearch({
    fields: [
      "title",
      "subject",
      "branch",
      "course",
      "year",
      "semester",
      "category",
      "description",
      "uploaderName",
      "college",
      "tags",
      "ocrText",
    ],
    storeFields: ["id"],
    searchOptions: {
      boost: { title: 4, subject: 3, branch: 2, course: 1.5, category: 1.5 },
      prefix: true,
      fuzzy: 0.22,
      combineWith: "AND",
    },
  });

  if (docs.length > 0) {
    mini.addAll(docs);
  }
  activeIndex = mini;
  return validNotes.length;
}

export async function saveNotesCatalogToIdb(notesList = []) {
  const validNotes = Array.isArray(notesList) ? notesList.filter((n) => n && n.id) : [];
  buildSmartSearchIndex(validNotes);

  let db = null;
  try {
    db = await openCatalogDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CATALOG], "readwrite");
      tx.objectStore(STORE_CATALOG).put({
        key: "master_notes_catalog",
        notes: validNotes,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function hydrateNotesCatalogFromIdb() {
  let db = null;
  try {
    db = await openCatalogDb();
    const record = await new Promise((resolve) => {
      const tx = db.transaction([STORE_CATALOG], "readonly");
      const req = tx.objectStore(STORE_CATALOG).get("master_notes_catalog");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (record && Array.isArray(record.notes) && record.notes.length > 0) {
      buildSmartSearchIndex(record.notes);
      return { notes: record.notes, updatedAt: record.updatedAt || 0 };
    }
    return null;
  } catch {
    return null;
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

function matchesFacetFilters(note, { branch, course, year }) {
  if (!note) return false;
  if (branch && branch !== "All") {
    const nb = String(note.branch || "").toLowerCase();
    const targetB = String(branch).toLowerCase();
    if (nb !== targetB) return false;
  }
  if (course && course !== "All" && course !== "All Courses") {
    const nc = String(note.course || "").toLowerCase();
    const targetC = String(course).toLowerCase();
    if (nc !== targetC) return false;
  }
  if (year && year !== "All" && year !== "All Years") {
    const ny = String(note.year || "").toLowerCase();
    const ns = String(note.semester || "").toLowerCase();
    const targetY = String(year).toLowerCase();
    if (ny !== targetY && !ns.includes(targetY)) return false;
  }
  return true;
}

export function searchNotesCatalogLocally({
  query = "",
  branch = "All",
  course = "All Courses",
  year = "All Years",
  fallbackNotes = null,
} = {}) {
  const sourceList = cachedCatalogList.length > 0 ? cachedCatalogList : (Array.isArray(fallbackNotes) ? fallbackNotes : []);
  if (cachedCatalogList.length === 0 && sourceList.length > 0) {
    buildSmartSearchIndex(sourceList);
  }

  const trimmed = String(query || "").trim();
  let matchedNotes = sourceList;

  if (trimmed && activeIndex) {
    // Primary strict AND fuzzy+prefix search
    let results = activeIndex.search(trimmed, {
      prefix: true,
      fuzzy: 0.22,
      combineWith: "AND",
    });

    // Relax to OR if multi-word query had zero exact AND matches
    if (results.length === 0 && trimmed.includes(" ")) {
      results = activeIndex.search(trimmed, {
        prefix: true,
        fuzzy: 0.25,
        combineWith: "OR",
      });
    }

    if (results.length > 0) {
      matchedNotes = results
        .map((r) => catalogMap.get(String(r.id)))
        .filter(Boolean);
    } else {
      // Substring fallback (handles partial tokens inside long strings or codes like BCS-301)
      const qLower = trimmed.toLowerCase();
      matchedNotes = sourceList.filter((n) =>
        [n.title, n.subject, n.branch, n.course, n.category, n.description, n.year, n.college]
          .some((f) => String(f || "").toLowerCase().includes(qLower))
      );
    }
  }

  return matchedNotes.filter((n) => matchesFacetFilters(n, { branch, course, year }));
}

export function hasLocalCatalogReady() {
  return cachedCatalogList.length > 0 && Boolean(activeIndex);
}
