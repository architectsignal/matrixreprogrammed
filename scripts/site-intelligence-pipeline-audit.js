const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = value => path.join(root, value);
const exists = value => fs.existsSync(file(value));
const read = value => exists(value) ? fs.readFileSync(file(value), 'utf8') : '';
const readJson = (value, fallback = {}) => {
  try { return JSON.parse(read(value)); } catch { return fallback; }
};
const clean = (value, max = 3000) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const ageDays = value => {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp) ? Math.floor((Date.now() - stamp) / 86400000) : null;
};

const checks = [];
const add = (id, stage, status, finding, fix = '', evidence = []) => checks.push({ id, stage, status, finding, fix, evidence });
const requireFile = (id, stage, relative, purpose) => {
  if (exists(relative)) add(id, stage, 'green', `${purpose} exists.`, '', [relative]);
  else add(id, stage, 'red', `${purpose} is missing.`, `Restore or regenerate ${relative}.`, [relative]);
};

const drops = readJson('data/latest-public-drops.json', { drops: [] });
const sevenDay = readJson('downloads/seven-day-intel.json', { feedResults: [] });
const clockSource = readJson('data/global-risk-clocks.json', { clocks: [] });
const wall = readJson('data/clock-wall.json', { clocks: [] });
const homepage = readJson('data/homepage-command-surface.json', {});
const command = readJson('data/daily-command-brief.json', {});
const standard = readJson('data/reader-interpretation-standard.json', {});
const briefStandard = readJson('data/brief-mission-standard.json', {});
const gathering = readJson('data/information-gathering-system.json', {});
const conclusionEngine = readJson('data/conclusion-engine.json', { conclusions: [] });
const graph = readJson('data/evidence-weighted-relationship-graph.json', { nodes: [], edges: [] });
const recordEvents = readJson('data/record-events.json', { events: [] });
const packageJson = readJson('package.json', { scripts: {} });

// Stage 1: collection and freshness.
requireFile('collect-latest-drops', 'Collect', 'data/latest-public-drops.json', 'Curated current-source intake');
requireFile('collect-seven-day', 'Collect', 'downloads/seven-day-intel.json', 'Seven-day news intake');
requireFile('collect-record-events', 'Collect', 'data/record-events.json', 'Normalized public-record event feed');
requireFile('collect-source-pulls', 'Collect', 'data/source-pulls/source-pull-index.json', 'Source-pull index');
const dropAge = ageDays(drops.updated);
add('freshness-curated-drops', 'Collect', dropAge !== null && dropAge <= 2 ? 'green' : dropAge !== null && dropAge <= 7 ? 'amber' : 'red', `Curated source file age: ${dropAge === null ? 'unknown' : `${dropAge} day(s)`}.`, 'Run the current-source updater daily and fail the homepage build when the curated source set exceeds seven days.', ['data/latest-public-drops.json']);
const sevenAge = ageDays(sevenDay.updated);
add('freshness-seven-day-feed', 'Collect', sevenAge !== null && sevenAge <= 1 ? 'green' : sevenAge !== null && sevenAge <= 7 ? 'amber' : 'red', `Seven-day feed file age: ${sevenAge === null ? 'unknown' : `${sevenAge} day(s)`}.`, 'Run RSS/public-source intake every day and archive items automatically after seven days.', ['downloads/seven-day-intel.json']);
const activeNews = (sevenDay.feedResults || []).filter(item => {
  const age = ageDays(item.published);
  return age !== null && age >= 0 && age <= 7;
});
add('fresh-current-news', 'Collect', activeNews.length ? 'green' : 'amber', `${activeNews.length} news item(s) are inside the active seven-day window.`, 'Keep the homepage empty rather than showing stale news when this count reaches zero.', ['downloads/seven-day-intel.json']);

// Stage 2: classification and evidence quality.
requireFile('classification-system', 'Classify', 'data/information-gathering-system.json', 'Information-gathering operating model');
requireFile('interpretation-standard', 'Grade', 'data/reader-interpretation-standard.json', 'Reader score and evidence interpretation standard');
requireFile('source-registry', 'Grade', 'data/master-evidence-source-registry.json', 'Master evidence source registry');
const pipelineSteps = gathering.pipeline || [];
add('pipeline-completeness', 'Classify', pipelineSteps.length >= 8 ? 'green' : 'red', `${pipelineSteps.length} collection-to-review pipeline step(s) are declared.`, 'Require collect, classify, grade, cross-check, connect, conclude, publish and review stages.', ['data/information-gathering-system.json']);
const levels = gathering.evidenceLevels || [];
add('evidence-levels', 'Grade', levels.length >= 6 ? 'green' : 'amber', `${levels.length} evidence/implementation level(s) are declared.`, 'Ensure implementation, convergence and lock-in cannot be inferred from source volume alone.', ['data/information-gathering-system.json']);

// Stage 3: entity and relationship mapping.
requireFile('relationship-graph', 'Connect', 'data/evidence-weighted-relationship-graph.json', 'Evidence-weighted relationship graph');
const nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
const edgeCount = Array.isArray(graph.edges) ? graph.edges.length : 0;
add('graph-population', 'Connect', nodeCount > 0 && edgeCount > 0 ? 'green' : 'red', `Relationship graph contains ${nodeCount} node(s) and ${edgeCount} edge(s).`, 'Rebuild the graph and reject empty deployments.', ['data/evidence-weighted-relationship-graph.json']);
const unboundedEdges = (graph.edges || []).filter(edge => !clean(edge.boundary || edge.evidenceBoundary || edge.grade));
add('graph-boundaries', 'Connect', unboundedEdges.length === 0 ? 'green' : 'amber', `${unboundedEdges.length} relationship edge(s) lack an explicit grade or boundary field.`, 'Require source IDs, relationship type, evidence grade and association-not-guilt boundary on every edge.', ['data/evidence-weighted-relationship-graph.json']);

// Stage 4: conclusions and briefs.
requireFile('daily-conclusions', 'Conclude', 'data/daily-power-conclusions.json', 'Daily power conclusions');
requireFile('conclusion-engine', 'Conclude', 'data/conclusion-engine.json', 'Conclusion engine');
requireFile('daily-command-json', 'Conclude', 'data/daily-command-brief.json', 'Daily Command Brief data');
requireFile('brief-standard', 'Publish', 'data/brief-mission-standard.json', 'Site-wide brief mission standard');
for (const [field, label] of [['missionConclusion','mission conclusion'],['speculativeTrajectory','labelled speculation'],['counterpoint','counterpoint'],['practicalMeaning','practical meaning'],['conclusionBoundary','claim boundary']]) {
  add(`daily-${field}`, 'Conclude', clean(command[field]).length > 40 ? 'green' : 'red', `Daily Command Brief ${clean(command[field]).length > 40 ? 'contains' : 'is missing'} its ${label}.`, `Generate ${label} from current evidence and canonical timers on every build.`, ['data/daily-command-brief.json']);
}
add('brief-coverage', 'Publish', Number(briefStandard.patchedBriefPages || 0) > 0 ? 'green' : 'red', `${Number(briefStandard.patchedBriefPages || 0)} brief page(s) received the mission interpretation layer.`, 'Apply the final mission lens after all legacy brief generators and audit every brief route.', ['data/brief-mission-standard.json']);
add('conclusion-engine-population', 'Conclude', (conclusionEngine.conclusions || []).length > 0 ? 'green' : 'red', `${(conclusionEngine.conclusions || []).length} conclusion-engine item(s) exist.`, 'Do not publish an empty conclusion engine.', ['data/conclusion-engine.json']);

// Stage 5: clock synthesis.
requireFile('clock-source', 'Clocks', 'data/global-risk-clocks.json', 'Canonical risk-clock source');
requireFile('clock-wall', 'Clocks', 'data/clock-wall.json', 'Evidence-fed clock synthesis');
requireFile('timer-page', 'Clocks', 'timers.html', 'Clean timer page');
const sourceLookup = new Map((clockSource.clocks || []).map(clock => [clock.slug, Number(clock.score)]));
const mismatches = (wall.clocks || []).filter(clock => sourceLookup.has(clock.slug) && sourceLookup.get(clock.slug) !== Number(clock.score));
add('clock-score-integrity', 'Clocks', mismatches.length === 0 ? 'green' : 'red', `${mismatches.length} clock score mismatch(es) exist between canonical source and visual synthesis.`, 'Never add display bonuses or recalculate scores in the presentation layer.', ['data/global-risk-clocks.json','data/clock-wall.json']);
const missingClockDepth = (wall.clocks || []).filter(clock => !clean(clock.lastMovement) || !clean(clock.controlSystemMeaning) || !clean(clock.boundary) || !(clock.evidenceInputs || []).length);
add('clock-depth', 'Clocks', missingClockDepth.length === 0 ? 'green' : 'amber', `${missingClockDepth.length} clock(s) lack movement, mission relevance, boundary or direct evidence input.`, 'Keep the card clean but require the deeper tab to contain those fields.', ['data/clock-wall.json','timers.html']);
const linkedSlugs = new Set((drops.drops || []).flatMap(item => item.timerLinks || []));
const orphanLinks = [...linkedSlugs].filter(slug => !sourceLookup.has(slug));
add('source-to-clock-links', 'Clocks', orphanLinks.length === 0 ? 'green' : 'red', `${linkedSlugs.size} timer-link slug(s) are present in current drops; ${orphanLinks.length} do not resolve.`, 'Reject source drops that reference a nonexistent clock slug.', ['data/latest-public-drops.json','data/global-risk-clocks.json']);

// Stage 6: homepage and publication surface.
requireFile('homepage-command-data', 'Publish', 'data/homepage-command-surface.json', 'Homepage command-surface data');
requireFile('homepage', 'Publish', 'index.html', 'Homepage');
const expectedCritical = (wall.clocks || []).filter(clock => Number(clock.score) > 90).map(clock => `${clock.slug}:${clock.score}`).sort();
const actualCritical = (homepage.criticalClocks || []).map(clock => `${clock.slug}:${clock.score}`).sort();
add('homepage-clock-sync', 'Publish', JSON.stringify(expectedCritical) === JSON.stringify(actualCritical) ? 'green' : 'red', `Homepage displays ${actualCritical.length} critical clock(s); canonical synthesis requires ${expectedCritical.length}.`, 'Build the homepage from data/clock-wall.json only and use a strict greater-than-90 threshold.', ['data/homepage-command-surface.json','data/clock-wall.json','index.html']);
const staleHomepageNews = (homepage.latestNews || []).filter(item => {
  const age = ageDays(item.published);
  return age === null || age > 7;
});
add('homepage-news-freshness', 'Publish', staleHomepageNews.length === 0 ? 'green' : 'red', `${staleHomepageNews.length} stale homepage news item(s) exist.`, 'Show only items published inside seven days; show an empty-state message rather than stale content.', ['data/homepage-command-surface.json','index.html']);
add('homepage-conclusion-layer', 'Publish', clean(homepage.evidenceConclusion).length > 80 && clean(homepage.speculation).length > 80 && clean(homepage.counterpoint).length > 40 ? 'green' : 'red', 'Homepage evidence conclusion, labelled speculation and counterpoint are checked together.', 'Block homepage publication if any of these three fields is missing.', ['data/homepage-command-surface.json','index.html']);

// Stage 7: automation and release order.
const buildScript = String(packageJson.scripts?.build || '');
for (const script of ['build-mission-brief-conclusions.js','build-homepage-command-surface.js','site-intelligence-pipeline-audit.js','patch-login-email-delivery.js']) {
  add(`build-order-${script}`, 'Automate', buildScript.includes(script) || (script === 'patch-login-email-delivery.js' && buildScript.includes('patch-osint-tool-tiers.js')) ? 'green' : 'red', `${script} ${buildScript.includes(script) || (script === 'patch-login-email-delivery.js' && buildScript.includes('patch-osint-tool-tiers.js')) ? 'is' : 'is not'} included in the authoritative build path.`, `Add ${script} after legacy generators and before Cloudflare output.`, ['package.json']);
}
const workflowDir = file('.github/workflows');
const workflows = exists('.github/workflows') ? fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name)) : [];
const workflowText = workflows.map(name => read(`.github/workflows/${name}`)).join('\n');
add('daily-automation', 'Automate', /cron:[\s\S]*daily|daily[\s\S]*cron:|0\s+\d+\s+\*\s+\*\s+\*/i.test(workflowText) ? 'green' : 'amber', `${workflows.length} workflow file(s) scanned for daily scheduling.`, 'Keep one canonical daily intake/conclusion/clock workflow and retire overlapping legacy schedules.', workflows.map(name => `.github/workflows/${name}`));
add('weekly-automation', 'Automate', /weekly|0\s+\d+\s+\*\s+\*\s+[0-6]/i.test(workflowText) ? 'green' : 'amber', 'Workflow files were scanned for weekly synthesis scheduling.', 'Add a weekly delta report that compares score movement, new entities, new contracts, new missing records and downgraded conclusions.', workflows.map(name => `.github/workflows/${name}`));

const newClockIdeas = [
  { title: 'Digital Identity Integration Clock', purpose: 'Track when identity wallets, biometrics and credentials become required across banking, benefits, health, travel, age verification and online access.', raiseOn: ['mandatory use','cross-sector acceptance','biometric requirement','payment or benefit linkage'] },
  { title: 'Public-Private Governance Clock', purpose: 'Track when private vendors, foundations, forums and contractors gain operational roles in public policy or essential services.', raiseOn: ['exclusive contracts','delegated enforcement','vendor lock-in','standards written by implementers'] },
  { title: 'Global Standards Harmonisation Clock', purpose: 'Track model laws, treaties and standards moving from guidance into domestic law, procurement or technical mandates.', raiseOn: ['ratification','implementing law','procurement condition','cross-border interoperability mandate'] },
  { title: 'Payment Access Control Clock', purpose: 'Track financial exclusion, identity-linked wallets, programmable compliance, de-banking and platform-payment coupling.', raiseOn: ['transaction restrictions','identity gating','cash limits','payment denial tied to policy or speech'] },
  { title: 'Emergency Powers Permanence Clock', purpose: 'Track temporary war, health, cyber or security powers becoming permanent governance infrastructure.', raiseOn: ['renewal','scope expansion','peacetime retention','transfer into ordinary law'] },
  { title: 'AI Government Dependency Clock', purpose: 'Track government reliance on a small number of AI, cloud, data and analytics vendors for decisions and public services.', raiseOn: ['sole-source contracts','automated eligibility or policing','shared government model infrastructure','appeal gaps'] },
  { title: 'Information Gatekeeping Clock', purpose: 'Track convergence of search, media, moderation, advertising, identity and payment controls.', raiseOn: ['state-linked flagging','search suppression','identity-required access','payment or advertising penalties'] },
  { title: 'Asset Manager Voting Power Clock', purpose: 'Track concentration of proxy voting, stewardship mandates and ownership influence among major asset managers.', raiseOn: ['voting concentration','common policy mandates','pension dependency','ownership and board influence growth'] },
  { title: 'Contractor State Dependency Clock', purpose: 'Track government dependence on intelligence, defense, logistics, consulting, security and data contractors.', raiseOn: ['mission-critical outsourcing','oversight failure','contract consolidation','revolving-door concentration'] },
  { title: 'Food, Water and Land Control Clock', purpose: 'Track ownership concentration, traceability mandates, carbon-linked controls and access conditions across essentials.', raiseOn: ['mandatory traceability','ownership concentration','rationing or identity linkage','local producer exclusion'] },
  { title: 'Biometric Border and Mobility Clock', purpose: 'Track biometric travel, border databases and movement permissions merging with national identity and security systems.', raiseOn: ['mandatory biometrics','cross-border database sharing','domestic reuse','travel permission linkage'] },
  { title: 'Institutional Religion Convergence Clock', purpose: 'Track direct institutional movement toward shared religious governance or mandatory ethical doctrine while separating dialogue from control.', raiseOn: ['binding doctrine','state-linked enforcement','mandatory curriculum or credential','formal supranational religious authority'] }
];

const red = checks.filter(check => check.status === 'red');
const amber = checks.filter(check => check.status === 'amber');
const green = checks.filter(check => check.status === 'green');
const overall = red.length ? 'not-ready' : amber.length ? 'working-with-gaps' : 'fully-working';
const topFixes = checks.filter(check => check.status !== 'green').map(check => ({ id: check.id, stage: check.stage, priority: check.status === 'red' ? 'critical' : 'improve', fix: check.fix })).slice(0, 30);
const report = {
  ok: red.length === 0,
  overall,
  updated: new Date().toISOString(),
  mission: 'Collect public records and current reporting, grade and connect the evidence, produce bounded conclusions and speculation, and feed clear visual clocks that show where practical control is concentrating.',
  summary: { green: green.length, amber: amber.length, red: red.length, total: checks.length },
  pipeline: ['Collect','Classify','Grade','Cross-check','Connect','Conclude','Publish','Clocks','Automate','Review'],
  checks,
  topFixes,
  newClockIdeas,
  optimizationPrinciples: [
    'One canonical source of truth per score, entity, relationship and conclusion.',
    'Latest information first; stale content archives automatically instead of remaining on the homepage.',
    'Every conclusion includes evidence, mission relevance, labelled speculation, counterpoint, missing proof and next action.',
    'Clocks move only on dated source-linked triggers, never because a generator adds a visual bonus.',
    'The homepage is a command surface, not a directory: conclusion, speculation, critical clocks and current news first.',
    'Every automation produces a receipt showing source freshness, changed conclusions, changed clocks and deployment SHA.'
  ]
};

fs.mkdirSync(file('downloads'), { recursive: true });
fs.writeFileSync(file('data/site-intelligence-pipeline-audit.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(file('downloads/site-intelligence-pipeline-audit.md'), ['# Matrix Reprogrammed Site Intelligence Pipeline Audit','',`Updated: ${report.updated}`,`Overall: ${overall}`,`Green: ${green.length} · Amber: ${amber.length} · Red: ${red.length}`,'','## Checks','',...checks.map(check => `- **${check.status.toUpperCase()} · ${check.stage} · ${check.id}:** ${check.finding}${check.fix ? ` Fix: ${check.fix}` : ''}`),'','## New Clock Ideas','',...newClockIdeas.map(clock => `- **${clock.title}:** ${clock.purpose}`)].join('\n'));

const checkCards = checks.map(check => `<article class="audit-card ${check.status}"><span>${esc(check.status.toUpperCase())} · ${esc(check.stage)}</span><h3>${esc(check.id.replace(/-/g,' '))}</h3><p>${esc(check.finding)}</p>${check.fix ? `<p><strong>Fix:</strong> ${esc(check.fix)}</p>` : ''}</article>`).join('');
const clockCards = newClockIdeas.map(clock => `<article class="audit-card idea"><h3>${esc(clock.title)}</h3><p>${esc(clock.purpose)}</p><details><summary>Raise when</summary><ul>${clock.raiseOn.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details></article>`).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Site Intelligence System Audit | Matrix Reprogrammed</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="reader-experience.css"><style>.audit-summary{display:flex;gap:.7rem;flex-wrap:wrap}.audit-summary strong{border:1px solid rgba(216,181,106,.3);border-radius:999px;padding:.55rem .85rem}.audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.8rem}.audit-card{border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:1rem;background:rgba(255,255,255,.025)}.audit-card.green{border-color:rgba(80,180,100,.45)}.audit-card.amber{border-color:rgba(220,170,60,.55)}.audit-card.red{border-color:rgba(220,60,60,.65)}.audit-card.idea{border-color:rgba(216,181,106,.35)}</style></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="daily-command-brief.html">Daily Brief</a><a href="timers.html">Timers</a><a href="information-gathering-system.html">Pipeline</a><a href="evidence-vault.html">Evidence</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Full systems audit</div><h1>SITE INTELLIGENCE SYSTEM.</h1><p class="lead">How the site collects information, grades evidence, maps entities, produces conclusions and feeds the risk clocks.</p><div class="audit-summary"><strong>Overall: ${esc(overall)}</strong><strong>Green: ${green.length}</strong><strong>Amber: ${amber.length}</strong><strong>Red: ${red.length}</strong></div></section><section class="section wrap"><h2>Pipeline Checks</h2><div class="audit-grid">${checkCards}</div></section><section class="section wrap"><h2>Useful New Clocks</h2><div class="audit-grid">${clockCards}</div></section></main><footer class="footer wrap"><p>Evidence first. Speculation labelled. Scores canonical. Missing proof visible.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(file('site-intelligence-system-audit.html'), html);

if (red.length) {
  console.error(`SITE INTELLIGENCE PIPELINE AUDIT FAILED: ${red.length} critical issue(s), ${amber.length} improvement(s).`);
  for (const check of red) console.error(`- ${check.stage} / ${check.id}: ${check.finding}`);
  process.exit(1);
}
console.log(`SITE INTELLIGENCE PIPELINE AUDIT PASSED: ${green.length} green, ${amber.length} amber, 0 red.`);
