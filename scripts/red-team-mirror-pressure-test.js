'use strict';

const fs = require('fs');
const path = require('path');
require('./install-red-team-mirror.js');

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

const ledger = json('data/red-team-mirror.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chains = json('data/power-supply-chain.json');
const halfLife = json('data/evidence-half-life.json');
const powerDiff = json('data/power-diff.json');
const page = read('red-team-mirror.html');
const client = read('red-team-mirror.js');
const css = read('red-team-mirror.css');

if (!Array.isArray(ledger.mirrors) || ledger.mirrors.length < 1) fail('Red-Team Mirror ledger has no mirrors');
if (!String(ledger.boundary || '').includes('must not invent counter-evidence or manufacture false balance')) fail('Red-Team Mirror lacks the no-false-balance boundary');
if (ledger.count !== ledger.mirrors.length) fail('Red-Team Mirror count is inconsistent');

for (const mirror of ledger.mirrors || []) {
  if (!mirror.id || !mirror.sourceRecordId || !mirror.title || !mirror.propositionUnderTest) fail('Red-Team Mirror record is missing identity or proposition');
  if (mirror.balanceStatus !== 'not-scored-pending-human-review') fail(`${mirror.id || 'mirror'} has an automated balance score`);
  if (mirror.publicJudgement !== 'none-generated') fail(`${mirror.id || 'mirror'} generated a public judgement`);
  if (!Array.isArray(mirror.supportingCase?.points)) fail(`${mirror.id || 'mirror'} has no structured supporting case`);
  if (!Array.isArray(mirror.challengingCase?.points) || !mirror.challengingCase.points.length) fail(`${mirror.id || 'mirror'} has no structured challenge boundary`);
  for (const point of mirror.supportingCase?.points || []) {
    if (!point.statement || !point.classification || !point.establishes || !point.doesNotEstablish) fail(`${mirror.id || 'mirror'} has an incomplete support point`);
  }
  for (const point of mirror.challengingCase?.points || []) {
    if (!point.statement || !point.classification || !point.significance) fail(`${mirror.id || 'mirror'} has an incomplete challenge point`);
  }
  if (mirror.challengingCase?.status === 'counter-evidence-not-attached' && !mirror.challengingCase.points.some(point => String(point.statement).includes('No accepted counter-evidence'))) fail(`${mirror.id || 'mirror'} hides the absence of counter-evidence`);
  if (!String(mirror.strongestAlternativeExplanation || '').includes('No specific alternative is adopted without evidence')) fail(`${mirror.id || 'mirror'} invents or adopts an unsupported alternative`);
  if (!String(mirror.evidenceBoundary || '').includes('must not invent counter-evidence')) fail(`${mirror.id || 'mirror'} lacks the mirror evidence boundary`);
}

for (const marker of ['RED-TEAM', 'data-red-team-search', 'data-red-team-results', 'No false balance']) {
  if (!page.includes(marker)) fail(`Red-Team Mirror page missing ${marker}`);
}
for (const marker of ['data/red-team-mirror.json', 'No counter-case has been invented', 'Submit counter-evidence']) {
  if (!client.includes(marker)) fail(`Red-Team Mirror client missing ${marker}`);
}
if (!css.includes('.red-team-challenge') || !css.includes('@media')) fail('Red-Team Mirror CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.redTeamMirrorRoute || '').startsWith('red-team-mirror.html#red-team-'))) fail('Reverse Accountability records are not linked to Red-Team Mirror');
if (!(chains.chains || []).every(item => String(item.redTeamMirrorRoute || '').startsWith('red-team-mirror.html#red-team-'))) fail('Power Supply Chains are not linked to Red-Team Mirror');
if (!(halfLife.entries || []).every(item => String(item.redTeamMirrorRoute || '').startsWith('red-team-mirror.html#red-team-'))) fail('Evidence Half-Life records are not linked to Red-Team Mirror');
if (!(powerDiff.entries || []).every(item => String(item.redTeamMirrorRoute || '').startsWith('red-team-mirror.html#red-team-'))) fail('Power Diff records are not linked to Red-Team Mirror');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Red-Team Mirror client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Red-Team Mirror pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'red-team-mirror-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  mirrorCount: ledger.mirrors.length,
  noAutomatedVerdicts: true,
  noInventedCounterEvidence: true,
  noForcedFalseBalance: true
}, null, 2) + '\n');
console.log(`Red-Team Mirror pressure test passed with ${ledger.mirrors.length} records and no automated verdicts.`);
