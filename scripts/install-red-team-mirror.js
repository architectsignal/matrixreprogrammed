'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 2400) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const unique = values => [...new Set(array(values).map(value => clean(value)).filter(Boolean))];

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function copyToOutput(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.existsSync(outputRoot)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const chainLedger = readJson('data/power-supply-chain.json', { chains: [] });
const halfLifeLedger = readJson('data/evidence-half-life.json', { entries: [] });
const diffLedger = readJson('data/power-diff.json', { entries: [] });
const contractsLedger = readJson('data/public-consequence-contracts.json', { contracts: [] });
const chainsByRecord = new Map(array(chainLedger.chains).map(item => [clean(item.sourceRecordId, 220), item]));
const halfLifeByRecord = new Map(array(halfLifeLedger.entries).map(item => [clean(item.sourceRecordId, 220), item]));
const diffByRecord = new Map(array(diffLedger.entries).map(item => [clean(item.sourceRecordId, 220), item]));
const contractsById = new Map(array(contractsLedger.contracts).map(item => [clean(item.id, 220), item]));

function supportingPoints(record, chain) {
  const points = [];
  if (record.source?.url) points.push({
    type: 'source-record',
    statement: `A source record is attached: ${clean(record.source.label || 'public source', 260)}.`,
    classification: clean(record.source.classification || 'public-source-lead', 160),
    establishes: 'The cited source exists as a route for verification.',
    doesNotEstablish: 'The source link alone does not prove causation, responsibility, benefit or wrongdoing.'
  });
  if (record.consequenceSummary) points.push({
    type: 'documented-or-lead-summary',
    statement: clean(record.consequenceSummary, 1200),
    classification: 'record-summary-under-review',
    establishes: 'This is the consequence or public issue currently being tested.',
    doesNotEstablish: 'It does not by itself identify the responsible authority or complete causal chain.'
  });
  for (const stage of array(chain?.stages).filter(item => item.state !== 'unresolved').slice(0, 6)) {
    points.push({
      type: `chain-${clean(stage.id, 80)}`,
      statement: clean(stage.value, 1200),
      classification: clean(stage.evidenceClassification || 'public-source-lead', 160),
      establishes: `The current record contains a review-stage entry for ${clean(stage.label, 180)}.`,
      doesNotEstablish: 'A review-stage chain entry is not a final finding and must remain tied to its source and role boundary.'
    });
  }
  return points.slice(0, 8);
}

function challengePoints(record, chain, halfLife, diff, contract) {
  const unresolvedStages = array(chain?.stages).filter(item => item.state === 'unresolved');
  const points = [];
  if (unresolvedStages.length) points.push({
    type: 'missing-chain-stages',
    statement: `${unresolvedStages.length} responsibility-chain stage${unresolvedStages.length === 1 ? '' : 's'} remain unresolved: ${unresolvedStages.slice(0, 6).map(item => clean(item.label, 180)).join(', ')}.`,
    classification: 'evidence-gap',
    significance: 'The current record cannot support a complete responsibility or causation claim while these roles remain unresolved.'
  });
  if (halfLife?.recallNotice) points.push({
    type: 'freshness-challenge',
    statement: clean(halfLife.recallNotice, 1400),
    classification: 'reverification-required',
    significance: 'Current applicability requires review before the record is relied upon as current.'
  });
  if (diff?.status === 'baseline-established') points.push({
    type: 'history-limit',
    statement: 'Power Diff has established a baseline only; no historical change has yet been proven.',
    classification: 'baseline-boundary',
    significance: 'The current snapshot cannot support a claim about how the record changed over time.'
  });
  for (const falsifier of unique(contract?.falsifiers).slice(0, 6)) points.push({
    type: 'falsifier',
    statement: falsifier,
    classification: 'explicit-falsifier',
    significance: 'If supported by accepted evidence, this would weaken, narrow or overturn the proposed interpretation.'
  });
  if (!points.length) points.push({
    type: 'counter-evidence-not-attached',
    statement: 'No accepted counter-evidence or structured falsifier is attached to this static record.',
    classification: 'absence-of-attached-counter-evidence',
    significance: 'This is not proof that no counter-evidence exists. Human review must actively search for it.'
  });
  return points.slice(0, 10);
}

const mirrors = array(reverseIndex.records).map(record => {
  const id = clean(record.id, 220);
  const chain = chainsByRecord.get(id);
  const halfLife = halfLifeByRecord.get(id);
  const diff = diffByRecord.get(id);
  const contract = contractsById.get(id);
  const support = supportingPoints(record, chain);
  const challenge = challengePoints(record, chain, halfLife, diff, contract);
  const unanswered = unique(record.unansweredQuestions).slice(0, 10);
  const falsifiers = unique(contract?.falsifiers).slice(0, 8);
  return {
    schemaVersion: 1,
    id: `red-team-${id}`,
    sourceRecordId: id,
    title: clean(record.title, 500),
    lane: clean(record.lane || 'public-accountability', 160),
    laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
    propositionUnderTest: clean(record.consequenceSummary || record.title, 1400),
    supportingCase: {
      status: support.length ? 'available-evidence-only' : 'no-supporting-evidence-attached',
      points: support
    },
    challengingCase: {
      status: challenge.some(item => item.type !== 'counter-evidence-not-attached') ? 'structured-challenges-present' : 'counter-evidence-not-attached',
      points: challenge
    },
    strongestAlternativeExplanation: 'The observed consequence may have multiple causes or may not be attributable to the action or actor suggested by the current route. No specific alternative is adopted without evidence.',
    unansweredQuestions: unanswered,
    falsifiers,
    whatWouldChangeTheAssessment: unique([
      ...falsifiers,
      ...unanswered,
      'A primary record resolving the authorising body, legal basis, funding route and implementation responsibility.',
      'Accepted counter-evidence showing that the proposed decision or money path did not produce the observed consequence.',
      'Newer primary evidence that confirms, narrows, contradicts or supersedes the current record.'
    ]).slice(0, 12),
    balanceStatus: 'not-scored-pending-human-review',
    publicJudgement: 'none-generated',
    accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
    powerSupplyChainRoute: clean(record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${id}`, 900),
    evidenceHalfLifeRoute: clean(record.evidenceHalfLifeRoute || `evidence-half-life.html#half-life-${id}`, 900),
    powerDiffRoute: clean(record.powerDiffRoute || `power-diff.html#diff-${id}`, 900),
    source: record.source || {},
    evidenceBoundary: 'Red-Team Mirror exposes the strongest support and challenge available in the attached record. It must not invent counter-evidence, force false balance or publish an automated verdict. Named human review remains required.'
  };
});

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Red-Team Mirror Ledger',
  proposition: 'Every significant accountability proposition should display the strongest attached support, the strongest genuine challenge, explicit falsifiers and what evidence would change the assessment.',
  boundary: 'The system must not invent counter-evidence or manufacture false balance. Absence of an attached challenge is not proof that no challenge exists. No automated public verdict is produced.',
  count: mirrors.length,
  mirrors
};
writeEverywhere('data/red-team-mirror.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Red-Team Mirror | Matrix Reprogrammed</title><meta name="description" content="See the strongest attached support, strongest genuine challenge, explicit falsifiers and evidence that would change each accountability assessment."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="red-team-mirror.css"></head><body class="red-team-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="red-team-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="power-supply-chain.html">Power Supply Chain</a><a href="power-diff.html">Power Diff</a></nav></header><main><section class="red-team-hero wrap"><p class="red-team-kicker">The machine must challenge itself</p><h1>RED-TEAM<br>MIRROR.</h1><p>See what supports an accountability proposition, what genuinely challenges it, which assumptions remain weak and exactly what evidence would change the assessment.</p><div class="red-team-rule"><strong>No false balance:</strong> ${esc(ledger.boundary)}</div><form data-red-team-search class="red-team-search"><label class="sr-only" for="red-team-query">Search Red-Team Mirror records</label><input id="red-team-query" type="search" placeholder="Search a proposition, institution, challenge or falsifier…"><button type="submit">Open mirror</button></form><p data-red-team-status class="red-team-status" aria-live="polite">Loading evidence-bounded mirrors…</p></section><section data-red-team-results class="red-team-results wrap"></section><section class="red-team-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — every conclusion must survive a serious attempt to disprove it.</p></footer></div><script src="matrix.js"></script><script src="red-team-mirror.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('red-team-mirror.html', page);
copyToOutput('red-team-mirror.js');
copyToOutput('red-team-mirror.css');

const updatedIndex = {
  ...reverseIndex,
  records: array(reverseIndex.records).map(record => ({ ...record, redTeamMirrorRoute: `red-team-mirror.html#red-team-${clean(record.id, 220)}` }))
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

for (const relative of ['data/power-supply-chain.json','data/evidence-half-life.json','data/power-diff.json']) {
  const payload = readJson(relative, {});
  if (Array.isArray(payload.chains)) payload.chains = payload.chains.map(item => ({ ...item, redTeamMirrorRoute: `red-team-mirror.html#red-team-${clean(item.sourceRecordId, 220)}` }));
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(item => ({ ...item, redTeamMirrorRoute: `red-team-mirror.html#red-team-${clean(item.sourceRecordId, 220)}` }));
  writeEverywhere(relative, `${JSON.stringify(payload, null, 2)}\n`);
}

const report = {
  ok: mirrors.length > 0,
  generatedAt,
  mirrorCount: mirrors.length,
  noAutomatedVerdicts: mirrors.every(item => item.publicJudgement === 'none-generated' && item.balanceStatus === 'not-scored-pending-human-review'),
  counterEvidenceNotInvented: true,
  boundary: ledger.boundary
};
writeEverywhere('downloads/red-team-mirror-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok || !report.noAutomatedVerdicts) throw new Error('Red-Team Mirror could not build safely.');
console.log(`Red-Team Mirror installed with ${mirrors.length} evidence-bounded records and no automated verdicts.`);
