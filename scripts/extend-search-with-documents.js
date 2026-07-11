const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'search-index.json');
const manifestPath = path.join(root, 'data', 'document-extraction-index.json');
const searchPagePath = path.join(root, 'search.html');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function terms(value = '', limit = 1800) {
  return [...new Set(clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(word => word.length > 2))].slice(0, limit);
}
function upsert(map, item) {
  const prior = map.get(item.url) || {};
  map.set(item.url, {
    ...prior,
    ...item,
    keywords: [...new Set([...(prior.keywords || []), ...(item.keywords || [])])],
    priority: Math.max(Number(prior.priority || 0), Number(item.priority || 0))
  });
}

let index = readJson(indexPath, []);
if (!Array.isArray(index)) index = [];
const map = new Map(index.filter(item => item && item.url).map(item => [item.url, item]));

upsert(map, {
  url: 'document-library.html',
  title: 'Public Document Library',
  category: 'Document Extraction',
  layer: 'disclosure-black-files',
  description: 'Hash-preserved public-record PDFs with source provenance, native text extraction, OCR fallback, document identifiers, confidence sampling and extraction limitations.',
  keywords: ['pdf extraction','ocr','ocrmypdf','tesseract','pdftotext','document hash','sha256','document provenance','scanned government records','document identifiers'],
  priority: 106,
  sourceType: 'investigation-route'
});
upsert(map, {
  url: 'data/document-library.json',
  title: 'Public Document Library JSON',
  category: 'Machine Data',
  layer: 'disclosure-black-files',
  description: 'Machine-readable document hashes, provenance, metadata, identifiers, extraction method, OCR confidence and limitations.',
  keywords: ['document library json','pdf metadata','ocr confidence','document hash','provenance','deduplication'],
  priority: 101,
  sourceType: 'json-feed'
});

const manifest = readJson(manifestPath, { documents: [] });
for (const document of manifest.documents || []) {
  if (!document?.sha256 || !document?.extraction?.textPath) continue;
  let extractedText = '';
  try { extractedText = fs.readFileSync(path.join(root, document.extraction.textPath), 'utf8'); } catch {}
  const provenanceText = (document.provenance || []).map(item => `${item.sourceLabel || ''} ${item.sourceId || ''} ${item.sourcePageUrl || ''} ${item.documentUrl || ''} ${item.lane || ''} ${item.authority || ''}`).join(' ');
  const identifierText = (document.identifiers || []).map(item => `${item.type} ${item.value}`).join(' ');
  const metadataText = Object.entries(document.metadata || {}).map(([key, value]) => `${key} ${value}`).join(' ');
  const searchTerms = terms(`${document.title || ''} ${document.originalFileName || ''} ${provenanceText} ${identifierText} ${metadataText} ${extractedText}`, 1800);
  upsert(map, {
    url: `document-library.html?document=${encodeURIComponent(document.id)}`,
    title: document.title || document.originalFileName || 'Extracted PDF document',
    category: `Extracted Document · Unreviewed · Grade ${document.evidenceGrade || 'C'}`,
    layer: document.provenance?.[0]?.lane || 'disclosure-black-files',
    description: `Unreviewed source document. ${document.extraction.method || 'Document extraction'} produced ${Number(document.extraction.textChars || 0).toLocaleString('en-US')} searchable characters with provenance and limitations attached. Searchability does not establish guilt, authenticity of every statement, or any evidential conclusion.`,
    keywords: searchTerms,
    priority: document.evidenceGrade === 'B' ? 91 : 83,
    sourceType: 'document-extraction',
    evidenceGrade: document.evidenceGrade || 'C',
    reviewStatus: document.reviewStatus || 'unreviewed-source-document',
    documentHash: document.sha256
  });
}

const finalIndex = [...map.values()].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.title || '').localeCompare(String(b.title || '')));
fs.writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2));

if (fs.existsSync(searchPagePath)) {
  let html = fs.readFileSync(searchPagePath, 'utf8');
  html = html.replace('Search every investigation finding, government source, person, institution, contract, filing, court record, leak, source change, missing file, book, briefing, or outcome.', 'Search every investigation finding, government source, extracted document, person, institution, contract, filing, court record, leak, source change, missing file, book, briefing, or outcome.');
  if (!html.includes('data-q="scanned government PDF OCR document hash"')) {
    html = html.replace('</div></section><section class="section wrap split">', '<button class="btn alt" data-q="scanned government PDF OCR document hash">Extracted Documents</button></div></section><section class="section wrap split">');
  }
  fs.writeFileSync(searchPagePath, html);
}

console.log(`Document search extension complete: ${(manifest.documents || []).length} extracted documents indexed across ${finalIndex.length} routes.`);