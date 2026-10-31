/**
 * FreeStudyMaterial PWA Service Worker v12
 * High-Performance Stale-While-Revalidate Caching & 100% Offline Vault
 * Zero-Blank-Screen Offline Guarantee (Supports Vite Dev & Production Bundles)
 */

const CACHE_NAME = 'fsm-cache-v13';

// Pre-cached core assets guaranteed to exist in all environments
const PRECACHE_CORE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Production bundle chunks (cached on best-effort basis, never blocks install)
const OPTIONAL_ASSETS = [
  '/assets/index.css',
  '/assets/index.js',
  '/assets/vendor-react.js',
  '/assets/vendor-icons.js',
  '/assets/vendor-pdf.js',
  '/assets/vendor-pdflib.js',
  '/assets/vendor-yjs.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] 📦 Pre-caching resilient core app shell v9');

      // 1. Cache critical core files with allSettled
      await Promise.allSettled(
        PRECACHE_CORE.map((url) =>
          fetch(url)
            .then((res) => {
              if (res && res.ok) {
                const c1 = res.clone();
                return cache.put(url, c1);
              }
            })
            .catch(() => {})
        )
      );

      // 2. Best-effort cache for build assets
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) =>
          fetch(url)
            .then((res) => {
              const ct = (res && res.headers && res.headers.get('content-type')) || '';
              if (res && res.ok && !ct.includes('text/html')) {
                const c1 = res.clone();
                return cache.put(url, c1);
              }
            })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] 🧹 Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests or browser extension protocols
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 0. Completely bypass Vite dev server modules, source files, HMR channels & API routes (except /api/notes)
  // Ensures Service Worker never intercepts, caches, or corrupts live API or local dev JSX modules
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/src/') ||
     url.pathname.startsWith('/@') ||
     url.pathname.startsWith('/node_modules/') ||
     url.pathname.endsWith('.jsx') ||
     url.pathname.endsWith('.tsx') ||
     url.searchParams.has('t') ||
     url.pathname.startsWith('/ws') ||
     (url.pathname.startsWith('/api/') && url.pathname !== '/api/notes'))
  ) {
    return;
  }

  // Redirect any stray /dist/ navigation directly to root
  if (url.pathname.startsWith('/dist')) {
    event.respondWith(Response.redirect(url.origin + '/', 302));
    return;
  }

  // 1. Navigation requests (SPA Shell fallback - 100% Bulletproof Offline Launch)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const ct = networkResponse.headers.get('content-type') || '';
            if (ct.includes('text/html')) {
              const cache = await caches.open(CACHE_NAME);
              const c1 = networkResponse.clone();
              const c2 = networkResponse.clone();
              cache.put('/index.html', c1).catch(() => {});
              cache.put('/', c2).catch(() => {});
            }
          }
          return networkResponse;
        } catch (err) {
          console.log('[SW] 📴 Offline: Serving cached navigation shell for', request.url);
          const cache = await caches.open(CACHE_NAME);
          const cached =
            (await cache.match(request)) ||
            (await cache.match(url.pathname)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/'));
          if (cached) return cached;

          // Emergency inline fallback if first visit ever is offline
          return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FreeStudyMaterial — Offline</title><style>body{background:#080c16;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center}.box{background:rgba(15,23,42,0.95);border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:36px;max-width:440px;box-shadow:0 20px 40px rgba(0,0,0,0.6)}h1{color:#38bdf8;font-size:1.35rem;margin-bottom:10px}p{color:#94a3b8;font-size:0.9rem;line-height:1.5;margin-bottom:20px}.btn{background:#4f46e5;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer}</style></head><body><div class="box"><h1>📶 Offline Vault Active</h1><p>You are currently offline. Connect to internet to refresh, or tap below to reload cached study material.</p><button class="btn" onclick="location.reload()">Reload Application</button></div></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // 2. Vite Dev Server HMR Scripts (@react-refresh & @vite/client)
  if (url.pathname === '/@react-refresh') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            const c1 = res.clone();
            const c2 = res.clone();
            cache.put(request, c1).catch(() => {});
            cache.put('/@react-refresh', c2).catch(() => {});
            return res;
          }
        } catch (_) {}

        const cached =
          (await caches.match(request)) ||
          (await caches.match('/@react-refresh'));
        if (cached) return cached;

        // Complete bulletproof stub with all exports required by React Refresh
        return new Response(
          `export function injectIntoGlobalHook(w) {
  if (!w) return;
  w.$RefreshReg$ = () => {};
  w.$RefreshSig$ = () => (type) => type;
}
export function createSignatureFunctionForTransform() {
  return () => (type) => type;
}
export function getRefreshReg() {
  return () => {};
}
export function registerExportsForReactRefresh() {}
export function validateRefreshBoundaryAndEnqueueUpdate() {}
export const __hmr_import = (m) => m;
export default () => {};
if (typeof window !== 'undefined') {
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
}`,
          { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  if (url.pathname === '/@vite/client') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            const c1 = res.clone();
            const c2 = res.clone();
            cache.put(request, c1).catch(() => {});
            cache.put('/@vite/client', c2).catch(() => {});
            return res;
          }
        } catch (_) {}

        const cached =
          (await caches.match(request)) ||
          (await caches.match('/@vite/client'));
        if (cached) return cached;

        // Complete bulletproof stub with all exports required by Vite client & CSS injection
        return new Response(
          `export function createHotContext() {
  return {
    accept() {},
    prune() {},
    dispose() {},
    invalidate() {},
    on() {},
    send() {},
  };
}
export const injectQuery = (url) => url;
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  if (typeof document === 'undefined') return;
  const style = document.getElementById(id);
  if (style) style.remove();
}
export class ErrorOverlay extends (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) {}
export default {};`,
          { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } }
        );
      })()
    );
    return;
  }

  // 3. Notes API: Network-First with Cache-Fallback (Offline Notes Vault)
  if (url.pathname === '/api/notes') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        if (self.navigator.onLine) {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.ok) {
              const c1 = networkResponse.clone();
              const c2 = networkResponse.clone();
              cache.put(request, c1).catch(() => {});
              cache.put('/api/notes', c2).catch(() => {});
              try {
                self.clients.matchAll().then((clients) => {
                  clients.forEach((c) => c.postMessage({ type: 'FSM_NETWORK_STATUS', isOffline: false }));
                });
              } catch (_) {}
              return networkResponse;
            }
          } catch (_) {}
        }

        // Only broadcast offline status if device is ACTUALLY disconnected from the network
        if (!self.navigator.onLine) {
          console.log('[SW] 📴 Offline: Serving cached notes vault');
          try {
            self.clients.matchAll().then((clients) => {
              clients.forEach((c) => c.postMessage({ type: 'FSM_NETWORK_STATUS', isOffline: true }));
            });
          } catch (_) {}
        }

        const cached =
          (await cache.match(request)) ||
          (await cache.match('/api/notes')) ||
          (await cache.match('/api/notes', { ignoreSearch: true }));
        if (cached) return cached;

        // Return empty notes list JSON rather than failing with blank screen
        return new Response(
          JSON.stringify({ success: true, notes: [], offline: true, message: 'Offline Vault Active' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })()
    );
    return;
  }

  // 4. Same-Origin Assets (CSS, JS, Fonts, Images - strictly bypasses API and WebSocket)
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ws')) {
    const cleanUrl = url.origin + url.pathname;
    const isImmutableAsset = url.pathname.startsWith('/assets/') || url.pathname.includes('/tesseract/');

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // ⚡ Performance Accelerator: Stale-While-Revalidate for /assets/ (Instant 0ms Load!)
        if (isImmutableAsset) {
          const cachedAsset =
            (await cache.match(request)) ||
            (await cache.match(cleanUrl)) ||
            (await cache.match(request, { ignoreSearch: true }));

          if (cachedAsset) {
            // Revalidate in background if online (never blocks browser execution)
            if (self.navigator.onLine) {
              fetch(request)
                .then((networkResponse) => {
                  if (networkResponse && networkResponse.status === 200) {
                    cache.put(cleanUrl, networkResponse.clone()).catch(() => {});
                  }
                })
                .catch(() => {});
            }
            return cachedAsset;
          }
        }

        // Network fetch for other non-asset resources or cache misses
        if (self.navigator.onLine) {
          try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
              const c1 = networkResponse.clone();
              const c2 = networkResponse.clone();
              cache.put(request, c1).catch(() => {});
              cache.put(cleanUrl, c2).catch(() => {});
            }
            return networkResponse;
          } catch (_) {}
        }

        // Offline Fallback: Serve from cache
        const matched =
          (await cache.match(request)) ||
          (await cache.match(cleanUrl)) ||
          (await cache.match(request, { ignoreSearch: true }));

        if (matched) {
          return matched;
        }

          // If stylesheet, return empty CSS so browser doesn't fail
          if (url.pathname.endsWith('.css') || request.destination === 'style') {
            return new Response('/* offline */', { headers: { 'Content-Type': 'text/css' } });
          }

          // If image, return empty transparent SVG
          if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico)$/i)) {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }

          // If script / module unavailable, return 503 so dynamic imports can handle with retry
          if (url.pathname.endsWith('.js') || url.pathname.endsWith('.jsx') || request.destination === 'script') {
            return new Response('/* Offline module unavailable */', {
              status: 503,
              statusText: 'Offline Module Unavailable',
              headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
            });
          }

          return new Response('', { status: 408, statusText: 'Offline Resource Unavailable' });
      })()
    );
    return;
  }

  // 5. Cross-Origin Assets (Google Fonts, CDNs): Stale-While-Revalidate
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('cloudflare.com')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // 6. Default fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request, { ignoreSearch: true }))
  );
});

// Hold last known student study context in SW memory
let lastKnownStudentContext = null;

// Helper: Open student context store in IndexedDB (Service Worker scope)
function getStudentContextFromIndexedDB() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(lastKnownStudentContext);
      const req = indexedDB.open('fsm_student_context_v1', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile');
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('profile', 'readonly');
          const store = tx.objectStore('profile');
          const getReq = store.get('active_student');
          getReq.onsuccess = () => resolve(getReq.result || lastKnownStudentContext);
          getReq.onerror = () => resolve(lastKnownStudentContext);
        } catch {
          resolve(lastKnownStudentContext);
        }
      };
      req.onerror = () => resolve(lastKnownStudentContext);
    } catch {
      resolve(lastKnownStudentContext);
    }
  });
}

// Helper: Cache note buffer into IndexedDB Offline Vault (for P2P & VirtualPdfReader offline mode)
function saveNoteBufferToIndexedDB(noteId, arrayBuffer) {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(false);
      const req = indexedDB.open('fsm_p2p_cache_v1', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('note_chunks')) {
          db.createObjectStore('note_chunks');
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('note_chunks', 'readwrite');
          tx.objectStore('note_chunks').put(arrayBuffer, noteId);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// Helper: Execute Exam Morning 6 AM Auto-Pre-fetch into Offline Vault (PERSONALIZED TO THIS PARTICULAR STUDENT)
async function executeExamPrefetch() {
  console.log('[SW] ⏰ Exam Pre-fetch: Initiating 6 AM background download into Offline Vault...');
  try {
    const studentContext = await getStudentContextFromIndexedDB();
    const cache = await caches.open(CACHE_NAME);

    // Construct personalized query targeting THIS student's year, branch, and recent study history
    const params = new URLSearchParams();
    params.append('limit', '8');
    if (studentContext?.userYear && studentContext.userYear !== 'All Years') {
      params.append('year', studentContext.userYear);
    }
    if (studentContext?.userBranch && studentContext.userBranch !== 'All') {
      params.append('branch', studentContext.userBranch);
    }
    if (Array.isArray(studentContext?.recentNoteIds) && studentContext.recentNoteIds.length > 0) {
      params.append('recentIds', studentContext.recentNoteIds.slice(0, 8).join(','));
    }

    const prefetchEndpoint = `/api/notes/exam-prefetch?${params.toString()}`;
    console.log(`[SW] 🎯 Targeted Exam Pre-fetch for Student (${studentContext?.userYear || 'General'}, ${studentContext?.userBranch || 'All'}):`, prefetchEndpoint);

    let res = await fetch(prefetchEndpoint, { credentials: 'include' });
    if (!res || !res.ok) {
      // Fallback to basic notes endpoint if custom prefetch isn't reachable
      res = await fetch('/api/notes?limit=8', { credentials: 'include' });
    }
    if (!res || !res.ok) return;

    const resClone = res.clone();
    await cache.put('/api/notes', resClone);
    const data = await res.json();
    const notes = data.notes || [];
    let count = 0;

    for (const note of notes.slice(0, 6)) {
      if (!note.id) continue;
      const streamUrl = `/api/notes/${note.id}/stream.pdf`;
      try {
        const streamRes = await fetch(streamUrl, { credentials: 'include' });
        if (streamRes && streamRes.ok) {
          // 1. Save in CacheStorage
          const streamClone = streamRes.clone();
          await cache.put(streamUrl, streamClone);

          // 2. Save in IndexedDB (Offline Vault & P2P Mesh Seeder)
          try {
            const buf = await streamRes.arrayBuffer();
            await saveNoteBufferToIndexedDB(note.id, buf);
          } catch (_) {}

          count++;
          console.log(`[SW] 📦 6 AM Personalized Exam Pre-fetch cached: "${note.title}" [${note.year || 'General'} - ${note.subject || ''}] (${count}/6)`);
        }
      } catch (_) {}
    }

    const clients = await self.clients.matchAll();
    clients.forEach((c) => {
      c.postMessage({
        type: 'EXAM_PREFETCH_COMPLETE',
        count,
        personalized: true,
        studentYear: studentContext?.userYear || 'General',
        studentBranch: studentContext?.userBranch || 'All',
        timestamp: Date.now(),
        message: `⏰ 6 AM Exam Pre-fetch: ${count} personalized notes for ${studentContext?.userYear || 'your study'} automatically saved to Offline Vault!`,
      });
    });
  } catch (err) {
    console.warn('[SW] Exam prefetch error:', err.message);
  }
}

// App Shell Pre-cache message from browser window
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'PURGE_ALL_CACHES') {
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => {
      console.log('[SW] 🧹 All Service Worker caches purged successfully upon user request.');
    }).catch((err) => {
      console.warn('[SW] Cache purge error:', err.message);
    });
  }
  if (event.data && event.data.type === 'UPDATE_STUDENT_STUDY_CONTEXT' && event.data.context) {
    lastKnownStudentContext = event.data.context;
    console.log('[SW] 🎓 Received live student study context update:', event.data.context.userYear, event.data.context.userBranch);
  }
  if (event.data && event.data.type === 'TRIGGER_EXAM_PREFETCH') {
    event.waitUntil(executeExamPrefetch());
  }
  if (event.data && event.data.type === 'CACHE_APP_SHELL' && Array.isArray(event.data.urls)) {
    // Only attempt background caching if device is currently online
    if (self.navigator.onLine) {
      caches.open(CACHE_NAME).then((cache) => {
        event.data.urls.forEach((assetUrl) => {
          try {
            const u = new URL(assetUrl, self.location.origin);
            if (
              u.origin === self.location.origin &&
              (u.pathname.startsWith('/src/') ||
               u.pathname.startsWith('/@') ||
               u.pathname.startsWith('/node_modules/') ||
               u.pathname.endsWith('.jsx') ||
               u.pathname.endsWith('.tsx') ||
               u.searchParams.has('t'))
            ) {
              return;
            }
          } catch (_) {}
          fetch(assetUrl)
            .then((res) => {
              if (res && res.ok) {
                const c1 = res.clone();
                cache.put(assetUrl, c1).catch(() => {});
                try {
                  const u = new URL(assetUrl);
                  const clean = u.origin + u.pathname;
                  if (clean !== assetUrl) {
                    const c2 = res.clone();
                    cache.put(clean, c2).catch(() => {});
                  }
                } catch (_) {}
              }
            })
            .catch(() => {});
        });
      });
    }
  }
});

// Background Sync API
self.addEventListener('sync', (event) => {
  if (event.tag === 'fsm-sync-queue') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' });
        });
      })
    );
  }
});

// ⏰ Periodic Background Sync API (Exam Morning 6 AM Auto-Pre-fetch)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'fsm-exam-prefetch' || event.tag === 'fsm-periodic-sync') {
    console.log('[SW] ⏰ Periodic Background Sync fired at 6 AM: Downloading exam notes...');
    event.waitUntil(executeExamPrefetch());
  }
});
