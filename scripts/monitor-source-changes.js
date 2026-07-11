const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const snapshotRoot = path.join(dataDir, 'source-snapshots');
const downloadsDir = path.join(root, 'downloads');
const registryPath = path.join(dataDir, 'investigation-source-registry.json');
const indexPath = path.join(dataDir, 'source-snapshot-index.json');
const ledgerPath = path.join(dataDir, 'source-change-ledger.json');
const publicPath = path.join(dataDir, 'source-change-public.json');
const reportPath = path.join(downloadsDir, 'source-change-monitor-report.json');
const pagePath = path.join(root, 'source-changes.html');

fs.mkdirSync(snapshotRoot, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const now = new Date().toISOString();
const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
const timeoutMs = Number(process.env.SOURCE_MONITOR_TIMEOUT_MS || 25000);
const concurrency = Math.max(1, Number(process.env.SOURCE_MONITOR_CONCURRENCY || 4));
const maxBytes = Math.max(100000, Number(process.env.SOURCE_MONITOR_MAX_BYTES || 8 * 1024 * 1024));
const maxSnapshotChars = Math.max(100000, Number(process.env.SOURCE_SNAPSHOT_MAX_CHARS || 750000));
const userAgent = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedEvidenceMonitor/1.0 njmgroupfrance@gmail.com';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function cleanHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeBody(buffer, contentType) {
  const raw = buffer.toString('utf8');
  if (/html|xml|rss|atom/i.test(contentType || '') || /^\s*</.test(raw)) return cleanHtml(raw);
  if (/json/i.test(contentType || '')) {
    try { return JSON.stringify(JSON.parse(raw), Object.keys(JSON.parse(raw)).sort(), 2).replace(/\s+/g, ' ').trim(); } catch {}
  }
  return raw.replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function chunks(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(part => part.trim())
    .filter(part => part.length >= 25)
    .slice(0, 12000);
}
function diffText(previous, current) {
  const before = chunks(previous);
  const after = chunks(current);
  const beforeSet = new Set(before.map(v => v.toLowerCase()));
  const afterSet = new Set(after.map(v => v.toLowerCase()));
  const additions = after.filter(v => !beforeSet.has(v.toLowerCase())).slice(0, 80);
  const removals = before.filter(v => !afterSet.has(v.toLowerCase())).slice(0, 80);
  return {
    additions,
    removals,
    additionCount: after.filter(v => !beforeSet.has(v.toLowerCase())).length,
    removalCount: before.filter(v => !afterSet.has(v.toLowerCase())).length
  };
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function template(value) {
  const end = now.slice(0, 10);
  const start = new Date(Date.now() - (mode === 'weekly' ? 8 : 3) * 86400000).toISOString().slice(0, 10);
  return String(value || '').replace(/\{\{START_DATE\}\}/g, start).replace(/\{\{END_DATE\}\}/g, end).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => process.env[key] || `{{${key}}}`);
}
function templateObject(value) {
  if (Array.isArray(value)) return value.map(templateObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, templateObject(v)]));
  return typeof value === 'string' ? template(value) : value;
}
function snapshotFile(sourceId, hash) {
  return path.join(snapshotRoot, sourceId, `${hash}.json`);
}
function publicChange(change) {
  return {
    id: change.id,
    sourceId: change.sourceId,
    sourceLabel: change.sourceLabel,
    sourceUrl: change.sourceUrl,
    lane: change.lane,
    authority: change.authority,
    detectedAt: change.detectedAt,
    changeType: change.changeType,
    previousHash: change.previousHash,
    currentHash: change.currentHash,
    httpStatus: change.httpStatus,
    finalUrl: change.finalUrl,
    additions: change.additions,
    removals: change.removals,
    additionCount: change.additionCount,
    removalCount: change.removalCount,
    established: change.established,
    notEstablished: change.notEstablished,
    evidenceGrade: change.evidenceGrade,
    status: change.status
  };
}
async function fetchOne(source) {
  const required = (source.requiredEnv || []).filter(key => !process.env[key]);
  if (required.length) return { source, ok: false, skipped: Boolean(source.optional), error: `Missing environment: ${required.join(', ')}`, status: null };
  const headers = {'user-agent': userAgent, accept: '*/*'};
  const options = {method: source.type === 'json-post' ? 'POST' : 'GET', headers, redirect: 'follow'};
  if (source.type === 'json-post') {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(templateObject(source.payload || {}));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;
  try {
    const response = await fetch(template(source.url), options);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
    const contentType = response.headers.get('content-type') || '';
    const normalized = normalizeBody(body, contentType).slice(0, maxSnapshotChars);
    return {
      source, ok: true, status: response.status, finalUrl: response.url || source.url,
      contentType, bytes: body.byteLength, rawHash: sha256(body), normalizedHash: sha256(normalized), normalized
    };
  } catch (error) {
    return {source, ok: false, skipped: false, status: error.status || null, error: error.name === 'AbortError' ? 'Timeout' : String(error.message || error)};
  } finally { clearTimeout(timer); }
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() { while (true) { const i = cursor++; if (i >= items.length) return; results[i] = await fn(items[i]); } }
  await Promise.all(Array.from({length: Math.min(limit, Math.max(1, items.length))}, worker));
  return results;
}
function buildPage(publicData) {
  const cards = publicData.changes.length ? publicData.changes.map(change => {
    const added = change.additions.slice(0, 5).map(v => `<li>${escapeHtml(v)}</li>`).join('');
    const removed = change.removals.slice(0, 5).map(v => `<li>${escapeHtml(v)}</li>`).join('');
    return `<article class="change-card"><div class="change-meta"><span class="grade">GRADE ${escapeHtml(change.evidenceGrade)}</span><span>${escapeHtml(change.changeType.replace(/-/g,' '))}</span><span>${escapeHtml(change.detectedAt.slice(0,10))}</span></div><h2><a href="${escapeHtml(change.sourceUrl)}" rel="noopener">${escapeHtml(change.sourceLabel)}</a></h2><p><strong>What is established:</strong> ${escapeHtml(change.established)}</p><p><strong>What is not established:</strong> ${escapeHtml(change.notEstablished)}</p>${added ? `<h3>Additions detected</h3><ul>${added}</ul>` : ''}${removed ? `<h3>Removals detected</h3><ul>${removed}</ul>` : ''}<p class="hash">Current SHA-256: ${escapeHtml(change.currentHash || 'unavailable')}</p></article>`;
  }).join('\n') : '<article class="change-card"><h2>No meaningful source change recorded yet</h2><p>The monitor is active. A neutral result does not prove that no external change occurred outside the registered sources.</p></article>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Source Change Ledger | Matrix Reprogrammed</title><meta name="description" content="Evidence-bounded additions, removals, restorations and source availability changes across registered public-record sources."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><style>.change-wrap{max-width:1100px;margin:auto;padding:2rem 1rem}.change-card{border:1px solid rgba(216,181,106,.28);border-radius:16px;padding:1.2rem;margin:1rem 0;background:rgba(0,0,0,.82)}.change-meta{display:flex;gap:.6rem;flex-wrap:wrap;font-size:.8rem;text-transform:uppercase}.change-meta span{border:1px solid rgba(216,181,106,.3);border-radius:999px;padding:.25rem .55rem}.grade{color:#d8b56a}.hash{font-family:monospace;font-size:.76rem;overflow-wrap:anywhere;color:#c8b98c}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="investigation-source-ledger.html">Source Ledger</a><a href="search.html">Search</a></nav></header><main class="change-wrap"><div class="eyebrow">Public evidence preservation</div><h1>SOURCE CHANGE LEDGER</h1><p class="lead">Registered public-record sources are compared over time. Meaningful additions, removals, failures and restorations are recorded with retrieval dates and SHA-256 hashes.</p><p><strong>Evidence boundary:</strong> a changed or unavailable page is a transparency event, not proof of wrongdoing, concealment or intent. The underlying record and later explanation control the conclusion.</p><div class="cta-row"><a class="btn" href="data/source-change-public.json">Public JSON</a><a class="btn alt" href="daily-investigation-conclusions.html">Daily Conclusions</a></div>${cards}</main></div></body></html>`;
}

(async () => {
  if (!fs.existsSync(registryPath)) throw new Error('Missing investigation source registry');
  const registry = readJson(registryPath, {sources: []});
  const priorIndex = readJson(indexPath, {updated: null, sources: {}});
  const priorLedger = readJson(ledgerPath, {updated: null, changes: []});
  const selected = (registry.sources || []).filter(source => (source.frequency || []).includes(mode));
  const results = await mapLimit(selected, concurrency, fetchOne);
  const nextSources = {...(priorIndex.sources || {})};
  const detected = [];
  for (const result of results) {
    const source = result.source;
    const prior = nextSources[source.id] || {};
    if (result.ok) {
      const priorSnapshot = prior.normalizedHash ? readJson(snapshotFile(source.id, prior.normalizedHash), null) : null;
      const firstSnapshot = !prior.normalizedHash;
      const changed = Boolean(prior.normalizedHash && prior.normalizedHash !== result.normalizedHash);
      const restored = prior.availability === 'unavailable';
      if (!fs.existsSync(snapshotFile(source.id, result.normalizedHash))) {
        writeJson(snapshotFile(source.id, result.normalizedHash), {
          sourceId: source.id, sourceLabel: source.label, sourceUrl: source.url, finalUrl: result.finalUrl,
          retrievedAt: now, contentType: result.contentType, bytes: result.bytes, rawHash: result.rawHash,
          normalizedHash: result.normalizedHash, truncated: result.normalized.length >= maxSnapshotChars,
          normalizedText: result.normalized
        });
      }
      if (changed || restored) {
        const diff = diffText(priorSnapshot?.normalizedText || '', result.normalized);
        const changeType = restored ? 'source-restored' : 'content-changed';
        detected.push({
          id: sha256(`${source.id}|${now}|${changeType}|${result.normalizedHash}`).slice(0, 24),
          sourceId: source.id, sourceLabel: source.label, sourceUrl: source.url, lane: source.lane,
          authority: source.authority, detectedAt: now, changeType, previousHash: prior.normalizedHash || '',
          currentHash: result.normalizedHash, rawHash: result.rawHash, httpStatus: result.status,
          finalUrl: result.finalUrl, additions: diff.additions, removals: diff.removals,
          additionCount: diff.additionCount, removalCount: diff.removalCount,
          established: restored ? 'The registered source was reachable again at the retrieval time shown.' : 'The normalized content returned by the registered source differs from the previously preserved version.',
          notEstablished: 'The change alone does not establish wrongdoing, deliberate concealment, authenticity of every statement, or the reason for the change.',
          evidenceGrade: source.authority === 'primary-official' ? 'B' : 'C', status: restored ? 'restored-record' : 'source-change'
        });
      }
      nextSources[source.id] = {
        sourceId: source.id, label: source.label, url: source.url, lane: source.lane, authority: source.authority,
        lastAttempt: now, lastSuccess: now, availability: 'available', consecutiveFailures: 0,
        statusCode: result.status, finalUrl: result.finalUrl, contentType: result.contentType, bytes: result.bytes,
        rawHash: result.rawHash, normalizedHash: result.normalizedHash, firstSnapshot,
        previousNormalizedHash: changed ? prior.normalizedHash : (prior.previousNormalizedHash || '')
      };
    } else {
      const failures = Number(prior.consecutiveFailures || 0) + 1;
      const newlyUnavailable = prior.availability === 'available' && failures >= 2;
      if (newlyUnavailable) detected.push({
        id: sha256(`${source.id}|${now}|unavailable`).slice(0,24), sourceId: source.id, sourceLabel: source.label,
        sourceUrl: source.url, lane: source.lane, authority: source.authority, detectedAt: now,
        changeType: 'source-unavailable', previousHash: prior.normalizedHash || '', currentHash: '', rawHash: '',
        httpStatus: result.status, finalUrl: source.url, additions: [], removals: [], additionCount: 0, removalCount: 0,
        established: 'The registered source failed two consecutive retrieval attempts and was unavailable to this monitor at the retrieval time shown.',
        notEstablished: 'An unavailable source does not establish removal, censorship, wrongdoing or intent. Temporary network, access-control and maintenance explanations remain possible.',
        evidenceGrade: 'B', status: 'missing-or-unavailable-record'
      });
      nextSources[source.id] = {...prior, sourceId: source.id, label: source.label, url: source.url, lane: source.lane,
        authority: source.authority, lastAttempt: now, availability: failures >= 2 ? 'unavailable' : (prior.availability || 'unknown'),
        consecutiveFailures: failures, statusCode: result.status, lastErrorCategory: result.skipped ? 'configuration-skip' : 'retrieval-failure'};
    }
  }
  const mergedChanges = [...detected, ...(priorLedger.changes || [])]
    .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
    .sort((a,b) => new Date(b.detectedAt) - new Date(a.detectedAt)).slice(0, 1000);
  const index = {updated: now, mode, sourceCount: Object.keys(nextSources).length, sources: nextSources};
  const ledger = {updated: now, mode, evidenceBoundary: 'A source change, failure or restoration is a transparency event, not automatic evidence of wrongdoing or intent.', changeCount: mergedChanges.length, changes: mergedChanges};
  const publicData = {updated: now, summary: {registeredSources: (registry.sources || []).length, checkedThisRun: selected.length, changesThisRun: detected.length, retainedChanges: mergedChanges.length, unavailableSources: Object.values(nextSources).filter(s => s.availability === 'unavailable').length}, evidenceBoundary: ledger.evidenceBoundary, changes: mergedChanges.slice(0, 250).map(publicChange)};
  writeJson(indexPath, index); writeJson(ledgerPath, ledger); writeJson(publicPath, publicData);
  writeJson(reportPath, {ok: true, generatedAt: now, mode, checked: selected.length, changed: detected.length, failures: results.filter(r => !r.ok && !r.skipped).length, skipped: results.filter(r => r.skipped).length});
  fs.writeFileSync(pagePath, buildPage(publicData));
  console.log(JSON.stringify({ok:true, checked:selected.length, changes:detected.length, snapshots:Object.keys(nextSources).length}, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
