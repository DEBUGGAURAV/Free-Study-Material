/**
 * Cloudflare Worker: FreeStudyMaterial Edge Stream Cache
 * High-Speed 80+ MB/s Global Edge CDN Streaming for Telegram Cloud Storage
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Health check & status endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'FreeStudyMaterial Edge Stream Worker',
        edgeLocation: request.cf?.colo || 'Global',
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 2. Stream endpoint: /stream/:fileId?name=xyz.pdf
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
        responseHeaders.set('X-Edge-Cache', 'HIT');
        responseHeaders.set('X-Edge-Location', request.cf?.colo || 'Edge');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers: responseHeaders,
        });
      }

      // Cache Miss: Fetch from Telegram Bot API using secret bot token
      const botToken = env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return new Response('Worker error: TELEGRAM_BOT_TOKEN secret not configured in Cloudflare Worker environment variables', { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
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
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        headers.set('X-Edge-Cache', 'MISS');
        headers.set('X-Edge-Location', request.cf?.colo || 'Edge');
        headers.set('Access-Control-Allow-Origin', '*');

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

    return new Response('Not found', { status: 404 });
  },
};

