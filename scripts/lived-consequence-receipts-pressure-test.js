'use strict';

const fs = require('fs');
const path = require('path');
require('./install-lived-consequence-receipts.js');

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

const publicLedger = json('data/lived-consequence-receipts.json');
const reviewedLedger = json('data/lived-consequence-receipts-reviewed.json');
const reverseIndex = json('data/reverse-accountability-index.json');
const chains = json('data/power-supply-chain.json');
const halfLife = json('data/evidence-half-life.json');
const powerDiff = json('data/power-diff.json');
const redTeam = json('data/red-team-mirror.json');
const answerClocks = json('data/public-answer-clocks.json');
const missions = json('data/missing-record-missions.json');
const page = read('lived-consequence-receipts.html');
const client = read('lived-consequence-receipts.js');
const css = read('lived-consequence-receipts.css');
const installer = read('scripts/install-lived-consequence-receipts.js');
const allowedClassifications = new Set(['documented-evidence','credible-lead','correction']);

if (!Array.isArray(publicLedger.receipts)) fail('Public Lived Consequence Receipts ledger is invalid');
if (!Array.isArray(reviewedLedger.receipts)) fail('Reviewed Lived Consequence Receipts input ledger is invalid');
if (!String(publicLedger.boundary || '').includes('Raw submissions remain private')) fail('Lived Consequence Receipts lacks private-raw-submission boundary');
if (!String(publicLedger.boundary || '').includes('One receipt does not prove a general pattern or causation')) fail('Lived Consequence Receipts lacks individual-scope boundary');
if (publicLedger.count !== publicLedger.receipts.length) fail('Lived Consequence Receipts count is inconsistent');

for (const receipt of publicLedger.receipts || []) {
  if (!receipt.id || !receipt.sourceRecordId || !receipt.title || !receipt.summary) fail('Public lived receipt is missing identity or summary');
  if (receipt.redacted !== true) fail(`${receipt.id || 'receipt'} is public without redaction`);
  if (receipt.consentPublish !== true) fail(`${receipt.id || 'receipt'} is public without publish consent`);
  if (!receipt.reviewedBy || !receipt.reviewedAt) fail(`${receipt.id || 'receipt'} is public without named human review`);
  if (!allowedClassifications.has(receipt.evidenceClassification)) fail(`${receipt.id || 'receipt'} has invalid evidence classification`);
  if (!receipt.individualScopeBoundary) fail(`${receipt.id || 'receipt'} lacks individual-scope boundary`);
  if (!String(receipt.evidenceBoundary || '').includes('does not by itself prove a general pattern')) fail(`${receipt.id || 'receipt'} overstates individual evidence`);
}

for (const marker of ['LIVED CONSEQUENCE', 'data-lived-receipt-form', 'Submit to private review queue', 'Nothing is published automatically', 'Open secure PGP intake']) {
  if (!page.includes(marker)) fail(`Lived Consequence Receipts page missing ${marker}`);
}
for (const marker of ['/api/contact/config', '/api/contact/submit', "route: 'evidence'", 'consentPublish', 'Individual receipt only', 'Nothing was published automatically']) {
  if (!client.includes(marker)) fail(`Lived Consequence Receipts client missing ${marker}`);
}
if (/<input[^>]+type=["']?file/i.test(page)) fail('Lived Consequence Receipts exposes ordinary file upload');
if (/\blocalStorage\b|\bsessionStorage\b/.test(client)) fail('Lived Consequence Receipts stores sensitive form data in browser storage');
if (/\beval\s*\(|new Function\s*\(/.test(client)) fail('Lived Consequence Receipts client contains unsafe dynamic code execution');
if (!client.includes('clearSensitiveFields')) fail('Lived Consequence Receipts does not clear sensitive fields after confirmed storage');
if (!client.includes('form.elements.lawful.checked') || !client.includes('form.elements.redacted.checked') || !client.includes('form.elements.individualBoundary.checked')) fail('Lived Consequence Receipts does not enforce required consent boundaries');
if (!installer.includes('Raw submissions never published automatically') && !installer.includes('raw submissions remain private')) fail('Lived Consequence Receipts installer does not preserve the private/public boundary');
if (!css.includes('.receipt-consents') || !css.includes('@media')) fail('Lived Consequence Receipts CSS is incomplete or not responsive');

const currentRoute = item => String(item.livedConsequenceReceiptsRoute || '').startsWith('lived-consequence-receipts.html?record=');
if (!(reverseIndex.records || []).every(currentRoute)) fail('Reverse Accountability records are not linked to Lived Consequence Receipts');
if (!(chains.chains || []).every(currentRoute)) fail('Power Supply Chains are not linked to Lived Consequence Receipts');
if (!(halfLife.entries || []).every(currentRoute)) fail('Evidence Half-Life records are not linked to Lived Consequence Receipts');
for (const entry of powerDiff.entries || []) {
  if (entry.status === 'record-ended-or-removed' && entry.livedConsequenceReceiptsRoute) fail(`${entry.id || 'Power Diff entry'} historical-only record has a current lived-receipt route`);
  if (entry.status !== 'record-ended-or-removed' && !currentRoute(entry)) fail(`${entry.id || 'Power Diff entry'} current record lacks Lived Consequence Receipts route`);
}
if (!(redTeam.mirrors || []).every(currentRoute)) fail('Red-Team Mirrors are not linked to Lived Consequence Receipts');
if (!(answerClocks.clocks || []).every(currentRoute)) fail('Public Answer Clocks are not linked to Lived Consequence Receipts');
if (!(missions.missions || []).every(currentRoute)) fail('Missing Record Missions are not linked to Lived Consequence Receipts');

if (failures.length) {
  console.error(`Lived Consequence Receipts pressure test failed (${failures.length}):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'lived-consequence-receipts-pressure-test.json'), JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  publicReceiptCount: publicLedger.receipts.length,
  reviewedInputCount: reviewedLedger.receipts.length,
  rawSubmissionsPublishedAutomatically: false,
  ordinaryFileUploadEnabled: false,
  browserSensitiveStorageUsed: false,
  namedHumanReviewRequired: true,
  explicitPublishConsentRequired: true,
  individualReceiptNotGeneralProof: true
}, null, 2) + '\n');
console.log(`Lived Consequence Receipts pressure test passed with ${publicLedger.receipts.length} reviewed public receipt(s); raw submissions remain private.`);
