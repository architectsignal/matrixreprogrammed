'use strict';

const fs = require('fs');
const path = require('path');
require('./install-public-answer-clock.js');

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

const ledger = json('data/public-answer-clocks.json');
const events = json('data/public-answer-clock-events.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chains = json('data/power-supply-chain.json');
const halfLife = json('data/evidence-half-life.json');
const powerDiff = json('data/power-diff.json');
const redTeam = json('data/red-team-mirror.json');
const page = read('public-answer-clock.html');
const client = read('public-answer-clock.js');
const css = read('public-answer-clock.css');
const allowedEventTypes = new Set(['prepared','delivered','receipt-confirmed','response-received','correction-issued','closed','withdrawn']);

if (!Array.isArray(ledger.clocks) || ledger.clocks.length < 1) fail('Public Answer Clock ledger has no clocks');
if (!String(ledger.boundary || '').includes('No clock starts without verified delivery')) fail('Public Answer Clock lacks verified-delivery boundary');
if (!String(ledger.boundary || '').includes('Non-response is never proof of wrongdoing')) fail('Public Answer Clock lacks non-response boundary');
if (!Array.isArray(events.events)) fail('Public Answer Clock event ledger is invalid');
for (const event of events.events || []) {
  if (!allowedEventTypes.has(event.type)) fail(`Public Answer Clock event has invalid type ${event.type}`);
}

for (const clock of ledger.clocks || []) {
  if (!clock.id || !clock.sourceRecordId || !clock.title || !clock.question) fail('Public Answer Clock record is missing identity or question');
  if (!String(clock.nonResponseBoundary || '').includes('does not prove wrongdoing')) fail(`${clock.id || 'clock'} lacks non-response boundary`);
  if (!String(clock.evidenceBoundary || '').includes('does not convert silence')) fail(`${clock.id || 'clock'} lacks silence boundary`);
  if (clock.clockRunning && (!clock.startedAt || !clock.deliveryProof?.verifiedBy || !clock.deliveryProof?.verificationReference)) fail(`${clock.id || 'clock'} runs without verified delivery proof`);
  if (!clock.clockRunning && clock.startedAt && !clock.deliveryProof) fail(`${clock.id || 'clock'} exposes a start time without delivery proof`);
  if (clock.status === 'delivery-unverified-clock-stopped' && clock.clockRunning) fail(`${clock.id || 'clock'} runs despite unverified delivery`);
  if (clock.followUpReviewAt && !String(clock.followUpBoundary || '').includes('not a legal deadline')) fail(`${clock.id || 'clock'} presents editorial review as a recipient deadline`);
  if (clock.targetStatus === 'unresolved-no-contact-authorized' && clock.status !== 'not-prepared') fail(`${clock.id || 'clock'} advanced despite unresolved target`);
}

for (const marker of ['PUBLIC ANSWER', 'data-answer-clock-search', 'data-answer-clock-filter', 'No silence verdict']) {
  if (!page.includes(marker)) fail(`Public Answer Clock page missing ${marker}`);
}
for (const marker of ['data/public-answer-clocks.json', 'No delivery or non-response status has been invented', 'Submit a verified response']) {
  if (!client.includes(marker)) fail(`Public Answer Clock client missing ${marker}`);
}
if (!css.includes('.answer-clock-proof.is-empty') || !css.includes('@media')) fail('Public Answer Clock CSS is incomplete or not responsive');
if (!(reverseIndex.records || []).every(item => String(item.publicAnswerClockRoute || '').startsWith('public-answer-clock.html#answer-clock-'))) fail('Reverse Accountability records are not linked to Public Answer Clock');
if (!(chains.chains || []).every(item => String(item.publicAnswerClockRoute || '').startsWith('public-answer-clock.html#answer-clock-'))) fail('Power Supply Chains are not linked to Public Answer Clock');
if (!(halfLife.entries || []).every(item => String(item.publicAnswerClockRoute || '').startsWith('public-answer-clock.html#answer-clock-'))) fail('Evidence Half-Life records are not linked to Public Answer Clock');
for (const entry of powerDiff.entries || []) {
  if (entry.status === 'record-ended-or-removed' && entry.publicAnswerClockRoute) fail(`${entry.id || 'Power Diff entry'} historical-only record has a current answer clock`);
  if (entry.status !== 'record-ended-or-removed' && !String(entry.publicAnswerClockRoute || '').startsWith('public-answer-clock.html#answer-clock-')) fail(`${entry.id || 'Power Diff entry'} current record lacks Public Answer Clock`);
}
if (!(redTeam.mirrors || []).every(item => String(item.publicAnswerClockRoute || '').startsWith('public-answer-clock.html#answer-clock-'))) fail('Red-Team Mirrors are not linked to Public Answer Clock');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Public Answer Clock client contains unsafe dynamic code execution');

if (failures.length) {
  console.error(`Public Answer Clock pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-answer-clock-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  clockCount: ledger.clocks.length,
  runningCount: ledger.runningCount,
  verifiedDeliveryRequired: true,
  silenceNeverVerdict: true,
  editorialDateNotLegalDeadline: true
}, null, 2) + '\n');
console.log(`Public Answer Clock pressure test passed with ${ledger.clocks.length} records and ${ledger.runningCount} verified running clock(s).`);
