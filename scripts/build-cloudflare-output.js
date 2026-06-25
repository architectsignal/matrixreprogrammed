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
    return false;
  }
  ensure(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}
function copyHtmlRouteVariants(src, rel) {
  if (!rel.endsWith('.html')) return;
  if (rel === 'index.html') {
    copyFile(src, path.join(out, 'index'), 'index');
    return;
  }
  const noExt = rel.replace(/\.html$/i, '');
  copyFile(src, path.join(out, noExt), noExt);
  copyFile(src, path.join(out, noExt, 'index.html'), `${noExt}/index.html`);
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (!shouldCopy(rel, entry)) continue;
    if (entry.isDirectory()) walk(full);
    else {
      const copied = copyFile(full, path.join(out, rel), rel);
      if (copied) copyHtmlRouteVariants(full, rel);
    }
  }
}

rm(out);
ensure(out);
walk(root);

for (const required of [
  'index.html', 'index',
  'start-here.html', 'start-here', 'start-here/index.html',
  'books.html', 'books', 'books/index.html',
  'epstein-files.html', 'epstein-files', 'epstein-files/index.html',
  'live-intel.html', 'live-intel', 'live-intel/index.html',
  'search.html', 'search', 'search/index.html',
  '_redirects', '_headers'
]) {
  if (!fs.existsSync(path.join(out, required))) {
    console.error(`Cloudflare output failed: _site/${required} missing`);
    process.exit(1);
  }
}
const count = [];
(function countFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) countFiles(full);
    else count.push(full);
  }
})(out);
console.log(`Cloudflare output ready: ${count.length} deployable files copied to _site without node_modules, including extensionless and folder-index HTML assets.`);
