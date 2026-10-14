/**
 * Telegram Two-Way Sync Activity & State Tracker
 * Tracks real-time sync timestamps, trigger sources (Direct Telegram DM/Message, Deletion, Web Action, Manual),
 * and sync metrics across all operational pathways in Indian Standard Time (IST).
 */

function formatDisplayTime(dateObj) {
  try {
    return (
      dateObj.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " IST"
    );
  } catch {
    return "Just now";
  }
}

const bootTime = new Date();

let lastSyncState = {
  timestamp: bootTime.toISOString(),
  formattedTime: formatDisplayTime(bootTime),
  trigger: "Server Initialization",
  mode: "30-Minute Quota-Saver & Event-Driven",
  details: "Ready & Active",
  verifiedCount: 0,
  importedCount: 0,
  purgedCount: 0,
};

function recordSyncEvent({
  trigger,
  mode = "30-Minute Quota-Saver & Event-Driven",
  details = "",
  verifiedCount = 0,
  importedCount = 0,
  purgedCount = 0,
}) {
  const now = new Date();
  lastSyncState = {
    timestamp: now.toISOString(),
    formattedTime: formatDisplayTime(now),
    trigger: trigger || "Event Trigger",
    mode,
    details: details || "Synced successfully",
    verifiedCount,
    importedCount,
    purgedCount,
  };
  console.log(`[SYNC TRACKER] 🔄 Sync Event Recorded: ${lastSyncState.formattedTime} | ${lastSyncState.trigger} | ${lastSyncState.details}`);
}

function getLastSyncState() {
  const now = new Date(lastSyncState.timestamp);
  return {
    ...lastSyncState,
    formattedTime: formatDisplayTime(now),
    isoTime: lastSyncState.timestamp,
  };
}

module.exports = {
  recordSyncEvent,
  getLastSyncState,
};
