const fs = require('fs');
const path = require('path');
const root = process.cwd();
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const currentDataPath = path.join(root,'data','migration-flow-panel.json');
const pagePath = path.join(root,'news.html');
if (!fs.existsSync(currentDataPath) || !fs.existsSync(pagePath)) process.exit(0);
const data = JSON.parse(fs.readFileSync(currentDataPath,'utf8'));
let html = fs.readFileSync(pagePath,'utf8');
const lane = data.sexualAssaultCountryLane || {};
const countries = Array.isArray(lane.countries) ? lane.countries : [];
if (!countries.length) process.exit(0);
function sourceLink(url, label){return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;}
const cards = countries.map(c => `<article class="card amber"><span class="label">${esc(c.publicFigure || 'OFFICIAL SEXUAL-OFFENCE STATS AVAILABLE')}</span><h3>${esc(c.country)}</h3><p><strong>Source split:</strong> ${esc(c.sourceSplitStatus || 'IMMIGRATION-STATUS SPLIT NOT CLEAN')}</p><p>${esc(c.latestSourceStatus || '')}</p><p><strong>Available:</strong> ${esc((c.availableSplits || []).join('; '))}.</p><p><strong>Missing:</strong> ${esc((c.missingSplits || []).join('; '))}.</p><p><strong>Evidence warning:</strong> ${esc(c.evidenceWarning || data.evidenceRule || '')}</p><p class="source-list">${sourceLink(c.sourceUrl || 'migration-flow.html', c.sourceLabel || c.officialStatsLane || 'Official source lane')}</p></article>`).join('');
const section = `<section id="migrant-sexual-offence-country" class="section wrap"><h2>${esc(lane.title || 'Sexual Offence Statistics / Migrant-Status Split By Country')}</h2><p class="lead">${esc(lane.summary || '')}</p><article class="card redline"><span class="label">EU official total marker</span><h3>Eurostat 2024 sexual-violence marker</h3><p class="figure-block">${esc(lane.euHeadline || '')}</p><p>${esc(lane.evidenceRule || data.evidenceRule || '')}</p></article><div class="grid">${cards}</div></section>`;
if (html.includes('id="migrant-sexual-offence-country"')) {
  html = html.replace(/<section id="migrant-sexual-offence-country"[\s\S]*?<\/section>/, section);
} else if (html.includes('<div class="card redline"><h3>Migration Display Rule</h3>')) {
  html = html.replace(/<div class="card redline"><h3>Migration Display Rule<\/h3>/, `${section}<div class="card redline"><h3>Migration Display Rule</h3>`);
} else if (html.includes('</main>')) {
  html = html.replace('</main>', `${section}</main>`);
} else {
  html += section;
}
html = html
  .replace(/EST\.\s*SOURCE-SPLIT/gi, 'OFFICIAL SEXUAL-OFFENCE STATS AVAILABLE')
  .replace(/Needs official source split/gi, 'Official sexual-offence stats available; clean immigration-status split still not available')
  .replace(/Official source lane identified/gi, 'Official sexual-offence stats available; source lane identified');
fs.writeFileSync(pagePath, html);
console.log('Migration crime country grid enhanced from current migration-flow-panel data; deprecated source-split marker scrubbed.');
