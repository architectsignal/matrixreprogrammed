'use strict';

const fs = require('fs');
const path = require('path');
require('./install-evidence-half-life.js');

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

const ledger = json('data/evidence-half-life.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chainLedger = json('data/power-supply-chain.json');
const page = read('evidence-half-life.html');
const client = read('evidence-half-life.js');
const css = read('evidence-half-life.css');
const allowedStates = new Set(['review-due','review-soon','within-review-window','source-date-missing']);

if (!Array.isArray(ledger.entries) || ledger.entries.length < 1) fail('Evidence Half-Life ledger has no entries');
if (!String(ledger.boundary || '').includes('Evidence age is not evidence of falsity')) fail('Evidence Half-Life boundary does not prevent age from becoming a truth score');
if (ledger.count !== ledger.entries.length) fail('Evidence Half-Life count does not match entries');
if (ledger.recallCount !== ledger.entries.filter(item => item.recallNotice).length) fail('Evidence Half-Life recall count is inconsistent');

for (const entry of ledger.entries || []) {
  if (!entry.id || !entry.sourceRecordId || !entry.title) fail('Evidence Half-Life entry is missing identity');
  if (!allowedStates.has(entry.freshnessState)) fail(`${entry.id || 'entry'} has invalid freshness state ${entry.freshnessState}`);
  if (!entry.baselineAt || !entry.baselineType || !entry.nextReviewAt || !Number.isFinite(Number(entry.reviewIntervalDays))) fail(`${entry.id || 'entry'} is missing review timing`);
  if (entry.sourceAvailability !== 'not-checked-in-static-build') fail(`${entry.id || 'entry'} falsely claims a source availability check`);
  if (entry.currentApplicability !== 'not-human-reverified') fail(`${entry.id || 'entry'} falsely claims human re-verification`);
  if (!String(entry.evidenceBoundary || '').includes('Evidence age is not a truth score')) fail(`${entry.id || 'entry'} lacks the age boundary`);
  if (entry.freshnessState === 'review-due' && !entry.recallNotice) fail(`${entry.id || 'entry'} is overdue without a recall notice`);
  if (entry.freshnessState === 'source-date-missing' && !entry.recallNotice) fail(`${entry.id || 'entry'} has no source date but no recall notice`);
}

for (const marker of ['EVIDENCE', 'data-half-life-search', 'data-half-life-filter', 'age does not make evidence false']) {
  if (!page.includes(marker)) fail(`Evidence Half-Life page missing ${marker}`);
}
for (const marker of ['data/evidence-half-life.json', 'No source has been declared stale or false', 'Submit updated evidence']) {
  if (!client.includes(marker)) fail(`Evidence Half-Life client missing ${marker}`);
}
if (!css.includes('.half-life-card.state-review-due') || !css.includes('@media')) fail('Evidence Half-Life CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.evidenceHalfLifeRoute || '').startsWith('evidence-half-life.html#half-life-'))) fail('Reverse Accountability records are not linked to Evidence Half-Life');
if (!(chainLedger.chains || []).every(item => String(item.evidenceHalfLifeRoute || '').startsWith('evidence-half-life.html#half-life-'))) fail('Power Supply Chains are not linked to Evidence Half-Life');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Evidence Half-Life client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Evidence Half-Life pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'evidence-half-life-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  entryCount: ledger.entries.length,
  recallCount: ledger.recallCount,
  ageIsNotTruthScore: true,
  staticAvailabilityClaimsBlocked: true,
  humanReverificationClaimsBlocked: true
}, null, 2) + '\n');
console.log(`Evidence Half-Life pressure test passed with ${ledger.entries.length} records and ${ledger.recallCount} recall notices.`);
