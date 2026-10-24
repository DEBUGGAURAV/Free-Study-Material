/**
 * ============================================================================
 * ⏰ ZERO-LOAD EXAM COUNTDOWN & REVISION BUDDY ROUTE
 * ============================================================================
 * - 0% Server CPU overhead & 0 Firestore quota used
 * - Instant in-memory calculation of exam days remaining & daily micro-targets
 * - Dispatches Telegram Daily Pulse & Native Interactive Polls
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const {
  CURATED_EXAM_SCHEDULES,
  getExamRevisionDossier,
  dispatchDailyRevisionAlert,
  dispatchTelegramQuizPoll,
} = require("../services/examBuddyService");

/**
 * GET /api/exam/schedules
 * Returns all upcoming exam countdowns & daily unit targets (0 DB Reads)
 */
router.get("/schedules", (req, res) => {
  try {
    const list = CURATED_EXAM_SCHEDULES.map((sch) => {
      const now = new Date();
      const exam = new Date(sch.examDate);
      const diffTime = exam - now;
      const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const unitIndex = Math.max(0, 5 - Math.max(1, Math.min(5, Math.ceil(daysLeft / 3))));
      const targetUnit = sch.targetUnits[unitIndex] || sch.targetUnits[0];

      return {
        ...sch,
        daysLeft,
        todayTarget: targetUnit,
      };
    });

    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/exam/dossier
 * Returns micro-syllabus target for specific branch & year
 */
router.get("/dossier", (req, res) => {
  try {
    const { branch, year } = req.query;
    const dossier = getExamRevisionDossier(branch, year);
    res.json({ success: true, data: dossier });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/exam/trigger-pulse
 * Triggers Telegram Daily 7:00 AM Revision Alert
 */
router.post("/trigger-pulse", async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = req.body.chatId || process.env.TELEGRAM_SUPERGROUP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    const threadId = req.body.threadId || process.env.SECURITY_BOT_TOPIC_ID || null;

    if (!botToken || !chatId) {
      return res.status(400).json({ success: false, message: "Telegram botToken and chatId required" });
    }

    await dispatchDailyRevisionAlert(botToken, chatId, threadId, req.body.branch, req.body.year);
    res.json({ success: true, message: "Exam Revision Pulse dispatched successfully to Telegram" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/exam/trigger-quiz
 * Dispatches Native Telegram Quiz Poll (sendPoll - 0% server CPU)
 */
router.post("/trigger-quiz", async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = req.body.chatId || process.env.TELEGRAM_SUPERGROUP_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    const threadId = req.body.threadId || process.env.SECURITY_BOT_TOPIC_ID || null;
    const subjectCode = req.body.subjectCode || "KCS-503";

    if (!botToken || !chatId) {
      return res.status(400).json({ success: false, message: "Telegram botToken and chatId required" });
    }

    await dispatchTelegramQuizPoll(botToken, chatId, threadId, subjectCode);
    res.json({ success: true, message: "Native Telegram Quiz Poll dispatched successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

