/**
 * 🔒 In-Session Study History Helper (Scoped to Current Active Login Session)
 * Cleared automatically upon student logout or new login session.
 */

const SESSION_HISTORY_KEY = "fsm_student_study_session_v1";

export function getStudySessionHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function addStudySessionItem(item) {
  if (typeof window === "undefined" || !item) return [];
  try {
    const current = getStudySessionHistory();
    const newItem = {
      id: item.id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: item.type || "search", // 'flashcard' | 'summary' | 'search'
      title: item.title || "Study Notes",
      noteId: item.noteId || null,
      query: item.query || "",
      data: item.data || null,
      provider: item.provider || "AI Engine",
      model: item.model || "",
      cached: Boolean(item.cached),
      timestamp: Date.now(),
    };
    // Keep max 40 items per active session
    const updated = [newItem, ...current.filter((c) => c.id !== newItem.id)].slice(0, 40);
    sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
}

export function clearStudySessionHistory() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_HISTORY_KEY);
  } catch (_) {}
}
