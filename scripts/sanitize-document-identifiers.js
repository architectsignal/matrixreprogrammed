const fs = require('fs');
const path = require('path');

const root = process.cwd();
const manifestPath = path.join(root, 'data', 'document-extraction-index.json');
const publicPath = path.join(root, 'data', 'document-library.json');
const pagePath = path.join(root, 'document-library.html');
const reportPath = path.join(root, 'downloads', 'document-identifier-quality-report.json');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').replace(/[),.;:]+$/g, '').trim(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function dedupe(values, limit = 60) {
  const map = new Map();
  for (const item of values || []) {
    if (!item?.type || !item?.value) continue;
    const key = `${item.type}|${String(item.value).toLowerCase()}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, limit);
}
function validIdentifier(type, value) {
  const text = clean(value);
  if (text.length < 4 || text.length > 80) return false;
  if (/^(?:for|doc|document|no|number|notice|order|case|file|phmsa|unknown|none)$/i.test(text)) return false;
  if (type === 'doi') return /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(text);
  if (!/\d/.test(text)) return false;
  if (type === 'case-or-docket') return /^[A-Z0-9][A-Z0-9._:/-]{3,79}$/i.test(text);
  if (type === 'report') return /^(?:GAO|OIG|DOJ|SEC|FTC|CFTC|FBI|CIA|DOD|HHS|EPA|NASA|FINRA|FR)(?:\s+DOC\.?)?[-\s][A-Z0-9][A-Z0-9._/-]{2,60}$/i.test(text);
  if (type === 'release') return /^[A-Z0-9][A-Z0-9._:/-]{3,79}$/i.test(text);
  if (type === 'federal-register') return /^\d{4}-\d{4,}$/i.test(text);
  if (type === 'sec-accession') return /^\d{10}-\d{2}-\d{6}$/i.test(text);
  return false;
}
function extractIdentifiers(text) {
  const value = String(text || '');
  const candidates = [];
  const patterns = [
    ['doi', /\b(10\.\d{4,9}\/[\w.()/:;-]+)/gi],
    ['case-or-docket', /\b(?:case|docket|civil action|criminal action|file)\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9._:/-]{3,79})/gi],
    ['report', /\b((?:GAO|OIG|DOJ|SEC|FTC|CFTC|FBI|CIA|DOD|HHS|EPA|NASA|FINRA)[-\s](?:NO\.?\s*)?[A-Z0-9][A-Z0-9._/-]{2,60})\b/gi],
    ['report', /\b(FR\s+\d{3,7})\b/gi],
    ['federal-register', /\bFR\s+Doc\.?\s+(?:No\.?\s*)?(\d{4}-\d{4,})\b/gi],
    ['release', /\b(?:release|order|notice)\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9._:/-]{3,79})/gi],
    ['sec-accession', /\b(\d{10}-\d{2}-\d{6})\b/g]
  ];
  for (const [type, regex] of patterns) {
    for (const match of value.matchAll(regex)) {
      const identifier = clean(match[1] || match[0]);
      if (validIdentifier(type, identifier)) candidates.push({ type, value: identifier });
      if (candidates.length >= 120) break;
    }
    if (candidates.length >= 120) break;
  }
  return dedupe(candidates, 60);
}
function publicDocument(document) {
  return {
    id: document.id,
    sha256: document.sha256,
    title: document.title,
    originalFileName: document.originalFileName,
    bytes: document.bytes,
    firstSeen: document.firstSeen,
    lastSeen: document.lastSeen,
    sourceUrls: document.sourceUrls,
    provenance: document.provenance,
    metadata: document.metadata,
    identifiers: document.identifiers,
    extraction: document.extraction,
    evidenceGrade: document.evidenceGrade,
    reviewStatus: document.reviewStatus,
    publicationStatus: document.publicationStatus,
    evidenceBoundary: document.evidenceBoundary,
    preservation: document.preservation
  };
}
function buildPage(publicData) {
  const cards = publicData.documents.length ? publicData.documents.map(document => {
    const provenance = (document.provenance || []).slice(0, 4).map(item => `<li><a href="${escapeHtml(item.documentUrl)}" rel="noopener">${escapeHtml(item.sourceLabel || item.sourceId || 'Source')}</a> · retrieved ${escapeHtml(String(item.retrievedAt || '').slice(0, 10))}</li>`).join('');
    const identifiers = (document.identifiers || []).slice(0, 8).map(item => `<span class="doc-pill">${escapeHtml(item.type)}: ${escapeHtml(item.value)}</span>`).join(' ');
    const confidence = document.extraction?.ocrUsed ? (document.extraction.ocrConfidence?.value == null ? 'unavailable' : `${document.extraction.ocrConfidence.value}/100 sampled`) : 'native text; OCR not used';
    return `<article class="doc-card" id="document-${escapeHtml(document.id)}"><div class="doc-meta"><span>GRADE ${escapeHtml(document.evidenceGrade)}</span><span>${escapeHtml(document.reviewStatus)}</span><span>${escapeHtml(document.extraction?.method || 'unknown')}</span></div><h2>${escapeHtml(document.title)}</h2><p><strong>Document hash:</strong> <code>${escapeHtml(document.sha256)}</code></p><p><strong>Extraction:</strong> ${escapeHtml(String(document.extraction?.textChars || 0))} characters · OCR confidence ${escapeHtml(confidence)}.</p><p><strong>Boundary:</strong> ${escapeHtml(document.evidenceBoundary)}</p>${identifiers ? `<p>${identifiers}</p>` : ''}<h3>Source provenance</h3><ul>${provenance}</ul></article>`;
  }).join('\n') : '<article class="doc-card"><h2>No PDF has completed extraction yet</h2><p>The document pipeline is active. This neutral state does not imply that registered sources contain no PDFs.</p></article>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document Library | Matrix Reprogrammed</title><meta name="description" content="Hash-preserved public-record PDFs with extraction provenance, OCR limitations and evidence boundaries."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><style>.doc-wrap{max-width:1100px;margin:auto;padding:2rem 1rem}.doc-card{border:1px solid rgba(216,181,106,.28);border-radius:16px;padding:1.2rem;margin:1rem 0;background:rgba(0,0,0,.82)}.doc-meta{display:flex;gap:.6rem;flex-wrap:wrap;font-size:.76rem;text-transform:uppercase}.doc-meta span,.doc-pill{border:1px solid rgba(216,181,106,.3);border-radius:999px;padding:.25rem .55rem}.doc-pill{display:inline-block;margin:.15rem}code{font-size:.76rem;overflow-wrap:anywhere;color:#c8b98c}</style></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="source-changes.html">Source Changes</a><a href="search.html">Search</a></nav></header><main class="doc-wrap"><div class="eyebrow">Public document extraction</div><h1>DOCUMENT LIBRARY</h1><p class="lead">Linked public-record PDFs are downloaded, hashed, deduplicated and made searchable. Native text is attempted first; OCR is used only when meaningful text is absent.</p><p><strong>Evidence boundary:</strong> ${escapeHtml(publicData.evidenceBoundary)}</p><div class="cta-row"><a class="btn" href="data/document-library.json">Public JSON</a><a class="btn alt" href="source-changes.html">Source Changes</a></div>${cards}</main></div></body></html>`;
}

const manifest = readJson(manifestPath, { updated: null, evidenceBoundary: '', documents: [] });
let removed = 0;
let added = 0;
for (const document of manifest.documents || []) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, document.extraction?.textPath || ''), 'utf8'); } catch {}
  const before = Array.isArray(document.identifiers) ? document.identifiers : [];
  const after = extractIdentifiers(text);
  removed += before.filter(item => !after.some(next => next.type === item.type && next.value === item.value)).length;
  added += after.filter(item => !before.some(prior => prior.type === item.type && prior.value === item.value)).length;
  document.identifiers = after;
}
manifest.identifierSchemaVersion = 2;
manifest.identifierQualityUpdated = new Date().toISOString();
writeJson(manifestPath, manifest);

const priorPublic = readJson(publicPath, { summary: {}, evidenceBoundary: manifest.evidenceBoundary, documents: [] });
const publicData = {
  ...priorPublic,
  updated: manifest.updated || priorPublic.updated,
  evidenceBoundary: manifest.evidenceBoundary || priorPublic.evidenceBoundary,
  documents: (manifest.documents || []).slice(0, 500).map(publicDocument)
};
writeJson(publicPath, publicData);
fs.writeFileSync(pagePath, buildPage(publicData));
writeJson(reportPath, {
  ok: true,
  generatedAt: new Date().toISOString(),
  documentsChecked: (manifest.documents || []).length,
  identifiersRemoved: removed,
  identifiersAdded: added,
  identifierSchemaVersion: 2
});
console.log(JSON.stringify({ ok: true, documents: (manifest.documents || []).length, identifiersRemoved: removed, identifiersAdded: added }, null, 2));

module.exports = { validIdentifier, extractIdentifiers };
