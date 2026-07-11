const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const blockedDirs = new Set(['.git', '.github', 'node_modules', '_site', 'scripts', 'tools', 'evidence-archive', 'source-snapshots']);
const publicRoots = new Set(['downloads', 'documents', 'docs', 'public']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const slug = value => String(value || 'document').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'document';
const clean = value => String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } };

function walk(dir, rel = '') {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (blockedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const nextRel = path.join(rel, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) result.push(...walk(full, nextRel));
    else if (/\.pdf$/i.test(entry.name) && (publicRoots.has(nextRel.split('/')[0]) || rel === '')) result.push({ full, rel: nextRel });
  }
  return result;
}

const extraction = readJson('data/document-extraction-index.json', {});
const extractionRows = Array.isArray(extraction) ? extraction : (extraction.documents || extraction.records || extraction.items || []);
const ledger = readJson('data/investigation-ledger.json', {});
const findings = Array.isArray(ledger) ? ledger : (ledger.findings || ledger.records || ledger.items || []);
const sourceChanges = readJson('data/source-change-public.json', {});
const changes = Array.isArray(sourceChanges) ? sourceChanges : (sourceChanges.changes || sourceChanges.records || sourceChanges.items || []);
const metadataRows = [...extractionRows, ...findings, ...changes];

function matchingMetadata(rel) {
  const base = path.basename(rel).toLowerCase();
  return metadataRows.find(row => {
    const values = [row.url, row.sourceUrl, row.documentUrl, row.localPath, row.path, row.filename, row.fileName].filter(Boolean).map(value => String(value).toLowerCase());
    return values.some(value => value.endsWith(rel.toLowerCase()) || value.endsWith(base));
  }) || {};
}

const documents = walk(root)
  .filter(item => !item.rel.startsWith('data/'))
  .map(item => {
    const stat = fs.statSync(item.full);
    const bytes = fs.readFileSync(item.full);
    const meta = matchingMetadata(item.rel);
    const title = meta.title || meta.documentTitle || clean(path.basename(item.rel, path.extname(item.rel)));
    const hash = sha256(bytes);
    return {
      id: `pdf-${slug(title)}-${hash.slice(0, 12)}`,
      title,
      url: item.rel,
      filename: path.basename(item.rel),
      bytes: stat.size,
      sha256: hash,
      source: meta.source || meta.sourceName || meta.publisher || 'Matrix Reprogrammed public evidence copy',
      sourceUrl: meta.sourceUrl || meta.url || meta.originalUrl || '',
      publicationDate: meta.publicationDate || meta.publishedAt || meta.date || '',
      retrievalDate: meta.retrievalDate || meta.retrievedAt || meta.observedAt || '',
      evidenceGrade: meta.evidenceGrade || meta.grade || 'C',
      factualStatus: meta.factualStatus || meta.status || 'public evidence document',
      established: meta.established || meta.whatIsEstablished || 'The manifest establishes the identity, public location and SHA-256 hash of this preserved PDF copy.',
      notEstablished: meta.notEstablished || meta.whatIsNotEstablished || 'Presence in the reader does not authenticate every statement inside the document or establish wrongdoing by any named person.',
      correctionRoute: meta.correctionRoute || 'Submit the source URL, page number and conflicting primary record through the Matrix correction route.',
      pageHint: Number(meta.page || meta.pageNumber || 1) || 1
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

const manifest = {
  ok: true,
  version: 1,
  generatedAt: new Date().toISOString(),
  engine: 'PDF.js',
  engineLicense: 'Apache-2.0',
  evidenceBoundary: 'Only PDFs present in this public manifest can be opened. A preserved document may contain allegations, disputed claims, redactions or incomplete context; the document status and underlying source control.',
  documents
};
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'evidence-reader-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Evidence Reader | Matrix Reprogrammed</title><meta name="description" content="Read approved public evidence PDFs with page links, hashes, provenance and evidence boundaries."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><link rel="stylesheet" href="reader-experience.css"/><style>.reader-layout{display:grid;grid-template-columns:minmax(250px,340px) minmax(0,1fr);gap:1rem}.reader-panel{position:sticky;top:1rem;max-height:85vh;overflow:auto}.reader-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}.reader-controls input,.reader-controls select{padding:.65rem;background:#090806;color:#f3e6bd;border:1px solid rgba(216,181,106,.35);border-radius:8px}.reader-stage{min-height:70vh;background:#171512;border:1px solid rgba(216,181,106,.25);border-radius:12px;padding:1rem;overflow:auto;text-align:center}.reader-stage canvas{max-width:100%;height:auto;background:white;box-shadow:0 10px 30px rgba(0,0,0,.45)}.doc-list button{display:block;width:100%;text-align:left;margin:.35rem 0;padding:.7rem;background:#0b0a08;color:#f3e6bd;border:1px solid rgba(216,181,106,.22);border-radius:8px}.doc-list button[aria-current="true"]{border-color:#d8b56a}.boundary{border-left:3px solid #d8b56a;padding:.85rem;background:rgba(216,181,106,.07)}@media(max-width:900px){.reader-layout{grid-template-columns:1fr}.reader-panel{position:static;max-height:none}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="evidence-reader.html" aria-current="page">Evidence Reader</a><a href="evidence-timeline.html">Timeline</a><a href="evidence-vault.html">Evidence Vault</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Open-source PDF.js evidence interface</div><h1>EVIDENCE READER.</h1><p class="lead">Open approved public PDFs, navigate by page, search extracted text and copy a stable page-specific citation link.</p><p class="boundary"><strong>Boundary:</strong> A PDF appearing here means the public copy and its hash were preserved. It does not prove every statement in the document, remove legal context or turn allegations into established wrongdoing.</p></section><section class="section wrap reader-layout"><aside class="card reader-panel"><label>Find document<input id="reader-document-search" type="search" placeholder="Title, source or filename"/></label><div id="reader-document-list" class="doc-list"></div></aside><div><article class="card"><span id="reader-grade" class="label">NO DOCUMENT SELECTED</span><h2 id="reader-title">Choose a document</h2><p id="reader-source"></p><p><strong>SHA-256:</strong> <code id="reader-hash">—</code></p><p><strong>Established:</strong> <span id="reader-established">—</span></p><p><strong>Not established:</strong> <span id="reader-not-established">—</span></p><div class="reader-controls"><button class="btn alt" id="reader-prev" type="button">Previous</button><label>Page <input id="reader-page" type="number" min="1" value="1" style="width:6rem"/></label><span id="reader-page-count">of —</span><button class="btn alt" id="reader-next" type="button">Next</button><label>Zoom <select id="reader-zoom"><option value="0.8">80%</option><option value="1" selected>100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label><input id="reader-text-search" type="search" placeholder="Search inside PDF"/><button class="btn alt" id="reader-find" type="button">Find</button><button class="btn" id="reader-copy-link" type="button">Copy Page Link</button><a class="btn alt" id="reader-original" href="#" target="_blank" rel="noopener noreferrer">Open PDF</a></div><p id="reader-status" class="figure-caption">PDF.js loads only after an approved manifest document is selected.</p></article><div id="reader-stage" class="reader-stage"><p>Select an approved document from the list.</p></div></div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — page-specific evidence, provenance attached.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script><script type="module" src="evidence-reader.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'evidence-reader.html'), html);
fs.writeFileSync(path.join(root, 'evidence-reader'), html);
console.log(`Evidence reader built with ${documents.length} approved public PDFs.`);
