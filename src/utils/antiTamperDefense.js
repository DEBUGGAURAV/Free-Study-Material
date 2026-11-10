export function getForensicHardwareProfile() {
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "N/A";
  const width = typeof window !== "undefined" && window.screen ? window.screen.width : 0;
  const height = typeof window !== "undefined" && window.screen ? window.screen.height : 0;
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints ? `${navigator.maxTouchPoints}-pt Multi-Touch` : "Mouse/Trackpad";
  const network = typeof navigator !== "undefined" && navigator.connection?.effectiveType ? navigator.connection.effectiveType.toUpperCase() : "Online";

  return {
    cores: typeof navigator !== "undefined" && navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : "N/A",
    ram: typeof navigator !== "undefined" && navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A",
    gpu: "N/A",
    screen: `${width}x${height}`,
    touch,
    network,
    timezone: tz,
  };
}

export function triggerClientLockdown() {
  return false;
}

export function initAntiTamperDefense() {
  return false;
}

export function isAntiTamperLocked() {
  return false;
}

export default {
  getForensicHardwareProfile,
  triggerClientLockdown,
  initAntiTamperDefense,
  isAntiTamperLocked,
};
