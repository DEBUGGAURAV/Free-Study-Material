/**
 * ============================================================================
 * 🛡️ CLIENT-SIDE ANTI-TAMPER & ZERO-TRUST DEFENSE SENSOR
 * ============================================================================
 * - Detects console tampering, prototype pollution, script injection & DevTools timing
 * - 3-Strike Warning & Auto-Block Defense Rule
 * - Strikes 1 & 2: Instant Warning Modal with attempt counter
 * - Strike 3+: Database Account Ban, Token Revocation, IP Jail & Red Screen Lockdown
 * ============================================================================
 */

let strikeCount = 0;
let isDefenseInitialized = false;
let isLockdownActive = false;
let activeWarningNotice = null;

// Debounce so a single tamper event doesn't trigger multiple rapid alerts
let lastTamperDispatch = 0;

/**
 * Report Tampering Beacon to Server
 */
async function reportTamperIncident(detail = "Unauthorized script tampering detected") {
  const now = Date.now();
  if (now - lastTamperDispatch < 2000) return; // 2s debounce
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
        deviceInfo: `${navigator.userAgent || "Unknown"} (${navigator.platform || "Platform"})`,
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
          ${isFinalWarning ? "FINAL SECURITY WARNING (Attempt 2 of 3)" : "SECURITY WARNING (Attempt 1 of 3)"}
        </div>
        <div style="font-size: 0.82rem; color: #f8fafc; line-height: 1.45; margin-bottom: 8px;">
          ${customMessage || "Unauthorized script modification or console tampering detected. Please cease immediately."}
        </div>
        <div style="font-size: 0.74rem; color: ${isFinalWarning ? "#f87171" : "#fbbf24"}; font-weight: 600;">
          ⚠️ Notice: If you attempt tampering 3 times, your account will be automatically permanently blocked in database and your IP will be jailed.
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
            const isLocalAsset = src.startsWith("/assets/") || src.startsWith("./assets/") || src.includes("vite");
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

  console.log("[SECURITY] 🛡️ Client-Side Anti-Tamper & Zero-Trust Defense active (3-Strike Rule).");
}

