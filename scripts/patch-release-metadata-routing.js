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
require('./patch-live-verifier-intelligence-routes.js');
// The deploy guard is a late mutation boundary. Reassert the canonical homepage
// and remove compact-preview anchor collisions before the guard reads any HTML.
require('./reconcile-homepage-contract-integrity.js');
// The same boundary is the final opportunity to protect the Black File public
// entry point before Wrangler uploads source-derived _site assets. This owner
// restores one visible static H1 and synchronizes both deployable aliases.
require('./finalize-black-file-public-hero.js');

const blackFileSource = path.join(root, 'black-file.html');
const blackFileBuilt = path.join(root, '_site', 'black-file.html');
const blackFileAlias = path.join(root, '_site', 'black-file');
function blackFileHeroHealthy(target) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const html = fs.readFileSync(target, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  return (html.match(/<h1\b/gi) || []).length === 1
    && /<h1>THE BLACK FILE<\/h1>/i.test(html)
    && /data-black-file-public-hero=["']canonical["']/i.test(html)
    && /id=["']black-file-public-lead["']/i.test(html);
}
const blackFileHeroOk = blackFileHeroHealthy(blackFileSource)
  && (!fs.existsSync(path.join(root, '_site'))
    || (blackFileHeroHealthy(blackFileBuilt) && blackFileHeroHealthy(blackFileAlias)));

const report = {
  ok: source.includes(importLine) && source.includes(routeLine) && blackFileHeroOk,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  worker: 'src/worker-production.js',
  routes: ['/deploy-manifest.json', '/deploy-health.json'],
  owner: 'src/worker-release-metadata.js',
  homepageIntegrityOwner: 'scripts/reconcile-homepage-contract-integrity.js',
  blackFileHeroOwner: 'scripts/finalize-black-file-public-hero.js',
  blackFileHeroOk,
  verifierRoutes: [
    '/daily-epstein-update',
    '/data/daily-epstein-update.json',
    '/data/live-machine-status.json',
    '/controlled-opposition/andrew-tate.html'
  ],
  boundary: 'Release metadata routes bypass legacy compatibility routing and serve versioned, no-store Cloudflare assets. The live verifier proves current intelligence outputs, while the deploy guard reasserts canonical homepage routes, unique DOM IDs and one visible Black File H1 at its own final mutation boundary.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'release-metadata-routing-patch.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Release metadata routing or final public-surface reconciliation did not apply');
console.log(`Release metadata routing ${report.changed ? 'patched' : 'already current'} in strict production Worker; Black File hero is canonical.`);