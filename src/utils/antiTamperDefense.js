/**
 * ============================================================================
 * 🛡️ CLIENT-SIDE ANTI-TAMPER & ZERO-TRUST DEFENSE SENSOR
 * ============================================================================
 * - Option 2: Powered by disable-devtool (Industry-Standard Shield)
 * - Multi-Detector: RegToString, DefineId, Size (Docked DevTools), DateToString, Debugger, Performance
 * - Native Docked DevTools (Window Dimension Differential) & Keydown Traps
 * - Instant 0ms Visual Strike Feedback (Strike 1 & 2 Warning Card)
 * - Strike 3+: Database Account Ban, Token Revocation, IP Jail & Red Screen Lockdown
 * - Real-time Telegram Security Bot Supergroup Topic 6 reporting
 * ============================================================================
 */

import disableDevtool from "disable-devtool";

let strikeCount = 0;
try {
  strikeCount = Number(sessionStorage.getItem("fsm_strike_count") || 0);
} catch (_) {}
let isDefenseInitialized = false;
let isLockdownActive = false;

// Debounce so a single tamper event doesn't trigger multiple rapid alerts
let lastTamperDispatch = 0;

// Human-readable detector labels
const DETECTOR_NAMES = {
  [-1]: "Unknown Probe",
  0: "RegExp String Serialization (Console Open)",
  1: "Element ID Getter Evaluation",
  2: "Window Dimension Split (DevTools Docked)",
  3: "Date String Serialization",
  4: "Function Callstack Profiling",
  5: "Debugger Execution Trap",
  6: "Performance Timing Vector",
  7: "Debug Library Hook",
};

/**
 * Checks if DevTools protection should be bypassed
 */
function isDevToolsBypassed() {
  if (typeof window === "undefined") return true;

  // 1. Force test override (?test_tamper=1 or ?tamper_test=1) -> ALWAYS test anti-tamper
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test_tamper") === "1" || params.get("tamper_test") === "1") {
      return false;
    }
    // Explicit admin debug parameters
    if (
      params.get("admin_inspect") === "1" ||
      params.get("admin_dev") === "1" ||
      params.get("debug") === "1" ||
      params.get("admin_bypass") === "1"
    ) {
      return true;
    }
  } catch (_) {}

  // 2. Active logged-in student check:
  // If the currently active logged-in user is a student, NEVER bypass,
  // even if an old fsm_admin_token was left in localStorage!
  try {
    const userStr = localStorage.getItem("vault_user");
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.role === "admin" || u.role === "half_admin" || u.isMasterAdmin || u.isMainAdmin) {
        return true;
      }
      return false; // Student is active -> Anti-tamper must protect!
    }
  } catch (_) {}

  // 3. Admin token check ONLY applies if user is actually on admin URL or hash
  try {
    const hasAdminToken = localStorage.getItem("fsm_admin_token") || sessionStorage.getItem("fsm_admin_token");
    const isAdminUrl = window.location.pathname.startsWith("/admin") || window.location.hash.includes("admin");
    if (hasAdminToken && isAdminUrl) {
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Safely extracts current student profile info for security alert
 * If user is unlogged / guest, generates deep hardware forensics & persistent anonymous beacon
 */
function getCurrentUserData() {
  try {
    const userStr = localStorage.getItem("vault_user");
    if (userStr) {
      const u = JSON.parse(userStr);
      return {
        isLoggedIn: true,
        name: u.name || "Student Scholar",
        email: u.email || "N/A",
        mobile: u.mobile || "N/A",
        college: u.college || "N/A",
        year: u.year || "N/A",
        role: u.role || "student",
      };
    }
  } catch (_) {}

  // 🕵️ Unauthenticated Guest Identity Tracking & Hardware Forensics
  let anonUid = "guest_anon";
  try {
    anonUid = localStorage.getItem("fsm_anon_uid");
    if (!anonUid) {
      anonUid = "anon_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem("fsm_anon_uid", anonUid);
    }
  } catch (_) {}

  const forensics = getForensicHardwareProfile();

  return {
    isLoggedIn: false,
    name: `Anonymous Visitor [${anonUid.slice(-6).toUpperCase()}]`,
    email: "Unauthenticated Guest",
    mobile: "N/A",
    college: `Hardware: ${forensics.cores} • ${forensics.ram} • ${forensics.gpu}`,
    year: `Resolution: ${forensics.screen}`,
    role: "guest",
    guestUid: anonUid,
    timezone: forensics.timezone,
    hardwareCores: forensics.cores,
    memoryEstimate: forensics.ram,
    gpuRenderer: forensics.gpu,
    touchSpec: forensics.touch,
    networkType: forensics.network,
  };
}

/**
 * Extract Deep Hardware & Environmental Forensics
 * (Includes Apple WebKit / iOS RAM heuristic & WebGL GPU extraction)
 */
export function getForensicHardwareProfile() {
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "N/A";
  const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : "4 Cores";

  // 1. RAM Detection & Intelligent iOS Heuristics
  let ramStr = "4GB - 6GB (Standard)";
  if (typeof navigator !== "undefined" && navigator.deviceMemory) {
    ramStr = `${navigator.deviceMemory} GB (Reported)`;
  } else if (typeof performance !== "undefined" && performance.memory && performance.memory.jsHeapSizeLimit) {
    const heapGb = (performance.memory.jsHeapSizeLimit / (1024 * 1024 * 1024)).toFixed(1);
    ramStr = `~${Math.round(heapGb * 2)} GB (Heap Limit Scale)`;
  } else if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent || "")) {
    // Apple WebKit deliberately hides navigator.deviceMemory for anti-fingerprinting.
    // Determine generation via viewport, retina scale, and WebGL specs
    const isRetina3x = (window.devicePixelRatio || 1) >= 3;
    const isModernPhone = window.screen && (window.screen.height >= 844 || window.screen.width >= 390);
    if (isRetina3x && isModernPhone) {
      ramStr = "~6 GB (Apple A-Series Bionic / iOS Protected)";
    } else {
      ramStr = "~4 GB (Apple A-Series / iOS Protected)";
    }
  }

  // 2. GPU & Graphics Renderer (WebGL context inspection)
  let gpuRenderer = "WebGL Generic";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (unmasked) gpuRenderer = unmasked;
      } else {
        const direct = gl.getParameter(gl.RENDERER);
        if (direct) gpuRenderer = direct;
      }
    }
  } catch (_) {}

  // 3. Screen, DPI, and Touch Capabilities
  const screenW = window.screen?.width || 0;
  const screenH = window.screen?.height || 0;
  const colorDepth = window.screen?.colorDepth || 24;
  const dpr = window.devicePixelRatio || 1;
  const touchPoints = navigator.maxTouchPoints || 0;
  const touchStr = touchPoints > 0 ? `${touchPoints}-pt Multi-Touch` : "Mouse/Trackpad";
  const orientation = screen.orientation?.type || (screenW > screenH ? "Landscape" : "Portrait");

  // 4. Network / Connection Details
  let netType = "Online";
  if (typeof navigator !== "undefined" && navigator.connection) {
    const conn = navigator.connection;
    const parts = [];
    if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
    if (conn.downlink) parts.push(`${conn.downlink}Mbps`);
    if (parts.length > 0) netType = parts.join(" • ");
  }

  return {
    cores,
    ram: ramStr,
    gpu: gpuRenderer,
    screen: `${screenW}x${screenH} (${dpr}x Retina, ${colorDepth}-bit, ${orientation})`,
    touch: touchStr,
    network: netType,
    timezone: tz,
  };
}

// Active inspection session tracking (Prevents multiple strikes during a single inspect session)
let isDevToolsSessionActive = false;
let isDockedDevToolsOpen = false;
let lastDevToolsCloseTime = 0;
let lastStrikeTime = 0;
let curtainAutoRecoveryInterval = null;

/**
 * Checks if DevTools is genuinely open right now
 */
function isDevToolsCurrentlyOpen() {
  if (isDevToolsBypassed()) return false;

  // 1. Check window dimensions (Docked DevTools)
  // Standard browser UI overhead on Windows with bookmarks/toolbars: ~100-180px height, ~10-40px width.
  // Docked DevTools consumes >= 200px width (side dock) or >= 240px height (bottom dock).
  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;
  if (widthDiff > 200 || heightDiff > 240) {
    return true;
  }

  // 2. Check disableDevtool state if available
  if (typeof disableDevtool !== "undefined" && typeof disableDevtool.isDevToolOpened === "function") {
    try {
      if (disableDevtool.isDevToolOpened()) {
        return true;
      }
    } catch (_) {}
  }

  return false;
}

function startCurtainAutoRecovery() {
  if (curtainAutoRecoveryInterval) return;
  curtainAutoRecoveryInterval = setInterval(() => {
    const curtain = document.getElementById("fsm-anti-scrape-curtain");
    if (!curtain || isLockdownActive) {
      stopCurtainAutoRecovery();
      return;
    }
    // If DevTools is closed, automatically restore view
    if (!isDevToolsCurrentlyOpen()) {
      console.log("[ANTI-TAMPER] 🟢 Auto-recovery: DevTools closed, restoring viewport.");
      onDevToolsClosed();
    }
  }, 500);
}

function stopCurtainAutoRecovery() {
  if (curtainAutoRecoveryInterval) {
    clearInterval(curtainAutoRecoveryInterval);
    curtainAutoRecoveryInterval = null;
  }
}

/**
 * Anti-Scrape Curtain: Conceals and protects page content while DevTools is open.
 * Includes explicit strike attempt badge, countdown/warning, auto-recovery heartbeat,
 * and an interactive 'I Have Closed DevTools • Restore View' button!
 */
function applyAntiScrapeCurtain(strike = 1) {
  if (isDevToolsBypassed() || isLockdownActive) return;
  const currentStrike = Math.max(1, Number(strike) || strikeCount || 1);
  const isFinalAttempt = currentStrike >= 2;

  let curtain = document.getElementById("fsm-anti-scrape-curtain");
  if (!curtain) {
    curtain = document.createElement("div");
    curtain.id = "fsm-anti-scrape-curtain";
    curtain.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      background: rgba(11, 15, 25, 0.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
      user-select: none;
      pointer-events: auto;
      transition: opacity 0.25s ease;
    `;
    document.body.appendChild(curtain);
  }

  curtain.innerHTML = `
    <div style="
      max-width: 520px;
      width: 100%;
      background: #111827;
      border: 2px solid ${isFinalAttempt ? "#ef4444" : "#f59e0b"};
      border-radius: 18px;
      padding: 30px 24px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.85), 0 0 35px ${isFinalAttempt ? "rgba(239, 68, 68, 0.3)" : "rgba(245, 158, 11, 0.25)"};
      position: relative;
      margin: auto;
    ">
      <!-- Close / Dismiss 'X' Button on top-right -->
      <button id="fsm-curtain-close-x" style="
        position: absolute;
        top: 14px;
        right: 16px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 50%;
        width: 32px;
        height: 32px;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      " title="Dismiss and Restore View">&times;</button>

      <!-- Shield Icon -->
      <div style="font-size: 40px; margin-bottom: 8px;">🛡️</div>

      <!-- Attempt Badge -->
      <div style="
        display: inline-block;
        background: ${isFinalAttempt ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #f59e0b, #d97706)"};
        color: #000;
        font-size: 0.74rem;
        padding: 3px 12px;
        border-radius: 14px;
        font-weight: 900;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        ${isFinalAttempt ? "FINAL WARNING • ATTEMPT 2 OF 3" : "SECURITY SHIELD • ATTEMPT 1 OF 3"}
      </div>

      <!-- Main Title -->
      <div style="font-size: 1.25rem; font-weight: 800; color: ${isFinalAttempt ? "#ef4444" : "#f59e0b"}; margin-bottom: 8px; letter-spacing: -0.3px;">
        CONTENT PROTECTED • DEVTOOLS DETECTED
      </div>

      <!-- Explanatory Text -->
      <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.55; margin: 0 0 14px;">
        Developer Tools or Console Inspection is currently active. To safeguard student privacy, copyrighted lecture notes, and API integrity, all viewport data is protected.
      </p>

      <!-- Action Required Box -->
      <div style="
        background: ${isFinalAttempt ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)"};
        border: 1px solid ${isFinalAttempt ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.35)"};
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 0.8rem;
        color: ${isFinalAttempt ? "#fca5a5" : "#fde68a"};
        font-weight: 600;
        margin-bottom: 16px;
        line-height: 1.4;
      ">
        ${isFinalAttempt 
          ? "⚠️ FINAL ATTEMPT WARNING: Opening DevTools 1 more time will trigger an automatic 24-Hour security quarantine!"
          : `⚠️ Notice: Opening DevTools ${3 - currentStrike} more time(s) will result in a 24-hour security quarantine.`}
      </div>

      <!-- Restore Action Button -->
      <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
        <button id="fsm-curtain-restore-btn" style="
          width: 100%;
          background: linear-gradient(135deg, #059669, #10b981);
          border: none;
          color: #fff;
          font-weight: 800;
          font-size: 0.88rem;
          padding: 11px 20px;
          border-radius: 10px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35);
          transition: all 0.2s ease;
        ">
          🔓 I Have Closed DevTools (Restore View)
        </button>
        <div id="fsm-curtain-status" style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">
          Auto-checking status every 0.5s • Close Inspect panel to restore view
        </div>
      </div>
    </div>
  `;

  // Attach button click handler
  const restoreBtn = curtain.querySelector("#fsm-curtain-restore-btn");
  const closeXBtn = curtain.querySelector("#fsm-curtain-close-x");
  const handleRestore = () => {
    if (isDevToolsCurrentlyOpen()) {
      const statusElem = document.getElementById("fsm-curtain-status");
      if (statusElem) {
        statusElem.innerHTML = "<span style='color: #f87171;'>⚠️ DevTools is still detected as open. Please close inspect panel, then tap Restore.</span>";
      }
      return;
    }
    onDevToolsClosed();
  };

  if (restoreBtn) restoreBtn.onclick = handleRestore;
  if (closeXBtn) closeXBtn.onclick = () => {
    onDevToolsClosed();
  };

  // Start background auto-recovery heartbeat
  startCurtainAutoRecovery();
}

function removeAntiScrapeCurtain() {
  stopCurtainAutoRecovery();
  const curtain = document.getElementById("fsm-anti-scrape-curtain");
  if (curtain && !isLockdownActive) {
    curtain.style.opacity = "0";
    setTimeout(() => {
      if (curtain && curtain.parentNode) {
        curtain.remove();
      }
    }, 200);
  }
}

/**
 * Handle DevTools detection event
 * Strict Rule: One continuous inspect session = EXACTLY 1 STRIKE!
 * Strike 2 only happens if DevTools was closed and RE-OPENED.
 * Strike 3 only happens if DevTools was closed and RE-OPENED a 3rd time.
 */
function onDevToolsDetected(detail = "Developer Tools opened", extra = {}) {
  try {
    console.clear();
  } catch (_) {}

  // If DevTools is ALREADY open and we are in an active session, DO NOT ADD ANOTHER STRIKE!
  if (isDevToolsSessionActive) {
    applyAntiScrapeCurtain(strikeCount);
    return;
  }

  // Minimum 5.0 seconds cooldown between separate strikes to eliminate multi-detector race conditions
  const now = Date.now();
  if (now - lastStrikeTime < 5000 && lastStrikeTime > 0) {
    applyAntiScrapeCurtain(strikeCount);
    return;
  }
  if (now - lastDevToolsCloseTime < 3500 && lastDevToolsCloseTime > 0) {
    applyAntiScrapeCurtain(strikeCount);
    return;
  }

  lastStrikeTime = now;
  isDevToolsSessionActive = true;
  console.warn(`[ANTI-TAMPER] ⚠️ DevTools opened! Registering Strike ${strikeCount + 1} of 3.`);
  reportTamperIncident(detail, extra);
}

/**
 * Handle DevTools closure event
 * Allows the next inspect attempt to register as a separate strike.
 */
function onDevToolsClosed() {
  console.log("[ANTI-TAMPER] 🟢 DevTools closed. Inspect session ended.");
  isDevToolsSessionActive = false;
  isDockedDevToolsOpen = false;
  lastDevToolsCloseTime = Date.now();

  // Remove anti-scraping curtain
  removeAntiScrapeCurtain();

  // Dismiss warning overlay when DevTools is closed
  const overlay = document.getElementById("fsm-tamper-warning-overlay");
  if (overlay && !isLockdownActive) {
    overlay.remove();
  }
}

/**
 * Report Tampering Beacon to Server -> Telegram Supergroup Topic 6
 */
async function reportTamperIncident(detail = "Unauthorized script tampering detected", extra = {}) {
  const now = Date.now();
  lastTamperDispatch = now;

  strikeCount += 1;
  try {
    sessionStorage.setItem("fsm_strike_count", String(strikeCount));
  } catch (_) {}
  const currentStrike = strikeCount;

  // ⚡ 0ms INSTANT VISUAL FEEDBACK: Render warning before waiting for network fetch!
  if (currentStrike >= 3) {
    triggerClientLockdown(
      "Security violation: Maximum script tampering attempts exceeded (3/3 strikes). Your IP is detained in security quarantine.",
      {
        policyName: "Client Script / DevTools Tamper (Strike 3)",
        durationMs: 24 * 60 * 60 * 1000,
        durationLabel: "24 Hours",
        autoReleasePolicy: "✅ Auto-release after 24h",
        adminPardon: "Can be instantly pardoned by Administrator",
      }
    );
  } else {
    // Show the protective shield curtain with current strike count & restoration controls
    applyAntiScrapeCurtain(currentStrike);
  }

  try {
    const res = await fetch("/api/security/tamper-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        detail,
        clientStrikes: currentStrike,
        deviceInfo: `${navigator.userAgent || "Unknown"} (${window.screen?.width || 0}x${window.screen?.height || 0})`,
        pageUrl: window.location.pathname + window.location.search,
        user: getCurrentUserData(),
        forensics: getForensicHardwareProfile(),
        ...extra,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (data.action === "BAN" || data.isBlocked || currentStrike >= 3) {
      triggerClientLockdown(
        data.message || "Security violation: Account and IP detained in security quarantine for 24 Hours.",
        {
          policyName: data.policyName || "Client Script / DevTools Tamper (Strike 3)",
          durationMs: data.durationMs || (24 * 60 * 60 * 1000),
          durationLabel: data.durationLabel || "24 Hours",
          autoReleasePolicy: data.autoReleasePolicy || "✅ Auto-release after 24h",
          adminPardon: data.adminPardon || "Can be instantly pardoned by Administrator",
          targetTimestamp: data.targetTimestamp || (data.autoReleaseAt ? new Date(data.autoReleaseAt).getTime() : undefined),
        }
      );
    }
  } catch (err) {
    if (currentStrike >= 3) {
      triggerClientLockdown(
        "Security violation: Maximum tampering attempts exceeded (3/3 strikes).",
        {
          policyName: "Client Script / DevTools Tamper (Strike 3)",
          durationMs: 24 * 60 * 60 * 1000,
          durationLabel: "24 Hours",
          autoReleasePolicy: "✅ Auto-release after 24h",
          adminPardon: "Can be instantly pardoned by Administrator",
        }
      );
    }
  }
}

/**
 * Show on-screen strike warning overlay (Strike 1 & 2)
 */
function showStrikeWarning(strike, customMessage) {
  if (isLockdownActive) return;

  const existing = document.getElementById("fsm-tamper-warning-overlay");
  if (existing) existing.remove();

  const isFinalWarning = strike === 2;
  const overlay = document.createElement("div");
  overlay.id = "fsm-tamper-warning-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 2147483647;
    max-width: 460px;
    background: ${isFinalWarning ? "linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)" : "linear-gradient(135deg, #78350f 0%, #451a03 100%)"};
    border: 2px solid ${isFinalWarning ? "#ef4444" : "#f59e0b"};
    border-radius: 14px;
    padding: 18px 22px;
    color: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px ${isFinalWarning ? "rgba(239, 68, 68, 0.5)" : "rgba(245, 158, 11, 0.5)"};
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: auto;
    animation: fsmSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  overlay.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 14px;">
      <span style="font-size: 28px; line-height: 1;">${isFinalWarning ? "🚨" : "⚠️"}</span>
      <div style="flex: 1;">
        <div style="font-weight: 800; font-size: 0.96rem; color: ${isFinalWarning ? "#fca5a5" : "#fde68a"}; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
          <span>${isFinalWarning ? "FINAL SECURITY WARNING" : "SECURITY SHIELD: DEVTOOLS PROHIBITED"}</span>
          <span style="background: ${isFinalWarning ? "#ef4444" : "#f59e0b"}; color: #000; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 900;">ATTEMPT ${strike} OF 3</span>
        </div>
        <div style="font-size: 0.83rem; color: #f8fafc; line-height: 1.5; margin-bottom: 8px;">
          ${customMessage || "Inspecting console or opening Developer Tools is strictly prohibited on Free Study Material Vault. To maintain academic integrity, please close Developer Tools."}
        </div>
        <div style="font-size: 0.75rem; color: ${isFinalWarning ? "#f87171" : "#fbbf24"}; font-weight: 600; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 6px;">
          ${isFinalWarning 
            ? "⚠️ FINAL ATTEMPT WARNING: If you open DevTools 1 more time, you will be locked out for 24 Hours!" 
            : `⚠️ Notice: Opening DevTools ${3 - strike} more time(s) will result in a 24-hour security quarantine.`}
        </div>
      </div>
      <button id="fsm-warning-dismiss-btn" style="
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        line-height: 1;
      " title="Dismiss">&times;</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismissBtn = overlay.querySelector("#fsm-warning-dismiss-btn");
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      overlay.remove();
    };
  }

  // Auto-dismiss warning after 8 seconds
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 8000);
}

/**
 * Security Detention & Lockdown Screen with Live Countdown & Accurate Policy Time
 */
export function triggerClientLockdown(reason, options = {}) {
  isLockdownActive = true;

  const cleanReason = (reason || "Security violation detected")
    .replace(/\.?\s*Auto-release in \d+ seconds\.?/gi, "")
    .trim();

  const policyName = options.policyName || "Client Script / DevTools Tamper (Strike 3)";
  const durationLabel = options.durationLabel || "24 Hours";
  const autoReleasePolicy = options.autoReleasePolicy || "✅ Auto-release after 24h";
  const adminPardon = options.adminPardon || "Can be instantly pardoned by Administrator upon review";
  const durationMs = options.durationMs || (24 * 60 * 60 * 1000);

  // Persist original end timestamp so timer never restarts on re-trigger or reload!
  const savedUntil = (typeof localStorage !== "undefined" && localStorage.getItem("fsm_lockdown_until")) 
    ? Number(localStorage.getItem("fsm_lockdown_until")) 
    : null;
  const targetTimestamp = (savedUntil && savedUntil > Date.now()) 
    ? savedUntil 
    : (options.targetTimestamp || (Date.now() + durationMs));
  const incidentId = options.incidentId || (typeof localStorage !== "undefined" && localStorage.getItem("fsm_lockdown_incident")) || `FSM-SEC-${Date.now().toString(36).toUpperCase()}`;

  // Persist detention state to localStorage across page reloads
  try {
    localStorage.setItem("fsm_lockdown_until", String(targetTimestamp));
    localStorage.setItem("fsm_lockdown_policy", policyName);
    localStorage.setItem("fsm_lockdown_reason", cleanReason || "Security violation detected");
    localStorage.setItem("fsm_lockdown_label", durationLabel);
    localStorage.setItem("fsm_lockdown_release", autoReleasePolicy);
    localStorage.setItem("fsm_lockdown_incident", incidentId);
  } catch (_) {}

  // 1. Wipe client auth tokens (keep detention storage)
  try {
    sessionStorage.clear();
    const tokenKeys = ["fsm_token", "token", "vault_token", "vault_user"];
    tokenKeys.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}

  // 2. Kill all active intervals & timers
  try {
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = 0; i < highestTimeoutId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  } catch (_) {}

  const releaseDateStr = new Date(targetTimestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // 3. Render High-Tech Security Detention Screen with Live Countdown
  document.body.innerHTML = `
    <div style="
      position: fixed;
      inset: 0;
      background: #09090b;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 20px;
      color: #fff;
      overflow-y: auto;
    ">
      <div style="
        max-width: 560px;
        width: 100%;
        background: radial-gradient(circle at top, rgba(185, 28, 28, 0.22) 0%, rgba(15, 23, 42, 0.98) 100%);
        border: 2px solid #ef4444;
        border-radius: 24px;
        padding: 34px 28px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.95), 0 0 40px rgba(239, 68, 68, 0.35);
        margin: auto;
      ">
        <!-- Top Icon -->
        <div style="
          width: 70px;
          height: 70px;
          margin: 0 auto 16px auto;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          border: 1.5px solid rgba(239, 68, 68, 0.45);
          box-shadow: 0 0 25px rgba(239, 68, 68, 0.3);
        ">
          ⏳
        </div>
        
        <h2 style="font-size: 1.35rem; font-weight: 800; color: #ef4444; margin: 0 0 8px 0; letter-spacing: -0.3px; text-transform: uppercase;">
          Security Lockdown: Temporary Detention
        </h2>

        <!-- Violation Badge -->
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.5);
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #fca5a5;
          margin-bottom: 16px;
        ">
          <span>Violation Policy:</span>
          <span style="color: #fff;">${policyName}</span>
        </div>
        
        <!-- Reason Box -->
        <div style="
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.28);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 0.84rem;
          color: #fca5a5;
          margin-bottom: 20px;
          line-height: 1.45;
          text-align: left;
        ">
          ${cleanReason || "Client script tampering or unauthorized inspection detected (3/3 attempts)."}
        </div>
        
        <!-- ⏱️ Live Ticking Countdown Box (User Time) -->
        <div style="
          background: rgba(15, 23, 42, 0.85);
          border: 1.5px solid rgba(245, 158, 11, 0.45);
          border-radius: 16px;
          padding: 18px 20px;
          margin-bottom: 20px;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        ">
          <div style="
            font-size: 0.72rem;
            text-transform: uppercase;
            color: #fcd34d;
            font-weight: 800;
            letter-spacing: 1px;
            margin-bottom: 6px;
          ">
            ⏳ Auto-Release Countdown (Your Remaining Time)
          </div>

          <div id="fsm-countdown-timer" style="
            font-size: 2.2rem;
            font-weight: 900;
            color: #fbbf24;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            letter-spacing: 2px;
            text-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
            margin: 6px 0;
          ">
            Calculating...
          </div>

          <!-- Structured Policy Time Table -->
          <div style="
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 0.78rem;
            color: #94a3b8;
            margin-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding-top: 10px;
            text-align: left;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #cbd5e1;">🛡️ Detention Window:</span>
              <strong style="color: #fff;">${durationLabel}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #cbd5e1;">🔓 Auto-Release Policy:</span>
              <strong style="color: #34d399;">${autoReleasePolicy}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #cbd5e1;">📅 Auto-Release At:</span>
              <strong style="color: #f1f5f9;">${releaseDateStr}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #cbd5e1;">⚡ Admin Pardon:</span>
              <strong style="color: #38bdf8;">${adminPardon}</strong>
            </div>
          </div>
        </div>

        <!-- Live Status Pulse -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 0.74rem;
          color: #94a3b8;
          margin-bottom: 16px;
        ">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399;"></span>
          <span>Security Detention Active • Instant unlock upon Administrator pardon</span>
        </div>

        <!-- Incident ID & Appeal Notice -->
        <div style="
          font-size: 0.75rem;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 14px;
          margin-bottom: 12px;
        ">
          Incident ID: <code style="color: #cbd5e1; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${incidentId}</code>
        </div>

        <!-- 📝 Quick Appeal Desk -->
        <div style="
          margin-top: 14px;
          text-align: left;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 12px;
        ">
          <div style="font-size: 0.8rem; font-weight: 700; color: #cbd5e1; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>📝</span> Quick Appeal Desk to Administrator
          </div>
          <input type="text" id="fsm-appeal-name-input" placeholder="Your Full Name (Required)" style="
            width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 0.78rem; margin-bottom: 8px; outline: none;
          " />
          <input type="email" id="fsm-appeal-email-input" placeholder="Your College / Personal Email (Required)" style="
            width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 0.78rem; margin-bottom: 8px; outline: none;
          " />
          <textarea id="fsm-appeal-reason-input" rows="2" placeholder="Brief statement (e.g. Studying for exams on hostel Wi-Fi)" style="
            width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 0.78rem; margin-bottom: 8px; outline: none; resize: vertical;
          "></textarea>
          <button id="fsm-appeal-submit-btn" style="
            width: 100%; background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: 0.2s;
          ">🚀 Submit Appeal to Administrator</button>
          <button id="fsm-verify-pardon-btn" style="
            width: 100%; background: linear-gradient(135deg, #059669, #10b981); color: #fff; border: none; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: 0.2s; margin-top: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          ">🔄 Check Unblock Status / Restore View</button>
          <div id="fsm-appeal-feedback" style="font-size: 12px; margin-top: 8px; text-align: center; display: none;"></div>
        </div>
      </div>
    </div>
  `;

  // 4. Live Ticking Countdown Timer & Periodic Auto-Unlock Probe
  function updateCountdown() {
    const timerElem = document.getElementById("fsm-countdown-timer");
    if (!timerElem) return;
    const diff = Math.max(0, targetTimestamp - Date.now());
    if (diff <= 0) {
      timerElem.innerHTML = "<span style='color: #34d399;'>Detention Expired. Unlocking...</span>";
      try {
        localStorage.removeItem("fsm_lockdown_until");
        localStorage.removeItem("fsm_lockdown_policy");
        localStorage.removeItem("fsm_lockdown_reason");
        localStorage.removeItem("fsm_lockdown_label");
        localStorage.removeItem("fsm_lockdown_release");
        localStorage.removeItem("fsm_lockdown_incident");
        sessionStorage.removeItem("fsm_strike_count");
      } catch (_) {}
      setTimeout(() => window.location.reload(), 1500);
      return;
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    timerElem.textContent = `${hours.toString().padStart(2, "0")}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
  }

  updateCountdown();
  const timerInterval = setInterval(updateCountdown, 1000);

  // 5. Inline Appeal Submission to Administrator
  const appealBtn = document.getElementById("fsm-appeal-submit-btn");
  if (appealBtn) {
    appealBtn.onclick = async () => {
      const nameVal = (document.getElementById("fsm-appeal-name-input")?.value || "").trim();
      const emailVal = (document.getElementById("fsm-appeal-email-input")?.value || "").trim();
      const reasonVal = (document.getElementById("fsm-appeal-reason-input")?.value || "").trim();
      const feedback = document.getElementById("fsm-appeal-feedback");

      if (!nameVal || !emailVal) {
        if (feedback) {
          feedback.style.display = "block";
          feedback.style.color = "#f87171";
          feedback.textContent = "Please enter your name and email.";
        }
        return;
      }

      appealBtn.disabled = true;
      appealBtn.textContent = "Submitting Appeal...";
      try {
        const resp = await fetch("/api/security/jail-appeal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentId,
            name: nameVal,
            email: emailVal,
            message: reasonVal || "Student requested pardon for security detention.",
          }),
        });
        const resData = await resp.json().catch(() => ({}));
        if (feedback) {
          feedback.style.display = "block";
          if (resData.success) {
            feedback.style.color = "#34d399";
            feedback.textContent = "✅ Appeal delivered to Administrator for review!";
            appealBtn.textContent = "Appeal Dispatched";
          } else {
            feedback.style.color = "#fca5a5";
            feedback.textContent = resData.message || "Appeal logged for admin review.";
            appealBtn.disabled = false;
            appealBtn.textContent = "Resend Appeal";
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.style.display = "block";
          feedback.style.color = "#f87171";
          feedback.textContent = "Failed to submit appeal: " + err.message;
        }
        appealBtn.disabled = false;
        appealBtn.textContent = "Retry";
      }
    };
  }

  // 5b. Manual Check Pardon & Immediate Unlock Button
  const verifyBtn = document.getElementById("fsm-verify-pardon-btn");
  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      verifyBtn.disabled = true;
      verifyBtn.textContent = "Checking Server Status...";
      const feedback = document.getElementById("fsm-appeal-feedback");
      try {
        const incId = incidentId || (typeof localStorage !== "undefined" && localStorage.getItem("fsm_lockdown_incident")) || "";
        const res = await fetch(`/api/security/check-pardon?incidentId=${encodeURIComponent(incId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (data && data.success && data.pardoned === true) {
          verifyBtn.textContent = "🎉 Access Restored! Reloading...";
          if (feedback) {
            feedback.style.display = "block";
            feedback.style.color = "#34d399";
            feedback.textContent = "✅ Administrator unblock verified. Restoring platform view...";
          }
          try {
            localStorage.removeItem("fsm_lockdown_until");
            localStorage.removeItem("fsm_lockdown_policy");
            localStorage.removeItem("fsm_lockdown_reason");
            localStorage.removeItem("fsm_lockdown_label");
            localStorage.removeItem("fsm_lockdown_release");
            localStorage.removeItem("fsm_lockdown_incident");
            sessionStorage.removeItem("fsm_strike_count");
          } catch (_) {}
          setTimeout(() => window.location.reload(), 800);
        } else {
          verifyBtn.disabled = false;
          verifyBtn.textContent = "🔄 Re-check Access";
          if (feedback) {
            feedback.style.display = "block";
            feedback.style.color = "#fca5a5";
            feedback.textContent = "Detention is still active on server. If you believe this is an error, please submit an appeal.";
          }
        }
      } catch (err) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = "🔄 Retry Check";
      }
    };
  }

  // 6. Poll server silently in background - ONLY reload if Administrator explicitly pardoned this incident
  const pingInterval = setInterval(async () => {
    try {
      const incId = incidentId || (typeof localStorage !== "undefined" && localStorage.getItem("fsm_lockdown_incident")) || "";
      if (!incId) return;
      const res = await fetch(`/api/security/check-pardon?incidentId=${encodeURIComponent(incId)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // CRITICAL: NEVER reload unless the server explicitly confirms data.pardoned === true!
        if (data && data.success && data.pardoned === true) {
          clearInterval(timerInterval);
          clearInterval(pingInterval);
          const timerElem = document.getElementById("fsm-countdown-timer");
          if (timerElem) {
            timerElem.innerHTML = "<span style='color: #34d399;'>🎉 Pardoned by Administrator! Unlocking...</span>";
          }
          try {
            localStorage.removeItem("fsm_lockdown_until");
            localStorage.removeItem("fsm_lockdown_policy");
            localStorage.removeItem("fsm_lockdown_reason");
            localStorage.removeItem("fsm_lockdown_label");
            localStorage.removeItem("fsm_lockdown_release");
            localStorage.removeItem("fsm_lockdown_incident");
            sessionStorage.removeItem("fsm_strike_count");
          } catch (_) {}
          setTimeout(() => window.location.reload(), 1200);
        }
      }
    } catch (_) {}
  }, 3000);
}

/**
 * Initialize Anti-Tamper Observers & Traps
 */
export function initAntiTamperDefense() {
  if (typeof window === "undefined" || isDefenseInitialized) return;
  isDefenseInitialized = true;

  // Emergency unblock query parameter check (?unblock=1, ?pardon=1, ?admin_bypass=1, ?reset=1)
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("unblock") === "1" ||
      params.get("pardon") === "1" ||
      params.get("admin_bypass") === "1" ||
      params.get("admin_dev") === "1" ||
      params.get("reset_security") === "1"
    ) {
      localStorage.removeItem("fsm_lockdown_until");
      localStorage.removeItem("fsm_lockdown_policy");
      localStorage.removeItem("fsm_lockdown_reason");
      localStorage.removeItem("fsm_lockdown_label");
      localStorage.removeItem("fsm_lockdown_release");
      localStorage.removeItem("fsm_lockdown_incident");
      sessionStorage.removeItem("fsm_strike_count");
      console.log("[SECURITY] 🔓 Emergency unblock activated via URL parameter.");
      return;
    }
  } catch (_) {}

  // 0. Check for existing active security detention lock in localStorage
  try {
    const savedUntil = localStorage.getItem("fsm_lockdown_until");
    const savedPolicy = localStorage.getItem("fsm_lockdown_policy") || "Client Script / DevTools Tamper (Strike 3)";
    const savedReason = localStorage.getItem("fsm_lockdown_reason");
    const savedLabel = localStorage.getItem("fsm_lockdown_label") || "24 Hours";
    const savedRelease = localStorage.getItem("fsm_lockdown_release") || "✅ Auto-release after 24h";
    const savedIncident = localStorage.getItem("fsm_lockdown_incident");

    if (savedUntil && Number(savedUntil) > Date.now()) {
      // 🛡️ Live Server Verification: Check if Admin unblocked the user/device
      try {
        fetch(`/api/security/check-pardon?incidentId=${encodeURIComponent(savedIncident || "")}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.success && d.pardoned) {
              console.log("[SECURITY] 🔓 Server confirmed pardon. Clearing lockdown state.");
              localStorage.removeItem("fsm_lockdown_until");
              localStorage.removeItem("fsm_lockdown_policy");
              localStorage.removeItem("fsm_lockdown_reason");
              localStorage.removeItem("fsm_lockdown_label");
              localStorage.removeItem("fsm_lockdown_release");
              localStorage.removeItem("fsm_lockdown_incident");
              sessionStorage.removeItem("fsm_strike_count");
              window.location.reload();
            }
          })
          .catch(() => {});
      } catch (_) {}

      triggerClientLockdown(savedReason || "Security quarantine detention active.", {
        policyName: savedPolicy,
        targetTimestamp: Number(savedUntil),
        durationLabel: savedLabel,
        autoReleasePolicy: savedRelease,
        adminPardon: "Can be instantly pardoned by Administrator",
        incidentId: savedIncident,
      });
      return;
    } else if (savedUntil) {
      localStorage.removeItem("fsm_lockdown_until");
      localStorage.removeItem("fsm_lockdown_policy");
      localStorage.removeItem("fsm_lockdown_reason");
      localStorage.removeItem("fsm_lockdown_label");
      localStorage.removeItem("fsm_lockdown_release");
      localStorage.removeItem("fsm_lockdown_incident");
      sessionStorage.removeItem("fsm_strike_count");
    }
  } catch (_) {}

  // 1. Prototype & Fetch Trapping
  const originalFetch = window.fetch;
  let isFetchOverridden = false;

  try {
    Object.defineProperty(window, "fetch", {
      get() {
        return originalFetch;
      },
      set(val) {
        isFetchOverridden = true;
        reportTamperIncident("Attempted to hijack window.fetch prototype");
        return originalFetch;
      },
      configurable: false,
    });
  } catch (_) {}

  // 2. DOM Mutation Observer (Catch dynamically injected unauthorized <script> tags)
  try {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === "SCRIPT" && !node.getAttribute("data-fsm-allowed")) {
            const src = node.getAttribute("src") || "";
            const isLocalAsset = src.startsWith("/assets/") || src.startsWith("./assets/") || src.includes("vite") || src.includes("@vite");
            if (!isLocalAsset && node.innerHTML) {
              console.warn("[ANTI-TAMPER] 🚨 Unauthorized dynamic script tag injected into DOM!");
              try {
                node.remove();
              } catch (_) {}
              reportTamperIncident("Injected unauthorized <script> tag into DOM via console");
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (_) {}

  // 3. Global Variable Freezing (Prevent console overwriting of core security states)
  try {
    window.fsmSecurityShield = Object.freeze({
      active: true,
      mode: "ZERO_TRUST_DEFENSE",
      maxStrikes: 3,
    });
  } catch (_) {}

  // 4. Option 2: Multi-Vector disable-devtool Guard with ALL Detectors
  if (!isDevToolsBypassed()) {
    try {
      disableDevtool({
        disableMenu: true, // Right-click contextmenu disabled
        clearLog: false,   // Lightweight logging without layout thrashing
        disableSelect: false, // Students MUST be able to select text for reading
        disableCopy: false,   // Allow students to copy academic notes text
        disableCut: false,
        disablePaste: false,
        interval: 300,     // 300ms high-speed periodic scan (instant console/devtools interception)
        detectors: [
          disableDevtool.DetectorType.RegToString,
          disableDevtool.DetectorType.DefineId,
          disableDevtool.DetectorType.Size,
          disableDevtool.DetectorType.DateToString,
          disableDevtool.DetectorType.FuncToString,
          disableDevtool.DetectorType.Debugger,
          disableDevtool.DetectorType.Performance,
          disableDevtool.DetectorType.DebugLib,
        ],
        ignore: () => isDevToolsBypassed(),
        ondevtoolopen: (type) => {
          const detectorLabel = DETECTOR_NAMES[type] || `Detector #${type}`;
          onDevToolsDetected(
            `Developer Tools / Console Inspection Attempt (disable-devtool: ${detectorLabel})`,
            { detectorType: type }
          );
        },
        ondevtoolclose: () => {
          onDevToolsClosed();
        },
      });
      console.log("[SECURITY] 🔒 Option 2: disable-devtool armed with all detectors (Size, RegExp, Debugger).");
    } catch (dtErr) {
      console.warn("[SECURITY] disable-devtool init notice:", dtErr.message);
    }

    // 5. Native Docked DevTools Dimension Sensor (Catches docked inspect window instantly)
    const checkDockedDevTools = () => {
      if (isDevToolsBypassed()) return;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      // Docked DevTools: widthDiff > 200 (side dock) or heightDiff > 240 (bottom dock)
      const isDocked = widthDiff > 200 || heightDiff > 240;

      if (isDocked) {
        if (!isDockedDevToolsOpen) {
          isDockedDevToolsOpen = true;
          onDevToolsDetected(`Docked Developer Tools Detected (${widthDiff > 200 ? "Side" : "Bottom"} Dock)`);
        }
      } else {
        // DevTools is NOT docked!
        if (isDockedDevToolsOpen || isDevToolsSessionActive) {
          isDockedDevToolsOpen = false;
          // Verify if DevTools is genuinely closed, then restore view
          if (!isDevToolsCurrentlyOpen()) {
            onDevToolsClosed();
          }
        }
      }
    };
    window.addEventListener("resize", checkDockedDevTools);
    setInterval(checkDockedDevTools, 400);

    // 6. Native Keyboard Shortcut Interception (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U)
    window.addEventListener(
      "keydown",
      (e) => {
        if (isDevToolsBypassed()) return;
        const isF12 = e.key === "F12" || e.keyCode === 123;
        const isInspectKey =
          (e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key);
        const isViewSource = (e.ctrlKey || e.metaKey) && ["U", "u"].includes(e.key);
        if (isF12 || isInspectKey || isViewSource) {
          e.preventDefault();
          e.stopPropagation();
          onDevToolsDetected(`Developer Tools keyboard shortcut (${e.key}) intercepted`);
        }
      },
      true
    );
  }

  console.log("[SECURITY] 🛡️ Client-Side Anti-Tamper & Zero-Trust Defense active (3-Strike Rule).");
}
