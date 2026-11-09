/**
 * Cloudflare Worker: FreeStudyMaterial Edge Stream Cache & Global Proxy
 * High-Speed Global Edge CDN Streaming for Telegram Cloud Storage
 * Concept: Note Storage -> Cloudflare Worker Edge -> Client View/Download (with RAM/Disk cache fallback)
 */

function isTrustedOrigin(origin) {
  if (!origin) return false;
  return (
    origin.includes('onrender.com') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('workers.dev') ||
    origin.includes('freestudymaterial')
  );
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
  headers.set('Access-Control-Allow-Headers', '*');
  headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache, X-Upstream-Origin, X-Cluster-Active-Nodes');
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

// Returns all 3 cluster nodes guaranteed (even if Cloudflare env vars are missing or partial)
function getAllClusterOrigins(env) {
  const list = [
    (env.BACKUP_ORIGIN_URL_1 || 'https://freestudymaterial1.onrender.com').replace(/\/+$/, ''),
    (env.BACKUP_ORIGIN_URL_2 || 'https://freestudymaterial2.onrender.com').replace(/\/+$/, ''),
    (env.ORIGIN_URL || 'https://freestudymaterial.onrender.com').replace(/\/+$/, ''),
  ];
  const unique = [];
  for (const item of list) {
    if (item && !unique.includes(item)) unique.push(item);
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
    const streamOrigins = getPrioritizedClusterOrigins(env, clientIp);
    const activeHealthyCount = streamOrigins.filter((o) => getOriginCooldownRemaining(o) === 0).length || 1;
    const originBase = streamOrigins[0] || 'https://freestudymaterial1.onrender.com';
    const edgeColo = request.cf?.colo || 'Global';

    // 🛡️ Block Direct Cross-Site Hotlinking from unauthorized third-party domains
    const originHeader = request.headers.get('Origin') || request.headers.get('Referer') || '';
    const isDocNav = request.headers.get('Sec-Fetch-Mode') === 'navigate' || request.headers.get('Sec-Fetch-Dest') === 'document';
    const isAllowedClient = !originHeader || 
      isDocNav ||
      originHeader.includes('onrender.com') || 
      originHeader.includes('localhost') || 
      originHeader.includes('127.0.0.1') || 
      originHeader.includes('workers.dev');
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
    if (url.pathname === '/api/ai/ask' && request.method === 'POST') {
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
              const groqModel = env.GROQ_MODEL || 'openai/gpt-oss-20b';
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
              const geminiModel = env.GEMINI_MODEL || 'gemini-flash-lite-latest';
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
              model: provider === 'groq' ? (env.GROQ_MODEL || 'openai/gpt-oss-20b') : (env.GEMINI_MODEL || 'gemini-flash-lite-latest'),
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
      // Strip dynamic token/download parameters from cache key so edge cache is shared globally across students for this document
      const cleanUrl = new URL(url.toString());
      cleanUrl.searchParams.delete('token');
      cleanUrl.searchParams.delete('ticket');
      cleanUrl.searchParams.delete('download');
      cleanUrl.searchParams.delete('_');
      cleanUrl.searchParams.delete('t');
      const cacheKey = new Request(cleanUrl.origin + cleanUrl.pathname, {
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

      // Check Cloudflare Edge Cache first
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const noteId = url.pathname.match(/^\/api\/notes\/([^/]+)\//)?.[1];
        if (noteId && (request.method === 'GET' || request.method === 'HEAD')) {
          const accessUrl = new URL(`/api/notes/${encodeURIComponent(noteId)}/access`, originBase);
          for (const name of ['ticket']) {
            const value = url.searchParams.get(name);
            if (value) accessUrl.searchParams.set(name, value);
          }

          const accessHeaders = new Headers();
          for (const name of ['authorization', 'cookie', 'cf-connecting-ip', 'x-forwarded-for']) {
            const value = request.headers.get(name);
            if (value) accessHeaders.set(name, value);
          }
          const queryToken = url.searchParams.get('token');
          if (!accessHeaders.has('authorization') && queryToken) {
            accessHeaders.set('Authorization', `Bearer ${queryToken}`);
          }

          try {
            const accessResponse = await fetch(accessUrl, {
              method: 'GET',
              headers: accessHeaders,
              redirect: 'manual',
            });
            if (!accessResponse.ok) {
              const headers = new Headers(accessResponse.headers);
              headers.set('Cache-Control', 'no-store');
              applyCors(headers, request);
              return new Response(accessResponse.body, {
                status: accessResponse.status,
                headers,
              });
            }
          } catch (_) {
            const headers = new Headers({
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            });
            applyCors(headers, request);
            return new Response(JSON.stringify({
              success: false,
              message: 'Could not verify note visibility.',
            }), {
              status: 503,
              headers,
            });
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
          const isErrorStatus = res.status >= 500 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 402 || res.status === 403;
          const isHtmlError = cType.includes('text/html') || routingHeader.includes('suspend');

          if ((isErrorStatus || isHtmlError)) {
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

        // 1. If Origin returns 200 OK: Cache full file on Edge & return slice or full body
        if (originRes.status === 200) {
          const fullArrayBuffer = await originRes.arrayBuffer();
          const totalSize = fullArrayBuffer.byteLength;

          // 🛡️ CRITICAL CHECK: Verify buffer is genuine PDF/binary data, NOT Render suspension HTML!
          const cType = (originRes.headers.get('content-type') || '').toLowerCase();
          let isSuspensionPage = false;
          if (cType.includes('text/html') || totalSize < 3000) {
            try {
              const preview = new TextDecoder().decode(fullArrayBuffer.slice(0, Math.min(1000, totalSize)));
              if (preview.includes('suspended by its owner') || preview.includes('service has been suspended') || preview.includes('<!DOCTYPE html')) {
                isSuspensionPage = true;
              }
            } catch (_) {}
          }

          if (isSuspensionPage) {
            ctx.waitUntil(cache.delete(cacheKey));
            return new Response('Document storage failover in progress. Please refresh.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
            });
          }

          responseHeaders.set('Content-Length', totalSize.toString());

          // Mark headers for the cached copy
          const edgeCachedHeaders = new Headers(responseHeaders);
          edgeCachedHeaders.set('X-Real-Source', 'CLOUDFLARE_WORKER');
          edgeCachedHeaders.set('X-Source-Label', `Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
          edgeCachedHeaders.set('X-Edge-Cache', 'HIT');
          edgeCachedHeaders.set('CF-Cache-Status', 'HIT');
          edgeCachedHeaders.set('X-Cache', 'HIT');

          // 💾 Store the full 200 OK response into Cloudflare Global Edge Cache (shared globally across all students!)
          const cacheableResponse = new Response(fullArrayBuffer, {
            status: 200,
            headers: edgeCachedHeaders,
          });
          ctx.waitUntil(cache.put(cacheKey, cacheableResponse));

          if (request.method === 'HEAD') {
            return new Response(null, { status: 200, headers: responseHeaders });
          }

          // If current client requested a Range (e.g. PDF.js first page chunk):
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
            rangeHeaders.set('X-Edge-Cache', 'MISS-SAVED'); // Fetched from store & cached to CDN

            return new Response(fullArrayBuffer.slice(start, end + 1), {
              status: 206,
              headers: rangeHeaders,
            });
          }

          // If client requested download, ensure attachment disposition
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

          // Client requested full file:
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

    // 4. Direct Telegram Bot API stream endpoint: /stream/:fileId?name=xyz.pdf
    if (url.pathname.startsWith('/stream')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const fileId = parts[1] || url.searchParams.get('fileId');
      const filename = url.searchParams.get('filename') || url.searchParams.get('name') || 'document.pdf';

      if (!fileId) {
        return new Response('Missing fileId parameter', { 
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);

      // Check Edge Cache first (0ms latency if cached in local edge)
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseHeaders = new Headers(cachedResponse.headers);
        responseHeaders.set('X-Real-Source', 'CLOUDFLARE_WORKER');
        responseHeaders.set('X-Source-Label', `Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
        responseHeaders.set('X-Edge-Cache', 'HIT');
        responseHeaders.set('CF-Cache-Status', 'HIT');
        responseHeaders.set('X-Edge-Location', edgeColo);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', '*');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers: responseHeaders,
        });
      }

      // Cache Miss: Fetch from Telegram Bot API using secret bot token
      const botToken = env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        // Fallback: proxy to origin server
        const originReqUrl = new URL(url.pathname + url.search, originBase);
        return fetch(originReqUrl.toString(), request);
      }

      try {
        // Step A: Resolve file path from Telegram Bot API
        const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
        const fileMetaRes = await fetch(getFileUrl);
        const fileMeta = await fileMetaRes.json();

        if (!fileMeta.ok || !fileMeta.result?.file_path) {
          return new Response(`Cloud vault file resolution notice: ${fileMeta.description || 'Not found'}`, { 
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const filePath = fileMeta.result.file_path;
        const tgDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // Step B: Stream file from upstream core storage
        const fileStreamRes = await fetch(tgDownloadUrl);
        if (!fileStreamRes.ok) {
          return new Response('Failed to stream file from academic cloud upstream storage', { 
            status: 502,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        // Step C: Build Edge Cached Response (7-day caching)
        const headers = new Headers();
        headers.set('Content-Type', fileStreamRes.headers.get('Content-Type') || 'application/pdf');
        const isDownload = url.searchParams.get('download') === '1';
        const disposition = isDownload ? 'attachment' : 'inline';
        headers.set('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        headers.set('X-Real-Source', 'ACADEMIC_CLOUD_VAULT');
        headers.set('X-Source-Label', 'Primary Academic Cloud Storage (Encrypted Vault)');
        headers.set('X-Edge-Cache', 'MISS');
        headers.set('X-Edge-Location', edgeColo);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Expose-Headers', '*');

        const streamResponse = new Response(fileStreamRes.body, {
          status: 200,
          headers,
        });

        // Store in Cloudflare global edge cache asynchronously
        ctx.waitUntil(cache.put(cacheKey, streamResponse.clone()));

        return streamResponse;
      } catch (err) {
        return new Response(`Worker stream exception: ${err.message}`, { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
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
