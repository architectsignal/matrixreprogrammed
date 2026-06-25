const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-timeline-map.json');
const pageFile = path.join(root, 'epstein-files.html');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile)) {
  console.log('No Epstein timeline map data found. Skipping Phase 6.');
  process.exit(0);
}
if (!fs.existsSync(pageFile)) {
  console.log('No epstein-files.html found. Skipping Phase 6.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-timeline-map.json';
const mdOut = 'downloads/epstein-timeline-map.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
fs.writeFileSync(path.join(root, mdOut), [
  '# Epstein Timeline + Cross-Reference Map',
  '',
  `Updated: ${data.updated || '2026-06-25'}`,
  '',
  '## Boundary',
  data.boundary || '',
  '',
  '## Timeline Items',
  ...(data.items || []).map(item => `- ${item.date} — ${item.title}. Evidence: ${item.evidenceClass}. People/entities: ${(item.people || []).join(', ')}. Supports: ${item.recordSupports}. Open questions: ${item.openQuestions}. Source: ${item.sourceDoor}`),
  '',
  '## Cross-Reference Rules',
  ...(data.crossReferenceRules || []).map(rule => `- ${rule}`),
  '',
  '## Daily Update Integration',
  `- Lane: ${data.dailyUpdateIntegration && data.dailyUpdateIntegration.laneId || 'epstein-files'}`,
  `- Route: ${data.dailyUpdateIntegration && data.dailyUpdateIntegration.commandCenterRoute || 'epstein-files.html#epstein-timeline-map'}`
].join('\n'));

const timelineCards = (data.items || []).map(item => `<article class="card redline"><span class="label">${esc(item.date)} · ${esc(item.evidenceClass)}</span><h3>${esc(item.title)}</h3><p><strong>People / entities:</strong> ${esc((item.people || []).join(' · '))}</p><p><strong>What the record supports:</strong> ${esc(item.recordSupports)}</p><p><strong>Open questions:</strong> ${esc(item.openQuestions)}</p><a class="btn alt" href="${esc(item.sourceDoor)}" target="_blank" rel="noopener">Open Source Door</a></article>`).join('');
const rules = (data.crossReferenceRules || []).map(rule => `<li>${esc(rule)}</li>`).join('');
const daily = data.dailyUpdateIntegration || {};
const searchTerms = (daily.requiredSearchTerms || []).map(term => `<span class="pill">${esc(term)}</span>`).join(' ');
const section = `<section id="epstein-timeline-map" class="section wrap"><h2>Timeline + Cross-Reference Map</h2><p class="lead">This turns the Command Center into a chronological case board. Each entry shows the date, people/entities, evidence class, source door, what the record supports, and what remains open. The goal is sequence: who appears when, under what record type, and how the evidence connects across the people tracker, email map, actual files cockpit, evidence ladder, and network architecture matrix.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Open timeline source file</a><a class="btn alt" href="${mdOut}">Timeline brief</a><a class="btn alt" href="${esc(daily.commandCenterRoute || 'epstein-files.html#epstein-timeline-map')}">Command Center timeline</a><a class="btn alt" href="downloads/epstein-evidence-ladder.json">Evidence ladder</a></div><h2>Chronological Case Board</h2><div class="grid">${timelineCards}</div><div class="card redline"><h3>Cross-Reference Rules</h3><ul>${rules}</ul><p><strong>Daily update lane:</strong> ${esc(daily.laneId || 'epstein-files')}</p><p><strong>Daily search terms:</strong> ${searchTerms}</p></div><div class="terminal">TIMELINE METHOD\n&gt; Date first\n&gt; Evidence class second\n&gt; People/entities third\n&gt; Source door fourth\n&gt; Record support fifth\n&gt; Open questions last\n&gt; Sequence is not a verdict</div></section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (!html.includes('id="epstein-timeline-map"')) {
  const anchor = 'id="epstein-evidence-ladder"';
  if (html.includes(anchor)) {
    html = html.replace(`<section ${anchor}`, `${section}<section ${anchor}`);
  } else {
    html = html.replace('</main>', `${section}</main>`);
  }
  fs.writeFileSync(pageFile, html);
}

console.log(`Built Epstein Timeline + Cross-Reference Map with ${(data.items || []).length} timeline items and ${(data.crossReferenceRules || []).length} cross-reference rules.`);