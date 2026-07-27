'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = value => path.join(root, value);
const exists = value => fs.existsSync(at(value));
const read = value => fs.readFileSync(at(value), 'utf8');
const readJson = (value, fallback = {}) => { try { return JSON.parse(read(value)); } catch { return fallback; } };
const write = (value, content) => { fs.mkdirSync(path.dirname(at(value)), { recursive: true }); fs.writeFileSync(at(value), content); };
const clean = (value, max = 1200) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const array = value => Array.isArray(value) ? value : [];

const watch = readJson('data/daily-watch.json', {});
if (!watch.ok || !watch.person || !watch.institution || !watch.family) throw new Error('Daily watch data is missing or incomplete. Run build-daily-watch.js first.');

const markerStart = '<!-- daily-mission-watch:start -->';
const markerEnd = '<!-- daily-mission-watch:end -->';

function card(key, item) {
  const lanes = array(item.investigativeLanes).map(lane => `<span>${esc(lane)}</span>`).join('');
  return `<article class="daily-mission-watch-card ${esc(key)}"><span class="label">${esc(key)} to watch today</span><h3>${esc(item.name)}</h3><p><strong>Why today:</strong> ${esc(clean(item.selectionBasis, 520))}</p><p><strong>Why it matters:</strong> ${esc(clean(item.whyItMatters, 620))}</p><p><strong>How it fits the mission:</strong> ${esc(clean(item.howItFits, 720))}</p><p><strong>What it points toward:</strong> ${esc(clean(item.whatItPointsToward, 620))}</p><p class="daily-watch-boundary"><strong>What it does not prove:</strong> ${esc(clean(item.whatItDoesNotProve, 520))}</p><div class="daily-watch-lanes">${lanes}</div><div class="daily-watch-status"><span>${esc(item.effectOnLane)}</span><span>${esc(item.evidenceStrength)}</span><span>Confidence: ${esc(item.confidence)}</span></div></article>`;
}

const block = `${markerStart}<section id="daily-mission-watch" class="section wrap"><div class="daily-watch-heading"><div><div class="eyebrow">Daily mission watch · ${esc(watch.date)}</div><h2>PERSON. INSTITUTION. FAMILY.</h2><p class="lead">Why today’s evidence elevates these entities—and exactly how each one fits the site mission.</p></div><a class="btn" href="daily-watch.html">Open Full Daily Watch</a></div><p><strong>Evidence direction:</strong> ${esc(clean(watch.leadingEvidenceConclusion, 1100))}</p><div class="daily-mission-watch-grid">${card('person', watch.person)}${card('institution', watch.institution)}${card('family', watch.family)}</div><p class="daily-watch-boundary"><strong>Boundary:</strong> ${esc(watch.boundary)}</p><style>.daily-watch-heading{display:flex;justify-content:space-between;gap:1rem;align-items:end;flex-wrap:wrap}.daily-mission-watch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:.85rem}.daily-mission-watch-card{border:1px solid rgba(216,181,106,.25);border-radius:16px;padding:1rem;background:rgba(0,0,0,.78)}.daily-mission-watch-card.person{border-left:4px solid #d8b56a}.daily-mission-watch-card.institution{border-left:4px solid #8aa5d8}.daily-mission-watch-card.family{border-left:4px solid #a87171}.daily-mission-watch-card p{line-height:1.5}.daily-watch-boundary{color:#c7b98e;font-size:.88rem}.daily-watch-lanes,.daily-watch-status{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.65rem}.daily-watch-lanes span,.daily-watch-status span{border:1px solid rgba(216,181,106,.22);border-radius:999px;padding:.28rem .5rem;font-size:.73rem}.daily-watch-status{color:#d9c58e}</style></section>${markerEnd}`;

function injectHtml(relative) {
  if (!exists(relative)) return false;
  let html = read(relative).replace(/<!-- daily-mission-watch:start -->[\s\S]*?<!-- daily-mission-watch:end -->/g, '');
  if (relative === 'index.html' && /<!-- homepage-command-surface:end -->/.test(html)) {
    html = html.replace('<!-- homepage-command-surface:end -->', `<!-- homepage-command-surface:end -->${block}`);
  } else if (/<main[^>]*>/i.test(html)) {
    const main = html.match(/<main[^>]*>/i)[0];
    html = html.replace(main, `${main}${block}`);
  } else if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${block}</body>`);
  } else {
    html += block;
  }
  write(relative, html);
  return true;
}

const patchedPages = ['index.html','daily-command-brief.html','daily-brain-brief.html','live-intel.html'].filter(injectHtml);

function attachJson(relative, field = 'dailyWatch') {
  if (!exists(relative)) return false;
  const value = readJson(relative, {});
  value[field] = {
    updated: watch.updated,
    date: watch.date,
    route: 'daily-watch.html',
    person: watch.person,
    institution: watch.institution,
    family: watch.family,
    boundary: watch.boundary
  };
  write(relative, JSON.stringify(value, null, 2));
  return true;
}

const patchedData = [
  attachJson('data/homepage-command-surface.json'),
  attachJson('data/daily-command-brief.json'),
  attachJson('data/daily-brain-brief.json'),
  attachJson('data/live-intel.json')
].filter(Boolean).length;

write('downloads/daily-watch-publication-report.json', JSON.stringify({
  ok: patchedPages.length >= 3,
  generatedAt: new Date().toISOString(),
  watchDate: watch.date,
  pages: patchedPages,
  dataProductsPatched: patchedData,
  requiredSlots: ['person','institution','family'],
  boundary: watch.boundary
}, null, 2));

if (patchedPages.length < 3) throw new Error(`Daily watch reached only ${patchedPages.length} public page(s); expected at least three.`);
console.log(`Daily watch published across ${patchedPages.length} page(s) and ${patchedData} data product(s).`);
