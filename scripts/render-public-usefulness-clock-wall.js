'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const wall = JSON.parse(fs.readFileSync(path.join(root, 'data', 'clock-wall.json'), 'utf8'));
const standard = JSON.parse(fs.readFileSync(path.join(root, 'data', 'reader-interpretation-standard.json'), 'utf8'));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const clean = (value, max = 5000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function safeRoute(value) {
  const route = clean(value, 1600);
  if (!route || /\s/.test(route) || /[<>"']/.test(route)) return '';
  if (/^https?:\/\//i.test(route)) { try { return new URL(route).href; } catch { return ''; } }
  return /^(?:\/|\.\/|\.\.\/)?[a-z0-9][a-z0-9._~!$&()*+,;=:@%\/-]*(?:\?[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?(?:#[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/i.test(route) ? route : '';
}
const list = (items, empty = 'No item recorded in this build.') => {
  const values = (items || []).map(item => clean(item, 900)).filter(Boolean);
  return values.length ? values.map(item => `<li>${escapeHtml(item)}</li>`).join('') : `<li>${escapeHtml(empty)}</li>`;
};
const legacyCategories = {
  'wwiii-escalation': 'Global Watch', 'ai-breakout': 'Global Watch', 'surveillance-state': 'Your Freedom',
  'financial-reset': 'Your Money', 'cbdc-rollout': 'Your Money', 'cyber-blackout': 'Global Watch',
  'alien-disclosure': 'Speculative Watch', 'pandemic-biosecurity': 'Global Watch', 'civil-unrest': 'Your Government',
  'food-system-stress': 'Your Essential Services', 'energy-shock': 'Your Essential Services', 'machine-convergence': 'Global Watch'
};
const order = ['Your Freedom', 'Your Money', 'Your Essential Services', 'Your Government', 'Global Watch', 'Speculative Watch'];
const descriptions = {
  'Your Freedom': 'Speech, identity, privacy, access and emergency powers that affect individual autonomy.',
  'Your Money': 'Household survival, housing, work, payments, debt and financial-system pressure.',
  'Your Essential Services': 'Food, water, energy, healthcare, infrastructure and supply resilience.',
  'Your Government': 'Transparency, accountability, elections, rule of law and public-private authority.',
  'Global Watch': 'War, pandemic, AI, cyber and system-convergence lanes with international consequences.',
  'Speculative Watch': 'Contested or emerging disclosure questions kept separate from practical rights and household risks.'
};
function speculation(clock) {
  const themes = (clock.missionThemes || []).map(item => item.label).filter(Boolean);
  const lane = themes.length ? themes.join(', ') : 'the systems named in this clock';
  return `If the documented pattern continues, the likely direction is greater dependence on, integration of, or enforcement through ${lane}. This is a trajectory inference, not proof of a coordinated final plan, motive, guilt, inevitability, one-world government, one-world currency or one-world religion.`;
}
function card(clock) {
  const score = Number(clock.score || 0);
  const sources = (clock.evidenceInputs || []).slice(0, 8).map(item => {
    const route = safeRoute(item.route);
    return `<li><strong>${escapeHtml(item.title || 'Source record')}</strong>${item.evidenceLevel ? ` — ${escapeHtml(item.evidenceLevel)}` : ''}${item.published ? ` · ${escapeHtml(String(item.published).slice(0, 10))}` : ''}${route ? ` · <a href="${escapeHtml(route)}">open</a>` : ''}</li>`;
  }).join('') || '<li>No fresh direct source matched this build. The clock remains an editorial watch lane.</li>';
  const themes = (clock.missionThemes || []).map(item => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.question || '')}</li>`).join('') || '<li>General system-pressure relevance; no single control theme assigned.</li>';
  const routes = [...new Set((clock.sourceRoutes || []).map(safeRoute).filter(Boolean))].slice(0, 12).map(route => `<a href="${escapeHtml(route)}">${escapeHtml(route.replace(/\.html.*$/, '').replace(/^.*\//, '').replace(/[-_]/g, ' ') || 'source')}</a>`).join('');
  const updateStatus = clean(clock.automaticUpdateStatus || (clock.automaticUpdateEnabled ? 'automatic-evidence-update-enabled' : 'editorial-update-lane'));
  const updateReason = clean(clock.automaticUpdateReason || 'Updated only when dated source-linked evidence meets the published trigger rule.');
  return `<article class="clock-card" id="${escapeHtml(clock.slug || '')}" data-clock-score="${score}" data-clock-category="${escapeHtml(clock.category || legacyCategories[clock.slug] || 'Global Watch')}">
    <div class="clock-topline" data-clock-summary-only="true"><span class="clock-score-badge">${score}%</span><span class="clock-window">${escapeHtml(clock.window || 'Review window not set')}</span></div>
    <div class="clock-summary" data-clock-summary-only="true"><div class="clock-ring" style="--p:${score}" aria-label="${score} percent pressure index"><strong>${score}%</strong></div><div class="clock-heading"><span class="clock-band">${escapeHtml(clock.scoreBand || clock.status || 'Watch')}</span><h3>${escapeHtml(clock.title)}</h3><p class="clock-change">${escapeHtml(clock.lastMovement || `Held at ${score}. No source-linked trigger justified a change in this build.`)}</p></div></div>
    <details class="clock-detail"><summary>Open deeper information</summary><div class="clock-detail-body">
      <section><h4>What changed:</h4><p>${escapeHtml(clock.lastMovement || '')}</p></section>
      <section><h4>What this means</h4><p>${escapeHtml(clock.plainEnglishConclusion || clock.signals || '')}</p><p><strong>Score meaning:</strong> ${escapeHtml(clock.scoreMeaning || '')}</p></section>
      <section><h4>How it is calculated</h4><p>${escapeHtml(clock.calculationBasis || clock.scoreMethod || '')}</p><p><strong>Update engine:</strong> ${escapeHtml(updateStatus)}. ${escapeHtml(updateReason)}</p></section>
      <section><h4>Control-system relevance</h4><p>${escapeHtml(clock.controlSystemMeaning || '')}</p><ul>${themes}</ul></section>
      <section class="speculation-panel"><h4>Speculation angle</h4><p><strong>Likely trajectory if the pattern continues:</strong> ${escapeHtml(speculation(clock))}</p></section>
      <section class="clock-columns"><div><h4>What would raise it</h4><ul>${list(clock.whatRaises)}</ul></div><div><h4>What would lower it</h4><ul>${list(clock.whatLowers)}</ul></div></section>
      <section><h4>Evidence feeding this timer</h4><ul>${sources}</ul></section>
      <section><h4>Missing records</h4><ul>${list(clock.missingEvidence)}</ul></section>
      <section><h4>Useful next actions</h4><ol>${list(clock.usefulNextActions)}</ol></section>
      <p class="clock-boundary"><strong>Boundary:</strong> ${escapeHtml(clock.boundary || 'This is a pressure index, not event probability or proof of motive.')}</p><div class="clock-links">${routes}</div>
    </div></details>
  </article>`;
}
const grouped = new Map(order.map(category => [category, []]));
for (const clock of wall.clocks || []) {
  const category = clock.category || legacyCategories[clock.slug] || 'Global Watch';
  if (!grouped.has(category)) grouped.set(category, []);
  grouped.get(category).push(clock);
}
const nav = order.filter(category => grouped.get(category)?.length).map(category => `<a href="#clock-group-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${escapeHtml(category)}</a>`).join('');
const sections = order.filter(category => grouped.get(category)?.length).map(category => `<section class="section wrap clock-category" id="clock-group-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"><div class="clock-category-heading"><div><div class="eyebrow">Reader early-warning dashboard</div><h2>${escapeHtml(category)}</h2><p>${escapeHtml(descriptions[category])}</p></div><span>${grouped.get(category).length} clocks</span></div><div class="timer-grid">${grouped.get(category).map(card).join('')}</div></section>`).join('');
const pressure = standard?.scoreTypes?.pressureIndex || {};
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Mission Timers | Matrix Reprogrammed</title><meta name="description" content="Evidence-fed early-warning clocks for freedom, household security, essential services, accountable government and global risks."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="reader-experience.css"><style>
.timer-hero{padding:2rem 1rem}.timer-hero-box{border:1px solid rgba(216,181,106,.35);border-radius:28px;padding:2rem;background:radial-gradient(circle at 30% 0,rgba(180,0,0,.25),transparent 38%),linear-gradient(135deg,rgba(12,0,0,.96),rgba(0,0,0,.94))}.timer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:1rem;align-items:start}.clock-card{border:1px solid rgba(216,181,106,.25);border-radius:22px;padding:1.1rem;background:linear-gradient(150deg,rgba(12,12,12,.97),rgba(28,0,0,.72));box-shadow:0 18px 55px rgba(0,0,0,.28)}.clock-topline{display:flex;gap:.45rem;flex-wrap:wrap;margin-bottom:.85rem}.clock-score-badge,.clock-window,.clock-band,.clock-category-nav a,.clock-category-heading>span{border:1px solid rgba(216,181,106,.35);border-radius:999px;padding:.3rem .58rem;font-size:.82rem}.clock-score-badge{font-weight:900;color:#f0d28b}.clock-summary{display:grid;grid-template-columns:112px 1fr;gap:1rem;align-items:center}.clock-ring{width:112px;height:112px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(rgba(210,40,35,.95) calc(var(--p)*1%),rgba(255,255,255,.08) 0)}.clock-ring strong{font-size:1.55rem}.clock-heading h3{margin:.55rem 0}.clock-change{margin:0;color:#eee0bb}.clock-band{display:inline-block}.clock-detail{margin-top:1rem;border-top:1px solid rgba(216,181,106,.22);padding-top:.85rem}.clock-detail summary{cursor:pointer;font-weight:800;color:#f0d28b;list-style-position:inside}.clock-detail-body{display:grid;gap:.9rem;padding-top:.9rem}.clock-detail-body section,.clock-boundary{padding:.85rem;border:1px solid rgba(216,181,106,.16);border-radius:12px;background:rgba(255,255,255,.025)}.speculation-panel{border-color:rgba(190,55,55,.5)!important;background:rgba(120,0,0,.12)!important}.clock-columns{display:grid!important;grid-template-columns:1fr 1fr;gap:.8rem}.clock-links,.clock-category-nav{display:flex;gap:.45rem;flex-wrap:wrap}.clock-links a{border:1px solid rgba(216,181,106,.25);border-radius:999px;padding:.3rem .55rem}.clock-category{scroll-margin-top:1rem}.clock-category-heading{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1rem}.clock-category-heading h2{margin:.25rem 0}.clock-category-heading p{margin:0;max-width:760px}@media(max-width:680px){.clock-summary{grid-template-columns:1fr}.clock-ring{margin:auto}.clock-columns{grid-template-columns:1fr!important}.clock-category-heading{align-items:start;flex-direction:column}}
</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Daily Brief</a><a href="control-system-tracker.html">Control Tracker</a><a href="evidence-vault.html">Evidence</a><a href="search.html">Search</a></nav></header><main><section class="timer-hero wrap"><div class="timer-hero-box"><div class="eyebrow">Evidence synthesis · updated ${escapeHtml(wall.updated || '')}</div><h1>MISSION TIMERS.</h1><p class="lead">Each collapsed card shows only its percentage, timeframe, pressure band, title and latest movement. Open deeper information for evidence, calculation, speculation, counter-signals, missing records and source routes.</p><p><strong>Important:</strong> these percentages are pressure indexes, not predictions that an event has the same percentage chance of occurring.</p><p><strong>Method:</strong> ${escapeHtml(pressure.method || '')}</p><div class="cta-row"><a class="btn" href="data/clock-wall.json">Open Machine Data</a><a class="btn alt" href="downloads/timer-synthesis.md">Download Synthesis</a><a class="btn alt" href="evidence-vault.html">Verify Evidence</a></div></div></section><section class="section wrap"><div class="eyebrow">Choose what affects you</div><h2>Reader early-warning dashboard</h2><p>Start with freedom, money, essential services or government. Global and speculative watches remain clearly separated.</p><nav class="clock-category-nav">${nav}</nav></section>${sections}</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second, usefulness always.</p></footer></div><script src="matrix.js"></script><script src="analytics.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'timers.html'), html);
console.log(`Final enriched clock wall rendered: ${(wall.clocks || []).length} clocks across ${order.filter(category => grouped.get(category)?.length).length} categories.`);
