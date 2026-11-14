/**
 * Student Study Context & Personalization Tracker
 * Free Study Material Platform Engine
 * 
 * Ensures 6 AM Exam Morning Pre-fetch downloads the EXACT notes and subjects 
 * relevant to THIS particular student (their recent reads, branch, and year) 
 * instead of generic global notes.
 * 
 * Synchronizes seamlessly with:
 * 1. localStorage (Fast in-tab reads)
 * 2. IndexedDB (Persistent background access for ServiceWorker at 6 AM)
 * 3. ServiceWorker postMessage channel
 */

const CONTEXT_STORAGE_KEY = "fsm_student_study_context";
const RECENT_NOTES_KEY = "fsm_student_recent_notes";
const DB_NAME = "fsm_student_context_v1";
const STORE_NAME = "profile";

function openContextDB() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Record a student's reading activity and sync context to IndexedDB & Service Worker
 * @param {object} note - The note opened / read
 * @param {object} currentUser - Logged in user profile (optional)
 */
export async function recordStudentNoteRead(note, currentUser = null) {
  if (!note || !note.id) return;
  try {
    let recentNotes = [];
    try {
      const raw = localStorage.getItem(RECENT_NOTES_KEY);
      if (raw) recentNotes = JSON.parse(raw);
      if (!Array.isArray(recentNotes)) recentNotes = [];
    } catch (_) {}

    // Deduplicate and insert this note at the top
    recentNotes = recentNotes.filter((n) => n.id !== note.id);
    recentNotes.unshift({
      id: note.id,
      title: note.title,
      subject: note.subject,
      branch: note.branch,
      year: note.year || note.semester || "",
      course: note.course || "",
      readAt: Date.now(),
    });

    // Keep top 10 recent reads
    recentNotes = recentNotes.slice(0, 10);

    const userYear = currentUser?.year || note.year || note.semester || "All Years";
    const userBranch = note.branch || currentUser?.branch || "All";

    const context = {
      userYear,
      userBranch,
      recentNoteIds: recentNotes.map((n) => n.id),
      recentNotes,
      recentSubjects: [...new Set(recentNotes.map((n) => n.subject).filter(Boolean))],
      updatedAt: Date.now(),
    };

    // 1. Save in localStorage
    try {
      localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(recentNotes));
      localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
    } catch (_) {}

    // 2. Save in IndexedDB (allows ServiceWorker to read when app is closed at 6 AM)
    try {
      const db = await openContextDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(context, "active_student");
      }
    } catch (_) {}

    // 3. Post to active ServiceWorker
    if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "UPDATE_STUDENT_STUDY_CONTEXT",
        context,
      });
    }

    return context;
  } catch (err) {
    console.warn("[STUDY CONTEXT] Record error:", err.message);
  }
}

/**
 * Sync active student profile to IndexedDB (called on login/profile load)
 */
export async function syncStudentProfileContext(currentUser) {
  if (!currentUser) return;
  try {
    let existing = null;
    try {
      const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch (_) {}

    const context = {
      ...(existing || {}),
      userYear: currentUser.year || existing?.userYear || "All Years",
      userBranch: currentUser.branch || existing?.userBranch || "All",
      userEmail: currentUser.email || "",
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
    } catch (_) {}

    try {
      const db = await openContextDB();
      if (db) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(context, "active_student");
      }
    } catch (_) {}

    if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "UPDATE_STUDENT_STUDY_CONTEXT",
        context,
      });
    }

    return context;
  } catch (_) {}
}

/**
 * Retrieve current student context from localStorage
 */
export function getStudentStudyContext() {
  try {
    const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 🌟 Campus Contributor & Sharing Gamification Tracker
 */
export function recordCampusShare(note = null) {
  try {
    const cur = parseInt(localStorage.getItem("fsm_campus_contributions") || "0", 10) + 1;
    localStorage.setItem("fsm_campus_contributions", String(cur));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fsm:campus-contributions-updated", { detail: { count: cur, note } }));
    }
    return cur;
  } catch (_) {
    return 1;
  }
}

export function getCampusContributionTier() {
  try {
    const count = parseInt(localStorage.getItem("fsm_campus_contributions") || "0", 10);
    if (count >= 6) {
      return { count, level: 3, label: "🌟 Top Campus Contributor", badge: "🌟 Top Contributor", color: "#f59e0b", bg: "#fef3c7" };
    }
    if (count >= 3) {
      return { count, level: 2, label: "⭐ Campus Study Helper", badge: "⭐ Study Helper", color: "#6366f1", bg: "#ede9fe" };
    }
    if (count >= 1) {
      return { count, level: 1, label: "🌱 Campus Sharer", badge: "🌱 Sharer", color: "#10b981", bg: "#d1fae5" };
    }
    return { count: 0, level: 0, label: "Student Scholar", badge: null, color: "#64748b", bg: "#f1f5f9" };
  } catch (_) {
    return { count: 0, level: 0, label: "Student Scholar", badge: null, color: "#64748b", bg: "#f1f5f9" };
  }
}

