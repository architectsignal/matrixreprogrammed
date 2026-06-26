const fs = require('fs');
const path = require('path');
const { loadSiteContext, pickRelatedBooks, pickMainPlayers, pickLiveIntel, termsFrom, routeUrl, writeBrandedPdf } = require('./branded-pdf-mini-book');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  console.log('No downloads directory found. Skipping branded download PDF index.');
  process.exit(0);
}
const siteContext = loadSiteContext(root);
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function json(file) { try { return JSON.parse(read(file)); } catch { return null; } }
function esc(s = '') { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function titleCase(value = '') { return String(value || '').replace(/^downloads\//, '').replace(/\.(json|md|txt|pdf)$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function collectLinks(value = '') { return Array.from(new Set(String(value || '').match(/https?:\/\/[^\s)"']+|[a-z0-9/_#.-]+\.html/gi) || [])).slice(0, 18); }
function cleanText(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstUsefulParagraph(md = '') { return cleanText(String(md || '').split('\n').find(line => line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('-')) || ''); }
function loadDownloadBase(base) {
  const jsonPath = path.join(downloadsDir, `${base}.json`);
  const mdPath = path.join(downloadsDir, `${base}.md`);
  const txtPath = path.join(downloadsDir, `${base}.txt`);
  const data = fs.existsSync(jsonPath) ? json(jsonPath) : null;
  const md = fs.existsSync(mdPath) ? read(mdPath) : '';
  const txt = fs.existsSync(txtPath) ? read(txtPath) : '';
  const title = cleanText((data && (data.title || data.name || data.label)) || (md.match(/^#\s+(.+)$/m) || [])[1] || titleCase(base));
  const summary = cleanText((data && (data.summary || data.description || data.purpose || data.boundary)) || firstUsefulParagraph(md) || firstUsefulParagraph(txt) || 'A Matrix Reprogrammed branded download generated from current site data.');
  const routes = [];
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (/route|url|path|link/i.test(key) && typeof value === 'string') routes.push(value);
      if (Array.isArray(value)) for (const item of value) {
        if (typeof item === 'string' && (/\.html|https?:\/\//i.test(item))) routes.push(item);
        if (item && typeof item === 'object') for (const v of Object.values(item)) if (typeof v === 'string' && (/\.html|https?:\/\//i.test(v))) routes.push(v);
      }
    }
  }
  routes.push(...collectLinks(md), ...collectLinks(txt));
  const terms = termsFrom(base, title, summary, JSON.stringify(data || {}).slice(0, 2500), md.slice(0, 2500));
  return { base, data, md, txt, title, summary, routes: Array.from(new Set(routes)).slice(0, 18), terms };
}
function buildGenericPdf(info) {
  const outFile = `downloads/${info.base}.pdf`;
  const outPath = path.join(root, outFile);
  if (fs.existsSync(outPath)) return { file: outFile, title: info.title, reused: true };
  const proofLinks = info.routes.map(route => `${titleCase(route)} - ${routeUrl(route)}`);
  const data = info.data || {};
  const liveIntel = pickLiveIntel(siteContext, info.terms).map(item => `${String(item.published || '').slice(0,10)} - ${item.title} - ${item.url}`);
  const takeaways = Array.isArray(data.takeaways) ? data.takeaways : [];
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  const actions = Array.isArray(data.actionSteps) ? data.actionSteps : [];
  writeBrandedPdf(outPath, {
    title: info.title,
    label: 'Auto-Branded Download Mini Book',
    summary: info.summary,
    why: ['This PDF is auto-built from the latest site download data so the public asset stays useful instead of remaining a thin machine file.', 'Use it as a mini-book: proof routes, boundaries, current updates, main entities, related books, and next actions.'],
    proofLinks,
    mainPlayers: pickMainPlayers(siteContext, info.terms, info.terms),
    recordSupports: [data.boundary, data.readerOutcome, data.promise, ...takeaways].filter(Boolean),
    speculation: ['This auto PDF is a briefing route, not a verdict. Claim strength belongs to the linked source, trust, or evidence page.', 'Speculation, symbolic analysis, or inference must remain labelled and separated from confirmed public records.'],
    liveIntel,
    relatedBooks: pickRelatedBooks(siteContext, info.terms),
    actions: [...checklist, ...actions, data.nextBestStep].filter(Boolean),
    routes: info.routes.map(routeUrl)
  });
  return { file: outFile, title: info.title, reused: false };
}
const files = fs.readdirSync(downloadsDir).filter(file => /\.(json|md|txt)$/i.test(file));
const bases = Array.from(new Set(files.map(file => file.replace(/\.(json|md|txt)$/i, '')))).filter(base => !/^branded-download-index$/i.test(base));
const pdfs = bases.map(base => buildGenericPdf(loadDownloadBase(base))).filter(Boolean).sort((a, b) => a.file.localeCompare(b.file));
const flagshipOrder = [
  ['downloads/lead-magnet-black-file-brief.pdf', 'Black File Starter Brief'],
  ['downloads/source-document-vault.pdf', 'Source Document Vault'],
  ['downloads/dossier-pack-intelligence-network.pdf', 'Intelligence Network Starter Pack'],
  ['downloads/dossier-pack-crime-state-overlap.pdf', 'Crime-State Overlap Brief'],
  ['downloads/dossier-pack-trust-evidence.pdf', 'Trust & Evidence Method'],
  ['downloads/lead-magnet-dog-architect-initiation.pdf', 'D.O.G The Architect Initiation Brief'],
  ['downloads/power-atlas.pdf', 'Power Atlas Starter File'],
  ['downloads/seven-day-intel.pdf', 'Live Intel Weekly Brief'],
  ['downloads/lead-magnet-full-archive-map.pdf', 'Full Archive Map'],
  ['downloads/share-kit-black-file-starter.pdf', 'Black File Share Kit']
];
const pdfMap = new Map(pdfs.map(pdf => [pdf.file, pdf]));
const flagships = flagshipOrder.map(([file, label]) => ({ file, title: (pdfMap.get(file) && pdfMap.get(file).title) || label, label })).filter(item => pdfMap.has(item.file));
const index = {
  updated: new Date().toISOString(),
  purpose: 'Auto-generated branded PDF index for Matrix Reprogrammed downloads. PDFs are regenerated during the site build from current JSON/Markdown/TXT data and live-intel context.',
  premiumStructure: ['cover page', 'table of contents', 'evidence/proof routes', 'main players/entities', 'speculation boundary', 'latest intelligence window', 'related books', 'reader actions'],
  flagshipCount: flagships.length,
  count: pdfs.length,
  flagships,
  pdfs
};
fs.writeFileSync(path.join(downloadsDir, 'branded-download-index.json'), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'branded-download-index.md'), `# Branded Download PDF Index\n\nUpdated: ${index.updated}\n\nEvery listed PDF is generated from the current site data at build time. The premium mini-book structure now includes a cover page, table of contents, evidence/proof routes, main players/entities, speculation boundary, current intelligence window, related books, and reader actions.\n\n## Flagship PDFs\n\n${flagships.map(p => `- ${p.label}: ${p.file}`).join('\n')}\n\n## Full PDF Index\n\n${pdfs.map(p => `- ${p.title}: ${p.file}${p.reused ? ' (custom PDF preserved)' : ''}`).join('\n')}\n`);
function card(pdf, tag = 'Auto-updated PDF') {
  return `<article class="card redline"><span class="label">${esc(tag)}</span><h3>${esc(pdf.title || pdf.label)}</h3><p>${pdf.reused ? 'Custom branded PDF preserved and indexed.' : 'Premium mini-book PDF with cover, contents, source routes, evidence boundary, related books, and reader actions.'}</p><a class="btn" href="${esc(pdf.file)}">Open PDF</a></article>`;
}
function patchDownloadCenter() {
  const p = path.join(root, 'download-center.html');
  if (!fs.existsSync(p)) return;
  let html = fs.readFileSync(p, 'utf8');
  const section = `<section id="branded-pdf-download-index" class="section wrap"><h2>Branded PDF Mini Books</h2><p class="lead">These are auto-updated branded PDF downloads generated from current site data, live-intel windows, proof routes, speculation boundaries, main players/entities, related books, and reader actions.</p><div class="terminal">BRANDED PDF ENGINE\n&gt; Premium cover pages: active\n&gt; Table of contents: active\n&gt; Evidence boundaries: active\n&gt; Related books: active\n&gt; Flagship PDFs: ${flagships.length}\n&gt; Total indexed PDFs: ${pdfs.length}</div><h2>Flagship PDF Collection</h2><div class="grid">${flagships.map(pdf => card(pdf, 'Flagship PDF')).join('')}</div><h2>Full Auto-Updated PDF Index</h2><div class="grid">${pdfs.slice(0, 24).map(pdf => card(pdf)).join('')}</div><div class="cta-row"><a class="btn" href="downloads/branded-download-index.json">PDF Index JSON</a><a class="btn alt" href="downloads/branded-download-index.md">PDF Index Markdown</a></div></section>`;
  if (html.includes('id="branded-pdf-download-index"')) html = html.replace(/<section id="branded-pdf-download-index"[\s\S]*?<\/section>/, section);
  else html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(p, html);
}
function patchLlms() {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return;
  let llms = fs.readFileSync(p, 'utf8');
  const block = `\n\nBranded Download PDF Index:\n- /downloads/branded-download-index.json: auto-generated list of branded PDF mini-books created from current download data.\n- /downloads/branded-download-index.md: human-readable branded PDF index.\n${flagships.map(pdf => `- /${pdf.file}: flagship branded mini-book PDF with cover and table of contents.`).join('\n')}\n${pdfs.slice(0, 80).map(pdf => `- /${pdf.file}: branded auto-updated mini-book PDF.`).join('\n')}\n`;
  if (!llms.includes('/downloads/branded-download-index.json')) fs.writeFileSync(p, `${llms.trim()}${block}`);
}
patchDownloadCenter();
patchLlms();
console.log(`Built branded PDF download index with ${pdfs.length} PDFs (${pdfs.filter(p => p.reused).length} custom preserved, ${pdfs.filter(p => !p.reused).length} generated) and ${flagships.length} flagship PDFs.`);
