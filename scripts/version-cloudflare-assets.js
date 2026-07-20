const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'cloudflare-asset-versioning.json');

if (!fs.existsSync(site)) throw new Error('_site is missing; build Cloudflare output before asset versioning');

function run(script) {
  execFileSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
}

// Cache policy, runtime optimization, performance budgets and asset fingerprinting
// are one final Cloudflare contract. Standard CI and production therefore test the
// same deployable bundle rather than relying on production-only reconciliation.
run('scripts/enforce-production-cache-policy.js');
run('scripts/apply-runtime-performance-optimizations.js');
run('scripts/runtime-performance-budget-test.js');

function posix(value) { return String(value || '').replace(/\\/g, '/'); }
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}
function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}
function isHtmlLike(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return true;
  if (ext) return false;
  const head = fs.readFileSync(file, 'utf8').slice(0, 300).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}
function splitReference(reference) {
  const fragmentIndex = reference.indexOf('#');
  const fragment = fragmentIndex >= 0 ? reference.slice(fragmentIndex) : '';
  const withoutFragment = fragmentIndex >= 0 ? reference.slice(0, fragmentIndex) : reference;
  const queryIndex = withoutFragment.indexOf('?');
  return {
    pathname: queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment,
    query: queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : '',
    fragment
  };
}
function resolveLocal(pageRel, reference) {
  if (!reference || /^(?:[a-z]+:)?\/\//i.test(reference) || /^(?:data|blob|mailto|tel|javascript):/i.test(reference)) return null;
  const { pathname } = splitReference(reference);
  if (!/\.(?:js|css)$/i.test(pathname)) return null;
  const target = pathname.startsWith('/')
    ? path.posix.normalize(pathname.replace(/^\/+/, ''))
    : path.posix.normalize(path.posix.join(path.posix.dirname(pageRel), pathname));
  if (!target || target.startsWith('../') || target.includes('/../')) return null;
  return target;
}
function withVersion(reference, version) {
  const { pathname, query, fragment } = splitReference(reference);
  const params = new URLSearchParams(query);
  params.set('v', version);
  const queryText = params.toString();
  return `${pathname}${queryText ? `?${queryText}` : ''}${fragment}`;
}
function parseHeaderBlocks(text) {
  const blocks = new Map();
  let route = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^\//.test(line.trim())) {
      route = line.trim();
      if (!blocks.has(route)) blocks.set(route, []);
      continue;
    }
    if (route) blocks.get(route).push(line);
  }
  return blocks;
}

const files = walk(site);
const assets = new Map();
for (const file of files) {
  const rel = posix(path.relative(site, file));
  if (/\.(?:js|css)$/i.test(rel)) assets.set(rel, hashFile(file));
}

let pagesScanned = 0;
let pagesChanged = 0;
let referencesVersioned = 0;
const unresolved = [];
const unversioned = [];

function rewriteTag(tag, pageRel, attribute) {
  return tag.replace(new RegExp(`\\b${attribute}=(['\"])([^'\"]+)\\1`, 'i'), (match, quote, reference) => {
    const target = resolveLocal(pageRel, reference);
    if (!target) return match;
    const version = assets.get(target);
    if (!version) {
      unresolved.push({ page: pageRel, reference, target });
      return match;
    }
    const next = withVersion(reference, version);
    if (next !== reference) referencesVersioned++;
    return `${attribute}=${quote}${next}${quote}`;
  });
}

for (const file of files.filter(isHtmlLike)) {
  const pageRel = posix(path.relative(site, file));
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(/<script\b[^>]*\bsrc=(['"])[^'"]+\1[^>]*>/gi, tag => rewriteTag(tag, pageRel, 'src'));
  after = after.replace(/<link\b[^>]*\bhref=(['"])[^'"]+\1[^>]*>/gi, tag => rewriteTag(tag, pageRel, 'href'));
  pagesScanned++;
  if (after !== before) {
    fs.writeFileSync(file, after);
    pagesChanged++;
  }
  for (const match of after.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=(['"])([^'"]+\.(?:js|css)(?:\?[^'"]*)?(?:#[^'"]*)?)\1/gi)) {
    const reference = match[2];
    const target = resolveLocal(pageRel, reference);
    if (target && assets.has(target) && !/[?&]v=[0-9a-f]{12}(?:&|$)/i.test(reference)) unversioned.push({ page: pageRel, reference, target });
  }
}

const headers = fs.existsSync(path.join(site, '_headers')) ? fs.readFileSync(path.join(site, '_headers'), 'utf8') : '';
const headerBlocks = parseHeaderBlocks(headers);
const unsafeImmutable = [...headerBlocks.entries()].some(([route, lines]) =>
  /^\/\*\.(?:js|css)$/i.test(route) && /max-age=31536000[^\n]*immutable/i.test(lines.join('\n'))
);
const report = {
  ok: unresolved.length === 0 && unversioned.length === 0 && !unsafeImmutable,
  generatedAt: new Date().toISOString(),
  assetCount: assets.size,
  pagesScanned,
  pagesChanged,
  referencesVersioned,
  unresolved: unresolved.slice(0, 200),
  unversioned: unversioned.slice(0, 200),
  unsafeImmutable,
  cachePolicyOwner: 'scripts/enforce-production-cache-policy.js',
  performanceOwner: 'scripts/apply-runtime-performance-optimizations.js',
  performanceBudget: 'scripts/runtime-performance-budget-test.js',
  cacheBlocksChecked: [...headerBlocks.keys()],
  boundary: 'Every local JavaScript and stylesheet reference in Cloudflare output receives a content hash. The exact optimized bundle passes performance budgets before fingerprinting, while unversioned scripts and styles use revalidation rather than year-long immutable caching.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  if (unsafeImmutable) console.error('Cloudflare asset versioning failed: the JavaScript or CSS header block itself applies year-long immutable caching.');
  unresolved.slice(0, 20).forEach(item => console.error(`Unresolved asset reference: ${item.page} -> ${item.reference} (${item.target})`));
  unversioned.slice(0, 20).forEach(item => console.error(`Unversioned asset reference: ${item.page} -> ${item.reference}`));
  process.exit(1);
}
console.log(`Cloudflare assets versioned: ${referencesVersioned} reference(s) across ${pagesChanged}/${pagesScanned} page(s); ${assets.size} JS/CSS asset(s) fingerprinted after the optimized bundle passed its performance budget.`);
