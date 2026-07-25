const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-production.js');
const reportPath = path.join(root, 'downloads', 'public-static-route-bridge.json');

if (!fs.existsSync(workerPath)) throw new Error('Missing src/worker-production.js');
let worker = fs.readFileSync(workerPath, 'utf8');

const routeBlock = `const publicStaticAssetRoutes = new Map([
  ['/behind-the-curtain-access', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-access.html', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-capstone', '/behind-the-curtain-capstone.html'],
  ['/behind-the-curtain-capstone.html', '/behind-the-curtain-capstone.html'],
  ['/data/behind-the-curtain-people-registry.json', '/data/behind-the-curtain-people-registry.json'],
  ['/data/behind-the-curtain-pyramid.json', '/data/behind-the-curtain-pyramid.json'],
  ['/data/behind-the-curtain-capstone.json', '/data/behind-the-curtain-capstone.json']
]);

`;

if (!worker.includes('const publicStaticAssetRoutes = new Map([')) {
  const anchor = 'const jsonHeaders = {';
  if (!worker.includes(anchor)) throw new Error('Public static route map anchor missing');
  worker = worker.replace(anchor, routeBlock + anchor);
}

const helperBlock = `async function servePublicStaticAsset(request, env, assetPath) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return unavailable('assets-binding-unavailable', assetPath, 'asset-gate');
  }
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = '';
  const accept = assetPath.endsWith('.json')
    ? 'application/json, text/plain;q=0.9, */*;q=0.8'
    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: accept,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; MatrixPublicRouteBridge/1.0)'
    }
  });
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Matrix-Origin', 'cloudflare-worker-public-static-assets');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

`;

if (!worker.includes('async function servePublicStaticAsset(')) {
  const anchor = 'function sandboxCheckoutClosed(';
  if (!worker.includes(anchor)) throw new Error('Public static route helper anchor missing');
  worker = worker.replace(anchor, helperBlock + anchor);
}

const dispatch = `    if ((request.method === 'GET' || request.method === 'HEAD') && publicStaticAssetRoutes.has(path)) {
      try {
        return await servePublicStaticAsset(request, env, publicStaticAssetRoutes.get(path));
      } catch (error) {
        return unavailable('public-static-asset-exception', error?.message || error, 'asset-gate');
      }
    }

`;

if (!worker.includes('publicStaticAssetRoutes.has(path)')) {
  const anchor = '    const minimumTier = protectedAssetTier(path);';
  if (!worker.includes(anchor)) throw new Error('Public static route dispatch anchor missing');
  worker = worker.replace(anchor, dispatch + anchor);
}

fs.writeFileSync(workerPath, worker);

const checks = {
  routeMap: worker.includes("['/behind-the-curtain-access', '/behind-the-curtain-access.html']"),
  jsonRoutes: worker.includes("['/data/behind-the-curtain-pyramid.json', '/data/behind-the-curtain-pyramid.json']"),
  cleanQuery: worker.includes("assetUrl.search = ''"),
  browserCompatibleRequest: worker.includes('MatrixPublicRouteBridge/1.0'),
  strictOrigin: worker.includes('cloudflare-worker-public-static-assets'),
  dispatchBeforeAssetGate: worker.indexOf('publicStaticAssetRoutes.has(path)') < worker.indexOf('const minimumTier = protectedAssetTier(path)')
};
const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  boundary: 'Only named public Behind the Curtain HTML and JSON assets are bridged. Query strings and verifier headers are stripped before the Cloudflare ASSETS binding is called.'
}, null, 2) + '\n');
if (failures.length) throw new Error(`Public static route bridge failed: ${failures.join(', ')}`);
console.log('Public static route bridge installed for Behind the Curtain HTML and JSON assets.');
