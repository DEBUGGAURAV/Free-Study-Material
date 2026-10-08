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

  // Do not set Content-Type if FormData is used
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

  logout: () => {
    setAuthToken(null);
    setCurrentUser(null);
  },

  getMe: () => request("/auth/me"),

  // Notes
  getNotes: (params = {}) => {
    const query = new URLSearchParams();
    if (params.branch && params.branch !== "All") query.append("branch", params.branch);
    if (params.semester && params.semester !== "All") query.append("semester", params.semester);
    if (params.subject && params.subject !== "All") query.append("subject", params.subject);
    if (params.search) query.append("search", params.search);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return request(`/notes${queryString}`);
  },

  getNoteById: (id) => request(`/notes/${id}`),

  getDownloadUrl: (id) => `${API_BASE}/notes/${id}/stream`,

  // Upload (Async Ingestion)
  uploadNote: async (formData) => {
    return request("/upload", {
      method: "POST",
      body: formData,
    });
  },

  getUploadStatus: (noteId) => request(`/upload/status/${noteId}`),

  // Admin
  getStats: () => request("/admin/stats"),

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
