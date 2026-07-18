import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const deploy = path.resolve(root, process.env.DEPLOY_DIR || '_site');
const concurrency = Math.max(1, Number(process.env.EXTERNAL_AUDIT_CONCURRENCY || 16));
const timeoutMs = Math.max(2000, Number(process.env.EXTERNAL_AUDIT_TIMEOUT_MS || 15000));
const reportPath = path.join(root, 'downloads', 'external-source-audit.json');
const localHosts = new Set(['matrixreprogrammed.com','www.matrixreprogrammed.com','localhost','127.0.0.1']);
const sourceExtensions = new Set(['.html','.json','.txt','.md']);
const occurrences = new Map();

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files); else files.push(full);
  }
  return files;
}
function relative(file) { return path.relative(deploy, file).split(path.sep).join('/'); }
function decodeEntities(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function normalise(raw) {
  let value = decodeEntities(raw).trim().replace(/[),.;:'"\]}]+$/, '');
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || localHosts.has(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}
function add(url, file) {
  const normalised = normalise(url);
  if (!normalised) return;
  if (!occurrences.has(normalised)) occurrences.set(normalised, new Set());
  occurrences.get(normalised).add(relative(file));
}
function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (!sourceExtensions.has(ext) && ext !== '') return;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (ext === '.html' || /<!doctype html|<html\b/i.test(text.slice(0, 1000))) {
    for (const match of text.matchAll(/\b(?:href|src|cite|action|data-source-url|data-url)\s*=\s*(["'])(https?:\/\/.*?)\1/gi)) add(match[2], file);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) add(match[0], file);
}
function expectedType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.pdf')) return 'pdf';
  if (pathname.endsWith('.json') || pathname.endsWith('.geojson')) return 'json';
  if (pathname.endsWith('.txt') || pathname.endsWith('.md') || pathname.endsWith('.csv')) return 'text';
  if (pathname.endsWith('.html') || pathname.endsWith('.htm')) return 'html';
  return '';
}
function typeMatches(expected, contentType, prefix) {
  const type = String(contentType || '').toLowerCase();
  if (!expected) return true;
  if (expected === 'pdf') return type.includes('application/pdf') || prefix.startsWith('%PDF-') || type.includes('application/octet-stream');
  if (expected === 'json') return type.includes('json') || /^[\s\uFEFF]*[\[{]/.test(prefix);
  if (expected === 'text') return type.startsWith('text/') || type.includes('csv') || type.includes('json') || type.includes('octet-stream');
  if (expected === 'html') return type.includes('text/html') || /<!doctype html|<html\b/i.test(prefix);
  return true;
}
async function inspect(url) {
  const started = Date.now();
  const sources = [...occurrences.get(url)].sort();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'MatrixReprogrammedReleaseAudit/1.0 (+https://matrixreprogrammed.com/trust-center.html)',
        'Accept': '*/*',
        'Range': 'bytes=0-8191'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    let prefix = '';
    try {
      const buffer = new Uint8Array(await response.arrayBuffer());
      prefix = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 8192));
    } catch {}
    const contentType = response.headers.get('content-type') || '';
    const expected = expectedType(url);
    const status = response.status;
    const accessControlled = [401,403,405,429].includes(status);
    const hardFailure = status === 404 || status === 410 || status >= 500 || status === 0;
    const mismatch = !accessControlled && status < 400 && !typeMatches(expected, contentType, prefix);
    return {
      url,
      finalUrl: response.url || url,
      redirected: Boolean(response.url && response.url !== url),
      status,
      ok: !hardFailure && !mismatch,
      accessControlled,
      expectedType: expected || null,
      contentType: contentType || null,
      contentLength: response.headers.get('content-length') || null,
      elapsedMs: Date.now() - started,
      sources,
      issue: hardFailure ? `HTTP ${status}` : mismatch ? `expected ${expected} content but received ${contentType || 'no content type'}` : accessControlled ? `reachable but access-controlled/rate-limited (${status})` : null
    };
  } catch (error) {
    return { url, finalUrl: null, redirected: false, status: null, ok: false, accessControlled: false, expectedType: expectedType(url) || null, contentType: null, elapsedMs: Date.now() - started, sources, issue: error.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : String(error.message || error) };
  }
}

if (!fs.existsSync(deploy)) throw new Error(`Deploy directory missing: ${deploy}`);
for (const file of walk(deploy)) extract(file);
const urls = [...occurrences.keys()].sort();
const results = new Array(urls.length);
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= urls.length) return;
    results[index] = await inspect(urls[index]);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const failures = results.filter(item => !item.ok);
const warnings = results.filter(item => item.ok && item.issue);
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  deployDirectory: path.relative(root, deploy).split(path.sep).join('/'),
  scannedFiles: walk(deploy).filter(file => sourceExtensions.has(path.extname(file).toLowerCase()) || path.extname(file) === '').length,
  uniqueExternalSources: urls.length,
  passed: results.length - failures.length,
  failures: failures.length,
  warnings: warnings.length,
  policy: {
    blocking: 'network failures, timeouts, HTTP 404/410/5xx and extension-specific content-type mismatches',
    warningOnly: '401, 403, 405 and 429 prove the destination exists but is protected, method-restricted or rate-limited'
  },
  results
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error(`EXTERNAL SOURCE AUDIT FAILED: ${failures.length}/${urls.length} external destinations failed.`);
  failures.slice(0, 100).forEach(item => console.error(`- ${item.url}: ${item.issue}`));
  process.exit(1);
}
console.log(`EXTERNAL SOURCE AUDIT PASSED: ${urls.length} unique destinations checked; ${warnings.length} access-control/rate-limit warning(s).`);
