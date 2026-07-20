const fs = require('fs');
const path = require('path');
const {
  loadSiteContext,
  pickRelatedBooks,
  pickMainPlayers,
  pickLiveIntel,
  termsFrom,
  routeUrl,
  writeBrandedPdf
} = require('./branded-pdf-mini-book');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const context = loadSiteContext(root);
const flagshipOrder = [
  ['downloads/subject-epstein-black-file.pdf', 'Epstein / Black File Subject Map'],
  ['downloads/lead-magnet-black-file-brief.pdf', 'Black File Starter Brief'],
  ['downloads/subject-intelligence-network.pdf', 'Intelligence Network Subject File'],
  ['downloads/source-document-vault.pdf', 'Source Document Vault'],
  ['downloads/dossier-pack-intelligence-network.pdf', 'Intelligence Network Starter Pack'],
  ['downloads/subject-crime-state-overlap.pdf', 'Crime-State Overlap Subject File'],
  ['downloads/dossier-pack-trust-evidence.pdf', 'Trust & Evidence Method'],
  ['downloads/share-kit-black-file-starter.pdf', 'Black File Share Starter'],
  ['downloads/subject-dog-architect.pdf', 'D.O.G The Architect Subject File'],
  ['downloads/subject-nasa-hidden-architecture.pdf', 'NASA Hidden Architecture File'],
  ['downloads/subject-freemasonry-symbol-system.pdf', 'Freemasonry Symbol System Map']
];
const requiredPremium = [
  'lead-magnet-black-file-brief',
  'share-kit-black-file-starter',
  'dossier-pack-trust-evidence'
];
const requiredDeepSections = ['evidence-based conclusions', 'analytical inferences', 'speculative conclusions', 'alternative explanations', 'source register'];

function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function json(file) { try { return JSON.parse(read(file)); } catch { return null; } }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function esc(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function titleCase(value = '') { return String(value).replace(/^downloads\//, '').replace(/\.(json|md|txt|pdf)$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function links(value = '') { return [...new Set(String(value).match(/https?:\/\/[^\s)"']+|[a-z0-9/_#.-]+\.html/gi) || [])].slice(0, 24); }
function firstParagraph(value = '') { return clean(String(value).split('\n').find(line => line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('-')) || ''); }
function loadBase(base) {
  const data = json(path.join(downloads, `${base}.json`)) || {};
  const md = read(path.join(downloads, `${base}.md`));
  const txt = read(path.join(downloads, `${base}.txt`));
  const title = clean(data.title || data.name || data.label || (md.match(/^#\s+(.+)$/m) || [])[1] || titleCase(base));
  const summary = clean(data.summary || data.description || data.purpose || data.boundary || firstParagraph(md) || firstParagraph(txt) || `A Matrix Reprogrammed public-record intelligence report for ${title}.`);
  const routes = [];
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') { if (/https?:\/\/|\.html(?:#|$)/i.test(value)) routes.push(value); return; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(data);
  routes.push(...links(md), ...links(txt));
  const terms = termsFrom(base, title, summary, JSON.stringify(data).slice(0, 5000), md.slice(0, 5000));
  return { base, data, title, summary, routes: [...new Set(routes)].slice(0, 24), terms };
}
function rebuildPremium(base) {
  const info = loadBase(base);
  const data = info.data;
  const liveIntel = pickLiveIntel(context, info.terms, 8).map(item => `${String(item.published || '').slice(0, 10)} - ${item.title} - ${item.url || item.route || ''}`);
  const proofLinks = info.routes.map(route => `${titleCase(route)} - ${routeUrl(route)}`);
  writeBrandedPdf(path.join(downloads, `${base}.pdf`), {
    title: info.title,
    label: 'Premium Public-Record Mini Book',
    summary: info.summary,
    why: [
      'This flagship report preserves the premium cover, table of contents and reader route while the wider library uses the deeper forensic report engine.',
      'It is rebuilt from current site data, source routes, evidence boundaries, related books and the latest matching intelligence window.'
    ],
    proofLinks,
    mainPlayers: pickMainPlayers(context, info.terms, info.terms, 10),
    recordSupports: [data.boundary, data.readerOutcome, data.promise, ...(Array.isArray(data.takeaways) ? data.takeaways : [])].filter(Boolean),
    speculation: [
      'Speculation Boundary: analysis and hypotheses must remain visibly separate from confirmed records, legal findings and verified transactions.',
      'Association, contact, symbolism, allegation or inclusion in a dataset does not establish wrongdoing.'
    ],
    liveIntel,
    relatedBooks: pickRelatedBooks(context, info.terms, 8),
    actions: [
      ...(Array.isArray(data.checklist) ? data.checklist : []),
      ...(Array.isArray(data.actionSteps) ? data.actionSteps : []),
      data.nextBestStep
    ].filter(Boolean),
    routes: info.routes.map(routeUrl)
  });
  return `downloads/${base}.pdf`;
}
function collectPdfs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectPdfs(full, out);
    else if (entry.name.endsWith('.pdf')) out.push(full);
  }
  return out;
}
function labelFor(file) {
  return titleCase(path.relative(downloads, file).replace(/\\/g, '/'));
}
function card(item, tag) {
  return `<article class="card redline"><span class="label">${esc(tag)}</span><h3>${esc(item.title)}</h3><p>Evidence-led PDF with source routes, claim boundaries, main entities, current intelligence context and reader actions.</p><a class="btn" href="${esc(item.file)}">Open PDF</a></article>`;
}

if (!fs.existsSync(downloads)) throw new Error('downloads directory is missing');
const deepIndexPath = path.join(downloads, 'branded-download-index.json');
const deepIndex = json(deepIndexPath) || {};
const deepByFile = new Map((Array.isArray(deepIndex.pdfs) ? deepIndex.pdfs : []).map(item => [item.file, item]));
const rebuilt = requiredPremium.map(rebuildPremium);
const allPdfs = collectPdfs(downloads)
  .map(file => {
    const route = `downloads/${path.relative(downloads, file).replace(/\\/g, '/')}`;
    const prior = deepByFile.get(route) || {};
    return {
      ...prior,
      file: route,
      title: prior.title || labelFor(file),
      kind: file.includes(`${path.sep}wealth-guides${path.sep}`) ? 'wealth-guide' : (prior.kind || 'deep-intelligence-report')
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));
const map = new Map(allPdfs.map(item => [item.file, item]));
const flagships = flagshipOrder
  .filter(([file]) => map.has(file))
  .map(([file, label]) => ({ file, title: map.get(file).title || label, label }));
const subjectPdfs = allPdfs.filter(item => /\/subject-[^/]+\.pdf$/i.test(`/${item.file}`));
const index = {
  ...deepIndex,
  updated: new Date().toISOString(),
  purpose: 'Combined deep-intelligence and premium flagship PDF index. The deep engine builds forensic reports; the compatibility layer preserves premium mini-book covers, contents and established public download routes.',
  premiumStructure: ['cover page', 'table of contents', 'evidence/proof routes', 'main players/entities', 'speculation boundary', 'latest intelligence window', 'related books', 'reader actions'],
  engine: 'deep intelligence reports plus premium flagship compatibility',
  engineVersion: deepIndex.engineVersion || 'deep-intelligence-v2',
  requiredSections: Array.isArray(deepIndex.requiredSections) && deepIndex.requiredSections.length ? deepIndex.requiredSections : requiredDeepSections,
  flagshipCount: flagships.length,
  count: allPdfs.length,
  subjectProfileCount: Number(deepIndex.subjectProfileCount || subjectPdfs.length),
  wealthGuideCount: Number(deepIndex.wealthGuideCount || allPdfs.filter(item => item.kind === 'wealth-guide').length),
  flagships,
  subjectPdfs,
  pdfs: allPdfs
};
fs.writeFileSync(deepIndexPath, `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(downloads, 'branded-download-index.md'), `# Branded Download PDF Index\n\nUpdated: ${index.updated}\n\nThe library combines deep intelligence reports with the established premium structure: cover page, table of contents, evidence/proof routes, main players/entities, speculation boundary, current intelligence window, related books and reader actions.\n\nEngine: ${index.engineVersion}\nRequired deep sections: ${index.requiredSections.join(', ')}\n\n## Flagship PDFs\n\n${flagships.map(item => `- ${item.label}: ${item.file}`).join('\n')}\n\n## Subject Intelligence PDFs\n\n${subjectPdfs.map(item => `- ${item.title}: ${item.file}`).join('\n')}\n\n## Full PDF Index\n\n${allPdfs.map(item => `- ${item.title}: ${item.file}`).join('\n')}\n`);

const center = path.join(root, 'download-center.html');
if (fs.existsSync(center)) {
  let html = read(center);
  const section = `<section id="branded-pdf-download-index" class="section wrap"><h2>Branded PDF Mini Books</h2><p class="lead">The library combines deep forensic intelligence reports with premium public-record mini books, source routes, claim boundaries, main players, related books and reader actions.</p><div class="terminal">BRANDED PDF ENGINE\n&gt; Deep intelligence reports: active\n&gt; Premium cover pages: active\n&gt; Table of contents: active\n&gt; Evidence and speculation boundaries: active\n&gt; Flagship PDFs: ${flagships.length}\n&gt; Total indexed PDFs: ${allPdfs.length}</div><h2>Flagship PDF Collection</h2><div class="grid">${flagships.map(item => card(item, 'Flagship PDF')).join('')}</div><h2>Wealth Creation PDF Library</h2><div class="grid">${allPdfs.filter(item => item.kind === 'wealth-guide').slice(0, 16).map(item => card(item, 'Wealth Guide')).join('')}</div><h2>Full Deep Intelligence PDF Index</h2><div class="grid">${allPdfs.slice(0, 24).map(item => card(item, 'Deep Intelligence PDF')).join('')}</div><div class="cta-row"><a class="btn" href="downloads/branded-download-index.json">PDF Index JSON</a><a class="btn alt" href="downloads/branded-download-index.md">PDF Index Markdown</a><a class="btn alt" href="downloads/subject-pdf-index.json">Subject PDF Index</a></div></section>`;
  if (html.includes('id="branded-pdf-download-index"')) html = html.replace(/<section id="branded-pdf-download-index"[\s\S]*?<\/section>/, section);
  else html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(center, html);
}

const llms = path.join(root, 'llms.txt');
if (fs.existsSync(llms)) {
  let text = read(llms);
  const marker = 'Branded Download PDF Index:';
  const block = `${marker}\n- /downloads/branded-download-index.json: combined deep intelligence and premium flagship PDF index.\n- /downloads/branded-download-index.md: human-readable PDF index.\n${flagships.map(item => `- /${item.file}: flagship premium public-record mini book.`).join('\n')}\n`;
  if (!text.includes(marker)) text = `${text.trim()}\n\n${block}`;
  fs.writeFileSync(llms, text);
}

for (const file of rebuilt) {
  const raw = read(path.join(root, file));
  for (const marker of ['PUBLIC-RECORD MINI BOOK', 'TABLE OF CONTENTS', 'AUTO-UPDATED FROM CURRENT SITE DATA', 'Speculation Boundary']) {
    if (!raw.includes(marker)) throw new Error(`${file} missing premium marker ${marker}`);
  }
}
if (index.engineVersion !== 'deep-intelligence-v2') throw new Error(`Deep PDF engine version was not preserved: ${index.engineVersion}`);
for (const section of requiredDeepSections) if (!index.requiredSections.includes(section)) throw new Error(`Deep PDF required section was not preserved: ${section}`);
if (flagships.length < 4) throw new Error(`Expected at least four flagship PDFs; found ${flagships.length}`);
if (allPdfs.length < 20) throw new Error(`Expected at least twenty PDFs; found ${allPdfs.length}`);
console.log(`Premium flagship compatibility restored without dropping deep metadata: ${rebuilt.length} flagship PDFs rebuilt, ${flagships.length} flagships indexed, ${allPdfs.length} PDFs catalogued.`);
