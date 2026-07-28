'use strict';

const fs = require('fs');
const path = require('path');
require('./install-power-diff.js');

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

const ledger = json('data/power-diff.json');
const current = json('data/power-diff-current.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chains = json('data/power-supply-chain.json');
const halfLife = json('data/evidence-half-life.json');
const page = read('power-diff.html');
const client = read('power-diff.js');
const css = read('power-diff.css');
const allowedStatuses = new Set(['baseline-established','no-material-change','material-diff','record-ended-or-removed']);
const allowedChangeTypes = new Set(['added','changed','ended','disputed','corrected']);

if (!Array.isArray(ledger.entries) || ledger.entries.length < 1) fail('Power Diff ledger has no entries');
if (!Array.isArray(current.records) || current.records.length < 1) fail('Power Diff current snapshot has no records');
if (!String(ledger.boundary || '').includes('No historical change is claimed without a genuine prior snapshot')) fail('Power Diff does not enforce the genuine-baseline rule');
if (!ledger.baselineAvailable && ledger.entries.some(item => item.status !== 'baseline-established')) fail('Power Diff claimed historical status without a baseline');
if (!ledger.baselineAvailable && ledger.materialDiffCount !== 0) fail('Power Diff claimed material changes without a baseline');

for (const entry of ledger.entries || []) {
  if (!entry.id || !entry.sourceRecordId || !entry.title) fail('Power Diff entry is missing identity');
  if (!allowedStatuses.has(entry.status)) fail(`${entry.id || 'entry'} has invalid status ${entry.status}`);
  if (entry.status === 'record-ended-or-removed') {
    if (!entry.previousFingerprint || entry.currentFingerprint) fail(`${entry.id || 'entry'} removed record has invalid fingerprint state`);
    if (!(entry.changes || []).some(change => change.type === 'ended')) fail(`${entry.id || 'entry'} removed record lacks an ended change`);
  } else if (!entry.currentFingerprint) {
    fail(`${entry.id || 'entry'} current record is missing its fingerprint`);
  }
  if (entry.status === 'baseline-established' && (entry.changes || []).length) fail(`${entry.id || 'entry'} has changes despite being baseline-only`);
  for (const change of entry.changes || []) {
    if (!allowedChangeTypes.has(change.type)) fail(`${entry.id || 'entry'} has invalid change type ${change.type}`);
    if (!change.field) fail(`${entry.id || 'entry'} has a change without a field`);
  }
  if (!String(entry.evidenceBoundary || '').includes('not guilt') && entry.status !== 'record-ended-or-removed') fail(`${entry.id || 'entry'} lacks the diff evidence boundary`);
  if (entry.status === 'record-ended-or-removed' && !String(entry.evidenceBoundary || '').includes('must not be interpreted as proof of concealment')) fail(`${entry.id || 'entry'} lacks the removed-record boundary`);
}

for (const marker of ['POWER', 'data-power-diff-search', 'data-power-diff-filter', 'does not invent a past']) {
  if (!page.includes(marker)) fail(`Power Diff page missing ${marker}`);
}
for (const marker of ['data/power-diff.json', 'No historical change has been invented', 'Challenge or correct this diff']) {
  if (!client.includes(marker)) fail(`Power Diff client missing ${marker}`);
}
if (!css.includes('.power-diff-change.type-corrected') || !css.includes('@media')) fail('Power Diff CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.powerDiffRoute || '').startsWith('power-diff.html#diff-'))) fail('Reverse Accountability records are not linked to Power Diff');
if (!(chains.chains || []).every(item => String(item.powerDiffRoute || '').startsWith('power-diff.html#diff-'))) fail('Power Supply Chains are not linked to Power Diff');
if (!(halfLife.entries || []).every(item => String(item.powerDiffRoute || '').startsWith('power-diff.html#diff-'))) fail('Evidence Half-Life records are not linked to Power Diff');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Power Diff client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Power Diff pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-diff-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  entryCount: ledger.entries.length,
  baselineAvailable: ledger.baselineAvailable,
  materialDiffCount: ledger.materialDiffCount,
  noInventedHistory: true,
  removedRecordFingerprintRule: true,
  allowedChangeTypes: [...allowedChangeTypes]
}, null, 2) + '\n');
console.log(`Power Diff pressure test passed with ${ledger.entries.length} records; baseline available: ${ledger.baselineAvailable}.`);
