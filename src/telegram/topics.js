const { db } = require("../firebase");

// In-memory cache for fast lookup
const topicCache = new Map();

async function getTopicThreadId(subject) {
  if (!subject) return null;
  const normalized = subject.trim().toLowerCase();

  if (topicCache.has(normalized)) {
    return topicCache.get(normalized);
  }

  try {
    const doc = await db.collection("subjects").doc(normalized).get();
    if (doc.exists && doc.data().telegramThreadId) {
      const threadId = doc.data().telegramThreadId;
      topicCache.set(normalized, threadId);
      return threadId;
    }
  } catch (err) {
    console.warn(`[Topics] Failed to query thread ID for ${subject}:`, err.message);
  }

  // Fallback: return default topic thread if configured in env or null
  return process.env.TELEGRAM_DEFAULT_THREAD_ID ? Number(process.env.TELEGRAM_DEFAULT_THREAD_ID) : null;
}

async function setTopicThreadId(subject, threadId) {
  if (!subject || !threadId) return;
  const normalized = subject.trim().toLowerCase();
  topicCache.set(normalized, Number(threadId));

  try {
    await db.collection("subjects").doc(normalized).set(
      {
        subjectName: subject.trim(),
        telegramThreadId: Number(threadId),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`[Topics] Saved topic mapping: ${subject} -> Thread ${threadId}`);
  } catch (err) {
    console.error(`[Topics] Error persisting thread ID for ${subject}:`, err.message);
  }
}

module.exports = {
  getTopicThreadId,
  setTopicThreadId,
};

