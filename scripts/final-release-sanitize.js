const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
if (!fs.existsSync(site)) throw new Error('_site does not exist; build the Cloudflare output first.');

const commands = [];
function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 30
  });
  commands.push({ script, args, status: result.status, stdout: String(result.stdout || '').slice(-2500), stderr: String(result.stderr || '').slice(-2500) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} ${args.join(' ')} failed`);
}
function copy(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) throw new Error(`Final release source missing: ${relative}`);
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (relative.endsWith('.html')) {
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}

run('scripts/patch-geographic-power-atlas-runtime.js');
for (const relative of [
  'geographic-power-atlas.html',
  'geographic-power-atlas.js',
  'data/geographic-power-atlas.json',
  'data/geographic-power-atlas-data.json',
  'data/geographic-power-atlas.geojson',
  'downloads/geographic-power-atlas.csv',
  'power-dossier-runtime.js',
  'admin-email-launch.html',
  'admin-email-launch.js',
  'intake-fallback.js'
]) copy(relative);

run('scripts/sanitize-machine-entity-outputs.js');
run('scripts/sanitize-machine-entity-outputs.js', ['--output']);
run('scripts/compact-cloudflare-search-index.js');
run('scripts/patch-power-dossier-runtime.js');
run('scripts/repair-empty-public-controls.js');
run('scripts/repair-empty-public-controls.js', ['--output']);
run('scripts/repair-public-runtime-controls.js');
run('scripts/repair-public-runtime-controls.js', ['--output']);
run('scripts/fix-public-editorial-audit-errors.js');
run('scripts/hide-visible-compatibility-markers.js');
run('scripts/hide-visible-compatibility-markers.js', ['--output']);
run('scripts/patch-paypal-voluntary-support.js');
run('scripts/patch-voluntary-support-store.js');
run('scripts/patch-brevo-transactional-readiness.js');
run('scripts/patch-email-launch-console.js');
run('scripts/brevo-operational-readiness-audit.js');
run('scripts/patch-production-receipt-email-safety.js');
run('scripts/repair-deep-audit-public-defects.js');
run('scripts/repair-deep-audit-accessibility-metadata.js');
run('scripts/enforce-phase1-cloudflare-config.js');
run('scripts/public-control-target-audit.js');
run('scripts/full-site-function-tool-audit.js', ['--postbuild']);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  commands,
  synchronized: [
    'geographic-power-atlas.html', 'geographic-power-atlas.js',
    'data/geographic-power-atlas.json', 'data/geographic-power-atlas-data.json',
    'data/geographic-power-atlas.geojson', 'downloads/geographic-power-atlas.csv',
    'power-dossier-runtime.js', '_site/search-index.json', 'store.html',
    'card-deck-store.html', 'premium-reports.html', 'paypal-voluntary-support.js',
    'epstein-upload-check.html', 'wrongdoing-tracker.html', 'intake-fallback.js',
    'admin-email-launch.html', 'admin-email-launch.js',
    'src/worker-paypal-subscriptions.js', 'src/worker-email-lifecycle.js',
    'scripts/build-production-deploy-receipt.js',
    'downloads/deep-audit-accessibility-metadata-repair.json',
    'downloads/brevo-operational-readiness.json', 'wrangler.toml', 'wrangler.jsonc'
  ],
  boundary: 'This is the final mutation and audit step for the exact _site bundle and Worker configuration. No later generator may restore malformed entity routes, dead intake placeholders, broken tracker JavaScript, fixed report prices, stale mission copy, inaccessible controls, weak metadata, unsafe email/payment switches or oversized search assets.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'final-release-sanitize.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('Final release sanitation passed for the deployable bundle, voluntary support pages, reviewed intake flow, accessibility and metadata repairs, Brevo readiness and Cloudflare safety configuration.');
