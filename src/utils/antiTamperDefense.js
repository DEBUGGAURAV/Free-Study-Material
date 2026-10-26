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

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "N/A";
  const cores = navigator.hardwareConcurrency || "N/A";
  const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A";
  const screenSpec = window.screen ? `${window.screen.width}x${window.screen.height} (${window.screen.colorDepth}-bit)` : "N/A";

  return {
    isLoggedIn: false,
    name: `Anonymous Visitor [${anonUid.slice(-6).toUpperCase()}]`,
    email: "Unauthenticated Guest",
    mobile: "N/A",
    college: `Hardware: ${cores} Cores • ${mem} RAM • TZ: ${tz}`,
    year: `Resolution: ${screenSpec}`,
    role: "guest",
    guestUid: anonUid,
    timezone: tz,
    hardwareCores: cores,
    memoryEstimate: mem,
  };
}

/**
 * Report Tampering Beacon to Server -> Telegram Supergroup Topic 6
 */
async function reportTamperIncident(detail = "Unauthorized script tampering detected", extra = {}) {
  const now = Date.now();
  if (now - lastTamperDispatch < 1800) return; // 1.8s debounce
  lastTamperDispatch = now;

  strikeCount += 1;
  const currentStrike = strikeCount;

  // ⚡ 0ms INSTANT VISUAL FEEDBACK: Render warning before waiting for network fetch!
  if (currentStrike >= 3) {
    triggerClientLockdown("Security violation: Maximum tampering attempts exceeded (3/3).");
  } else {
    showStrikeWarning(currentStrike);
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
        ...extra,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (data.action === "BAN" || data.isBlocked || currentStrike >= 3) {
      triggerClientLockdown(data.message || "Account permanently blocked for repeated script tampering.");
    }
  } catch (err) {
    if (currentStrike >= 3) {
      triggerClientLockdown("Security violation: Maximum tampering attempts exceeded.");
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
          ${customMessage || "Free Study Material Vault par Developer Tools ya Console inspect karna strictly prohibited hai. Academic integrity ke liye kripya DevTools band karein."}
        </div>
        <div style="font-size: 0.75rem; color: ${isFinalWarning ? "#f87171" : "#fbbf24"}; font-weight: 600; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 6px;">
          ⚠️ Notice: 3 baar violation karne par aapka account database me permanent ban ho jayega aur IP jail ho jayegi.
        </div>
      </div>
      <button id="fsm-warning-dismiss-btn" style="
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      ">✕</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismissBtn = document.getElementById("fsm-warning-dismiss-btn");
  if (dismissBtn) {
    dismissBtn.onclick = () => overlay.remove();
  }

  // Auto-dismiss warning after 8 seconds
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 8000);
}

/**
 * Permanent Red Lockdown Screen (Strike 3+)
 */
function triggerClientLockdown(reason) {
  isLockdownActive = true;

  // 1. Wipe client tokens & storage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (_) {}

  // 2. Kill all active intervals & timers
  try {
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = 0; i < highestTimeoutId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  } catch (_) {}

  // 3. Render Permanent Red Lockdown Screen
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
      padding: 24px;
      color: #fff;
    ">
      <div style="
        max-width: 520px;
        width: 100%;
        background: radial-gradient(circle at top, rgba(185, 28, 28, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%);
        border: 2px solid #ef4444;
        border-radius: 20px;
        padding: 36px 30px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(239, 68, 68, 0.3);
      ">
        <div style="
          width: 68px;
          height: 68px;
          margin: 0 auto 18px auto;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          border: 1px solid rgba(239, 68, 68, 0.4);
        ">
          🚫
        </div>
        
        <h2 style="font-size: 1.4rem; font-weight: 800; color: #ef4444; margin: 0 0 10px 0; letter-spacing: -0.5px;">
          SECURITY LOCKDOWN: ACCOUNT PERMANENTLY BLOCKED
        </h2>
        
        <div style="
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 0.85rem;
          color: #fca5a5;
          margin-bottom: 20px;
          line-height: 1.45;
        ">
          ${reason || "Repeated script tampering and console modification detected (3/3 attempts)."}
        </div>
        
        <p style="font-size: 0.84rem; color: #94a3b8; line-height: 1.5; margin: 0 0 24px 0;">
          Your user account has been deactivated in the database. Active WebSocket connections have been killed, your authentication session has been revoked, and your IP address has been logged for security review.
        </p>
        
        <div style="
          font-size: 0.75rem;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 16px;
        ">
          Incident ID: <code style="color: #cbd5e1;">FSM-SEC-${Date.now().toString(36).toUpperCase()}</code>
        </div>
        <div style="
          margin-top: 12px;
          font-size: 0.75rem;
          color: #94a3b8;
          line-height: 1.45;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 8px 12px;
        ">
          💡 To submit an unblock appeal, open the Help Center, select Category <strong style="color: #f87171;">Account Block Appeal</strong>, and provide this Incident ID for instant administrator review.
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize Anti-Tamper Observers & Traps
 */
export function initAntiTamperDefense() {
  if (typeof window === "undefined" || isDefenseInitialized) return;
  isDefenseInitialized = true;

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
          reportTamperIncident(
            `Developer Tools / Console Inspection Attempt (disable-devtool: ${detectorLabel})`,
            { detectorType: type }
          );
        },
        ondevtoolclose: () => {
          const overlay = document.getElementById("fsm-tamper-warning-overlay");
          if (overlay && !isLockdownActive) {
            overlay.remove();
          }
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
      if (widthDiff > 160 || heightDiff > 160) {
        reportTamperIncident(`Docked Developer Tools Detected (${widthDiff > 160 ? "Side" : "Bottom"} Dock)`);
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
          reportTamperIncident(`Developer Tools keyboard shortcut (${e.key}) intercepted`);
        }
      },
      true
    );
  }

  console.log("[SECURITY] 🛡️ Client-Side Anti-Tamper & Zero-Trust Defense active (3-Strike Rule).");
}
