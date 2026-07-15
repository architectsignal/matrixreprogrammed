const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = name => path.join(root, name);

function readJson(name, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
  catch { return fallback; }
}
function writeJson(name, value) {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
}
function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function replaceBlock(html, start, end, block) {
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (pattern.test(html)) return html.replace(pattern, block);
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  return `${html}${block}`;
}

function patchTimers() {
  for (const name of ['data/global-risk-clocks.json', 'data/clock-wall.json']) {
    const data = readJson(name, { clocks: [] });
    data.clocks = (data.clocks || []).map(clock => ({
      ...clock,
      id: clock.id || clock.slug,
      name: clock.name || clock.title,
      scoreType: clock.scoreType || 'pressureIndex',
      bandMeaning: clock.bandMeaning || clock.scoreMeaning || 'This score band has not yet been explained.',
      evidenceBoundary: clock.evidenceBoundary || clock.boundary || 'This score is an evidence-pressure indicator, not proof of motive, guilt, coordination or inevitability.'
    }));
    writeJson(name, data);
  }
  const page = file('timers.html');
  if (!fs.existsSync(page)) throw new Error('timers.html missing');
  let html = fs.readFileSync(page, 'utf8');
  html = html
    .replace(/<h3>What this means<\/h3>/g, '<h3>What this score means</h3>')
    .replace(/<h2>What every score means<\/h2>/g, '<h2>What this score means</h2>');
  if (!html.includes('What this score means')) throw new Error('timer score explanation heading missing');
  if (!html.includes('What would raise it') || !html.includes('What would lower it')) throw new Error('timer movement explanations missing');
  fs.writeFileSync(page, html);
}

function patchMigrationNews() {
  const data = readJson('data/migration-flow-panel.json', {});
  const page = file('news.html');
  if (!fs.existsSync(page)) throw new Error('news.html missing');
  const panels = Array.isArray(data.flowPanels) ? data.flowPanels : [];
  const lane = data.sexualAssaultCountryLane || {};
  const countries = Array.isArray(lane.countries) ? lane.countries : [];
  const panelsHtml = panels.map(panel => `<article class="card redline"><span class="label">Migration source lane</span><h3>${esc(panel.region)}</h3><p class="figure-block">${esc(panel.publicFigure)}</p><p><strong>Category warning:</strong> ${esc(panel.categoryWarning)}</p><p><strong>Source lane:</strong> ${esc(panel.sourceLabel)}</p><a class="btn alt" href="${esc(panel.sourceUrl)}" target="_blank" rel="noopener">Open source</a></article>`).join('');
  const countriesHtml = countries.map(country => `<article class="card"><span class="label">${esc(country.publicFigure)}</span><h3>${esc(country.country)}</h3><p><strong>${esc(country.sourceSplitStatus)}</strong></p><p>${esc(country.latestSourceStatus)}</p><p><strong>Available:</strong> ${esc((country.availableSplits || []).join('; '))}</p><p><strong>Missing:</strong> ${esc((country.missingSplits || []).join('; '))}</p><p><strong>Evidence warning:</strong> ${esc(country.evidenceWarning)}</p><p><strong>Source lane:</strong> ${esc(country.sourceLabel)}</p></article>`).join('');
  const start = '<!-- mission-migration-summary:start -->';
  const end = '<!-- mission-migration-summary:end -->';
  const block = `${start}<section id="mission-migration-summary" class="section wrap"><div class="eyebrow">Migration evidence lane</div><h2>${esc(data.title || 'Migration / Irregular Immigration Flow Panel')}</h2><p class="lead">${esc(data.summary || '')}</p><p><strong>Evidence boundary:</strong> ${esc(data.evidenceRule || '')}</p><div class="grid">${panelsHtml}</div><article class="card redline"><span class="label">EU official total marker</span><h3>${esc(lane.title || 'Sexual Offence Statistics / Migrant-Status Split By Country')}</h3><p class="figure-block">${esc(lane.euHeadline || '')}</p><p>${esc(lane.evidenceRule || '')}</p><p><strong>${countries.length} countries mapped</strong></p></article><div class="grid">${countriesHtml}</div><div class="cta-row"><a class="btn" href="migration-flow.html">Open full migration/source-split panel</a><a class="btn alt" href="data/migration-flow-panel.json">Open machine-readable data</a></div></section>${end}`;
  let html = fs.readFileSync(page, 'utf8');
  html = replaceBlock(html, start, end, block).replace(/EST\.\s*SOURCE-SPLIT/gi, 'OFFICIAL SEXUAL-OFFENCE STATS AVAILABLE');
  fs.writeFileSync(page, html);
}

function ensureEpsteinTimeline() {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Epstein Timeline | Matrix Reprogrammed</title><meta name="description" content="Evidence-bounded chronological Epstein public-record map and cross-reference route."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="epstein-files.html">Epstein Files</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main class="wrap section"><div class="eyebrow">Public-record chronology</div><h1>EPSTEIN TIMELINE.</h1><p class="lead">This route opens the chronological case board inside the Epstein Files command centre. Each entry separates date, entity, evidence class, source door, documented support and unanswered questions.</p><article class="card redline"><h2>Evidence boundary</h2><p>Appearance in a public file, address book, flight record, email, photograph or social connection is a research lead, not proof of wrongdoing. Sequence and association do not establish guilt, knowledge, command or shared intent.</p><a class="btn" href="epstein-files.html#epstein-timeline-map">Open the timeline and cross-reference map</a></article></main><footer class="footer wrap"><p>Source first. Claim second. Boundary always.</p></footer></div><script src="matrix.js"></script></body></html>`;
  fs.writeFileSync(file('epstein-timeline.html'), html);
}

function patchQueryOnlyLinks() {
  for (const name of fs.readdirSync(root).filter(name => /^dossier-pack-.*\.html$/i.test(name))) {
    const page = file(name);
    const before = fs.readFileSync(page, 'utf8');
    const after = before.replace(/href=(["'])\?([^"']+)\1/g, `href=$1${name}?$2$1`);
    if (after !== before) fs.writeFileSync(page, after);
  }
}

patchTimers();
patchMigrationNews();
ensureEpsteinTimeline();
patchQueryOnlyLinks();
require('./sanitize-timer-source-links.js');
console.log('Final mission surfaces reconciled: timers, migration summary, Epstein timeline, query-only links and timer source routes.');