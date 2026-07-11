const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const registryPath = path.join(dataDir, 'investigation-source-registry.json');
const sourceIndexPath = path.join(dataDir, 'source-snapshot-index.json');
const outputPath = path.join(dataDir, 'source-document-links.json');
const reportPath = path.join(downloadsDir, 'source-document-discovery-report.json');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const now = new Date().toISOString();
const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
const timeoutMs = Math.max(5000, Number(process.env.SOURCE_DOCUMENT_DISCOVERY_TIMEOUT_MS || 25000));
const maxBytes = Math.max(100000, Number(process.env.SOURCE_DOCUMENT_DISCOVERY_MAX_BYTES || 12 * 1024 * 1024));
const concurrency = Math.max(1, Number(process.env.SOURCE_DOCUMENT_DISCOVERY_CONCURRENCY || 4));
const userAgent = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedEvidenceMonitor/1.0 njmgroupfrance@gmail.com';

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function clean(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function template(value) {
  const end = now.slice(0, 10);
  const start = new Date(Date.now() - (mode === 'weekly' ? 8 : 3) * 86400000).toISOString().slice(0, 10);
  return String(value || '').replace(/\{\{START_DATE\}\}/g, start).replace(/\{\{END_DATE\}\}/g, end).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => process.env[key] || `{{${key}}}`);
}
function templateObject(value) {
  if (Array.isArray(value)) return value.map(templateObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, templateObject(child)]));
  return typeof value === 'string' ? template(value) : value;
}
function looksLikePdfUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return /\.pdf(?:$|[?#])/i.test(url.href) || /(?:format|output|download|filetype)=pdf\b/i.test(url.search) || /\/pdf\//i.test(url.pathname);
  } catch { return false; }
}
function extractLinks(buffer, contentType, baseUrl) {
  const raw = buffer.toString('utf8');
  const links = [];
  const seen = new Set();
  function add(value, title = '') {
    let url;
    try { url = new URL(String(value || '').replace(/&amp;/gi, '&'), baseUrl).href; } catch { return; }
    if (!/^https?:\/\//i.test(url) || !looksLikePdfUrl(url) || seen.has(url)) return;
    seen.add(url);
    links.push({ url, title: clean(title).slice(0, 280) || url.split(/[?#]/)[0].split('/').pop() || 'PDF document' });
  }
  if (/application\/pdf/i.test(contentType || '') || buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) add(baseUrl, 'Direct PDF source');
  for (const match of raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) add(href, match[2]);
  }
  for (const match of raw.matchAll(/https?:\\?\/\\?\/[^\s"'<>]+/gi)) {
    add(match[0].replace(/\\\//g, '/').replace(/[),.;]+$/g, ''));
  }
  return links.slice(0, 500);
}
async function fetchSource(source) {
  const required = (source.requiredEnv || []).filter(key => !process.env[key]);
  if (required.length) return { source, ok: false, skipped: Boolean(source.optional), category: 'missing-environment', links: [] };
  const headers = { 'user-agent': userAgent, accept: 'application/json,text/html,application/xml,application/pdf,*/*;q=0.4' };
  const options = { method: source.type === 'json-post' ? 'POST' : 'GET', headers, redirect: 'follow' };
  if (source.type === 'json-post') {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(templateObject(source.payload || {}));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;
  try {
    const response = await fetch(template(source.url), options);
    if (!response.ok) return { source, ok: false, skipped: false, category: `http-${response.status}`, status: response.status, links: [] };
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > maxBytes) return { source, ok: false, skipped: false, category: 'size-limit', status: response.status, links: [] };
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) return { source, ok: false, skipped: false, category: 'size-limit', status: response.status, links: [] };
    const finalUrl = response.url || source.url;
    const contentType = response.headers.get('content-type') || '';
    return { source, ok: true, skipped: false, status: response.status, finalUrl, contentType, links: extractLinks(body, contentType, finalUrl) };
  } catch (error) {
    return { source, ok: false, skipped: false, category: error.name === 'AbortError' ? 'timeout' : 'retrieval-failure', links: [] };
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() { while (true) { const index = cursor++; if (index >= items.length) return; results[index] = await fn(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, worker));
  return results;
}

(async () => {
  const registry = readJson(registryPath, { sources: [] });
  const sourceIndex = readJson(sourceIndexPath, { updated: null, sources: {} });
  const selected = (registry.sources || []).filter(source => (source.frequency || []).includes(mode));
  const results = await mapLimit(selected, concurrency, fetchSource);
  const nextSources = { ...(sourceIndex.sources || {}) };
  const documents = [];
  for (const result of results) {
    const source = result.source;
    const prior = nextSources[source.id] || {};
    const links = result.ok ? result.links.map(link => ({
      ...link,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceUrl: source.url,
      lane: source.lane,
      authority: source.authority,
      discoveredAt: now,
      discoveredFrom: 'source-monitor-document-discovery'
    })) : (prior.documentLinks || []);
    nextSources[source.id] = {
      ...prior,
      sourceId: source.id,
      label: source.label,
      url: source.url,
      lane: source.lane,
      authority: source.authority,
      documentLinks: links,
      lastDocumentDiscovery: now,
      documentDiscoveryStatus: result.ok ? 'fetched' : (result.skipped ? 'skipped' : 'failed'),
      documentDiscoveryCount: links.length
    };
    documents.push(...links);
  }
  const uniqueDocuments = [...new Map(documents.map(document => [document.url, document])).values()]
    .sort((a, b) => String(a.url).localeCompare(String(b.url)));
  sourceIndex.updated = now;
  sourceIndex.mode = mode;
  sourceIndex.discoveredDocuments = Object.values(nextSources).reduce((count, source) => count + (source.documentLinks || []).length, 0);
  sourceIndex.sources = nextSources;
  writeJson(sourceIndexPath, sourceIndex);
  writeJson(outputPath, {
    updated: now,
    mode,
    evidenceBoundary: 'A linked PDF is a discovered source document, not a finding. Its contents require extraction, provenance review and evidential classification before supporting a conclusion.',
    sourceCount: selected.length,
    documentCount: uniqueDocuments.length,
    documents: uniqueDocuments
  });
  writeJson(reportPath, {
    ok: true,
    generatedAt: now,
    mode,
    sourcesChecked: selected.length,
    sourcesFetched: results.filter(result => result.ok).length,
    sourcesFailed: results.filter(result => !result.ok && !result.skipped).length,
    sourcesSkipped: results.filter(result => result.skipped).length,
    documentsDiscovered: uniqueDocuments.length,
    failures: results.filter(result => !result.ok).map(result => ({ sourceId: result.source.id, category: result.category, status: result.status || null }))
  });
  console.log(JSON.stringify({ ok: true, sources: selected.length, documents: uniqueDocuments.length }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });