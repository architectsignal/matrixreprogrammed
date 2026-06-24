const fs = require('fs');
const path = require('path');

const root = process.cwd();
const out = path.join(root, '_site');
const allowedExt = new Set([
  '.html', '.css', '.js', '.json', '.xml', '.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.gif', '.mp4', '.webm', '.woff', '.woff2'
]);
const allowedRootFiles = new Set([
  '_redirects', '_headers', 'robots.txt', 'llms.txt', 'sitemap.xml', 'site-graph.json', 'claim-taxonomy.json', 'crawler-map.json', 'search-index.json', 'sigil.png', 'matrix.js', 'styles.css', 'fixes.css'
]);
const blockedDirs = new Set(['.git', '.github', 'node_modules', 'scripts', 'netlify', '_site']);
const blockedFiles = new Set(['package.json', 'package-lock.json', 'bun.lock', 'netlify.toml', 'wrangler.jsonc', 'CLOUDFLARE_PAGES_SETUP.md']);
const maxAssetBytes = 25 * 1024 * 1024;

function rm(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function shouldCopy(rel, entry) {
  if (entry.isDirectory()) return !blockedDirs.has(entry.name);
  const base = path.basename(rel);
  if (blockedFiles.has(base)) return false;
  if (allowedRootFiles.has(base)) return true;
  const ext = path.extname(base).toLowerCase();
  return allowedExt.has(ext);
}
function copyFile(src, dest, rel) {
  const size = fs.statSync(src).size;
  if (size > maxAssetBytes) {
    console.warn(`Skipping oversized Cloudflare asset (${Math.round(size / 1024 / 1024)} MiB): ${rel}`);
    return;
  }
  ensure(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (!shouldCopy(rel, entry)) continue;
    if (entry.isDirectory()) walk(full);
    else copyFile(full, path.join(out, rel), rel);
  }
}

rm(out);
ensure(out);
walk(root);

if (!fs.existsSync(path.join(out, 'index.html'))) {
  console.error('Cloudflare output failed: _site/index.html missing');
  process.exit(1);
}
if (!fs.existsSync(path.join(out, '_redirects'))) {
  console.error('Cloudflare output failed: _site/_redirects missing');
  process.exit(1);
}
if (!fs.existsSync(path.join(out, '_headers'))) {
  console.error('Cloudflare output failed: _site/_headers missing');
  process.exit(1);
}
const count = [];
(function countFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) countFiles(full);
    else count.push(full);
  }
})(out);
console.log(`Cloudflare output ready: ${count.length} deployable files copied to _site without node_modules.`);
