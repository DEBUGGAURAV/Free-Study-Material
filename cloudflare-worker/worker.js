/**
 * Cloudflare Worker: FreeStudyMaterial Edge Stream Cache & Global Proxy
 * High-Speed Global Edge CDN Streaming for Telegram Cloud Storage
 * Concept: Note Storage -> Cloudflare Worker Edge -> Client View/Download (with RAM/Disk cache fallback)
 */

function isTrustedOrigin(origin) {
  if (!origin || origin === 'null') return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === 'freestudymaterial.pages.dev' ||
      host.endsWith('.freestudymaterial.pages.dev') ||
      host === 'freestudymaterial.onrender.com' ||
      host === 'freestudymaterial1.onrender.com' ||
      host === 'freestudymaterial2.onrender.com' ||
      host === 'fsm-edge.jnplotus.workers.dev' ||
      host === 'fsm-chat-edge.jnplotus.workers.dev' ||
      host === 'fsm-ai-edge.jnplotus.workers.dev' ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch (_) {
    return false;
  }
}

function applyCors(headers, req) {
  const o = req ? req.headers.get('Origin') : null;
  if (o && isTrustedOrigin(o)) {
    headers.set('Access-Control-Allow-Origin', o);
    headers.set('Access-Control-Allow-Credentials', 'true');
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS, PURGE, DELETE');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, Range, If-None-Match, X-Direct-Origin, X-Admin-Bypass, X-Cluster-Sync');
  headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache, X-Edge-Catalog-Cache, X-Upstream-Origin, X-Cluster-Active-Nodes, ETag');
  headers.set('Access-Control-Max-Age', '86400');
}

// 🌐 In-Memory Origin Health & Auto-Cascade Cooldown Tracker across Edge executions (25s)
const failedOriginCooldowns = new Map(); // originUrl -> failureTimestamp

function getOriginCooldownRemaining(origin) {
  const failedAt = failedOriginCooldowns.get(origin) || 0;
  const elapsed = Date.now() - failedAt;
  return elapsed < 25000 ? 25000 - elapsed : 0; // 25s cooldown
}

function markOriginDown(origin) {
  failedOriginCooldowns.set(origin, Date.now());
}

function markOriginUp(origin) {
  failedOriginCooldowns.delete(origin);
}

function hashClientIdentifier(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

// Cluster origins: prefer Worker env vars, with resilient fallback to active Render production nodes
const DEFAULT_CLUSTER_ORIGINS = [
  'https://freestudymaterial1.onrender.com',
  'https://freestudymaterial2.onrender.com',
];

function getAllClusterOrigins(env) {
  const list = [
    env?.ORIGIN_URL,
    env?.BACKUP_ORIGIN_URL_1,
    env?.BACKUP_ORIGIN_URL_2,
    ...DEFAULT_CLUSTER_ORIGINS,
  ];
  const unique = [];
  for (const item of list) {
    if (item && !unique.includes(item.replace(/\/+$/, ''))) unique.push(item.replace(/\/+$/, ''));
  }
  return unique;
}

// 3 -> 2 -> 1 Cascade Auto-Failover & Consistent Sticky IP-Hash Distribution
function getPrioritizedClusterOrigins(env, clientIp) {
  const baseOrigins = getAllClusterOrigins(env);
  const healthyOrigins = baseOrigins.filter((o) => getOriginCooldownRemaining(o) === 0);
  const activePool = healthyOrigins.length > 0 ? healthyOrigins : baseOrigins;

  const clientHash = hashClientIdentifier(clientIp || '127.0.0.1');
  const startIndex = clientHash % activePool.length;

  return [
    ...activePool.slice(startIndex),
    ...activePool.slice(0, startIndex),
    // Append cooling-down origins at the tail for extreme disaster recovery fallback
    ...baseOrigins.filter((o) => !activePool.includes(o)),
  ];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const clientIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '127.0.0.1';

    // Dynamic 3 -> 2 -> 1 Cascade Load Balancer
    // For note streams, hash by noteId so ALL students hit the SAME Render origin node (maximizes Tier 3 Server SSD Cache HIT rate!)
    const noteIdForAffinity = url.pathname.match(/^\/api\/notes\/([^/]+)\//)?.[1] || '';
    const streamOrigins = getPrioritizedClusterOrigins(env, noteIdForAffinity || clientIp);
    const activeHealthyCount = streamOrigins.filter((o) => getOriginCooldownRemaining(o) === 0).length || 1;
    const originBase = streamOrigins[0] || '';
    const edgeColo = request.cf?.colo || 'Global';
    if (!originBase) {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      applyCors(headers, request);
      return new Response(JSON.stringify({ success: false, error: 'Backend origins are not configured' }), {
        status: 503,
        headers,
      });
    }

    // 🛡️ Block Direct Cross-Site Hotlinking from unauthorized third-party domains (ALLOW trusted origins & APP_URL!)
    const originHeader = request.headers.get('Origin') || request.headers.get('Referer') || '';
    const isDocNav = request.headers.get('Sec-Fetch-Mode') === 'navigate' || request.headers.get('Sec-Fetch-Dest') === 'document';
    const appOriginHost = (() => {
      try { return env.APP_URL ? new URL(env.APP_URL).hostname.toLowerCase() : ''; } catch { return ''; }
    })();
    const originHeaderHost = (() => {
      try { return originHeader ? new URL(originHeader).hostname.toLowerCase() : ''; } catch { return ''; }
    })();
    const isAllowedClient = !originHeader ||
      isDocNav ||
      isTrustedOrigin(originHeader) ||
      Boolean(appOriginHost && originHeaderHost === appOriginHost);
    if (!isAllowedClient && request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return new Response('Direct cross-site hotlinking blocked by Free Study Material Cloud.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 1. Handle CORS Preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      const optHeaders = new Headers();
      applyCors(optHeaders, request);
      return new Response(null, {
        status: 204,
        headers: optHeaders,
      });
    }

    // 2. Health check & status endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      const activeOrigins = streamOrigins.filter((o) => getOriginCooldownRemaining(o) === 0);
      const resHeaders = new Headers({
        'Content-Type': 'application/json',
      });
      applyCors(resHeaders, request);
      resHeaders.set('X-Cluster-Active-Nodes', String(activeOrigins.length));
      return new Response(JSON.stringify({
        status: 'online',
        service: 'FreeStudyMaterial Edge Stream Worker & Load Balancer',
        edgeLocation: edgeColo,
        activeClusterNodes: activeOrigins.length,
        activeOrigins,
        userAssignedOrigin: originBase,
        clientIp,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: resHeaders,
      });
    }

    // 2.1. 🛡️ 24/7 Anti-Sleep Relay Endpoint (Bypasses container NAT loopback, pings origin from external Cloudflare IP)
    if (url.pathname === '/api/anti-sleep-relay' || url.pathname === '/api/keepalive') {
      const target = url.searchParams.get('target') || originBase;
      const cleanTarget = target.replace(/\/+$/, '') + '/health?relay=cf&t=' + Date.now();
      try {
        const pingRes = await fetch(cleanTarget, {
          method: 'GET',
          headers: {
            'User-Agent': 'Cloudflare-Worker-AntiSleep-Relay/2.0',
            'Cache-Control': 'no-cache, no-store',
          },
          signal: AbortSignal.timeout(10000),
        });
        const relayHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(relayHeaders, request);
        return new Response(JSON.stringify({
          success: pingRes.ok,
          status: pingRes.status,
          target: cleanTarget,
          timestamp: new Date().toISOString(),
        }), { status: 200, headers: relayHeaders });
      } catch (err) {
        const errHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(errHeaders, request);
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 502, headers: errHeaders });
      }
    }

    // 2.5. 🤖 Zero-Server-CPU Academic AI Edge Proxy: /api/ai/ask
    // 🛡️ STRICT LOGIN GATE: Require authenticated session (Authorization or Cookie) before burning AI keys
    if (url.pathname === '/api/ai/ask' && request.method === 'POST') {
      const hasAuthCred = Boolean(request.headers.get('Authorization') || request.headers.get('Cookie'));
      if (!hasAuthCred) {
        const unauthHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(unauthHeaders, request);
        return new Response(JSON.stringify({
          success: false,
          authRequired: true,
          message: 'Please sign in to use AI Study Assistant.',
        }), { status: 401, headers: unauthHeaders });
      }
      const groqKey = env.GROQ_API_KEY || '';
      const geminiKey = env.GEMINI_API_KEY || '';

      if (groqKey || geminiKey) {
        try {
          const body = await request.json();
          const { query, context } = body;
          if (!query || !query.trim()) {
            return new Response(JSON.stringify({ success: false, message: 'Query prompt required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }

          let answer = '';
          let provider = 'groq';
          let failover = false;

          if (groqKey) {
            try {
              const groqModel = env.GROQ_MODEL;
              const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + groqKey,
                },
                body: JSON.stringify({
                  model: groqModel,
                  messages: [
                    { role: 'system', content: 'You are an expert academic tutor for college students. Answer clearly and concisely using the provided lecture notes.' },
                    { role: 'user', content: context ? '[Notes Context]:\n' + context.slice(0, 3500) + '\n\n[Question]:\n' + query : query }
                  ],
                  temperature: 0.3,
                  max_tokens: 500,
                })
              });
              if (groqRes.ok) {
                const groqData = await groqRes.json();
                const msg = groqData.choices && groqData.choices[0] && groqData.choices[0].message;
                answer = msg ? ((msg.content || msg.reasoning || '').trim()) : '';
              } else {
                failover = true;
              }
            } catch (_) {
              failover = true;
            }
          } else {
            failover = true;
          }

          if (!answer && geminiKey) {
            try {
              const geminiModel = env.GEMINI_MODEL;
              const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel + ':generateContent?key=' + geminiKey;
              const geminiRes = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: "Answer this student's question based on their notes:\n\n" + (context ? '[Context]: ' + context.slice(0, 3500) + '\n\n' : '') + '[Question]: ' + query }] }],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
                })
              });
              if (geminiRes.ok) {
                const geminiData = await geminiRes.json();
                answer = geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts && geminiData.candidates[0].content.parts[0] ? geminiData.candidates[0].content.parts[0].text : '';
                provider = 'gemini';
              }
            } catch (_) {}
          }

          if (answer) {
            const resHeaders = new Headers({
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'X-AI-Engine': provider,
              'X-Edge-Location': edgeColo,
              'X-Server-Hits': '0',
            });
            applyCors(resHeaders, request);
            return new Response(JSON.stringify({
              success: true,
              answer: answer,
              provider: provider,
              model: provider === 'groq' ? env.GROQ_MODEL : env.GEMINI_MODEL,
              failover: failover,
              edgeLocation: edgeColo,
              cached: false
            }), { status: 200, headers: resHeaders });
          }
        } catch (_) {}
      }
    }

    // 3. Notes Stream Endpoint: /api/notes/:id/stream, /api/notes/:id/stream.pdf, etc.
    const isNoteStream = url.pathname.includes('/api/notes/') && (
      url.pathname.endsWith('/stream') ||
      url.pathname.endsWith('/stream.pdf') ||
      url.pathname.includes('/stream') ||
      url.pathname.endsWith('.pdf')
    );

    if (isNoteStream) {
      const cache = caches.default;
      // Canonical note-level cache key so /stream, /stream.pdf, and /My_File.pdf all hit the SAME Edge Cache entry!
      const noteIdMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\//);
      const canonicalPath = noteIdMatch ? `/api/notes/${noteIdMatch[1]}/stream.pdf` : url.pathname;
      const cacheKey = new Request(url.origin + canonicalPath, {
        method: 'GET',
      });

      // Handle Explicit Edge Cache Purge Request
      if (request.method === 'PURGE' || request.method === 'DELETE' || url.searchParams.get('purge') === '1') {
        const deleted = await cache.delete(cacheKey);
        return new Response(JSON.stringify({ success: true, message: `Edge CDN cache purged for ${url.pathname}`, deleted }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const rangeHeader = request.headers.get('Range');

      // 🛡️ STRICT LOGIN GATE ("notes sabhi ko dikhein, use wahi kar paaye jo login ho"):
      // Block unauthenticated PDF read & download requests IMMEDIATELY at Cloudflare Edge on BOTH Cache HIT & Cache MISS (0 Render load!)
      const cookieHeader = request.headers.get('cookie') || '';
      const queryTokenEarly = url.searchParams.get('token');
      const hasAnyCredentialEarly = Boolean(
        request.headers.get('authorization') ||
        /(?:^|;\s*)(?:fsm_token|fsm_admin_token|admin_token|token|vault_token)=/.test(cookieHeader) ||
        url.searchParams.get('ticket') ||
        (queryTokenEarly && queryTokenEarly !== 'null' && queryTokenEarly !== 'undefined')
      );
      if (!hasAnyCredentialEarly) {
        const headers = new Headers({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        applyCors(headers, request);
        return new Response(JSON.stringify({
          success: false,
          authRequired: true,
          message: 'Restricted Access: Please sign in or register to read or download notes.',
        }), { status: 401, headers });
      }

      // Check Cloudflare Edge Cache first
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const noteId = url.pathname.match(/^\/api\/notes\/([^/]+)\//)?.[1];
        if (noteId && (request.method === 'GET' || request.method === 'HEAD')) {
          const accessHeaders = new Headers();
          for (const name of ['authorization', 'cookie', 'cf-connecting-ip', 'x-forwarded-for']) {
            const value = request.headers.get(name);
            if (value) accessHeaders.set(name, value);
          }
          if (!accessHeaders.has('authorization') && queryTokenEarly) {
            accessHeaders.set('Authorization', `Bearer ${queryTokenEarly}`);
          }

          let accessVerified = false;
          for (const accOrigin of streamOrigins) {
            const accessUrl = new URL(`/api/notes/${encodeURIComponent(noteId)}/access`, accOrigin);
            for (const name of ['ticket', 'download', 'attachment']) {
              const value = url.searchParams.get(name);
              if (value) accessUrl.searchParams.set(name, value);
            }
            try {
              const accessController = new AbortController();
              const accessTimer = setTimeout(() => accessController.abort(), 3000);
              const accessResponse = await fetch(accessUrl, {
                method: 'GET',
                headers: accessHeaders,
                redirect: 'manual',
                signal: accessController.signal,
              });
              clearTimeout(accessTimer);
              if (accessResponse.ok) {
                markOriginUp(accOrigin);
                accessVerified = true;
                break;
              }
              if (accessResponse.status >= 400 && accessResponse.status < 500) {
                // Intentional denial (401/403/404) — NEVER mark origin down, return immediately!
                markOriginUp(accOrigin);
                const headers = new Headers(accessResponse.headers);
                headers.set('Cache-Control', 'no-store');
                applyCors(headers, request);
                return new Response(accessResponse.body, {
                  status: accessResponse.status,
                  headers,
                });
              }
              markOriginDown(accOrigin);
            } catch (_) {
              markOriginDown(accOrigin);
            }
          }

          if (!accessVerified) {
            // Fail closed on downloads or if all origin nodes are unreachable so locks/revocations are never bypassed
            if (url.searchParams.get('download') === '1') {
              const headers = new Headers({
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
              });
              applyCors(headers, request);
              return new Response(JSON.stringify({
                success: false,
                message: 'Could not verify download permission right now. Please retry in a moment.',
              }), { status: 503, headers });
            }
          }
        }

        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Real-Source', 'CLOUDFLARE_WORKER');
        headers.set('X-Source-Label', `Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
        headers.set('X-Edge-Cache', 'HIT');
        headers.set('CF-Cache-Status', 'HIT');
        headers.set('X-Cache', 'HIT');
        headers.set('X-Edge-Location', edgeColo);
        applyCors(headers, request);

        if (url.searchParams.get('download') === '1') {
          const reqFilename = url.searchParams.get('filename') || url.searchParams.get('name');
          if (reqFilename) {
            headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(reqFilename)}"; filename*=UTF-8''${encodeURIComponent(reqFilename)}`);
          } else {
            const curDisp = headers.get('Content-Disposition') || '';
            if (curDisp.startsWith('inline')) {
              headers.set('Content-Disposition', curDisp.replace(/^inline/, 'attachment'));
            }
          }
        }

        // Handle Byte-Range requests on Edge-cached buffer
        if (rangeHeader) {
          const arrayBuffer = await cachedResponse.arrayBuffer();
          const totalSize = arrayBuffer.byteLength;
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          let start = parseInt(parts[0], 10) || 0;
          let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          if (isNaN(start)) start = 0;
          if (isNaN(end) || end >= totalSize) end = totalSize - 1;
          const contentLength = end - start + 1;

          headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
          headers.set('Content-Length', contentLength.toString());

          return new Response(arrayBuffer.slice(start, end + 1), {
            status: 206,
            headers,
          });
        }

        return new Response(cachedResponse.body, {
          status: 200,
          headers,
        });
      }

      // Edge Cache Miss: Fetch full document from Origin Server with Multi-Origin Cascade Failover
      let originRes = null;
      let activeOriginUsed = originBase;

      for (let i = 0; i < streamOrigins.length; i++) {
        const curOrigin = streamOrigins[i];
        try {
          const originReqUrl = new URL(url.pathname + url.search, curOrigin);
          originReqUrl.searchParams.set('direct', '1'); // Force Render origin to stream directly without 302 redirect loops
          const forwardHeaders = new Headers(request.headers);
          forwardHeaders.set('Origin', curOrigin); // Ensure Render server CORS always accepts the worker's proxy request
          forwardHeaders.set('X-Forwarded-Host', url.host);
          forwardHeaders.set('X-Via-Worker', 'true');
          forwardHeaders.set('CF-Worker', 'true');
          forwardHeaders.set('X-Direct-Origin', '1');
          if (env.CF_WORKER_SECRET) {
            forwardHeaders.set('X-Worker-Signature', env.CF_WORKER_SECRET);
          }
          forwardHeaders.delete('Sec-Fetch-Site');
          forwardHeaders.delete('sec-fetch-site');

          // 🚨 CRITICAL: Remove Range header when fetching from Origin so Origin returns the FULL file (HTTP 200)!
          forwardHeaders.delete('Range');
          forwardHeaders.delete('range');
          forwardHeaders.delete('If-Range');
          forwardHeaders.delete('if-range');

          const originReq = new Request(originReqUrl.toString(), {
            method: request.method === 'HEAD' ? 'GET' : request.method,
            headers: forwardHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
            redirect: 'follow',
          });

          const res = await fetch(originReq);
          const cType = (res.headers.get('content-type') || '').toLowerCase();
          const routingHeader = res.headers.get('x-render-routing') || '';

          // 🛡️ Intentional 4xx responses (401 Unauth, 403 Download Locked/Paused, 404 Not Found):
          // NEVER mark a healthy Render node down and NEVER waste failover retries across all 3 nodes!
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            markOriginUp(curOrigin);
            originRes = res;
            activeOriginUsed = curOrigin;
            break;
          }

          const isErrorStatus = res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 402;
          const isHtmlError = cType.includes('text/html') || routingHeader.includes('suspend');

          if (isErrorStatus || isHtmlError) {
            markOriginDown(curOrigin);
            if (i < streamOrigins.length - 1) {
              continue; // Cascade failover immediately to next online backend node!
            }
          }

          if (res.status === 200) {
            markOriginUp(curOrigin);
            originRes = res;
            activeOriginUsed = curOrigin;
            break;
          } else if (i < streamOrigins.length - 1) {
            continue;
          } else {
            originRes = res;
            activeOriginUsed = curOrigin;
          }
        } catch (fetchErr) {
          markOriginDown(curOrigin);
          if (i < streamOrigins.length - 1) continue;
        }
      }

      if (!originRes || originRes.status >= 500) {
        const errHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(errHeaders, request);
        return new Response(JSON.stringify({
          error: 'Document stream temporarily unavailable while backend cluster auto-balances.',
          service: 'Cloudflare Edge CDN',
          activeNodes: activeHealthyCount
        }), { status: 503, headers: errHeaders });
      }

      try {
        const clientRange = request.headers.get('Range') || request.headers.get('range');

        // Build Response Headers
        const responseHeaders = new Headers(originRes.headers);
        applyCors(responseHeaders, request);
        responseHeaders.set('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('X-Edge-Location', edgeColo);
        responseHeaders.set('X-Upstream-Origin', activeOriginUsed);

        // 1. If Origin returns 200 OK: Stream immediately & cache full file on Edge!
        if (originRes.status === 200) {
          const cType = (originRes.headers.get('content-type') || '').toLowerCase();
          if (cType.includes('text/html') || cType.includes('application/json')) {
            ctx.waitUntil(cache.delete(cacheKey));
            return new Response('Document storage failover in progress. Please refresh.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
            });
          }

          // Build clean cacheable headers (CRITICAL: strip Set-Cookie & Vary or Cloudflare Cache API refuses to store!)
          const edgeCachedHeaders = new Headers(responseHeaders);
          edgeCachedHeaders.delete('Set-Cookie');
          edgeCachedHeaders.delete('set-cookie');
          edgeCachedHeaders.delete('Vary');
          edgeCachedHeaders.delete('vary');
          edgeCachedHeaders.set('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
          edgeCachedHeaders.set('X-Real-Source', 'CLOUDFLARE_WORKER');
          edgeCachedHeaders.set('X-Source-Label', `Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
          edgeCachedHeaders.set('X-Edge-Cache', 'HIT');
          edgeCachedHeaders.set('CF-Cache-Status', 'HIT');
          edgeCachedHeaders.set('X-Cache', 'HIT');
          edgeCachedHeaders.set('X-Data-Source', 'cdn');

          if (request.method === 'HEAD') {
            return new Response(null, { status: 200, headers: responseHeaders });
          }

          // ⚡ FAST STREAMING PATH (Non-Range GET): Use body.tee() so first bytes reach browser in <200ms while Edge Cache populates asynchronously!
          if (!clientRange && originRes.body) {
            if (url.searchParams.get('download') === '1') {
              const reqFilename = url.searchParams.get('filename') || url.searchParams.get('name');
              if (reqFilename) {
                responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(reqFilename)}"; filename*=UTF-8''${encodeURIComponent(reqFilename)}`);
              } else {
                const curDisp = responseHeaders.get('Content-Disposition') || '';
                if (curDisp.startsWith('inline')) {
                  responseHeaders.set('Content-Disposition', curDisp.replace(/^inline/, 'attachment'));
                }
              }
            }
            const [clientBranch, cacheBranch] = originRes.body.tee();
            const cacheableResponse = new Response(cacheBranch, {
              status: 200,
              headers: edgeCachedHeaders,
            });
            ctx.waitUntil(cache.put(cacheKey, cacheableResponse).catch(() => {}));
            responseHeaders.set('X-Edge-Cache', 'MISS-SAVED');
            return new Response(clientBranch, {
              status: 200,
              headers: responseHeaders,
            });
          }

          // Range request on Edge Cache miss: buffer once, cache full 200 OK, and slice requested range
          const fullArrayBuffer = await originRes.arrayBuffer();
          const totalSize = fullArrayBuffer.byteLength;
          responseHeaders.set('Content-Length', totalSize.toString());
          edgeCachedHeaders.set('Content-Length', totalSize.toString());

          const cacheableResponse = new Response(fullArrayBuffer, {
            status: 200,
            headers: edgeCachedHeaders,
          });
          ctx.waitUntil(cache.put(cacheKey, cacheableResponse).catch(() => {}));

          if (clientRange) {
            const parts = clientRange.replace(/bytes=/, '').split('-');
            let start = parseInt(parts[0], 10) || 0;
            let end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            if (isNaN(start)) start = 0;
            if (isNaN(end) || end >= totalSize) end = totalSize - 1;
            const contentLength = end - start + 1;

            const rangeHeaders = new Headers(responseHeaders);
            rangeHeaders.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            rangeHeaders.set('Content-Length', contentLength.toString());
            rangeHeaders.set('X-Edge-Cache', 'MISS-SAVED');

            return new Response(fullArrayBuffer.slice(start, end + 1), {
              status: 206,
              headers: rangeHeaders,
            });
          }

          return new Response(fullArrayBuffer, {
            status: 200,
            headers: responseHeaders,
          });
        }

        // 2. Non-200 responses (e.g. 401, 403, 404, or uncacheable stream)
        responseHeaders.set('X-Edge-Cache', 'MISS');
        return new Response(originRes.body, {
          status: originRes.status,
          headers: responseHeaders,
        });
      } catch (err) {
        const errHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(errHeaders, request);
        return new Response(JSON.stringify({ error: 'Origin fetch failed: ' + err.message }), {
          status: 502,
          headers: errHeaders,
        });
      }
    }

    // 4. Legacy raw Telegram fileId endpoint disabled for strict security
    // All document previews & downloads MUST pass through authenticated /api/notes/:id/stream.pdf with download-lock & visibility enforcement!
    if (url.pathname.startsWith('/stream')) {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      applyCors(headers, request);
      return new Response(
        JSON.stringify({
          success: false,
          authRequired: true,
          message: 'Direct raw file streaming is disabled. Please open notes through the authenticated Free Study Material portal.',
        }),
        { status: 403, headers }
      );
    }

    // 4.5. ⚡ Zero-Load Edge Catalog Cache for Public Read-Only Endpoints (0 Render CPU & 0 DB Reads!)
    // Strictly skips caching whenever Authorization or session/admin cookies are present so Admin hidden notes never leak!
    const PUBLIC_CATALOG_PATHS = new Set([
      '/api/notes',
      '/api/notices',
      '/api/notes/branches',
      '/api/notes/subjects',
      '/api/admin/tech-flags',
    ]);
    if (PUBLIC_CATALOG_PATHS.has(url.pathname)) {
      const cache = caches.default;
      const cleanCatalogUrl = new URL(url.origin + url.pathname + url.search);
      cleanCatalogUrl.searchParams.delete('purge');
      const catalogCacheKey = new Request(cleanCatalogUrl.toString(), { method: 'GET' });

      if (request.method === 'PURGE' || url.searchParams.get('purge') === '1') {
        const baseKey = new Request(url.origin + url.pathname, { method: 'GET' });
        const [d1, d2] = await Promise.all([
          cache.delete(catalogCacheKey),
          cache.delete(baseKey),
        ]);
        const purgeHeaders = new Headers({ 'Content-Type': 'application/json' });
        applyCors(purgeHeaders, request);
        return new Response(JSON.stringify({ success: true, purged: Boolean(d1 || d2), path: url.pathname }), {
          status: 200,
          headers: purgeHeaders,
        });
      }

      const cookieStr = request.headers.get('Cookie') || '';
      const hasSessionAuth = Boolean(
        request.headers.get('Authorization') ||
        /(?:^|;\s*)(?:fsm_token|fsm_admin_token|admin_token|token|vault_token)=/.test(cookieStr)
      );

      if (request.method === 'GET' && !hasSessionAuth) {
        const cachedCatalog = await cache.match(catalogCacheKey);
        if (cachedCatalog) {
          const clientEtag = request.headers.get('If-None-Match');
          const cachedEtag = cachedCatalog.headers.get('ETag');
          if (clientEtag && cachedEtag && clientEtag === cachedEtag) {
            const notModHeaders = new Headers({
              'ETag': cachedEtag,
              'Cache-Control': cachedCatalog.headers.get('Cache-Control') || 'public, max-age=60, s-maxage=600',
              'X-Edge-Catalog-Cache': 'HIT-304',
              'X-Edge-Location': edgeColo,
            });
            applyCors(notModHeaders, request);
            return new Response(null, { status: 304, headers: notModHeaders });
          }
          const hitHeaders = new Headers(cachedCatalog.headers);
          hitHeaders.set('X-Edge-Catalog-Cache', 'HIT');
          hitHeaders.set('CF-Cache-Status', 'HIT');
          hitHeaders.set('X-Edge-Location', edgeColo);
          applyCors(hitHeaders, request);
          return new Response(cachedCatalog.body, { status: 200, headers: hitHeaders });
        }

        // Edge Cache Miss: Fetch from healthy origin and store clean public response in Cloudflare Edge
        for (let i = 0; i < streamOrigins.length; i++) {
          const origin = streamOrigins[i];
          try {
            const originReqUrl = new URL(url.pathname + url.search, origin);
            const originRes = await fetch(originReqUrl.toString(), {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'X-Via-Worker': 'true',
                'CF-Worker': 'true',
              },
              signal: AbortSignal.timeout(8000),
            });
            if (originRes.status === 200) {
              markOriginUp(origin);
              const cc = (originRes.headers.get('Cache-Control') || '').toLowerCase();
              const isPublicCacheable = !cc.includes('private') && !cc.includes('no-store');
              const bodyText = await originRes.text();
              const respHeaders = new Headers(originRes.headers);
              respHeaders.delete('Set-Cookie');
              respHeaders.delete('set-cookie');
              respHeaders.delete('Vary');
              respHeaders.delete('vary');
              if (isPublicCacheable) {
                const ttl = url.pathname === '/api/admin/tech-flags' ? 15 : 600;
                respHeaders.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=86400`);
                const edgeStoreResp = new Response(bodyText, { status: 200, headers: new Headers(respHeaders) });
                ctx.waitUntil(cache.put(catalogCacheKey, edgeStoreResp).catch(() => {}));
                respHeaders.set('X-Edge-Catalog-Cache', 'MISS-SAVED');
              } else {
                respHeaders.set('X-Edge-Catalog-Cache', 'BYPASS');
              }
              respHeaders.set('X-Edge-Location', edgeColo);
              respHeaders.set('X-Upstream-Origin', origin);
              applyCors(respHeaders, request);
              return new Response(bodyText, { status: 200, headers: respHeaders });
            }
          } catch (_) {
            markOriginDown(origin);
          }
        }
      }
    }

    // 5. Multi-Origin Active Load Balancer with 3 -> 2 -> 1 Cascade Auto-Failover
    for (let i = 0; i < streamOrigins.length; i++) {
      const origin = streamOrigins[i];
      try {
        const originReqUrl = new URL(url.pathname + url.search, origin);
        const originRes = await fetch(new Request(originReqUrl.toString(), request));

        const routingHeader = originRes.headers.get('x-render-routing') || '';
        const isSuspendedOrDown = (originRes.status >= 502 && originRes.status <= 504) || routingHeader.includes('suspend');

        if (isSuspendedOrDown) {
          markOriginDown(origin);
          if (i < streamOrigins.length - 1) {
            continue; // Failover to next online backend!
          }
        }

        if (originRes.status < 500 && !routingHeader.includes('suspend')) {
          markOriginUp(origin);
        }

        const resHeaders = new Headers(originRes.headers);
        applyCors(resHeaders, request);
        resHeaders.set('X-Upstream-Origin', origin);
        resHeaders.set('X-Cluster-Active-Nodes', String(activeHealthyCount));
        return new Response(originRes.body, {
          status: originRes.status,
          headers: resHeaders,
        });
      } catch (err) {
        markOriginDown(origin);
        if (i < streamOrigins.length - 1) continue;
      }
    }
    return new Response('All backend nodes temporarily unreachable', { status: 503 });
  },

  // 💓 Scheduled Cron Trigger (Runs autonomously every 12 min on Cloudflare Anycast Edge)
  async scheduled(event, env, ctx) {
    const targets = getAllClusterOrigins(env);
    for (const target of targets) {
      try {
        await fetch(`${target}/health?cron=cf&t=${Date.now()}`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Cloudflare-Cron-AntiSleep/2.0',
            'Cache-Control': 'no-cache, no-store',
          },
        });
      } catch (_) {}
    }
  },
};
