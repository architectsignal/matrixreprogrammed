const fs = require('fs');
const path = require('path');
const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
if (!fs.existsSync(workerPath)) {
  console.error('patch-worker-pages-origin failed: src/worker.js missing');
  process.exit(1);
}
let s = fs.readFileSync(workerPath, 'utf8');
const before = s;

if (!s.includes("const PAGES_STATIC_ORIGIN = 'https://matrixreprogrammed.pages.dev';")) {
  s = s.replace("const jsonHeaders = {", "const PAGES_STATIC_ORIGIN = 'https://matrixreprogrammed.pages.dev';\n\nconst jsonHeaders = {");
}

s = s.replace("'/newsletter': '/optin-center.html',", "'/newsletter': '/newsletter.html',");

const oldTryAsset = /const tryAsset = async \(pathname\) => \{\n\s+const nextUrl = new URL\(request\.url\);\n\s+nextUrl\.pathname = pathname;\n\s+return env\.ASSETS\.fetch\(new Request\(nextUrl, request\)\);\n\s+\};/;
const newTryAsset = `const tryAsset = async (pathname) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Worker': 'static-method-blocked' }
        });
      }

      const staticOrigin = env.STATIC_ORIGIN || PAGES_STATIC_ORIGIN;
      const nextUrl = new URL(staticOrigin);
      nextUrl.pathname = pathname;
      nextUrl.search = url.search;

      const cacheable = request.method === 'GET' && !url.search;
      const cacheTtl = /\\.(?:css|js|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|pdf)$/i.test(pathname) ? 86400 : 300;
      const cacheKey = new Request(nextUrl.toString(), { method: 'GET' });

      if (cacheable) {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
          const cachedHeaders = new Headers(cached.headers);
          cachedHeaders.set('X-Matrix-Cache', 'HIT');
          cachedHeaders.set('X-Matrix-Origin', 'pages.dev');
          return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: cachedHeaders });
        }
      }

      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.delete('cookie');
      headers.set('X-Matrix-Worker-Proxy', 'pages-origin');
      headers.set('X-Forwarded-Host', url.hostname);

      let originResponse;
      try {
        originResponse = await fetch(new Request(nextUrl.toString(), { method: request.method, headers, redirect: 'follow' }), {
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: { '200-299': cacheTtl, '404': 60, '500-599': 0 }
          }
        });
      } catch (error) {
        return new Response('Static origin temporarily unavailable. Try again shortly.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'pages.dev', 'X-Matrix-Origin-Error': 'fetch-failed' }
        });
      }

      const outHeaders = new Headers(originResponse.headers);
      outHeaders.set('X-Matrix-Origin', 'pages.dev');
      outHeaders.set('X-Matrix-Asset-Path', pathname);
      outHeaders.set('X-Matrix-Cache', 'MISS');
      if (originResponse.ok) {
        outHeaders.set('Cache-Control', cacheTtl >= 86400 ? 'public, max-age=86400, s-maxage=86400' : 'public, max-age=300, s-maxage=300');
      }
      const response = new Response(originResponse.body, { status: originResponse.status, statusText: originResponse.statusText, headers: outHeaders });
      if (cacheable && originResponse.ok) await caches.default.put(cacheKey, response.clone());
      return response;
    };`;

if (oldTryAsset.test(s)) {
  s = s.replace(oldTryAsset, newTryAsset);
}

s = s.replace(/if \(response\.status !== 404\) return response;/g, "if (![403, 404].includes(response.status)) return response;");

if (!s.includes('PAGES_STATIC_ORIGIN') || !s.includes('pages.dev') || !s.includes('X-Matrix-Origin')) {
  console.error('patch-worker-pages-origin failed: Pages origin proxy markers missing after patch');
  process.exit(1);
}

if (s !== before) {
  fs.writeFileSync(workerPath, s);
  console.log('Worker static fallback patched to proxy Pages origin with cache.');
} else {
  console.log('Worker static fallback already uses Pages origin with cache.');
}
