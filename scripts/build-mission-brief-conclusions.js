const fs = require('fs');
const path = require('path');
const synthesis = require('./build-speculative-intelligence-synthesis.js');

const root = process.cwd();
const file = value => path.join(root, value);
const readJson = (relative, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file(relative), 'utf8')); } catch { return fallback; } };
const clean = (value, max = 4000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const titleFromHtml = html => clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,'This brief'])[1], 240).replace(/\s*\|\s*Matrix Reprogrammed.*$/i, '');
const markerStart = '<!-- mission-brief-lens:start -->';
const markerEnd = '<!-- mission-brief-lens:end -->';
const commandPath = file('data/daily-command-brief.json');
const command = readJson('data/daily-command-brief.json', {});
const clocks = synthesis.evidenceLayer.criticalClocks || [];
const actors = synthesis.inferenceLayer.actorMap || [];
const pathways = synthesis.inferenceLayer.pathways || [];
const chain = synthesis.inferenceLayer.implementationChain || [];
const scenarios = synthesis.speculativeLayer.scenarios || [];
const conclusion = synthesis.evidenceLayer.conclusion;
const trajectory = synthesis.speculativeLayer.leadingTrajectory;
const counterpoint = synthesis.uncertaintyLayer.counterpoint;
const confidence = synthesis.inferenceLayer.confidenceScore;
const confidenceBand = synthesis.inferenceLayer.confidenceBand;
const watchNext = synthesis.uncertaintyLayer.watchNext;
const boundary = synthesis.uncertaintyLayer.boundary;
const practicalMeaning = 'Follow implementation rather than rhetoric: identify the legal mandate, funding source, procurement contract, technical operator, shared identifier, data exchange, enforcement power, appeal route, lock-in mechanism and beneficiary.';

const enriched = {
  ...command,
  updated: new Date().toISOString(),
  missionConclusion: conclusion,
  controlPathways: pathways.map(item => `${item.title}: ${item.meaning}`),
  speculativeTrajectory: trajectory,
  counterpoint,
  practicalMeaning,
  watchNext,
  analyticConfidence: { score: confidence, band: confidenceBand, meaning: synthesis.inferenceLayer.confidenceMeaning },
  actorMap: actors.slice(0, 30),
  implementationChain: chain,
  scenarioMatrix: scenarios,
  currentCriticalClocks: clocks.map(clock => ({ slug: clock.slug, title: clock.title, score: clock.score, route: `timers.html#${clock.slug}` })),
  conclusionBoundary: boundary
};
fs.writeFileSync(commandPath, JSON.stringify(enriched, null, 2));

function actorList(list) {
  if (!list.length) return '<p>No specific actor has enough matched records on this page yet. Identify the exact authority, contract, ownership record or implementation role before drawing a conclusion.</p>';
  return `<ul>${list.map(actor => `<li><strong>${esc(actor.name)}</strong> — ${esc(actor.documentedRole)} <span class="mission-role">(${esc(actor.roleGroup)})</span></li>`).join('')}</ul>`;
}
function scenarioCard(scenario) {
  return `<article class="mission-scenario"><span class="label">${esc(scenario.status)}</span><h3>${esc(scenario.title)}</h3><p><strong>Plausibility band:</strong> ${esc(scenario.plausibilityBand)}</p><p>${esc(scenario.trajectory)}</p><details><summary>Evidence threshold and falsifiers</summary><p><strong>Still needed:</strong> ${esc(scenario.evidenceNeeded.join('; '))}</p><p><strong>Would weaken:</strong> ${esc(scenario.disconfirmingEvidence.join('; '))}</p><p><strong>Boundary:</strong> ${esc(scenario.boundary)}</p></details></article>`;
}
function fullLens() {
  const clockList = clocks.map(clock => `<li><a href="timers.html#${esc(clock.slug)}"><strong>${esc(clock.title)}:</strong> ${Number(clock.score)}%</a></li>`).join('') || '<li>No canonical timer is above 90% in this build.</li>';
  return `${markerStart}<section class="section wrap mission-brief-lens"><div class="eyebrow">Mission Conclusion · evidence → inference → scenario</div><h2>What the combined evidence means today</h2><p class="mission-lead">${esc(conclusion)}</p><div class="confidence-strip"><strong>Analytic confidence: ${confidence}/100</strong><span>${esc(confidenceBand)}</span><small>Support for the convergence pattern — not event probability.</small></div><div class="mission-lens-grid"><article><h3>Who is involved — documented roles only</h3>${actorList(actors.slice(0,10))}<p class="mission-boundary">A listed role does not prove guilt, shared motive or central command.</p></article><article><h3>How everything fits together</h3><ol>${chain.map(stage => `<li><strong>${esc(stage.title)}:</strong> ${esc(stage.explanation)}</li>`).join('')}</ol></article><article><h3>Control pathways in the records</h3><ul>${pathways.map(item => `<li><strong>${esc(item.title)}:</strong> ${esc(item.meaning)}${item.signalCount ? ` <small>(${item.signalCount} matched signals)</small>` : ''}</li>`).join('')}</ul></article><article><h3>Critical clocks over 90%</h3><ul>${clockList}</ul><p><strong>Practical test:</strong> ${esc(practicalMeaning)}</p></article></div><div class="scenario-grid">${scenarios.slice(0,6).map(scenarioCard).join('')}</div><details><summary>What to watch next</summary><ul>${watchNext.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details><article class="mission-counter"><h3>What would weaken the overall conclusion</h3><p>${esc(counterpoint)}</p></article><p class="mission-boundary"><strong>Boundary:</strong> ${esc(boundary)}</p><div class="cta-row"><a class="btn" href="conclusion-engine.html">Conclusion Engine</a><a class="btn alt" href="timers.html">Risk Timers</a><a class="btn alt" href="evidence-vault.html">Verify Evidence</a><a class="btn alt" href="data/speculative-intelligence-synthesis.json">Open Synthesis Data</a></div><style>.mission-brief-lens{border:1px solid rgba(216,181,106,.28);border-radius:24px;padding:1.25rem;background:linear-gradient(145deg,rgba(20,4,4,.9),rgba(0,0,0,.94))}.mission-lead{font-size:1.15rem;line-height:1.65}.confidence-strip{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap;border:1px solid rgba(216,181,106,.3);border-radius:14px;padding:.8rem;margin:1rem 0}.confidence-strip small{color:#c2b38d}.mission-lens-grid,.scenario-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:.85rem}.mission-lens-grid article,.mission-scenario,.mission-counter{border:1px solid rgba(216,181,106,.16);border-radius:15px;padding:1rem;background:rgba(255,255,255,.025)}.mission-scenario{border-color:rgba(190,55,55,.42);background:rgba(120,0,0,.1)}.mission-role{color:#c9ba91}.mission-boundary{font-size:.88rem;color:#c2b38d}.mission-brief-lens details{border:1px solid rgba(216,181,106,.16);border-radius:12px;padding:.75rem}.mission-brief-lens summary{cursor:pointer;font-weight:800}</style></section>${markerEnd}`;
}
function compactLens(title, html) {
  const hay = clean(`${title} ${html}`, 10000).toLowerCase();
  const tokens = title.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(token => token.length >= 4 && !/^(?:this|brief|daily|weekly|report|intelligence|matrix|reprogrammed)$/.test(token));
  const matchedActors = actors.filter(actor => tokens.some(token => `${actor.name} ${actor.documentedRole} ${actor.roleGroup} ${(actor.summaries||[]).join(' ')}`.toLowerCase().includes(token))).slice(0,6);
  const matchedPathways = pathways.filter(item => [item.title,item.meaning].some(value => value.toLowerCase().split(/\W+/).some(token => token.length > 5 && hay.includes(token)))).slice(0,5);
  const pageActors = matchedActors.length ? matchedActors : actors.slice(0,3);
  const pagePathways = matchedPathways.length ? matchedPathways : pathways.slice(0,3);
  const pageScenario = `If documented leverage around ${title} expands through ${pagePathways.map(item => item.title.toLowerCase()).join(', ')}, the risk is not merely influence in one sector but the ability to shape standards, infrastructure or access across connected systems. This inference becomes stronger only when records show implementation authority, shared data, enforceable conditions or dependency; it remains weak when the connection is only association, rhetoric or parallel policy.`;
  return `${markerStart}<section class="section wrap mission-brief-lens compact"><div class="eyebrow">Mission Lens · evidence → inference → scenario</div><h2>How ${esc(title)} fits into the wider control map</h2><div class="compact-grid"><article><h3>Documented actor map</h3>${actorList(pageActors)}<p class="mission-boundary">Only cited roles and relationships are established.</p></article><article><h3>Relevant control pathways</h3><ul>${pagePathways.map(item => `<li><strong>${esc(item.title)}:</strong> ${esc(item.meaning)}</li>`).join('')}</ul></article><article class="mission-speculation"><h3>Clearly labelled speculation</h3><p>${esc(pageScenario)}</p><p><strong>Analytic confidence:</strong> ${confidence}/100 for the site-wide convergence pattern, not for this actor and not as event probability.</p></article><article><h3>What would confirm or weaken it</h3><p><strong>Confirm:</strong> mandate, ownership, contract, procurement, technical integration, data exchange, enforcement authority or access rule.</p><p><strong>Weaken:</strong> decentralisation, optional participation, open standards, competition, effective appeal or records showing no operational link.</p></article></div><details><summary>Open the scenario thresholds</summary>${scenarios.slice(0,5).map(s => `<p><strong>${esc(s.title)}:</strong> ${esc(s.plausibilityBand)} — ${esc(s.boundary)}</p>`).join('')}</details><p class="mission-boundary"><strong>Boundary:</strong> This page does not prove secret intent, guilt, one-world government, one-world currency, one-world religion or coordinated control.</p><style>.mission-brief-lens.compact{border:1px solid rgba(216,181,106,.22);border-radius:18px;padding:1rem;background:rgba(25,5,5,.72)}.compact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:.8rem}.compact-grid article{border:1px solid rgba(216,181,106,.15);border-radius:14px;padding:.9rem}.compact-grid .mission-speculation{border-color:rgba(190,55,55,.45);background:rgba(120,0,0,.1)}</style></section>${markerEnd}`;
}
function inject(relative, full = false) {
  const target = file(relative); if (!fs.existsSync(target)) return false;
  let html = fs.readFileSync(target,'utf8').replace(/<!-- mission-brief-lens:start -->[\s\S]*?<!-- mission-brief-lens:end -->/g,'');
  const title = titleFromHtml(html); const block = full ? fullLens() : compactLens(title, html);
  const hero = html.match(/<section[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<\/section>/i);
  if (hero) html = html.replace(hero[0], `${hero[0]}${block}`); else { const main = html.match(/<main[^>]*>/i); if (!main) return false; html = html.replace(main[0], `${main[0]}${block}`); }
  fs.writeFileSync(target,html); return true;
}
const direct = ['daily-command-brief.html','daily-brain-brief.html','daily-brief-master.html','outcome-briefings.html','entity-daily-briefs.html','weekly-intelligence-brief.html'];
let patched = 0;
for (const relative of direct) if (inject(relative, relative==='daily-command-brief.html'||relative==='daily-brief-master.html')) patched++;
for (const folder of ['entity-briefs','contractor-briefs','billionaire-briefs','institution-briefs','subject-briefs']) {
  const directory=file(folder); if(!fs.existsSync(directory)) continue;
  for (const name of fs.readdirSync(directory).filter(name=>name.endsWith('.html'))) if(inject(`${folder}/${name}`)) patched++;
}
const standard = { ok:true, updated:new Date().toISOString(), purpose:'Require every serious brief to separate documented evidence, analytic inference, scenario speculation and uncertainty.', requiredLayers:['documented evidence','analytic inference','speculative scenario','uncertainty and falsifiers'], requiredSections:['actor map','control pathways','implementation chain','labelled scenario matrix','analytic confidence not probability','counterpoint','missing proof','falsifiers','claim boundary'], patchedBriefPages:patched, analyticConfidence:{score:confidence,band:confidenceBand}, actorCount:actors.length, pathways:pathways.map(p=>p.title), scenarios:scenarios.map(s=>({id:s.id,title:s.title,status:s.status,plausibilityBand:s.plausibilityBand})), missionConclusion:conclusion, speculativeTrajectory:trajectory, counterpoint, watchNext };
fs.writeFileSync(file('data/brief-mission-standard.json'),JSON.stringify(standard,null,2));
console.log(`Mission intelligence layer applied to ${patched} brief pages with ${actors.length} documented actors and ${scenarios.length} bounded scenarios.`);
