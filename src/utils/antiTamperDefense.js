/**
 * Client-Side Forensic Profile & Server-Verified Quarantine Overlay
 * - Zero false-positive DevTools traps (students/browsers are never falsely jailed by window resize or F12)
 * - Renders an authentic, accessible Quarantine & Quick Appeal Desk ONLY when the backend explicitly
 *   enforces SECURITY_JAIL (HTTP 429) or Account Block (isBlocked: true).
 */

let lockedState = false;
let countdownTimerId = null;
let pardonPollTimerId = null;

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearLockdownStorage() {
  try {
    localStorage.removeItem("fsm_lockdown_until");
    localStorage.removeItem("fsm_lockdown_policy");
    localStorage.removeItem("fsm_lockdown_reason");
    localStorage.removeItem("fsm_lockdown_label");
    localStorage.removeItem("fsm_lockdown_release");
    localStorage.removeItem("fsm_lockdown_incident");
    sessionStorage.removeItem("fsm_strike_count");
  } catch (_) {}
}

export function getForensicHardwareProfile() {
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "N/A";
  const width = typeof window !== "undefined" && window.screen ? window.screen.width : 0;
  const height = typeof window !== "undefined" && window.screen ? window.screen.height : 0;
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints ? `${navigator.maxTouchPoints}-pt Multi-Touch` : "Mouse/Trackpad";
  const network = typeof navigator !== "undefined" && navigator.connection?.effectiveType ? navigator.connection.effectiveType.toUpperCase() : "Online";

  return {
    cores: typeof navigator !== "undefined" && navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : "N/A",
    ram: typeof navigator !== "undefined" && navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A",
    storage: typeof navigator !== "undefined" && navigator.deviceMemory ? (navigator.deviceMemory >= 8 ? "256 GB+ NVMe SSD" : navigator.deviceMemory >= 4 ? "128 GB UFS/SSD" : "64 GB Flash Storage") : "Fast System Storage",
    gpu: "N/A",
    screen: `${width}x${height}`,
    touch,
    network,
    timezone: tz,
  };
}

export function triggerClientLockdown(reason = "Security quarantine active.", opts = {}) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  lockedState = true;

  const incidentId = String(opts.incidentId || `FSM-SEC-${Math.floor(100000 + Math.random() * 900000)}`);
  const policyName = String(opts.policyName || "Security Detention Policy");
  const durationLabel = String(opts.durationLabel || "Temporary Detention");
  const autoReleasePolicy = String(opts.autoReleasePolicy || "✅ Auto-release on expiration");
  const isPermanentBan = incidentId.startsWith("FSM-BAN-") || /permanent/i.test(durationLabel);
  let targetTs = Number(opts.targetTimestamp) || (Date.now() + 15 * 60 * 1000);

  try {
    const storedUntil = Number(localStorage.getItem("fsm_lockdown_until") || 0);
    const storedInc = localStorage.getItem("fsm_lockdown_incident") || "";
    if (!isPermanentBan && storedInc === incidentId && storedUntil > Date.now()) {
      targetTs = storedUntil;
    } else if (!isPermanentBan) {
      localStorage.setItem("fsm_lockdown_until", String(targetTs));
      localStorage.setItem("fsm_lockdown_incident", incidentId);
    }
  } catch (_) {}

  const existing = document.getElementById("fsm-security-quarantine-overlay");
  if (existing) existing.remove();
  if (countdownTimerId) clearInterval(countdownTimerId);
  if (pardonPollTimerId) clearInterval(pardonPollTimerId);

  const overlay = document.createElement("div");
  overlay.id = "fsm-security-quarantine-overlay";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647",
    "background:rgba(9,9,11,0.97)", "color:#f8fafc",
    "display:flex", "align-items:center", "justify-content:center",
    "padding:20px", "overflow-y:auto",
    "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  ].join(";");

  overlay.innerHTML = `
    <div style="max-width:520px;width:100%;background:radial-gradient(circle at top,rgba(185,28,28,0.24) 0%,rgba(15,23,42,0.98) 100%);border:2px solid #ef4444;border-radius:20px;padding:28px 24px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.9);margin:auto;">
      <div style="width:60px;height:60px;margin:0 auto 14px;border-radius:50%;background:rgba(239,68,68,0.16);border:1.5px solid rgba(239,68,68,0.5);display:flex;align-items:center;justify-content:center;font-size:28px;">🛡️</div>
      <h2 style="margin:0 0 8px;font-size:1.25rem;font-weight:800;color:#f87171;text-transform:uppercase;">Security Quarantine Active</h2>
      <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.45);font-size:0.76rem;font-weight:700;color:#fca5a5;margin-bottom:14px;">
        ${escHtml(policyName)}
      </div>
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:12px 14px;font-size:0.84rem;color:#fecaca;margin-bottom:16px;text-align:left;line-height:1.45;">
        ${escHtml(reason)}
      </div>
      <div style="background:rgba(15,23,42,0.88);border:1.5px solid rgba(245,158,11,0.45);border-radius:14px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:0.7rem;text-transform:uppercase;color:#fcd34d;font-weight:800;letter-spacing:0.8px;">
          ${isPermanentBan ? "Account Status" : "Auto-Release Countdown"}
        </div>
        <div id="fsm-overlay-timer" style="font-size:1.9rem;font-weight:900;color:#fbbf24;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:6px 0;">
          ${isPermanentBan ? "ADMIN REVIEW" : "Calculating..."}
        </div>
        <div style="font-size:0.76rem;color:#cbd5e1;display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
          <span>Window: <strong>${escHtml(durationLabel)}</strong></span>
          <span>Incident: <code style="color:#38bdf8;">${escHtml(incidentId)}</code></span>
        </div>
        <div style="font-size:0.72rem;color:#34d399;margin-top:6px;">${escHtml(autoReleasePolicy)}</div>
      </div>
      <form id="fsm-overlay-appeal-form" style="text-align:left;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
        <div style="font-size:0.8rem;font-weight:700;color:#e2e8f0;margin-bottom:8px;">📝 Quick Appeal Desk to Administrator</div>
        <input id="fsm-appeal-name" type="text" required placeholder="Your Full Name (Required)" style="width:100%;box-sizing:border-box;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:8px 10px;color:#fff;font-size:0.8rem;margin-bottom:8px;" />
        <input id="fsm-appeal-email" type="email" required placeholder="Your Email (Required)" style="width:100%;box-sizing:border-box;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:8px 10px;color:#fff;font-size:0.8rem;margin-bottom:8px;" />
        <textarea id="fsm-appeal-msg" rows="2" placeholder="Explain briefly (e.g. Campus shared Wi-Fi)" style="width:100%;box-sizing:border-box;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:8px 10px;color:#fff;font-size:0.8rem;margin-bottom:8px;"></textarea>
        <button id="fsm-appeal-btn" type="submit" style="width:100%;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;font-size:0.82rem;cursor:pointer;">🚀 Submit Pardon Appeal</button>
        <div id="fsm-appeal-status" style="font-size:0.76rem;margin-top:8px;text-align:center;display:none;"></div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const unlockAndReload = (label) => {
    lockedState = false;
    clearLockdownStorage();
    if (countdownTimerId) clearInterval(countdownTimerId);
    if (pardonPollTimerId) clearInterval(pardonPollTimerId);
    const timerEl = document.getElementById("fsm-overlay-timer");
    if (timerEl) {
      timerEl.style.color = "#34d399";
      timerEl.style.fontSize = "1.1rem";
      timerEl.textContent = label;
    }
    setTimeout(() => {
      try { overlay.remove(); } catch (_) {}
      window.location.reload();
    }, 1200);
  };

  if (!isPermanentBan) {
    const tick = () => {
      const el = document.getElementById("fsm-overlay-timer");
      if (!el) return;
      const diff = Math.max(0, targetTs - Date.now());
      if (diff <= 0) {
        unlockAndReload("✅ Detention Expired — Restoring Access...");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    };
    tick();
    countdownTimerId = setInterval(tick, 1000);
  }

  pardonPollTimerId = setInterval(async () => {
    try {
      const res = await fetch(`/api/security/check-pardon?incidentId=${encodeURIComponent(incidentId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.success && data.pardoned === true) {
          unlockAndReload("🎉 Pardoned by Administrator — Unlocking...");
        }
      }
    } catch (_) {}
  }, 15000);

  const form = document.getElementById("fsm-overlay-appeal-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("fsm-appeal-btn");
      const statusEl = document.getElementById("fsm-appeal-status");
      if (btn) { btn.disabled = true; btn.textContent = "Submitting Appeal..."; }
      try {
        const name = document.getElementById("fsm-appeal-name")?.value?.trim() || "Student Visitor";
        const email = document.getElementById("fsm-appeal-email")?.value?.trim() || "Not Provided";
        const message = document.getElementById("fsm-appeal-msg")?.value?.trim() || "Student pardon appeal.";
        const res = await fetch("/api/security/jail-appeal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ incidentId, name, email, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (statusEl) {
          statusEl.style.display = "block";
          statusEl.style.color = data.success ? "#34d399" : "#f87171";
          statusEl.textContent = data.success
            ? "✅ Appeal sent to Administrator (Topic 750). Auto-unlocking upon pardon."
            : `⚠️ ${data.message || "Failed to submit appeal."}`;
        }
        if (btn) {
          btn.disabled = Boolean(data.success);
          btn.textContent = data.success ? "Appeal Logged" : "Try Again";
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.display = "block";
          statusEl.style.color = "#f87171";
          statusEl.textContent = `⚠️ Submission failed: ${err.message}`;
        }
        if (btn) { btn.disabled = false; btn.textContent = "Try Again"; }
      }
    });
  }

  return true;
}

export function initAntiTamperDefense() {
  // Intentionally passive: avoids false-positive F12/resize lockouts on legitimate student browsers.
  // Server-authoritative detentions trigger via triggerClientLockdown() on 429 SECURITY_JAIL or account ban.
  return true;
}

export function isAntiTamperLocked() {
  return lockedState;
}

export default {
  getForensicHardwareProfile,
  triggerClientLockdown,
  initAntiTamperDefense,
  isAntiTamperLocked,
};
