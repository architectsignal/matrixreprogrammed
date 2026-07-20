const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
function check(ok, message) { if (!ok) failures.push(message); }

const feed = readJson('data/ai-speculative-conclusions.json');
const report = readJson('downloads/review-queue-speculation-publication.json');
const html = fs.readFileSync(path.join(root, 'ai-speculative-conclusions.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'ai-speculative-conclusions.js'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'downloads', 'ai-speculative-conclusions-policy.md'), 'utf8');

const imported = (feed.items || []).filter(item => item.publicationState === 'auto-published-from-review-queue');
check(feed.automaticPublicationScope === 'speculation_page_only', 'automatic publication escaped the speculation-only surface');
check(feed.verifiedEvidencePagesAffected === false, 'verified evidence pages may not be affected');
check(feed.reviewQueueAutoPublication?.enabled === true, 'review queue auto-publication flag missing');
check(report.ok === true, 'publication report is not healthy');
check(report.imported === imported.length, 'publication report/import count mismatch');
check(imported.length === report.queueRecords - report.rejected.length, 'not every safe review item was published');
check(html.includes('Review queue publication rule:'), 'visible review queue rule missing from page');
check(html.includes('data-filter="unverified"'), 'unverified filter missing from page');
check(runtime.includes('AUTO-PUBLISHED FROM REVIEW QUEUE — UNVERIFIED SPECULATION'), 'runtime warning label missing');
check(policy.includes('Human approval is not required'), 'policy does not clearly permit automatic review-queue publication');

for (const item of imported) {
  check(item.classification === 'ai_speculative_conclusion', `${item.id}: wrong classification`);
  check(item.status === 'unverified', `${item.id}: review item not marked unverified`);
  check(item.humanReviewed === false, `${item.id}: false human-review claim`);
  check(item.autoPublished === true, `${item.id}: auto-publication marker missing`);
  check(item.criminalConductEstablished === false, `${item.id}: criminal conduct must remain false`);
  check(Number(item.confidence?.score) <= 49, `${item.id}: confidence crossed factual ceiling`);
  check(Array.isArray(item.reviewOrigin?.failedGates), `${item.id}: failed review gates missing`);
  check(Array.isArray(item.sources) && item.sources.length > 0, `${item.id}: public source route missing`);
  check(Array.isArray(item.contraryEvidence) && item.contraryEvidence.length > 0, `${item.id}: contrary evidence missing`);
  check(Array.isArray(item.missingRecords) && item.missingRecords.length > 0, `${item.id}: missing-record list missing`);
  check(Array.isArray(item.alternativeExplanations) && item.alternativeExplanations.length > 0, `${item.id}: alternatives missing`);
  check(Array.isArray(item.falsificationTests) && item.falsificationTests.length > 0, `${item.id}: falsifiers missing`);
  check(/AUTO-PUBLISHED UNVERIFIED SPECULATION/i.test(item.boundary || ''), `${item.id}: explicit boundary missing`);
}

const serialized = JSON.stringify(imported);
for (const forbidden of ['private key', 'seed phrase', 'private address', 'phone number', 'intimate image', 'doxxing']) {
  check(!serialized.toLowerCase().includes(forbidden), `prohibited sensitive marker published: ${forbidden}`);
}

if (failures.length) {
  console.error(`REVIEW QUEUE SPECULATION TEST FAILED: ${failures.length} issue(s)`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`REVIEW QUEUE SPECULATION TEST PASSED: ${imported.length} safe review item(s) published as unverified speculation; ${report.rejected.length} prohibited item(s) blocked.`);
