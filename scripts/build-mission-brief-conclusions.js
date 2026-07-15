const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = value => path.join(root, value);
const readJson = (relative, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file(relative), 'utf8')); } catch { return fallback; }
};
const clean = (value, max = 4000) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const titleFromHtml = html => clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,'This brief'])[1], 240).replace(/\s*\|\s*Matrix Reprogrammed.*$/i, '');
const markerStart = '<!-- mission-brief-lens:start -->';
const markerEnd = '<!-- mission-brief-lens:end -->';

const wall = readJson('data/clock-wall.json', { clocks: [] });
const conclusions = readJson('data/daily-power-conclusions.json', { conclusions: [] });
const latestDrops = readJson('data/latest-public-drops.json', { drops: [] });
const commandPath = file('data/daily-command-brief.json');
const command = readJson('data/daily-command-brief.json', {});
const clocks = Array.isArray(wall.clocks) ? wall.clocks : [];
const critical = clocks.filter(clock => Number(clock.score) > 90).sort((a, b) => Number(b.score) - Number(a.score));
const convergenceRows = (conclusions.conclusions || []).filter(item => /one-world|elite-control|convergence/i.test(`${item.title} ${item.text}`));
const topClock = critical[0] || clocks.slice().sort((a, b) => Number(b.score) - Number(a.score))[0] || null;
const latestDrop = (latestDrops.drops || []).slice().sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))[0] || null;

const missionConclusion = clean(`The strongest current site-wide conclusion is that practical control is concentrating where previously separate systems become interoperable. ${topClock ? `${topClock.title} is the highest canonical pressure index at ${topClock.score}%.` : ''} ${latestDrop ? `The newest curated primary-source lane is “${latestDrop.title}”.` : ''} The relevant question is not whether every actor shares one secret plan, but whether money, identity, AI, information, health, security, contracts and international standards are becoming connected in ways that make access conditional and exit difficult.`, 2200);
const controlPathways = [
  'Money and ownership: capital concentration, payment rails, custody, mandates, proxy voting and financial access.',
  'Identity and surveillance: digital identity, biometrics, credentials, tracking and cross-system data exchange.',
  'Information and narrative: platforms, search, media ownership, moderation, advertising and payment access.',
  'Security and emergency power: intelligence, defense contractors, cyber systems, war powers and emergency governance.',
  'Health and biosecurity: health records, emergency agreements, travel, procurement and credential systems.',
  'Global policy convergence: treaties, standards bodies, multilateral institutions and public-private implementation networks.'
];
const speculativeTrajectory = clean('If the documented pattern continues, the likely trajectory is a de facto control architecture rather than a single dramatic declaration: interoperable identity, payment, AI, health, security and information systems governed by overlapping international standards and implemented through public-private infrastructure. This could make a one-world governance or currency-like outcome functionally possible without proving that a single central authority or coordinated secret plan already exists. A one-world religion conclusion remains weaker and requires direct evidence of institutional religious authority, mandatory doctrine or coordinated enforcement rather than interfaith dialogue alone.', 2200);
const counterpoint = 'The conclusion weakens when systems remain voluntary, decentralised, interoperable, transparent, reversible, locally accountable and subject to effective legal appeal; or when primary records show that apparent convergence is only parallel development without shared enforcement or access control.';
const practicalMeaning = 'The useful test is implementation: look for mandates, procurement, contracts, legal authority, identity requirements, payment restrictions, shared databases, common standards, enforcement powers, lock-in and who controls the operating infrastructure.';
const watchNext = [
  'A voluntary system becoming mandatory for work, travel, banking, public services, health, age verification or online access.',
  'Digital identity being linked to payments, benefits, health, border systems, speech or platform access.',
  'International standards becoming domestic law, procurement conditions or technical requirements.',
  'Public authorities becoming dependent on a small group of cloud, AI, security, consulting or payment vendors.',
  'Emergency powers or crisis infrastructure becoming permanent after the stated emergency ends.',
  'New primary records that disprove, narrow or materially strengthen the claimed connection.'
];

const enriched = {
  ...command,
  updated: new Date().toISOString(),
  missionConclusion,
  controlPathways,
  speculativeTrajectory,
  counterpoint,
  practicalMeaning,
  watchNext,
  currentCriticalClocks: critical.map(clock => ({ slug: clock.slug, title: clock.title, score: clock.score, route: `timers.html#${clock.slug}` })),
  currentConvergenceConclusions: convergenceRows,
  conclusionBoundary: 'This is an evidence-led editorial synthesis. It does not convert association, policy similarity or system overlap into proof of guilt, secret intent, one-world government, one-world currency, one-world religion or a single controlling entity.'
};
fs.writeFileSync(commandPath, JSON.stringify(enriched, null, 2));

function fullDailyLens() {
  const clockList = critical.map(clock => `<li><a href="timers.html#${esc(clock.slug)}"><strong>${esc(clock.title)}:</strong> ${Number(clock.score)}%</a></li>`).join('') || '<li>No canonical timer is above 90% in this build.</li>';
  return `${markerStart}<section class="section wrap mission-brief-lens"><div class="eyebrow">Mission Conclusion</div><h2>What the combined evidence means today</h2><p class="mission-lead">${esc(missionConclusion)}</p><div class="mission-lens-grid"><article><h3>How this points toward concentrated control</h3><ul>${controlPathways.map(item => `<li>${esc(item)}</li>`).join('')}</ul></article><article class="mission-speculation"><h3>Clearly labelled speculation</h3><p>${esc(speculativeTrajectory)}</p></article><article><h3>Critical clocks over 90%</h3><ul>${clockList}</ul></article><article><h3>What would weaken this conclusion</h3><p>${esc(counterpoint)}</p><p><strong>Practical test:</strong> ${esc(practicalMeaning)}</p></article></div><details><summary>What to watch next</summary><ul>${watchNext.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details><p class="mission-boundary"><strong>Boundary:</strong> ${esc(enriched.conclusionBoundary)}</p><div class="cta-row"><a class="btn" href="conclusion-engine.html">Conclusion Engine</a><a class="btn alt" href="timers.html">Risk Timers</a><a class="btn alt" href="evidence-vault.html">Verify Evidence</a></div><style>.mission-brief-lens{border:1px solid rgba(216,181,106,.28);border-radius:24px;padding:1.25rem;background:linear-gradient(145deg,rgba(20,4,4,.9),rgba(0,0,0,.94))}.mission-lead{font-size:1.15rem;line-height:1.65}.mission-lens-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:.85rem}.mission-lens-grid article{border:1px solid rgba(216,181,106,.16);border-radius:15px;padding:1rem;background:rgba(255,255,255,.025)}.mission-lens-grid .mission-speculation{border-color:rgba(190,55,55,.5);background:rgba(120,0,0,.12)}.mission-boundary{font-size:.88rem;color:#c2b38d}</style></section>${markerEnd}`;
}

function compactLens(title) {
  return `${markerStart}<section class="section wrap mission-brief-lens compact"><div class="eyebrow">Mission Lens</div><h2>How ${esc(title)} relates to the control map</h2><p><strong>Evidence-led use:</strong> This brief matters only where its records show ${esc(title)} touching money, ownership, policy, standards, identity, data, payments, media, health, security, contracts or international governance. Inclusion or association alone is not proof of elite control.</p><details><summary>Open conclusion and speculation boundary</summary><p><strong>Likely trajectory if documented leverage expands:</strong> Greater cross-system reach could increase the ability of this person, institution, company or subject to influence access, standards, public infrastructure or narrative. That is a hypothesis to test through contracts, filings, legal authority, voting power, procurement and implementation records.</p><p><strong>What would weaken it:</strong> Independent oversight, decentralisation, optional participation, meaningful competition, transparent authority, effective appeal, and records showing no operational link.</p><p><strong>Useful next step:</strong> Find the exact mandate, contract, ownership record, technical integration, enforcement authority or counter-source that confirms or limits the conclusion.</p></details><p class="mission-boundary"><strong>Boundary:</strong> This page does not prove wrongdoing, secret intent, one-world government, one-world currency, one-world religion or coordinated control.</p><style>.mission-brief-lens.compact{border:1px solid rgba(216,181,106,.22);border-radius:18px;padding:1rem;background:rgba(25,5,5,.72)}.mission-brief-lens details{border:1px solid rgba(216,181,106,.16);border-radius:12px;padding:.75rem}.mission-brief-lens summary{cursor:pointer;font-weight:800}</style></section>${markerEnd}`;
}

function inject(relative, full = false) {
  const target = file(relative);
  if (!fs.existsSync(target)) return false;
  let html = fs.readFileSync(target, 'utf8');
  html = html.replace(/<!-- mission-brief-lens:start -->[\s\S]*?<!-- mission-brief-lens:end -->/g, '');
  const title = titleFromHtml(html);
  const block = full ? fullDailyLens() : compactLens(title);
  const heroEnd = html.match(/<section[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<\/section>/i);
  if (heroEnd) html = html.replace(heroEnd[0], `${heroEnd[0]}${block}`);
  else {
    const main = html.match(/<main[^>]*>/i);
    if (!main) return false;
    html = html.replace(main[0], `${main[0]}${block}`);
  }
  fs.writeFileSync(target, html);
  return true;
}

const direct = [
  'daily-command-brief.html', 'daily-brain-brief.html', 'daily-brief-master.html',
  'outcome-briefings.html', 'entity-daily-briefs.html', 'weekly-intelligence-brief.html'
];
let patched = 0;
for (const relative of direct) if (inject(relative, relative === 'daily-command-brief.html' || relative === 'daily-brief-master.html')) patched += 1;
for (const folder of ['entity-briefs', 'contractor-briefs', 'billionaire-briefs', 'institution-briefs', 'subject-briefs']) {
  const directory = file(folder);
  if (!fs.existsSync(directory)) continue;
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.html'))) {
    if (inject(`${folder}/${name}`, false)) patched += 1;
  }
}

const standard = {
  ok: true,
  updated: new Date().toISOString(),
  purpose: 'Require every serious brief to explain its evidence-led mission relevance, labelled speculative trajectory, counterpoint, missing proof and practical next action.',
  requiredSections: ['evidence-led mission relevance', 'control pathway', 'labelled speculation', 'counterpoint', 'practical test', 'claim boundary'],
  patchedBriefPages: patched,
  missionConclusion,
  speculativeTrajectory,
  counterpoint,
  watchNext
};
fs.writeFileSync(file('data/brief-mission-standard.json'), JSON.stringify(standard, null, 2));
console.log(`Mission conclusion layer applied to ${patched} brief pages.`);
