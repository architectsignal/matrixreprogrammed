'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const wallPath = path.join(root, 'data', 'clock-wall.json');
const timerPath = path.join(root, 'timers.html');
const homepagePath = path.join(root, 'index.html');
const wall = JSON.parse(fs.readFileSync(wallPath, 'utf8'));

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const clean = (value, max = 3000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function safeRoute(value) {
  const route = clean(value, 1400);
  if (!route || /\s/.test(route) || /[<>"']/.test(route)) return '';
  if (/^https?:\/\//i.test(route)) { try { return new URL(route).href; } catch { return ''; } }
  return /^(?:\/|\.\/|\.\.\/)?[a-z0-9][a-z0-9._~!$&()*+,;=:@%\/-]*(?:\?[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?(?:#[a-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/i.test(route) ? route : '';
}
function statusLabel(value) {
  return ({
    'current-multi-jurisdiction-implementation': 'Current · multi-country implementation',
    'current-primary-evidence': 'Current · primary evidence',
    'current-secondary-evidence-only': 'Current · secondary evidence only',
    'current-evidence-gap': 'Current evidence gap'
  })[value] || clean(value || 'Current status unknown', 120).replace(/-/g, ' ');
}
function statusClass(value) {
  if (value === 'current-multi-jurisdiction-implementation') return 'clock-current-strong';
  if (value === 'current-primary-evidence') return 'clock-current-primary';
  if (value === 'current-evidence-gap') return 'clock-current-gap';
  return 'clock-current-limited';
}
function matrixRows(clock) {
  const rows = (clock.currentImplementationMatrix || []).slice(0, 8).map(item => {
    const route = safeRoute(item.route);
    return `<tr><td>${escapeHtml(item.date || item.effectiveDate || '—')}</td><td>${escapeHtml(item.jurisdiction || 'Not specified')}</td><td>${escapeHtml(item.legalStatus || 'Evidence record')}</td><td>${escapeHtml(item.implementationStage || 'Status not classified')}</td><td>${escapeHtml(item.title || 'Source record')}${route ? ` · <a href="${escapeHtml(route)}">source</a>` : ''}</td></tr>`;
  }).join('');
  return rows || '<tr><td colspan="5">No dated implementation record matched the current evidence window. The score is held and clearly marked as a current-evidence gap.</td></tr>';
}
function currentSection(clock) {
  const jurisdictions = (clock.jurisdictionCoverage || []).join(' · ') || 'No current jurisdiction recorded';
  const stages = (clock.implementationStages || []).join(' · ') || 'No current implementation stage recorded';
  return `<!-- current-clock-intelligence:start --><section class="clock-current-intelligence"><h4>What is happening now</h4><p><strong>Current as of:</strong> ${escapeHtml(String(clock.currentAsOf || wall.currentEvidenceAsOf || '').slice(0, 10))} · <strong>Status:</strong> ${escapeHtml(statusLabel(clock.todayStatus))} · <strong>Confidence:</strong> ${escapeHtml(clock.scoreConfidence || 'not classified')}</p><p><strong>Current evidence:</strong> ${Number(clock.currentEvidenceCount || 0)} dated records · ${Number(clock.currentOfficialEvidenceCount || 0)} primary/official · ${Number(clock.currentImplementationCount || 0)} implementation signals · ${Number(clock.currentLawCount || 0)} enacted or in-force legal records.</p><p><strong>Jurisdictions:</strong> ${escapeHtml(jurisdictions)}</p><p><strong>Implementation stages:</strong> ${escapeHtml(stages)}</p><p><strong>Today’s synthesis:</strong> ${escapeHtml(clock.todaySummary || 'No current synthesis available.')}</p><div class="clock-current-table-wrap"><table class="clock-current-table"><thead><tr><th>Date</th><th>Jurisdiction</th><th>Legal status</th><th>Implementation</th><th>Record</th></tr></thead><tbody>${matrixRows(clock)}</tbody></table></div></section><section class="clock-fact-boundary"><h4>Documented fact layer</h4><p>${escapeHtml(clock.documentedFactLayer || 'No current documented-fact summary has been generated.')}</p></section><section class="clock-hypothesis-boundary"><h4>Speculation / hypothesis layer</h4><p>${escapeHtml(clock.speculationLayer || 'No separate hypothesis has been recorded.')}</p><p><strong>Boundary:</strong> Policy convergence, shared technical standards or identity-wallet compatibility can justify investigation. They do not by themselves prove hidden motive, inevitability or a single coordinated controller.</p></section><!-- current-clock-intelligence:end -->`;
}

let html = fs.readFileSync(timerPath, 'utf8');
html = html.replace(/<!-- current-clock-hero:start -->[\s\S]*?<!-- current-clock-hero:end -->/g, '');
html = html.replace('</div></section><section class="section wrap"><div class="eyebrow">Choose what affects you</div>', `<p><!-- current-clock-hero:start --><strong>Current-evidence rule:</strong> Every clock now publishes an as-of date, current evidence window, official-source count, implementation stage, jurisdiction coverage and an explicit evidence gap when no fresh source exists. Documented fact and speculation are shown separately.<!-- current-clock-hero:end --></p></div></section><section class="section wrap"><div class="eyebrow">Choose what affects you</div>`);
html = html.replace(/<!-- current-clock-style:start -->[\s\S]*?<!-- current-clock-style:end -->/g, '');
html = html.replace('</style>', `<!-- current-clock-style:start -->.clock-current-status{border:1px solid rgba(130,200,170,.48);border-radius:999px;padding:.3rem .58rem;font-size:.82rem}.clock-current-strong{color:#b9f2cf;border-color:rgba(90,220,150,.65)}.clock-current-primary{color:#d9f1bd}.clock-current-limited{color:#f0d28b}.clock-current-gap{color:#ffb0a9;border-color:rgba(220,70,60,.72)}.clock-current-intelligence{border-color:rgba(90,220,150,.32)!important;background:rgba(10,65,42,.12)!important}.clock-fact-boundary{border-color:rgba(90,170,230,.38)!important;background:rgba(20,55,90,.12)!important}.clock-hypothesis-boundary{border-color:rgba(210,80,75,.48)!important;background:rgba(90,15,15,.13)!important}.clock-current-table-wrap{overflow:auto}.clock-current-table{width:100%;border-collapse:collapse;font-size:.86rem}.clock-current-table th,.clock-current-table td{padding:.45rem;border:1px solid rgba(216,181,106,.18);text-align:left;vertical-align:top}.clock-current-table th{color:#f0d28b}<!-- current-clock-style:end --></style>`);

for (const clock of wall.clocks || []) {
  const idNeedle = `id="${clock.slug}"`;
  const idIndex = html.indexOf(idNeedle);
  if (idIndex < 0) continue;
  const articleStart = html.lastIndexOf('<article', idIndex);
  const articleEnd = html.indexOf('</article>', idIndex);
  if (articleStart < 0 || articleEnd < 0) continue;
  const end = articleEnd + '</article>'.length;
  let segment = html.slice(articleStart, end);
  segment = segment.replace(/<!-- current-clock-intelligence:start -->[\s\S]*?<!-- current-clock-intelligence:end -->/g, '');
  segment = segment.replace(/<span class="clock-current-status[^"]*">[\s\S]*?<\/span>/g, '');
  const topLineIndex = segment.indexOf('class="clock-topline"');
  if (topLineIndex >= 0) {
    const topLineEnd = segment.indexOf('</div>', topLineIndex);
    if (topLineEnd >= 0) {
      const badge = `<span class="clock-current-status ${statusClass(clock.todayStatus)}">${escapeHtml(statusLabel(clock.todayStatus))}</span>`;
      segment = `${segment.slice(0, topLineEnd)}${badge}${segment.slice(topLineEnd)}`;
    }
  }
  const bodyNeedle = '<div class="clock-detail-body">';
  const bodyIndex = segment.indexOf(bodyNeedle);
  if (bodyIndex >= 0) {
    const insertAt = bodyIndex + bodyNeedle.length;
    segment = `${segment.slice(0, insertAt)}${currentSection(clock)}${segment.slice(insertAt)}`;
  }
  html = `${html.slice(0, articleStart)}${segment}${html.slice(end)}`;
}
fs.writeFileSync(timerPath, html);

if (fs.existsSync(homepagePath)) {
  let homepage = fs.readFileSync(homepagePath, 'utf8');
  homepage = homepage.replace(/<section id="homepage-critical-clocks"[\s\S]*?<\/section>/g, '');
  const critical = (wall.clocks || []).filter(clock => !clock.speculationOnly && Number(clock.score) > 90).sort((a, b) => Number(b.score) - Number(a.score));
  if (critical.length) {
    const cards = critical.map(clock => `<article class="critical-clock-mini"><a href="timers.html#${escapeHtml(clock.slug)}"><span>${escapeHtml(clock.title)}</span><strong>${Number(clock.score)}%</strong><small>${escapeHtml(statusLabel(clock.todayStatus))}</small></a></article>`).join('');
    const section = `<section id="homepage-critical-clocks" class="section wrap"><div class="eyebrow">Current Evidence Timers</div><h2>Critical Clocks Over 90%</h2><p>Scores are pressure indexes. Open each clock to see current law, implementation, jurisdiction coverage, counter-signals and the separate hypothesis layer.</p><div class="critical-clock-mini-grid">${cards}</div><div class="cta-row"><a class="btn alt" href="timers.html">Open All Mission Timers</a></div><style>.critical-clock-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.75rem}.critical-clock-mini{border:1px solid rgba(216,181,106,.28);border-radius:16px;background:rgba(20,4,4,.78)}.critical-clock-mini a{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.35rem 1rem;padding:1rem;text-decoration:none}.critical-clock-mini strong{font-size:1.7rem;color:#f0d28b}.critical-clock-mini small{grid-column:1/-1;opacity:.78}</style></section>`;
    homepage = homepage.includes('<section id="top-moments-now"')
      ? homepage.replace('<section id="top-moments-now"', `${section}<section id="top-moments-now"`)
      : homepage.replace('</main>', `${section}</main>`);
  }
  fs.writeFileSync(homepagePath, homepage);
}

console.log(`Current clock UI rendered for ${(wall.clocks || []).length} clocks; ${(wall.clocks || []).filter(clock => !clock.speculationOnly && Number(clock.score) > 90).length} practical clocks above 90%.`);