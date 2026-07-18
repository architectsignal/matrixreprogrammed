const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const deploy = path.resolve(root, process.env.DEPLOY_DIR || '_site');
const expectedSha = String(process.env.EXPECTED_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || '').trim();
const problems = [];
const warnings = [];
const stats = { files: 0, html: 0, anchors: 0, pdf: 0, json: 0, textDownloads: 0, extensionlessPairs: 0 };

function fail(message) { problems.push(message); }
function warn(message) { warnings.push(message); }
function slash(value) { return value.split(path.sep).join('/'); }
function rel(file) { return slash(path.relative(deploy, file)); }
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files); else files.push(full);
  }
  return files;
}
function directoryHash(dir) {
  const hash = crypto.createHash('sha256');
  for (const file of walk(dir).sort()) {
    hash.update(rel(file)); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function attrs(html, name) {
  const values = [];
  const regex = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'gi');
  let match; while ((match = regex.exec(html))) values.push(match[2]);
  return values;
}
function ids(html) { return attrs(html, 'id'); }
function routeFor(file) {
  let value = rel(file);
  if (value === 'index.html' || value === 'index') return '/';
  return `/${value.replace(/\.html$/i, '')}`;
}
function resolveLocal(from, href) {
  const raw = href.split('#')[0].split('?')[0];
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (decoded.startsWith('/')) return path.join(deploy, decoded.replace(/^\/+/, ''));
  return path.resolve(path.dirname(from), decoded);
}
function existingTarget(base) {
  const candidates = [base];
  if (!path.extname(base)) candidates.push(`${base}.html`, path.join(base, 'index.html'));
  if (base.endsWith('.html')) candidates.push(base.replace(/\.html$/i, ''));
  return candidates.find(candidate => fs.existsSync(candidate));
}
function checkAnchors(file, html, idSet) {
  const hrefs = attrs(html, 'href');
  for (const href of hrefs) {
    stats.anchors += 1;
    if (!href || /^(?:https?:|mailto:|tel:|sms:|data:|javascript:)/i.test(href)) continue;
    if (href.startsWith('#')) {
      const fragment = decodeURIComponent(href.slice(1));
      if (fragment && !idSet.has(fragment)) fail(`${rel(file)}: missing local fragment #${fragment}`);
      continue;
    }
    let target;
    try { target = resolveLocal(file, href); } catch { fail(`${rel(file)}: malformed href ${href}`); continue; }
    const found = existingTarget(target);
    if (!found) { fail(`${rel(file)}: broken local link ${href}`); continue; }
    const fragment = href.includes('#') ? decodeURIComponent(href.split('#').slice(1).join('#')) : '';
    if (fragment && /\.html$|^[^.]+$/i.test(found)) {
      const targetHtml = fs.readFileSync(found, 'utf8');
      if (!new Set(ids(targetHtml)).has(fragment)) fail(`${rel(file)}: ${href} points to missing fragment #${fragment}`);
    }
  }
}
function checkAccessibility(file, html) {
  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) fail(`${rel(file)}: html lang missing`);
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) fail(`${rel(file)}: viewport meta missing`);
  if (!/<title\b[^>]*>\s*[^<]+/i.test(html)) fail(`${rel(file)}: title missing or empty`);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count === 0) warn(`${rel(file)}: no h1`);
  if (h1Count > 1) warn(`${rel(file)}: multiple h1 elements (${h1Count})`);
  const allIds = ids(html); const seen = new Set();
  for (const id of allIds) { if (seen.has(id)) fail(`${rel(file)}: duplicate id ${id}`); seen.add(id); }
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  for (const tag of images) if (!/\balt\s*=\s*(["']).*?\1/i.test(tag)) fail(`${rel(file)}: image missing alt attribute`);
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
  for (const match of buttons) if (!visibleText(match[0]) && !/aria-label=["'][^"']+/i.test(match[0])) fail(`${rel(file)}: button has no accessible name`);
  const inputs = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)].map(match => match[0]);
  for (const tag of inputs) {
    if (/type=["']hidden["']/i.test(tag)) continue;
    const id = (tag.match(/\bid=["']([^"']+)/i) || [])[1];
    const named = /aria-label=["'][^"']+|aria-labelledby=["'][^"']+|title=["'][^"']+/i.test(tag) || (id && new RegExp(`<label\\b[^>]*for=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html));
    if (!named) warn(`${rel(file)}: form control may lack an accessible label${id ? ` (#${id})` : ''}`);
  }
}
function checkCopy(file, html) {
  const text = visibleText(html);
  if (/preservedaftervisible(?:-)?de-duplication/i.test(html)) fail(`${rel(file)}: preservedaftervisible de-duplication marker visible`);
  if (/\b(?:lorem ipsum|todo:|fixme:|placeholder text|coming soon\.\.\.)\b/i.test(text)) fail(`${rel(file)}: placeholder copy detected`);
  if (/\{\{[^{}]+\}\}|\[\[[^\[\]]+\]\]/.test(text)) fail(`${rel(file)}: unresolved template token detected`);
  if (/\\n/.test(text)) fail(`${rel(file)}: escaped newline visible to readers`);
  if (/\b(?:undefined|null|NaN)\b/.test(text)) fail(`${rel(file)}: malformed runtime value visible`);
  for (const marker of ['page-guide:start', 'reader-governor:start', 'compatibility-marker-vault']) {
    const count = (html.match(new RegExp(marker, 'g')) || []).length;
    if (count > 1) fail(`${rel(file)}: duplicated template block ${marker} (${count})`);
  }
  if (/\b(?:Daily|Live|Latest|Weekly)\b/i.test((html.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || '') && !html.includes('data-site-freshness-label')) fail(`${rel(file)}: freshness label missing`);
}
function checkCanonical(file, html) {
  const match = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
  if (!match) return fail(`${rel(file)}: canonical link missing`);
  const expected = `https://matrixreprogrammed.com${routeFor(file)}`;
  if (match[1] !== expected) fail(`${rel(file)}: canonical ${match[1]} does not match ${expected}`);
  if (rel(file).endsWith('.html')) {
    const extensionless = file.replace(/\.html$/i, '');
    if (!fs.existsSync(extensionless)) fail(`${rel(file)}: extensionless route copy missing`); else stats.extensionlessPairs += 1;
  }
}
function checkDashboard(file, html) {
  if (!/case-status-dashboard(?:\.html)?$/i.test(file)) return;
  if (/Loading boundary|Loading lanes|data\.book\s+links|STATUS FROM CORE\\n/i.test(html)) fail(`${rel(file)}: broken dashboard placeholder/syntax remains`);
  for (const id of ['counts', 'grades', 'next']) {
    const section = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
    if (!section || !visibleText(section[1])) fail(`${rel(file)}: core section #${id} is empty`);
  }
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean).join('\n');
  try { new Function(scripts); } catch (error) { fail(`${rel(file)}: inline JavaScript syntax error: ${error.message}`); }
}
function checkDownload(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    stats.pdf += 1;
    const buf = fs.readFileSync(file);
    if (buf.length < 100 || buf.slice(0, 5).toString() !== '%PDF-') fail(`${rel(file)}: invalid or empty PDF`);
  } else if (ext === '.json') {
    stats.json += 1;
    try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail(`${rel(file)}: invalid JSON: ${error.message}`); }
  } else if (['.txt', '.md'].includes(ext)) {
    stats.textDownloads += 1;
    if (!fs.readFileSync(file, 'utf8').trim()) fail(`${rel(file)}: empty downloadable ${ext.slice(1).toUpperCase()}`);
  }
}
function needRepoFile(name, markers = []) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return fail(`repository requirement missing: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of markers) if (!text.includes(marker)) fail(`${name}: missing required gate marker ${marker}`);
}

if (!fs.existsSync(deploy) || !fs.statSync(deploy).isDirectory()) {
  console.error(`RELEASE ACCEPTANCE FAILED: deploy directory not found: ${deploy}`);
  process.exit(1);
}
const beforeHash = directoryHash(deploy);
const files = walk(deploy); stats.files = files.length;
for (const file of files) {
  checkDownload(file);
  if (!isHtmlFile(file)) continue;
  stats.html += 1;
  const html = fs.readFileSync(file, 'utf8');
  const idSet = new Set(ids(html));
  checkCopy(file, html);
  checkAccessibility(file, html);
  checkCanonical(file, html);
  checkDashboard(file, html);
  checkAnchors(file, html, idSet);
}

const provenancePath = path.join(deploy, 'build-provenance.json');
if (!fs.existsSync(provenancePath)) fail('build-provenance.json missing from deploy directory');
else {
  try {
    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    if (!provenance.sourceSha || provenance.sourceSha === 'local') fail('build provenance has no immutable source SHA');
    if (expectedSha && provenance.sourceSha !== expectedSha) fail(`build provenance SHA ${provenance.sourceSha} does not equal expected passing SHA ${expectedSha}`);
  } catch (error) { fail(`build provenance invalid: ${error.message}`); }
}

needRepoFile('wrangler.jsonc', ['"PAYPAL_ENVIRONMENT": "sandbox"', '"PAYPAL_PRODUCTION_ENABLED": "false"', '"PAYPAL_SANDBOX_ENABLED": "true"', '"binding": "MEMBERS_DB"']);
needRepoFile('src/worker-paypal-subscriptions.js', ['PAYPAL_PRODUCTION_ENABLED', 'PAYPAL_LIVE_ACTIVATION_CONFIRMATION', '/api/paypal/webhook', '/api/paypal/subscription/cancel']);
needRepoFile('src/worker.js', ['selfOnlyForMembers:true', "minimumTier:'intelligence_6'", 'osint-tools-v1: encrypted D1 jobs']);
needRepoFile('migrations/0001_membership_foundation.sql', ['CREATE TABLE']);
needRepoFile('migrations/phase5_member_experience.sql', ['entitlement']);
needRepoFile('migrations/phase6_paypal_subscriptions.sql', ['paypal_runtime_settings', 'paypal_subscription_transitions']);
needRepoFile('analytics.js');
for (const required of ['trust-privacy-policy.html', 'newsletter.html', 'unsubscribe.html', 'preferences.html']) if (!fs.existsSync(path.join(deploy, required)) && !fs.existsSync(path.join(deploy, required.replace(/\.html$/, '')))) fail(`deploy missing privacy/consent surface: ${required}`);
for (const report of ['downloads/cloudflare-worker-routes-test.json', 'downloads/osint-tools-test.json', 'downloads/login-email-resend-test.json', 'downloads/site-wide-function-audit.json']) if (!fs.existsSync(path.join(root, report))) fail(`required gate report missing: ${report}`);

const afterHash = directoryHash(deploy);
if (beforeHash !== afterHash) fail(`acceptance test mutated deploy directory (${beforeHash} -> ${afterHash})`);

const result = { ok: problems.length === 0, expectedSha: expectedSha || null, deployDirectory: slash(path.relative(root, deploy)), deployHash: beforeHash, stats, warnings: warnings.slice(0, 500), problems: problems.slice(0, 1000) };
if (problems.length) {
  console.error('\nFINAL NON-MUTATING DEPLOY ACCEPTANCE FAILED\n');
  problems.slice(0, 200).forEach(problem => console.error(`- ${problem}`));
  console.error(`\n${problems.length} problem(s), ${warnings.length} warning(s). Deploy hash: ${beforeHash}`);
  process.exit(1);
}
console.log('FINAL NON-MUTATING DEPLOY ACCEPTANCE PASSED');
console.log(JSON.stringify(result, null, 2));
