/**
 * Cloudflare Worker: FreeStudyMaterial Edge Stream Cache & Global Proxy
 * High-Speed Global Edge CDN Streaming for Telegram Cloud Storage
 * Concept: Note Storage -> Cloudflare Worker Edge -> Client View/Download (with RAM/Disk cache fallback)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const originBase = env.ORIGIN_URL || 'https://freestudymaterial.onrender.com';
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
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. Health check & status endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'FreeStudyMaterial Edge Stream Worker',
        edgeLocation: edgeColo,
        originServer: originBase,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': '*',
        },
      });
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
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Real-Source', 'CLOUDFLARE_WORKER');
        headers.set('X-Source-Label', `⚡ Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
        headers.set('X-Edge-Cache', 'HIT');
        headers.set('CF-Cache-Status', 'HIT');
        headers.set('X-Cache', 'HIT');
        headers.set('X-Edge-Location', edgeColo);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache');

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

      // Edge Cache Miss: Fetch full document from Origin Server (Render Node where RAM/Disk/Telegram lives)
      try {
        const originReqUrl = new URL(url.pathname + url.search, originBase);
        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set('Origin', originBase); // Ensure Render server CORS always accepts the worker's proxy request
        forwardHeaders.set('X-Forwarded-Host', url.host);
        forwardHeaders.set('X-Via-Worker', 'true');
        forwardHeaders.set('CF-Worker', 'true');
        forwardHeaders.delete('Sec-Fetch-Site');
        forwardHeaders.delete('sec-fetch-site');

        // 🚨 CRITICAL: Remove Range header when fetching from Origin so Origin returns the FULL file (HTTP 200)!
        // Cloudflare caches.default requires a 200 OK status to cache (206 Partial Content cannot be cached).
        // By fetching full 200 once, the Worker caches the whole document permanently in Edge CDN,
        // and slices byte-ranges for this student and all future students in 0ms!
        const clientRange = request.headers.get('Range') || request.headers.get('range');
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

        const originRes = await fetch(originReq);

        // Build Response Headers
        const responseHeaders = new Headers(originRes.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, X-Real-Source, X-Source-Label, X-Data-Source, X-Storage-Node, CF-Cache-Status, X-Cache, X-Edge-Location, X-Edge-Cache');
        responseHeaders.set('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('X-Edge-Location', edgeColo);

        // 1. If Origin returns 200 OK: Cache full file on Edge & return slice or full body
        if (originRes.status === 200) {
          const fullArrayBuffer = await originRes.arrayBuffer();
          const totalSize = fullArrayBuffer.byteLength;
          responseHeaders.set('Content-Length', totalSize.toString());

          // Mark headers for the cached copy
          const edgeCachedHeaders = new Headers(responseHeaders);
          edgeCachedHeaders.set('X-Real-Source', 'CLOUDFLARE_WORKER');
          edgeCachedHeaders.set('X-Source-Label', `⚡ Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
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
        return new Response(JSON.stringify({ error: 'Origin fetch failed: ' + err.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // 4. Direct Telegram Bot API stream endpoint: /stream/:fileId?name=xyz.pdf
    if (url.pathname.startsWith('/stream')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const fileId = parts[1] || url.searchParams.get('fileId');
      const filename = url.searchParams.get('name') || 'document.pdf';

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
        responseHeaders.set('X-Source-Label', `⚡ Cloudflare Edge Worker (${edgeColo} CDN Cache)`);
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
          return new Response(`Telegram file resolution failed: ${fileMeta.description || 'Not found'}`, { 
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const filePath = fileMeta.result.file_path;
        const tgDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // Step B: Stream file from Telegram API upstream
        const fileStreamRes = await fetch(tgDownloadUrl);
        if (!fileStreamRes.ok) {
          return new Response('Failed to stream file from Telegram upstream server', { 
            status: 502,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        // Step C: Build Edge Cached Response (7-day caching)
        const headers = new Headers();
        headers.set('Content-Type', fileStreamRes.headers.get('Content-Type') || 'application/pdf');
        headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        headers.set('X-Real-Source', 'ACADEMIC_CLOUD_VAULT');
        headers.set('X-Source-Label', '☁️ Primary Academic Cloud Storage (Encrypted Vault)');
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

    // 5. General proxy to origin for any other endpoints
    try {
      const originReqUrl = new URL(url.pathname + url.search, originBase);
      const originRes = await fetch(new Request(originReqUrl.toString(), request));
      const resHeaders = new Headers(originRes.headers);
      resHeaders.set('Access-Control-Allow-Origin', '*');
      resHeaders.set('Access-Control-Expose-Headers', '*');
      return new Response(originRes.body, {
        status: originRes.status,
        headers: resHeaders,
      });
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  },
};
