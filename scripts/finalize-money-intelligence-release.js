const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'money-intelligence-finalize.json');
const report = { ok: true, generatedAt: new Date().toISOString(), commands: [], copied: [], linkedPages: [], checks: [] };

function persist() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
function fail(message) {
  report.ok = false;
  report.error = message;
  persist();
  throw new Error(message);
}
function run(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 40
  });
  report.commands.push({ script, status: result.status, stdout: String(result.stdout || '').slice(-2500), stderr: String(result.stderr || '').slice(-2500) });
  if (result.status !== 0) fail(`${script} failed: ${result.stderr || result.stdout}`);
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function copyFile(rel) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) fail(`Missing money release file: ${rel}`);
  const dest = path.join(site, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  report.copied.push(rel);
  if (rel.endsWith('.html')) {
    const routeRel = rel.replace(/\.html$/i, '');
    const route = path.join(site, routeRel);
    const sourceDirectory = path.join(root, routeRel);
    // A route such as follow-the-money.html also owns a real directory containing
    // people and category pages. Remove any stale extensionless file left by an
    // older build so that the real directory can be copied safely.
    const conflictsWithSourceDirectory = fs.existsSync(sourceDirectory) && fs.statSync(sourceDirectory).isDirectory();
    if (conflictsWithSourceDirectory) {
      if (fs.existsSync(route) && fs.statSync(route).isFile()) fs.unlinkSync(route);
    } else if (!(fs.existsSync(route) && fs.statSync(route).isDirectory())) {
      fs.copyFileSync(src, route);
    }
  }
}
function copyTree(rel) {
  const srcRoot = path.join(root, rel);
  if (!fs.existsSync(srcRoot)) fail(`Missing money release directory: ${rel}`);
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    const child = path.join(rel, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) copyTree(child);
    else copyFile(child);
  }
}
function walkLinkedPages(dir) {
  const blocked = new Set(['.git', '.github', 'node_modules', 'scripts', '_site', 'evidence-archive', 'source-snapshots', 'browsertrix-output', 'tools', 'templates']);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (blocked.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkLinkedPages(full);
    else if (entry.name.endsWith('.html')) {
      const rel = path.relative(root, full).replace(/\\/g, '/');
      const html = fs.readFileSync(full, 'utf8');
      if (html.includes('href="making-money.html"') || html.includes('href="follow-the-money.html"') || html.includes('data-money-system-callout')) {
        copyFile(rel);
        report.linkedPages.push(rel);
      }
    }
  }
}
function requireText(rel, marker, fromSite = false) {
  const file = path.join(fromSite ? site : root, rel);
  const ok = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(marker);
  report.checks.push({ rel: `${fromSite ? '_site/' : ''}${rel}`, marker, ok });
  if (!ok) fail(`${fromSite ? '_site/' : ''}${rel} missing ${marker}`);
}
function requireBytes(rel, minimum) {
  const file = path.join(site, rel);
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  const ok = size >= minimum;
  report.checks.push({ rel: `_site/${rel}`, minimumBytes: minimum, size, ok });
  if (!ok) fail(`_site/${rel} missing or too small`);
}

if (!fs.existsSync(site)) fail('_site does not exist; normal Cloudflare output must run first.');

run('scripts/build-money-intelligence-system.js');
run('scripts/money-intelligence-system-test.js');
run('scripts/repair-search-system.js');
run('scripts/build-search-v3-index.js');
run('scripts/build-search-v3-runtime.js');

for (const rel of [
  'follow-the-money.html', 'follow-the-money-methodology.html', 'follow-the-money.js',
  'making-money.html', 'making-money.js', 'money-intelligence.css',
  'data/follow-the-money-top-100.json', 'data/follow-the-money-top-100.schema.json',
  'data/making-money-core.json', 'data/making-money.schema.json',
  'follow-the-money/making-money.html', 'search.html', 'search.js', 'search-index.json', 'data/search-facets.json'
]) copyFile(rel);
copyTree('follow-the-money/people');
copyTree('downloads/wealth-guides');
walkLinkedPages(root);

requireText('follow-the-money.html', "World's Top 100 Wealth Holders");
requireText('making-money.html', 'Starting From Zero');
requireText('making-money.html', 'Future of Making Money');
requireText('making-money.html', 'Free PDF Guides');
requireText('index.html', 'making-money.html');
requireText('index.html', 'follow-the-money.html');
requireText('search-index.json', 'making-money.html');
requireText('follow-the-money.html', "World's Top 100 Wealth Holders", true);
requireText('making-money.html', 'Starting From Zero', true);
requireText('index.html', 'making-money.html', true);
requireText('index.html', 'follow-the-money.html', true);
requireText('search-index.json', 'making-money.html', true);
requireBytes('follow-the-money/people/elon-musk.html', 700);
requireBytes('downloads/wealth-guides/start-from-zero.pdf', 500);

persist();
console.log(`Money intelligence finalization passed: ${report.copied.length} assets copied, ${report.linkedPages.length} linked pages preserved.`);
