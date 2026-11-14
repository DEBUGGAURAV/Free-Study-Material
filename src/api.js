/**
 * Academic Cloud API Client
 * Free Study Material Platform Engine
 */

const API_BASE = "/api";

// Same-Origin High-Performance Stream Base (Guarantees httpOnly auth cookie delivery)
export const STREAM_BASE = "/api";
import { acquireNoteDocument } from "./utils/cdnFailover";
import { saveAuthSession, loadAuthSession, clearAuthSession, saveAuthToken } from "./utils/authIndexedDb";
import { getEffectiveTechConfig } from "./utils/hardwareAdaptiveEngine";
import "./utils/offlineQueue";

let inMemoryToken = null;
let inMemoryUser = null;

export function getAuthToken() {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== "undefined" && window.__FSM_AUTH_TOKEN__) {
    inMemoryToken = window.__FSM_AUTH_TOKEN__;
    return inMemoryToken;
  }
  if (typeof localStorage !== "undefined") {
    const t = localStorage.getItem("vault_token") || localStorage.getItem("token") || localStorage.getItem("fsm_token");
    if (t) {
      inMemoryToken = t;
      return t;
    }
  }
  if (typeof sessionStorage !== "undefined") {
    const st = sessionStorage.getItem("vault_token") || sessionStorage.getItem("fsm_token");
    if (st) {
      inMemoryToken = st;
      return st;
    }
  }
  return null;
}

export function setAuthToken(token) {
  inMemoryToken = token || null;
  if (typeof window !== "undefined") {
    window.__FSM_AUTH_TOKEN__ = token || null;
  }
  if (token) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vault_token", token);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("vault_token", token);
    }
    saveAuthSession(token, inMemoryUser || getCurrentUser()).catch(() => {});
  } else {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("vault_token");
      localStorage.removeItem("token");
      localStorage.removeItem("fsm_token");
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("vault_token");
      sessionStorage.removeItem("fsm_token");
      sessionStorage.removeItem("fsm_student_study_session_v1");
    }
    clearAuthSession().catch(() => {});
  }
}

export function getCurrentUser() {
  if (inMemoryUser) return inMemoryUser;
  if (typeof window !== "undefined" && window.__FSM_CURRENT_USER__) {
    inMemoryUser = window.__FSM_CURRENT_USER__;
    return inMemoryUser;
  }
  try {
    if (typeof localStorage !== "undefined") {
      const userStr = localStorage.getItem("vault_user");
      if (userStr) {
        inMemoryUser = JSON.parse(userStr);
        return inMemoryUser;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function setCurrentUser(user) {
  inMemoryUser = user || null;
  if (typeof window !== "undefined") {
    window.__FSM_CURRENT_USER__ = user || null;
  }
  if (user) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vault_user", JSON.stringify(user));
    }
    saveAuthSession(inMemoryToken || getAuthToken(), user).catch(() => {});
  } else {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("vault_user");
    }
    clearAuthSession().catch(() => {});
  }
}

/**
 * Asynchronously restores authentication session from IndexedDB if localStorage was cleared
 * or uninitialized. Guarantees 0 false login prompts for students.
 */
export async function restoreAuthSessionFromStorage() {
  try {
    const existingToken = getAuthToken();
    const existingUser = getCurrentUser();
    if (existingToken && existingUser) {
      // Background sync to ensure IndexedDB has the latest
      saveAuthSession(existingToken, existingUser).catch(() => {});
      return { token: existingToken, user: existingUser };
    }

    const idbSession = await loadAuthSession();
    if (idbSession && (idbSession.token || idbSession.user)) {
      if (idbSession.token && !existingToken) {
        setAuthToken(idbSession.token);
      }
      if (idbSession.user && !existingUser) {
        setCurrentUser(idbSession.user);
      }
      return {
        token: idbSession.token || existingToken,
        user: idbSession.user || existingUser,
      };
    }
  } catch (err) {
    console.debug("[API] restoreAuthSessionFromStorage notice:", err);
  }
  return { token: getAuthToken(), user: getCurrentUser() };
}

// Client Stale-While-Revalidate Memory Cache for 0ms Reload Performance
const clientMemoryCache = new Map();

export function invalidateClientNotesCache() {
  for (const key of clientMemoryCache.keys()) {
    if (key.startsWith("notes_") || key === "branches" || key === "subjects") {
      clientMemoryCache.delete(key);
    }
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("fsm_offline_notes");
      localStorage.removeItem("fsm_cached_notes");
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("fsm_offline_notes");
      sessionStorage.removeItem("fsm_cached_notes");
    }
  } catch (_) {}
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Emergency Admin Bypass Support (allows admin to access platform during maintenance or IP restrictions)
  if (typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const bypass = urlParams.get("admin_bypass") || urlParams.get("bypass") || sessionStorage.getItem("admin_bypass");
      if (bypass) {
        sessionStorage.setItem("admin_bypass", bypass);
        headers["x-admin-bypass"] = bypass;
      }
    } catch (_) {}
  }

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  let lastFetchErr = null;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch (fetchErr) {
    lastFetchErr = fetchErr;
  }

  // 🛡️ Multi-Backend Intelligent Failover:
  // If local/origin backend is offline (connection refused, 502, 503, 504),
  // automatically failover to live cluster nodes (Backend 2 & Backend 3)
  const isUnreachable = !res || [502, 503, 504].includes(res.status);
  if (isUnreachable && typeof window !== "undefined") {
    const clusterBackends = [
      "https://freestudymaterial1.onrender.com",
      "https://freestudymaterial2.onrender.com",
      "https://freestudymaterial.onrender.com",
    ];
    for (const clusterOrigin of clusterBackends) {
      try {
        const cleanEp = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const fallbackRes = await fetch(`${clusterOrigin}/api${cleanEp}`, {
          ...options,
          credentials: "include",
          headers,
          signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
        });
        if (fallbackRes && (fallbackRes.ok || (fallbackRes.status < 500 && fallbackRes.status !== 402))) {
          res = fallbackRes;
          lastFetchErr = null;
          break;
        }
      } catch (_) {}
    }
  }

  if (!res && lastFetchErr) {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const msg = isOffline
      ? "You are currently offline. Please check your internet connection."
      : "Backend server is temporarily unreachable. Please check your connection or ensure the server is running.";
    const netErr = new Error(msg);
    netErr.status = 503;
    netErr.original = lastFetchErr;
    throw netErr;
  }

  let data = {};
  const rawText = await res.text().catch(() => "");
  try {
    data = JSON.parse(rawText);
  } catch (_) {
    // Sanitize any raw HTML or error pages (e.g. Render 503 / Service Suspended)
    if (rawText && (rawText.includes("<") || rawText.includes("<!DOCTYPE") || rawText.includes("<html") || rawText.includes("Service Suspended") || rawText.includes("<body"))) {
      data = {
        success: false,
        error: "CLUSTER_WAKING_UP",
        message: "Cloud cluster node is waking up from sleep. Please click refresh in a few seconds.",
      };
    } else if (rawText && rawText.length < 500) {
      data = { message: rawText.trim() };
    }
  }

  if (!res.ok) {
    let errMsg = data.message || data.error || data.details || (typeof data === "string" && data ? data : "");
    if (typeof errMsg === "string" && (errMsg.includes("<") || errMsg.includes("Service Suspended") || errMsg.includes("<!DOCTYPE") || errMsg.includes("html"))) {
      errMsg = "Cloud cluster node is waking up from sleep. Please click refresh in a few seconds.";
    }
    if (!errMsg) {
      if (res.status === 500) {
        errMsg = "Backend server error (Status 500). Please verify your backend server is running on port 5000 (`npm start`).";
      } else if (res.status === 502 || res.status === 504) {
        errMsg = "Backend server is offline or unreachable on port 5000. Please run `npm start` in your terminal.";
      } else {
        errMsg = `Request failed with status ${res.status}`;
      }
    }
    if (res.status === 429 && (data.error === "SECURITY_JAIL" || data.incidentId || data.isJailed)) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("fsm:security-detained", { detail: data }));
      }
    }
    const err = new Error(errMsg);
    err.data = data;
    err.field = data?.field || (data && typeof data === "object" ? data.field : null);
    err.status = res.status;
    if (data.maintenance || res.status === 503) {
      err.maintenance = Boolean(data.maintenance);
      err.title = data.title;
      err.estimatedEnd = data.estimatedEnd;
    }
    throw err;
  }

  return data;
}

// 🛡️ High-Entropy Client Device Specs Cache (eagerly resolved for 0ms lag on auth)
let cachedHighEntropySpecs = null;
if (typeof navigator !== "undefined" && navigator.userAgentData?.getHighEntropyValues) {
  navigator.userAgentData
    .getHighEntropyValues(["model", "platform", "platformVersion", "architecture"])
    .then((vals) => {
      cachedHighEntropySpecs = vals;
    })
    .catch(() => {});
}

/**
 * Capture crystal-clear hardware specifications and human-readable device model
 */
export function getClientDeviceSpecs() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceName: "Desktop Web",
      brand: "Desktop",
      model: "Web",
      os: "Web",
      browser: "Browser",
      cores: 4,
      memoryGB: 4,
      isMobile: false,
      screen: "1920x1080",
    };
  }

  try {
    const ua = navigator.userAgent || "";
    const cores = navigator.hardwareConcurrency || 4;
    const memoryGB = navigator.deviceMemory || 4;
    const isMobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const screenRes = typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "";
    const dpr = window.devicePixelRatio || 1;
    const isTouch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;

    let os = "Unknown OS";
    let brand = "";
    let model = "";
    let browser = "Browser";

    // 1. Detect OS & Hardware Model
    if (/iPhone/i.test(ua)) {
      brand = "Apple";
      const m = ua.match(/OS\s([0-9_]+)/i);
      os = m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
      const maxDim = Math.max(screen.width, screen.height);
      const minDim = Math.min(screen.width, screen.height);
      if (maxDim === 932 && minDim === 430) model = "iPhone 15/16 Pro Max";
      else if (maxDim === 852 && minDim === 393) model = "iPhone 15/16 Pro";
      else if (maxDim === 926 && minDim === 428) model = "iPhone 13/14 Pro Max";
      else if (maxDim === 844 && minDim === 390) model = "iPhone 12/13/14";
      else if (maxDim === 896 && minDim === 414) model = dpr >= 3 ? "iPhone 11 Pro Max" : "iPhone 11 / XR";
      else if (maxDim === 812 && minDim === 375) model = "iPhone X / XS / 11 Pro";
      else if (maxDim === 667 && minDim === 375) model = "iPhone SE / 8";
      else model = "iPhone";
    } else if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
      brand = "Apple";
      os = "iPadOS";
      model = "iPad";
    } else if (/Android/i.test(ua) || (isMobile && /Linux/i.test(ua))) {
      os = "Android";
      const m = ua.match(/Android\s([0-9\.]+)/i);
      if (m) os = `Android ${m[1]}`;

      const rawModel = cachedHighEntropySpecs?.model || navigator.userAgentData?.model || "";
      if (rawModel && rawModel.toLowerCase() !== "k" && rawModel.toLowerCase() !== "android") {
        model = rawModel.trim();
      } else {
        const buildM = ua.match(/;\s([^;)]+)\sBuild\//i);
        if (buildM && buildM[1]) model = buildM[1].trim();
      }

      const checkStr = `${ua} ${model}`;
      if (/SM-|Samsung/i.test(checkStr)) brand = "Samsung Galaxy";
      else if (/Redmi|MI\s|POCO|Xiaomi|2201|2109|2203|2210|2301|2312|2404|2406/i.test(checkStr)) brand = "Xiaomi / Redmi";
      else if (/Pixel/i.test(checkStr)) brand = "Google Pixel";
      else if (/OnePlus|CPH2/i.test(checkStr)) brand = "OnePlus";
      else if (/Vivo|V2\d{3}|iQOO/i.test(checkStr)) brand = "Vivo";
      else if (/Realme|RMX/i.test(checkStr)) brand = "Realme";
      else if (/Oppo|CPH/i.test(checkStr)) brand = "Oppo";
      else if (/Moto|XT/i.test(checkStr)) brand = "Motorola";
      else brand = "Android Phone";
    } else if (/Windows NT 10.0/i.test(ua) || navigator.userAgentData?.platform === "Windows") {
      brand = "Windows PC";
      const platVer = cachedHighEntropySpecs?.platformVersion || navigator.userAgentData?.platformVersion || "";
      const isWin11 = platVer ? parseInt(platVer.split(".")[0], 10) >= 13 : false;
      os = isWin11 ? "Windows 11" : "Windows 10/11";
      model = `${cores} Cores`;
    } else if (/Windows/i.test(ua)) {
      brand = "Windows PC";
      os = "Windows";
      model = "PC";
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      brand = "Apple";
      os = "macOS";
      model = isTouch ? "iPad" : "MacBook";
    } else if (/Linux/i.test(ua)) {
      brand = "Linux PC";
      os = "Linux";
      model = "PC";
    }

    // 2. Detect Browser
    if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
    else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
    else if (/Brave/i.test(ua)) browser = "Brave Browser";
    else if (/Chrome\//i.test(ua)) browser = isMobile ? "Chrome Mobile" : "Google Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = isMobile ? "Mobile Safari" : "Safari";
    else if (/Opera|OPR\//i.test(ua)) browser = "Opera";

    // 3. Assemble clear device name
    let deviceName = "";
    if (brand === "Apple") {
      deviceName = `${model || "Apple Device"} (${os}) • ${browser}`;
    } else if (brand === "Windows PC") {
      deviceName = `${os} PC (${cores} Cores • ${memoryGB}GB RAM) • ${browser}`;
    } else if (brand && brand !== "Android Phone") {
      const modelPart = model ? ` (${model})` : "";
      deviceName = `${brand}${modelPart} • ${os} • ${browser}`;
    } else if (model) {
      deviceName = `${model} • ${os} • ${browser}`;
    } else {
      deviceName = `Student Mobile (${os}) • ${browser}`;
    }

    if (screenRes && screenRes !== "0x0") {
      deviceName += ` [${screenRes}]`;
    }

    return {
      deviceName,
      brand: brand || "Student Device",
      model: model || "",
      os,
      browser,
      cores,
      memoryGB,
      isMobile,
      screen: screenRes,
      pixelRatio: dpr,
      tier: memoryGB >= 8 && cores >= 8 ? "high" : (memoryGB <= 2 || cores <= 2 ? "ultra_low" : "mid"),
      label: deviceName,
    };
  } catch (_) {
    return {
      deviceName: "Active Student Device",
      brand: "Student Device",
      model: "",
      os: "Web",
      browser: "Browser",
      cores: 4,
      memoryGB: 4,
      isMobile: false,
      screen: "",
    };
  }
}

export const api = {
  // Auth
  register: async (userData) => {
    const specs = userData?.deviceSpecs || getClientDeviceSpecs();
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...userData, deviceSpecs: specs }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  registerTelegramInitiate: (userData) =>
    request("/auth/register-telegram-initiate", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  registerTelegramVerify: async (verifyData) => {
    const specs = verifyData?.deviceSpecs || getClientDeviceSpecs();
    const data = await request("/auth/register-telegram-verify", {
      method: "POST",
      body: JSON.stringify({ ...verifyData, deviceSpecs: specs }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  pollTelegramRegisterStatus: (params) => {
    let q = "";
    if (typeof params === "string") {
      q = `regToken=${encodeURIComponent(params)}`;
    } else if (params && typeof params === "object") {
      const parts = [];
      if (params.regToken) parts.push(`regToken=${encodeURIComponent(params.regToken)}`);
      if (params.mobile) parts.push(`mobile=${encodeURIComponent(params.mobile)}`);
      if (params.email) parts.push(`email=${encodeURIComponent(params.email)}`);
      q = parts.join("&");
    }
    return request(`/auth/register-telegram-poll?${q}`);
  },

  forgotTelegramInitiate: (data) =>
    request("/auth/forgot-telegram-initiate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  forgotTelegramVerify: (data) =>
    request("/auth/forgot-telegram-verify", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  pollTelegramResetStatus: (params) => {
    let q = "";
    if (typeof params === "string") {
      q = `resetToken=${encodeURIComponent(params)}`;
    } else if (params && typeof params === "object") {
      const parts = [];
      if (params.resetToken) parts.push(`resetToken=${encodeURIComponent(params.resetToken)}`);
      if (params.mobile) parts.push(`mobile=${encodeURIComponent(params.mobile)}`);
      if (params.email) parts.push(`email=${encodeURIComponent(params.email)}`);
      q = parts.join("&");
    }
    return request(`/auth/forgot-telegram-poll?${q}`);
  },

  requestRegisterOtp: (userData) =>
    request("/auth/register-request-otp", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  verifyRegisterOtp: async (email, otp) => {
    const specs = getClientDeviceSpecs();
    const data = await request("/auth/register-verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, deviceSpecs: specs }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  login: async (identifier, password, deviceSpecs = null, turnstileToken = null) => {
    const specs = deviceSpecs || getClientDeviceSpecs();
    let fingerprint = "";
    if (typeof window !== "undefined") {
      try {
        fingerprint = `${screen.width}x${screen.height}:${Intl.DateTimeFormat().resolvedOptions().timeZone}:${navigator.language}`;
      } catch (_) {}
    }
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        deviceSpecs: specs,
        deviceFingerprint: fingerprint,
        turnstileToken,
      }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  googleLogin: async (googleData) => {
    const specs = googleData?.deviceSpecs || getClientDeviceSpecs();
    const data = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ ...googleData, deviceSpecs: specs }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  googleCompleteProfile: async (profileData) => {
    const specs = profileData?.deviceSpecs || getClientDeviceSpecs();
    const data = await request("/auth/google-complete-profile", {
      method: "POST",
      body: JSON.stringify({ ...profileData, deviceSpecs: specs }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },

  syncDeviceSpecs: async (deviceSpecs = null) => {
    const specs = deviceSpecs || getClientDeviceSpecs();
    return request("/auth/sync-device", {
      method: "POST",
      body: JSON.stringify({ deviceSpecs: specs }),
    }).catch(() => ({ success: true }));
  },

  logoutAllDevices: async () => {
    try {
      await request("/auth/logout-all-devices", { method: "POST" });
    } catch (_) {}
    return api.logout("Logout From All Devices");
  },

  getActiveSessions: () => request("/auth/active-sessions"),
  terminateSession: (sessionId) => request("/auth/terminate-session", { method: "POST", body: JSON.stringify({ sessionId }) }),
  terminateOtherSessions: () => request("/auth/terminate-other-sessions", { method: "POST" }),
  getRecentSecurityActivity: () => request("/auth/recent-activity"),

  logout: async (reason = "Manual Session Logout", fallbackUser = null) => {
    const u = fallbackUser || getCurrentUser();
    // Instant 0ms local session revocation for immediate UI logout
    setAuthToken(null);
    setCurrentUser(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("fsm_student_study_session_v1");
      const now = Date.now();
      const lastLogout = Number(sessionStorage.getItem("fsm_last_logout_ts") || "0");
      if (now - lastLogout < 5000) {
        return; // Suppress duplicate logout calls within 5s window
      }
      sessionStorage.setItem("fsm_last_logout_ts", String(now));
    }
    try {
      request("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ user: u, reason }),
      }).catch(() => {});
    } catch {}
  },

  getMe: () => request("/auth/me"),

  updateProfile: async (profileData) => {
    const data = await request("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(profileData),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    return data;
  },

  requestProfileMobileOtp: (newMobile) =>
    request("/auth/profile/request-mobile-otp", {
      method: "POST",
      body: JSON.stringify({ newMobile }),
    }),

  changePassword: (passwordData) =>
    request("/auth/change-password", {
      method: "PUT",
      body: JSON.stringify(passwordData),
    }),

  requestLoginOtp: (identifier, password) =>
    request("/auth/login-request-otp", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),

  verifyLoginOtp: async (email, otp, deviceSpecs = null) => {
    const specs = deviceSpecs || getClientDeviceSpecs();
    const data = await request("/auth/login-verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, deviceSpecs: specs }),
    });
    if (data.token) {
      setAuthToken(data.token);
      setCurrentUser(data.user);
    }
    return data;
  },

  requestForgotPasswordOtp: (email) =>
    request("/auth/forgot-password-request-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyForgotPasswordOtp: (email, otp, newPassword) =>
    request("/auth/forgot-password-verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp, newPassword }),
    }),

  sendOtp: (email) =>
    request("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  // Notes
  getBranches: async () => {
    const cached = clientMemoryCache.get("branches");
    if (cached) {
      if (typeof navigator === "undefined" || navigator.onLine) {
        request("/notes/branches")
          .then((r) => {
            clientMemoryCache.set("branches", r);
            try { localStorage.setItem("fsm_offline_branches", JSON.stringify(r)); } catch (_) {}
          })
          .catch(() => {});
      }
      return cached;
    }
    try {
      const res = await request("/notes/branches");
      clientMemoryCache.set("branches", res);
      try { localStorage.setItem("fsm_offline_branches", JSON.stringify(res)); } catch (_) {}
      return res;
    } catch (err) {
      try {
        const local = localStorage.getItem("fsm_offline_branches");
        if (local) return JSON.parse(local);
      } catch (_) {}
      return { branches: ["Computer Science", "Information Technology", "Mechanical", "Civil", "Electrical", "Electronics"] };
    }
  },

  getSubjects: async () => {
    const cached = clientMemoryCache.get("subjects");
    if (cached) {
      if (typeof navigator === "undefined" || navigator.onLine) {
        request("/notes/subjects")
          .then((r) => {
            clientMemoryCache.set("subjects", r);
            try { localStorage.setItem("fsm_offline_subjects", JSON.stringify(r)); } catch (_) {}
          })
          .catch(() => {});
      }
      return cached;
    }
    try {
      const res = await request("/notes/subjects");
      clientMemoryCache.set("subjects", res);
      try { localStorage.setItem("fsm_offline_subjects", JSON.stringify(res)); } catch (_) {}
      return res;
    } catch (err) {
      try {
        const local = localStorage.getItem("fsm_offline_subjects");
        if (local) return JSON.parse(local);
      } catch (_) {}
      return { subjects: [] };
    }
  },

  getSyncStatus: async () => {
    try {
      return await request("/notes/sync-status");
    } catch {
      return null;
    }
  },

  getNotes: async (params = {}, bypassCache = false) => {
    const shouldBypass = Boolean(bypassCache || params.bypassCache);
    const query = new URLSearchParams();
    if (params.branch && params.branch !== "All") query.append("branch", params.branch);
    if (params.course && params.course !== "All" && params.course !== "All Courses") query.append("course", params.course);
    if (params.year && params.year !== "All" && params.year !== "All Years") query.append("year", params.year);
    if (params.semester && params.semester !== "All") query.append("semester", params.semester);
    if (params.subject && params.subject !== "All") query.append("subject", params.subject);
    if (params.search) query.append("search", params.search);
    if (params.limit) query.append("limit", params.limit);
    if (params.all) query.append("all", "true");

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const cacheKey = `notes_${queryString}`;
    const cached = shouldBypass ? null : clientMemoryCache.get(cacheKey);

    const persistOfflineBackup = (payload) => {
      if (queryString && queryString !== "?all=true") return;
      const writeFn = () => {
        try {
          const compactNotes = Array.isArray(payload?.notes)
            ? payload.notes.map(({ ocrText, ...meta }) => meta)
            : [];
          localStorage.setItem("fsm_offline_notes", JSON.stringify({ ...payload, notes: compactNotes }));
        } catch (_) {}
      };
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(writeFn, { timeout: 2500 });
      } else {
        setTimeout(writeFn, 400);
      }
    };

    if (cached) {
      if (typeof navigator === "undefined" || navigator.onLine) {
        request(`/notes${queryString}`)
          .then((fresh) => {
            if (fresh && fresh.notes) {
              clientMemoryCache.set(cacheKey, fresh);
              persistOfflineBackup(fresh);
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("fsm:notes-synced", { detail: fresh.notes }));
              }
            }
          })
          .catch(() => {});
      }
      return cached;
    }

    try {
      const res = await request(`/notes${queryString}`);
      if (res && res.notes) {
        clientMemoryCache.set(cacheKey, res);
        persistOfflineBackup(res);
      }
      return res;
    } catch (err) {
      try {
        const local = localStorage.getItem("fsm_offline_notes");
        if (local) {
          const parsed = JSON.parse(local);
          console.log("[API] ðŸ“´ Offline Vault: Serving cached notes from persistent local storage");
          parsed.offline = true;
          return parsed;
        }
      } catch (_) {}
      return { success: true, notes: [], offline: true };
    }
  },

  getNoteById: (id) => request(`/notes/${id}`),

  getDownloadUrl: (id, fileName = null, direct = false) => {
    const token = getAuthToken();
    const tokenParam = token ? `token=${encodeURIComponent(token)}&` : "";
    let cleanName = (fileName || "").replace(/[/\\?%*:|"<>]/g, "_").trim();
    if (cleanName && !cleanName.toLowerCase().endsWith(".pdf")) cleanName += ".pdf";
    const pathSegment = cleanName ? encodeURIComponent(cleanName) : "stream.pdf";
    const nameParam = cleanName ? `&filename=${encodeURIComponent(cleanName)}` : "";
    const directParam = direct ? "&direct=1" : "";
    return `${STREAM_BASE}/notes/${id}/${pathSegment}?${tokenParam}download=1${nameParam}${directParam}`;
  },

  getStreamUrl: (id, fileName = null) => {
    const token = getAuthToken();
    const tokenParam = token ? `token=${encodeURIComponent(token)}&` : "";
    let cleanName = (fileName || "").replace(/[/\\?%*:|"<>]/g, "_").trim();
    if (cleanName && !cleanName.toLowerCase().endsWith(".pdf")) cleanName += ".pdf";
    const pathSegment = cleanName ? encodeURIComponent(cleanName) : "stream.pdf";
    const nameParam = cleanName ? `&filename=${encodeURIComponent(cleanName)}` : "";
    return `${STREAM_BASE}/notes/${id}/${pathSegment}?${tokenParam}${nameParam}`;
  },

  updateNote: async (id, noteData) => {
    invalidateClientNotesCache();
    const res = await request(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(noteData),
    });
    invalidateClientNotesCache();
    return res;
  },

  /**
   * Upload Note with LIVE Speed (MB/s), Transferred Size, Time Remaining & Percentage
   */
  uploadNoteWithProgress: (formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const token = getAuthToken();
      const startTime = performance.now();
      let prevLoaded = 0;
      let prevTime = startTime;

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const now = performance.now();
          const timeDiff = (now - prevTime) / 1000;
          const loadedDiff = e.loaded - prevLoaded;

          // Speed in bytes per second
          let speedBytes = timeDiff > 0.08 ? loadedDiff / timeDiff : 0;
          if (speedBytes <= 0) {
            const totalElapsed = (now - startTime) / 1000;
            speedBytes = totalElapsed > 0 ? e.loaded / totalElapsed : 0;
          }

          prevLoaded = e.loaded;
          prevTime = now;

          const percent = e.total > 0 ? Math.min(100, Math.round((e.loaded / e.total) * 100)) : 0;

          const remainingBytes = e.total - e.loaded;
          const speedFormatted = speedBytes >= 1024 * 1024
            ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
            : speedBytes > 0 ? `${Math.round(speedBytes / 1024)} KB/s` : "Calculating...";
          const secondsRemaining = speedBytes > 0 ? remainingBytes / speedBytes : null;

          if (onProgress) {
            onProgress({
              percent,
              speed: speedFormatted,
              loadedMB: (e.loaded / (1024 * 1024)).toFixed(2),
              totalMB: (e.total / (1024 * 1024)).toFixed(2),
              timeRemaining: secondsRemaining === null
                ? "Calculating..."
                : secondsRemaining > 0.1 ? `~${secondsRemaining.toFixed(1)}s remaining` : "Completing...",
            });
          }
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(res);
          } else {
            reject(new Error(res.message || "Upload failed with status " + xhr.status));
          }
        } catch {
          reject(new Error("Invalid response received from server."));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network transfer failed.")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

      xhr.open("POST", `${API_BASE}/upload`);
      xhr.withCredentials = true;
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  },

  /**
   * Unified 4-Tier Document Download Engine (Waterfall)
   * Tier 1: IndexedDB -> Tier 2: Local Server -> Tier 3: Server SSD -> Tier 4: Cloud Storage
   */
  downloadNoteWithProgress: async (id, fileName, onProgress, signal = null, fileHandle = null) => {
    const token = getAuthToken();
    const result = await acquireNoteDocument(id, {
      mode: "download",
      fileName,
      token,
      onProgress,
      signal,
      fileHandle,
    });
    return result.blob;
  },

  getUploadStatus: (noteId) => request(`/upload/status/${noteId}`),

  // Notices
  getNotices: () => request("/notices"),

  createNotice: (noticeData) =>
    request("/notices", {
      method: "POST",
      body: JSON.stringify(noticeData),
    }),

  updateNotice: (id, noticeData) =>
    request(`/notices/${id}`, {
      method: "PUT",
      body: JSON.stringify(noticeData),
    }),

  deleteNotice: (id) =>
    request(`/notices/${id}`, {
      method: "DELETE",
    }),

  togglePinNotice: (id, isPinned) =>
    request(`/notices/${id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned }),
    }),

  updateNoticeExpiry: (id, retentionDays) =>
    request(`/notices/${id}/expiry`, {
      method: "PATCH",
      body: JSON.stringify({ retentionDays }),
    }),

  bulkDeleteNotices: (noticeIds) =>
    request("/notices/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ noticeIds }),
    }),

  deleteAllNotices: () =>
    request("/notices/delete-all", {
      method: "POST",
    }),

  syncNoticesCache: () =>
    request("/notices/sync-cache", {
      method: "POST",
    }),

  getNoticesTelemetry: () => request("/notices/telemetry"),

  // Admin & Student Management
  getStats: () => request("/admin/stats"),

  getUsers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append("page", params.page);
    if (params.limit) query.append("limit", params.limit);
    if (params.search) query.append("search", params.search);
    const queryString = query.toString() ? `?${query.toString()}` : "";
    return request(`/admin/users${queryString}`);
  },

  getUserActivities: (userId) => request(`/admin/users/${userId}/activities`),

  getStudentSessions: (userId) => request(`/admin/users/${userId}/sessions`),

  terminateStudentSession: (userId, sessionId) =>
    request(`/admin/users/${userId}/terminate-session`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),

  terminateMultipleStudentSessions: (userId, sessionIds) =>
    request(`/admin/users/${userId}/terminate-session`, {
      method: "POST",
      body: JSON.stringify({ sessionIds }),
    }),

  terminateAllStudentSessions: (userId) =>
    request(`/admin/users/${userId}/terminate-all-sessions`, {
      method: "POST",
    }),

  deleteUserActivity: (userId, activityId) =>
    request(`/admin/users/${userId}/activities/${activityId}`, {
      method: "DELETE",
    }),

  clearUserActivities: (userId) =>
    request(`/admin/users/${userId}/activities`, {
      method: "DELETE",
    }),

  updateUser: (userId, data) =>
    request(`/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  blockUser: (userId, isBlocked) =>
    request(`/admin/users/${userId}/block`, {
      method: "PATCH",
      body: JSON.stringify({ isBlocked }),
    }),

  deleteUser: (userId) =>
    request(`/admin/users/${userId}`, {
      method: "DELETE",
    }),

  toggleVisibility: (noteId, isVisible) =>
    request(`/admin/notes/${noteId}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ isVisible }),
    }),

  toggleNoteDownload: async (noteId, allowDownload, downloadDisabledReason) => {
    invalidateClientNotesCache();
    const res = await request(`/admin/notes/${noteId}/allow-download`, {
      method: "PATCH",
      body: JSON.stringify({ allowDownload, downloadDisabledReason }),
    });
    invalidateClientNotesCache();
    return res;
  },

  bulkToggleNotesDownload: async (noteIds, allowDownload, downloadDisabledReason) => {
    invalidateClientNotesCache();
    const res = await request("/admin/notes/bulk-allow-download", {
      method: "POST",
      body: JSON.stringify({ noteIds, allowDownload, downloadDisabledReason }),
    });
    invalidateClientNotesCache();
    return res;
  },

  deleteNote: async (noteId) => {
    invalidateClientNotesCache();
    const res = await request(`/admin/notes/${noteId}`, {
      method: "DELETE",
    });
    invalidateClientNotesCache();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fsm:note-deleted", { detail: { noteId } }));
    }
    return res;
  },

  getHealth: () => request("/health"),

  // Enhanced Admin Studio Controls
  deleteAllStudents: () => request("/admin/users-all-students", { method: "DELETE" }),
  getCdnStats: () => request("/admin/cdn/stats"),
  setCdnRetention: (days) => request("/admin/cdn/retention", { method: "POST", body: JSON.stringify({ days }) }),
  purgeCdn: async () => {
    invalidateClientNotesCache();
    const res = await request("/admin/cdn/purge", { method: "POST" });
    invalidateClientNotesCache();
    return res;
  },
  purgeCdnEdge: async () => {
    invalidateClientNotesCache();
    const res = await request("/admin/cdn/purge-edge", { method: "POST" });
    invalidateClientNotesCache();
    return res;
  },
  purgeCdnDisk: async () => {
    invalidateClientNotesCache();
    const res = await request("/admin/cdn/purge-disk", { method: "POST" });
    invalidateClientNotesCache();
    return res;
  },
  purgeSingleDiskNote: async (noteId) => {
    invalidateClientNotesCache();
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(`fsm_cdn_${noteId}`); } catch (_) {}
    }
    const res = await request(`/admin/cdn/purge-disk/${noteId}`, { method: "POST" });
    invalidateClientNotesCache();
    return res;
  },
  purgeNoteCdn: async (noteId) => {
    invalidateClientNotesCache();
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(`fsm_cdn_${noteId}`); } catch (_) {}
    }
    const res = await request(`/admin/cdn/purge/${noteId}`, { method: "POST" });
    invalidateClientNotesCache();
    return res;
  },
  getSystemMemory: () => request("/admin/system/memory"),
  getHardwareSpecs: (refresh = false) =>
    request(refresh ? "/admin/system/hardware?refresh=1" : "/admin/system/hardware"),
  toggleClusterNode: (nodeId, isEnabled) =>
    request("/admin/cluster/toggle-node", {
      method: "POST",
      body: JSON.stringify({ nodeId, isEnabled }),
    }),
  getClusterTelemetry: () => request("/admin/cluster/telemetry"),
  getSoftwareSpecs: () => request("/admin/system/software"),
  getSoftwareInfo: () => request("/admin/system/software"),
  triggerAntiSleepPulse: () => request("/admin/anti-sleep-pulse", { method: "POST" }),
  getLiveEngineSpeeds: () => request("/admin/system/speeds"),
  getUploadPipelines: () => request("/admin/upload-pipeline"),
  cleanupSystem: () => request("/admin/system/cleanup", { method: "POST" }),
  syncTelegram: () => request("/admin/telegram/sync", { method: "POST" }),
  getTelegramSyncStatus: () => request("/admin/telegram/sync-status"),
  testSmtp: () => request("/admin/smtp/test", { method: "POST" }),
  getDatabaseOverview: () => request("/admin/database/overview"),
  getDatabaseCollection: (collectionName) => request(`/admin/database/collection/${collectionName}`),
  clearDatabaseCollection: (collectionName) => request(`/admin/database/clear-collection/${collectionName}`, { method: "DELETE" }),
  deleteDatabaseItem: (collectionName, id) => request(`/admin/database/item/${collectionName}/${id}`, { method: "DELETE" }),
  getCdnFiles: () => request("/admin/cdn/files"),
  // Restore Vault (Recycle Bin) & Delete All Notes
  deleteAllNotes: (password) =>
    request("/admin/notes/delete-all", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  getRecycleBinNotes: () => request("/admin/recycle-bin/notes"),
  getRecycleBinItems: () => request("/admin/recycle-bin/items"),
  restoreNote: (id) => request(`/admin/recycle-bin/restore/${id}`, { method: "POST" }),
  restoreItem: (id) => request(`/admin/recycle-bin/restore/${id}`, { method: "POST" }),
  restoreAllNotes: () => request("/admin/recycle-bin/restore-all", { method: "POST" }),
  restoreAllItems: () => request("/admin/recycle-bin/restore-all", { method: "POST" }),
  deletePermanentNote: (id) => request(`/admin/recycle-bin/permanent/${id}`, { method: "DELETE" }),
  deletePermanentItem: (id) => request(`/admin/recycle-bin/permanent/${id}`, { method: "DELETE" }),
  deleteAllRecycleBinItems: () => request("/admin/recycle-bin/delete-all", { method: "DELETE" }),
  emptyRecycleBin: () => request("/admin/recycle-bin/delete-all", { method: "DELETE" }),

  getDatabaseExportUrl: () => {
    const token = getAuthToken();
    return `/api/admin/database/export?token=${token || ""}`;
  },

  // Security Bot Controls
  getSecurityBotSettings: () => request("/admin/security-bot/settings"),
  getSubjectForumTopics: () => request("/admin/security-bot/subject-topics"),
  updateSecurityBotSettings: (settings) =>
    request("/admin/security-bot/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  testSecurityBotAlert: (event) =>
    request("/admin/security-bot/test-alert", {
      method: "POST",
      body: JSON.stringify({ event }),
    }),
  runInactivityPurge: () => request("/admin/run-inactivity-purge", { method: "POST" }),
  adjustUserInactivity: (userId, payload) =>
    request(`/admin/users/${userId}/inactivity-days`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getInactivitySettings: () => request("/admin/inactivity-settings"),
  updateInactivitySettings: (days) =>
    request("/admin/inactivity-settings", {
      method: "POST",
      body: JSON.stringify({ days }),
    }),

  // Next-Gen Technology Nexus Controls
  getTechControls: () => request("/admin/tech-controls"),
  updateTechControls: (settings) =>
    request("/admin/tech-controls", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  purgeCdnMemory: () => request("/admin/cdn/purge-memory", { method: "POST" }),
  runDeduplicationSweep: () => request("/admin/telegram/deduplicate", { method: "POST" }),
  prewarmPopularNotes: (limit = 10) =>
    request("/admin/cdn/prewarm-popular", {
      method: "POST",
      body: JSON.stringify({ limit }),
    }),
  getPushStats: () => request("/push/stats"),
  sendPushBroadcast: (payload) =>
    request("/push/broadcast", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),
  getPublicTechFlags: async () => {
    try {
      const res = await request("/admin/tech-flags");
      if (res && res.flags) {
        res.effective = getEffectiveTechConfig(res.flags);
        res.deviceAdaptive = true;
      }
      try { localStorage.setItem("fsm_offline_flags", JSON.stringify(res)); } catch (_) {}
      return res;
    } catch (err) {
      try {
        const local = localStorage.getItem("fsm_offline_flags");
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.flags) parsed.effective = getEffectiveTechConfig(parsed.flags);
          return parsed;
        }
      } catch (_) {}
      return { flags: { maintenanceMode: false, allowNotesDownload: true } };
    }
  },
  toggleMaintenanceMode: async (payload = {}) => {
    // 1. Primary update via API gateway
    const res = await request("/admin/maintenance/toggle", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return res;
  },
  toggleDownloadAllowed: async (allowDownload, reason, schedule) => {
    invalidateClientNotesCache();
    const res = await request("/admin/download/toggle", {
      method: "POST",
      body: JSON.stringify({ allowDownload, reason, schedule }),
    });
    invalidateClientNotesCache();
    return res;
  },

  // 💬 Student Chat & Private Pods API
  getChatWsToken: (payload = null) => {
    if (payload) {
      return request("/chat/ws-token", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    return request("/chat/ws-token");
  },
  getChatRooms: () => request("/chat/rooms"),
  createChatRoom: (name, secretCode, description) =>
    request("/chat/rooms/create", {
      method: "POST",
      body: JSON.stringify({ name, secretCode, description }),
    }),
  renameChatRoom: (roomId, newName) =>
    request("/chat/rooms/rename", {
      method: "POST",
      body: JSON.stringify({ roomId, newName }),
    }),
  resetChatRoomLink: (roomId) =>
    request("/chat/rooms/reset-link", {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),
  removeUserFromChatRoom: (roomId, targetUserId) =>
    request("/chat/rooms/remove-user", {
      method: "POST",
      body: JSON.stringify({ roomId, targetUserId }),
    }),
  addUserToChatRoom: (roomId, targetUserId, email) =>
    request("/chat/rooms/add-user", {
      method: "POST",
      body: JSON.stringify({ roomId, targetUserId, email }),
    }),
  getChatRoomMembers: (roomId) => request(`/chat/rooms/${roomId}/members`),
  joinChatRoom: (secretCode, roomId) =>
    request("/chat/rooms/join", {
      method: "POST",
      body: JSON.stringify({ secretCode, roomId }),
    }),
  leaveChatRoom: (roomId) =>
    request("/chat/rooms/leave", {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),
  closeChatRoom: (roomId) =>
    request("/chat/rooms/close", {
      method: "POST",
      body: JSON.stringify({ roomId }),
    }),
  getChatMessages: (roomId) => request(`/chat/messages/${roomId}`),
  uploadChatMedia: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/chat/upload", {
      method: "POST",
      body: formData,
    });
  },
  purgeChatRoom: (roomId) =>
    request(`/chat/admin/purge/${roomId}`, {
      method: "POST",
    }),
  deleteUserChatMessages: (targetUserId, roomId) =>
    request("/chat/admin/delete-user-messages", {
      method: "POST",
      body: JSON.stringify({ targetUserId, roomId }),
    }),
  blockChatUser: (targetUserId, block) =>
    request("/chat/admin/block-user", {
      method: "POST",
      body: JSON.stringify({ targetUserId, block }),
    }),
  getBlockedChatUsers: () => request("/chat/admin/blocked-users"),
  searchChatStudents: (search = "") =>
    request(`/chat/admin/users?search=${encodeURIComponent(search)}`),
  updateChatNotice: (text) =>
    request("/chat/notice", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  getChatProfile: () => request("/chat/profile"),
  updateChatProfile: async ({ username, avatarFile, photoUrl }) => {
    if (avatarFile) {
      const formData = new FormData();
      if (username) formData.append("username", username);
      formData.append("avatar", avatarFile);
      return request("/chat/profile", {
        method: "POST",
        body: formData,
      });
    }
    return request("/chat/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, photoUrl }),
    });
  },

  // ðŸš€ Turso (LibSQL / Edge SQLite) API Alias
  syncTursoDatabase: () =>
    request("/admin/turso/sync", {
      method: "POST",
    }),

  // ðŸ›¡ï¸ Real-Time Zero-Threat Radar & Anti-DDoS API
  getRealtimeThreats: () => request("/admin/threats/realtime"),
  unjailThreatIp: (ip, clearAll = false) =>
    request("/admin/threats/unjail", {
      method: "POST",
      body: JSON.stringify({ ip, clearAll }),
    }),
  runThreatScan: () =>
    request("/admin/threats/scan", {
      method: "POST",
    }),
  jailThreatIp: (ip, reason, durationMinutes = 1440) =>
    request("/admin/threats/jail", {
      method: "POST",
      body: JSON.stringify({ ip, reason, durationMinutes }),
    }),
  unlockAccount: (identifier) =>
    request("/admin/threats/unlock-account", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),
  unblockThreatUser: (userId, email) =>
    request("/admin/threats/unblock-user", {
      method: "POST",
      body: JSON.stringify({ userId, email }),
    }),
  unjailThreatDevice: (deviceId) =>
    request("/admin/threats/unjail", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    }),
  unjailThreatIncident: (incidentId, appealId = null) =>
    request("/admin/threats/unjail", {
      method: "POST",
      body: JSON.stringify({ incidentId, appealId }),
    }),
  dismissJailAppeal: (appealId, reason = "") =>
    request("/admin/threats/dismiss-appeal", {
      method: "POST",
      body: JSON.stringify({ appealId, reason }),
    }),
  testPingAppealTopic: () =>
    request("/admin/threats/test-appeal-topic", {
      method: "POST",
    }),

  // ðŸ¤– Dedicated Chatbot Controller & Software Telemetry (@fsm_chat_bot & Turso)
  getChatBotSettings: () => request("/admin/chat-bot/settings"),
  updateChatBotSettings: (data) =>
    request("/admin/chat-bot/settings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getChatBotTelemetry: () => request("/admin/chat-bot/telemetry"),
  purgeInactiveChatRooms: (days) =>
    request("/admin/chat-bot/purge-inactive", {
      method: "POST",
      body: JSON.stringify({ days }),
    }),
  pruneOldChatMessages: (days) =>
    request("/admin/chat-bot/prune-messages", {
      method: "POST",
      body: JSON.stringify({ days }),
    }),
  flushMongoChatBuffer: () =>
    request("/admin/chat-bot/flush-mongo", {
      method: "POST",
    }),
  testChatBotAlert: () =>
    request("/admin/chat-bot/test-alert", {
      method: "POST",
    }),

  // ðŸ“± Zero-Cost Remote Device Storage & Cache Purge Controller
  resetSingleUserStorageCache: (studentId, email) =>
    request("/admin/client-storage/reset-user", {
      method: "POST",
      body: JSON.stringify({ studentId, email }),
    }),
  resetAllUsersStorageCache: () =>
    request("/admin/client-storage/reset-all", {
      method: "POST",
    }),
  getClientStorageStatus: () => request("/admin/client-storage/status"),

  // ðŸ”‘ Passkey / WebAuthn Biometrics (Face ID, Fingerprint, Windows Hello)
  getPasskeyRegisterOptions: () => request("/auth/passkey/register-options"),
  verifyPasskeyRegister: (credential, deviceName, context = "") =>
    request("/auth/passkey/register-verify", {
      method: "POST",
      body: JSON.stringify({ credential, deviceName, context }),
    }),
  getPasskeyLoginOptions: (email = "") =>
    request("/auth/passkey/login-options", {
      method: "POST",
      body: JSON.stringify({ email: email || "" }),
    }),
  verifyPasskeyLogin: async (credential, challenge) => {
    const data = await request("/auth/passkey/login-verify", {
      method: "POST",
      body: JSON.stringify({ credential, challenge }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
      // Persist token for future sessions
      saveAuthToken(data.token);
    }
    return data;
  },
  getPasskeysList: () => request("/auth/passkey/list"),
  deletePasskey: (id) => request(`/auth/passkey/${id}`, { method: "DELETE" }),

  // âš¡ Dedicated Turso Notes Cache Stats
  getNotesCacheStats: () => request("/notes/cache-stats"),

  // ðŸš€ Turso LibSQL Database & Edge Cache Management
  getTursoStatus: () => request("/admin/turso/status"),
  syncTurso: () => request("/admin/turso/sync", { method: "POST" }),
  refreshTursoCache: () => request("/admin/turso/refresh-cache", { method: "POST" }),
  pruneTursoCache: (days = 7, target = "all") => request("/admin/turso/cache/prune", { method: "POST", body: JSON.stringify({ days, target }) }),
  getTursoAudits: (limit = 100) => request(`/admin/turso/audits?limit=${limit}`),
  pruneTursoAudits: (days = 30) => request("/admin/turso/audits/prune", { method: "POST", body: JSON.stringify({ days }) }),
  deleteTursoAudit: (roomId) => request(`/admin/turso/audits/${encodeURIComponent(roomId)}`, { method: "DELETE" }),
  cleanTursoStudentVault: () => request("/admin/turso/student/clean", { method: "POST" }),
  pruneTursoAiSearchLogs: (days = 30) => request("/admin/turso/ai-search/prune", { method: "POST", body: JSON.stringify({ days }) }),
  cleanTursoAiVault: () => request("/admin/turso/ai-search/prune", { method: "POST", body: JSON.stringify({ days: 0 }) }),
  runSecurityScan: async () => {
    try {
      return await request("/admin/security/scan");
    } catch {
      return await request("/admin/threats/scan", { method: "POST" });
    }
  },

  // ðŸŒŸ Hybrid Smart Help & Support Desk
  getHelpFaqs: () => request("/help/faqs"),
  askHelpQuestion: (payload) => request("/help/ask", { method: "POST", body: JSON.stringify(payload) }),
  getHelpTicket: (code, email = "", mobile = "") => {
    const q = new URLSearchParams();
    if (email) q.set("email", email);
    if (mobile) q.set("mobile", mobile);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return request(`/help/ticket/${encodeURIComponent(code)}${qs}`);
  },
  getMyHelpTickets: (ticketCodes = [], email = "", mobile = "") =>
    request("/help/my-tickets", { method: "POST", body: JSON.stringify({ ticketCodes, email, mobile }) }),
  studentReplyHelpTicket: (ticketCode, message, guestEmail = "", guestMobile = "", attachments = []) =>
    request("/help/reply", { method: "POST", body: JSON.stringify({ ticketCode, message, guestEmail, guestMobile, attachments }) }),
  uploadHelpAttachment: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/help/upload-attachment", {
      method: "POST",
      body: formData,
    });
  },
  adminReplyHelpTicket: (ticketCode, replyText) => request("/help/admin/reply", { method: "POST", body: JSON.stringify({ ticketCode, replyText }) }),
  adminCloseHelpTicket: (ticketCode, reason = "", autoDelete = false, retentionDays = null) =>
    request("/help/admin/close", { method: "POST", body: JSON.stringify({ ticketCode, reason, autoDelete, retentionDays }) }),
  adminActiveHelpTicket: (ticketCode) =>
    request("/help/admin/active", { method: "POST", body: JSON.stringify({ ticketCode }) }),
  adminDeleteHelpTicket: (ticketCode) =>
    request(`/help/admin/ticket/${encodeURIComponent(ticketCode)}`, { method: "DELETE" }),
  adminPurgeHelpTickets: (onlyClosed = true) =>
    request(`/help/admin/purge${onlyClosed ? "" : "?all=true"}`, { method: "DELETE" }),
  getHelpRetentionConfig: () => request("/help/admin/retention"),
  updateHelpRetentionConfig: (retentionDays) =>
    request("/help/admin/retention", { method: "POST", body: JSON.stringify({ retentionDays }) }),
  updateTicketRetention: (ticketCode, days) =>
    request("/help/admin/ticket-retention", { method: "POST", body: JSON.stringify({ ticketCode, days }) }),
  adminPurgeExpiredTickets: () =>
    request("/help/admin/purge-expired", { method: "POST" }),
  adminCreateHelpTopics: (chatId = null) =>
    request("/help/admin/create-topics", { method: "POST", body: JSON.stringify({ chatId }) }),
  getHelpTelemetry: () => request("/help/admin/telemetry"),
  getAdminHelpTickets: (status = null) => request(`/help/admin/tickets${status ? `?status=${status}` : ""}`),

  // 🛡️ Zero-Trust Security & IP Jail Appeal
  getSecurityStatus: () => request("/security/status"),
  submitJailAppeal: (payload) => request("/security/jail-appeal", { method: "POST", body: JSON.stringify(payload) }),

  // 🤖 Dual Groq LPU + Gemini AI Engine & Edge Proxy Controls
  getAiTelemetry: async () => {
    const res = await request("/ai/admin/telemetry");
    if (res && res.settings) {
      try {
        if (res.settings.isAiGloballyEnabled === false || res.settings.masterAiEnabled === false) {
          localStorage.setItem("fsm_ai_globally_disabled", "true");
        } else {
          localStorage.removeItem("fsm_ai_globally_disabled");
        }
      } catch (_) {}
    }
    return res;
  },
  updateAiToggle: async (provider, enabled) => {
    const res = await request("/ai/admin/toggle", { method: "POST", body: JSON.stringify({ provider, enabled }) });
    if (res && res.telemetry?.settings) {
      try {
        if (res.telemetry.settings.isAiGloballyEnabled === false || res.telemetry.settings.masterAiEnabled === false) {
          localStorage.setItem("fsm_ai_globally_disabled", "true");
        } else {
          localStorage.removeItem("fsm_ai_globally_disabled");
        }
      } catch (_) {}
    }
    return res;
  },
  updateCircleSearchConfig: (config) =>
    request("/ai/admin/circle-config", { method: "POST", body: JSON.stringify(config) }),
  updateCloudflareAiConfig: (config) =>
    request("/ai/admin/cloudflare-config", { method: "POST", body: JSON.stringify(config) }),
  resetAiCounters: () =>
    request("/ai/admin/reset", { method: "POST" }),
  testAiConnection: (provider) =>
    request("/ai/admin/test", { method: "POST", body: JSON.stringify({ provider }) }),
  askAiQuestion: async (query, context = "", noteId = null, subject = "", extra = {}) => {
    const currentUser = getCurrentUser();
    const payload = {
      query,
      context,
      noteId,
      subject,
      ...(extra || {}),
      user: currentUser ? {
        name: currentUser.name || "Student Scholar",
        email: currentUser.email || "student@example.com",
        mobile: currentUser.mobile || "N/A",
      } : null,
    };

    // Check if Administrator has turned off AI engines
    const isAiDisabledLocally = typeof window !== "undefined" && localStorage.getItem("fsm_ai_globally_disabled") === "true";

    // 1. Attempt Cloudflare Edge AI Worker first (Only if AI is not paused by Administrator)
    const cfAiWorkerUrl = !isAiDisabledLocally && (
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_CF_AI_WORKER_URL) ||
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_CF_CHAT_WORKER_URL ? import.meta.env.VITE_CF_CHAT_WORKER_URL.replace("fsm-chat-edge", "fsm-ai-edge") : "") ||
      "https://fsm-ai-edge.jnplotus.workers.dev"
    ).trim();

    if (cfAiWorkerUrl) {
      try {
        const edgeTarget = cfAiWorkerUrl.replace(/\/+$/, "") + "/api/ai/ask";
        const authToken = getAuthToken();
        const edgeRes = await fetch(edgeTarget, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
        });
        if (edgeRes && edgeRes.ok) {
          const edgeData = await edgeRes.json();
          if (edgeData && edgeData.disabled) {
            try { localStorage.setItem("fsm_ai_globally_disabled", "true"); } catch (_) {}
            return edgeData;
          }
          return edgeData;
        }
      } catch (edgeErr) {
        console.warn("[AI] Edge AI Worker timed out or failed, falling back to cluster backends:", edgeErr.message);
      }
    }

    // 2. Direct Cluster Backends Failover (Backend 2 & Backend 3)
    const clusterBackends = [
      "https://freestudymaterial1.onrender.com",
      "https://freestudymaterial2.onrender.com",
      "https://freestudymaterial.onrender.com",
    ];

    for (const origin of clusterBackends) {
      try {
        const authToken = getAuthToken();
        const directRes = await fetch(`${origin}/api/ai/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
        });
        if (directRes) {
          const directData = await directRes.json();
          if (directData && directData.disabled) {
            try { localStorage.setItem("fsm_ai_globally_disabled", "true"); } catch (_) {}
            return directData;
          }
          if (directRes.ok) {
            return directData;
          }
        }
      } catch (_) {}
    }

    // 3. Seamless Fallback to local / configured request origin
    return request("/ai/ask", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getNoteFlashcards: ({ noteId, title, context = "", subject = "", forceFresh = false }) =>
    request("/ai/flashcards", { method: "POST", body: JSON.stringify({ noteId, title, context, subject, forceFresh }) }),
  getNoteSummary: ({ noteId, title, context = "", subject = "", forceFresh = false }) =>
    request("/ai/summary", { method: "POST", body: JSON.stringify({ noteId, title, context, subject, forceFresh }) }),
  getAiStatus: () => request("/ai/status"),
  setupAiTelegramTopics: () =>
    request("/ai/admin/setup-telegram-topics", { method: "POST" }),
  getAiRecentSearches: (params = {}) => {
    const sp = new URLSearchParams(params).toString();
    return request(`/ai/admin/recent-searches${sp ? `?${sp}` : ""}`);
  },
  getAiStudentsSummary: (params = {}) => {
    const sp = new URLSearchParams(params).toString();
    return request(`/ai/admin/students${sp ? `?${sp}` : ""}`);
  },
  getAiReportDownloadUrl: (format = "csv", search = "") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
    return `/api/ai/admin/export-report?format=${format}&search=${encodeURIComponent(search)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
  },
  getPurgeHistory: (params = {}) => {
    const sp = new URLSearchParams(params).toString();
    return request(`/ai/admin/purge-history${sp ? `?${sp}` : ""}`);
  },
  getPurgeReportDownloadUrl: (format = "excel", search = "") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
    return `/api/ai/admin/purge-history/export?format=${format}&search=${encodeURIComponent(search)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
  },
};
