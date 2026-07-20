const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'src', 'worker-production.js');
if (!fs.existsSync(file)) throw new Error('src/worker-production.js is missing');

let source = fs.readFileSync(file, 'utf8');
const before = source;
const importLine = "import { isReleaseMetadataRoute, serveReleaseMetadata } from './worker-release-metadata.js';";
if (!source.includes(importLine)) {
  const anchor = "import {\n  enforceProtectedAssetAccess,";
  if (!source.includes(anchor)) throw new Error('Worker import anchor not found');
  source = source.replace(anchor, `${importLine}\n${anchor}`);
}

const routeLine = "    if (isReleaseMetadataRoute(path)) return serveReleaseMetadata(request, env, path);";
if (!source.includes(routeLine)) {
  const anchor = "    const path = new URL(request.url).pathname.replace(/\\/+$/, '') || '/';";
  if (!source.includes(anchor)) throw new Error('Worker path anchor not found');
  source = source.replace(anchor, `${anchor}\n\n${routeLine}`);
}

fs.writeFileSync(file, source);
const report = {
  ok: source.includes(importLine) && source.includes(routeLine),
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  worker: 'src/worker-production.js',
  routes: ['/deploy-manifest.json', '/deploy-health.json'],
  owner: 'src/worker-release-metadata.js',
  boundary: 'Release metadata routes bypass legacy compatibility routing and serve versioned, no-store Cloudflare assets.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'release-metadata-routing-patch.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Release metadata routing patch did not apply');
console.log(`Release metadata routing ${report.changed ? 'patched' : 'already current'} in strict production Worker.`);
