/**
 * 🔖 Local Browser Study Store (0 Firestore / Backend DB Cost)
 * Powered by IndexedDB (`fsm_reader_study_db`)
 * Persists:
 *   1. Last Read Page per noteId (auto-resume)
 *   2. Page Bookmarks & Text Highlights / Sticky Notes
 *   3. Daily Pomodoro Focus Session Stats
 */

const DB_NAME = "fsm_reader_study_db";
const DB_VERSION = 1;
const STORE_PROGRESS = "reading_progress";
const STORE_ANNOTATIONS = "annotations";
const STORE_POMODORO = "pomodoro_stats";

function openStudyDb(timeoutMs = 1200) {
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
        if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
          db.createObjectStore(STORE_PROGRESS, { keyPath: "noteId" });
        }
        if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
          const store = db.createObjectStore(STORE_ANNOTATIONS, { keyPath: "id" });
          store.createIndex("byNoteId", "noteId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_POMODORO)) {
          db.createObjectStore(STORE_POMODORO, { keyPath: "id" });
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
          reject(req.error || new Error("IndexedDB error"));
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

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getReadingProgress(noteId) {
  if (!noteId) return null;
  const key = String(noteId);
  let db = null;
  try {
    db = await openStudyDb();
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_PROGRESS], "readonly");
      const req = tx.objectStore(STORE_PROGRESS).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`fsm_reader_progress_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function saveReadingProgress(noteId, lastPage, numPages = 0) {
  if (!noteId || !lastPage || lastPage < 1) return false;
  const key = String(noteId);
  const record = {
    noteId: key,
    lastPage: Number(lastPage),
    numPages: Number(numPages) || 0,
    updatedAt: Date.now(),
  };
  let db = null;
  try {
    db = await openStudyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PROGRESS], "readwrite");
      tx.objectStore(STORE_PROGRESS).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    try {
      localStorage.setItem(`fsm_reader_progress_${key}`, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function getNoteAnnotations(noteId) {
  if (!noteId) return [];
  const key = String(noteId);
  let db = null;
  try {
    db = await openStudyDb();
    const list = await new Promise((resolve) => {
      const tx = db.transaction([STORE_ANNOTATIONS], "readonly");
      const idx = tx.objectStore(STORE_ANNOTATIONS).index("byNoteId");
      const req = idx.getAll(key);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
    return list.sort((a, b) => (a.pageNum - b.pageNum) || (b.createdAt - a.createdAt));
  } catch {
    try {
      const raw = localStorage.getItem(`fsm_reader_annotations_${key}`);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function togglePageBookmark(noteId, pageNum, label = "") {
  if (!noteId || !pageNum) return { bookmarked: false, annotations: [] };
  const key = String(noteId);
  const pNum = Number(pageNum);
  const existingList = await getNoteAnnotations(key);
  const existingBookmark = existingList.find((a) => a.type === "bookmark" && Number(a.pageNum) === pNum);

  let db = null;
  try {
    db = await openStudyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ANNOTATIONS], "readwrite");
      const store = tx.objectStore(STORE_ANNOTATIONS);
      if (existingBookmark) {
        store.delete(existingBookmark.id);
      } else {
        store.put({
          id: `bm_${key}_${pNum}`,
          noteId: key,
          type: "bookmark",
          pageNum: pNum,
          text: label || `Page ${pNum} Bookmark`,
          noteText: "",
          color: "#f59e0b",
          createdAt: Date.now(),
        });
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    const updated = await getNoteAnnotations(key);
    return { bookmarked: !existingBookmark, annotations: updated };
  } catch {
    const next = existingBookmark
      ? existingList.filter((a) => a.id !== existingBookmark.id)
      : [
          ...existingList,
          {
            id: `bm_${key}_${pNum}`,
            noteId: key,
            type: "bookmark",
            pageNum: pNum,
            text: label || `Page ${pNum} Bookmark`,
            noteText: "",
            color: "#f59e0b",
            createdAt: Date.now(),
          },
        ];
    try {
      localStorage.setItem(`fsm_reader_annotations_${key}`, JSON.stringify(next));
    } catch (_) {}
    return { bookmarked: !existingBookmark, annotations: next };
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function addPageHighlight(noteId, { pageNum, text, noteText = "", color = "#fde047" }) {
  if (!noteId || !pageNum || (!text && !noteText)) return null;
  const key = String(noteId);
  const record = {
    id: `hl_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    noteId: key,
    type: "highlight",
    pageNum: Number(pageNum),
    text: String(text || "").trim(),
    noteText: String(noteText || "").trim(),
    color: color || "#fde047",
    createdAt: Date.now(),
  };

  let db = null;
  try {
    db = await openStudyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ANNOTATIONS], "readwrite");
      tx.objectStore(STORE_ANNOTATIONS).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await getNoteAnnotations(key);
    try {
      localStorage.setItem(`fsm_reader_annotations_${key}`, JSON.stringify([...existing, record]));
    } catch (_) {}
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
  return getNoteAnnotations(key);
}

export async function deleteNoteAnnotation(noteId, annotationId) {
  if (!noteId || !annotationId) return getNoteAnnotations(noteId);
  const key = String(noteId);
  let db = null;
  try {
    db = await openStudyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ANNOTATIONS], "readwrite");
      tx.objectStore(STORE_ANNOTATIONS).delete(annotationId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await getNoteAnnotations(key);
    const filtered = existing.filter((a) => a.id !== annotationId);
    try {
      localStorage.setItem(`fsm_reader_annotations_${key}`, JSON.stringify(filtered));
    } catch (_) {}
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
  return getNoteAnnotations(key);
}

export async function getPomodoroStats() {
  const today = getTodayKey();
  const fallback = { id: "daily", date: today, completedSessions: 0, totalFocusMinutes: 0 };
  let db = null;
  try {
    db = await openStudyDb();
    const res = await new Promise((resolve) => {
      const tx = db.transaction([STORE_POMODORO], "readonly");
      const req = tx.objectStore(STORE_POMODORO).get("daily");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (!res || res.date !== today) return fallback;
    return res;
  } catch {
    return fallback;
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

export async function recordPomodoroCompletion(minutes = 25) {
  const today = getTodayKey();
  const current = await getPomodoroStats();
  const next = {
    id: "daily",
    date: today,
    completedSessions: (current.date === today ? current.completedSessions : 0) + 1,
    totalFocusMinutes: (current.date === today ? current.totalFocusMinutes : 0) + Number(minutes || 25),
    updatedAt: Date.now(),
  };
  let db = null;
  try {
    db = await openStudyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_POMODORO], "readwrite");
      tx.objectStore(STORE_POMODORO).put(next);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {}
  finally {
    try { if (db) db.close(); } catch (_) {}
  }
  return next;
}
