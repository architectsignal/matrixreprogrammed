const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const updated = new Date().toISOString();
const date = updated.slice(0, 10);

function readJson(file, fallback = {}) {
  try {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return fallback;
  }
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function text(value, fallback = '') {
  const clean = String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}
function array(value) {
  if (Array.isArray(value)) return value.map(item => text(typeof item === 'string' ? item : item?.title || item?.name || item?.record || item?.label || '')).filter(Boolean);
  return value ? [text(value)].filter(Boolean) : [];
}
function unique(items, limit = 20) {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}
function list(items) {
  return `<ul>${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
}
function mdList(items) {
  return (items || []).length ? items.map(item => `- ${item}`).join('\n') : '- No item established in the current source bundle.';
}
function routeLink(value) {
  const route = text(value);
  return route ? route.replace(/^\//, '') : '';
}

const feeds = {
  outcome: readJson('data/outcome-briefings.json', { briefings: [] }),
  snapshot: readJson('data/probability-snapshot.json', { scenarios: [], summary: {} }),
  signal4: readJson('data/probability-signal-feed-004.json', { signals: [] }),
  policy: readJson('data/agenda-2030-policy-watch.json', { lanes: [] }),
  gold: readJson('data/gold-reserves-worldwide.json', { sourceBasis: {}, countries: [] }),
  disclosure: readJson('data/epstein-transparency-trigger-2026-07-03.json', {}),
  billionaire: readJson('data/billionaire-watch-core.json', {}),
  findings: readJson('data/deep-findings-batch-001.json', { findings: [] }),
  liveIntel: readJson('data/live-intel.json', { items: [] })
};

const outcomeBriefings = Array.isArray(feeds.outcome.briefings) ? feeds.outcome.briefings : [];
const scenarios = Array.isArray(feeds.snapshot.scenarios) ? feeds.snapshot.scenarios : [];
const highestScenario = feeds.snapshot.summary?.highestScenario || scenarios.slice().sort((a, b) => Number(b.computedProbability || b.currentProbability || 0) - Number(a.computedProbability || a.currentProbability || 0))[0] || null;
const biggestMover = scenarios.slice().sort((a, b) => Math.abs(Number(b.probabilityDelta || 0)) - Math.abs(Number(a.probabilityDelta || 0)))[0] || null;
const signals = Array.isArray(feeds.signal4.signals) ? feeds.signal4.signals : [];

function deriveConvergence(section, meaning) {
  const lane = String(section || '').toLowerCase();
  if (lane.includes('policy') || lane.includes('identity') || lane.includes('payment')) {
    return 'The visible pattern supports an interoperability and access-system convergence assessment. It does not establish centralized command. The decisive tests are mandatory use, common identifiers, shared vendors, cross-border data exchange, denial powers and appeal rights.';
  }
  if (lane.includes('reserve') || lane.includes('gold')) {
    return 'Reserve diversification, custody concentration and sanctions exposure can create cross-border convergence in reserve behaviour. Ownership and custody records must be separated before drawing a stronger conclusion.';
  }
  if (lane.includes('power') || lane.includes('wealth')) {
    return 'Convergence is relevant where the same capital, infrastructure vendors, boards, standards bodies or public contracts recur across jurisdictions. Repetition alone is not proof of coordinated control.';
  }
  if (lane.includes('disclosure')) {
    return 'Comparable withholding rules, redaction categories and archive practices across jurisdictions may reveal a shared record-control pattern. That pattern must be demonstrated through the actual legal and administrative records.';
  }
  return meaning ? 'This item may contribute to a wider convergence pattern, but it cannot establish global coordination without cross-jurisdiction records, shared standards, common vendors or synchronized legal changes.' : 'No global convergence conclusion is established by this item alone.';
}

function deriveMoneyAuthority(item, institutions, records) {
  if (item.moneyAndAuthority) return text(item.moneyAndAuthority);
  const authority = institutions.length ? institutions.join(', ') : 'the named public and private institutions';
  const recordRoute = records.length ? records.join(', ') : 'filings, contracts, grants, budgets, custody statements or procurement records';
  return `Authority should be tested through ${authority}. Financial leverage is not established without ${recordRoute}.`;
}

function deriveBrief(item, index) {
  const integrity = item.integrity && typeof item.integrity === 'object' ? item.integrity : {};
  const records = unique([...array(item.records), ...array(item.recordsNeeded), ...array(item.missingEvidence)], 12);
  const watch = unique([...array(item.watch), ...array(item.watchNext), ...array(item.triggers)], 12);
  const institutions = unique([...array(item.institutions), ...array(item.entities), ...array(item.keyEntities)], 12);
  const pages = unique([...array(item.pages), ...array(item.publicPageTargets), ...array(item.sourceLinks)].map(routeLink), 10);
  const situation = text(item.situation || item.summary || item.description || item.body || item.finding, 'No current situation summary was supplied.');
  const meaning = text(item.meaning || item.whatItMeans || item.mechanismOfPower || item.conclusion, 'The mechanism remains under review.');
  const likely = text(item.likely || item.likelyOutcome || item.speculativeConclusion || integrity.conclusion, 'No responsible speculative conclusion is available from the current source bundle.');
  const section = text(item.section || item.lane || item.category, `Signal ${index + 1}`);
  const facts = unique([...array(item.establishedFacts), ...array(item.facts)], 10);
  if (!facts.length && situation) facts.push(situation);
  const counterAnalysis = text(item.counterAnalysis || item.counterEvidence || integrity.counterEvidence, watch.length ? `The assessment should weaken if these watch conditions do not appear: ${watch.join('; ')}.` : 'No counter-analysis was supplied by the source bundle.');
  const primaryRecord = text(item.primaryRecord || records[0] || integrity.sources?.[0], 'No single primary record is designated; treat this as a synthesis pending a named source.');
  const recordStatus = text(item.recordStatus || integrity.classification, integrity.freshness ? `Evidence checkpoint ${integrity.freshness}` : 'Evidence-graded analysis');
  return {
    id: text(item.id || item.signalId || item.canonicalId, `DB-${String(index + 1).padStart(3, '0')}`),
    section,
    headline: text(item.headline || item.title || item.subject, section),
    trigger: text(item.trigger, situation),
    primaryRecord,
    recordStatus,
    establishedFacts: facts,
    keyEntities: institutions,
    moneyAndAuthority: deriveMoneyAuthority(item, institutions, records),
    mechanismOfPower: meaning,
    solidConclusion: text(item.solidConclusion, meaning),
    missionRelevance: text(item.missionRelevance, 'This matters because it shows how records, institutions, infrastructure, money or access systems shape public power.'),
    eliteControlRelevance: text(item.eliteControlRelevance, 'Relevant only where records show control over access, infrastructure, funding, custody, disclosure or enforcement. Association, status or institutional overlap alone is not proof of coordinated control.'),
    globalConvergenceAssessment: text(item.globalConvergenceAssessment, deriveConvergence(section, meaning)),
    speculativeConclusion: likely,
    counterAnalysis,
    missingEvidence: records,
    watchNext: watch,
    confidence: text(item.confidence || integrity.confidence, 'unrated'),
    accessTier: text(item.accessTier, 'Public / Free Member evidence layer'),
    sourceLinks: pages,
    freshness: text(integrity.freshness || item.updatedAt || feeds.outcome.updated, updated),
    evidenceBasis: text(integrity.evidenceBasis, records.length ? `${records.length} named record targets and ${institutions.length} institution classes.` : 'Evidence basis not quantified in the source bundle.')
  };
}

const briefings = outcomeBriefings.slice(0, 10).map(deriveBrief);
const topSignals = signals.slice(0, 8).map((signal, index) => ({
  id: text(signal.signalId || signal.id, `SIG-${index + 1}`),
  title: text(signal.title || signal.headline, `Signal ${index + 1}`),
  lane: text(signal.lane || signal.section, 'unclassified'),
  weight: signal.weight ?? null,
  status: text(signal.sourceStatus || signal.status, 'unrated'),
  why: text(signal.whyItMatters || signal.why || signal.summary, 'Why this matters was not supplied.')
}));

const missingRecords = unique(briefings.flatMap(brief => brief.missingEvidence.map(record => `${brief.section}: ${record}`)).concat(array(feeds.policy?.nextActions)), 24);
const priorityPages = unique(briefings.flatMap(brief => brief.sourceLinks), 20);
const tomorrowWatchList = unique(briefings.flatMap(brief => brief.watchNext).concat([
  'Any filing, redaction explanation or changed document index in the disclosure lane.',
  'Any identity, wallet, payment or public-service rule moving from optional to mandatory.',
  'Any central-bank gold purchase, repatriation statement, custody dispute or audit disclosure.',
  'Any cloud, AI, payment, energy, identity or security infrastructure contract involving public systems.',
  'Any speculative claim that gains an original source, metadata, official record or credible counter-source.'
]), 24);

const topConclusions = briefings.slice(0, 8).map(brief => brief.solidConclusion);
const executiveSummary = briefings.length
  ? `Today’s strongest pattern is ${briefings[0].headline.toLowerCase()} The machine currently tracks ${briefings.length} structured evidence lanes, ${topSignals.length} active signals and ${missingRecords.length} named missing-record targets. The briefing separates established record-backed position, analysis, speculation, counter-analysis and downgrade conditions.`
  : 'No evidence-graded outcome briefings were available. No unverified claims were inserted.';

const brain = {
  schemaVersion: 3,
  generatedAt: updated,
  updated,
  date,
  title: 'Daily Brain Brief',
  publicTitle: 'Daily Control Brief',
  purpose: 'Daily intelligence product generated from Matrix Reprogrammed outcome, probability, signal, policy, reserve, disclosure and power feeds.',
  boundary: 'This is an evidence-graded briefing. Records, reporting, established facts, analysis, association, speculation, counter-analysis and missing evidence are separated. Association is not proof.',
  executiveSummary,
  summary: {
    briefingCount: briefings.length,
    conclusionCount: topConclusions.length,
    signalCount: topSignals.length,
    scenarioCount: scenarios.length,
    missingRecordCount: missingRecords.length,
    policyLaneCount: Array.isArray(feeds.policy.lanes) ? feeds.policy.lanes.length : 0,
    worldGoldTonnes: feeds.gold?.sourceBasis?.worldTotalTonnes || null,
    highestScenario: highestScenario ? { id: highestScenario.scenarioId || highestScenario.id, title: highestScenario.title, probability: highestScenario.computedProbability || highestScenario.currentProbability, band: highestScenario.band } : null,
    biggestMover: biggestMover ? { id: biggestMover.scenarioId || biggestMover.id, title: biggestMover.title, delta: biggestMover.probabilityDelta, probability: biggestMover.computedProbability || biggestMover.currentProbability } : null
  },
  topConclusions,
  briefings,
  sectionBriefings: briefings,
  topSignals,
  biggestProbabilityMovement: biggestMover,
  highestProbabilityScenario: highestScenario,
  missingRecords,
  priorityPages,
  tomorrowWatchList,
  watchNext: tomorrowWatchList,
  accessModel: {
    public: 'Full underlying public-source evidence and the public Daily Control Brief.',
    registered: 'Verified email delivery, archive, preferences and persistent Signal Board posting.',
    supporter_3: 'Curated weekly member layer and convenient downloads.',
    intelligence_6: 'Expanded daily context, watchlists, source-change monitoring and evidence notes.',
    research_pro_9: 'Advanced exports, research workflow tools, deep convergence review and dossier production.'
  },
  nextAction: 'Update affected pages, pull the named missing records, adjust probabilities only when records change, and preserve the fact/analysis/speculation boundary.'
};

fs.writeFileSync(path.join(dataDir, 'daily-brain-brief.json'), JSON.stringify(brain, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'daily-brain-brief.json'), JSON.stringify(brain, null, 2));

function briefCard(brief, index) {
  const links = brief.sourceLinks.length ? `<p class="source-list">${brief.sourceLinks.map(value => `<a href="${esc(value)}">Open related route</a>`).join(' · ')}</p>` : '';
  return `<article class="card redline"><span class="label">${esc(brief.id)} · ${esc(brief.section)} · ${esc(brief.confidence)}</span><h3>${index + 1}. ${esc(brief.headline)}</h3><p><strong>Trigger:</strong> ${esc(brief.trigger)}</p><p><strong>Primary record:</strong> ${esc(brief.primaryRecord)}</p><p><strong>Record status:</strong> ${esc(brief.recordStatus)}</p><details><summary>Open full structured analysis</summary><h4>Established facts</h4>${list(brief.establishedFacts)}<h4>Key entities</h4>${list(brief.keyEntities)}<p><strong>Money and authority:</strong> ${esc(brief.moneyAndAuthority)}</p><p><strong>Mechanism of power:</strong> ${esc(brief.mechanismOfPower)}</p><p><strong>Solid conclusion:</strong> ${esc(brief.solidConclusion)}</p><p><strong>Mission relevance:</strong> ${esc(brief.missionRelevance)}</p><p><strong>Elite-control relevance:</strong> ${esc(brief.eliteControlRelevance)}</p><p><strong>Global convergence assessment:</strong> ${esc(brief.globalConvergenceAssessment)}</p><div class="warning"><strong>Speculative conclusion:</strong> ${esc(brief.speculativeConclusion)}</div><p><strong>Counter-analysis:</strong> ${esc(brief.counterAnalysis)}</p><h4>Missing evidence</h4>${list(brief.missingEvidence)}<h4>Watch next</h4>${list(brief.watchNext)}<p><strong>Evidence basis:</strong> ${esc(brief.evidenceBasis)}</p><p><strong>Access tier:</strong> ${esc(brief.accessTier)}</p>${links}</details></article>`;
}

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Daily Brain Brief | Matrix Reprogrammed</title><meta name="description" content="Structured daily intelligence brief separating records, facts, analysis, speculation, counter-analysis, missing evidence and watch conditions."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="reader-experience.css"></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav class="nav"><a href="matrix-brain.html">Matrix Brain</a><a href="outcome-briefings.html">Outcomes</a><a href="probability-snapshot.html">Snapshot</a><a href="record-intake-queue.html">Records</a><a href="forum.html">Signal Board</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Daily Intelligence Product · ${esc(date)}</div><h1>DAILY BRAIN BRIEF.</h1><p class="lead">${esc(executiveSummary)}</p><div class="cta-row"><a class="btn" href="data/daily-brain-brief.json">Open JSON</a><a class="btn alt" href="downloads/daily-brain-brief.md">Download Markdown</a><a class="btn alt" href="forum.html">Persistent Signal Board</a></div></section><section class="section wrap split"><div class="terminal">DAILY BRAIN BRIEF\n&gt; generated: ${esc(updated)}\n&gt; structured briefings: ${briefings.length}\n&gt; active signals: ${topSignals.length}\n&gt; scenarios: ${scenarios.length}\n&gt; missing-record targets: ${missingRecords.length}</div><aside class="card redline"><h2>Evidence boundary</h2><p>${esc(brain.boundary)}</p></aside></section><section class="section wrap"><h2>Structured intelligence lanes</h2><div class="grid">${briefings.map(briefCard).join('') || '<article class="card redline"><h3>No verified briefing bundle</h3><p>No unverified claims were inserted.</p></article>'}</div></section><section class="section wrap"><h2>Probability movement</h2><div class="grid"><article class="card redline"><span class="label">HIGHEST SCENARIO</span><h3>${esc(highestScenario?.title || 'No scenario loaded')}</h3><p><strong>Probability:</strong> ${esc(highestScenario?.computedProbability || highestScenario?.currentProbability || 'unknown')}%</p><p><strong>Band:</strong> ${esc(highestScenario?.band || 'unknown')}</p></article><article class="card redline"><span class="label">BIGGEST MOVER</span><h3>${esc(biggestMover?.title || 'No movement loaded')}</h3><p><strong>Delta:</strong> ${esc(biggestMover?.probabilityDelta || 0)}</p><p><strong>Probability:</strong> ${esc(biggestMover?.computedProbability || biggestMover?.currentProbability || 'unknown')}%</p></article></div></section><section class="section wrap"><h2>Signal board</h2>${list(topSignals.map(signal => `${signal.title} — ${signal.lane}; ${signal.status}. ${signal.why}`))}</section><section class="section wrap"><h2>Records that matter most</h2>${list(missingRecords)}</section><section class="section wrap"><h2>Watch next</h2>${list(tomorrowWatchList)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — records, analysis, speculation, counter-analysis and missing evidence kept separate.</p></footer></div><script src="matrix.js"></script><script src="living-pulse.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'daily-brain-brief.html'), html);

const md = [
  '# Daily Brain Brief',
  '',
  `Generated: ${updated}`,
  '',
  executiveSummary,
  '',
  `Evidence boundary: ${brain.boundary}`,
  '',
  ...briefings.flatMap((brief, index) => [
    `## ${index + 1}. ${brief.headline}`,
    '',
    `- ID: ${brief.id}`,
    `- Section: ${brief.section}`,
    `- Confidence: ${brief.confidence}`,
    `- Trigger: ${brief.trigger}`,
    `- Primary record: ${brief.primaryRecord}`,
    `- Record status: ${brief.recordStatus}`,
    '',
    '### Established facts',
    mdList(brief.establishedFacts),
    '',
    '### Key entities',
    mdList(brief.keyEntities),
    '',
    `**Money and authority:** ${brief.moneyAndAuthority}`,
    '',
    `**Mechanism of power:** ${brief.mechanismOfPower}`,
    '',
    `**Solid conclusion:** ${brief.solidConclusion}`,
    '',
    `**Mission relevance:** ${brief.missionRelevance}`,
    '',
    `**Elite-control relevance:** ${brief.eliteControlRelevance}`,
    '',
    `**Global convergence assessment:** ${brief.globalConvergenceAssessment}`,
    '',
    `**Speculative conclusion:** ${brief.speculativeConclusion}`,
    '',
    `**Counter-analysis:** ${brief.counterAnalysis}`,
    '',
    '### Missing evidence',
    mdList(brief.missingEvidence),
    '',
    '### Watch next',
    mdList(brief.watchNext),
    ''
  ]),
  '## Signal board',
  mdList(topSignals.map(signal => `${signal.title} — ${signal.lane}; ${signal.status}. ${signal.why}`)),
  '',
  '## Records that matter most',
  mdList(missingRecords),
  '',
  '## Watch next',
  mdList(tomorrowWatchList),
  ''
].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'daily-brain-brief.md'), md);

const matrixPath = path.join(root, 'matrix-brain.html');
if (fs.existsSync(matrixPath)) {
  let page = fs.readFileSync(matrixPath, 'utf8');
  if (!page.includes('daily-brain-brief.html')) {
    const panel = `<section class="section wrap"><h2>What The Machine Concludes Today</h2><div class="grid"><article class="card redline"><span class="label">DAILY BRAIN BRIEF</span><h3>Read the structured daily conclusions.</h3><p>Records, facts, mechanism, money and authority, solid conclusion, speculation, counter-analysis, missing evidence and watch conditions.</p><a class="btn" href="daily-brain-brief.html">Open Daily Brain Brief</a><a class="btn alt" href="data/daily-brain-brief.json">Open JSON</a></article><article class="card redline"><span class="label">PERSISTENT SIGNAL BOARD</span><h3>Submit source leads through a verified free account.</h3><p>Signal Board posts are stored in Cloudflare D1 and survive refreshes, devices and deployments.</p><a class="btn alt" href="forum.html">Open Signal Board</a></article></div></section>`;
    page = page.replace('<section class="section wrap"><h2>Machine Pulse</h2>', panel + '<section class="section wrap"><h2>Machine Pulse</h2>');
  }
  if (!page.includes('living-pulse.js')) page = page.replace('</body>', '<script src="living-pulse.js"></script></body>');
  fs.writeFileSync(matrixPath, page);
}

try { require('./build-living-control-interface.js'); } catch (error) { console.warn(`Living control interface skipped: ${error.message}`); }
console.log(`Daily brain brief generated: ${briefings.length} structured briefings, ${topSignals.length} signals, ${missingRecords.length} missing-record targets.`);
