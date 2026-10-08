/**
 * Academic Cloud API Client
 * Interacts with freestudymaterial backend
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

  // Notes
  getBranches: () => request("/notes/branches"),

  getNotes: (params = {}) => {
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

  // Upload (Async Ingestion)
  uploadNote: async (formData) => {
    return request("/upload", {
      method: "POST",
      body: formData,
    });
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
