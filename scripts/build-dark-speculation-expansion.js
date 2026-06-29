const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'dark-speculation-expansion.json');
const pagePath = path.join(root, 'dark-speculation-lab.html');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(dataPath) || !fs.existsSync(pagePath)) {
  console.log('No dark speculation expansion data/page found. Skipping.');
  process.exit(0);
}
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const jsonOut = 'downloads/dark-speculation-deep-dossiers.json';
const mdOut = 'downloads/dark-speculation-deep-dossiers.md';
fs.writeFileSync(path.join(root, jsonOut), JSON.stringify(data, null, 2));
const md = ['# Dark Speculation Deep Dossiers', '', `Updated: ${data.updated}`, '', '## Boundary', data.boundary, '', '## Source Method', ...(data.sourceMethod || []).map(x => `- ${x}`), '', ...(data.dossiers || []).map(d => `## ${d.title}\n\n- Category: ${d.category}\n- Classification: ${d.classification}\n- Current status: ${d.currentStatus}\n- Origin pattern: ${d.originPattern}\n- Why it matters: ${d.whyItMatters}\n- What to track: ${(d.whatToTrack || []).join('; ')}\n- Evidence needed to upgrade: ${(d.evidenceNeededToUpgrade || []).join('; ')}\n- Safe route: ${d.safeRoute}\n- Boundary: ${d.boundary}`)].join('\n');
fs.writeFileSync(path.join(root, mdOut), md);
const cards = (data.dossiers || []).map(d => `<article id="${esc(d.slug)}" class="card redline"><span class="label">${esc(d.category)} · ${esc(d.classification)}</span><h3>${esc(d.title)}</h3><p><strong>Current status:</strong> ${esc(d.currentStatus)}</p><p><strong>Origin pattern:</strong> ${esc(d.originPattern)}</p><p><strong>Why it matters:</strong> ${esc(d.whyItMatters)}</p><p><strong>Track:</strong> ${esc((d.whatToTrack || []).join(' · '))}</p><p><strong>Upgrade evidence:</strong> ${esc((d.evidenceNeededToUpgrade || []).join(' · '))}</p><p><strong>Boundary:</strong> ${esc(d.boundary)}</p><div class="cta-row small"><a class="btn alt" href="${esc(d.safeRoute)}">Safe route</a><a class="btn alt" href="claim-classifier.html">Claim classifier</a><a class="btn" href="dark-speculation-forum.html">Drop a source</a></div></article>`).join('');
const rules = (data.sourceMethod || []).map(x => `<li>${esc(x)}</li>`).join('');
const section = `<section id="dark-speculation-deep-dossiers" class="section wrap"><h2>Deep Dossiers: Dark Claims, Debunks, Control-System Motifs</h2><p class="lead">This is the deeper speculation layer. It can go darker, but it must classify the claim before belief: origin, current status, evidence level, counter-source, and what would upgrade the claim.</p><div class="cta-row"><a class="btn" href="${jsonOut}">Deep dossier JSON</a><a class="btn alt" href="${mdOut}">Deep dossier brief</a><a class="btn alt" href="control-system-tracker.html">Control Tracker</a><a class="btn alt" href="timers.html">Risk Timers</a></div><article class="card redline"><h3>Hard Boundary</h3><p>${esc(data.boundary)}</p><ul>${rules}</ul></article><div class="grid">${cards}</div></section>`;
let html = fs.readFileSync(pagePath, 'utf8');
if (html.includes('id="dark-speculation-deep-dossiers"')) html = html.replace(/<section id="dark-speculation-deep-dossiers"[\s\S]*?<\/section>/, section);
else html = html.replace('</main>', `${section}</main>`);
fs.writeFileSync(pagePath, html);
console.log(`Rendered ${(data.dossiers || []).length} dark speculation deep dossiers.`);
