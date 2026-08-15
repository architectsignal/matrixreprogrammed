import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  SCRIPT_MARKER,
  STYLE_MARKER,
  auditGlobalAccessDock,
  injectGlobalAccessDock,
  stripGlobalAccessDock
} = require('./global-access-dock-contract.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = '<!doctype html><html><head><title>Test</title></head><body><main>Page</main></body></html>';
const injected = injectGlobalAccessDock(sample);
const reinjected = injectGlobalAccessDock(injected);

assert.equal(auditGlobalAccessDock(injected).ok, true, 'sample document must receive both assets');
assert.equal(reinjected, injected, 'injection must be idempotent');
assert.equal(stripGlobalAccessDock(injected), sample, 'deploy-only dock assets must be removable from canonical source HTML');
assert.equal(
  auditGlobalAccessDock(injectGlobalAccessDock(`${injected}${injected}`)).ok,
  true,
  'injection must repair duplicate dock assets to exactly one pair'
);
assert.ok(injected.indexOf(STYLE_MARKER) < injected.indexOf('</head>'), 'stylesheet must be inside the head');
assert.ok(injected.indexOf(SCRIPT_MARKER) < injected.indexOf('</body>'), 'script must be inside the body');

const fragment = injectGlobalAccessDock('<main>Fragment</main>');
assert.equal(auditGlobalAccessDock(fragment).ok, true, 'documents without closing tags must still receive the dock');

const client = fs.readFileSync(path.join(root, 'matrix-access-dock.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'matrix-access-dock.css'), 'utf8');
const build = fs.readFileSync(path.join(root, 'scripts', 'build-cloudflare-output.js'), 'utf8');
const finalReconcile = fs.readFileSync(path.join(root, 'scripts', 'final-production-reconcile.js'), 'utf8');
const productionDeployGuard = fs.readFileSync(path.join(root, 'scripts', 'production-deploy-guard.js'), 'utf8');
const performanceOptimizer = fs.readFileSync(path.join(root, 'scripts', 'apply-runtime-performance-optimizations.js'), 'utf8');

for (const route of [
  '/start-here.html',
  '/search.html',
  '/daily-command-brief.html',
  '/evidence-vault.html',
  '/investigation-machine.html',
  '/forum.html',
  '/member-login.html',
  '/newsletter.html#newsletter-form'
]) {
  assert.ok(client.includes(route), `quick access route missing: ${route}`);
}

assert.ok(!/https?:\/\//i.test(client), 'dock must not add an external navigation dependency');
assert.ok(client.includes("event.key === 'Escape'"), 'drawer must support Escape');
assert.ok(client.includes("aria-current"), 'current navigation state must be exposed accessibly');
assert.ok(stylesheet.includes('@media (max-width: 480px)'), 'dock must include a narrow-screen layout');
assert.ok(stylesheet.includes('@media (prefers-reduced-motion: reduce)'), 'dock must respect reduced motion');
assert.ok(build.includes("require('./global-access-dock-contract.cjs')"), 'Cloudflare packaging must own the injection');
assert.ok(build.includes("'matrix-access-dock.css'"), 'Cloudflare output must require the stylesheet');
assert.ok(build.includes("'matrix-access-dock.js'"), 'Cloudflare output must require the client');
assert.ok(finalReconcile.includes("run('scripts/reconcile-global-access-dock.cjs')"), 'final production reconciliation must restore the dock after authoritative HTML mirrors');
assert.ok(finalReconcile.includes('stripSourceGlobalAccessDock'), 'final production reconciliation must remove deploy-only dock assets from authoritative source mirrors');
assert.ok(finalReconcile.indexOf("run('scripts/reconcile-global-access-dock.cjs')") < finalReconcile.indexOf("run('scripts/version-cloudflare-assets.js')"), 'final dock reconciliation must run before final asset fingerprinting');
assert.ok(productionDeployGuard.includes("require('./patch-release-metadata-routing.js')"), 'production guard must identify the late release-metadata mutator');
assert.ok(productionDeployGuard.includes("runFinalSeal('reconcile-global-access-dock.cjs')"), 'production guard must restore the dock after its late HTML mutator');
assert.ok(productionDeployGuard.includes("runFinalSeal('version-cloudflare-assets.js')"), 'production guard must fingerprint dock assets after late restoration');
assert.ok(productionDeployGuard.indexOf("runFinalSeal('reconcile-global-access-dock.cjs')") < productionDeployGuard.indexOf("runFinalSeal('version-cloudflare-assets.js')"), 'production guard must fingerprint dock assets after restoring them');
assert.ok(productionDeployGuard.indexOf("require('./patch-release-metadata-routing.js')") < productionDeployGuard.indexOf("runFinalSeal('reconcile-global-access-dock.cjs')"), 'production guard dock restoration must follow release-metadata routing');
assert.ok(productionDeployGuard.indexOf("runFinalSeal('reconcile-global-access-dock.cjs')") < productionDeployGuard.indexOf("runFinalSeal('build-deploy-manifest.js', true)"), 'production guard must restore the dock before sealing final manifest hashes');
assert.ok(performanceOptimizer.includes('stripGlobalAccessDock(read(optimized))'), 'runtime optimization must not copy deploy-only dock assets back into canonical source HTML');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(packageJson.scripts.postbuild.includes('reconcile-global-access-dock.cjs'), 'postbuild must restore the dock after late generators');
assert.ok(packageJson.scripts['postcloudflare-output'].includes('reconcile-global-access-dock.cjs'), 'Cloudflare lifecycle must restore the dock after late generators');
assert.ok(packageJson.scripts['link-audit'].includes('reconcile-global-access-dock.cjs'), 'link audit must reconcile before scanning final output');

let outputAudit = null;
if (process.argv.includes('--site')) {
  const site = path.join(root, '_site');
  assert.ok(fs.existsSync(site), 'deployable _site output must exist for --site audit');
  const documents = [];
  const failures = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (extension !== '.html' && extension !== '') continue;
      const html = fs.readFileSync(file, 'utf8');
      if (extension === '' && !/<(?:!doctype\s+html|html\b)/i.test(html.slice(0, 500))) continue;
      documents.push(file);
      const audit = auditGlobalAccessDock(html);
      if (!audit.ok) failures.push({ file: path.relative(site, file), ...audit });
    }
  }

  walk(site);
  assert.ok(documents.length >= 3000, `expected both HTML and extensionless output routes; found ${documents.length}`);
  assert.deepEqual(failures, [], `global access dock output failures: ${JSON.stringify(failures.slice(0, 10))}`);
  outputAudit = { documents: documents.length, failures: failures.length };
}

console.log(JSON.stringify({
  ok: true,
  assets: 2,
  primaryActions: ['explore', 'login', 'subscribe'],
  navigationRoutes: 6,
  zeroExternalDependencies: true,
  packagingOwned: true,
  lifecycleReconciled: true,
  outputAudit
}, null, 2));
