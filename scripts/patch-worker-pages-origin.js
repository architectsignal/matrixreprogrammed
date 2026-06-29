const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');

if (!fs.existsSync(workerPath)) {
  console.error('Worker patch failed: src/worker.js missing');
  process.exit(1);
}

let s = fs.readFileSync(workerPath, 'utf8');
const before = s;

s = s.replace(/^const PAGES_STATIC_ORIGIN = ['"]https:\/\/matrixreprogrammed\.pages\.dev['"];\n\n?/m, '');
s = s.replace("'/newsletter': '/optin-center.html',", "'/newsletter': '/newsletter.html',");

const replacement = `const tryAsset = async (pathname) => {
      if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
        return new Response('Static assets unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'worker-assets-missing' }
        });
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Matrix-Origin': 'worker-assets-method' }
        });
      }

      const assetUrl = new URL(request.url);
      assetUrl.pathname = pathname;
      assetUrl.search = url.search;

      const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      const headers = new Headers(response.headers);
      headers.set('X-Matrix-Origin', 'worker-assets');
      headers.set('X-Matrix-Asset-Path', pathname);
      if (pathname === '/' || pathname.endsWith('.html') || !/\.[a-z0-9]{2,8}$/i.test(pathname)) {
        headers.set('Cache-Control', 'no-store, must-revalidate');
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };`;

const block = /const tryAsset = async \(pathname\) => \{[\s\S]*?\n    \};\n\n    let response = await tryAsset\(routedPath\);/;
if (!block.test(s)) {
  console.error('Worker patch failed: tryAsset block not found');
  process.exit(1);
}
s = s.replace(block, `${replacement}\n\n    let response = await tryAsset(routedPath);`);

const hasAssets = s.includes('env.ASSETS.fetch');
const hasPages = /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(s);
if (!hasAssets || hasPages) {
  console.error('Worker patch failed: bundled asset routing not clean');
  console.error(JSON.stringify({ hasAssets, hasPages }, null, 2));
  process.exit(1);
}

if (s !== before) {
  fs.writeFileSync(workerPath, s);
  console.log('Worker static routing now uses bundled Cloudflare assets.');
} else {
  console.log('Worker static routing already uses bundled Cloudflare assets.');
}
