const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
const feedPath = path.join(root, 'data', 'ai-speculative-conclusions.json');
const queuePath = path.join(root, 'downloads', 'phase2-conclusion-engine-preview', 'review-queue.json');
const reportPath = path.join(root, 'downloads', 'review-queue-speculation-publication.json');
const outputCopy = path.join(root, '_site', 'data', 'ai-speculative-conclusions.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function array(value) { return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []; }
function text(value, fallback = '') { return String(value ?? fallback).replace(/\s+/g, ' ').trim(); }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function unique(values) { return [...new Set(array(values).map(item => text(typeof item === 'string' ? item : item?.text || item?.title || item)).filter(Boolean))]; }

function buildQueue() {
  const result = spawnSync(process.execPath, ['scripts/build-phase2-conclusion-engine-preview.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 80
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('Unable to build the conclusion review queue.');
}

const prohibitedPatterns = [
  /\b(?:home|private|residential) address\b/i,
  /\b(?:phone|telephone|mobile) number\b/i,
  /\b(?:password|credential|recovery code|private key|seed phrase)\b/i,
  /\b(?:minor|child victim|underage victim)\b/i,
  /\b(?:intimate image|sexual image|explicit image)\b/i,
  /\b(?:doxx|doxxing)\b/i
];
function prohibited(record) {
  const source = JSON.stringify(record);
  return prohibitedPatterns.some(pattern => pattern.test(source));
}

function sourcesFor(record) {
  const ids = unique(record.previewSourceIds);
  const sourceFile = text(record.sourceFile);
  const routes = ids.map(id => ({
    label: `Canonical source ${id}`,
    url: 'source-document-vault.html',
    locator: id,
    evidenceClass: 'public-record source route; underlying claim not independently established'
  }));
  if (sourceFile) routes.push({
    label: 'Originating public record family',
    url: 'evidence-vault.html',
    locator: sourceFile,
    evidenceClass: 'source-index route'
  });
  if (!routes.length) routes.push({
    label: 'Conclusion review source route',
    url: 'conclusion-engine.html',
    locator: record.id || 'review queue record',
    evidenceClass: 'machine analysis lead only'
  });
  return routes;
}

function normalise(record, generatedAt) {
  const generated = record.generated || {};
  const speculation = generated.speculativeConclusion || {};
  const counter = generated.counterAndMissing || {};
  const counterHypothesis = counter.counterHypothesis || {};
  const publication = record.publication || {};
  const failed = unique(publication.failed);
  const conclusion = text(speculation.text || generated.evidenceBasedConclusion?.candidateText || record.title,
    'The review queue contains a machine-generated possibility that has not passed the evidence threshold for a factual conclusion.');
  const support = unique([
    ...(array(generated.evidenceBasedConclusion?.sourceIds).map(id => `The conclusion engine linked this hypothesis to canonical source record ${id}; this link does not establish the hypothesis as fact.`)),
    generated.evidenceBasedConclusion?.candidateText,
    generated.mechanism?.candidateText,
    `Original review state: ${publication.state || 'review'}; failed gates: ${failed.join(', ') || 'not specified'}.`
  ]).filter(value => value.length >= 20);
  const contrary = unique([
    ...array(counterHypothesis.contradictoryEvidence),
    counterHypothesis.candidateAssessment,
    'The original publication gates did not support promotion to a verified factual surface.'
  ]).filter(value => value.length >= 15);
  const missing = unique([
    ...array(counter.missingEvidence),
    ...failed.map(gate => `Evidence sufficient to pass the ${gate.replaceAll('_', ' ')} gate`),
    'Independent primary-source corroboration sufficient to move this item out of speculation.'
  ]).filter(value => value.length >= 8);
  const alternatives = unique([
    ...array(counterHypothesis.alternativeExplanations),
    'The observed pattern may result from unrelated actors, ordinary institutional practice, incomplete records or coincidental timing.'
  ]).filter(value => value.length >= 5);
  const falsifiers = unique([
    ...array(counter.falsifiers),
    ...array(speculation.falsifiers),
    'Primary records disprove the proposed mechanism or show that the inferred relationship does not exist.'
  ]).filter(value => value.length >= 8);
  const rawScore = publication.recommendedConfidence ?? generated.convergence?.totalScore ?? 20;
  const score = Math.min(49, clamp(rawScore, 5, 49));
  const stable = hash(`${record.id}|${conclusion}`).slice(0, 16).toUpperCase();
  return {
    id: `ASC-REVIEW-${stable}`,
    title: text(record.title, `Review-queue hypothesis ${stable}`),
    classification: 'ai_speculative_conclusion',
    status: 'unverified',
    publicationState: 'auto-published-from-review-queue',
    reviewOrigin: {
      recordId: text(record.id, stable),
      originalState: text(publication.state, 'review'),
      failedGates: failed,
      sourceRecordStatus: text(record.sourceRecordStatus, 'unknown'),
      recordType: text(record.recordType, 'unknown')
    },
    confidence: {
      score,
      band: 'unverified speculation',
      meaning: 'This score reflects limited machine support only. It is not a probability, factual finding, accusation or measure of guilt.'
    },
    conclusion,
    documentedSupport: support.length ? support : ['This item entered the machine review queue and is published only as an unverified research hypothesis.'],
    sources: sourcesFor(record),
    contraryEvidence: contrary.length ? contrary : ['No sufficient contrary-evidence analysis was attached; this absence weakens the hypothesis rather than strengthening it.'],
    missingRecords: missing.length ? missing : ['Primary records needed to verify or reject the proposed mechanism.'],
    alternativeExplanations: alternatives.length ? alternatives : ['Incomplete information or an ordinary non-coordinated explanation.'],
    falsificationTests: falsifiers.length ? falsifiers : ['A reliable primary record contradicts the hypothesis or its proposed mechanism.'],
    criminalConductEstablished: false,
    humanReviewed: false,
    autoPublished: true,
    generatedAt: generatedAt || new Date().toISOString(),
    autoPublishedAt: new Date().toISOString(),
    lastReviewedAt: null,
    boundary: 'AUTO-PUBLISHED UNVERIFIED SPECULATION. This item failed one or more factual-publication gates. It is not an established fact, accusation, finding of wrongdoing or proof of coordination. Association, mention, proximity and model output do not establish guilt.'
  };
}

buildQueue();
const feed = readJson(feedPath);
const queue = readJson(queuePath);
const retained = array(feed.items).filter(item => item.publicationState !== 'auto-published-from-review-queue');
const rejected = [];
const imported = [];
for (const record of array(queue.records)) {
  if (prohibited(record)) {
    rejected.push({ id: record.id, title: record.title, reason: 'prohibited private/sensitive-content pattern' });
    continue;
  }
  imported.push(normalise(record, queue.generatedAt));
}
const byId = new Map();
for (const item of [...retained, ...imported]) byId.set(item.id, item);
feed.version = '3.0';
feed.updated = new Date().toISOString();
feed.automaticPublicationScope = 'speculation_page_only';
feed.automaticPublicationApproved = true;
feed.verifiedEvidencePagesAffected = false;
feed.reviewQueueAutoPublication = {
  enabled: true,
  source: 'downloads/phase2-conclusion-engine-preview/review-queue.json',
  rule: 'Every review-queue record is published to the quarantined speculation page as unverified speculation unless it contains prohibited private or sensitive material.',
  factualPromotionAllowed: false,
  imported: imported.length,
  rejected: rejected.length
};
feed.publicationRules = {
  ...feed.publicationRules,
  reviewQueueAutoPublish: true,
  verifiedSurfacePromotionProhibited: true,
  alarmRankingPromotionProhibited: true,
  privateSensitiveContentStillBlocked: true
};
feed.items = [...byId.values()];
writeJson(feedPath, feed);
if (fs.existsSync(path.dirname(outputCopy))) writeJson(outputCopy, feed);
writeJson(reportPath, {
  ok: true,
  generatedAt: new Date().toISOString(),
  queueRecords: array(queue.records).length,
  imported: imported.length,
  retainedCuratedItems: retained.length,
  totalPublishedSpeculationItems: feed.items.length,
  rejected,
  boundary: 'Review items auto-publish only as unverified speculation. Verified evidence, accusations, alarm rankings and criminal-conduct findings are unchanged.'
});
console.log(`REVIEW QUEUE SPECULATION PUBLICATION: ${imported.length} auto-published, ${rejected.length} blocked for prohibited content, ${feed.items.length} total speculation items.`);
