const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const archiveDir = path.join(root, 'evidence-archive');
const documentsDir = path.join(archiveDir, 'documents');
const snapshotsDir = path.join(dataDir, 'source-snapshots');
const downloadsDir = path.join(root, 'downloads');
const manifestPath = path.join(archiveDir, 'manifest.json');
const indexPath = path.join(dataDir, 'source-snapshot-index.json');
const ledgerPath = path.join(dataDir, 'source-change-ledger.json');
const publicPath = path.join(dataDir, 'source-change-public.json');
const pagePath = path.join(root, 'source-changes.html');
const now = new Date().toISOString();
const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
const maxDocuments = Math.max(0, Number(process.env.SOURCE_DOCUMENTS_PER_RUN || (mode === 'weekly' ? 8 : 4)));
const maxDocumentBytes = Math.max(100000, Number(process.env.SOURCE_DOCUMENT_MAX_BYTES || 15 * 1024 * 1024));
const userAgent = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedEvidencePreservation/2.0 njmgroupfrance@gmail.com';

for (const dir of [archiveDir, documentsDir, downloadsDir]) fs.mkdirSync(dir, { recursive: true });
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeSegment(value = '') { return String(value || 'source').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'source'; }
function safeUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    url.username = ''; url.password = '';
    for (const key of [...url.searchParams.keys()]) if (/(?:api[-_]?key|token|secret|password|authorization|signature)/i.test(key)) url.searchParams.set(key, '[redacted]');
    return url.href;
  } catch { return String(value || '').replace(/([?&](?:api[-_]?key|token|secret|password|authorization|signature)=)[^&#\s]+/gi, '$1[redacted]'); }
}
function sanitizeError(value = '') {
  const text = String(value || '').replace(/(token|secret|key|password|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]').replace(/[A-Za-z0-9+/_-]{36,}={0,2}/g, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (/timeout|abort/i.test(text)) return 'Source request timed out.';
  const http = text.match(/HTTP\s+(\d{3})/i); if (http) return `Source returned HTTP ${http[1]}.`;
  return text || 'Source request failed.';
}
function deepSanitize(value, key = '') {
  if (Array.isArray(value)) return value.map(item => deepSanitize(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, deepSanitize(child, childKey)]));
  if (typeof value !== 'string') return value;
  if (/url|uri|link/i.test(key)) return safeUrl(value);
  if (/error|diagnostic|authorization|token|secret|password/i.test(key)) return sanitizeError(value);
  return value.replace(/([?&](?:api[-_]?key|token|secret|password|authorization|signature)=)[^&#\s]+/gi, '$1[redacted]');
}
function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out); else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}
function changeType(change = {}) { return String(change.changeType || 'content-changed'); }
function enrichment(change = {}) {
  const type = changeType(change);
  const removals = Number(change.removalCount || change.removals?.length || 0);
  const additions = Number(change.additionCount || change.additions?.length || 0);
  return {
    ...deepSanitize(change),
    title: change.title || `${type.replace(/-/g, ' ')}: ${change.sourceLabel || change.sourceId || 'monitored source'}`,
    publicationDate: change.publicationDate || null,
    retrievalDate: change.retrievalDate || change.detectedAt || now,
    factualStatus: change.factualStatus || (type === 'source-unavailable' ? 'source-availability-observation' : 'source-change-observation'),
    mechanism: change.mechanism || 'The registered source was retrieved, canonicalised, hashed and compared with the prior preserved version. Additions and removals are separated from raw byte changes.',
    implication: change.implication || (removals ? 'A disappearance from canonical source text may affect discoverability or disclosure completeness and should be checked against the underlying record, replacement route and archive history.' : 'The difference may represent a new disclosure, correction, routine publishing update, pagination change or technical reorganisation.'),
    alternativeExplanation: change.alternativeExplanation || (type === 'source-unavailable' ? 'Routine maintenance, rate limiting, bot protection, a moved route, DNS failure or transient network conditions may explain the observation.' : 'Template changes, corrected wording, pagination, duplicate cleanup, archival reorganisation or a moved document may explain the difference.'),
    nextRecordRequired: change.nextRecordRequired || [
      'Open the current source and identify the exact added, removed or altered record.',
      'Compare the preserved hashes and versions before drawing a substantive conclusion.',
      'Check for a replacement URL, correction notice, archive copy or official explanation.'
    ],
    correctionRoute: change.correctionRoute || { url: 'contact.html', instructions: 'Submit the source URL, observation date, replacement location and any counter-record.' },
    established: change.established || `The monitor recorded ${additions} addition${additions === 1 ? '' : 's'} and ${removals} removal${removals === 1 ? '' : 's'} in canonical source text.`,
    notEstablished: change.notEstablished || 'The observation does not by itself establish wrongdoing, concealment, document destruction, intent or institutional coordination.'
  };
}
function publicChange(change) {
  const enriched = enrichment(change);
  const allowed = ['id','title','sourceId','sourceLabel','sourceUrl','lane','authority','publicationDate','retrievalDate','detectedAt','changeType','previousHash','currentHash','httpStatus','finalUrl','additions','removals','additionCount','removalCount','established','notEstablished','mechanism','implication','alternativeExplanation','nextRecordRequired','correctionRoute','evidenceGrade','factualStatus','status'];
  return Object.fromEntries(allowed.map(key => [key, enriched[key] ?? null]));
}
function changeFinding(change) {
  const item = publicChange(change);
  return {
    id: `source-change-${item.id}`,
    sourceId: item.sourceId, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, itemUrl: item.sourceUrl,
    lane: item.lane, laneTitle: 'Source Change And Evidence Preservation', authority: item.authority,
    title: item.title, summary: item.established, published: item.detectedAt, firstSeen: item.detectedAt, lastSeen: item.detectedAt,
    status: item.status, evidenceGrade: item.evidenceGrade,
    severity: ['source-unavailable','records-removed','records-added-and-removed'].includes(item.changeType) ? 3 : 2,
    wrongdoingIndicators: [], conclusion: item.established, evidenceBoundary: item.notEstablished,
    mechanism: item.mechanism, implication: item.implication, alternativeExplanation: item.alternativeExplanation,
    nextRecords: item.nextRecordRequired, correctionRoute: item.correctionRoute,
    keywordMatches: ['source change','hash',String(item.changeType).replace(/-/g,' ')]
  };
}
function integrate(file, days, changes) {
  const product = readJson(file, null); if (!product || typeof product !== 'object') return;
  const cutoff = Date.now() - days * 86400000;
  const recent = changes.filter(item => new Date(item.detectedAt || 0).getTime() >= cutoff).slice(0, days === 2 ? 12 : 30);
  const existing = (product.strongestFindings || []).filter(item => !String(item.id || '').startsWith('source-change-'));
  product.sourceChanges = recent.map(publicChange);
  product.summary = { ...(product.summary || {}), meaningfulSourceChanges: recent.length };
  product.strongestFindings = [...existing, ...recent.slice(0, 8).map(changeFinding)].slice(0, days === 2 ? 26 : 48);
  product.sourceChangeConclusion = recent.length ? `${recent.length} meaningful source-change observation${recent.length === 1 ? '' : 's'} were preserved in this reporting window. These are transparency findings, not automatic findings of wrongdoing.` : 'No meaningful source change crossed the publication threshold in this reporting window. This neutral result does not prove that every record outside the registered sources remained unchanged.';
  writeJson(file, product);
}
function directDocumentUrl(value = '') { try { const url = new URL(value); return /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|csv|zip)$/i.test(url.pathname) ? url.href : ''; } catch { return ''; } }
function extension(url, type = '') {
  try { const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase(); if (['pdf','doc','docx','xls','xlsx','ppt','pptx','csv','zip'].includes(ext)) return ext; } catch {}
  if (/pdf/i.test(type)) return 'pdf'; if (/spreadsheet|excel/i.test(type)) return 'xlsx'; if (/presentation|powerpoint/i.test(type)) return 'pptx'; if (/word/i.test(type)) return 'docx'; if (/csv/i.test(type)) return 'csv'; if (/zip/i.test(type)) return 'zip'; return 'bin';
}
async function fetchDocument(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.SOURCE_DOCUMENT_TIMEOUT_MS || 35000));
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': userAgent, accept: 'application/pdf,application/octet-stream,*/*;q=0.5' } });
    const body = Buffer.from(await response.arrayBuffer());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (body.byteLength > maxDocumentBytes) throw new Error(`Response exceeds ${maxDocumentBytes} bytes`);
    return { ok: true, body, finalUrl: response.url || url, contentType: response.headers.get('content-type') || '' };
  } catch (error) { return { ok: false, error: sanitizeError(error.name === 'AbortError' ? 'Timeout' : error.message) }; }
  finally { clearTimeout(timer); }
}
async function preserveDocuments(manifest) {
  if (!maxDocuments || typeof fetch !== 'function') return { preserved: [], failures: [] };
  const evidence = readJson(path.join(dataDir, 'investigation-ledger.json'), { findings: [] });
  const known = new Set((manifest.documents || []).map(item => item.url).filter(Boolean));
  const candidates = [];
  for (const finding of evidence.findings || []) {
    const url = directDocumentUrl(finding.itemUrl || finding.sourceUrl || '');
    const publicUrl = safeUrl(url);
    if (!url || known.has(publicUrl) || candidates.some(item => item.url === publicUrl)) continue;
    candidates.push({ sourceId: finding.sourceId || 'source', title: finding.title || 'Public document', url: publicUrl, fetchUrl: url, published: finding.published || null });
    if (candidates.length >= maxDocuments) break;
  }
  const preserved = [], failures = [];
  for (const candidate of candidates) {
    const response = await fetchDocument(candidate.fetchUrl);
    if (!response.ok) { failures.push({ sourceId: candidate.sourceId, url: candidate.url, retrievedAt: now, error: response.error }); continue; }
    const hash = sha256(response.body), ext = extension(candidate.fetchUrl, response.contentType), dir = path.join(documentsDir, safeSegment(candidate.sourceId));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${hash}.${ext}`), metadata = path.join(dir, `${hash}.metadata.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, response.body);
    writeJson(metadata, { sourceId: candidate.sourceId, title: candidate.title, originalUrl: candidate.url, finalUrl: safeUrl(response.finalUrl), publicationDate: candidate.published, retrievedAt: now, contentType: response.contentType, bytes: response.body.byteLength, sha256: hash, evidenceBoundary: 'Preservation confirms the retrieved bytes and provenance at this time. It does not authenticate every statement in the document or establish wrongdoing.' });
    preserved.push({ sourceId: candidate.sourceId, title: candidate.title, url: candidate.url, publicationDate: candidate.published, retrievedAt: now, sha256: hash, bytes: response.body.byteLength, file: path.relative(root, file).replace(/\\/g,'/'), metadata: path.relative(root, metadata).replace(/\\/g,'/') });
    known.add(candidate.url);
  }
  return { preserved, failures };
}
function buildPage(publicData) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const cards = publicData.changes.length ? publicData.changes.map(change => {
    const additions = (change.additions || []).slice(0,5).map(value => `<li>${esc(value)}</li>`).join('');
    const removals = (change.removals || []).slice(0,5).map(value => `<li>${esc(value)}</li>`).join('');
    const next = (change.nextRecordRequired || []).map(value => `<li>${esc(value)}</li>`).join('');
    return `<article class="change-card" id="change-${esc(change.id)}"><div class="change-meta"><span class="grade">GRADE ${esc(change.evidenceGrade)}</span><span>${esc(String(change.changeType).replace(/-/g,' '))}</span><span>${esc(String(change.detectedAt || '').slice(0,10))}</span></div><h2><a href="${esc(change.sourceUrl)}" rel="noopener">${esc(change.sourceLabel)}</a></h2><p><strong>What is established:</strong> ${esc(change.established)}</p><p><strong>What is not established:</strong> ${esc(change.notEstablished)}</p><p><strong>Mechanism:</strong> ${esc(change.mechanism)}</p><p><strong>Implication:</strong> ${esc(change.implication)}</p><p><strong>Alternative explanation:</strong> ${esc(change.alternativeExplanation)}</p>${additions?`<h3>Additions detected</h3><ul>${additions}</ul>`:''}${removals?`<h3>Removals detected</h3><ul>${removals}</ul>`:''}${next?`<h3>Next record required</h3><ul>${next}</ul>`:''}<p><a href="contact.html">Submit a sourced correction or replacement record</a></p><p class="hash">Current SHA-256: ${esc(change.currentHash || 'unavailable')}</p></article>`;
  }).join('\n') : '<article class="change-card"><h2>No meaningful source change recorded yet</h2><p>The monitor is active. A neutral result does not prove that no external change occurred outside the registered sources.</p></article>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Source Change Ledger | Matrix Reprogrammed</title><meta name="description" content="Evidence-bounded additions, removals, restorations and source availability changes across registered public-record sources."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><style>.change-wrap{max-width:1100px;margin:auto;padding:2rem 1rem}.change-card{border:1px solid rgba(216,181,106,.28);border-radius:16px;padding:1.2rem;margin:1rem 0;background:rgba(0,0,0,.82)}.change-meta{display:flex;gap:.6rem;flex-wrap:wrap;font-size:.8rem;text-transform:uppercase}.change-meta span{border:1px solid rgba(216,181,106,.3);border-radius:999px;padding:.25rem .55rem}.grade{color:#d8b56a}.hash{font-family:monospace;font-size:.76rem;overflow-wrap:anywhere;color:#c8b98c}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="investigation-source-ledger.html">Source Ledger</a><a href="search.html">Search</a></nav></header><main class="change-wrap"><div class="eyebrow">Public evidence preservation</div><h1>SOURCE CHANGE LEDGER</h1><p class="lead">Registered public-record sources are compared over time. Meaningful additions, removals, failures and restorations are recorded with retrieval dates and SHA-256 hashes.</p><p><strong>Evidence boundary:</strong> ${esc(publicData.evidenceBoundary)}</p><div class="cta-row"><a class="btn" href="data/source-change-public.json">Public JSON</a><a class="btn alt" href="daily-investigation-conclusions.html">Daily Conclusions</a></div>${cards}</main></div></body></html>`;
}

(async () => {
  let index = deepSanitize(readJson(indexPath, { updated: null, sources: {} }));
  let ledger = readJson(ledgerPath, { updated: null, changes: [] });
  let publicData = readJson(publicPath, { updated: now, summary: {}, evidenceBoundary: 'A source change, failure or restoration is a transparency event, not automatic evidence of wrongdoing or intent.', changes: [] });
  const manifest = readJson(manifestPath, { version: 1, updated: null, sources: {}, snapshots: [], documents: [], documentFailures: [] });

  const snapshots = [];
  for (const file of walkJson(snapshotsDir)) {
    const snapshot = deepSanitize(readJson(file, {}));
    writeJson(file, snapshot);
    snapshots.push({ sourceId: snapshot.sourceId || path.basename(path.dirname(file)), retrievedAt: snapshot.retrievedAt || null, rawHash: snapshot.rawHash || null, normalizedHash: snapshot.normalizedHash || null, bytes: snapshot.bytes || null, file: path.relative(root, file).replace(/\\/g,'/'), fileHash: sha256(fs.readFileSync(file)) });
  }

  const priorSources = manifest.sources || {};
  for (const [sourceId, source] of Object.entries(index.sources || {})) {
    const prior = priorSources[sourceId] || {};
    const history = Array.isArray(prior.failureHistory) ? prior.failureHistory : [];
    if (source.availability !== 'available' && source.lastAttempt && !history.some(item => item.observedAt === source.lastAttempt)) {
      history.unshift({ observedAt: source.lastAttempt, statusCode: source.statusCode || null, category: source.lastErrorCategory || 'retrieval-failure', error: sanitizeError(source.lastError || source.lastErrorCategory || 'retrieval failure') });
    }
    manifest.sources[sourceId] = { sourceId, label: source.label, sourceUrl: safeUrl(source.url), lane: source.lane, authority: source.authority, availability: source.availability, lastAttempt: source.lastAttempt, lastSuccess: source.lastSuccess || prior.lastSuccess || null, rawHash: source.rawHash || prior.rawHash || null, normalizedHash: source.normalizedHash || prior.normalizedHash || null, consecutiveFailures: Number(source.consecutiveFailures || 0), failureHistory: history.slice(0,100) };
  }

  const enrichedChanges = (ledger.changes || publicData.changes || []).map(enrichment);
  ledger = { ...deepSanitize(ledger), evidenceBoundary: 'A source change, failure or restoration is a transparency event, not automatic evidence of wrongdoing, concealment or intent.', changes: enrichedChanges };
  publicData = { ...deepSanitize(publicData), evidenceBoundary: ledger.evidenceBoundary, changes: enrichedChanges.slice(0,250).map(publicChange) };
  const documents = await preserveDocuments(manifest);
  manifest.version = 1; manifest.updated = now;
  manifest.snapshots = [...snapshots, ...(manifest.snapshots || [])].filter((item,index,list)=>list.findIndex(other=>other.fileHash===item.fileHash)===index).slice(0,5000);
  manifest.documents = [...documents.preserved, ...(manifest.documents || [])].filter((item,index,list)=>list.findIndex(other=>other.sha256===item.sha256)===index).slice(0,5000);
  manifest.documentFailures = [...documents.failures, ...(manifest.documentFailures || [])].slice(0,500);
  manifest.boundary = 'The archive preserves public source observations and retrieved documents. It does not authenticate every claim inside them or convert source changes into proof of wrongdoing.';

  writeJson(indexPath, index); writeJson(ledgerPath, ledger); writeJson(publicPath, publicData); writeJson(manifestPath, manifest);
  integrate(path.join(dataDir,'daily-investigation-conclusions.json'),2,enrichedChanges);
  integrate(path.join(dataDir,'weekly-investigation-conclusions.json'),8,enrichedChanges);
  fs.writeFileSync(pagePath, buildPage(publicData));
  writeJson(path.join(downloadsDir,'source-change-preservation-hardening-report.json'), { ok: true, generatedAt: now, mode, sources: Object.keys(index.sources || {}).length, changes: enrichedChanges.length, snapshots: snapshots.length, documentsPreserved: documents.preserved.length, documentFailures: documents.failures.length, publicFields: ['title','sourceUrl','retrievalDate','evidenceGrade','factualStatus','established','notEstablished','mechanism','implication','alternativeExplanation','nextRecordRequired','correctionRoute'], boundary: publicData.evidenceBoundary });
  console.log(`Source change hardening complete: ${enrichedChanges.length} changes, ${snapshots.length} snapshots and ${documents.preserved.length} documents processed.`);
})().catch(error => { console.error(sanitizeError(error.stack || error.message)); process.exit(1); });
