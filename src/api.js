/**
 * Academic Cloud API Client
 * Free Study Material Platform Engine
 */

const API_BASE = "/api";

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
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
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
    if (data.token) {
      setAuthToken(data.token);
      setCurrentUser(data.user);
    }
    return data;
  },

  login: async (identifier, password) => {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (data.token) {
      setAuthToken(data.token);
      setCurrentUser(data.user);
    }
    return data;
  },

  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
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

  changePassword: (passwordData) =>
    request("/auth/change-password", {
      method: "PUT",
      body: JSON.stringify(passwordData),
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

  getNotes: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.branch && params.branch !== "All") query.append("branch", params.branch);
    if (params.semester && params.semester !== "All") query.append("semester", params.semester);
    if (params.subject && params.subject !== "All") query.append("subject", params.subject);
    if (params.search) query.append("search", params.search);
    if (params.limit) query.append("limit", params.limit);
    if (params.all) query.append("all", "true");

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return request(`/notes${queryString}`);
  },

  getNoteById: (id) => request(`/notes/${id}`),

  getDownloadUrl: (id) => {
    const token = getAuthToken();
    return `${API_BASE}/notes/${id}/stream${token ? `?token=${token}` : ""}`;
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
              loadedMB: (e.loaded / (1024 * 1024)).toFixed(1),
              totalMB: (e.total / (1024 * 1024)).toFixed(1),
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
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  },

  /**
   * Download Note with LIVE Speed (MB/s), Transferred Size, Time Remaining & Percentage
   */
  downloadNoteWithProgress: async (id, fileName, onProgress) => {
    const token = getAuthToken();
    const url = `${API_BASE}/notes/${id}/stream${token ? `?token=${token}` : ""}`;
    const startTime = performance.now();
    let prevLoaded = 0;
    let prevTime = startTime;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
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
          loadedMB: (loaded / (1024 * 1024)).toFixed(1),
          totalMB: total > 0 ? (total / (1024 * 1024)).toFixed(1) : (loaded / (1024 * 1024)).toFixed(1),
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
};
