const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });
const updated = new Date().toISOString();
function readJson(file, fallback = {}) {
  try {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch { return fallback; }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function list(items) { return `<ul>${(items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`; }
function mdList(items) { return (items || []).map(x => `- ${x}`).join('\n'); }
const feeds = {
  outcome: readJson('data/outcome-briefings.json', { briefings: [] }),
  snapshot: readJson('data/probability-snapshot.json', { scenarios: [], summary: {} }),
  signal4: readJson('data/probability-signal-feed-004.json', { signals: [] }),
  policy: readJson('data/agenda-2030-policy-watch.json', { lanes: [] }),
  gold: readJson('data/gold-reserves-worldwide.json', { sourceBasis: {}, countries: [] }),
  disclosure: readJson('data/epstein-transparency-trigger-2026-07-03.json', {}),
  billionaire: readJson('data/billionaire-watch-core.json', {}),
  findings: readJson('data/deep-findings-batch-001.json', { findings: [] })
};
const outcomeBriefings = Array.isArray(feeds.outcome.briefings) ? feeds.outcome.briefings : [];
const scenarios = Array.isArray(feeds.snapshot.scenarios) ? feeds.snapshot.scenarios : [];
const highestScenario = feeds.snapshot.summary?.highestScenario || scenarios.slice().sort((a, b) => Number(b.computedProbability || 0) - Number(a.computedProbability || 0))[0] || null;
const biggestMover = scenarios.slice().sort((a, b) => Math.abs(Number(b.probabilityDelta || 0)) - Math.abs(Number(a.probabilityDelta || 0)))[0] || null;
const signals = Array.isArray(feeds.signal4.signals) ? feeds.signal4.signals : [];
const topSignals = signals.slice(0, 5).map(s => ({ id: s.signalId, title: s.title, lane: s.lane, weight: s.weight, status: s.sourceStatus, why: s.whyItMatters }));
const topConclusions = outcomeBriefings.slice(0, 6).map(b => ({ section: b.section, headline: b.headline, meaning: b.meaning || b.conclusion || b.whatItMeans, likely: b.likely || b.likelyOutcome }));
const missingRecords = [];
for (const b of outcomeBriefings) for (const r of b.records || b.recordsNeeded || []) missingRecords.push({ section: b.section, record: r });
for (const t of feeds.policy?.nextActions || []) missingRecords.push({ section: 'Policy Watch', record: t });
const priorityPages = [...new Set(outcomeBriefings.flatMap(b => b.pages || b.publicPageTargets || []))].slice(0, 12);
const conclusions = [
  'Disclosure pressure is a top exposure lane because withheld records reveal the structure of protection and omission.',
  'Policy-system convergence remains the strongest system-level pattern; the key test is whether access becomes mandatory, centralized or vendor-controlled.',
  'Gold reserves must be tracked through ownership and custody separately because reported tonnes do not prove physical location or encumbrance status.',
  'Wealth and institutional influence should be mapped through infrastructure dependency, filings, contracts and grant routes, not slogans.',
  'Speculation should become a record engine: exact claim, source chain, counter-source, probability trigger and downgrade condition.'
];
const brain = {
  updated,
  title: 'Daily Brain Brief',
  purpose: 'Daily intelligence product generated from Matrix Reprogrammed outcome, probability, signal, policy, gold and disclosure feeds.',
  boundary: 'This is an evidence-graded briefing. It separates records, reporting, association, hypothesis and unsupported claim.',
  summary: {
    conclusionCount: conclusions.length,
    outcomeBriefCount: outcomeBriefings.length,
    signalCount: signals.length,
    scenarioCount: scenarios.length,
    policyLaneCount: Array.isArray(feeds.policy.lanes) ? feeds.policy.lanes.length : 0,
    worldGoldTonnes: feeds.gold?.sourceBasis?.worldTotalTonnes || null,
    highestScenario: highestScenario ? { id: highestScenario.scenarioId, title: highestScenario.title, probability: highestScenario.computedProbability || highestScenario.currentProbability, band: highestScenario.band } : null,
    biggestMover: biggestMover ? { id: biggestMover.scenarioId, title: biggestMover.title, delta: biggestMover.probabilityDelta, probability: biggestMover.computedProbability } : null
  },
  topConclusions: conclusions,
  sectionBriefings: topConclusions,
  topSignals,
  biggestProbabilityMovement: biggestMover,
  highestProbabilityScenario: highestScenario,
  missingRecords: missingRecords.slice(0, 12),
  priorityPages,
  tomorrowWatchList: [
    'Any new filing, redaction explanation, or changed document index in the disclosure lane.',
    'Any digital identity, wallet, payment or public-service access rule changing from optional to mandatory.',
    'Any central-bank gold purchase, repatriation statement, custody dispute or audit disclosure.',
    'Any major cloud, AI, payment, energy, identity or security infrastructure contract involving public systems.',
    'Any speculation claim that gains an original source, metadata, official record or credible counter-source.'
  ],
  nextAction: 'Use this brief as the top-of-site output layer: update affected pages, pull missing records, and adjust probabilities when records change.'
};
fs.writeFileSync(path.join(dataDir, 'daily-brain-brief.json'), JSON.stringify(brain, null, 2));
function conclusionCard(c, i) { return `<article class="card redline"><span class="label">CONCLUSION ${i + 1}</span><h3>${esc(c)}</h3></article>`; }
function sectionCard(b) { return `<article class="card redline"><span class="label">${esc(b.section || 'Brief')}</span><h3>${esc(b.headline || '')}</h3><p><strong>Meaning:</strong> ${esc(b.meaning || '')}</p><p><strong>Likely outcome:</strong> ${esc(b.likely || '')}</p></article>`; }
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Daily Brain Brief | Matrix Reprogrammed</title><meta name="description" content="Daily Matrix Brain briefing: conclusions, signals, probability movement, missing records, priority pages and watch list."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="matrix-brain.html">Matrix Brain</a><a href="outcome-briefings.html">Outcomes</a><a href="probability-snapshot.html">Snapshot</a><a href="record-intake-queue.html">Records</a><a href="control-structure.html">Control Map</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Daily Intelligence Product</div><h1>DAILY BRAIN BRIEF.</h1><p class="lead">What the machine is seeing, what it means, what is likely next, which records matter, and which pages should move.</p><div class="cta-row"><a class="btn" href="data/daily-brain-brief.json">Open JSON</a><a class="btn alt" href="downloads/daily-brain-brief.md">Download Markdown</a><a class="btn alt" href="matrix-brain.html">Matrix Brain</a><a class="btn alt" href="control-structure.html">Control Map</a></div></section><section class="section wrap split"><div class="terminal">DAILY BRAIN BRIEF\n&gt; updated: ${esc(updated)}\n&gt; conclusions: ${brain.summary.conclusionCount}\n&gt; outcome briefs: ${brain.summary.outcomeBriefCount}\n&gt; signals: ${brain.summary.signalCount}\n&gt; scenarios: ${brain.summary.scenarioCount}\n&gt; policy lanes: ${brain.summary.policyLaneCount}</div><aside class="card redline"><h2>Boundary</h2><p>${esc(brain.boundary)}</p></aside></section><section class="section wrap"><h2>What The Machine Concludes Today</h2><div class="grid">${brain.topConclusions.map(conclusionCard).join('')}</div></section><section class="section wrap"><h2>Section Briefings</h2><div class="grid">${brain.sectionBriefings.map(sectionCard).join('')}</div></section><section class="section wrap"><h2>Probability Movement</h2><div class="grid"><article class="card redline"><span class="label">HIGHEST SCENARIO</span><h3>${esc(highestScenario?.title || 'No scenario loaded')}</h3><p><strong>Probability:</strong> ${esc(highestScenario?.computedProbability || highestScenario?.currentProbability || 'unknown')}%</p><p><strong>Band:</strong> ${esc(highestScenario?.band || 'unknown')}</p></article><article class="card redline"><span class="label">BIGGEST MOVER</span><h3>${esc(biggestMover?.title || 'No movement loaded')}</h3><p><strong>Delta:</strong> ${esc(biggestMover?.probabilityDelta || 0)}</p><p><strong>Probability:</strong> ${esc(biggestMover?.computedProbability || 'unknown')}%</p></article></div></section><section class="section wrap"><h2>Records That Matter Most</h2>${list(brain.missingRecords.map(x => `${x.section}: ${x.record}`))}</section><section class="section wrap"><h2>Tomorrow Watch List</h2>${list(brain.tomorrowWatchList)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — daily conclusions, missing records, likely outcomes.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'daily-brain-brief.html'), html);
const md = ['# Daily Brain Brief', '', `Updated: ${updated}`, '', brain.boundary, '', '## Top Conclusions', '', mdList(brain.topConclusions), '', '## Top Signals', '', mdList(brain.topSignals.map(s => `${s.id}: ${s.title} (${s.lane || 'lane unknown'})`)), '', '## Records That Matter Most', '', mdList(brain.missingRecords.map(x => `${x.section}: ${x.record}`)), '', '## Tomorrow Watch List', '', mdList(brain.tomorrowWatchList), ''].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'daily-brain-brief.md'), md);
let matrixPath = path.join(root, 'matrix-brain.html');
if (fs.existsSync(matrixPath)) {
  let page = fs.readFileSync(matrixPath, 'utf8');
  if (!page.includes('daily-brain-brief.html')) {
    const panel = `<section class="section wrap"><h2>What The Machine Concludes Today</h2><div class="grid"><article class="card redline"><span class="label">DAILY BRAIN BRIEF</span><h3>Read the current machine conclusions.</h3><p>Daily conclusion layer generated from outcome briefings, probability movement, missing records and feed signals.</p><a class="btn" href="daily-brain-brief.html">Open Daily Brain Brief</a><a class="btn alt" href="data/daily-brain-brief.json">Open JSON</a></article><article class="card redline"><span class="label">OUTCOME BRIEFINGS</span><h3>Detailed section outcomes.</h3><p>Expanded briefings for disclosure, systems, reserves, power and speculation review.</p><a class="btn alt" href="outcome-briefings.html">Open Outcomes</a></article></div></section>`;
    page = page.replace('<section class="section wrap"><h2>Machine Pulse</h2>', panel + '<section class="section wrap"><h2>Machine Pulse</h2>');
  }
  if (!page.includes('living-pulse.js')) page = page.replace('</body>', '<script src="living-pulse.js"></script></body>');
  fs.writeFileSync(matrixPath, page);
}
try { require('./build-living-control-interface.js'); } catch (error) { console.warn(`Living control interface skipped: ${error.message}`); }
console.log(`Daily brain brief generated: ${brain.topConclusions.length} conclusions, ${brain.topSignals.length} signals, ${brain.missingRecords.length} missing-record prompts.`);
