/**
 * ============================================================================
 * 🛡️ CLIENT-SIDE ANTI-TAMPER & ZERO-TRUST DEFENSE SENSOR
 * ============================================================================
 * - Option 2: Powered by disable-devtool (Industry-Standard Shield)
 * - Detects console tampering, prototype pollution, script injection & DevTools opening
 * - 3-Strike Warning & Auto-Block Defense Rule
 * - Real-time Telegram Security Bot Supergroup Topic 6 reporting
 * - Strikes 1 & 2: Instant Warning Modal with attempt counter
 * - Strike 3+: Database Account Ban, Token Revocation, IP Jail & Red Screen Lockdown
 * ============================================================================
 */

import disableDevtool from "disable-devtool";

let strikeCount = 0;
let isDefenseInitialized = false;
let isLockdownActive = false;
let activeWarningNotice = null;

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
 * Checks if DevTools protection should be bypassed for Admin
 */
function isDevToolsBypassed() {
  if (typeof window === "undefined") return true;

  // 1. Admin URL parameters (?admin_inspect=1, ?admin_dev=1, ?debug=1, ?admin_bypass=1)
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("admin_inspect") === "1" ||
      params.get("admin_dev") === "1" ||
      params.get("debug") === "1" ||
      params.get("admin_bypass") === "1"
    ) {
      return true;
    }
  } catch (_) {}

  // 3. Admin session check in localStorage / sessionStorage
  try {
    if (localStorage.getItem("fsm_admin_token") || sessionStorage.getItem("fsm_admin_token")) {
      return true;
    }
    const userStr = localStorage.getItem("vault_user");
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.role === "admin" || u.role === "half_admin" || u.isMasterAdmin || u.isMainAdmin) {
        return true;
      }
    }
  } catch (_) {}

  return false;
}

/**
 * Safely extracts current student profile info for security alert
 */
function getCurrentUserData() {
  try {
    const userStr = localStorage.getItem("vault_user");
    if (!userStr) return null;
    const u = JSON.parse(userStr);
    return {
      name: u.name || "Student Scholar",
      email: u.email || "N/A",
      mobile: u.mobile || "N/A",
      college: u.college || "N/A",
      year: u.year || "N/A",
      role: u.role || "student",
    };
  } catch (_) {
    return null;
  }
}

/**
 * Report Tampering Beacon to Server -> Telegram Supergroup Topic 6
 */
async function reportTamperIncident(detail = "Unauthorized script tampering detected", extra = {}) {
  const now = Date.now();
  if (now - lastTamperDispatch < 2500) return; // 2.5s debounce
  lastTamperDispatch = now;

  strikeCount += 1;
  const currentStrike = strikeCount;

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
    } else {
      showStrikeWarning(currentStrike, data.warningMessage);
    }
  } catch (err) {
    if (currentStrike >= 3) {
      triggerClientLockdown("Security violation: Maximum tampering attempts exceeded.");
    } else {
      showStrikeWarning(currentStrike);
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
    top: 20px;
    right: 20px;
    z-index: 999999;
    max-width: 440px;
    background: ${isFinalWarning ? "linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)" : "linear-gradient(135deg, #78350f 0%, #451a03 100%)"};
    border: 2px solid ${isFinalWarning ? "#ef4444" : "#f59e0b"};
    border-radius: 12px;
    padding: 16px 20px;
    color: #fff;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px ${isFinalWarning ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"};
    font-family: system-ui, -apple-system, sans-serif;
    animation: fsmSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  overlay.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px;">
      <span style="font-size: 24px; line-height: 1;">${isFinalWarning ? "🚨" : "⚠️"}</span>
      <div style="flex: 1;">
        <div style="font-weight: 800; font-size: 0.95rem; color: ${isFinalWarning ? "#fca5a5" : "#fde68a"}; margin-bottom: 4px;">
          ${isFinalWarning ? "🚨 FINAL SECURITY WARNING (Attempt 2 of 3)" : "⚠️ SECURITY SHIELD: DEVTOOLS PROHIBITED (Attempt 1 of 3)"}
        </div>
        <div style="font-size: 0.82rem; color: #f8fafc; line-height: 1.45; margin-bottom: 8px;">
          ${customMessage || "Free Study Material Vault par Developer Tools ya Console inspect karna prohibited hai. Academic integrity ke liye kripya DevTools band karein."}
        </div>
        <div style="font-size: 0.74rem; color: ${isFinalWarning ? "#f87171" : "#fbbf24"}; font-weight: 600;">
          ⚠️ Notice: 3 baar violation karne par aapka account database me permanent ban ho jayega aur IP jail ho jayegi.
        </div>
      </div>
      <button id="fsm-warning-dismiss-btn" style="
        background: none;
        border: none;
        color: rgba(255,255,255,0.6);
        font-size: 18px;
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

  // 2. Clear all cookies
  try {
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  } catch (_) {}

  // 3. Render Full-Screen Permanent Red Lockdown Screen
  document.body.innerHTML = `
    <div style="
      position: fixed;
      inset: 0;
      background: #09090b;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999;
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
          Your user account has been deactivated in the database. Active WebSocket connections have been killed, your authentication session has been revoked, and your IP address has been reported to the administrator security topic.
        </p>
        
        <div style="
          font-size: 0.75rem;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 16px;
        ">
          Incident ID: <code style="color: #cbd5e1;">FSM-SEC-${Date.now().toString(36).toUpperCase()}</code> • Supergroup Topic 6 Alerted
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
            // Check if script was injected dynamically outside build
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

  // 4. Option 2: Multi-Vector disable-devtool Guard
  if (!isDevToolsBypassed()) {
    try {
      disableDevtool({
        disableMenu: true, // Right-click contextmenu disabled
        clearLog: false,   // Lightweight logging without layout thrashing
        disableSelect: false, // Students MUST be able to select text for reading
        disableCopy: false,   // Allow students to copy academic notes text
        disableCut: false,
        disablePaste: false,
        interval: 350,     // 350ms high-speed periodic scan (instant console/devtools interception)
        ignore: () => isDevToolsBypassed(),
        ondevtoolopen: (type) => {
          const detectorLabel = DETECTOR_NAMES[type] || `Detector #${type}`;
          reportTamperIncident(
            `Developer Tools / Console Inspection Attempt (disable-devtool: ${detectorLabel})`,
            { detectorType: type }
          );
        },
        ondevtoolclose: () => {
          // Auto-dismiss warning overlay when user complies and closes DevTools
          const overlay = document.getElementById("fsm-tamper-warning-overlay");
          if (overlay && !isLockdownActive) {
            overlay.remove();
          }
        },
      });
      console.log("[SECURITY] 🔒 Option 2: disable-devtool armed with Supergroup Topic 6 sensor.");
    } catch (dtErr) {
      console.warn("[SECURITY] disable-devtool init notice:", dtErr.message);
    }
  }

  console.log("[SECURITY] 🛡️ Client-Side Anti-Tamper & Zero-Trust Defense active (3-Strike Rule).");
}

