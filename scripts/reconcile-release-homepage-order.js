'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'release-homepage-order-reconciliation.json');
const commands = [];
const copied = [];
const checks = [];
const hitListPresent = fs.existsSync(path.join(root, 'data', 'cinematic-hit-list.json'));

function run(script, args = []) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) throw new Error(`Required homepage owner script is missing: ${script}`);
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 50
  });
  commands.push({
    script,
    args,
    status: result.status,
    stdout: String(result.stdout || '').slice(-3000),
    stderr: String(result.stderr || '').slice(-3000)
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} failed`);
}

function recordPrebuildSkip(script, reason) {
  commands.push({ script, args: [], status: 0, skipped: true, reason, stdout: '', stderr: '' });
  console.log(`${script} skipped: ${reason}`);
}

function patchSafetyRoutes(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes('class="accountability-home"') || !before.includes('accountability-nav-drawer')) {
    throw new Error(`${path.relative(root, file)} is not the canonical search-first homepage`);
  }
  const safetyLinks = [
    ['live-intel.html', 'Live Intel'],
    ['independent-links.html', 'Independent Research'],
    ['security-privacy.html', 'Security Tools'],
    ['dark-web-safety.html', 'Dark Web Safety']
  ].filter(([href]) => !before.includes(`href="${href}"`));
  let after = before;
  if (safetyLinks.length) {
    const insertion = safetyLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
    after = after.replace(/(<div class="accountability-nav-drawer">)/, `$1${insertion}`);
  }
  if (!after.includes('live-intel-machine-route')) {
    after = after.replace(
      '<div class="accountability-nav-drawer">',
      '<div class="accountability-nav-drawer live-intel-machine-route">'
    );
  }
  if (!after.includes('href="live-intel.html"') || !after.includes('live-intel-machine-route')) {
    throw new Error(`${path.relative(root, file)} failed to preserve the Live Intel route contract`);
  }
  if (after !== before) fs.writeFileSync(file, after);
}

function patchMoneyRoutes(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes('class="accountability-home"') || !before.includes('href="follow-the-money.html"')) {
    throw new Error(`${path.relative(root, file)} is missing the canonical Follow the Money route`);
  }
  let after = before;
  if (!after.includes('href="making-money.html"')) {
    const target = '<a href="follow-the-money.html">Follow the Money</a>';
    if (!after.includes(target)) throw new Error(`${path.relative(root, file)} has no stable Follow the Money navigation anchor`);
    after = after.replace(target, `${target}<a href="making-money.html">Making Money</a>`);
  }
  if (!after.includes('href="making-money.html"')) {
    throw new Error(`${path.relative(root, file)} failed to preserve the Making Money route`);
  }
  if (after !== before) fs.writeFileSync(file, after);
}

function copy(relative) {
  if (!fs.existsSync(outputRoot)) return;
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) throw new Error(`Homepage release output missing: ${relative}`);
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  copied.push(relative);
  if (relative === 'index.html') {
    const extensionless = path.join(outputRoot, 'index');
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}

function requireMarker(relative, marker, base = root) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) throw new Error(`Missing release homepage file: ${path.relative(root, file)}`);
  const present = fs.readFileSync(file, 'utf8').includes(marker);
  checks.push({ file: path.relative(root, file), marker, present });
  if (!present) throw new Error(`${path.relative(root, file)} missing required marker: ${marker}`);
}

run('scripts/finalize-search-first-accountability-home.js');
run('scripts/refine-accountability-question-ledger.js');
run('scripts/install-reverse-accountability-platform.js');
run('scripts/reverse-accountability-platform-pressure-test.js');
// The intro release test also validates the cumulative, server-gated membership
// surface. Broad legacy generators can replace membership.html, so restore its
// canonical owner immediately before the combined intro/membership validation.
run('scripts/patch-membership-tiers.js');
run('scripts/patch-homepage-construction-banner.js');
run('scripts/patch-homepage-mask-intro.js');
run('scripts/homepage-mask-intro-test.js');
// Legacy public-surface generators can leave dynamically populated pages without
// a static visible H1. Reconcile document hierarchy in source and Cloudflare output
// before the exhaustive public audit and production deploy guard.
run('scripts/reconcile-public-page-headings.js');
run('scripts/reconcile-public-audit-boundaries.js');

patchSafetyRoutes(path.join(root, 'index.html'));
patchMoneyRoutes(path.join(root, 'index.html'));

for (const relative of [
  'index.html','accountability-home.css','accountability-home.js','search-query-handoff.js','search.html',
  'welcome-gate.css','welcome-gate.js','homepage-mask-intro.css','homepage-mask-intro.js','homepage-mask-intro-data.js',
  'reverse-accountability-search.html','reverse-accountability-search.css','reverse-accountability-search.js',
  'data/accountability-question-ledger.json','data/reverse-accountability-index.json',
  'downloads/search-first-accountability-home-report.json','downloads/reverse-accountability-platform-report.json','downloads/homepage-mask-intro-report.json'
]) copy(relative);

if (fs.existsSync(outputRoot)) {
  patchSafetyRoutes(path.join(outputRoot, 'index.html'));
  patchMoneyRoutes(path.join(outputRoot, 'index.html'));
}

if (hitListPresent) {
  run('scripts/search-first-accountability-home-pressure-test.js');
} else {
  recordPrebuildSkip(
    'scripts/search-first-accountability-home-pressure-test.js',
    'data/cinematic-hit-list.json is not generated in this metadata-only pre-build workflow; exact homepage markers and downstream metadata gates remain enforced.'
  );
}

for (const [relative, marker] of [
  ['index.html', 'My Watchlist'],['index.html', 'id="accountability-search"'],['index.html', 'action="search.html" method="get"'],
  ['index.html', 'name="q"'],['index.html', 'accountability-home.js'],['index.html', 'href="follow-the-money.html"'],
  ['index.html', 'href="making-money.html"'],['index.html', 'href="live-intel.html"'],['index.html', 'live-intel-machine-route'],
  ['index.html', 'href="independent-links.html"'],['index.html', 'href="security-privacy.html"'],['index.html', 'href="dark-web-safety.html"'],
  ['index.html', 'data-homepage-mask-intro'],['index.html', 'welcome-gate.js'],['index.html', 'id="matrix-construction-banner"'],
  ['search.html', 'search-query-handoff.js'],['search-query-handoff.js', "new URLSearchParams(location.search).get('q')"],
  ['daily-watch.html', '<h1 id="daily-hit-list-title">'],['heroes-fighting-matrix-card.html', 'id="heroes-card-page-title"']
]) requireMarker(relative, marker);

if (fs.existsSync(outputRoot)) {
  for (const [relative, marker] of [
    ['index.html', 'My Watchlist'],['index.html', 'id="accountability-search"'],['index.html', 'name="q"'],
    ['index.html', 'href="follow-the-money.html"'],['index.html', 'href="making-money.html"'],['index.html', 'href="live-intel.html"'],
    ['index.html', 'live-intel-machine-route'],['index.html', 'href="independent-links.html"'],['index.html', 'data-homepage-mask-intro'],
    ['search.html', 'search-query-handoff.js'],['search-query-handoff.js', "new URLSearchParams(location.search).get('q')"],
    ['daily-watch.html', '<h1 id="daily-hit-list-title">'],['heroes-fighting-matrix-card.html', 'id="heroes-card-page-title"']
  ]) requireMarker(relative, marker, outputRoot);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  canonicalOwner: 'scripts/finalize-search-first-accountability-home.js',
  membershipOwner: 'scripts/patch-membership-tiers.js',
  publicHeadingOwner: 'scripts/reconcile-public-page-headings.js',
  hitListPresent,
  orderingRule: 'Broad generators first; canonical cumulative membership, search-first homepage, public H1 hierarchy, Live Intel, independent research, money routes, reverse-accountability entry, construction banner and video intro last. The full search-pressure test is mandatory whenever its generated hit-list input exists; metadata-only pre-builds retain exact marker checks without inventing fixture data.',
  commands,
  copied: [...new Set(copied)],
  checks
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot)) {
  fs.mkdirSync(path.join(outputRoot, 'downloads'), { recursive: true });
  fs.copyFileSync(reportPath, path.join(outputRoot, 'downloads', path.basename(reportPath)));
}
console.log('Release homepage order reconciled: cumulative membership, public H1 hierarchy, My Watchlist, q= search handoff, Live Intel, independent research, money routes, construction banner and intro are canonical across source and Cloudflare output.');
