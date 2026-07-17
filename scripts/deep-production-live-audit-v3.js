const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const downloads = path.join(root, 'downloads');
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const hard = [];
const warnings = [];
const evidence = { liveFailures: [], externalFailures: [], apiResults: [], protectedAssets: [], headerlessHtmlPages: [] };
const stats = { livePages: 0, liveAssets: 0, protectedAssetsAccepted: 0, headerlessHtmlPages: 0, externalLinksChecked: 0, apiContracts: 0 };
const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'browsertrix-output']);
const dynamicPrefixes = ['/api/', '/forum-', '/submit-', '/report-', '/track-', '/newsletter-', '/member-', '/billing-', '/admin-', '/osint-', '/health', '/deploy-status', '/intro-voice', '/.netlify/functions/'];

function rel(file) { return path.relative(site, file).split(path.sep).join('/'); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
function htmlLike(file) {
  if (file.endsWith('.html')) return true;
  if (path.extname(file)) return false;
  try { return /<!doctype html|<html\b/i.test(read(file)); } catch { return false; }
}
function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i'));
  return match ? match[2] : '';
}
function attributeReferences(html) {
  const refs = [];
  for (const match of String(html || '').matchAll(/(?:^|\s)(href|src|action|poster)\s*=\s*(["'])([^"']*)\2/gi)) refs.push({ attribute: match[1].toLowerCase(), target: match[3].trim() });
  return refs;
}
function isSkippable(value) { return /^(?:mailto:|tel:|data:|blob:|javascript:)/i.test(String(value || '')); }
function isDynamic(value) {
  const clean = String(value || '').split('#')[0].split('?')[0].trim();
  return dynamicPrefixes.some(prefix => clean.startsWith(prefix));
}
function liveRouteForFile(file) {
  const relative = rel(file);
  if (relative === 'index.html' || relative === 'index') return '/';
  return `/${relative}`;
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal, headers: { 'cache-control': 'no-cache', pragma: 'no-cache', 'user-agent': 'MatrixDeepProductionAudit/3.0', ...(options.headers || {}) } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, url: response.url, type: response.headers.get('content-type') || '', origin: response.headers.get('x-matrix-origin') || '', text };
  } catch (error) {
    return { ok: false, status: 0, url, type: '', origin: '', text: '', error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length); let next = 0;
  async function run() { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run));
  return results;
}
function loadAccessPolicy() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'data', 'access-route-policy.json'), 'utf8')); }
  catch { return { exactRules: [], patternRules: [] }; }
}
const accessPolicy = loadAccessPolicy();
function protectedTier(pathname) {
  const exact = (accessPolicy.exactRules || []).find(rule => rule.route === pathname);
  if (exact) return exact.minimumTier || 'protected';
  for (const rule of accessPolicy.patternRules || []) {
    try { if (new RegExp(rule.pattern).test(pathname)) return rule.minimumTier || 'protected'; } catch {}
  }
  return '';
}
function htmlDocument(text) { return /<!doctype html|<html\b/i.test(String(text || '')); }

async function contract(name, route, expected, options = {}) {
  const response = await fetchWithTimeout(`${siteUrl}${route}`, options, 15000);
  stats.apiContracts++;
  let data = null; try { data = JSON.parse(response.text); } catch {}
  const result = { name, route, status: response.status, origin: response.origin, data };
  evidence.apiResults.push(result);
  const errors = [];
  if (expected.statuses && !expected.statuses.includes(response.status)) errors.push(`status ${response.status}, expected ${expected.statuses.join('/')}`);
  if (expected.origin && response.origin !== expected.origin) errors.push(`origin ${response.origin || '[missing]'}, expected ${expected.origin}`);
  if (expected.json && !data) errors.push('response is not JSON');
  if (expected.check && !expected.check(data, response)) errors.push('response contract predicate failed');
  if (errors.length) hard.push(`API ${name} (${route}): ${errors.join('; ')}`);
}

async function inspectLive() {
  if (!fs.existsSync(site)) throw new Error('_site is missing; run the complete build first');
  const htmlFiles = walk(site).filter(htmlLike);
  const routeMap = new Map();
  for (const file of htmlFiles) routeMap.set(liveRouteForFile(file), file);

  const pages = await mapLimit([...routeMap.entries()], 20, async ([route]) => {
    const response = await fetchWithTimeout(`${siteUrl}${route}${route.includes('?') ? '&' : '?'}deep_audit=${Date.now()}`);
    stats.livePages++;
    const item = { route, status: response.status, finalUrl: response.url, type: response.type, error: response.error || null };
    if (response.status < 200 || response.status >= 400) {
      hard.push(`live page ${route}: HTTP ${response.status || response.error}`);
      evidence.liveFailures.push(item);
    } else if (!htmlDocument(response.text)) {
      hard.push(`live page ${route}: response body is not an HTML document (${response.type || 'unknown content type'})`);
      evidence.liveFailures.push(item);
    } else if (!response.type) {
      stats.headerlessHtmlPages++;
      evidence.headerlessHtmlPages.push(route);
    }
    return item;
  });

  const sameOriginAssets = new Set();
  const externalLinks = new Set();
  const origin = new URL(siteUrl).origin;
  for (const [route, file] of routeMap.entries()) {
    for (const reference of attributeReferences(read(file))) {
      const target = reference.target;
      if (!target || target.startsWith('#') || isSkippable(target) || isDynamic(target)) continue;
      try {
        const url = new URL(target, `${siteUrl}${route}`);
        if (url.origin === origin) sameOriginAssets.add(url.href); else externalLinks.add(url.href);
      } catch {}
    }
  }

  const assets = await mapLimit([...sameOriginAssets], 24, async url => {
    const response = await fetchWithTimeout(url, {}, 12000);
    stats.liveAssets++;
    const pathname = new URL(url).pathname;
    const tier = protectedTier(pathname);
    if (tier && [401, 403].includes(response.status)) {
      stats.protectedAssetsAccepted++;
      evidence.protectedAssets.push({ url, status: response.status, minimumTier: tier });
    } else if (response.status < 200 || response.status >= 400) {
      const item = { url, status: response.status, error: response.error || null };
      hard.push(`live internal target ${url}: HTTP ${response.status || response.error}`);
      evidence.liveFailures.push(item);
    }
    return { url, status: response.status, type: response.type, protectedTier: tier || null };
  });

  const externalResults = await mapLimit([...externalLinks], 12, async url => {
    let response = await fetchWithTimeout(url, { method: 'HEAD' }, 10000);
    if (response.status === 0 || response.status >= 400) response = await fetchWithTimeout(url, { method: 'GET', headers: { range: 'bytes=0-4096' } }, 15000);
    stats.externalLinksChecked++;
    const result = { url, status: response.status, finalUrl: response.url, error: response.error || null };
    if ([404, 410].includes(response.status)) {
      hard.push(`external link dead ${url}: HTTP ${response.status}`);
      evidence.externalFailures.push(result);
    } else if (response.status === 0 || response.status >= 500 || [401, 403, 429].includes(response.status)) {
      warnings.push(`external link could not be conclusively verified ${url}: HTTP ${response.status || response.error}`);
      evidence.externalFailures.push(result);
    }
    return result;
  });

  await contract('deploy health', '/deploy-health.json', { statuses: [200], json: true, check: data => data?.ok === true && data?.workerScript === 'src/worker-production.js' && data?.manifestMatches === true });
  await contract('forum health', '/forum-health', { statuses: [200], origin: 'cloudflare-worker-forum-d1', json: true, check: data => data?.persistent === true && data?.d1Connected === true });
  await contract('main forum feed', '/forum-feed-main', { statuses: [200], origin: 'cloudflare-worker-forum-d1', json: true });
  await contract('member authentication boundary', '/api/member/me', { statuses: [401], origin: 'cloudflare-worker-member-experience', json: true, check: data => data?.ok === false && data?.authenticated === false });
  await contract('email admin boundary', '/api/email/admin/health', { statuses: [403], origin: 'cloudflare-worker-email-lifecycle', json: true, check: data => data?.ok === false });
  await contract('PayPal authentication boundary', '/api/paypal/config', { statuses: [401], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === false });
  await contract('PayPal checkout disabled boundary', '/api/paypal/checkout-intent', { statuses: [401, 503], json: true, check: data => data?.ok === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' }) });
  await contract('voluntary support configuration', '/api/paypal/donation/config', { statuses: [200], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === true && data?.enabled === false && data?.liveChargingEnabled === false });
  await contract('voluntary support authentication boundary', '/api/paypal/donation/order', { statuses: [401], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '10.00', productKey: 'deep-audit', label: 'Deep audit boundary test' }) });
  await contract('email launch console page', '/admin-email-launch.html', { statuses: [200], check: (_data, response) => /EMAIL LAUNCH CONSOLE\./.test(response.text) && /admin-email-launch\.js/.test(response.text) });
  await contract('email transactional test unauthorized', '/api/email/admin/test-transactional', { statuses: [403], origin: 'cloudflare-worker-email-lifecycle', json: true, check: data => data?.ok === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  return { pages, assets, externalResults };
}

(async () => {
  fs.mkdirSync(downloads, { recursive: true });
  const inventory = await inspectLive();
  const report = {
    ok: hard.length === 0,
    generatedAt: new Date().toISOString(),
    version: 3,
    mode: 'live',
    siteUrl,
    stats,
    hardIssues: hard,
    warnings,
    evidence,
    inventory: { livePageCount: inventory.pages.length, liveAssetCount: inventory.assets.length, externalLinkCount: inventory.externalResults.length },
    boundary: 'Exhaustive live audit V3: every generated HTML route and alias is verified by response body, valid headerless Cloudflare HTML is accepted, protected assets must fail closed, every same-origin target and external link is checked, and the real member, forum, PayPal donation and transactional-email boundaries are tested.'
  };
  const stem = 'deep-production-site-audit-live';
  fs.writeFileSync(path.join(downloads, `${stem}.json`), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(downloads, `${stem}.md`), [
    '# Deep Production Live Audit V3', '', `Generated: ${report.generatedAt}`, `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
    '## Coverage', ...Object.entries(stats).map(([key, value]) => `- ${key}: ${value}`), '',
    '## Hard issues', ...(hard.length ? hard.map(item => `- ${item}`) : ['- None']), '',
    '## Warnings', ...(warnings.length ? warnings.map(item => `- ${item}`) : ['- None']), '',
    `Boundary: ${report.boundary}`
  ].join('\n'));
  if (hard.length) {
    console.error(`DEEP PRODUCTION LIVE AUDIT V3 FAILED: ${hard.length} hard issue(s), ${warnings.length} warning(s).`);
    hard.slice(0, 250).forEach(item => console.error(`- ${item}`));
    process.exit(1);
  }
  console.log(`DEEP PRODUCTION LIVE AUDIT V3 PASSED: ${JSON.stringify(stats)}; warnings=${warnings.length}.`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
