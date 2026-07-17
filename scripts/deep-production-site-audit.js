const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const downloads = path.join(root, 'downloads');
const mode = process.argv.includes('--live') ? 'live' : 'static';
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const hard = [];
const warnings = [];
const stats = {
  htmlFiles: 0,
  jsFiles: 0,
  jsonFiles: 0,
  internalReferences: 0,
  externalReferences: 0,
  forms: 0,
  buttons: 0,
  inputs: 0,
  images: 0,
  livePages: 0,
  liveAssets: 0,
  externalLinksChecked: 0,
  apiContracts: 0
};
const evidence = {
  oversizedAssets: [],
  duplicateTitles: [],
  pagesWithoutMain: [],
  pagesWithoutH1: [],
  missingAlt: [],
  unlabeledInputs: [],
  emptyControls: [],
  externalFailures: [],
  liveFailures: [],
  apiResults: []
};

const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'browsertrix-output']);
const dynamicPrefixes = [
  '/api/', '/forum-', '/submit-', '/report-', '/track-', '/newsletter-', '/member-', '/billing-', '/admin-',
  '/osint-', '/health', '/deploy-status', '/intro-voice', '/.netlify/functions/'
];
const criticalMarkers = {
  'index.html': ['MAP THE STRUCTURE. READ THE SIGNALS.'],
  'search.html': ['id="archive-search"', 'id="search-results"'],
  'geographic-power-atlas.html': ['id="power-atlas-map"', 'geographic-power-atlas.js'],
  'membership.html': ['Free Member', 'Monthly donation', 'paypal-membership.js'],
  'store.html': ['Choose your support amount', '€1 to €5,000', 'paypal-voluntary-support.js'],
  'card-deck-store.html': ['Choose your support amount', '€1 to €5,000', 'paypal-voluntary-support.js'],
  'admin-email-launch.html': ['EMAIL LAUNCH CONSOLE.', 'admin-email-launch.js'],
  'member-login.html': ['member-login'],
  'member-dashboard.html': ['member-dashboard-app.js'],
  'billing-dashboard.html': ['billing-dashboard.js'],
  'forum.html': ['forum.js'],
  'research-tools.html': ['research-tools.js'],
  'ai-speculative-conclusions.html': ['ai-speculative-conclusions.js']
};

function rel(file, base = site) { return path.relative(base, file).split(path.sep).join('/'); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function stripQueryHash(value) { return String(value || '').split('#')[0].split('?')[0].trim(); }
function isExternal(value) { return /^https?:\/\//i.test(String(value || '')); }
function isSkippable(value) { return /^(?:mailto:|tel:|data:|blob:|javascript:)/i.test(String(value || '')); }
function isDynamic(value) {
  const clean = stripQueryHash(value);
  return dynamicPrefixes.some(prefix => clean.startsWith(prefix));
}
function decodeSafe(value) { try { return decodeURIComponent(value); } catch { return value; } }
function localCandidates(target, fromFile) {
  const clean = stripQueryHash(target);
  if (!clean || clean === '/' || clean.startsWith('#')) return [];
  const normalized = decodeSafe(clean).replace(/^\/+/, '');
  const resolved = clean.startsWith('/') ? path.join(site, normalized) : path.resolve(path.dirname(fromFile), normalized);
  const candidates = [resolved];
  if (!path.extname(resolved)) candidates.push(`${resolved}.html`, path.join(resolved, 'index.html'));
  return candidates;
}
function localExists(target, fromFile) {
  if (!target || target === '/' || target.startsWith('#') || isExternal(target) || isSkippable(target) || isDynamic(target)) return true;
  return localCandidates(target, fromFile).some(candidate => fs.existsSync(candidate));
}
function htmlIds(html) {
  return [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
}
function textContent(fragment) {
  return String(fragment || '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}
function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i'));
  return match ? match[2] : '';
}
function hasAttr(tag, name) { return new RegExp(`\\b${name}(?:\\s*=|\\s|>)`, 'i').test(String(tag || '')); }
function syntaxCheckJs(file) {
  const source = read(file);
  const moduleLike = /(^|\n)\s*(?:import|export)\s/m.test(source) || file.endsWith('.mjs');
  let target = file;
  let temp = '';
  if (moduleLike && !file.endsWith('.mjs')) {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-deep-audit-'));
    target = path.join(temp, `${path.basename(file, '.js')}.mjs`);
    fs.writeFileSync(target, source);
  }
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  if (result.status !== 0) hard.push(`${rel(file)}: JavaScript syntax error: ${(result.stderr || result.stdout || '').trim().slice(0, 700)}`);
}
function resolveTargetFile(target, fromFile) {
  const clean = stripQueryHash(target);
  if (!clean || clean.startsWith('#') || isExternal(clean) || isSkippable(clean) || isDynamic(clean)) return null;
  return localCandidates(clean, fromFile).find(candidate => fs.existsSync(candidate)) || null;
}
function inspectHtml(file, titleMap, internalRefs, externalRefs) {
  stats.htmlFiles++;
  const name = rel(file);
  const html = read(file);
  const ids = htmlIds(html);
  const idSet = new Set(ids);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) hard.push(`${name}: duplicate IDs: ${duplicates.join(', ')}`);
  if (!/<!doctype html>/i.test(html)) warnings.push(`${name}: missing HTML doctype`);
  if (!/<html\b[^>]*\blang\s*=/i.test(html)) warnings.push(`${name}: missing html lang attribute`);
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) warnings.push(`${name}: missing viewport meta tag`);
  if (!/<main\b/i.test(html)) { evidence.pagesWithoutMain.push(name); warnings.push(`${name}: missing main landmark`); }
  if (!/<h1\b/i.test(html)) { evidence.pagesWithoutH1.push(name); warnings.push(`${name}: missing h1`); }
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !textContent(title)) hard.push(`${name}: missing non-empty title`);
  else {
    const normalized = textContent(title).toLowerCase();
    if (!titleMap.has(normalized)) titleMap.set(normalized, []);
    titleMap.get(normalized).push(name);
  }
  if (!/<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']{20,}["']/i.test(html)) warnings.push(`${name}: missing useful meta description`);
  if (/http:\/\//i.test(html.replace(/http:\/\/localhost[^"'\s<]*/gi, ''))) hard.push(`${name}: contains insecure http:// reference`);
  for (const forbidden of ['object-object.html', '€29</', '€39</', 'Buy Placeholder', 'FOLLOW THE FILES']) {
    if (html.includes(forbidden)) hard.push(`${name}: contains retired or malformed public marker ${forbidden}`);
  }

  const attrs = [...html.matchAll(/\b(?:href|src|action|poster)\s*=\s*(["'])([^"']*)\1/gi)];
  for (const match of attrs) {
    const target = match[2].trim();
    if (!target) { hard.push(`${name}: empty ${match[0].split('=')[0].trim()} target`); continue; }
    if (isExternal(target)) { stats.externalReferences++; externalRefs.add(target); continue; }
    if (isSkippable(target)) {
      if (/^javascript:/i.test(target)) warnings.push(`${name}: javascript: URL should be replaced with a button`);
      continue;
    }
    stats.internalReferences++;
    if (target.startsWith('#')) {
      const anchor = target.slice(1);
      if (anchor && !idSet.has(anchor)) hard.push(`${name}: missing local anchor ${target}`);
      continue;
    }
    if (!localExists(target, file)) hard.push(`${name}: missing local target ${target}`);
    else internalRefs.add(JSON.stringify({ from: name, target }));
    const hash = String(target).split('#')[1];
    if (hash) {
      const targetFile = resolveTargetFile(target, file);
      if (targetFile && /\.html$/.test(targetFile)) {
        const targetIds = new Set(htmlIds(read(targetFile)));
        if (!targetIds.has(hash)) hard.push(`${name}: target anchor does not exist ${target}`);
      }
    }
  }

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  stats.images += images.length;
  for (const tag of images) {
    const source = attr(tag, 'src');
    if (!hasAttr(tag, 'alt')) { evidence.missingAlt.push(`${name}: ${source || '[inline image]'}`); warnings.push(`${name}: image missing alt attribute ${source || ''}`.trim()); }
  }

  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map(match => match[0]);
  stats.forms += forms.length;
  for (const form of forms) {
    const formId = attr(form.match(/<form\b[^>]*>/i)?.[0] || '', 'id') || '[anonymous form]';
    const action = attr(form.match(/<form\b[^>]*>/i)?.[0] || '', 'action');
    const hasHook = /\b(?:id|data-[\w-]+)\s*=/.test(form) && /<script\b|\.js["']/.test(html);
    if (!action && !hasHook) hard.push(`${name}: form ${formId} has neither action nor detectable JavaScript hook`);
    const inputs = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)].map(match => match[0]);
    stats.inputs += inputs.length;
    for (const tag of inputs) {
      const type = (attr(tag, 'type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      const id = attr(tag, 'id');
      const aria = attr(tag, 'aria-label') || attr(tag, 'aria-labelledby');
      const titleAttr = attr(tag, 'title');
      const labeled = aria || titleAttr || (id && new RegExp(`<label\\b[^>]*for=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(form)) || /<label\b[^>]*>[\s\S]*?<(?:input|select|textarea)\b/i.test(form);
      if (!labeled) { const item = `${name}: unlabeled ${tag.match(/^<\w+/)?.[0] || 'control'}${id ? ` #${id}` : ''}`; evidence.unlabeledInputs.push(item); warnings.push(item); }
    }
  }

  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map(match => match[0]);
  stats.buttons += buttons.length;
  for (const button of buttons) {
    const label = textContent(button) || attr(button, 'aria-label') || attr(button, 'title');
    if (!label) { const item = `${name}: button has no accessible name`; evidence.emptyControls.push(item); hard.push(item); }
    if (!/\btype\s*=/.test(button)) warnings.push(`${name}: button missing explicit type attribute (${label.slice(0, 80)})`);
  }
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(match => match[0]);
  for (const anchor of anchors) {
    const href = attr(anchor, 'href');
    const label = textContent(anchor) || attr(anchor, 'aria-label') || attr(anchor, 'title');
    if (!label && !/<img\b[^>]*alt=["'][^"']+["']/i.test(anchor)) { const item = `${name}: link has no accessible name (${href || 'no href'})`; evidence.emptyControls.push(item); hard.push(item); }
    if (href === '#') warnings.push(`${name}: placeholder href="#" link (${label.slice(0, 80)})`);
    if (/target=["']_blank["']/i.test(anchor) && !/rel=["'][^"']*(?:noopener|noreferrer)/i.test(anchor)) warnings.push(`${name}: target=_blank link missing rel=noopener (${href})`);
  }

  for (const [critical, markers] of Object.entries(criticalMarkers)) {
    if (name === critical) for (const marker of markers) if (!html.includes(marker)) hard.push(`${name}: missing critical marker ${marker}`);
  }
}
function inspectStatic() {
  if (!fs.existsSync(site)) throw new Error('_site is missing; run the complete build first');
  const files = walk(site);
  const titleMap = new Map();
  const internalRefs = new Set();
  const externalRefs = new Set();
  for (const file of files) {
    const stat = fs.statSync(file);
    if (stat.size === 0) hard.push(`${rel(file)}: zero-byte deployed file`);
    if (stat.size > MAX_ASSET_BYTES) { const item = { file: rel(file), bytes: stat.size }; evidence.oversizedAssets.push(item); hard.push(`${item.file}: ${item.bytes} bytes exceeds Cloudflare 25 MiB asset limit`); }
    if (file.endsWith('.html') || (!path.extname(file) && /<!doctype html|<html\b/i.test(read(file)))) inspectHtml(file, titleMap, internalRefs, externalRefs);
    else if (file.endsWith('.js') || file.endsWith('.mjs')) { stats.jsFiles++; syntaxCheckJs(file); }
    else if (file.endsWith('.json')) {
      stats.jsonFiles++;
      try { JSON.parse(read(file)); } catch (error) { hard.push(`${rel(file)}: invalid JSON: ${error.message}`); }
    }
  }
  for (const [title, pages] of titleMap.entries()) if (pages.length > 1) evidence.duplicateTitles.push({ title, pages });
  for (const [name, markers] of Object.entries(criticalMarkers)) {
    const sourceFile = path.join(root, name);
    const outputFile = path.join(site, name);
    if (!fs.existsSync(sourceFile)) hard.push(`source critical page missing: ${name}`);
    if (!fs.existsSync(outputFile)) hard.push(`deployed critical page missing: ${name}`);
    if (fs.existsSync(sourceFile) && fs.existsSync(outputFile)) {
      const source = read(sourceFile); const output = read(outputFile);
      for (const marker of markers) {
        if (!source.includes(marker)) hard.push(`source ${name}: missing canonical marker ${marker}`);
        if (!output.includes(marker)) hard.push(`_site/${name}: missing canonical marker ${marker}`);
      }
    }
  }
  return { internalRefs: [...internalRefs].map(value => JSON.parse(value)), externalRefs: [...externalRefs] };
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal, headers: { 'cache-control': 'no-cache', pragma: 'no-cache', 'user-agent': 'MatrixDeepProductionAudit/1.0', ...(options.headers || {}) } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, url: response.url, type: response.headers.get('content-type') || '', origin: response.headers.get('x-matrix-origin') || '', text };
  } catch (error) { return { ok: false, status: 0, url, type: '', origin: '', text: '', error: error.name === 'AbortError' ? 'timeout' : error.message }; }
  finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run));
  return results;
}
function liveRouteForFile(file) {
  const relative = rel(file);
  if (relative === 'index.html') return '/';
  return `/${relative}`;
}
async function inspectLive() {
  if (!fs.existsSync(site)) throw new Error('_site is missing; run the complete build first');
  const files = walk(site);
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  const pages = await mapLimit(htmlFiles, 16, async file => {
    const route = liveRouteForFile(file);
    const response = await fetchWithTimeout(`${siteUrl}${route}?deep_audit=${Date.now()}`);
    stats.livePages++;
    const item = { route, status: response.status, finalUrl: response.url, type: response.type, error: response.error || null };
    if (response.status < 200 || response.status >= 400) { hard.push(`live page ${route}: HTTP ${response.status || response.error}`); evidence.liveFailures.push(item); }
    else if (!/text\/html/i.test(response.type)) { hard.push(`live page ${route}: expected HTML, received ${response.type || 'unknown content type'}`); evidence.liveFailures.push(item); }
    else if (!/<html\b/i.test(response.text)) { hard.push(`live page ${route}: response is not an HTML document`); evidence.liveFailures.push(item); }
    return item;
  });

  const sameOriginAssets = new Set();
  const externalLinks = new Set();
  for (const file of htmlFiles) {
    const html = read(file);
    for (const match of html.matchAll(/\b(?:href|src|action|poster)\s*=\s*(["'])([^"']+)\1/gi)) {
      const target = match[2].trim();
      if (isExternal(target)) externalLinks.add(target);
      else if (!target.startsWith('#') && !isSkippable(target) && !isDynamic(target)) {
        try { sameOriginAssets.add(new URL(target, `${siteUrl}${liveRouteForFile(file)}`).href); } catch {}
      }
    }
  }
  const assets = await mapLimit([...sameOriginAssets], 20, async url => {
    const response = await fetchWithTimeout(url, {}, 12000);
    stats.liveAssets++;
    if (response.status < 200 || response.status >= 400) { const item = { url, status: response.status, error: response.error || null }; hard.push(`live internal target ${url}: HTTP ${response.status || response.error}`); evidence.liveFailures.push(item); }
    return { url, status: response.status, type: response.type };
  });

  const externalResults = await mapLimit([...externalLinks], 12, async url => {
    let response = await fetchWithTimeout(url, { method: 'HEAD' }, 10000);
    if ([0, 405, 501].includes(response.status)) response = await fetchWithTimeout(url, { method: 'GET', headers: { range: 'bytes=0-2048' } }, 12000);
    stats.externalLinksChecked++;
    const result = { url, status: response.status, finalUrl: response.url, error: response.error || null };
    if ([404, 410].includes(response.status)) { hard.push(`external link dead ${url}: HTTP ${response.status}`); evidence.externalFailures.push(result); }
    else if (response.status === 0 || response.status >= 500 || [401, 403, 429].includes(response.status)) { warnings.push(`external link could not be conclusively verified ${url}: HTTP ${response.status || response.error}`); evidence.externalFailures.push(result); }
    return result;
  });

  async function contract(name, route, expected, options = {}) {
    const response = await fetchWithTimeout(`${siteUrl}${route}`, options, 15000);
    stats.apiContracts++;
    const data = (() => { try { return JSON.parse(response.text); } catch { return null; } })();
    const result = { name, route, status: response.status, origin: response.origin, data };
    evidence.apiResults.push(result);
    const errors = [];
    if (expected.statuses && !expected.statuses.includes(response.status)) errors.push(`status ${response.status}, expected ${expected.statuses.join('/')}`);
    if (expected.origin && response.origin !== expected.origin) errors.push(`origin ${response.origin || '[missing]'}, expected ${expected.origin}`);
    if (expected.json && !data) errors.push('response is not JSON');
    if (expected.check && !expected.check(data, response)) errors.push('response contract predicate failed');
    if (errors.length) hard.push(`API ${name} (${route}): ${errors.join('; ')}`);
  }
  await contract('deploy health', '/deploy-health.json', { statuses: [200], json: true, check: data => data?.ok === true && data?.workerScript === 'src/worker-production.js' && data?.manifestMatches === true });
  await contract('forum health', '/forum-health', { statuses: [200], origin: 'cloudflare-worker-forum-d1', json: true, check: data => data?.persistent === true && data?.d1Connected === true });
  await contract('main forum feed', '/forum-feed-main', { statuses: [200], origin: 'cloudflare-worker-forum-d1', json: true });
  await contract('member authentication boundary', '/api/member/me', { statuses: [401], origin: 'cloudflare-worker-member-experience', json: true, check: data => data?.ok === false && data?.authenticated === false });
  await contract('email admin boundary', '/api/email/admin/health', { statuses: [403], origin: 'cloudflare-worker-email-lifecycle', json: true, check: data => data?.ok === false }, { method: 'GET' });
  await contract('PayPal authentication boundary', '/api/paypal/config', { statuses: [401], origin: 'cloudflare-worker-paypal-subscriptions', json: true, check: data => data?.ok === false && data?.authenticated === false });
  await contract('PayPal checkout disabled boundary', '/api/paypal/checkout-intent', { statuses: [401, 503], json: true, check: data => data?.ok === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' }) });
  await contract('voluntary support disabled boundary', '/api/paypal/support/create-order', { statuses: [503], json: true, check: data => data?.ok === false && data?.enabled === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '10.00', context: 'deep-audit' }) });
  await contract('email launch console page', '/admin-email-launch.html', { statuses: [200], check: (_data, response) => /EMAIL LAUNCH CONSOLE\./.test(response.text) && /admin-email-launch\.js/.test(response.text) });
  await contract('email test endpoint unauthorized', '/api/email/admin/send-test', { statuses: [403], origin: 'cloudflare-worker-email-lifecycle', json: true, check: data => data?.ok === false }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  return { pages, assets, externalResults };
}

(async () => {
  fs.mkdirSync(downloads, { recursive: true });
  let staticInventory = null;
  let liveInventory = null;
  if (mode === 'static') staticInventory = inspectStatic();
  else liveInventory = await inspectLive();
  const report = {
    ok: hard.length === 0,
    generatedAt: new Date().toISOString(),
    mode,
    siteUrl,
    stats,
    hardIssues: hard,
    warnings,
    evidence,
    inventory: mode === 'static' ? { internalReferenceCount: staticInventory.internalRefs.length, externalReferenceCount: staticInventory.externalRefs.length } : { livePageCount: liveInventory.pages.length, liveAssetCount: liveInventory.assets.length, externalLinkCount: liveInventory.externalResults.length },
    boundary: mode === 'static'
      ? 'Exhaustive generated-bundle audit: every HTML surface, local link, asset, cross-page anchor, form, input, button, image, JavaScript file, JSON feed, Cloudflare asset size and critical source/output marker.'
      : 'Exhaustive live audit: every generated HTML route, every unique same-origin referenced target, every external link with fail-soft handling for blocking/rate limits, and critical unauthenticated API safety contracts.'
  };
  const filename = `deep-production-site-audit-${mode}.json`;
  fs.writeFileSync(path.join(downloads, filename), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(downloads, filename.replace('.json', '.md')), [
    '# Deep Production Site Audit', '', `Mode: ${mode}`, `Generated: ${report.generatedAt}`, `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
    '## Coverage', ...Object.entries(stats).map(([key, value]) => `- ${key}: ${value}`), '',
    '## Hard issues', ...(hard.length ? hard.map(item => `- ${item}`) : ['- None']), '',
    '## Warnings', ...(warnings.length ? warnings.map(item => `- ${item}`) : ['- None']), '',
    `Boundary: ${report.boundary}`
  ].join('\n'));
  if (hard.length) {
    console.error(`DEEP PRODUCTION SITE AUDIT FAILED (${mode}): ${hard.length} hard issue(s), ${warnings.length} warning(s).`);
    hard.slice(0, 250).forEach(item => console.error(`- ${item}`));
    process.exit(1);
  }
  console.log(`DEEP PRODUCTION SITE AUDIT PASSED (${mode}): ${JSON.stringify(stats)}; warnings=${warnings.length}.`);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
