const fs = require('fs');
const path = require('path');

const root = process.cwd();
const now = new Date().toISOString();
const SITE = 'https://matrixreprogrammed.com';

function read(file, fallback = '') {
  try { return fs.readFileSync(path.join(root, file), 'utf8'); } catch { return fallback; }
}
function readJson(file, fallback = {}) {
  try { return JSON.parse(read(file)); } catch { return fallback; }
}
function write(file, value) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, value);
}
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function clean(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&(?:#039|quot|amp|lt|gt);/g, ' ').replace(/\s+/g, ' ').trim();
}
function stamp(item = {}) {
  return item.published || item.date || item.fetchedAt || item.updated || '';
}
function sourceClass(item = {}) {
  const label = String(item.sourceLabel || 'Source').toLowerCase();
  if (label.includes('google news')) return 'Discovery lead — open and grade the underlying publisher record';
  if (item.sourceTier === 'primary-or-official') return 'Primary or official public-record lead';
  return 'Public-source lead requiring source review';
}

const live = readJson('data/live-intel.json', { updated: null, items: [] });
const items = (Array.isArray(live.items) ? live.items : [])
  .filter(item => item && item.lane === 'epstein-files')
  .map(item => ({
    title: clean(item.title || 'Untitled Epstein record lead'),
    url: item.url || '',
    published: stamp(item),
    sourceLabel: clean(item.sourceLabel || 'Source'),
    sourceTier: item.sourceTier || 'ungraded',
    recordClass: sourceClass(item),
    status: item.status || 'collected',
    summary: clean(item.summary || item.description || ''),
    evidenceBoundary: 'This item is a public-record or reporting lead. Association, mention, testimony, subpoena, allegation, charge, settlement and conviction are different evidence classes and must not be collapsed.'
  }))
  .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0));

const latestPublished = items.map(item => item.published).filter(Boolean).sort().reverse()[0] || null;
const report = {
  schemaVersion: 1,
  updated: now,
  sourceWindowUpdated: live.updated || null,
  title: 'Daily Epstein Update',
  status: items.length ? 'current-seven-day-record-window' : 'current-window-checked-no-new-epstein-items',
  activeWindowDays: Number(live.activeWindowDays || 7),
  latestPublished,
  itemCount: items.length,
  officialBoundary: 'The machine tracks documents, court records, official actions, oversight, testimony, released files and dated reporting. A name appearing in a record does not by itself prove wrongdoing, and internet claims are never promoted to fact without primary evidence.',
  whatChanged: items.length
    ? `${items.length} current Epstein-lane record lead${items.length === 1 ? '' : 's'} remain inside the active source window.`
    : 'The current source window was checked and no new qualifying Epstein-lane item was collected.',
  items
};

write('data/daily-epstein-update.json', `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Daily Epstein Update', '',
  `Generated: ${report.updated}`,
  `Live Intel source window: ${report.sourceWindowUpdated || 'unavailable'}`,
  `Latest source publication: ${report.latestPublished || 'none in current window'}`,
  `Status: ${report.status}`, '',
  '## Evidence Boundary', '', report.officialBoundary, '',
  '## What Changed', '', report.whatChanged, '',
  '## Current Record Leads', ''
];
if (!items.length) md.push('- No new qualifying Epstein record lead in the current seven-day window.');
for (const item of items) {
  md.push(`### ${item.title}`, `- Published: ${item.published || 'date unavailable'}`, `- Source: ${item.sourceLabel}`, `- Class: ${item.recordClass}`, `- URL: ${item.url || 'unavailable'}`, '', item.summary || item.evidenceBoundary, '', `Boundary: ${item.evidenceBoundary}`, '');
}
write('downloads/daily-epstein-update.md', `${md.join('\n')}\n`);

const cards = items.slice(0, 24).map(item => `<article class="card redline"><span class="label">${esc(item.recordClass)}</span><h3>${esc(item.title)}</h3><p><strong>Published:</strong> ${esc(item.published || 'Date unavailable')}</p><p><strong>Source:</strong> ${esc(item.sourceLabel)}</p>${item.summary ? `<p>${esc(item.summary)}</p>` : ''}<p><strong>Boundary:</strong> ${esc(item.evidenceBoundary)}</p>${item.url ? `<a class="btn alt" href="${esc(item.url)}" target="_blank" rel="noopener">Open Source</a>` : ''}</article>`).join('');
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Daily Epstein Update | Matrix Reprogrammed</title><meta name="description" content="Current Epstein public-record, court, oversight, released-file and dated reporting leads with strict evidence boundaries."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="epstein-files.html">Epstein Command Center</a><a href="live-intel.html">Live Intel</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Current Public-Record Window</div><h1>DAILY EPSTEIN UPDATE.</h1><p class="lead">Documents, court records, oversight, testimony, released files and dated reporting — with allegation, association and proven fact kept separate.</p><div class="cta-row"><a class="btn" href="data/daily-epstein-update.json">Open JSON</a><a class="btn alt" href="downloads/daily-epstein-update.md">Download Brief</a></div></section><section class="section wrap split"><div class="terminal">DAILY EPSTEIN UPDATE\n&gt; generated: ${esc(report.updated)}\n&gt; source window: ${esc(report.sourceWindowUpdated || 'unavailable')}\n&gt; current leads: ${esc(report.itemCount)}\n&gt; latest publication: ${esc(report.latestPublished || 'none')}</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(report.officialBoundary)}</p></aside></section><section class="section wrap"><h2>What Changed</h2><p class="lead">${esc(report.whatChanged)}</p></section><section class="section wrap"><h2>Current Record Leads</h2><div class="grid">${cards || '<article class="card"><h3>No new qualifying item</h3><p>The current source window was checked. No synthetic story or collection timestamp has been presented as new evidence.</p></article>'}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — documents first, claims graded, missing records visible.</p></footer></div><script src="matrix.js"></script><script src="investigation-pulse.js"></script><script src="analytics.js"></script></body></html>`;
write('daily-epstein-update.html', page);

const commandFile = 'epstein-files.html';
let command = read(commandFile);
if (command) {
  const block = `<!-- daily-epstein-update:start --><section id="daily-epstein-update" class="section wrap split"><div class="terminal">DAILY EPSTEIN UPDATE\n&gt; source window: ${esc(report.sourceWindowUpdated || 'unavailable')}\n&gt; current record leads: ${esc(report.itemCount)}\n&gt; latest source date: ${esc(report.latestPublished || 'none')}\n&gt; rule: mention is not guilt</div><aside class="card redline"><span class="label">Updated automatically</span><h2>Current Epstein Record Brief</h2><p>${esc(report.whatChanged)}</p><div class="cta-row small"><a class="btn" href="daily-epstein-update.html">Open Daily Update</a><a class="btn alt" href="data/daily-epstein-update.json">JSON</a><a class="btn alt" href="downloads/daily-epstein-update.md">Markdown</a></div></aside></section><!-- daily-epstein-update:end -->`;
  command = command.replace(/<!-- daily-epstein-update:start -->[\s\S]*?<!-- daily-epstein-update:end -->/g, '');
  command = command.includes('</main>') ? command.replace('</main>', `${block}</main>`) : `${command}${block}`;
  write(commandFile, command);
}

const index = readJson('search-index.json', []);
if (Array.isArray(index) && !index.some(row => row && row.url === 'daily-epstein-update.html')) {
  index.unshift({
    title: 'Daily Epstein Update', category: 'Daily Intelligence', layer: 'disclosure-black-files', url: 'daily-epstein-update.html',
    description: 'Current Epstein public-record, court, oversight, released-file and dated reporting leads with strict evidence boundaries.',
    keywords: ['Epstein', 'daily update', 'court records', 'oversight', 'released files', 'public record', 'missing records'], priority: 111, sourceType: 'live-intelligence-route'
  });
  write('search-index.json', `${JSON.stringify(index, null, 2)}\n`);
}

let sitemap = read('sitemap.xml');
if (sitemap && !sitemap.includes('/daily-epstein-update.html')) {
  sitemap = sitemap.replace('</urlset>', `  <url><loc>${SITE}/daily-epstein-update.html</loc><lastmod>${now.slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.92</priority></url>\n</urlset>`);
  write('sitemap.xml', sitemap);
}
let llms = read('llms.txt');
if (llms && !llms.includes('/daily-epstein-update.html')) {
  write('llms.txt', `${llms.trim()}\n\nDaily Epstein Update:\n- /daily-epstein-update.html: current Epstein documents, court, oversight and released-file leads with evidence boundaries.\n`);
}

console.log(`Daily Epstein update generated from ${items.length} current record lead(s); Live Intel source window ${report.sourceWindowUpdated || 'unavailable'}.`);
