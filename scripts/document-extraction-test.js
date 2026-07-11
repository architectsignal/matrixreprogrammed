const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const pipeline = require('./extract-pdf-documents.js');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(downloadsDir, { recursive: true });
const reportPath = path.join(downloadsDir, 'document-extraction-test.json');
const checks = [];
function check(name, ok, detail = '') { checks.push({ name, ok: Boolean(ok), detail: ok ? '' : detail }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function commandAvailable(command) { return spawnSync('bash', ['-lc', `command -v ${command}`], { encoding: 'utf8' }).status === 0; }
function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', cwd: options.cwd || root, timeout: options.timeout || 600000, maxBuffer: 64 * 1024 * 1024 });
}

const tools = ['pdfinfo', 'pdftotext', 'ocrmypdf', 'tesseract', 'pdftoppm', 'ps2pdf'];
for (const tool of tools) check(`tool available: ${tool}`, commandAvailable(tool), `${tool} is missing`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-document-test-'));
try {
  const psPath = path.join(temp, 'fixture.ps');
  const textPdf = path.join(temp, 'text.pdf');
  const scanPrefix = path.join(temp, 'scan-page');
  const scanPdf = path.join(temp, 'scan.pdf');
  const lines = Array.from({ length: 14 }, (_, index) => `72 ${740 - index * 38} moveto (Matrix Reprogrammed PDF extraction fixture line ${index + 1}. Public record provenance and OCR safety boundary.) show`).join('\n');
  fs.writeFileSync(psPath, `%!PS-Adobe-3.0\n/Courier findfont 12 scalefont setfont\n${lines}\nshowpage\n`);
  const madeTextPdf = run('ps2pdf', [psPath, textPdf]);
  check('synthetic text PDF created', madeTextPdf.status === 0 && fs.existsSync(textPdf), String(madeTextPdf.stderr || ''));

  if (fs.existsSync(textPdf)) {
    const direct = pipeline.extractPdfFile(textPdf, { workDir: path.join(temp, 'direct-work'), samplePages: 1 });
    check('pdftotext used before OCR', direct.method === 'pdftotext' && direct.ocrUsed === false, JSON.stringify({ method: direct.method, ocrUsed: direct.ocrUsed }));
    check('native PDF text is meaningful', direct.metrics.meaningful && direct.text.includes('Matrix Reprogrammed PDF extraction fixture'), JSON.stringify(direct.metrics));
    const identifiers = pipeline.extractIdentifiers('Case No. 1:26-cv-00421 and GAO-26-109999 DOI 10.1234/example.5678');
    check('document identifiers extracted', identifiers.some(item => item.type === 'case-or-docket') && identifiers.some(item => item.type === 'doi') && identifiers.some(item => item.type === 'report'), JSON.stringify(identifiers));

    const rendered = run('pdftoppm', ['-singlefile', '-r', '180', '-png', textPdf, scanPrefix]);
    check('synthetic scan image created', rendered.status === 0 && fs.existsSync(`${scanPrefix}.png`), String(rendered.stderr || ''));
    let scanCreated = false;
    if (fs.existsSync(`${scanPrefix}.png`)) {
      const img2pdf = commandAvailable('img2pdf')
        ? run('img2pdf', [`${scanPrefix}.png`, '-o', scanPdf])
        : run('python3', ['-m', 'img2pdf', `${scanPrefix}.png`, '-o', scanPdf]);
      scanCreated = img2pdf.status === 0 && fs.existsSync(scanPdf);
      check('image-only PDF created', scanCreated, String(img2pdf.stderr || ''));
    }
    if (scanCreated) {
      const scanned = pipeline.extractPdfFile(scanPdf, { workDir: path.join(temp, 'scan-work'), samplePages: 1 });
      check('OCR fallback invoked for scanned PDF', scanned.ocrUsed === true && scanned.method === 'ocrmypdf+tesseract', JSON.stringify({ method: scanned.method, ocrStatus: scanned.ocrStatus }));
      check('OCR output is meaningful', scanned.metrics.meaningful && scanned.text.includes('Matrix'), JSON.stringify(scanned.metrics));
      check('OCR confidence retained', scanned.ocrConfidence && (typeof scanned.ocrConfidence.value === 'number' || scanned.ocrConfidence.value === null) && scanned.ocrConfidence.method.includes('Tesseract'), JSON.stringify(scanned.ocrConfidence));
    }
  }

  const manifest = readJson(path.join(root, 'data', 'document-extraction-index.json'), { documents: [] });
  const publicData = readJson(path.join(root, 'data', 'document-library.json'), { documents: [] });
  const searchIndex = readJson(path.join(root, 'search-index.json'), []);
  const investigationLedger = readJson(path.join(root, 'data', 'investigation-ledger.json'), { findings: [] });
  const pagePath = path.join(root, 'document-library.html');
  const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
  check('document manifest generated', Array.isArray(manifest.documents), 'data/document-extraction-index.json is missing or invalid');
  check('public document feed generated', Array.isArray(publicData.documents), 'data/document-library.json is missing or invalid');
  check('public document page generated', Boolean(page), 'document-library.html is missing');
  check('document page is mobile ready', /name="viewport"/i.test(page), 'viewport metadata is missing');
  check('public feed has evidence boundary', /unreviewed source record/i.test(String(publicData.evidenceBoundary || '')), String(publicData.evidenceBoundary || ''));
  check('public feed excludes private failure diagnostics', !/failureCategory|lastError|stack|stderr/i.test(JSON.stringify(publicData)), 'Technical diagnostics leaked into public document feed');

  for (const document of manifest.documents || []) {
    check(`valid SHA-256: ${document.id}`, /^[a-f0-9]{64}$/.test(document.sha256 || ''), String(document.sha256 || ''));
    check(`unreviewed status retained: ${document.id}`, document.reviewStatus === 'unreviewed-source-document' && document.publicationStatus === 'searchable-source-record-not-finding', JSON.stringify({ reviewStatus: document.reviewStatus, publicationStatus: document.publicationStatus }));
    check(`provenance retained: ${document.id}`, Array.isArray(document.provenance) && document.provenance.length > 0 && document.provenance.every(item => item.documentUrl && item.retrievedAt), JSON.stringify(document.provenance));
    check(`text extraction retained: ${document.id}`, document.extraction?.textPath && fs.existsSync(path.join(root, document.extraction.textPath)), JSON.stringify(document.extraction));
    if (document.extraction?.ocrUsed) check(`OCR confidence object retained: ${document.id}`, Boolean(document.extraction.ocrConfidence) && 'value' in document.extraction.ocrConfidence, JSON.stringify(document.extraction.ocrConfidence));
    const promoted = (investigationLedger.findings || []).some(finding => finding.id === document.id || finding.sha256 === document.sha256 || finding.documentHash === document.sha256);
    check(`raw document not promoted to finding: ${document.id}`, !promoted, 'Document hash or ID appears as an investigation finding');
  }

  const documentSearchItems = searchIndex.filter(item => item.sourceType === 'document-extraction');
  check('document library route indexed', searchIndex.some(item => item.url === 'document-library.html'), 'document-library.html missing from search');
  check('document public JSON indexed', searchIndex.some(item => item.url === 'data/document-library.json'), 'data/document-library.json missing from search');
  check('every extracted document indexed safely', documentSearchItems.length === (manifest.documents || []).length && documentSearchItems.every(item => /unreviewed/i.test(`${item.category} ${item.description}`) && item.url.startsWith('document-library.html?document=')), `search items ${documentSearchItems.length}, documents ${(manifest.documents || []).length}`);
  check('search does not label documents as established wrongdoing', documentSearchItems.every(item => !/established wrongdoing/i.test(`${item.category} ${item.description}`)), 'Unsafe document search label found');

  const failures = checks.filter(item => !item.ok);
  const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), checks, failures };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, checks: checks.length, failures: failures.length }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}