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

function isCleanWorker(text) {
  const hasAssets = text.includes('env.ASSETS.fetch');
  const hasPages = /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(text);
  return hasAssets && !hasPages;
}

s = s.replace(/^const PAGES_STATIC_ORIGIN = ['"]https:\/\/matrixreprogrammed\.pages\.dev['"];\n\n?/m, '');
s = s.replace("'/newsletter': '/optin-center.html',", "'/newsletter': '/newsletter.html',");

if (isCleanWorker(s)) {
  if (s !== before) fs.writeFileSync(workerPath, s);
  console.log('Worker static routing already uses bundled Cloudflare assets.');
  process.exit(0);
}

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
  console.error('Worker patch failed: tryAsset block not found and Worker is not already clean');
  console.error(JSON.stringify({ clean: isCleanWorker(s), hasAssets: s.includes('env.ASSETS.fetch'), hasPages: /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(s) }, null, 2));
  process.exit(1);
}

s = s.replace(block, `${replacement}\n\n    let response = await tryAsset(routedPath);`);

if (!isCleanWorker(s)) {
  console.error('Worker patch failed: bundled asset routing not clean');
  console.error(JSON.stringify({ hasAssets: s.includes('env.ASSETS.fetch'), hasPages: /PAGES_STATIC_ORIGIN|matrixreprogrammed\.pages\.dev|STATIC_ORIGIN \|\|/i.test(s) }, null, 2));
  process.exit(1);
}

if (s !== before) {
  fs.writeFileSync(workerPath, s);
  console.log('Worker static routing now uses bundled Cloudflare assets.');
} else {
  console.log('Worker static routing already uses bundled Cloudflare assets.');
}
