const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataFile = path.join(root, 'data', 'policy-convergence-tracker.json');
const downloadsDir = path.join(root, 'downloads');

if (!fs.existsSync(dataFile)) {
  console.log('No policy convergence tracker data found. Skipping.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jsonOut = 'downloads/policy-convergence-tracker.json';
const mdOut = 'downloads/policy-convergence-tracker.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));

const md = [
  '# Public Policy Convergence Tracker',
  '',
  `Updated: ${data.updated || '2026-06-29'}`,
  '',
  '## Purpose', data.purpose || '', '',
  '## Boundary', data.boundary || '', '',
  '## Source Hierarchy', ...(data.sourceHierarchy || []).map(item => `- ${item}`), '',
  '## Signal Levels', ...(data.signalLevels || []).map(item => `- Level ${item.level}: ${item.name} — ${item.meaning}`), '',
  '## Lanes', ...(data.lanes || []).map(lane => `- ${lane.title}: ${lane.plainEnglish} Question: ${lane.readerQuestion}`), '',
  '## Cross Links', ...(data.crossLinks || []).map(link => `- ${link.from} → ${link.to}: ${link.meaning}`), '',
  '## Reader Method', ...(data.readerMethod || []).map(rule => `- ${rule}`)
].join('\n');
fs.writeFileSync(path.join(root, mdOut), md);

function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="control-system-tracker.html">Control Tracker</a><a href="power-atlas.html">Power Atlas</a><a href="atlas-index.html">Atlas Nodes</a><a href="evidence-vault.html">Evidence Vault</a><a href="news.html">Intel Desk</a><a href="search.html">Search</a></nav></header>`;
}
const sourceList = (data.sourceHierarchy || []).map(item => `<li>${esc(item)}</li>`).join('');
const levels = (data.signalLevels || []).map(item => `<article class="card"><span class="label">Level ${esc(item.level)}</span><h3>${esc(item.name)}</h3><p>${esc(item.meaning)}</p></article>`).join('');
const laneCards = (data.lanes || []).map(lane => `<article class="card redline"><span class="label">Tracking lane</span><h3>${esc(lane.title)}</h3><p>${esc(lane.plainEnglish)}</p><p><strong>Track:</strong> ${esc((lane.track || []).join(' · '))}</p><p><strong>Actors:</strong> ${esc((lane.actors || []).join(' · '))}</p><p><strong>Watch for:</strong> ${esc((lane.watchFor || []).join(' · '))}</p><p><strong>Reader question:</strong> ${esc(lane.readerQuestion)}</p></article>`).join('');
const crossCards = (data.crossLinks || []).map(link => `<article class="card"><span class="label">Cross-link</span><h3>${esc(link.from)} → ${esc(link.to)}</h3><p>${esc(link.meaning)}</p></article>`).join('');
const method = (data.readerMethod || []).map(rule => `<li>${esc(rule)}</li>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Control System Tracker | Matrix Reprogrammed</title><meta name="description" content="Public-record tracker for institutional convergence: digital ID, CBDC, global standards, security powers, health governance, climate policy, migration systems, and food supply chains." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}<main><section class="hero wrap"><div class="eyebrow">Public Record Tracker</div><h1>CONTROL SYSTEM TRACKER.</h1><p class="lead">${esc(data.readerTranslation || data.purpose)}</p><div class="cta-row"><a class="btn" href="${jsonOut}">Open tracker JSON</a><a class="btn alt" href="${mdOut}">Tracker brief</a><a class="btn alt" href="power-atlas.html">Power Atlas</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section><section class="section wrap split"><div><h2>What This Tracks</h2><p class="lead">This page turns mandates, policy papers, pilots, contracts, treaties, procurement, and institutional partnerships into a usable map of where power is centralising.</p><div class="terminal">TRACKING METHOD\n&gt; Actor\n&gt; Date\n&gt; Jurisdiction\n&gt; Source class\n&gt; Signal level\n&gt; Integration links\n&gt; Boundary language</div></div><aside class="card redline"><h2>Boundary</h2><p>${esc(data.boundary)}</p></aside></section><section class="section wrap"><h2>Source Hierarchy</h2><div class="card"><ul>${sourceList}</ul></div></section><section class="section wrap"><h2>Signal Levels</h2><div class="grid">${levels}</div></section><section class="section wrap"><h2>Tracker Lanes</h2><div class="grid">${laneCards}</div></section><section class="section wrap"><h2>Cross-System Links</h2><p class="lead">The important signal is convergence: identity joining money, health, travel, speech, security, energy, or food systems.</p><div class="grid">${crossCards}</div></section><section class="section wrap"><h2>Reader Method</h2><div class="card redline"><ul>${method}</ul></div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — follow the documents, classify the evidence, map the system.</p><p class="warning">Boundary: a policy, mandate, pilot or institution is a record item. It must not be treated as proof of hidden coordination without stronger records.</p></footer></div><script src="matrix.js"></script></body></html>`;

fs.writeFileSync(path.join(root, 'control-system-tracker.html'), html);

function patchFileIfExists(file, marker, insert) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.includes(marker)) return;
  text = `${text.trim()}\n${insert}\n`;
  fs.writeFileSync(filePath, text);
}

patchFileIfExists('llms.txt', '/control-system-tracker.html', '\nControl System Tracker:\n- /control-system-tracker.html: public-record policy convergence tracker for digital ID, programmable money, global standards, security powers, health governance, climate/energy, migration/borders, and food/land systems.');

if (fs.existsSync(path.join(root, 'search-index.json'))) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'search-index.json'), 'utf8'));
  if (!index.some(item => item.url === 'control-system-tracker.html')) {
    index.push({
      key: 'control-system-tracker',
      title: 'Control System Tracker',
      subtitle: 'Policy Convergence Tracker',
      series: 'Power Atlas',
      category: 'Institutional Tracking',
      url: 'control-system-tracker.html',
      description: data.purpose,
      keywords: ['Agenda 2030', 'digital ID', 'CBDC', 'policy mandates', 'global standards', 'security powers', 'climate policy', 'health governance', 'migration systems', 'food systems']
    });
    fs.writeFileSync(path.join(root, 'search-index.json'), JSON.stringify(index, null, 2));
  }
}

console.log(`Built policy convergence tracker with ${(data.lanes || []).length} lanes and ${(data.crossLinks || []).length} cross-links.`);
