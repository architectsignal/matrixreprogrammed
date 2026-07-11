const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'investigation-source-changes.json');
const outputPath = path.join(root, 'source-changes.html');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function prettyDate(value) {
  if (!value) return 'First scheduled comparison pending';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
}
function list(items = []) {
  return `<ul>${items.map(item => `<li>${esc(typeof item === 'string' ? item : item.title || item.id || '')}${typeof item === 'object' && item.url ? ` · <a href="${esc(item.url)}" rel="noopener">open record</a>` : ''}</li>`).join('')}</ul>`;
}
function correctionLink(event) {
  const route = event.correctionRoute;
  if (route && typeof route === 'object') {
    const url = route.url || 'contact.html';
    const instructions = route.instructions || 'Submit a sourced correction.';
    return `<p><strong>Correction route:</strong> <a href="${esc(url)}">${esc(instructions)}</a></p>`;
  }
  return `<p><strong>Correction route:</strong> <a href="contact.html">${esc(route || 'Submit a sourced correction through the contact route.')}</a></p>`;
}
function card(event) {
  const additions = event.addedRecords?.length ? `<h4>Added records</h4>${list(event.addedRecords)}` : '';
  const removals = event.removedRecords?.length ? `<h4>Records no longer listed</h4>${list(event.removedRecords)}` : '';
  return `<article class="card redline" id="change-${esc(event.id)}"><span class="label">GRADE ${esc(event.evidenceGrade || 'C')} · ${esc(String(event.changeType || 'change').replace(/-/g, ' '))}</span><h3>${esc(event.title)}</h3><p><strong>Source:</strong> ${esc(event.source)} · ${esc(prettyDate(event.detectedAt))}</p><p><strong>What is established:</strong> ${esc(event.whatIsEstablished)}</p><p><strong>What is not established:</strong> ${esc(event.whatIsNotEstablished)}</p><p><strong>Mechanism:</strong> ${esc(event.mechanism)}</p><p><strong>Implication:</strong> ${esc(event.implication)}</p><p><strong>Alternative explanation:</strong> ${esc(event.alternativeExplanation)}</p>${additions}${removals}<h4>Next record required</h4>${list(event.nextRecordRequired || [])}${correctionLink(event)}<div class="cta-row small"><a class="btn" href="${esc(event.sourceUrl)}" rel="noopener">Open Current Source</a><a class="btn alt" href="search.html?q=${encodeURIComponent(`${event.source} ${event.changeType} removed restored source change`)}">Search Related Records</a></div></article>`;
}

const data = readJson(dataPath, {
  updated: null,
  boundary: 'No source-change feed has been generated yet.',
  methodology: '',
  summary: {},
  changes: []
});
const changes = (data.changes || []).slice(0, 100);
const summary = data.summary || {};
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Source Changes | Matrix Reprogrammed</title><meta name="description" content="Evidence-bounded record of additions, removals, wording changes, outages, restorations and preserved public-source versions."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><link rel="stylesheet" href="reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="investigation-source-ledger.html">Source Ledger</a><a href="evidence-network-map.html">Evidence Map</a><a href="search.html">Search</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Public Evidence Preservation · ${esc(prettyDate(data.updated))}</div><h1>SOURCE CHANGE RECORD.</h1><p class="lead">Additions, removals, wording changes, outages and restorations detected across registered investigation sources.</p><p><strong>Boundary:</strong> ${esc(data.boundary)}</p><p><strong>Method:</strong> ${esc(data.methodology)}</p><div class="cta-row"><a class="btn" href="investigation-source-ledger.html">All Monitored Sources</a><a class="btn alt" href="daily-investigation-conclusions.html">Daily Conclusions</a><a class="btn alt" href="data/investigation-source-changes.json">Machine-Readable Feed</a></div></section><section class="section wrap"><div class="grid"><article class="card"><span class="label">This run</span><h3>${esc(summary.meaningfulChangesThisRun || 0)} meaningful changes</h3><p>${esc(summary.sourcesCheckedThisRun || 0)} scheduled sources compared.</p></article><article class="card"><span class="label">Last 24 hours</span><h3>${esc(summary.meaningfulChangesLast24Hours || 0)} preserved observations</h3><p>${esc(summary.removalObservationsLast24Hours || 0)} removal observations · ${esc(summary.unavailableSourcesLast24Hours || 0)} unavailable · ${esc(summary.restoredSourcesLast24Hours || 0)} restored.</p></article><article class="card"><span class="label">Preservation</span><h3>${esc(summary.preservedSnapshotsThisRun || 0)} source snapshots</h3><p>${esc(summary.preservedDocumentsThisRun || 0)} newly linked documents preserved during this run.</p></article></div></section><section class="section wrap"><h2>Latest meaningful source changes</h2><div class="grid">${changes.length ? changes.map(card).join('') : '<article class="card"><h3>No meaningful change published yet</h3><p>The absence of a published change is neutral. It does not prove that every public record is complete or unchanged outside the monitored sources.</p></article>'}</div></section></main><footer class="footer wrap"><p><strong>Evidence rule:</strong> source change is a preservation fact, not an accusation. The underlying official record, judgment, filing, contract or authenticated document controls any substantive conclusion.</p></footer></div><script src="matrix.js"></script><script src="investigation-pulse.js"></script><script src="analytics.js"></script></body></html>`;
fs.writeFileSync(outputPath, html);

const markdown = ['# Investigation Source Changes', '', `Generated: ${data.updated || 'pending'}`, '', `Boundary: ${data.boundary || ''}`, '', `Method: ${data.methodology || ''}`, '', '## Latest Changes', ''];
for (const event of changes) {
  markdown.push(`### ${event.title}`, '', `Grade: ${event.evidenceGrade} · Type: ${event.changeType} · Detected: ${event.detectedAt}`, '', `Source: ${event.source}`, '', `Source URL: ${event.sourceUrl}`, '', `Established: ${event.whatIsEstablished}`, '', `Not established: ${event.whatIsNotEstablished}`, '', `Mechanism: ${event.mechanism}`, '', `Implication: ${event.implication}`, '', `Alternative explanation: ${event.alternativeExplanation}`, '', `Next record: ${(event.nextRecordRequired || []).join('; ')}`, '', `Correction route: ${typeof event.correctionRoute === 'object' ? `${event.correctionRoute.instructions || ''} (${event.correctionRoute.url || 'contact.html'})` : (event.correctionRoute || 'contact.html')}`, '');
}
fs.writeFileSync(path.join(downloadsDir, 'investigation-source-changes.md'), markdown.join('\n'));

const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes('/source-changes.html')) sitemap = sitemap.replace('</urlset>', '<url><loc>https://matrixreprogrammed.com/source-changes.html</loc></url></urlset>');
  fs.writeFileSync(sitemapPath, sitemap);
}
const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('source-changes.html')) llms += '\n- Source change record: https://matrixreprogrammed.com/source-changes.html\n';
  fs.writeFileSync(llmsPath, llms);
}
const sourceLedgerPath = path.join(root, 'investigation-source-ledger.html');
if (fs.existsSync(sourceLedgerPath)) {
  let ledger = fs.readFileSync(sourceLedgerPath, 'utf8');
  if (!ledger.includes('href="source-changes.html"')) ledger = ledger.replace('</div></section><section class="section wrap"><h2>Registered Source Platforms', '<a class="btn alt" href="source-changes.html">Source Changes</a></div></section><section class="section wrap"><h2>Registered Source Platforms');
  fs.writeFileSync(sourceLedgerPath, ledger);
}
console.log(`Source change page built: ${changes.length} public change records.`);
