#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');
function hashBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
for (const [name, exports] of Object.entries({
  'production-execution-entropy-generation-request-store': { assertEntropyGenerationRequestPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (root, candidatePath) => {
      const filePath = path.join(root, candidatePath);
      if (!fs.existsSync(filePath)) return { exists: false, currentSha256: null, currentBytes: null };
      const bytes = fs.readFileSync(filePath);
      return { exists: true, currentSha256: hashBytes(bytes), currentBytes: bytes.length };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const { ProductionExecutionEntropyGenerationDecisionStore, assertEntropyGenerationDecisionPayload } = require('./production-execution-entropy-generation-decision-store');
const { decideProductionExecutionEntropyGeneration } = require('./production-execution-entropy-generation-decision-service');
class FakeStore {
  constructor(records = [], valid = true) { this.records = records; this.valid = valid; }
  verify() { return this.valid ? { valid: true, records: this.records.length } : { valid: false, reason: 'forced_invalid' }; }
  readRecords() { return this.records; }
}
class AuditLog {
  constructor(filePath) { this.filePath = filePath; this.entries = []; }
  append(type, details, actor) { this.entries.push({ type, details, actor }); fs.writeFileSync(this.filePath, JSON.stringify(this.entries)); }
  verify() { return { valid: true, entries: this.entries.length }; }
  readEntries() { return this.entries; }
}
const h = (value) => sha256(value);
function makeRequest(root, options = {}) {
  const pathA = 'target-a.html';
  const pathB = 'evidence-a.html';
  fs.writeFileSync(path.join(root, pathA), options.changed ? 'alpha-changed' : 'alpha');
  if (!options.missing) fs.writeFileSync(path.join(root, pathB), 'beta');
  const hashA = hashBytes(Buffer.from('alpha'));
  const hashB = hashBytes(Buffer.from('beta'));
  const candidates = [
    { proposedRepositoryPath: pathA, currentSha256: hashA, currentBytes: 5 },
    { proposedRepositoryPath: pathB, currentSha256: hashB, currentBytes: 4 },
  ];
  const operations = [{
    sequence: 1,
    targetId: 'dossier:test',
    operation: options.scopeChanged ? 'wrong' : 'manual_review_and_integrate_evidence',
    candidatePaths: [pathA, pathB],
    candidateHashes: [
      { proposedRepositoryPath: pathA, sha256: hashA, bytes: 5 },
      { proposedRepositoryPath: pathB, sha256: hashB, bytes: 4 },
    ],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const scopeHash = h(stableStringify({ targetIds: ['dossier:test'], operations }));
  return {
    id: 'entropy_request_1',
    recordHash: h('entropy-request-record'),
    payloadHash: h('entropy-request-payload'),
    payload: {
      generationDecision: { id: 'generation-decision-1', applicationId: 'application-1', applicationFingerprint: h('application') },
      validity: { validFrom: '2026-07-30T00:30:00.000Z', expiresAt: '2026-07-30T00:30:12.000Z' },
      lastMomentPreflight: { snapshotHash: h(stableStringify(candidates)), candidates },
      scope: { targetIds: ['dossier:test'], operations, recomputedScopeHash: scopeHash },
    },
  };
}
function completeReviews(value = true) {
  return {
    entropyRequestWindowReview: value,
    finalPreflightReview: value,
    exactScopeReview: value,
    entropySourceBoundaryReview: value,
    noOutputBoundaryReview: value,
    backupEvidenceReview: value,
    restoreEvidenceReview: value,
    productionOwnerReview: value,
  };
}
function makeOptions(root, request, decisionStore, auditLog, clock, overrides = {}) {
  const key = 'k'.repeat(40);
  return {
    entropyGenerationRequestId: request.id,
    entropyGenerationRequestStore: new FakeStore([request]),
    entropyGenerationDecisionStore: decisionStore,
    auditLog,
    repositoryRoot: root,
    upstreamIntegrityChecks: [
      { label: 'Production change request', store: new FakeStore([{ id: 'upstream' }]), signingKey: key },
      { label: 'Token material generation decision', store: new FakeStore([{ id: 'upstream2' }]), signingKey: key },
    ],
    entropyGenerationRequestSigningKey: key,
    entropyGenerationDecisionSigningKey: key,
    decision: 'approve',
    reviewerName: 'phase119-reviewer',
    reviewerRole: 'production-owner',
    reviewerNote: 'Approve the review record while preserving the no-entropy and no-execution boundary.',
    completedReviews: completeReviews(true),
    clock,
    ...overrides,
  };
}
let checks = 0;
function check(fn) { fn(); checks += 1; }
async function rejects(fn, pattern) {
  let matched = false;
  try { await fn(); } catch (error) { matched = pattern.test(error.message); }
  assert.equal(matched, true, pattern);
  checks += 1;
}
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p119-'));
  const request = makeRequest(root);
  const decisionStore = new ProductionExecutionEntropyGenerationDecisionStore(path.join(root, 'decisions.jsonl'));
  const auditLog = new AuditLog(path.join(root, 'audit.json'));
  const clock = () => new Date('2026-07-30T00:30:05.000Z');
  const base = makeOptions(root, request, decisionStore, auditLog, clock);
  await rejects(() => decideProductionExecutionEntropyGeneration({ ...base, entropyGenerationDecisionSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => decideProductionExecutionEntropyGeneration({ ...base, decision: 'maybe' }), /approve or reject/);
  await rejects(() => decideProductionExecutionEntropyGeneration({ ...base, reviewerNote: 'short' }), /reviewerNote/);
  const incomplete = completeReviews(true); incomplete.entropySourceBoundaryReview = false;
  await rejects(() => decideProductionExecutionEntropyGeneration({ ...base, completedReviews: incomplete }), /entropySourceBoundaryReview/);
  const result = decideProductionExecutionEntropyGeneration(base);
  for (const [field, value] of Object.entries({
    decision: 'approve', candidateCount: 2, operationCount: 1,
    entropySourceSelected: false, entropyGenerated: false, entropyOutputProduced: false,
    tokenMaterialGenerated: false, tokenMaterialIssued: false,
    bearerSecretGenerated: false, bearerSecretIssued: false,
    readyForExecution: false, executionAuthorityGranted: false, productionWrites: 0,
  })) check(() => assert.equal(result[field], value));
  check(() => assert.equal(decisionStore.verify('k'.repeat(40)).valid, true));
  check(() => assert.equal(decisionStore.verify('z'.repeat(40)).valid, false));
  const approved = decisionStore.readRecords()[0];
  check(() => assert.equal(assertEntropyGenerationDecisionPayload(approved.payload), true));
  check(() => assert.equal(approved.payload.status, 'approved_entropy_generation_request_record_only'));
  check(() => assert.equal(approved.payload.entropyState.entropySource, null));
  check(() => assert.equal(approved.payload.entropyState.entropyBytesRequested, 0));
  check(() => assert.equal(approved.payload.entropyState.entropyOutput, null));
  check(() => assert.equal(approved.payload.entropyState.entropyDigest, null));
  check(() => assert.equal(approved.payload.nextAction, 'separate_entropy_source_selection_request_no_entropy_output_or_execution'));
  check(() => assert.equal(approved.payload.finalPreflight.allMatchEntropyRequest, true));
  check(() => assert.equal(approved.payload.scopeReview.exactScopeMatch, true));
  const duplicate = decideProductionExecutionEntropyGeneration(base);
  check(() => assert.equal(duplicate.idempotent, true));
  await rejects(() => decideProductionExecutionEntropyGeneration({ ...base, reviewerNote: 'A conflicting decision rationale for the same entropy request record.' }), /different signed/);
  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p119c-'));
  const changedRequest = makeRequest(changedRoot, { changed: true });
  await rejects(() => decideProductionExecutionEntropyGeneration(makeOptions(changedRoot, changedRequest, new ProductionExecutionEntropyGenerationDecisionStore(path.join(changedRoot, 'decisions.jsonl')), new AuditLog(path.join(changedRoot, 'audit.json')), clock)), /Final entropy-decision preflight/);
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p119m-'));
  const missingRequest = makeRequest(missingRoot, { missing: true });
  await rejects(() => decideProductionExecutionEntropyGeneration(makeOptions(missingRoot, missingRequest, new ProductionExecutionEntropyGenerationDecisionStore(path.join(missingRoot, 'decisions.jsonl')), new AuditLog(path.join(missingRoot, 'audit.json')), clock)), /Final entropy-decision preflight/);
  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p119s-'));
  const scopeRequest = makeRequest(scopeRoot, { scopeChanged: true });
  await rejects(() => decideProductionExecutionEntropyGeneration(makeOptions(scopeRoot, scopeRequest, new ProductionExecutionEntropyGenerationDecisionStore(path.join(scopeRoot, 'decisions.jsonl')), new AuditLog(path.join(scopeRoot, 'audit.json')), clock)), /operation identity is invalid|scope does not exactly match/);
  const expiredStore = new ProductionExecutionEntropyGenerationDecisionStore(path.join(root, 'expired-decisions.jsonl'));
  await rejects(() => decideProductionExecutionEntropyGeneration(makeOptions(root, request, expiredStore, new AuditLog(path.join(root, 'expired-audit.json')), () => new Date('2026-07-30T00:30:12.000Z'))), /active entropy generation request/);
  const rejectionStore = new ProductionExecutionEntropyGenerationDecisionStore(path.join(root, 'rejection-decisions.jsonl'));
  const rejection = decideProductionExecutionEntropyGeneration(makeOptions(root, request, rejectionStore, new AuditLog(path.join(root, 'rejection-audit.json')), () => new Date('2026-07-30T00:30:20.000Z'), { decision: 'reject', completedReviews: completeReviews(false), reviewerNote: 'Reject the expired request without any file preflight or entropy generation.' }));
  check(() => assert.equal(rejection.decision, 'reject'));
  const rejectedRecord = rejectionStore.readRecords()[0];
  check(() => assert.equal(rejectedRecord.payload.finalPreflight.required, false));
  check(() => assert.equal(rejectedRecord.payload.scopeReview.required, false));
  check(() => assert.equal(rejectedRecord.payload.nextAction, 'none'));
  await rejects(() => decideProductionExecutionEntropyGeneration({
    ...makeOptions(root, request, new ProductionExecutionEntropyGenerationDecisionStore(path.join(root, 'invalid-upstream.jsonl')), new AuditLog(path.join(root, 'invalid-upstream-audit.json')), clock),
    upstreamIntegrityChecks: [{ label: 'Production execution plan', store: new FakeStore([], false), signingKey: 'k'.repeat(40) }],
  }), /Production execution plan ledger verification failed/);
  const tampered = JSON.parse(fs.readFileSync(path.join(root, 'decisions.jsonl'), 'utf8').trim());
  tampered.payload.reviewer.note = 'tampered';
  const tamperedPath = path.join(root, 'tampered.jsonl');
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
  check(() => assert.equal(new ProductionExecutionEntropyGenerationDecisionStore(tamperedPath).verify('k'.repeat(40)).valid, false));
  const mutated = JSON.parse(JSON.stringify(approved.payload));
  mutated.entropyState.entropyGenerated = true;
  check(() => assert.throws(() => assertEntropyGenerationDecisionPayload(mutated), /cannot select a source, produce entropy/));
  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.entropySourceSelected === false && entry.details.entropyGenerated === false
      && entry.details.entropyOutputProduced === false && entry.details.productionWrites === 0
      && entry.details.commitActions === 0 && entry.details.deploymentActions === 0
  )), true));
  console.log(JSON.stringify({
    ok: true,
    tests: checks,
    signedEntropyGenerationDecisions: decisionStore.readRecords().length + rejectionStore.readRecords().length,
    approved: 1,
    rejected: 1,
    candidates: result.candidateCount,
    operations: result.operationCount,
    entropySourceSelected: false,
    entropyGenerated: false,
    entropyOutputProduced: false,
    tokenMaterialGenerated: false,
    tokenMaterialIssued: false,
    bearerSecretGenerated: false,
    bearerSecretIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, null, 2));
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });