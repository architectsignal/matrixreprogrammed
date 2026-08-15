const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const workerPath = path.join(root, 'src', 'worker-production.js');
const accessSource = path.join(root, 'behind-the-curtain-access.html');
const capstoneSource = path.join(root, 'behind-the-curtain-capstone.html');
const accessAlias = path.join(root, 'structural-power-map.html');
const capstoneAlias = path.join(root, 'structural-power-capstone.html');
const accessRuntimePath = path.join(root, 'behind-the-curtain-access-v2.js');
const capstoneRuntimePath = path.join(root, 'behind-the-curtain-capstone.js');
const reportPath = path.join(root, 'downloads', 'public-static-route-bridge.json');

function need(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(root, file)}`);
}
function copyToSite(relative) {
  if (!fs.existsSync(site)) return;
  const source = path.join(root, relative);
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (relative.endsWith('.html')) {
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}
function patchPublicLinks(base) {
  if (!fs.existsSync(base)) return 0;
  let changed = 0;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'downloads' || entry.name === '.wrangler') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.html$/i.test(entry.name)) continue;
      const before = fs.readFileSync(file, 'utf8');
      const after = before
        .replace(/href=(['"])(?:\.\/)?behind-the-curtain-access(?:\.html)?\1/gi, 'href=$1structural-power-map.html$1')
        .replace(/href=(['"])(?:\.\/)?behind-the-curtain-capstone(?:\.html)?\1/gi, 'href=$1structural-power-capstone.html$1');
      if (after !== before) { fs.writeFileSync(file, after); changed += 1; }
    }
  };
  walk(base);
  return changed;
}

for (const file of [workerPath, accessSource, capstoneSource, accessRuntimePath, capstoneRuntimePath]) need(file);

let accessRuntime = fs.readFileSync(accessRuntimePath, 'utf8');
accessRuntime = accessRuntime.replace(
  /const URLS=\{[^;]+\};/,
  "const URLS={pyramid:['/api/public/structural-power/pyramid','/data/behind-the-curtain-pyramid.json'],people:['/api/public/structural-power/people','/data/behind-the-curtain-people-registry.json'],core:['/api/public/structural-power/core','/data/behind-the-curtain.json'],families:['/api/public/structural-power/families','/data/behind-the-curtain-family-access.json'],history:['/api/public/structural-power/history','/data/behind-the-curtain-living-access-history.json'],continuity:['/api/public/structural-power/continuity','/data/behind-the-curtain-continuity-layers.json']};"
);
fs.writeFileSync(accessRuntimePath, accessRuntime);

let capstoneRuntime = fs.readFileSync(capstoneRuntimePath, 'utf8');
capstoneRuntime = capstoneRuntime.replace(/fetch\(`data\/behind-the-curtain-capstone\.json\?v=\$\{Date\.now\(\)\}`/, "fetch(`/api/public/structural-power/capstone?v=${Date.now()}`");
fs.writeFileSync(capstoneRuntimePath, capstoneRuntime);

let accessHtml = fs.readFileSync(accessSource, 'utf8')
  .replace(/behind-the-curtain-capstone(?:\.html)?/g, 'structural-power-capstone.html');
let capstoneHtml = fs.readFileSync(capstoneSource, 'utf8')
  .replace(/behind-the-curtain-access(?:\.html)?/g, 'structural-power-map.html');
fs.writeFileSync(accessAlias, accessHtml);
fs.writeFileSync(capstoneAlias, capstoneHtml);

const sourceLinksChanged = patchPublicLinks(root);
const deployableLinksChanged = fs.existsSync(site) ? patchPublicLinks(site) : 0;
for (const relative of [
  'structural-power-map.html',
  'structural-power-capstone.html',
  'behind-the-curtain-access-v2.js',
  'behind-the-curtain-capstone.js'
]) copyToSite(relative);

const workerBefore = fs.readFileSync(workerPath, 'utf8');
const workerNewline = workerBefore.includes('\r\n') ? '\r\n' : '\n';
let worker = workerBefore.replace(/\r\n/g, '\n');
const routeBlock = `const publicStaticAssetRoutes = new Map([
  ['/epstein', '/epstein-files.html'],
  ['/behind-the-curtain-access', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-access.html', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-capstone', '/behind-the-curtain-capstone.html'],
  ['/behind-the-curtain-capstone.html', '/behind-the-curtain-capstone.html'],
  ['/structural-power-map', '/structural-power-map.html'],
  ['/structural-power-map.html', '/structural-power-map.html'],
  ['/structural-power-capstone', '/structural-power-capstone.html'],
  ['/structural-power-capstone.html', '/structural-power-capstone.html'],
  ['/api/public/structural-power/people', '/data/behind-the-curtain-people-registry.json'],
  ['/api/public/structural-power/pyramid', '/data/behind-the-curtain-pyramid.json'],
  ['/api/public/structural-power/capstone', '/data/behind-the-curtain-capstone.json'],
  ['/api/public/structural-power/core', '/data/behind-the-curtain.json'],
  ['/api/public/structural-power/families', '/data/behind-the-curtain-family-access.json'],
  ['/api/public/structural-power/history', '/data/behind-the-curtain-living-access-history.json'],
  ['/api/public/structural-power/continuity', '/data/behind-the-curtain-continuity-layers.json']
]);

`;
const existingMap = /const publicStaticAssetRoutes = new Map\(\[[\s\S]*?\]\);\n\n/;
while (existingMap.test(worker)) worker = worker.replace(existingMap, '');
const routeMapAnchor = 'const jsonHeaders = {';
if (!worker.includes(routeMapAnchor)) throw new Error('Public static route map anchor missing');
worker = worker.replace(routeMapAnchor, routeBlock + routeMapAnchor);

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
      'User-Agent': 'Mozilla/5.0 (compatible; MatrixPublicRouteBridge/2.0)'
    }
  });
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Matrix-Origin', 'cloudflare-worker-public-static-assets');
  headers.set('X-Matrix-Public-Alias', assetPath);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

`;
const existingHelper = /async function servePublicStaticAsset\(request, env, assetPath\) \{[\s\S]*?\n\}\n\n(?=function sandboxCheckoutClosed)/;
if (existingHelper.test(worker)) worker = worker.replace(existingHelper, helperBlock);
else {
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
fs.writeFileSync(workerPath, worker.replace(/\n/g, workerNewline));

const checks = {
  safeHtmlAliases: fs.existsSync(accessAlias) && fs.existsSync(capstoneAlias),
  safeApiRoutes: worker.includes("['/api/public/structural-power/pyramid', '/data/behind-the-curtain-pyramid.json']"),
  safePageRoutes: worker.includes("['/structural-power-map', '/structural-power-map.html']"),
  clientUsesApi: accessRuntime.includes('/api/public/structural-power/pyramid') && capstoneRuntime.includes('/api/public/structural-power/capstone'),
  cleanQuery: worker.includes("assetUrl.search = ''"),
  strictOrigin: worker.includes('cloudflare-worker-public-static-assets'),
  dispatchBeforeAssetGate: worker.indexOf('publicStaticAssetRoutes.has(path)') < worker.indexOf('const minimumTier = protectedAssetTier(path)'),
  deployableAliases: !fs.existsSync(site) || (fs.existsSync(path.join(site, 'structural-power-map.html')) && fs.existsSync(path.join(site, 'structural-power-capstone.html')))
};
const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  aliases: {
    map: '/structural-power-map.html',
    capstone: '/structural-power-capstone.html',
    apiRoot: '/api/public/structural-power/'
  },
  linksChanged: { source: sourceLinksChanged, deployable: deployableLinksChanged },
  boundary: 'Neutral public aliases avoid path-specific Cloudflare interception. The Worker serves only named structural-power HTML and evidence data assets, strips query strings before ASSETS access, and adds a strict origin header.'
}, null, 2) + '\n');
if (failures.length) throw new Error(`Public static route bridge failed: ${failures.join(', ')}`);
console.log('Cloudflare-safe Structural Power Map aliases and public evidence API installed.');
