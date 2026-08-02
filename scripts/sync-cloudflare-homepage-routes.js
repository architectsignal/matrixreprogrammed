'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const source = path.join(root, 'index.html');
const outputRoot = path.join(root, '_site');
const routes = [path.join(outputRoot, 'index.html'), path.join(outputRoot, 'index')];

if (!fs.existsSync(source)) throw new Error('Canonical index.html is missing.');
if (!fs.existsSync(outputRoot)) {
  console.log('Cloudflare homepage route sync skipped: _site does not exist.');
  process.exit(0);
}

const html = fs.readFileSync(source, 'utf8');
for (const marker of ['POWER SHOULD HAVE', 'id="accountability-search"', 'THE ACCOUNTABILITY HIT LIST', 'THE OPEN QUESTION LEDGER']) {
  if (!html.includes(marker)) throw new Error(`Canonical index.html is missing search-first marker: ${marker}`);
}
for (const stale of ['MAP THE STRUCTURE', 'READ THE SIGNALS', 'homepage-command-surface']) {
  if (html.includes(stale)) throw new Error(`Canonical index.html still contains stale homepage marker: ${stale}`);
}

for (const destination of routes) fs.writeFileSync(destination, html);
for (const destination of routes) {
  if (fs.readFileSync(destination, 'utf8') !== html) throw new Error(`${path.relative(root, destination)} diverges from canonical index.html.`);
}

const digest = crypto.createHash('sha256').update(html).digest('hex');
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  canonical: 'index.html',
  routes: ['/', '/index', '/index.html'],
  sha256: digest,
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'cloudflare-homepage-route-sync.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Cloudflare homepage routes synchronized: /, /index and /index.html (${digest.slice(0, 12)}).`);
