const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const archiveDir = path.join(downloadsDir, 'document-archive');
const workRoot = path.join(downloadsDir, 'document-extraction-work');
const textDir = path.join(dataDir, 'document-text');
const manifestPath = path.join(dataDir, 'document-extraction-index.json');
const publicPath = path.join(dataDir, 'document-library.json');
const reportPath = path.join(downloadsDir, 'document-extraction-report.json');
const pagePath = path.join(root, 'document-library.html');

for (const dir of [dataDir, downloadsDir, archiveDir, workRoot, textDir]) fs.mkdirSync(dir, { recursive: true });

const now = new Date().toISOString();
const mode = String(process.argv[2] || process.env.INVESTIGATION_MODE || 'daily').toLowerCase();
const maxDocuments = Math.max(1, Number(process.env.DOCUMENT_EXTRACTION_MAX_DOCUMENTS || (mode === 'weekly' ? 40 : 12)));
const maxPdfBytes = Math.max(100000, Number(process.env.DOCUMENT_EXTRACTION_MAX_BYTES || 25 * 1024 * 1024));
const timeoutMs = Math.max(5000, Number(process.env.DOCUMENT_EXTRACTION_TIMEOUT_MS || 45000));
const minTextChars = Math.max(100, Number(process.env.DOCUMENT_MIN_TEXT_CHARS || 400));
const minAlphaWords = Math.max(10, Number(process.env.DOCUMENT_MIN_ALPHA_WORDS || 60));
const maxStoredTextChars = Math.max(10000, Number(process.env.DOCUMENT_MAX_STORED_TEXT_CHARS || 1500000));
const confidenceSamplePages = Math.max(1, Number(process.env.DOCUMENT_OCR_CONFIDENCE_SAMPLE_PAGES || 5));
const userAgent = process.env.INVESTIGATION_USER_AGENT || 'MatrixReprogrammedDocumentExtractor/1.0 njmgroupfrance@gmail.com';
const artifactName = process.env.DOCUMENT_ARTIFACT_NAME || `pdf-evidence-${process.env.GITHUB_RUN_ID || 'local'}`;
const artifactRetentionDays = Number(process.env.DOCUMENT_ARTIFACT_RETENTION_DAYS || 90);
const evidenceBoundary = 'Extracted document text is an unreviewed source record. Searchability does not make an allegation true, establish guilt, authenticate every statement, or convert the document into a published finding.';

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
function cleanText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
function safeFileName(value, fallback = 'document.pdf') {
  const cleaned = String(value || '').split(/[?#]/)[0].split('/').pop() || fallback;
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (safe || fallback).slice(0, 160);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function unique(values, limit = 200) {
  return [...new Set((values || []).filter(Boolean).map(value => String(value).trim()).filter(Boolean))].slice(0, limit);
}
function mergeObjectsByKey(values, keyFn, limit = 250) {
  const map = new Map();
  for (const value of values || []) {
    if (!value) continue;
    const key = keyFn(value);
    if (!key) continue;
    map.set(key, { ...(map.get(key) || {}), ...value });
  }
  return [...map.values()].slice(0, limit);
}
function commandAvailable(command) {
  return spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' }).status === 0;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding === null ? null : 'utf8',
    cwd: options.cwd || root,
    timeout: options.timeout || 180000,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) }
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}
function parsePdfInfo(value) {
  const metadata = {};
  for (const line of String(value || '').split(/\r?\n/)) {
    const match = line.match(/^([^:]{2,40}):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (key) metadata[key] = match[2].trim();
  }
  if (metadata.pages) metadata.pages = Number(metadata.pages) || metadata.pages;
  return metadata;
}
function textMetrics(value) {
  const text = cleanText(value);
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const alphaWords = words.filter(word => /\p{L}/u.test(word) && word.length >= 2);
  const letters = (text.match(/\p{L}/gu) || []).length;
  const visible = (text.match(/\S/g) || []).length;
  const alphaRatio = visible ? letters / visible : 0;
  return {
    chars: text.length,
    words: words.length,
    alphaWords: alphaWords.length,
    alphaRatio: Number(alphaRatio.toFixed(4)),
    meaningful: text.length >= minTextChars && alphaWords.length >= minAlphaWords && alphaRatio >= 0.2
  };
}
function extractIdentifiers(text) {
  const value = String(text || '');
  const identifiers = [];
  const patterns = [
    ['doi', /\b10\.\d{4,9}\/[\w.()/:;-]+/gi],
    ['case-or-docket', /\b(?:case|docket|civil action|criminal action|file)\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9._:/-]{2,48})/gi],
    ['report', /\b(?:GAO|OIG|DOJ|SEC|FTC|CFTC|FBI|CIA|DOD|HHS|EPA|NASA|FINRA|FR)[-\s][A-Z0-9][A-Z0-9._/-]{2,32}\b/gi],
    ['release', /\b(?:release|order|notice)\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9._:/-]{2,48})/gi]
  ];
  for (const [type, regex] of patterns) {
    for (const match of value.matchAll(regex)) {
      const identifier = String(match[1] || match[0]).replace(/[),.;]+$/g, '').trim();
      if (identifier) identifiers.push({ type, value: identifier });
      if (identifiers.length >= 60) break;
    }
    if (identifiers.length >= 60) break;
  }
  return mergeObjectsByKey(identifiers, item => `${item.type}|${item.value.toLowerCase()}`, 60);
}
function confidenceFromTsv(tsvValues) {
  let weighted = 0;
  let weight = 0;
  let words = 0;
  for (const tsv of tsvValues) {
    for (const line of String(tsv || '').split(/\r?\n/).slice(1)) {
      const cols = line.split('\t');
      if (cols.length < 12) continue;
      const conf = Number(cols[10]);
      const text = String(cols.slice(11).join('\t') || '').trim();
      if (!text || !Number.isFinite(conf) || conf < 0) continue;
      const currentWeight = Math.max(1, text.length);
      weighted += conf * currentWeight;
      weight += currentWeight;
      words += 1;
    }
  }
  return { value: weight ? Number((weighted / weight).toFixed(1)) : null, words };
}
function estimateOcrConfidence(pdfPath, totalPages, options = {}) {
  const samplePages = Math.max(1, Math.min(Number(totalPages) || 1, options.samplePages || confidenceSamplePages));
  const sampleDir = fs.mkdtempSync(path.join(options.workDir || os.tmpdir(), 'ocr-confidence-'));
  const prefix = path.join(sampleDir, 'page');
  const render = run('pdftoppm', ['-f', '1', '-l', String(samplePages), '-r', '150', '-png', pdfPath, prefix], { timeout: 240000 });
  if (!render.ok) {
    fs.rmSync(sampleDir, { recursive: true, force: true });
    return { value: null, scale: '0-100', method: 'Tesseract TSV weighted word confidence', sampledPages: 0, totalPages: Number(totalPages) || null, wordsSampled: 0, limitation: 'Confidence sampling failed; OCR text remains searchable but confidence is unavailable.' };
  }
  const images = fs.readdirSync(sampleDir).filter(name => name.endsWith('.png')).sort();
  const tsvValues = [];
  for (const image of images) {
    const result = run('tesseract', [path.join(sampleDir, image), 'stdout', '--psm', '6', 'tsv'], { timeout: 180000 });
    if (result.ok) tsvValues.push(result.stdout);
  }
  const confidence = confidenceFromTsv(tsvValues);
  fs.rmSync(sampleDir, { recursive: true, force: true });
  return {
    value: confidence.value,
    scale: '0-100',
    method: 'Tesseract TSV weighted word confidence',
    sampledPages: images.length,
    totalPages: Number(totalPages) || null,
    wordsSampled: confidence.words,
    limitation: images.length < Number(totalPages || images.length) ? 'Confidence is sampled from the first pages and is not a calibrated accuracy guarantee for the full document.' : 'Confidence covers all rendered pages but is not a calibrated accuracy guarantee.'
  };
}
function extractPdfFile(pdfPath, options = {}) {
  const workDir = options.workDir || fs.mkdtempSync(path.join(workRoot, 'pdf-'));
  fs.mkdirSync(workDir, { recursive: true });
  const infoResult = run('pdfinfo', [pdfPath], { timeout: 60000 });
  const metadata = infoResult.ok ? parsePdfInfo(infoResult.stdout) : {};
  const direct = run('pdftotext', ['-enc', 'UTF-8', '-layout', pdfPath, '-'], { timeout: 180000 });
  let text = direct.ok ? cleanText(direct.stdout) : '';
  let metrics = textMetrics(text);
  let method = 'pdftotext';
  let ocrUsed = false;
  let ocrConfidence = null;
  const limitations = [];
  let ocrStatus = 'not-needed';

  if (!metrics.meaningful) {
    ocrUsed = true;
    method = 'ocrmypdf+tesseract';
    ocrStatus = 'attempted';
    const ocrPdf = path.join(workDir, 'ocr.pdf');
    const sidecar = path.join(workDir, 'ocr.txt');
    const ocr = run('ocrmypdf', ['--skip-text', '--deskew', '--rotate-pages', '--output-type', 'pdf', '--optimize', '1', '--sidecar', sidecar, pdfPath, ocrPdf], { timeout: 900000, maxBuffer: 128 * 1024 * 1024 });
    if (ocr.ok && fs.existsSync(ocrPdf)) {
      const ocrTextResult = run('pdftotext', ['-enc', 'UTF-8', '-layout', ocrPdf, '-'], { timeout: 240000 });
      const sidecarText = fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8') : '';
      const ocrText = cleanText((ocrTextResult.ok && ocrTextResult.stdout.length >= sidecarText.length) ? ocrTextResult.stdout : sidecarText);
      if (ocrText.length > text.length) text = ocrText;
      metrics = textMetrics(text);
      ocrStatus = metrics.meaningful ? 'completed' : 'completed-low-text';
      ocrConfidence = estimateOcrConfidence(ocrPdf, metadata.pages, { workDir, samplePages: options.samplePages });
      if (!metrics.meaningful) limitations.push('OCR completed but the extracted text did not cross the meaningful-text threshold. Search recall may be incomplete.');
    } else {
      ocrStatus = 'failed';
      limitations.push('OCRmyPDF failed. Only the initial pdftotext output, if any, was retained.');
      ocrConfidence = { value: null, scale: '0-100', method: 'Tesseract TSV weighted word confidence', sampledPages: 0, totalPages: Number(metadata.pages) || null, wordsSampled: 0, limitation: 'OCR failed, so confidence could not be estimated.' };
    }
  }

  if (!direct.ok) limitations.push('pdftotext returned an error before OCR fallback.');
  if (metadata.encrypted && !/^no$/i.test(String(metadata.encrypted))) limitations.push('The PDF reports encryption or access restrictions; extraction may be incomplete.');
  if (!metrics.meaningful) limitations.push('The final text is below the publication pipeline meaningful-text threshold.');
  if (!limitations.length) limitations.push(ocrUsed ? 'OCR may contain recognition errors, especially in names, dates, tables, handwriting and degraded scans.' : 'Native PDF text extraction can lose reading order, columns, tables, footnotes and embedded-image text.');

  return { metadata, text, metrics, method, ocrUsed, ocrStatus, ocrConfidence, limitations: unique(limitations, 12) };
}
function looksLikePdfUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return /\.pdf(?:$|[?#])/i.test(url.href) || /(?:format|output|download|filetype)=pdf\b/i.test(url.search) || /\/pdf\//i.test(url.pathname);
  } catch { return false; }
}
function candidateKey(candidate) {
  try { return new URL(candidate.url).href; } catch { return ''; }
}
function discoverCandidates() {
  const snapshotIndex = readJson(path.join(dataDir, 'source-snapshot-index.json'), { sources: {} });
  const discovered = readJson(path.join(dataDir, 'source-document-links.json'), { documents: [] });
  const registry = readJson(path.join(dataDir, 'investigation-source-registry.json'), { sources: [] });
  const registryMap = new Map((registry.sources || []).map(source => [source.id, source]));
  const candidates = [];
  for (const document of discovered.documents || []) {
    if (!looksLikePdfUrl(document.url)) continue;
    candidates.push({
      url: document.url,
      title: document.title || safeFileName(document.url),
      sourceId: document.sourceId,
      sourceLabel: document.sourceLabel,
      sourceUrl: document.sourceUrl,
      lane: document.lane,
      authority: document.authority,
      discoveredAt: document.discoveredAt || discovered.updated || now,
      discoveredFrom: document.discoveredFrom || 'source-monitor-document-discovery'
    });
  }
  for (const sourceState of Object.values(snapshotIndex.sources || {})) {
    const source = registryMap.get(sourceState.sourceId) || sourceState;
    for (const document of sourceState.documentLinks || []) {
      if (!looksLikePdfUrl(document.url)) continue;
      candidates.push({
        url: document.url,
        title: document.title || safeFileName(document.url),
        sourceId: source.sourceId || source.id,
        sourceLabel: source.label,
        sourceUrl: source.url,
        lane: source.lane,
        authority: source.authority,
        discoveredAt: sourceState.lastSuccess || now,
        discoveredFrom: 'source-monitor'
      });
    }
  }
  const ledger = readJson(path.join(dataDir, 'investigation-ledger.json'), { findings: [] });
  for (const finding of ledger.findings || []) {
    for (const url of [finding.itemUrl, finding.sourceUrl]) {
      if (!looksLikePdfUrl(url)) continue;
      candidates.push({
        url,
        title: finding.title || safeFileName(url),
        sourceId: finding.sourceId,
        sourceLabel: finding.sourceLabel,
        sourceUrl: finding.sourceUrl,
        lane: finding.lane,
        authority: finding.authority,
        discoveredAt: finding.lastSeen || finding.firstSeen || now,
        discoveredFrom: 'investigation-ledger'
      });
    }
  }
  return mergeObjectsByKey(candidates, candidateKey, 3000);
}
async function downloadPdf(candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(candidate.url, { headers: { 'user-agent': userAgent, accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.3' }, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { category: `http-${response.status}`, status: response.status });
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length > maxPdfBytes) throw Object.assign(new Error('PDF exceeds configured size limit'), { category: 'size-limit' });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxPdfBytes) throw Object.assign(new Error('PDF exceeds configured size limit'), { category: 'size-limit' });
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw Object.assign(new Error('Response is not a PDF'), { category: 'not-pdf' });
    const hash = sha256(buffer);
    const filePath = path.join(archiveDir, `${hash}.pdf`);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);
    return {
      ok: true,
      hash,
      filePath,
      bytes: buffer.byteLength,
      finalUrl: response.url || candidate.url,
      contentType: response.headers.get('content-type') || 'application/pdf',
      etag: response.headers.get('etag') || '',
      lastModified: response.headers.get('last-modified') || '',
      status: response.status
    };
  } catch (error) {
    return { ok: false, category: error.name === 'AbortError' ? 'timeout' : (error.category || 'retrieval-failure'), status: error.status || null };
  } finally { clearTimeout(timer); }
}
function titleFor(candidate, metadata) {
  const metadataTitle = String(metadata.title || '').trim();
  if (metadataTitle && !/^(untitled|microsoft word|document)$/i.test(metadataTitle)) return metadataTitle.slice(0, 280);
  return String(candidate.title || safeFileName(candidate.url)).slice(0, 280);
}
function mergeDocument(existing, next) {
  if (!existing || !existing.sha256) return next;
  return {
    ...existing,
    ...next,
    firstSeen: existing.firstSeen || next.firstSeen,
    lastSeen: next.lastSeen,
    retrievals: Number(existing.retrievals || 1) + 1,
    sourceUrls: unique([...(existing.sourceUrls || []), ...(next.sourceUrls || [])], 100),
    provenance: mergeObjectsByKey([...(existing.provenance || []), ...(next.provenance || [])], item => `${item.sourceId}|${item.documentUrl}`, 250),
    identifiers: mergeObjectsByKey([...(existing.identifiers || []), ...(next.identifiers || [])], item => `${item.type}|${item.value.toLowerCase()}`, 60)
  };
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

async function main() {
  const requiredTools = ['pdfinfo', 'pdftotext', 'ocrmypdf', 'tesseract', 'pdftoppm'];
  const missingTools = requiredTools.filter(tool => !commandAvailable(tool));
  if (missingTools.length) throw new Error(`Missing document extraction tools: ${missingTools.join(', ')}`);

  const priorManifest = readJson(manifestPath, { updated: null, documents: [] });
  const documentMap = new Map((priorManifest.documents || []).map(document => [document.sha256, document]));
  const candidates = discoverCandidates();
  const rotationKey = `${mode}|${now.slice(0, 10)}`;
  const sortedCandidates = candidates.slice().sort((a, b) => {
    const aRank = sha256(`${rotationKey}|${candidateKey(a)}`);
    const bRank = sha256(`${rotationKey}|${candidateKey(b)}`);
    return aRank.localeCompare(bRank);
  }).slice(0, maxDocuments);

  const runResults = [];
  for (const candidate of sortedCandidates) {
    const key = candidateKey(candidate);
    const downloaded = await downloadPdf(candidate);
    if (!downloaded.ok) {
      runResults.push({ url: key, status: 'failed', category: downloaded.category });
      continue;
    }

    let existing = documentMap.get(downloaded.hash);
    let extraction = existing?.extraction;
    if (!extraction || !extraction.textPath || !fs.existsSync(path.join(root, extraction.textPath))) {
      const workDir = path.join(workRoot, downloaded.hash.slice(0, 16));
      fs.mkdirSync(workDir, { recursive: true });
      const result = extractPdfFile(downloaded.filePath, { workDir });
      const storedText = result.text.slice(0, maxStoredTextChars);
      const textPath = path.join(textDir, `${downloaded.hash}.txt`);
      fs.writeFileSync(textPath, storedText);
      extraction = {
        method: result.method,
        ocrUsed: result.ocrUsed,
        ocrStatus: result.ocrStatus,
        meaningfulText: result.metrics.meaningful,
        textChars: result.metrics.chars,
        wordCount: result.metrics.words,
        alphaWords: result.metrics.alphaWords,
        alphaRatio: result.metrics.alphaRatio,
        textHash: sha256(Buffer.from(result.text, 'utf8')),
        textPath: path.relative(root, textPath).replace(/\\/g, '/'),
        textTruncated: result.text.length > storedText.length,
        ocrConfidence: result.ocrConfidence,
        limitations: result.limitations
      };
      existing = { ...(existing || {}), metadata: result.metadata, identifiers: extractIdentifiers(result.text) };
    }

    const provenance = {
      sourceId: candidate.sourceId || '',
      sourceLabel: candidate.sourceLabel || '',
      sourcePageUrl: candidate.sourceUrl || '',
      documentUrl: candidate.url,
      finalUrl: downloaded.finalUrl,
      lane: candidate.lane || '',
      authority: candidate.authority || '',
      discoveredFrom: candidate.discoveredFrom,
      discoveredAt: candidate.discoveredAt || now,
      retrievedAt: now,
      httpStatus: downloaded.status,
      etag: downloaded.etag,
      lastModified: downloaded.lastModified
    };
    const evidenceGrade = candidate.authority === 'primary-official' ? 'B' : 'C';
    const nextDocument = {
      id: downloaded.hash.slice(0, 24),
      sha256: downloaded.hash,
      title: titleFor(candidate, existing?.metadata || {}),
      originalFileName: safeFileName(downloaded.finalUrl || candidate.url),
      mimeType: downloaded.contentType,
      bytes: downloaded.bytes,
      firstSeen: existing?.firstSeen || now,
      lastSeen: now,
      retrievals: existing?.retrievals || 1,
      sourceUrls: unique([candidate.url, downloaded.finalUrl], 100),
      provenance: [provenance],
      metadata: existing?.metadata || {},
      identifiers: existing?.identifiers || [],
      extraction,
      evidenceGrade,
      reviewStatus: 'unreviewed-source-document',
      publicationStatus: 'searchable-source-record-not-finding',
      evidenceBoundary,
      preservation: {
        originalSha256: downloaded.hash,
        method: process.env.GITHUB_RUN_ID ? 'github-actions-artifact' : 'temporary-local-archive',
        artifactName,
        workflowRunId: process.env.GITHUB_RUN_ID || null,
        repository: process.env.GITHUB_REPOSITORY || null,
        retentionDays: process.env.GITHUB_RUN_ID ? artifactRetentionDays : null,
        artifactPath: `document-archive/${downloaded.hash}.pdf`,
        limitation: process.env.GITHUB_RUN_ID ? `The original PDF is retained in a GitHub Actions artifact for ${artifactRetentionDays} days; the SHA-256, provenance, metadata and extracted text remain in the repository.` : 'The original PDF is stored only in the current local work directory.'
      }
    };
    documentMap.set(downloaded.hash, mergeDocument(existing, nextDocument));
    runResults.push({ url: key, status: existing?.sha256 ? 'deduplicated' : 'extracted', sha256: downloaded.hash, ocrUsed: extraction.ocrUsed, meaningfulText: extraction.meaningfulText });
  }

  const documents = [...documentMap.values()].sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0)).slice(0, 750);
  const manifest = {
    updated: now,
    mode,
    schemaVersion: 1,
    evidenceBoundary,
    documentCount: documents.length,
    documents
  };
  const publicData = {
    updated: now,
    summary: {
      discoveredCandidates: candidates.length,
      checkedThisRun: sortedCandidates.length,
      successfulDownloads: runResults.filter(item => ['extracted', 'deduplicated'].includes(item.status)).length,
      failedDownloads: runResults.filter(item => item.status === 'failed').length,
      retainedDocuments: documents.length,
      ocrDocuments: documents.filter(document => document.extraction?.ocrUsed).length,
      lowTextDocuments: documents.filter(document => !document.extraction?.meaningfulText).length
    },
    evidenceBoundary,
    documents: documents.slice(0, 500).map(publicDocument)
  };
  writeJson(manifestPath, manifest);
  writeJson(publicPath, publicData);
  writeJson(reportPath, { ok: true, generatedAt: now, mode, tools: requiredTools, candidates: candidates.length, checked: sortedCandidates.length, results: runResults, artifactName, artifactRetentionDays, evidenceBoundary });
  fs.writeFileSync(pagePath, buildPage(publicData));
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(workRoot, { recursive: true });
  console.log(JSON.stringify({ ok: true, candidates: candidates.length, checked: sortedCandidates.length, documents: documents.length, ocrDocuments: publicData.summary.ocrDocuments }, null, 2));
}

module.exports = { sha256, cleanText, parsePdfInfo, textMetrics, extractIdentifiers, confidenceFromTsv, estimateOcrConfidence, extractPdfFile, looksLikePdfUrl, evidenceBoundary };
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });