const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  sha256,
  canonicalContent,
  compact,
  sanitizeError,
  mapRecords,
  classifyChange
} = require('./source-change-utils');

const root = process.cwd();
const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
if (!['daily', 'weekly'].includes(mode)) {
  console.error('Usage: node scripts/preserve-investigation-sources.js daily|weekly');
  process.exit(2);
}

const now = new Date();
const detectedAt = now.toISOString();
const endDate = detectedAt.slice(0, 10);
const startDate = new Date(now.getTime() - (mode === 'weekly' ? 8 : 3) * 86400000).toISOString().slice(0, 10);
const archiveRoot = path.join(root, 'evidence-archive');
const sourceArchiveRoot = path.join(archiveRoot, 'source-pages');
const documentArchiveRoot = path.join(archiveRoot, 'documents');
const downloadsDir = path.join(root, 'downloads');
const dataDir = path.join(root, 'data');
const manifestPath = path.join(archiveRoot, 'manifest.json');
const publicChangesPath = path.join(dataDir, 'investigation-source-changes.json');
const MAX_BODY_BYTES = Number(process.env.SOURCE_ARCHIVE_MAX_BYTES || 8 * 1024 * 1024);
const MAX_DOCUMENT_BYTES = Number(process.env.SOURCE_DOCUMENT_MAX_BYTES || 25 * 1024 * 1024);
const MAX_DOCUMENTS_PER_RUN = Number(process.env.SOURCE_DOCUMENTS_PER_RUN || 10);
const USER_AGENT = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedEvidencePreservation/1.0 njmgroupfrance@gmail.com';

for (const dir of [archiveRoot, sourceArchiveRoot, documentArchiveRoot, downloadsDir, dataDir]) fs.mkdirSync(dir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function safeSegment(value = '') {
  return String(value || 'source').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'source';
}
function timestampSegment(value = detectedAt) {
  return String(value).replace(/[:.]/g, '-');
}
function safePublicUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:api[-_]?key|token|secret|password|authorization|signature)/i.test(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.href;
  } catch { return String(value || '').replace(/([?&](?:api[-_]?key|token|secret|password|authorization|signature)=)[^&#\s]+/gi, '$1[redacted]'); }
}
function normalizedRecordUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return String(value || '').trim(); }
}
function template(value) {
  return String(value || '')
    .replace(/\{\{START_DATE\}\}/g, startDate)
    .replace(/\{\{END_DATE\}\}/g, endDate)
    .replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => process.env[key] || `{{${key}}}`);
}
function templateObject(value) {
  if (Array.isArray(value)) return value.map(templateObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, templateObject(child)]));
  return typeof value === 'string' ? template(value) : value;
}
function requiredEnvironmentMissing(source) {
  return (source.requiredEnv || []).filter(key => !process.env[key]);
}
function snapshotExtension(contentType = '', source = {}) {
  if (/json/i.test(contentType) || /json/i.test(source.type || '')) return 'json';
  if (/xml|rss|atom/i.test(contentType) || /rss/i.test(source.type || '')) return 'xml';
  if (/pdf/i.test(contentType)) return 'pdf';
  return 'html';
}
function evidenceGrade(source) {
  if (source.authority === 'primary-official') return 'B';
  if (source.authority === 'document-archive' || source.authority === 'credible-investigative-archive') return 'C';
  return 'C';
}
function isFetched(status) {
  return status === 'fetched';
}
function recordMapForSource(ledger, sourceId, itemIds = []) {
  const allowed = new Set(itemIds);
  const records = [];
  const seen = new Set();
  for (const item of (ledger.findings || [])) {
    if (!item || item.sourceId !== sourceId || (allowed.size && !allowed.has(item.id))) continue;
    const url = normalizedRecordUrl(item.itemUrl || item.sourceUrl || '');
    const title = compact(item.title || item.id || 'Untitled record', 220);
    const stableId = sha256(`${sourceId}|${url.toLowerCase()}|${title.toLowerCase()}`).slice(0, 24);
    if (seen.has(stableId)) continue;
    seen.add(stableId);
    records.push({ id: stableId, observedFindingId: item.id, title, url, published: item.published, summary: compact(item.summary || item.conclusion || '', 500) });
    if (records.length >= 150) break;
  }
  return records;
}
function eventTitle(source, changeType) {
  const labels = {
    restored: 'Source restored',
    unavailable: 'Source became unavailable',
    'records-added-and-removed': 'Source index added and removed records',
    'records-removed': 'Records disappeared from source index',
    'records-added': 'New records appeared on source index',
    'content-changed': 'Source wording or content changed'
  };
  return `${labels[changeType] || 'Source changed'}: ${source.label}`;
}
function establishedText(change) {
  const added = change.addedIds.length;
  const removed = change.removedIds.length;
  if (change.changeType === 'restored') return 'The monitored source responded again after a prior failed or unavailable observation. The restored page was hashed and preserved.';
  if (change.changeType === 'unavailable') return 'The monitored source did not return a usable response after previously being available. The failure time and prior preserved version remain recorded.';
  if (change.changeType === 'records-added-and-removed') return `The monitored source index added ${added} record${added === 1 ? '' : 's'} and no longer listed ${removed} previously observed record${removed === 1 ? '' : 's'} during this comparison.`;
  if (change.changeType === 'records-removed') return `The monitored source index no longer listed ${removed} previously observed record${removed === 1 ? '' : 's'} during this comparison.`;
  if (change.changeType === 'records-added') return `The monitored source index added ${added} record${added === 1 ? '' : 's'} during this comparison.`;
  return 'The canonical source content changed between preserved observations. The previous and current versions were hashed for comparison.';
}
function implicationText(change) {
  if (change.changeType === 'records-removed') return 'A removed listing may affect disclosure completeness, discoverability or the public record trail and should be checked against the underlying document and archive history.';
  if (change.changeType === 'unavailable') return 'Temporary or persistent unavailability can interrupt public verification. Continued checks are needed before describing the record as removed.';
  if (change.changeType === 'restored') return 'Restoration improves public access but does not explain why the source was unavailable or whether its content changed during the gap.';
  return 'The change may represent a new disclosure, correction, ordinary publishing update or technical reordering. The underlying record controls any substantive conclusion.';
}
function alternativeText(change) {
  if (change.changeType === 'unavailable') return 'Routine maintenance, rate limiting, access controls, network failure or a moved route may explain the observation.';
  if (change.changeType === 'records-removed') return 'Pagination, filtering, archival reorganisation, duplicate cleanup or a moved document may explain why an item is no longer listed.';
  return 'Routine publishing, metadata refresh, template changes, pagination or corrected wording may explain the difference.';
}
function nextRecords(change) {
  const items = [
    'Open the current source and identify the exact added, removed or altered record.',
    'Compare the preserved hashes and archived versions before drawing a substantive conclusion.',
    'Check for a replacement URL, correction notice, court update, archive copy or official explanation.'
  ];
  if (change.removedIds.length) items.unshift('Locate the removed record directly and test whether it was moved, superseded, archived or withdrawn.');
  if (change.changeType === 'unavailable') items.unshift('Retry the source and verify DNS, HTTP status, redirects and any official service notice.');
  return items;
}
function correctionRoute() {
  return {
    url: 'contact.html',
    instructions: 'Submit the source URL, observation date, replacement location and any counter-record. Corrections remain public and evidence-bounded.'
  };
}

async function fetchWithLimit(url, options, maxBytes, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
    return {
      ok: true,
      statusCode: response.status,
      finalUrl: response.url || url,
      contentType: response.headers.get('content-type') || '',
      etag: response.headers.get('etag') || '',
      lastModified: response.headers.get('last-modified') || '',
      buffer
    };
  } catch (error) {
    return { ok: false, error: error && error.name === 'AbortError' ? 'Timeout' : (error.message || String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

async function refetchSource(source) {
  const missing = requiredEnvironmentMissing(source);
  if (missing.length) return { ok: false, skipped: true, error: `Missing environment: ${missing.join(', ')}` };
  const url = template(source.url);
  const headers = {
    'user-agent': USER_AGENT,
    accept: source.type === 'rss' ? 'application/atom+xml,application/rss+xml,text/xml;q=0.9,*/*;q=0.5' : 'application/json,text/html,application/pdf;q=0.9,*/*;q=0.5'
  };
  const options = { method: source.type === 'json-post' ? 'POST' : 'GET', headers };
  if (source.type === 'json-post') {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(templateObject(source.payload || {}));
  }
  return fetchWithLimit(url, options, MAX_BODY_BYTES, Number(process.env.SOURCE_ARCHIVE_TIMEOUT_MS || 30000));
}

function preserveSnapshot(source, response, canonicalHash, observedHash) {
  const sourceDir = path.join(sourceArchiveRoot, safeSegment(source.id));
  fs.mkdirSync(sourceDir, { recursive: true });
  const extension = snapshotExtension(response.contentType, source);
  const fileBase = `${timestampSegment()}-${canonicalHash.slice(0, 16)}`;
  const rawRelative = path.posix.join('evidence-archive', 'source-pages', safeSegment(source.id), `${fileBase}.${extension}.gz`);
  const metadataRelative = path.posix.join('evidence-archive', 'source-pages', safeSegment(source.id), `${fileBase}.metadata.json`);
  const rawPath = path.join(root, rawRelative);
  const metadataPath = path.join(root, metadataRelative);
  if (!fs.existsSync(rawPath)) fs.writeFileSync(rawPath, zlib.gzipSync(response.buffer, { level: 9 }));
  writeJson(metadataPath, {
    sourceId: source.id,
    label: source.label,
    sourceUrl: source.url,
    requestedAt: detectedAt,
    finalUrl: safePublicUrl(response.finalUrl),
    statusCode: response.statusCode,
    contentType: response.contentType,
    bytes: response.buffer.byteLength,
    rawHash: sha256(response.buffer),
    observedInvestigationHash: observedHash || '',
    canonicalHash,
    etag: response.etag,
    lastModified: response.lastModified,
    evidenceBoundary: 'This is an archived copy of a public source observation. A changed page or listing does not by itself establish wrongdoing, intent or document destruction.'
  });
  return { raw: rawRelative, metadata: metadataRelative, canonicalHash, rawHash: sha256(response.buffer), bytes: response.buffer.byteLength };
}

function directDocumentUrl(value = '') {
  try {
    const url = new URL(value);
    return /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|csv|zip)(?:$|[?#])/i.test(url.pathname + url.search) ? url.href : '';
  } catch { return ''; }
}
function extensionFromUrl(value = '', contentType = '') {
  try {
    const ext = path.extname(new URL(value).pathname).toLowerCase().replace('.', '');
    if (['pdf','doc','docx','xls','xlsx','ppt','pptx','csv','zip'].includes(ext)) return ext;
  } catch {}
  if (/pdf/i.test(contentType)) return 'pdf';
  if (/spreadsheet|excel/i.test(contentType)) return 'xlsx';
  if (/presentation|powerpoint/i.test(contentType)) return 'pptx';
  if (/word/i.test(contentType)) return 'docx';
  if (/csv/i.test(contentType)) return 'csv';
  if (/zip/i.test(contentType)) return 'zip';
  return 'bin';
}

async function preserveDocument(source, record, knownUrls) {
  const url = directDocumentUrl(record.url);
  if (!url || knownUrls.has(url)) return null;
  const response = await fetchWithLimit(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, accept: 'application/pdf,application/octet-stream,*/*;q=0.5' } }, MAX_DOCUMENT_BYTES, Number(process.env.SOURCE_DOCUMENT_TIMEOUT_MS || 35000));
  if (!response.ok) return { ok: false, sourceId: source.id, url, error: sanitizeError(response.error) };
  const fileHash = sha256(response.buffer);
  const extension = extensionFromUrl(url, response.contentType);
  const sourceDir = path.join(documentArchiveRoot, safeSegment(source.id));
  fs.mkdirSync(sourceDir, { recursive: true });
  const relative = path.posix.join('evidence-archive', 'documents', safeSegment(source.id), `${fileHash}.${extension}`);
  const metadataRelative = path.posix.join('evidence-archive', 'documents', safeSegment(source.id), `${fileHash}.metadata.json`);
  const filePath = path.join(root, relative);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, response.buffer);
  writeJson(path.join(root, metadataRelative), {
    sourceId: source.id,
    sourceLabel: source.label,
    recordId: record.id,
    title: record.title,
    originalUrl: safePublicUrl(url),
    finalUrl: safePublicUrl(response.finalUrl),
    retrievedAt: detectedAt,
    publicationDate: record.published || null,
    contentType: response.contentType,
    bytes: response.buffer.byteLength,
    sha256: fileHash,
    evidenceBoundary: 'Preservation confirms the retrieved bytes and provenance at this time. It does not authenticate every statement inside the document or establish wrongdoing.'
  });
  knownUrls.add(url);
  return { ok: true, sourceId: source.id, recordId: record.id, title: record.title, url: safePublicUrl(url), file: relative, metadata: metadataRelative, sha256: fileHash, bytes: response.buffer.byteLength, retrievedAt: detectedAt };
}

function publicEvent(source, change, canonicalHash, snapshot) {
  const addedRecords = mapRecords(change.addedIds, change.currentRecords, change.previousRecords);
  const removedRecords = mapRecords(change.removedIds, change.currentRecords, change.previousRecords);
  return {
    id: sha256(`${source.id}|${detectedAt}|${change.changeType}|${canonicalHash}|${change.addedIds.join(',')}|${change.removedIds.join(',')}`).slice(0, 24),
    sourceId: source.id,
    title: eventTitle(source, change.changeType),
    source: source.label,
    sourceUrl: safePublicUrl(source.url),
    lane: source.lane,
    authority: source.authority,
    detectedAt,
    publicationDate: null,
    retrievalDate: detectedAt,
    evidenceGrade: evidenceGrade(source),
    factualStatus: 'source-change-observation',
    changeType: change.changeType,
    previousStatus: change.previousStatus,
    currentStatus: change.currentStatus,
    previousCanonicalHash: change.previous && change.previous.canonicalHash ? change.previous.canonicalHash : null,
    currentCanonicalHash: canonicalHash || null,
    addedRecords,
    removedRecords,
    whatIsEstablished: establishedText(change),
    whatIsNotEstablished: 'A change, removal, outage, restoration or archive difference does not by itself prove concealment, destruction, criminal conduct, intent or institutional coordination.',
    mechanism: 'The source is retrieved on schedule, canonicalised, hashed and compared with the prior preserved observation. Added and removed record identifiers are recorded separately from raw page churn.',
    implication: implicationText(change),
    alternativeExplanation: alternativeText(change),
    nextRecordRequired: nextRecords(change),
    correctionRoute: correctionRoute(),
    preserved: Boolean(snapshot),
    preservationHash: snapshot ? snapshot.rawHash : null
  };
}

function changeFinding(event) {
  const severity = event.changeType === 'unavailable' || event.changeType === 'records-removed' ? 3 : 2;
  return {
    id: `source-change-${event.id}`,
    sourceId: event.sourceId,
    sourceLabel: event.source,
    sourceUrl: event.sourceUrl,
    itemUrl: event.sourceUrl,
    lane: event.lane,
    laneTitle: 'Source Change And Evidence Preservation',
    authority: event.authority,
    title: event.title,
    summary: event.whatIsEstablished,
    published: event.detectedAt,
    firstSeen: event.detectedAt,
    lastSeen: event.detectedAt,
    status: event.changeType === 'records-removed' ? 'source-record-removed' : `source-${event.changeType}`,
    evidenceGrade: event.evidenceGrade,
    severity,
    wrongdoingIndicators: [],
    conclusion: event.whatIsEstablished,
    evidenceBoundary: event.whatIsNotEstablished,
    mechanism: event.mechanism,
    implication: event.implication,
    alternativeExplanation: event.alternativeExplanation,
    nextRecords: event.nextRecordRequired,
    correctionRoute: event.correctionRoute,
    keywordMatches: ['source change', 'hash', event.changeType.replace(/-/g, ' ')],
    rawMeta: { sourceChangeId: event.id, preservationHash: event.preservationHash }
  };
}

function integrateProduct(file, days, events) {
  const product = readJson(file, null);
  if (!product || typeof product !== 'object') return;
  const cutoff = Date.now() - days * 86400000;
  const recentEvents = events.filter(event => new Date(event.detectedAt || 0).getTime() >= cutoff).slice(0, days === 2 ? 12 : 30);
  const existing = (product.strongestFindings || []).filter(item => !String(item.id || '').startsWith('source-change-'));
  product.sourceChanges = recentEvents;
  product.summary = { ...(product.summary || {}), meaningfulSourceChanges: recentEvents.length };
  product.strongestFindings = [...existing, ...recentEvents.slice(0, 8).map(changeFinding)].slice(0, days === 2 ? 26 : 48);
  if (recentEvents.length) {
    const removals = recentEvents.filter(event => event.changeType === 'records-removed').length;
    const outages = recentEvents.filter(event => event.changeType === 'unavailable').length;
    product.sourceChangeConclusion = `${recentEvents.length} meaningful source change${recentEvents.length === 1 ? '' : 's'} were preserved in this reporting window${removals ? `, including ${removals} removal observation${removals === 1 ? '' : 's'}` : ''}${outages ? ` and ${outages} availability failure${outages === 1 ? '' : 's'}` : ''}. These are evidence-preservation findings, not automatic findings of wrongdoing.`;
  } else {
    product.sourceChangeConclusion = 'No meaningful source change crossed the publication threshold in this reporting window. Raw or template churn may still have occurred without altering the canonical record index.';
  }
  writeJson(file, product);
}

(async () => {
  if (typeof fetch !== 'function') throw new Error('Node 18+ fetch is required');
  const registry = readJson(path.join(dataDir, 'investigation-source-registry.json'), { sources: [] });
  const state = readJson(path.join(dataDir, 'investigation-source-state.json'), { sources: {} });
  const ledger = readJson(path.join(dataDir, 'investigation-ledger.json'), { findings: [] });
  const manifest = readJson(manifestPath, { version: 1, updated: null, sources: {}, snapshots: [], documents: [], documentFailures: [] });
  const priorPublic = readJson(publicChangesPath, { changes: [] });
  const selected = (registry.sources || []).filter(source => (source.frequency || []).includes(mode));
  const events = [];
  const runChecks = [];
  const snapshotRecords = [];
  const documentRecords = [];
  const documentFailures = [];
  const knownDocumentUrls = new Set((manifest.documents || []).map(item => item.url).filter(Boolean));
  let documentsAttempted = 0;

  for (const source of selected) {
    const current = state.sources?.[source.id] || { sourceId: source.id, status: 'not-observed', itemIds: [] };
    const previous = manifest.sources?.[source.id] || {};
    const currentRecords = recordMapForSource(ledger, source.id, current.itemIds || []);
    const observation = { ...current, itemIds: currentRecords.map(record => record.id) };
    let canonicalHash = previous.canonicalHash || '';
    let snapshot = null;
    let refetch = null;
    const needsContent = isFetched(current.status) && (!previous.bodyHash || previous.bodyHash !== current.bodyHash || previous.status !== current.status || !previous.canonicalHash);
    if (needsContent) {
      refetch = await refetchSource(source);
      if (refetch.ok) {
        const canonical = canonicalContent(refetch.buffer, refetch.contentType);
        canonicalHash = sha256(Buffer.from(canonical, 'utf8'));
      } else if (!canonicalHash && current.bodyHash) {
        canonicalHash = current.bodyHash;
      }
    }
    const change = classifyChange({ previous, current: observation, canonicalHash, currentRecords, detectedAt });
    change.previous = previous;

    if (refetch && refetch.ok && (change.firstSnapshot || change.meaningful || change.changeType === 'technical-churn')) {
      snapshot = preserveSnapshot(source, refetch, canonicalHash, current.bodyHash || '');
      snapshotRecords.push({ sourceId: source.id, detectedAt, changeType: change.changeType, ...snapshot });
    }

    if (change.meaningful) events.push(publicEvent(source, change, canonicalHash, snapshot));

    for (const record of currentRecords) {
      if (documentsAttempted >= MAX_DOCUMENTS_PER_RUN) break;
      if (!directDocumentUrl(record.url) || knownDocumentUrls.has(record.url)) continue;
      documentsAttempted += 1;
      const preserved = await preserveDocument(source, record, knownDocumentUrls);
      if (preserved && preserved.ok) documentRecords.push(preserved);
      else if (preserved) documentFailures.push(preserved);
    }

    const priorFailures = Array.isArray(previous.failureHistory) ? previous.failureHistory : [];
    const failureHistory = isFetched(current.status) ? priorFailures : [{
      observedAt: detectedAt,
      status: current.status || 'not-observed',
      statusCode: current.statusCode || null,
      error: sanitizeError(current.error || current.status),
      finalUrl: safePublicUrl(current.finalUrl || source.url)
    }, ...priorFailures].slice(0, 100);

    manifest.sources[source.id] = {
      sourceId: source.id,
      label: source.label,
      sourceUrl: safePublicUrl(source.url),
      lane: source.lane,
      authority: source.authority,
      status: current.status || 'not-observed',
      lastObserved: detectedAt,
      lastSuccess: current.lastSuccess || previous.lastSuccess || null,
      lastFailure: !isFetched(current.status) ? detectedAt : (previous.lastFailure || null),
      sanitizedFailure: !isFetched(current.status) ? sanitizeError(current.error || current.status) : '',
      bodyHash: current.bodyHash || previous.bodyHash || '',
      canonicalHash,
      itemIds: observation.itemIds,
      records: currentRecords,
      lastSnapshot: snapshot || previous.lastSnapshot || null,
      lastChangeType: change.changeType,
      consecutiveFailures: isFetched(current.status) ? 0 : Number(previous.consecutiveFailures || 0) + 1,
      failureHistory
    };
    runChecks.push({
      sourceId: source.id,
      status: current.status || 'not-observed',
      changeType: change.changeType,
      meaningful: change.meaningful,
      snapshotPreserved: Boolean(snapshot),
      refetchOk: refetch ? Boolean(refetch.ok) : null,
      error: refetch && !refetch.ok ? sanitizeError(refetch.error) : ''
    });
  }

  const mergedChanges = [...events, ...(priorPublic.changes || [])]
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
    .sort((a, b) => new Date(b.detectedAt || 0) - new Date(a.detectedAt || 0))
    .slice(0, 500);
  const dayCutoff = Date.now() - 86400000;
  const last24h = mergedChanges.filter(item => new Date(item.detectedAt || 0).getTime() >= dayCutoff);
  const publicChanges = {
    updated: detectedAt,
    mode,
    title: 'Investigation Source Changes',
    boundary: 'A changed, removed, restored or unavailable source is an evidence-preservation observation. It does not by itself prove concealment, destruction, misconduct, intent or criminal wrongdoing.',
    methodology: 'Registered sources are retrieved on schedule, canonicalised, hashed and compared with the previous preserved observation. Added and removed record identifiers are separated from template and metadata churn.',
    summary: {
      monitoredSources: (registry.sources || []).length,
      sourcesCheckedThisRun: selected.length,
      meaningfulChangesThisRun: events.length,
      meaningfulChangesLast24Hours: last24h.length,
      removalObservationsLast24Hours: last24h.filter(item => item.changeType === 'records-removed').length,
      unavailableSourcesLast24Hours: last24h.filter(item => item.changeType === 'unavailable').length,
      restoredSourcesLast24Hours: last24h.filter(item => item.changeType === 'restored').length,
      preservedSnapshotsThisRun: snapshotRecords.length,
      preservedDocumentsThisRun: documentRecords.length
    },
    changes: mergedChanges
  };
  writeJson(publicChangesPath, publicChanges);

  manifest.version = 1;
  manifest.updated = detectedAt;
  manifest.lastMode = mode;
  manifest.snapshots = [...snapshotRecords, ...(manifest.snapshots || [])]
    .filter((item, index, all) => all.findIndex(other => other.raw === item.raw) === index);
  manifest.documents = [...documentRecords, ...(manifest.documents || [])]
    .filter((item, index, all) => all.findIndex(other => other.sha256 === item.sha256) === index);
  manifest.documentFailures = [...documentFailures, ...(manifest.documentFailures || [])].slice(0, 250);
  manifest.boundary = 'The archive preserves public source observations and retrieved documents. It does not authenticate every claim inside them or convert source changes into proof of wrongdoing.';
  writeJson(manifestPath, manifest);

  integrateProduct(path.join(dataDir, 'daily-investigation-conclusions.json'), 2, mergedChanges);
  integrateProduct(path.join(dataDir, 'weekly-investigation-conclusions.json'), 8, mergedChanges);

  const report = {
    ok: runChecks.some(check => check.status === 'fetched') || selected.length === 0,
    generatedAt: detectedAt,
    mode,
    selectedSources: selected.length,
    meaningfulChanges: events.length,
    snapshotsPreserved: snapshotRecords.length,
    documentsPreserved: documentRecords.length,
    documentFailures: documentFailures.length,
    checks: runChecks,
    events,
    boundary: publicChanges.boundary
  };
  writeJson(path.join(downloadsDir, 'source-change-preservation-report.json'), report);
  console.log(`Source change preservation complete: ${selected.length} sources checked, ${events.length} meaningful changes, ${snapshotRecords.length} snapshots and ${documentRecords.length} documents preserved.`);
  if (!report.ok) {
    console.error('Source change preservation could not confirm a fetched source in this run. Existing evidence remains preserved.');
    process.exit(1);
  }
})().catch(error => {
  console.error(`Source change preservation failed: ${error.stack || error.message}`);
  process.exit(1);
});
