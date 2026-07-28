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
const slug = value => clean(value, 300).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'record';
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

function missionGuidance(stageId, title) {
  const subject = clean(title, 300);
  const byStage = {
    proposal: {
      recordNeeded: `Primary record identifying who first proposed or formally initiated “${subject}”.`,
      custodian: 'Originating department, committee, regulator, executive office, adviser archive or official meeting-record custodian—not yet verified.',
      terms: ['proposal', 'concept note', 'cabinet paper', 'committee minutes', 'policy memorandum', 'originating instruction']
    },
    drafting: {
      recordNeeded: `Drafts, instructions, consultation papers or technical specifications showing who designed the mechanism behind “${subject}”.`,
      custodian: 'Drafting department, legal office, regulator, contractor, consultant or records office—not yet verified.',
      terms: ['draft', 'technical specification', 'legal advice', 'consultation response', 'statement of work', 'version history']
    },
    promotion: {
      recordNeeded: `Lobbying, consultation, meeting, campaign or advocacy records showing who promoted adoption of “${subject}”.`,
      custodian: 'Lobbying register, ministerial diary, consultation office, parliamentary register, foundation archive or corporate disclosure system—not yet verified.',
      terms: ['lobbying', 'meeting diary', 'consultation', 'advocacy', 'donation', 'briefing note']
    },
    authorization: {
      recordNeeded: `The signed decision, vote, order, delegated-authority instrument, contract approval or legal basis authorising “${subject}”.`,
      custodian: 'Authorising body, clerk, regulator, procurement authority, official gazette or legal records office—not yet verified.',
      terms: ['signed order', 'vote', 'delegated authority', 'approval', 'legal basis', 'resolution']
    },
    funding: {
      recordNeeded: `Contracts, grants, subsidies, budget lines, invoices or ownership records funding or financially benefiting from “${subject}”.`,
      custodian: 'Treasury, procurement portal, grant registry, contracting authority, corporate registry or audited-accounts custodian—not yet verified.',
      terms: ['contract award', 'procurement', 'grant', 'budget line', 'invoice', 'beneficial ownership']
    },
    implementation: {
      recordNeeded: `Implementation plans, operating instructions, delivery reports or contractor records showing who carried “${subject}” into effect.`,
      custodian: 'Implementing agency, regulator, local authority, contractor, programme office or operational records custodian—not yet verified.',
      terms: ['implementation plan', 'operating instruction', 'delivery report', 'contractor', 'milestone', 'performance report']
    },
    benefit: {
      recordNeeded: `Records measuring who gained, paid, lost access, absorbed risk or received institutional advantage from “${subject}”.`,
      custodian: 'Procurement, subsidy, tax, ownership, audited accounts, impact-assessment or service-delivery records custodian—not yet verified.',
      terms: ['beneficiary', 'cost impact', 'risk transfer', 'revenue', 'ownership change', 'impact assessment']
    },
    outcome: {
      recordNeeded: `Measured outcome data showing what happened after “${subject}” and whether the stated public benefit occurred.`,
      custodian: 'Programme evaluator, statistical authority, regulator, audit office, implementing body or independent evaluation custodian—not yet verified.',
      terms: ['outcome report', 'evaluation', 'audit', 'performance indicator', 'before and after', 'public benefit']
    }
  };
  return byStage[stageId] || {
    recordNeeded: `Primary or independently verified record needed to resolve the evidence gap concerning “${subject}”.`,
    custodian: 'Relevant authority, institution, regulator, court, corporate registry or records office—not yet verified.',
    terms: ['primary record', 'official filing', 'minutes', 'decision', 'contract', 'correspondence']
  };
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const chainLedger = readJson('data/power-supply-chain.json', { chains: [] });
const answerLedger = readJson('data/public-answer-clocks.json', { clocks: [] });
const chainById = new Map(array(chainLedger.chains).map(item => [clean(item.sourceRecordId, 220), item]));
const answerById = new Map(array(answerLedger.clocks).map(item => [clean(item.sourceRecordId, 220), item]));
const missions = [];

for (const record of array(reverseIndex.records)) {
  const recordId = clean(record.id, 220);
  const chain = chainById.get(recordId);
  const answerClock = answerById.get(recordId);
  const unresolved = array(chain?.stages).filter(stage => stage.state === 'unresolved');
  for (const stage of unresolved) {
    const guide = missionGuidance(clean(stage.id, 80), record.title);
    missions.push({
      schemaVersion: 1,
      id: `missing-${recordId}-${slug(stage.id || stage.label)}`,
      sourceRecordId: recordId,
      title: clean(record.title, 500),
      lane: clean(record.lane || 'public-accountability', 160),
      laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
      gapType: 'unresolved-power-supply-chain-stage',
      gapLabel: clean(stage.label, 220),
      question: `Who or what record can resolve the ${clean(stage.label, 220).toLowerCase()} stage for “${clean(record.title, 500)}”?`,
      recordNeeded: guide.recordNeeded,
      likelyCustodian: guide.custodian,
      custodianStatus: 'hypothesis-requires-verification',
      jurisdiction: 'unresolved-research-required',
      searchTerms: unique([clean(record.title, 300), ...guide.terms]).slice(0, 10),
      requestPreparation: [
        'Confirm the responsible jurisdiction and applicable access-to-records law or disclosure system.',
        'Identify the exact record series, date range, decision body and likely custodian before sending a request.',
        'Ask for records, not conclusions, and preserve the original response and metadata.',
        'Redact personal information before public submission and do not obtain records unlawfully.'
      ],
      status: 'open-unassigned',
      assignment: null,
      submissionsAccepted: ['primary record', 'official filing', 'verified archive copy', 'custodian confirmation', 'lawful records response', 'correction or contrary record'],
      accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
      powerSupplyChainRoute: clean(record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${recordId}`, 900),
      redTeamMirrorRoute: clean(record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${recordId}`, 900),
      publicAnswerClockRoute: clean(record.publicAnswerClockRoute || `public-answer-clock.html#answer-clock-${recordId}`, 900),
      submissionRoute: `contact-the-machine.html?type=evidence&mission=${encodeURIComponent(`missing-${recordId}-${slug(stage.id || stage.label)}`)}`,
      evidenceBoundary: 'This mission identifies a missing record and a custodian hypothesis. It does not establish that the record exists, that the suggested custodian holds it or that any person or institution acted improperly.'
    });
  }
  const existingQuestions = new Set(unresolved.map(stage => clean(stage.label, 220).toLowerCase()));
  for (const [index, question] of array(record.unansweredQuestions).slice(0, 3).entries()) {
    if ([...existingQuestions].some(label => clean(question).toLowerCase().includes(label))) continue;
    const guide = missionGuidance('', record.title);
    missions.push({
      schemaVersion: 1,
      id: `missing-${recordId}-question-${index + 1}`,
      sourceRecordId: recordId,
      title: clean(record.title, 500),
      lane: clean(record.lane || 'public-accountability', 160),
      laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
      gapType: 'unanswered-accountability-question',
      gapLabel: 'Unanswered question',
      question: clean(question, 1000),
      recordNeeded: guide.recordNeeded,
      likelyCustodian: guide.custodian,
      custodianStatus: 'hypothesis-requires-verification',
      jurisdiction: 'unresolved-research-required',
      searchTerms: unique([clean(record.title, 300), ...guide.terms]).slice(0, 10),
      requestPreparation: [
        'Break the question into the smallest record or factual proposition that could resolve it.',
        'Confirm the jurisdiction, custodian, date range and lawful request route.',
        'Preserve responses, denials, exemptions, appeal routes and document metadata.',
        'Submit contrary records and corrections as readily as supporting material.'
      ],
      status: 'open-unassigned',
      assignment: null,
      submissionsAccepted: ['primary record', 'official response', 'verified archive copy', 'contrary evidence', 'correction'],
      accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
      powerSupplyChainRoute: clean(record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${recordId}`, 900),
      redTeamMirrorRoute: clean(record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${recordId}`, 900),
      publicAnswerClockRoute: clean(answerClock?.id ? `public-answer-clock.html#${answerClock.id}` : record.publicAnswerClockRoute || 'public-answer-clock.html', 900),
      submissionRoute: `contact-the-machine.html?type=evidence&mission=${encodeURIComponent(`missing-${recordId}-question-${index + 1}`)}`,
      evidenceBoundary: 'This mission translates an unanswered question into a research task. The question is not an allegation, and failure to find a record does not prove concealment or wrongdoing.'
    });
  }
}

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Missing Record Missions',
  proposition: 'Every evidence gap should become a specific, lawful and verifiable research task rather than unstructured speculation.',
  boundary: 'Custodians and jurisdictions remain hypotheses until verified. Failure to locate or obtain a record does not prove concealment, destruction or wrongdoing.',
  count: missions.length,
  openCount: missions.filter(item => item.status === 'open-unassigned').length,
  missions
};
writeEverywhere('data/missing-record-missions.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Missing Record Missions | Matrix Reprogrammed</title><meta name="description" content="Turn unresolved authority, money, implementation and outcome gaps into specific lawful research missions with record needs, custodian hypotheses and search terms."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="missing-record-missions.css"></head><body class="missing-missions-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="missing-missions-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="power-supply-chain.html">Power Supply Chain</a><a href="public-answer-clock.html">Answer Clock</a></nav></header><main><section class="missing-missions-hero wrap"><p class="missing-missions-kicker">Turn gaps into lawful research tasks</p><h1>MISSING RECORD<br>MISSIONS.</h1><p>See the exact record needed, the unverified custodian hypothesis, the jurisdiction gap, suggested search terms and the evidence boundary.</p><div class="missing-missions-rule"><strong>No concealment assumption:</strong> ${esc(ledger.boundary)}</div><form data-missing-missions-search class="missing-missions-search"><label class="sr-only" for="missing-missions-query">Search missing record missions</label><input id="missing-missions-query" type="search" placeholder="Search a record, stage, institution or unanswered question…"><select data-missing-missions-filter aria-label="Filter mission type"><option value="all">All mission types</option><option value="unresolved-power-supply-chain-stage">Power-chain stages</option><option value="unanswered-accountability-question">Unanswered questions</option></select><button type="submit">Find missions</button></form><p data-missing-missions-status class="missing-missions-status" aria-live="polite">Loading structured evidence gaps…</p></section><section data-missing-missions-results class="missing-missions-results wrap"></section><section class="missing-missions-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — solve the missing record, not the story you hope it tells.</p></footer></div><script src="matrix.js"></script><script src="missing-record-missions.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('missing-record-missions.html', page);
copyToOutput('missing-record-missions.js');
copyToOutput('missing-record-missions.css');

const missionRouteByRecord = new Map();
for (const mission of missions) if (!missionRouteByRecord.has(mission.sourceRecordId)) missionRouteByRecord.set(mission.sourceRecordId, `missing-record-missions.html#${mission.id}`);
const updatedIndex = {
  ...reverseIndex,
  records: array(reverseIndex.records).map(record => ({ ...record, missingRecordMissionsRoute: missionRouteByRecord.get(clean(record.id, 220)) || 'missing-record-missions.html' }))
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

for (const relative of ['data/power-supply-chain.json','data/evidence-half-life.json','data/power-diff.json','data/red-team-mirror.json','data/public-answer-clocks.json']) {
  const payload = readJson(relative, {});
  const routeFor = item => missionRouteByRecord.get(clean(item.sourceRecordId, 220)) || 'missing-record-missions.html';
  if (Array.isArray(payload.chains)) payload.chains = payload.chains.map(item => ({ ...item, missingRecordMissionsRoute: routeFor(item) }));
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(item => item.status === 'record-ended-or-removed' ? item : ({ ...item, missingRecordMissionsRoute: routeFor(item) }));
  if (Array.isArray(payload.mirrors)) payload.mirrors = payload.mirrors.map(item => ({ ...item, missingRecordMissionsRoute: routeFor(item) }));
  if (Array.isArray(payload.clocks)) payload.clocks = payload.clocks.map(item => ({ ...item, missingRecordMissionsRoute: routeFor(item) }));
  writeEverywhere(relative, `${JSON.stringify(payload, null, 2)}\n`);
}

const report = {
  ok: missions.length > 0,
  generatedAt,
  missionCount: missions.length,
  openCount: ledger.openCount,
  custodianHypothesesExplicit: missions.every(item => item.custodianStatus === 'hypothesis-requires-verification'),
  jurisdictionsUnresolved: missions.every(item => item.jurisdiction === 'unresolved-research-required'),
  boundary: ledger.boundary
};
writeEverywhere('downloads/missing-record-missions-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok || !report.custodianHypothesesExplicit) throw new Error('Missing Record Missions could not build safely.');
console.log(`Missing Record Missions installed with ${missions.length} structured research tasks.`);
