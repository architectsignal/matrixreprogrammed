const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = value => path.join(root, value);
const readJson = (relative, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file(relative), 'utf8')); } catch { return fallback; }
};
const write = (relative, value) => {
  fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
  fs.writeFileSync(file(relative), value);
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const clean = (value, max = 4000) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const list = (items, empty = 'No item recorded in this build.') => {
  const values = (items || []).map(item => clean(item, 700)).filter(Boolean);
  return values.length ? values.map(item => `<li>${escapeHtml(item)}</li>`).join('') : `<li>${escapeHtml(empty)}</li>`;
};
function safeRoute(value) {
  const route = clean(value, 1600);
  if (!route || /\s/.test(route) || /[<>"']/.test(route)) return '';
  if (/^https?:\/\//i.test(route)) {
    try { return new URL(route).href; } catch { return ''; }
  }
  if (/^(?:\/|\.\/|\.\.\/)?[a-z0-9][a-z0-9._~!$&()*+,;=:@%\/-]*(?:\?[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?(?:#[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/i.test(route)) return route;
  return '';
}
const linkList = routes => [...new Set((routes || []).map(safeRoute).filter(Boolean))]
  .slice(0, 10)
  .map(route => `<a href="${escapeHtml(route)}">${escapeHtml(String(route).replace(/\.html.*$/, '').replace(/^.*\//, '').replace(/[-_]/g, ' ') || 'source')}</a>`)
  .join('');

require('./build-mission-timers.js');
const wall = readJson('data/clock-wall.json', { clocks: [] });
const clocks = Array.isArray(wall.clocks) ? wall.clocks : [];

function latestChange(clock) {
  return clean(clock.lastMovement || `Held at ${clock.score}. No source-linked trigger justified a change in this build.`, 360);
}

function speculation(clock) {
  const themes = (clock.missionThemes || []).map(item => item.label).filter(Boolean);
  const lane = themes.length ? themes.join(', ') : 'the systems named in this clock';
  return `If the documented pattern continues, the likely direction is greater dependence on, integration of, or enforcement through ${lane}. That could increase the practical leverage of institutions controlling identity, money, data, platforms, health, security or access infrastructure. This is a trajectory inference, not proof of a coordinated final plan, one-world government, one-world currency or one-world religion.`;
}

function timerCard(clock) {
  const score = Number(clock.score || 0);
  const sources = (clock.evidenceInputs || []).slice(0, 6).map(item => {
    const title = escapeHtml(item.title || 'Source record');
    const level = item.evidenceLevel ? ` — ${escapeHtml(item.evidenceLevel)}` : '';
    const published = item.published ? ` · ${escapeHtml(String(item.published).slice(0, 10))}` : '';
    const safe = safeRoute(item.route);
    const route = safe ? ` · <a href="${escapeHtml(safe)}">open</a>` : '';
    return `<li><strong>${title}</strong>${level}${published}${route}</li>`;
  }).join('') || '<li>No fresh direct source matched this build. The clock remains an editorial watch lane.</li>';
  const themes = (clock.missionThemes || []).map(item => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.question || '')}</li>`).join('') || '<li>General system-pressure relevance; no single control theme assigned.</li>';
  return `<article class="clock-card" id="${escapeHtml(clock.slug || '')}" data-clock-score="${score}">
    <div class="clock-topline" data-clock-summary-only="true"><span class="clock-score-badge">${score}%</span><span class="clock-window">${escapeHtml(clock.window || 'Review window not set')}</span></div>
    <div class="clock-summary" data-clock-summary-only="true">
      <div class="clock-ring" style="--p:${score}" aria-label="${score} percent pressure index"><strong>${score}%</strong></div>
      <div class="clock-heading">
        <span class="clock-band">${escapeHtml(clock.scoreBand || clock.status || 'Watch')}</span>
        <h2>${escapeHtml(clock.title)}</h2>
        <p class="clock-change">${escapeHtml(latestChange(clock))}</p>
      </div>
    </div>
    <details class="clock-detail">
      <summary>Open deeper information</summary>
      <div class="clock-detail-body">
        <section><h3>What changed:</h3><p>${escapeHtml(latestChange(clock))}</p></section>
        <section><h3>What this means</h3><p>${escapeHtml(clock.plainEnglishConclusion || clock.signals || '')}</p><p><strong>Score meaning:</strong> ${escapeHtml(clock.scoreMeaning || '')}</p></section>
        <section><h3>How it is calculated</h3><p>${escapeHtml(clock.calculationBasis || clock.scoreMethod || '')}</p></section>
        <section><h3>Control-system relevance</h3><p>${escapeHtml(clock.controlSystemMeaning || '')}</p><ul>${themes}</ul></section>
        <section class="speculation-panel"><h3>Speculation angle</h3><p><strong>Likely trajectory if the pattern continues:</strong> ${escapeHtml(speculation(clock))}</p></section>
        <section class="clock-columns"><div><h3>What would raise it</h3><ul>${list(clock.whatRaises)}</ul></div><div><h3>What would lower it</h3><ul>${list(clock.whatLowers)}</ul></div></section>
        <section><h3>Evidence feeding this timer</h3><ul>${sources}</ul></section>
        <section><h3>Missing records</h3><ul>${list(clock.missingEvidence)}</ul></section>
        <section><h3>Useful next actions</h3><ol>${list(clock.usefulNextActions)}</ol></section>
        <p class="clock-boundary"><strong>Boundary:</strong> ${escapeHtml(clock.boundary || 'This is a pressure index, not event probability or proof of motive.')}</p>
        <div class="clock-links">${linkList(clock.sourceRoutes)}</div>
      </div>
    </details>
  </article>`;
}

const cards = clocks.map(timerCard).join('');
const timerHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Mission Timers | Matrix Reprogrammed</title><meta name="description" content="Clean evidence-fed risk clocks with deeper mission analysis available on demand."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="reader-experience.css"><style>
.timer-hero{padding:2rem 1rem}.timer-hero-box{border:1px solid rgba(216,181,106,.35);border-radius:28px;padding:2rem;background:radial-gradient(circle at 30% 0,rgba(180,0,0,.25),transparent 38%),linear-gradient(135deg,rgba(12,0,0,.96),rgba(0,0,0,.94))}
.timer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:1rem;align-items:start}.clock-card{border:1px solid rgba(216,181,106,.25);border-radius:22px;padding:1.1rem;background:linear-gradient(150deg,rgba(12,12,12,.97),rgba(28,0,0,.72));box-shadow:0 18px 55px rgba(0,0,0,.28)}
.clock-topline{display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.85rem}.clock-score-badge,.clock-window,.clock-band{border:1px solid rgba(216,181,106,.35);border-radius:999px;padding:.3rem .58rem;font-size:.82rem}.clock-score-badge{font-weight:900;color:#f0d28b}.clock-summary{display:grid;grid-template-columns:112px 1fr;gap:1rem;align-items:center}.clock-ring{width:112px;height:112px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(rgba(210,40,35,.95) calc(var(--p)*1%),rgba(255,255,255,.08) 0)}.clock-ring strong{font-size:1.55rem}.clock-heading h2{margin:.55rem 0}.clock-change{margin:0;color:#eee0bb}.clock-band{display:inline-block}
.clock-detail{margin-top:1rem;border-top:1px solid rgba(216,181,106,.22);padding-top:.85rem}.clock-detail summary{cursor:pointer;font-weight:800;color:#f0d28b;list-style-position:inside}.clock-detail-body{display:grid;gap:.9rem;padding-top:.9rem}.clock-detail-body section,.clock-boundary{padding:.85rem;border:1px solid rgba(216,181,106,.16);border-radius:12px;background:rgba(255,255,255,.025)}.speculation-panel{border-color:rgba(190,55,55,.5)!important;background:rgba(120,0,0,.12)!important}.clock-columns{display:grid!important;grid-template-columns:1fr 1fr;gap:.8rem}.clock-links{display:flex;gap:.45rem;flex-wrap:wrap}.clock-links a{border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.3rem .55rem}
@media(max-width:680px){.clock-summary{grid-template-columns:1fr}.clock-ring{margin:auto}.clock-columns{grid-template-columns:1fr!important}}
</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Daily Brief</a><a href="control-system-tracker.html">Control Tracker</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="timer-hero wrap"><div class="timer-hero-box"><div class="eyebrow">Evidence synthesis · updated ${escapeHtml(wall.updated || '')}</div><h1>MISSION TIMERS.</h1><p class="lead">Each collapsed card shows only its percentage, timeframe, pressure band, title and latest movement. Open the deeper-information tab for the evidence, calculation, speculation, counterpoints and source routes.</p><p><strong>Important:</strong> these percentages are pressure indexes, not predictions that an event has the same percentage chance of occurring.</p><div class="cta-row"><a class="btn" href="data/clock-wall.json">Open Machine Data</a><a class="btn alt" href="downloads/timer-synthesis.md">Download Synthesis</a><a class="btn alt" href="evidence-vault.html">Verify Evidence</a></div></div></section><section class="section wrap"><h2>Current visual synthesis</h2><div class="timer-grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, usefulness always.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
write('timers.html', timerHtml);

function homepageCard(clock) {
  return `<article class="critical-clock-mini"><a href="timers.html#${escapeHtml(clock.slug || '')}"><span>${escapeHtml(clock.title)}</span><strong>${Number(clock.score || 0)}%</strong></a></article>`;
}

const homepagePath = file('index.html');
if (fs.existsSync(homepagePath)) {
  let homepage = fs.readFileSync(homepagePath, 'utf8');
  homepage = homepage.replace(/<section id="homepage-critical-clocks"[\s\S]*?<\/section>/, '');
  homepage = homepage.replace(/<article class="card redline"><span class="label">Clock · \d+%<\/span>[\s\S]*?<\/article>/, '');
  const critical = clocks.filter(clock => Number(clock.score) > 90).sort((a, b) => Number(b.score) - Number(a.score));
  if (critical.length) {
    const section = `<section id="homepage-critical-clocks" class="section wrap"><div class="eyebrow">Synced Risk Timers</div><h2>Critical Clocks Over 90%</h2><div class="critical-clock-mini-grid">${critical.map(homepageCard).join('')}</div><div class="cta-row"><a class="btn alt" href="timers.html">Open All Risk Timers</a></div><style>.critical-clock-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}.critical-clock-mini{border:1px solid rgba(216,181,106,.28);border-radius:16px;background:rgba(20,4,4,.78)}.critical-clock-mini a{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem;text-decoration:none}.critical-clock-mini strong{font-size:1.7rem;color:#f0d28b}</style></section>`;
    homepage = homepage.includes('<section id="top-moments-now"')
      ? homepage.replace('<section id="top-moments-now"', `${section}<section id="top-moments-now"`)
      : homepage.replace('</main>', `${section}</main>`);
  }
  fs.writeFileSync(homepagePath, homepage);
}

console.log(`Clean timer wall built: ${clocks.length} clocks; homepage shows ${clocks.filter(clock => Number(clock.score) > 90).length} canonical clocks over 90%.`);

if (fs.existsSync(path.join(root, 'scripts', 'public-usefulness-clocks.js'))) {
  require('./enrich-public-usefulness-clock-evidence.js');
  require('./render-public-usefulness-clock-wall.js');
}
