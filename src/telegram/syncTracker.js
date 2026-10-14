/**
 * Telegram Two-Way Sync Activity & State Tracker
 * Tracks real-time sync timestamps, trigger sources (Direct Telegram DM/Message, Deletion, Web Action, Manual),
 * and sync metrics across all operational pathways.
 */

let lastSyncState = {
  timestamp: new Date().toISOString(),
  trigger: "Server Initialization",
  mode: "Event-Driven Real-Time",
  details: "Ready & Active",
  verifiedCount: 0,
  importedCount: 0,
  purgedCount: 0,
};

function formatDisplayTime(dateObj) {
  try {
    return dateObj.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "Just now";
  }
}

function recordSyncEvent({
  trigger,
  mode = "Event-Driven Real-Time",
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
  };
}

module.exports = {
  recordSyncEvent,
  getLastSyncState,
};
