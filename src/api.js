export const API_URL = import.meta.env.VITE_API_URL || '/api'

// High-performance in-memory cache for ultra-fast instant page loads & reloads
const apiCache = new Map();
const CACHE_TTL_MS = 45000; // 45 seconds stale-while-revalidate window

export function invalidateCache(pathPrefix = '') {
  if (!pathPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.includes(pathPrefix)) apiCache.delete(key);
  }
}

async function request(path, options = {}, token, useCache = false) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}:${token || ''}`;

  // If cached and fresh, return immediately for 0ms latency
  if (useCache && method === 'GET') {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      // Background revalidation
      fetchFreshData(path, options, token, cacheKey).catch(() => {});
      return cached.data;
    }
  }

  return fetchFreshData(path, options, token, cacheKey, useCache);
}

async function fetchFreshData(path, options = {}, token, cacheKey, saveToCache = false) {
  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s fast timeout

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // If we have a cached stale version, use it gracefully
    const cached = apiCache.get(cacheKey);
    if (cached) return cached.data;

    const error = new Error('Connecting to Free Study Material cloud server. The service may be starting; try again shortly.');
    error.code = 'API_UNREACHABLE';
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || (response.status === 401 ? 'Email or password is incorrect.' : `Request failed (${response.status})`));

  // Save to in-memory cache if requested or it's a safe GET
  if (saveToCache || (options.method || 'GET').toUpperCase() === 'GET') {
    apiCache.set(cacheKey, { data: body, timestamp: Date.now() });
  }

  return body;
}

export const requestSignupCode = (email) => request('/auth/request-otp', { method: 'POST', body: JSON.stringify({ email, purpose: 'signup' }) })
export const signUp = (email, password, name, college, year, branch) => request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name, college, year, branch }) })
export const verifySignupCode = (email, code, password, name, college, year, branch, course, mobile) => request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code, password, name, college, year, branch, course, mobile }) })
export const updateProfile = (profile, token) => {
  invalidateCache('/me');
  return request('/me', { method: 'PATCH', body: JSON.stringify(profile) }, token);
}
export const signIn = (email, password) => {
  invalidateCache();
  return request('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export const changePassword = (currentPassword, newPassword, token) => request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, token)
export const forgotPassword = (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
export const resetPassword = (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })

// Fast cached GET requests
export const getNotes = async (token) => {
  const data = await request('/notes', {}, token, true);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.notes)) return data.notes;
  return [];
};
export const createNote = (note, token) => {
  invalidateCache('/notes');
  return request('/notes', { method: 'POST', body: JSON.stringify(note) }, token);
}
export const uploadNoteFile = async (formData, token) => {
  invalidateCache('/notes');
  const response = await fetch(`${API_URL}/notes/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Upload failed');
  }
  return data;
}
export const getNotices = (token) => request('/notices', {}, token, true)
export const createNotice = (notice, token) => {
  invalidateCache('/notices');
  return request('/notices', { method: 'POST', body: JSON.stringify(notice) }, token);
}
export const updateNotice = (id, changes, token) => {
  invalidateCache('/notices');
  return request(`/notices/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }, token);
}
export const deleteNotice = (id, token) => {
  invalidateCache('/notices');
  return request(`/notices/${id}`, { method: 'DELETE' }, token);
}
export const getFolders = (token) => request('/folders', {}, token, true)
export const createFolder = (folder, token) => {
  invalidateCache('/folders');
  return request('/folders', { method: 'POST', body: JSON.stringify(folder) }, token);
}
export const updateFolder = (id, changes, token) => {
  invalidateCache('/folders');
  return request(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }, token);
}
export const deleteFolder = (id, token) => {
  invalidateCache('/folders');
  return request(`/folders/${id}`, { method: 'DELETE' }, token);
}
export const getAdminNotes = (token) => request('/admin/notes', {}, token, true)
export const updateNote = (id, changes, token) => {
  invalidateCache('/notes');
  return request(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }, token);
}
export const deleteNote = (id, token) => {
  invalidateCache('/notes');
  return request(`/notes/${id}`, { method: 'DELETE' }, token);
}
export const purgeStaleNotes = (options = {}, token) => {
  invalidateCache('/notes');
  return request('/notes/purge-stale', { method: 'POST', body: JSON.stringify(options) }, token);
}
export const getAdminUsers = (token) => request('/admin/users', {}, token, true)
export const getAdminRoleRequests = (token) => request('/admin/admin-requests', {}, token, true)
export const decideAdminRoleRequest = (id, decision, token) => {
  invalidateCache('/admin');
  return request(`/admin/admin-requests/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }, token);
}
export const getAdminUserDetails = (id, token) => request(`/admin/users/${id}`, {}, token)
export const deleteUserActivityLog = (userId, logId, token) => {
  invalidateCache(`/admin/users/${userId}`);
  return request(`/admin/users/${userId}/activity/${logId}`, { method: 'DELETE' }, token);
}
export const deleteAllUserActivityLogs = (userId, token) => {
  invalidateCache(`/admin/users/${userId}`);
  return request(`/admin/users/${userId}/activity`, { method: 'DELETE' }, token);
}
export const updateAdminUser = (id, profile, token) => {
  invalidateCache('/admin/users');
  return request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(profile) }, token);
}
export const setUserBlocked = (id, blocked, token) => {
  invalidateCache('/admin/users');
  return request(`/admin/users/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked }) }, token);
}
export const setUserPermissions = (id, permissions, fullAdmin, token) => {
  invalidateCache('/admin/users');
  return request(`/admin/users/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions, fullAdmin }) }, token);
}
export const deleteAdminUser = (id, token) => {
  invalidateCache('/admin/users');
  return request(`/admin/users/${id}`, { method: 'DELETE' }, token);
}
export const deleteAllAdminUsers = (token) => {
  invalidateCache('/admin/users');
  return request('/admin/users', { method: 'DELETE' }, token);
}
export const recordNoteAccess = (id, token) => request(`/notes/${id}/access`, { method: 'POST' }, token)
export const recordLogout = (token) => {
  invalidateCache();
  return request('/auth/logout', { method: 'POST' }, token);
}
export const downloadAdminExport = async (token) => {
  const response = await fetch(`${API_URL}/admin/users/export`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || 'Unable to export the workbook.')
  }
  const downloadUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = 'tech-titan-team-students.xlsx'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
}
