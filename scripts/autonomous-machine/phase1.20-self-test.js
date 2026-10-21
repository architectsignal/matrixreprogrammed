#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
for (const [name, exports] of Object.entries({
  'production-execution-entropy-generation-request-store': { assertEntropyGenerationRequestPayload: () => true },
  'production-execution-entropy-generation-decision-store': { assertEntropyGenerationDecisionPayload: () => true },
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

const {
  ProductionExecutionEntropySourceSelectionRequestStore,
  assertEntropySourceSelectionRequestPayload,
} = require('./production-execution-entropy-source-selection-request-store');
const {
  requestProductionExecutionEntropySourceSelection,
} = require('./production-execution-entropy-source-selection-request-service');

class FakeStore {
  constructor(records = [], valid = true) { this.records = records; this.valid = valid; }
  verify() { return this.valid ? { valid: true, records: this.records.length } : { valid: false, reason: 'forced_invalid' }; }
  readRecords() { return this.records; }
}
class AuditLog {
  constructor(filePath) { this.filePath = filePath; this.entries = []; }
  append(type, details, actor) {
    this.entries.push({ type, details, actor });
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries), 'utf8');
  }
  verify() { return { valid: true, entries: this.entries.length }; }
  readEntries() { return this.entries; }
}
const h = (value) => sha256(value);

function makeChain(root, options = {}) {
  const firstPath = 'target-a.html';
  const secondPath = 'evidence-a.html';
  fs.writeFileSync(path.join(root, firstPath), options.changed ? 'alpha-changed' : 'alpha');
  if (!options.missing) fs.writeFileSync(path.join(root, secondPath), 'beta');
  const firstHash = hashBytes(Buffer.from('alpha'));
  const secondHash = hashBytes(Buffer.from('beta'));
  const operations = [{
    sequence: 1,
    targetId: 'dossier:test',
    operation: options.scopeChanged ? 'wrong' : 'manual_review_and_integrate_evidence',
    candidatePaths: [firstPath, secondPath],
    candidateHashes: [
      { proposedRepositoryPath: firstPath, sha256: firstHash, bytes: 5 },
      { proposedRepositoryPath: secondPath, sha256: secondHash, bytes: 4 },
    ],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const targetIds = ['dossier:test'];
  const scopeHash = h(stableStringify({ targetIds, operations }));
  const requestCandidates = [
    { proposedRepositoryPath: firstPath, currentSha256: firstHash, currentBytes: 5 },
    { proposedRepositoryPath: secondPath, currentSha256: secondHash, currentBytes: 4 },
  ];
  const entropyRequest = {
    id: 'entropy-request-1',
    recordHash: h('entropy-request-record'),
    payloadHash: h('entropy-request-payload'),
    payload: {
      validity: {
        validFrom: '2026-07-30T00:58:00.000Z',
        expiresAt: '2026-07-30T00:58:12.000Z',
      },
      entropyState: {
        entropySourceSelected: false,
        entropyGenerated: false,
        entropyOutput: null,
      },
      scope: { recomputedScopeHash: scopeHash },
    },
  };
  const decisionCandidates = requestCandidates.map((candidate) => ({
    ...candidate,
    entropyRequestSha256: candidate.currentSha256,
    entropyRequestBytes: candidate.currentBytes,
    matchEntropyRequest: true,
    writeAllowed: false,
  }));
  const entropyDecision = {
    id: 'entropy-decision-1',
    recordHash: h('entropy-decision-record'),
    payloadHash: h('entropy-decision-payload'),
    payload: {
      decision: 'approve',
      status: 'approved_entropy_generation_request_record_only',
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      entropyRequest: {
        id: entropyRequest.id,
        recordHash: entropyRequest.recordHash,
        payloadHash: entropyRequest.payloadHash,
        applicationId: 'application-1',
        applicationFingerprint: h('application-fingerprint'),
      },
      finalPreflight: {
        required: true,
        allMatchEntropyRequest: true,
        snapshotHash: h(stableStringify(decisionCandidates)),
        candidates: decisionCandidates,
      },
      scopeReview: {
        required: true,
        exactScopeMatch: true,
        entropyRequestScopeHash: scopeHash,
        recomputedScopeHash: scopeHash,
        operationCount: 1,
        candidateCount: 2,
        operations,
      },
      entropyState: {
        entropySourceSelected: false,
        entropyGenerated: false,
        entropyOutput: null,
        entropyDigest: null,
      },
      targetIds,
    },
  };
  return { entropyRequest, entropyDecision };
}

function buildOptions(root, chain, store, auditLog, clock) {
  const key = 'k'.repeat(40);
  const commonStores = {
    changeRequestStore: new FakeStore(),
    changeDecisionStore: new FakeStore(),
    planStore: new FakeStore(),
    planDecisionStore: new FakeStore(),
    authorisationRequestStore: new FakeStore(),
    authorisationDecisionStore: new FakeStore(),
    tokenRequestStore: new FakeStore(),
    tokenDecisionStore: new FakeStore(),
    tokenIssuanceRequestStore: new FakeStore(),
    tokenIssuanceDecisionStore: new FakeStore(),
    tokenMaterialGenerationRequestStore: new FakeStore(),
    tokenMaterialGenerationDecisionStore: new FakeStore(),
  };
  return {
    entropyGenerationDecisionId: chain.entropyDecision.id,
    ...commonStores,
    entropyGenerationRequestStore: new FakeStore([chain.entropyRequest]),
    entropyGenerationDecisionStore: new FakeStore([chain.entropyDecision]),
    entropySourceSelectionRequestStore: store,
    auditLog,
    repositoryRoot: root,
    changeRequestSigningKey: key,
    changeDecisionSigningKey: key,
    planSigningKey: key,
    planDecisionSigningKey: key,
    authorisationRequestSigningKey: key,
    authorisationDecisionSigningKey: key,
    tokenRequestSigningKey: key,
    tokenDecisionSigningKey: key,
    tokenIssuanceRequestSigningKey: key,
    tokenIssuanceDecisionSigningKey: key,
    tokenMaterialGenerationRequestSigningKey: key,
    tokenMaterialGenerationDecisionSigningKey: key,
    entropyGenerationRequestSigningKey: key,
    entropyGenerationDecisionSigningKey: key,
    entropySourceSelectionRequestSigningKey: key,
    requesterName: 'phase120-requester',
    requesterRole: 'production-owner',
    requesterNote: 'Request a source-selection review record without selecting a provider or producing entropy.',
    durationSeconds: 5,
    clock,
  };
}

let checks = 0;
function check(fn) { fn(); checks += 1; }
async function rejects(fn, pattern) {
  let matched = false;
  try { await fn(); }
  catch (error) { matched = pattern.test(error.message); }
  assert.equal(matched, true, pattern);
  checks += 1;
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase120-'));
  const chain = makeChain(root);
  const store = new ProductionExecutionEntropySourceSelectionRequestStore(path.join(root, 'requests.jsonl'));
  const auditLog = new AuditLog(path.join(root, 'audit.json'));
  const clock = () => new Date('2026-07-30T00:58:03.000Z');
  const base = buildOptions(root, chain, store, auditLog, clock);

  await rejects(() => requestProductionExecutionEntropySourceSelection({ ...base, entropySourceSelectionRequestSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => requestProductionExecutionEntropySourceSelection({ ...base, durationSeconds: 1 }), /between 2 and 10/);
  await rejects(() => requestProductionExecutionEntropySourceSelection({ ...base, durationSeconds: 11 }), /between 2 and 10/);
  await rejects(() => requestProductionExecutionEntropySourceSelection({ ...base, requesterNote: 'short' }), /requesterNote/);

  const result = requestProductionExecutionEntropySourceSelection(base);
  for (const [field, value] of Object.entries({
    sourceSelectionRequested: true,
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
    candidateCount: 2,
    operationCount: 1,
  })) check(() => assert.equal(result[field], value));

  check(() => assert.equal(store.verify('k'.repeat(40)).valid, true));
  check(() => assert.equal(store.verify('z'.repeat(40)).valid, false));
  const record = store.readRecords()[0];
  check(() => assert.equal(assertEntropySourceSelectionRequestPayload(record.payload), true));
  check(() => assert.equal(record.payload.status, 'pending_manual_entropy_source_selection_review'));
  check(() => assert.deepEqual(record.payload.selectionState.permittedSourceClasses, ['operating_system_csprng']));
  check(() => assert.equal(record.payload.selectionState.requestedSourceClass, null));
  check(() => assert.equal(record.payload.selectionState.providerSelected, false));
  check(() => assert.equal(record.payload.selectionState.providerName, null));
  check(() => assert.equal(record.payload.selectionState.entropyBytesRequested, 0));
  check(() => assert.equal(record.payload.selectionState.entropyOutput, null));
  check(() => assert.equal(record.payload.nextAction, 'separate_human_entropy_source_selection_decision_no_source_or_entropy_output'));

  const duplicate = requestProductionExecutionEntropySourceSelection(base);
  check(() => assert.equal(duplicate.idempotent, true));
  await rejects(() => requestProductionExecutionEntropySourceSelection({
    ...base,
    requesterNote: 'A conflicting source-selection rationale for the same signed entropy decision.',
  }), /different signed/);
  await rejects(() => requestProductionExecutionEntropySourceSelection({
    ...base,
    clock: () => new Date('2026-07-30T00:58:12.000Z'),
  }), /Expired entropy source selection request/);

  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase120-changed-'));
  const changedChain = makeChain(changedRoot, { changed: true });
  await rejects(() => requestProductionExecutionEntropySourceSelection(buildOptions(
    changedRoot,
    changedChain,
    new ProductionExecutionEntropySourceSelectionRequestStore(path.join(changedRoot, 'requests.jsonl')),
    new AuditLog(path.join(changedRoot, 'audit.json')),
    clock,
  )), /Last-moment entropy source selection preflight failed/);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase120-missing-'));
  const missingChain = makeChain(missingRoot, { missing: true });
  await rejects(() => requestProductionExecutionEntropySourceSelection(buildOptions(
    missingRoot,
    missingChain,
    new ProductionExecutionEntropySourceSelectionRequestStore(path.join(missingRoot, 'requests.jsonl')),
    new AuditLog(path.join(missingRoot, 'audit.json')),
    clock,
  )), /Last-moment entropy source selection preflight failed/);

  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase120-scope-'));
  const scopeChain = makeChain(scopeRoot, { scopeChanged: true });
  await rejects(() => requestProductionExecutionEntropySourceSelection(buildOptions(
    scopeRoot,
    scopeChain,
    new ProductionExecutionEntropySourceSelectionRequestStore(path.join(scopeRoot, 'requests.jsonl')),
    new AuditLog(path.join(scopeRoot, 'audit.json')),
    clock,
  )), /scope does not exactly match/);

  await rejects(() => requestProductionExecutionEntropySourceSelection({
    ...base,
    planStore: new FakeStore([], false),
    entropySourceSelectionRequestStore: new ProductionExecutionEntropySourceSelectionRequestStore(path.join(root, 'invalid-ledger.jsonl')),
  }), /Production execution plan ledger verification failed/);

  const tampered = JSON.parse(fs.readFileSync(path.join(root, 'requests.jsonl'), 'utf8').trim());
  tampered.payload.requester.note = 'tampered request';
  const tamperedPath = path.join(root, 'tampered.jsonl');
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`, 'utf8');
  check(() => assert.equal(new ProductionExecutionEntropySourceSelectionRequestStore(tamperedPath).verify('k'.repeat(40)).valid, false));

  const selectedMutation = JSON.parse(JSON.stringify(record.payload));
  selectedMutation.selectionState.entropySourceSelected = true;
  selectedMutation.selectionState.entropySource = 'some-provider';
  check(() => assert.throws(() => assertEntropySourceSelectionRequestPayload(selectedMutation), /cannot select a provider/));
  const bytesMutation = JSON.parse(JSON.stringify(record.payload));
  bytesMutation.selectionState.entropyBytesRequested = 32;
  check(() => assert.throws(() => assertEntropySourceSelectionRequestPayload(bytesMutation), /cannot select a provider/));

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.sourceSelectionRequested === true
      && entry.details.entropySourceSelected === false
      && entry.details.entropyGenerated === false
      && entry.details.entropyOutputProduced === false
      && entry.details.productionWrites === 0
  )), true));

  console.log(JSON.stringify({
    ok: true,
    tests: checks,
    signedEntropySourceSelectionRequests: store.readRecords().length,
    candidates: result.candidateCount,
    operations: result.operationCount,
    sourceSelectionRequested: true,
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
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
