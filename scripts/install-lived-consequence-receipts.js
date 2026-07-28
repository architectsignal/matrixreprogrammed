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
const allowedClassifications = new Set(['documented-evidence','credible-lead','correction']);

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
const reviewedInput = readJson('data/lived-consequence-receipts-reviewed.json', { receipts: [] });
const rejected = [];
const receipts = [];

for (const input of array(reviewedInput.receipts)) {
  const reasons = [];
  if (!clean(input.id, 220)) reasons.push('missing-id');
  if (!clean(input.sourceRecordId, 220)) reasons.push('missing-source-record');
  if (input.redacted !== true) reasons.push('not-redacted');
  if (input.consentPublish !== true) reasons.push('publish-consent-missing');
  if (!clean(input.reviewedBy, 220)) reasons.push('named-reviewer-missing');
  if (!clean(input.reviewedAt, 80)) reasons.push('review-date-missing');
  if (!allowedClassifications.has(clean(input.evidenceClassification, 80))) reasons.push('invalid-evidence-classification');
  if (!clean(input.summary, 1600)) reasons.push('summary-missing');
  if (!clean(input.individualScopeBoundary, 1200)) reasons.push('individual-scope-boundary-missing');
  if (reasons.length) {
    rejected.push({ id: clean(input.id, 220), reasons });
    continue;
  }
  receipts.push({
    schemaVersion: 1,
    id: clean(input.id, 220),
    sourceRecordId: clean(input.sourceRecordId, 220),
    title: clean(input.title || 'Lived consequence receipt', 500),
    consequenceType: clean(input.consequenceType, 160),
    broadLocation: clean(input.broadLocation, 220),
    dateRange: clean(input.dateRange, 160),
    summary: clean(input.summary, 1600),
    evidenceClassification: clean(input.evidenceClassification, 80),
    sourceDescription: clean(input.sourceDescription, 1000),
    sourceRoute: clean(input.sourceRoute, 1000),
    redacted: true,
    consentPublish: true,
    reviewedBy: clean(input.reviewedBy, 220),
    reviewedAt: clean(input.reviewedAt, 80),
    individualScopeBoundary: clean(input.individualScopeBoundary, 1200),
    corroborationStatus: clean(input.corroborationStatus || 'single-reviewed-receipt', 160),
    patternStatus: clean(input.patternStatus || 'no-general-pattern-claimed', 160),
    correctionStatus: clean(input.correctionStatus || 'open-to-correction', 160),
    evidenceBoundary: 'This is a redacted, reviewed individual receipt. It may document one person’s experience but does not by itself prove a general pattern, policy-wide outcome, causation or wrongdoing.'
  });
}

const publicLedger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Lived Consequence Receipts',
  proposition: 'People should be able to submit privacy-protected records showing how a decision affected them, while individual evidence remains clearly separated from proof of a general outcome.',
  boundary: 'Raw submissions remain private in the protected contact intake queue. Public receipts require redaction, explicit publish consent and named human review. One receipt does not prove a general pattern or causation.',
  count: receipts.length,
  rejectedAtBuild: rejected.length,
  receipts
};
writeEverywhere('data/lived-consequence-receipts.json', `${JSON.stringify(publicLedger, null, 2)}\n`);

const recordOptions = array(reverseIndex.records).map(record => `<option value="${esc(clean(record.id, 220))}">${esc(clean(record.title, 200))}</option>`).join('');
const reviewedCards = receipts.length ? receipts.map(receipt => `<article class="lived-receipt-card" id="${esc(receipt.id)}"><div class="lived-receipt-meta"><span>${esc(receipt.consequenceType || 'Reviewed receipt')}</span><strong>${esc(receipt.evidenceClassification.replace(/-/g,' '))}</strong></div><h3>${esc(receipt.title)}</h3><p>${esc(receipt.summary)}</p><div class="lived-receipt-facts"><span>${esc(receipt.broadLocation || 'Location withheld')}</span><span>${esc(receipt.dateRange || 'Date withheld')}</span><span>${esc(receipt.corroborationStatus.replace(/-/g,' '))}</span></div><p class="lived-receipt-boundary"><strong>Individual scope:</strong> ${esc(receipt.individualScopeBoundary)}</p><p class="lived-receipt-boundary"><strong>Evidence boundary:</strong> ${esc(receipt.evidenceBoundary)}</p>${receipt.sourceRoute ? `<a href="${esc(receipt.sourceRoute)}" rel="noopener noreferrer">Open redacted source route</a>` : ''}</article>`).join('') : '<div class="lived-receipts-empty"><h3>No public receipts yet</h3><p>Raw submissions are never published automatically. A receipt appears here only after redaction, explicit publish consent and named human review.</p></div>';

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lived Consequence Receipts | Matrix Reprogrammed</title><meta name="description" content="Submit privacy-protected evidence showing how a public decision affected you, while individual receipts remain separate from proof of a general pattern."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="lived-consequence-receipts.css"></head><body class="lived-receipts-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="lived-receipts-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="missing-record-missions.html">Missing Record Missions</a><a href="security-privacy.html">Privacy</a></nav></header><main><section class="lived-receipts-hero wrap"><p class="lived-receipts-kicker">Private intake, reviewed public evidence</p><h1>LIVED CONSEQUENCE<br>RECEIPTS.</h1><p>Show how a decision affected you through a redacted bill, notice, correspondence, service change or other lawful record—without pretending one receipt proves the whole outcome.</p><div class="lived-receipts-rule"><strong>Privacy boundary:</strong> ${esc(publicLedger.boundary)}</div></section><section id="submit" class="lived-receipts-intake wrap"><div class="lived-receipts-intro"><p class="lived-receipts-kicker">Submit safely</p><h2>Describe the receipt before sharing sensitive material.</h2><ul><li>Remove names, account numbers, addresses, signatures, barcodes, QR codes and unnecessary metadata.</li><li>Do not submit information about children, medical details or another person’s private data through the ordinary form.</li><li>Do not upload stolen, hacked, unlawfully obtained or dangerous material.</li><li>For sensitive documents, use the site’s client-side PGP route rather than ordinary links.</li></ul><a class="btn alt" href="contact-the-machine.html?type=secure-pgp">Open secure PGP intake</a></div><form data-lived-receipt-form class="lived-receipt-form" novalidate><input type="text" name="website" class="receipt-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true"><label>Related accountability record<select name="recordId" required><option value="">Choose a record</option>${recordOptions}</select></label><label>Type of consequence<select name="consequenceType" required><option value="">Choose one</option><option value="bill-or-price-change">Bill or price change</option><option value="service-closure-or-withdrawal">Service closure or withdrawal</option><option value="restriction-or-requirement">Restriction or requirement</option><option value="employment-or-income-effect">Employment or income effect</option><option value="housing-or-property-effect">Housing or property effect</option><option value="official-decision-or-notice">Official decision or notice</option><option value="other-verifiable-effect">Other verifiable effect</option></select></label><label>Broad location only<input name="location" maxlength="160" placeholder="Country, region or city—do not enter a home address"></label><label>Date or date range<input name="dateRange" maxlength="120" placeholder="Example: March–May 2026"></label><label>What happened?<textarea name="summary" minlength="40" maxlength="5000" required placeholder="Describe the effect, the record you hold and what it appears to show. Separate what you know from what you suspect."></textarea></label><label>Lawful redacted source links<textarea name="sourceLinks" maxlength="4000" placeholder="Optional links to redacted documents or official correspondence. Do not use public links containing private data."></textarea></label><label>Evidence classification<select name="classification" required><option value="credible-lead">Credible lead requiring verification</option><option value="documented-evidence">Documented evidence with a verifiable source</option><option value="correction">Correction or contrary receipt</option></select></label><label>Name or alias for reply<input name="name" maxlength="120" autocomplete="name"></label><label>Reply email<input name="email" type="email" maxlength="254" autocomplete="email"></label><div class="receipt-consents"><label><input type="checkbox" name="lawful" required> I have the lawful right to submit this information.</label><label><input type="checkbox" name="redacted" required> I removed unnecessary personal and identifying information.</label><label><input type="checkbox" name="individualBoundary" required> I understand this receipt does not by itself prove a general pattern or causation.</label><label><input type="checkbox" name="consentReply"> Matrix Reprogrammed may contact me about verification.</label><label><input type="checkbox" name="consentPublish"> After separate human review and further redaction, I permit a public summary. This is optional.</label></div><input type="hidden" name="turnstileToken"><div data-lived-receipt-turnstile></div><button type="submit">Submit to private review queue</button><p data-lived-receipt-status class="lived-receipt-status" aria-live="polite">Nothing is published automatically.</p></form></section><section class="lived-receipts-reviewed wrap"><div class="lived-receipts-section-head"><div><p class="lived-receipts-kicker">Reviewed public ledger</p><h2>REDACTED RECEIPTS</h2></div><span>${receipts.length} published after review</span></div>${reviewedCards}</section><section class="lived-receipts-boundary wrap"><strong>Evidence boundary:</strong> ${esc(publicLedger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — lived evidence should be protected, reviewed and never overstated.</p></footer></div><script src="matrix.js"></script><script src="lived-consequence-receipts.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('lived-consequence-receipts.html', page);
copyToOutput('lived-consequence-receipts.js');
copyToOutput('lived-consequence-receipts.css');
copyToOutput('data/lived-consequence-receipts-reviewed.json');

const routeFor = recordId => `lived-consequence-receipts.html?record=${encodeURIComponent(clean(recordId, 220))}#submit`;
const updatedIndex = { ...reverseIndex, records: array(reverseIndex.records).map(record => ({ ...record, livedConsequenceReceiptsRoute: routeFor(record.id) })) };
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

for (const relative of ['data/power-supply-chain.json','data/evidence-half-life.json','data/power-diff.json','data/red-team-mirror.json','data/public-answer-clocks.json','data/missing-record-missions.json']) {
  const payload = readJson(relative, {});
  if (Array.isArray(payload.chains)) payload.chains = payload.chains.map(item => ({ ...item, livedConsequenceReceiptsRoute: routeFor(item.sourceRecordId) }));
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(item => item.status === 'record-ended-or-removed' ? item : ({ ...item, livedConsequenceReceiptsRoute: routeFor(item.sourceRecordId) }));
  if (Array.isArray(payload.mirrors)) payload.mirrors = payload.mirrors.map(item => ({ ...item, livedConsequenceReceiptsRoute: routeFor(item.sourceRecordId) }));
  if (Array.isArray(payload.clocks)) payload.clocks = payload.clocks.map(item => ({ ...item, livedConsequenceReceiptsRoute: routeFor(item.sourceRecordId) }));
  if (Array.isArray(payload.missions)) payload.missions = payload.missions.map(item => ({ ...item, livedConsequenceReceiptsRoute: routeFor(item.sourceRecordId) }));
  writeEverywhere(relative, `${JSON.stringify(payload, null, 2)}\n`);
}

const report = {
  ok: true,
  generatedAt,
  reviewedReceiptCount: receipts.length,
  rejectedAtBuild: rejected.length,
  rawSubmissionsPublishedAutomatically: false,
  fileUploadEnabled: false,
  pgpRouteAvailable: true,
  publicReviewRequirements: ['redacted', 'explicit publish consent', 'named reviewer', 'review date', 'evidence classification', 'individual scope boundary'],
  boundary: publicLedger.boundary
};
writeEverywhere('downloads/lived-consequence-receipts-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Lived Consequence Receipts installed with ${receipts.length} reviewed public receipt(s); raw submissions remain private.`);
