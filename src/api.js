/**
 * Academic Cloud API Client
 * Free Study Material Platform Engine
 */

const API_BASE = "/api";

// Same-Origin High-Performance Stream Base (Guarantees httpOnly auth cookie delivery)
export const STREAM_BASE = "/api";
import { fetchWithCdnFailover, parseSourceFromHeaders } from "./utils/cdnFailover";
import { getEffectiveTechConfig } from "./utils/hardwareAdaptiveEngine";


export function getAuthToken() {
  return localStorage.getItem("vault_token") || null;
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem("vault_token", token);
  } else {
    localStorage.removeItem("vault_token");
  }
}

export function getCurrentUser() {
  try {
    const userStr = localStorage.getItem("vault_user");
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem("vault_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("vault_user");
  }
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

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed with status ${res.status}`);
    err.data = data;
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

export const api = {
  // Auth
  register: async (userData) => {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  registerTelegramInitiate: (userData) =>
    request("/auth/register-telegram-initiate", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  registerTelegramVerify: async (verifyData) => {
    const data = await request("/auth/register-telegram-verify", {
      method: "POST",
      body: JSON.stringify(verifyData),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
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
    const data = await request("/auth/register-verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  login: async (identifier, password) => {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  googleLogin: async (googleData) => {
    const data = await request("/auth/google", {
      method: "POST",
      body: JSON.stringify(googleData),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  googleCompleteProfile: async (profileData) => {
    const data = await request("/auth/google-complete-profile", {
      method: "POST",
      body: JSON.stringify(profileData),
    });
    if (data.user) {
      setCurrentUser(data.user);
    }
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  logout: async (reason = "Manual Session Logout", fallbackUser = null) => {
    const u = fallbackUser || getCurrentUser();
    // Instant 0ms local session revocation for immediate UI logout
    setAuthToken(null);
    setCurrentUser(null);
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

  verifyLoginOtp: async (email, otp) => {
    const data = await request("/auth/login-verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
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

    if (cached) {
      if (typeof navigator === "undefined" || navigator.onLine) {
        request(`/notes${queryString}`)
          .then((fresh) => {
            if (fresh && fresh.notes) {
              clientMemoryCache.set(cacheKey, fresh);
              try {
                if (!queryString || queryString === "?all=true") {
                  localStorage.setItem("fsm_offline_notes", JSON.stringify(fresh));
                }
              } catch (_) {}
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
        try {
          if (!queryString || queryString === "?all=true") {
            localStorage.setItem("fsm_offline_notes", JSON.stringify(res));
          }
        } catch (_) {}
      }
      return res;
    } catch (err) {
      try {
        const local = localStorage.getItem("fsm_offline_notes");
        if (local) {
          const parsed = JSON.parse(local);
          console.log("[API] 📴 Offline Vault: Serving cached notes from persistent local storage");
          parsed.offline = true;
          return parsed;
        }
      } catch (_) {}
      return { success: true, notes: [], offline: true };
    }
  },

  getNoteById: (id) => request(`/notes/${id}`),

  getDownloadUrl: (id, fileName = null) => {
    const token = getAuthToken();
    const tokenParam = token ? `token=${token}&` : "";
    const nameParam = fileName ? `&filename=${encodeURIComponent(fileName)}` : "";
    return `${STREAM_BASE}/notes/${id}/stream.pdf?${tokenParam}download=1${nameParam}`;
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

          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          const speedFormatted =
            speedBytes >= 1024 * 1024
              ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
              : `${(speedBytes / 1024).toFixed(0)} KB/s`;

          const remainingBytes = e.total - e.loaded;
          const secondsRemaining = speedBytes > 0 ? (remainingBytes / speedBytes).toFixed(1) : "0";

          if (onProgress) {
            onProgress({
              percent,
              speed: speedFormatted,
              loadedMB: (e.loaded / (1024 * 1024)).toFixed(2),
              totalMB: (e.total / (1024 * 1024)).toFixed(2),
              timeRemaining: Number(secondsRemaining) > 0 ? `~${secondsRemaining}s remaining` : "Completing...",
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
   * Download Note with LIVE Speed (MB/s), Transferred Size, Time Remaining & Percentage
   */
  downloadNoteWithProgress: async (id, fileName, onProgress, signal = null, fileHandle = null) => {
    const token = getAuthToken();
    const url = `${STREAM_BASE}/notes/${id}/stream.pdf${token ? `?token=${token}` : ""}`;
    const startTime = performance.now();
    let prevLoaded = 0;
    let prevTime = startTime;

    // Resilient Multi-Tier CDN auto-failover fetch (Zero-Downtime Guarantee)
    const res = await fetchWithCdnFailover(id, { signal, isDownload: true, token });
    const contentType = res.headers.get("Content-Type") || "";
    if (!res.ok || (!contentType.includes("pdf") && !contentType.includes("octet-stream"))) {
      let errMessage = `Document is unavailable (${res.status})`;
      try {
        const errorJson = await res.json();
        if (errorJson && errorJson.message) errMessage = errorJson.message;
      } catch {}
      throw new Error(errMessage);
    }

    const contentLengthHeader = res.headers.get("Content-Length");
    const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    const realSourceInfo = parseSourceFromHeaders(res.headers);
    const dataSource = realSourceInfo.id;
    let loaded = 0;

    const reader = res.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      const now = performance.now();
      const timeDiff = (now - prevTime) / 1000;
      const loadedDiff = loaded - prevLoaded;

      let speedBytes = timeDiff > 0.08 ? loadedDiff / timeDiff : 0;
      if (speedBytes <= 0) {
        const totalElapsed = (now - startTime) / 1000;
        speedBytes = totalElapsed > 0 ? loaded / totalElapsed : 0;
      }

      prevLoaded = loaded;
      prevTime = now;

      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
      const speedFormatted =
        speedBytes >= 1024 * 1024
          ? `${(speedBytes / (1024 * 1024)).toFixed(1)} MB/s`
          : `${(speedBytes / 1024).toFixed(0)} KB/s`;

      const remainingBytes = total > 0 ? total - loaded : 0;
      const secondsRemaining = speedBytes > 0 && total > 0 ? (remainingBytes / speedBytes).toFixed(1) : "0";

      if (onProgress) {
        onProgress({
          percent,
          speed: speedFormatted,
          loadedMB: (loaded / (1024 * 1024)).toFixed(2),
          totalMB: total > 0 ? (total / (1024 * 1024)).toFixed(2) : (loaded / (1024 * 1024)).toFixed(2),
          timeRemaining: Number(secondsRemaining) > 0 ? `~${secondsRemaining}s left` : "Ready",
          source: dataSource,
          realSource: realSourceInfo,
          realSourceLabel: realSourceInfo.label,
        });
      }
    }

    if (typeof window !== "undefined") {
      try {
        if (realSourceInfo.id === "worker" || realSourceInfo.id === "ram" || realSourceInfo.id === "disk") {
          localStorage.setItem(`fsm_cdn_${id}`, "1");
        } else {
          localStorage.removeItem(`fsm_cdn_${id}`);
        }
      } catch (_) {}
    }

    // Convert streamed chunks into downloadable blob
    const blob = new Blob(chunks, { type: res.headers.get("Content-Type") || "application/pdf" });

    // 🌟 Native File System Access API: Save directly into student's chosen folder
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return blob;
      } catch (writeErr) {
        console.warn("[NATIVE-FS] Direct write fallback to anchor download:", writeErr.message);
      }
    }

    // Standard fallback download via anchor tag
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName || "Free_Study_Material.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    return blob;
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
  getHardwareSpecs: () => request("/admin/system/hardware"),
  getSoftwareSpecs: () => request("/admin/system/software"),
  getSoftwareInfo: () => request("/admin/system/software"),
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
  prewarmPopularNotes: (limit = 10) =>
    request("/admin/cdn/prewarm-popular", {
      method: "POST",
      body: JSON.stringify({ limit }),
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
  toggleMaintenanceMode: (payload = {}) =>
    request("/admin/maintenance/toggle", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
  getChatRooms: () => request("/chat/rooms"),
  createChatRoom: (name, secretCode, description) =>
    request("/chat/rooms/create", {
      method: "POST",
      body: JSON.stringify({ name, secretCode, description }),
    }),
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

  // 🚀 Turso (LibSQL / Edge SQLite) API Alias
  syncTursoDatabase: () =>
    request("/admin/turso/sync", {
      method: "POST",
    }),

  // 🛡️ Real-Time Zero-Threat Radar & Anti-DDoS API
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

  // 🤖 Dedicated Chatbot Controller & Software Telemetry (@fsm_chat_bot & Turso)
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
  testChatBotAlert: () =>
    request("/admin/chat-bot/test-alert", {
      method: "POST",
    }),

  // 🔑 Passkey / WebAuthn Biometrics (Face ID, Fingerprint, Windows Hello)
  getPasskeyRegisterOptions: () => request("/auth/passkey/register-options"),
  verifyPasskeyRegister: (credential, deviceName) =>
    request("/auth/passkey/register-verify", {
      method: "POST",
      body: JSON.stringify({ credential, deviceName }),
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
    }
    return data;
  },
  getPasskeysList: () => request("/auth/passkey/list"),
  deletePasskey: (id) => request(`/auth/passkey/${id}`, { method: "DELETE" }),

  // ⚡ Dedicated Turso Notes Cache Stats
  getNotesCacheStats: () => request("/notes/cache-stats"),

  // 🚀 Turso LibSQL Database & Edge Cache Management
  getTursoStatus: () => request("/admin/turso/status"),
  syncTurso: () => request("/admin/turso/sync", { method: "POST" }),
  refreshTursoCache: () => request("/admin/turso/refresh-cache", { method: "POST" }),
  getTursoAudits: (limit = 100) => request(`/admin/turso/audits?limit=${limit}`),
  pruneTursoAudits: (days = 30) => request("/admin/turso/audits/prune", { method: "POST", body: JSON.stringify({ days }) }),
  runSecurityScan: async () => {
    try {
      return await request("/admin/security/scan");
    } catch {
      return await request("/admin/threats/scan", { method: "POST" });
    }
  },
};
