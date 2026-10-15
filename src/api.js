/**
 * Academic Cloud API Client
 * Free Study Material Platform Engine
 */

const API_BASE = "/api";

// High-Speed Global Cloudflare Edge CDN Worker for Instant Cached Streaming
const EDGE_WORKER_URL = "https://fsm-edge.jnplotus.workers.dev/api";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const STREAM_BASE = isLocalhost ? "/api" : EDGE_WORKER_URL;


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

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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

  pollTelegramRegisterStatus: (regToken) =>
    request(`/auth/register-telegram-poll?regToken=${encodeURIComponent(regToken)}`),

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

  pollTelegramResetStatus: (resetToken) =>
    request(`/auth/forgot-telegram-poll?resetToken=${encodeURIComponent(resetToken)}`),

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
    try {
      const u = fallbackUser || getCurrentUser();
      await request("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ user: u, reason }),
      });
    } catch {}
    setAuthToken(null);
    setCurrentUser(null);
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
      // Async revalidate
      request("/notes/branches").then((r) => clientMemoryCache.set("branches", r)).catch(() => {});
      return cached;
    }
    const res = await request("/notes/branches");
    clientMemoryCache.set("branches", res);
    return res;
  },

  getSubjects: async () => {
    const cached = clientMemoryCache.get("subjects");
    if (cached) {
      // Async revalidate
      request("/notes/subjects").then((r) => clientMemoryCache.set("subjects", r)).catch(() => {});
      return cached;
    }
    const res = await request("/notes/subjects");
    clientMemoryCache.set("subjects", res);
    return res;
  },

  getSyncStatus: async () => {
    try {
      return await request("/notes/sync-status");
    } catch {
      return null;
    }
  },

  getNotes: async (params = {}) => {
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
    const cached = clientMemoryCache.get(cacheKey);

    if (cached) {
      // ⚡ Return instant cached data from client memory (0ms!)
      // Silently revalidate in background without blocking UI
      request(`/notes${queryString}`)
        .then((fresh) => {
          if (fresh && fresh.notes) {
            clientMemoryCache.set(cacheKey, fresh);
          }
        })
        .catch(() => {});
      return cached;
    }

    const res = await request(`/notes${queryString}`);
    if (res && res.notes) {
      clientMemoryCache.set(cacheKey, res);
    }
    return res;
  },

  getNoteById: (id) => request(`/notes/${id}`),

  getDownloadUrl: (id) => {
    const token = getAuthToken();
    return `${STREAM_BASE}/notes/${id}/stream.pdf${token ? `?token=${token}` : ""}`;
  },

  updateNote: (id, noteData) =>
    request(`/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(noteData),
    }),

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
  downloadNoteWithProgress: async (id, fileName, onProgress, signal = null) => {
    const token = getAuthToken();
    const url = `${STREAM_BASE}/notes/${id}/stream.pdf${token ? `?token=${token}` : ""}`;
    const startTime = performance.now();
    let prevLoaded = 0;
    let prevTime = startTime;

    let res;
    try {
      res = await fetch(url, { signal, credentials: "include" });
    } catch (edgeErr) {
      if (signal?.aborted) throw edgeErr;
      console.warn("[EDGE STREAM] Cloudflare Worker fallback to Render origin:", edgeErr.message);
      const fallbackUrl = `${API_BASE}/notes/${id}/stream.pdf${token ? `?token=${token}` : ""}`;
      res = await fetch(fallbackUrl, { signal, credentials: "include" });
    }
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
        });
      }
    }

    // Convert streamed chunks into downloadable blob
    const blob = new Blob(chunks, { type: res.headers.get("Content-Type") || "application/pdf" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName || "Free_Study_Material.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
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

  deleteNote: (noteId) =>
    request(`/admin/notes/${noteId}`, {
      method: "DELETE",
    }),

  getHealth: () => request("/health"),

  // Enhanced Admin Studio Controls
  deleteAllStudents: () => request("/admin/users-all-students", { method: "DELETE" }),
  getCdnStats: () => request("/admin/cdn/stats"),
  setCdnRetention: (days) => request("/admin/cdn/retention", { method: "POST", body: JSON.stringify({ days }) }),
  purgeCdn: () => request("/admin/cdn/purge", { method: "POST" }),
  purgeNoteCdn: (noteId) => request(`/admin/cdn/purge/${noteId}`, { method: "POST" }),
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
};
