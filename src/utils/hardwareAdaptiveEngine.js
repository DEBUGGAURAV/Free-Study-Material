/**
 * ============================================================================
 * 🤖 CLIENT HARDWARE & NETWORK ADAPTIVE ENGINE
 * ============================================================================
 * Solves the Old / Budget Device problem:
 * - Detects client device RAM (GB), CPU cores, mobile form factor & connection
 * - Dynamically evaluates all Tab 10 "auto" settings to optimal parameters
 * - Anti-Crash Guard: If Admin configured "High" (e.g. 20 peers, 10 OCR pages,
 *   Float32 AI), but student opens on an old/budget phone (2GB RAM, 2 cores),
 *   this engine safely clamps heavy workloads so the browser NEVER crashes!
 * ============================================================================
 */

import { detectClientNetworkProfile } from "./clientCompressor";

/**
 * Detect client hardware specifications and performance tier
 */
export function detectClientHardwareProfile() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      tier: "mid",
      cores: 4,
      memoryGB: 4,
      isMobile: false,
      isLowEnd: false,
      isUltraLowEnd: false,
      isPowerSave: false,
      label: "Desktop Standard",
    };
  }

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGB = navigator.deviceMemory || 4; // Note: deviceMemory reports approximate RAM (0.25, 0.5, 1, 2, 4, 8)
  const isMobile =
    window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "");
  const isTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;

  // Ultra low-end: 2GB or less RAM, or dual core, or 2G network
  const isUltraLowEnd = memoryGB <= 2 || cores <= 2;
  const isLowEnd = isUltraLowEnd || memoryGB < 4 || cores < 4 || (isMobile && memoryGB <= 3);

  let tier = "mid";
  if (isUltraLowEnd) {
    tier = "ultra_low";
  } else if (isLowEnd) {
    tier = "low";
  } else if (cores >= 8 && memoryGB >= 8 && !isMobile) {
    tier = "workstation";
  } else if (cores >= 6 && memoryGB >= 6) {
    tier = "high";
  }

  let networkProfile = null;
  try {
    networkProfile = detectClientNetworkProfile();
  } catch (_) {
    networkProfile = { isSlow: false, effectiveType: "4g" };
  }

  const isMeteredOrSlow = networkProfile?.isSlow || networkProfile?.saveData;

  const label = isUltraLowEnd
    ? `Budget Mobile (${cores} Cores, ~${memoryGB}GB RAM)`
    : isLowEnd
    ? `Mobile / Entry PC (${cores} Cores, ${memoryGB}GB RAM)`
    : tier === "workstation"
    ? `High-End Workstation (${cores} Cores, ${memoryGB}GB+ RAM)`
    : `Standard (${cores} Cores, ${memoryGB}GB RAM)`;

  return {
    tier,
    cores,
    memoryGB,
    isMobile,
    isTouch,
    isLowEnd,
    isUltraLowEnd,
    isMeteredOrSlow,
    networkProfile,
    label,
  };
}

/**
 * Compute the effective runtime configuration for a student's device.
 * Even if Admin sets "High" limits, this ensures old devices never crash.
 *
 * @param {Object} rawSettings Settings loaded from tech_controls
 * @returns {Object} Final safe, device-adapted parameters
 */
export function getEffectiveTechConfig(rawSettings = {}) {
  const hw = detectClientHardwareProfile();
  const guardEnabled = rawSettings.autoP2pHardwareGuard !== false;
  const netGuardEnabled = rawSettings.autoNetworkAdaptive !== false;

  // 1. Edge CDN RAM items (Max cached in memory)
  let cdnMaxRamItems = 50;
  if (rawSettings.cdnMaxRamItems === "auto" || !rawSettings.cdnMaxRamItems) {
    if (hw.isUltraLowEnd) cdnMaxRamItems = 15;
    else if (hw.isLowEnd) cdnMaxRamItems = 30;
    else if (hw.tier === "workstation") cdnMaxRamItems = 100;
    else cdnMaxRamItems = 50;
  } else {
    cdnMaxRamItems = parseInt(rawSettings.cdnMaxRamItems, 10) || 50;
    // Anti-Crash Clamp: If old phone and admin set 100, clamp to 25
    if (guardEnabled && hw.isUltraLowEnd && cdnMaxRamItems > 25) {
      cdnMaxRamItems = 25;
    }
  }

  // 2. P2P Campus AirDrop Max Peers
  let p2pMaxPeers = 5;
  if (rawSettings.p2pMaxPeers === "auto" || !rawSettings.p2pMaxPeers) {
    if (hw.isUltraLowEnd || hw.isMeteredOrSlow) p2pMaxPeers = 2;
    else if (hw.isLowEnd) p2pMaxPeers = 4;
    else if (hw.tier === "workstation") p2pMaxPeers = 15;
    else p2pMaxPeers = 8;
  } else {
    p2pMaxPeers = parseInt(rawSettings.p2pMaxPeers, 10) || 8;
    // Anti-Crash Clamp: Never open 20 WebRTC peer connections on a budget phone
    if (guardEnabled && hw.isLowEnd && p2pMaxPeers > 4) {
      p2pMaxPeers = 4;
    }
  }

  // 3. Client Neural AI Quantization
  let aiQuantization = "int8";
  if (rawSettings.aiQuantization === "auto" || !rawSettings.aiQuantization) {
    if (hw.isUltraLowEnd || hw.isLowEnd) aiQuantization = "int4";
    else if (hw.tier === "workstation") aiQuantization = "float32";
    else aiQuantization = "int8";
  } else {
    aiQuantization = rawSettings.aiQuantization;
    // Anti-Crash Clamp: Float32 causes OOM on <3GB RAM devices
    if (guardEnabled && hw.isLowEnd && aiQuantization === "float32") {
      aiQuantization = "int8";
    }
  }

  // 4. Max RAG Context Chunks
  let aiMaxContextChunks = 10;
  if (rawSettings.aiMaxContextChunks === "auto" || !rawSettings.aiMaxContextChunks) {
    if (hw.isUltraLowEnd) aiMaxContextChunks = 3;
    else if (hw.isLowEnd) aiMaxContextChunks = 5;
    else if (hw.tier === "workstation") aiMaxContextChunks = 20;
    else aiMaxContextChunks = 10;
  } else {
    aiMaxContextChunks = parseInt(rawSettings.aiMaxContextChunks, 10) || 10;
    if (guardEnabled && hw.isLowEnd && aiMaxContextChunks > 8) {
      aiMaxContextChunks = 8;
    }
  }

  // 5. Client WASM OCR Max Pages
  let ocrMaxPages = 5;
  if (rawSettings.ocrMaxPages === "auto" || !rawSettings.ocrMaxPages) {
    if (hw.isUltraLowEnd) ocrMaxPages = 2;
    else if (hw.isLowEnd) ocrMaxPages = 3;
    else if (hw.tier === "workstation") ocrMaxPages = 15;
    else ocrMaxPages = 5;
  } else {
    ocrMaxPages = parseInt(rawSettings.ocrMaxPages, 10) || 5;
    // Anti-Crash Clamp: Tesseract WASM heap easily crashes mobile tabs on 10+ pages
    if (guardEnabled && hw.isLowEnd && ocrMaxPages > 3) {
      ocrMaxPages = 3;
    }
  }

  // 6. Adaptive PDF Compressor Quality
  let compressionQuality = 0.65;
  if (rawSettings.compressionQuality === "auto" || !rawSettings.compressionQuality) {
    if (hw.isMeteredOrSlow || hw.isUltraLowEnd) compressionQuality = 0.50;
    else if (hw.isLowEnd) compressionQuality = 0.65;
    else compressionQuality = 0.80;
  } else {
    compressionQuality = parseFloat(rawSettings.compressionQuality) || 0.65;
    if (netGuardEnabled && hw.isMeteredOrSlow && compressionQuality > 0.50) {
      compressionQuality = 0.50;
    }
  }

  // 7. Inactivity Timeout
  let inactivityTimeoutMinutes = 30;
  if (rawSettings.inactivityTimeoutMinutes === "auto" || rawSettings.inactivityTimeoutMinutes === undefined) {
    inactivityTimeoutMinutes = hw.isMobile ? 15 : 30;
  } else {
    inactivityTimeoutMinutes = parseInt(rawSettings.inactivityTimeoutMinutes, 10);
    if (isNaN(inactivityTimeoutMinutes)) inactivityTimeoutMinutes = 30;
  }

  // 8. Collaborative Study Room Max Users
  let studyRoomMaxUsers = 8;
  if (rawSettings.studyRoomMaxUsers === "auto" || !rawSettings.studyRoomMaxUsers) {
    studyRoomMaxUsers = hw.isMobile ? 4 : 8;
  } else {
    studyRoomMaxUsers = parseInt(rawSettings.studyRoomMaxUsers, 10) || 8;
    if (guardEnabled && hw.isLowEnd && studyRoomMaxUsers > 6) {
      studyRoomMaxUsers = 6;
    }
  }

  return {
    hardwareProfile: hw,
    cdnMaxRamItems,
    p2pMaxPeers,
    aiQuantization,
    aiMaxContextChunks,
    ocrMaxPages,
    compressionQuality,
    inactivityTimeoutMinutes,
    studyRoomMaxUsers,
    isAdaptiveActive: true,
  };
}

