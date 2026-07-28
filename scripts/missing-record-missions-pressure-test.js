'use strict';

const fs = require('fs');
const path = require('path');
require('./install-missing-record-missions.js');

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);
const read = relative => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { fail(`Missing ${relative}`); return ''; }
  return fs.readFileSync(file, 'utf8');
};
const json = relative => {
  try { return JSON.parse(read(relative)); } catch (error) { fail(`Invalid JSON ${relative}: ${error.message}`); return {}; }
};

const ledger = json('data/missing-record-missions.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chains = json('data/power-supply-chain.json');
const halfLife = json('data/evidence-half-life.json');
const powerDiff = json('data/power-diff.json');
const redTeam = json('data/red-team-mirror.json');
const answerClocks = json('data/public-answer-clocks.json');
const page = read('missing-record-missions.html');
const client = read('missing-record-missions.js');
const css = read('missing-record-missions.css');

if (!Array.isArray(ledger.missions) || ledger.missions.length < 1) fail('Missing Record Missions ledger has no missions');
if (!String(ledger.boundary || '').includes('Custodians and jurisdictions remain hypotheses until verified')) fail('Missing Record Missions lacks custodian-hypothesis boundary');
if (!String(ledger.boundary || '').includes('does not prove concealment')) fail('Missing Record Missions lacks concealment boundary');

for (const mission of ledger.missions || []) {
  if (!mission.id || !mission.sourceRecordId || !mission.title || !mission.question || !mission.recordNeeded) fail('Missing Record Mission is missing identity or task definition');
  if (mission.custodianStatus !== 'hypothesis-requires-verification') fail(`${mission.id || 'mission'} presents custodian as verified`);
  if (mission.jurisdiction !== 'unresolved-research-required') fail(`${mission.id || 'mission'} presents jurisdiction as resolved`);
  if (!String(mission.likelyCustodian || '').includes('not yet verified')) fail(`${mission.id || 'mission'} hides custodian uncertainty`);
  if (!Array.isArray(mission.searchTerms) || mission.searchTerms.length < 2) fail(`${mission.id || 'mission'} lacks useful search terms`);
  if (!Array.isArray(mission.requestPreparation) || mission.requestPreparation.length < 3) fail(`${mission.id || 'mission'} lacks request preparation steps`);
  if (!String(mission.evidenceBoundary || '').includes('does not establish') && !String(mission.evidenceBoundary || '').includes('not an allegation')) fail(`${mission.id || 'mission'} lacks evidence boundary`);
  if (!String(mission.submissionRoute || '').includes('mission=')) fail(`${mission.id || 'mission'} submission route does not preserve mission id`);
}

for (const marker of ['MISSING RECORD', 'data-missing-missions-search', 'data-missing-missions-filter', 'No concealment assumption']) {
  if (!page.includes(marker)) fail(`Missing Record Missions page missing ${marker}`);
}
for (const marker of ['data/missing-record-missions.json', 'No custodian or concealment claim has been invented', 'Submit a record']) {
  if (!client.includes(marker)) fail(`Missing Record Missions client missing ${marker}`);
}
if (!css.includes('.missing-mission-grid') || !css.includes('@media')) fail('Missing Record Missions CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html'))) fail('Reverse Accountability records are not linked to Missing Record Missions');
if (!(chains.chains || []).every(item => String(item.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html'))) fail('Power Supply Chains are not linked to Missing Record Missions');
if (!(halfLife.entries || []).every(item => String(item.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html'))) fail('Evidence Half-Life records are not linked to Missing Record Missions');
for (const entry of powerDiff.entries || []) {
  if (entry.status === 'record-ended-or-removed' && entry.missingRecordMissionsRoute) fail(`${entry.id || 'Power Diff entry'} historical-only record has a current mission route`);
  if (entry.status !== 'record-ended-or-removed' && !String(entry.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html')) fail(`${entry.id || 'Power Diff entry'} current record lacks Missing Record Mission route`);
}
if (!(redTeam.mirrors || []).every(item => String(item.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html'))) fail('Red-Team Mirrors are not linked to Missing Record Missions');
if (!(answerClocks.clocks || []).every(item => String(item.missingRecordMissionsRoute || '').startsWith('missing-record-missions.html'))) fail('Public Answer Clocks are not linked to Missing Record Missions');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Missing Record Missions client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Missing Record Missions pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'missing-record-missions-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  missionCount: ledger.missions.length,
  custodianHypothesesExplicit: true,
  jurisdictionsUnresolved: true,
  concealmentNotInferred: true,
  lawfulRequestPreparationRequired: true
}, null, 2) + '\n');
console.log(`Missing Record Missions pressure test passed with ${ledger.missions.length} structured research tasks.`);
