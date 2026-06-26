const fs = require('fs');
const path = require('path');

const SITE = 'https://matrixreprogrammed.com';
const W = 612;
const H = 792;
const M = 54;
const RED = [0.92, 0.04, 0.08];
const GREEN = [0.0, 0.95, 0.35];
const GOLD = [0.86, 0.70, 0.34];
const SOFT = [0.88, 1.0, 0.90];
const MUTED = [0.62, 0.78, 0.65];
const DARK = [0.005, 0.012, 0.008];
const PANEL = [0.025, 0.008, 0.010];

function ascii(value = '') {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function rgb(c) { return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`; }
function escPdf(value = '') { return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function text(x, y, value, size = 9, font = 'F1', color = SOFT) {
  return `BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escPdf(value)}) Tj ET\n`;
}
function rect(x, y, w, h, fill = null, stroke = null, lw = 0.6) {
  let out = '';
  if (fill) out += `${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  if (stroke) out += `${lw.toFixed(2)} w ${rgb(stroke)} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;
  return out;
}
function line(x1, y1, x2, y2, color = GREEN, lw = 0.5) {
  return `${lw.toFixed(2)} w ${rgb(color)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}
function wrap(value = '', max = 82) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max && cur) { lines.push(cur); cur = word; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
function readJson(root, file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function routeUrl(route = '') {
  const r = String(route || '').trim();
  if (!r) return SITE;
  if (/^https?:\/\//i.test(r)) return r;
  return `${SITE}/${r.replace(/^\//, '')}`;
}
function termsFrom(...values) {
  return Array.from(new Set(values.flatMap(value => String(value || '').toLowerCase().split(/[^a-z0-9]+/)).filter(w => w.length > 3)));
}
function scoreAgainst(textValue, terms) {
  const hay = String(textValue || '').toLowerCase();
  return terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
}
function loadSiteContext(root) {
  return {
    books: readJson(root, 'data/books.json', { books: [] }).books || [],
    people: readJson(root, 'data/epstein-people-index.json', { people: [] }).people || [],
    liveIntel: readJson(root, 'data/live-intel.json', { items: [] }).items || []
  };
}
function pickRelatedBooks(ctx, terms, limit = 6) {
  return (ctx.books || [])
    .map(book => ({ book, score: scoreAgainst([book.title, book.subtitle, book.series, book.category, book.description, (book.keywords || []).join(' ')].join(' '), terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.book.priority || 0) - (a.book.priority || 0))
    .slice(0, limit)
    .map(x => x.book);
}
function pickMainPlayers(ctx, terms, fallback = [], limit = 8) {
  const people = (ctx.people || [])
    .map(person => ({ person, score: scoreAgainst([person.name, person.type, person.evidenceClass, person.recordShows, person.networkFunction, person.boundary].join(' '), terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.person.name || x.person.title)
    .filter(Boolean);
  if (people.length) return people;
  return fallback.filter(Boolean).slice(0, limit).map(x => String(x).replace(/[-_]/g, ' '));
}
function pickLiveIntel(ctx, terms, limit = 6) {
  return (ctx.liveIntel || [])
    .map(item => ({ item, score: scoreAgainst([item.lane, item.laneTitle, item.sourceLabel, item.title, item.summary, item.evidenceLevel, item.evidenceBoundary, item.nextAction].join(' '), terms) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.item);
}
function buildPdf(outPath, pages) {
  const objects = ['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const pageIds = [];
  for (const content of pages) {
    const stream = ascii(content) === content ? content : content;
    const contentId = objects.push(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, pdf, 'utf8');
}
function writeBrandedPdf(outPath, doc = {}) {
  const pages = [];
  let page = '';
  let y = 0;
  const generated = new Date().toISOString().slice(0, 10);
  const sections = [
    'What This File Is',
    'Why This Matters',
    'Evidence / Proof Routes',
    'Main Players / Entities',
    'What The Record Can Support',
    'Speculation Boundary',
    'Latest Intelligence Window',
    'Related Matrix Reprogrammed Books',
    'Reader Actions',
    'Core Routes',
    'Download Metadata'
  ];
  function background() {
    let c = rect(0, 0, W, H, DARK);
    for (let x = 18; x < W; x += 42) c += line(x, 28, x + 32, H - 28, [0.07, 0.0, 0.02], 0.24);
    c += rect(24, 22, W - 48, H - 44, null, RED, 1.0);
    c += rect(36, 34, W - 72, H - 68, null, GOLD, 0.42);
    return c;
  }
  function coverPage() {
    let c = background();
    const title = ascii(doc.title || 'Matrix Reprogrammed Download').toUpperCase().slice(0, 100);
    const label = ascii(doc.label || 'Public-Record Mini Book').toUpperCase().slice(0, 72);
    c += text(M, H - 74, 'MATRIX REPROGRAMMED', 14, 'F2', GOLD);
    c += text(M, H - 98, 'PUBLIC-RECORD MINI BOOK', 10, 'F2', RED);
    c += line(M, H - 116, W - M, H - 116, GOLD, 0.8);
    c += rect(M, 424, W - 2 * M, 160, PANEL, [0.48, 0.02, 0.04], 0.9);
    let ty = 548;
    for (const ln of wrap(title, 38).slice(0, 4)) { c += text(M + 26, ty, ln, 21, 'F2', SOFT); ty -= 28; }
    c += text(M + 26, ty - 4, label, 9.8, 'F2', GOLD);
    c += text(M + 26, ty - 24, 'Source first. Claim second. Speculation labelled.', 9.2, 'F1', MUTED);
    const badges = ['AUTO-UPDATED FROM CURRENT SITE DATA', 'EVIDENCE BOUNDARY INCLUDED', 'MAIN PLAYERS / ENTITIES INCLUDED', 'RELATED BOOK PATH INCLUDED', 'READER ACTIONS INCLUDED'];
    c += rect(M, 298, W - 2 * M, 96, null, GREEN, 0.3);
    let by = 366;
    for (const badge of badges) { c += text(M + 26, by, `> ${badge}`, 8.4, 'F2', GREEN); by -= 14; }
    c += text(M, 222, 'WHAT THIS DOWNLOAD IS', 10.5, 'F2', GOLD);
    let sy = 202;
    for (const ln of wrap(doc.summary || 'A Matrix Reprogrammed branded briefing generated from current archive data, source routes, live-intel windows, related books, and evidence boundaries.', 72).slice(0, 8)) { c += text(M, sy, ln, 8.8, 'F1', SOFT); sy -= 12; }
    c += line(M, 86, W - M, 86, RED, 0.7);
    c += text(M, 66, `GENERATED: ${generated}`, 8.2, 'F2', MUTED);
    c += text(W - 238, 66, 'REBUILT WHEN THE SITE BUILD RUNS', 8.2, 'F2', GOLD);
    c += text(M, 44, SITE, 8.2, 'F1', MUTED);
    return c;
  }
  function frame(title, subtitle) {
    let c = background();
    c += text(M, H - 44, 'MATRIX REPROGRAMMED', 8.5, 'F2', GOLD);
    c += text(W - 214, H - 44, 'BRANDED DOWNLOAD MINI BOOK', 8.2, 'F2', RED);
    c += line(M, H - 58, W - M, H - 58, GOLD, 0.7);
    c += text(M, H - 88, title, 17, 'F2', SOFT);
    c += text(M, H - 108, subtitle || 'source first / claim second', 9.5, 'F1', GOLD);
    c += line(M, 54, W - M, 54, RED, 0.6);
    c += text(M, 34, 'AUTO-GENERATED FROM CURRENT SITE DATA', 7.5, 'F2', MUTED);
    c += text(W - 106, 34, String(pages.length + 1).padStart(2, '0'), 8, 'F2', GOLD);
    return c;
  }
  function contentsPage() {
    let c = frame('TABLE OF CONTENTS', ascii(doc.title || 'Matrix Reprogrammed Download').slice(0, 60));
    c += rect(M, 82, W - 2 * M, 540, PANEL, [0.45, 0.02, 0.04], 0.65);
    c += text(M + 22, 594, 'THIS MINI BOOK IS BUILT LIKE A READER ROUTE', 11, 'F2', GOLD);
    let yy = 566;
    for (const [i, item] of sections.entries()) {
      c += text(M + 30, yy, `${String(i + 1).padStart(2, '0')}  ${item}`, 9.7, 'F2', i % 2 ? SOFT : GREEN);
      yy -= 22;
    }
    c += line(M + 22, 312, W - M - 22, 312, RED, 0.45);
    c += text(M + 22, 288, 'HOW TO READ IT', 10.5, 'F2', GOLD);
    const notes = [
      'Open the source routes before treating any claim as proven.',
      'Use the speculation boundary to separate theory from record.',
      'Follow the related books when the reader wants the full dossier.',
      'This PDF is regenerated from the current archive whenever the site build runs.'
    ];
    yy = 264;
    for (const note of notes) { c += text(M + 30, yy, `- ${note}`, 8.6, 'F1', SOFT); yy -= 16; }
    return c;
  }
  function newPage(title = doc.title, subtitle = doc.label) {
    if (page) pages.push(page);
    page = frame(ascii(title).toUpperCase().slice(0, 70), subtitle);
    page += rect(M, 82, W - 2 * M, 540, PANEL, [0.45, 0.02, 0.04], 0.65);
    y = 604;
  }
  function ensure(space = 32) { if (y < 104 + space) newPage(doc.title, 'continued'); }
  function addHeading(value) { ensure(40); page += text(M + 22, y, ascii(value).toUpperCase().slice(0, 68), 11.5, 'F2', GOLD); y -= 18; page += line(M + 22, y + 5, W - M - 22, y + 5, RED, 0.35); }
  function addPara(value, size = 8.7) { for (const ln of wrap(value, 78)) { ensure(18); page += text(M + 24, y, ln, size, 'F1', SOFT); y -= 12; } y -= 7; }
  function addBullet(value) { for (const [i, ln] of wrap(value, 76).entries()) { ensure(16); page += text(M + 26, y, `${i ? '  ' : '-'} ${ln}`, 8.4, 'F1', SOFT); y -= 11; } }
  function addSection(title, items = [], empty = '') {
    const list = Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);
    if (!list.length && !empty) return;
    addHeading(title);
    if (!list.length) addPara(empty, 8.4);
    for (const item of list) addBullet(typeof item === 'string' ? item : [item.title, item.summary, item.route || item.url].filter(Boolean).join(' - '));
    y -= 8;
  }
  pages.push(coverPage());
  pages.push(contentsPage());
  page = '';
  newPage(doc.title || 'Matrix Reprogrammed Download', doc.label || 'Branded mini book');
  addHeading('What this file is');
  addPara(doc.summary || 'A Matrix Reprogrammed branded briefing generated from current site data, source routes, live-intel windows, related books, and evidence boundaries.', 9.4);
  addSection('Why this matters', doc.why || []);
  addSection('Evidence / proof routes', doc.proofLinks || []);
  addSection('Main players / entities', doc.mainPlayers || [], 'No specific named people/entities are attached yet. Treat this as a subject map until named records are added.');
  addSection('What the record can support', doc.recordSupports || ['Source-linked facts, route maps, claim labels, dates, public records, official pages, court records, archive links, and clearly labelled analysis.']);
  addSection('Speculation boundary', doc.speculation || ['Speculation is allowed only when labelled. Association, contact, symbolism, reporting, or allegation does not equal proof of wrongdoing.']);
  addSection('Latest intelligence window', doc.liveIntel || [], 'No fresh matching live-intel item is attached yet. This PDF will update when matching live-intel data is available.');
  addSection('Related Matrix Reprogrammed books', (doc.relatedBooks || []).map(book => `${book.title} - ${book.generatedUrl ? routeUrl(book.generatedUrl) : ''}${book.amazonUs ? ` - Amazon: ${book.amazonUs}` : ''}`));
  addSection('Reader actions', doc.actions || []);
  addSection('Core routes', doc.routes || []);
  addSection('Download metadata', [`Generated: ${generated}`, `Canonical site: ${SITE}`, 'Build behaviour: regenerated whenever the site build runs after data/live-intel updates.']);
  if (page) pages.push(page);
  buildPdf(outPath, pages);
}
module.exports = { SITE, routeUrl, termsFrom, loadSiteContext, pickRelatedBooks, pickMainPlayers, pickLiveIntel, writeBrandedPdf };
