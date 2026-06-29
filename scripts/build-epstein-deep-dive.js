const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'epstein-network-deep-dive.json');
const pageFile = path.join(root, 'epstein-files.html');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile) || !fs.existsSync(pageFile)) {
  console.log('Epstein deep dive data or page missing. Skipping.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/epstein-network-deep-dive.json';
const mdOut = 'downloads/epstein-network-deep-dive.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));

const md = [
  '# Epstein Network Deep Dive Matrix',
  '',
  `Updated: ${data.updated || '2026-06-29'}`,
  '',
  '## Evidence Boundary',
  data.boundary || '',
  '',
  '## Source Hierarchy',
  ...(data.sourceHierarchy || []).map(item => `- ${item}`),
  '',
  '## Locations / Property / Aviation Corridors',
  ...(data.locations || []).map(item => `- ${item.name} — ${item.type}. ${item.whyItMatters} Boundary: ${item.boundary}`),
  '',
  '## Network Lanes',
  ...(data.networkLanes || []).map(item => `- ${item.title}: ${item.question} Records: ${(item.recordsToTrack || []).join(', ')}`),
  '',
  '## People To Add Or Deepen',
  ...(data.peopleToAddOrDeepen || []).map(item => `- ${item.name} — ${item.type}. Focus: ${item.recordFocus}. Dates: ${(item.datesToTrack || []).join('; ')}. Locations: ${(item.locationsToTrack || []).join('; ')}. Boundary: ${item.claimBoundary}`),
  '',
  '## Date Anchors',
  ...(data.dateAnchors || []).map(item => `- ${item.date} — ${item.event}: ${item.whyTrack}`),
  '',
  '## Private Jet Tracker Rules',
  ...(data.privateJetTrackerRules || []).map(item => `- ${item}`),
  '',
  '## Deep-State / Institutional Overlap Framing Rules',
  ...(data.deepStateFramingRules || []).map(item => `- ${item}`),
  '',
  '## Source Doors',
  ...(data.sourceDoors || []).map(item => `- ${item.label}: ${item.url} (${item.sourceType})`)
].join('\n');
fs.writeFileSync(path.join(root, mdOut), md);

const sourceDoorLinks = (data.sourceDoors || []).map(link => `<a class="btn alt" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join('');
const sourceHierarchy = (data.sourceHierarchy || []).map(item => `<li>${esc(item)}</li>`).join('');
const locationCards = (data.locations || []).map(item => `<article class="card redline"><span class="label">${esc(item.type)}</span><h3>${esc(item.name)}</h3><p><strong>Why it matters:</strong> ${esc(item.whyItMatters)}</p><p><strong>Record use:</strong> ${esc(item.recordUse)}</p><p><strong>Boundary:</strong> ${esc(item.boundary)}</p></article>`).join('');
const laneCards = (data.networkLanes || []).map(item => `<article class="card redline"><span class="label">Institution / money / logistics lane</span><h3>${esc(item.title)}</h3><p><strong>Question:</strong> ${esc(item.question)}</p><p><strong>Records to track:</strong> ${esc((item.recordsToTrack || []).join(' · '))}</p><p><strong>Institutional-overlap question:</strong> ${esc(item.deepStateOverlapQuestion)}</p></article>`).join('');
const peopleCards = (data.peopleToAddOrDeepen || []).map(item => `<article class="card redline"><span class="label">${esc(item.evidenceClass)}</span><h3>${esc(item.name)}</h3><p><strong>Type:</strong> ${esc(item.type)}</p><p><strong>Record focus:</strong> ${esc(item.recordFocus)}</p><p><strong>Dates to track:</strong> ${esc((item.datesToTrack || []).join(' · '))}</p><p><strong>Locations / corridors:</strong> ${esc((item.locationsToTrack || []).join(' · '))}</p><p><strong>Institutional overlap:</strong> ${esc((item.institutionalOverlap || []).join(' · '))}</p><p><strong>Boundary:</strong> ${esc(item.claimBoundary)}</p></article>`).join('');
const dateCards = (data.dateAnchors || []).map(item => `<article class="news-item"><span class="figure-caption">${esc(item.date)}</span><h3>${esc(item.event)}</h3><p>${esc(item.whyTrack)}</p></article>`).join('');
const jetRules = (data.privateJetTrackerRules || []).map(item => `<li>${esc(item)}</li>`).join('');
const framingRules = (data.deepStateFramingRules || []).map(item => `<li>${esc(item)}</li>`).join('');

const section = `<section id="epstein-deep-dive-matrix" class="section wrap">
  <h2>Deep Dive Tracker: People, Flights, Locations, Money, Institutions</h2>
  <p class="lead">This layer turns the Epstein hub into a research machine: names, dates, private aviation, properties, money paths, legal/prosecutorial decisions, media strategy, political access, and institutional overlap. It is built to expose the structure while keeping every claim tied to record class and evidence boundary.</p>
  <div class="cta-row"><a class="btn" href="${jsonOut}">Open deep-dive JSON</a><a class="btn alt" href="${mdOut}">Deep-dive brief</a>${sourceDoorLinks}</div>
  <div class="terminal">DEEP DIVE METHOD\n&gt; Track the person\n&gt; Anchor the date\n&gt; Map the location or flight corridor\n&gt; Identify money, institution, media, legal or political lane\n&gt; Attach source door\n&gt; Keep speculation quarantined until a stronger record appears</div>
  <h2>Source Hierarchy</h2><div class="card redline"><ul>${sourceHierarchy}</ul></div>
  <h2>Locations / Private Jet / Property Corridors</h2><div class="grid">${locationCards}</div>
  <h2>Institution, Money, Media, Political And Legal Lanes</h2><div class="grid">${laneCards}</div>
  <h2>People To Add Or Deepen Next</h2><div class="grid">${peopleCards}</div>
  <h2>Date Anchors</h2><div class="news-grid">${dateCards}</div>
  <h2>Private Jet Tracker Rules</h2><div class="card redline"><ul>${jetRules}</ul></div>
  <h2>Deep-State / Institutional Overlap Framing</h2><div class="card redline"><ul>${framingRules}</ul></div>
</section>`;

let html = fs.readFileSync(pageFile, 'utf8');
if (html.includes('id="epstein-deep-dive-matrix"')) {
  html = html.replace(/<section id="epstein-deep-dive-matrix"[\s\S]*?<\/section>/, section);
} else {
  html = html.replace('</main>', `${section}</main>`);
}
fs.writeFileSync(pageFile, html);

console.log(`Rendered Epstein deep dive matrix with ${(data.peopleToAddOrDeepen || []).length} people targets, ${(data.locations || []).length} location/corridor cards, ${(data.networkLanes || []).length} institution lanes, and ${(data.dateAnchors || []).length} date anchors.`);
