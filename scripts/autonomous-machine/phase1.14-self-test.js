#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');
const { AuditLog } = require('./audit-log');

function hashBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

for (const [name, exports] of Object.entries({
  'production-change-request-store': { assertChangeRequestPayload: () => true },
  'production-change-decision-store': { assertDecisionPayload: () => true },
  'production-execution-plan-store': { assertExecutionPlanPayload: () => true },
  'production-execution-plan-decision-store': { assertExecutionPlanDecisionPayload: () => true },
  'production-execution-authorisation-request-store': { assertExecutionAuthorisationRequestPayload: () => true },
  'production-execution-authorisation-decision-store': { assertExecutionAuthorisationDecisionPayload: () => true },
  'production-execution-token-request-store': { assertExecutionTokenRequestPayload: () => true },
  'production-execution-token-decision-store': { assertExecutionTokenDecisionPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (repositoryRoot, candidatePath) => {
      const filePath = path.join(repositoryRoot, candidatePath);
      if (!fs.existsSync(filePath)) return { exists: false, currentSha256: null, currentBytes: null };
      const stat = fs.statSync(filePath);
      return {
        exists: stat.isFile(),
        currentSha256: hashBytes(fs.readFileSync(filePath)),
        currentBytes: stat.size,
      };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const {
  ProductionExecutionTokenIssuanceRequestStore,
  assertExecutionTokenIssuanceRequestPayload,
} = require('./production-execution-token-issuance-request-store');
const {
  requestProductionExecutionTokenIssuance,
} = require('./production-execution-token-issuance-request-service');

let checks = 0;
function check(fn) { fn(); checks += 1; }
async function rejects(fn, pattern) {
  let matched = false;
  try { await fn(); }
  catch (error) { matched = pattern.test(error.message); }
  assert.equal(matched, true);
  checks += 1;
}

class FakeStore {
  constructor(records, valid = true) { this.records = records; this.valid = valid; }
  verify() {
    return this.valid
      ? { valid: true, records: this.records.length }
      : { valid: false, reason: 'forced_invalid' };
  }
  readRecords() { return this.records; }
}

const h = (value) => sha256(value);

function makeChain(root, options = {}) {
  const primary = 'target-a.html';
  const evidence = 'evidence-a.html';
  fs.writeFileSync(path.join(root, primary), options.changed ? 'alpha-changed' : 'alpha');
  if (!options.missing) fs.writeFileSync(path.join(root, evidence), 'beta');
  const primaryHash = hashBytes(Buffer.from('alpha'));
  const evidenceHash = hashBytes(Buffer.from('beta'));

  const changeRequest = {
    id: 'change-request-1',
    recordHash: h('crr'),
    payloadHash: h('crp'),
    payload: { application: { id: 'app-1', fingerprint: h('app') } },
  };
  const changeDecision = {
    id: 'change-decision-1',
    recordHash: h('cdr'),
    payloadHash: h('cdp'),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const targetMappings = [{
    targetId: 'dossier:test',
    candidates: [
      { proposedRepositoryPath: primary, currentSha256: primaryHash, currentBytes: 5 },
      { proposedRepositoryPath: evidence, currentSha256: evidenceHash, currentBytes: 4 },
    ],
  }];
  const steps = [{
    sequence: 1,
    targetId: 'dossier:test',
    action: options.scopeChanged ? 'unexpected_operation' : 'manual_review_and_integrate_evidence',
    candidatePaths: [primary, evidence],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const plan = {
    id: 'plan-1',
    recordHash: h('pr'),
    payloadHash: h('pp'),
    payload: {
      repositorySnapshot: { maxFileBytes: 1024 },
      targetMappings,
      executionPlan: { steps },
    },
  };
  const planDecision = {
    id: 'plan-decision-1',
    recordHash: h('pdr'),
    payloadHash: h('pdp'),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const authorisationRequest = {
    id: 'auth-request-1',
    recordHash: h('arr'),
    payloadHash: h('arp'),
    payload: { validity: { expiresAt: '2026-07-29T22:10:00.000Z' } },
  };
  const authorisationDecision = {
    id: 'auth-decision-1',
    recordHash: h('adr'),
    payloadHash: h('adp'),
    payload: {
      decision: 'approve',
      executionAuthorityGranted: false,
      authorisationGranted: false,
    },
  };

  const requestCandidates = [
    {
      proposedRepositoryPath: primary,
      currentSha256: primaryHash,
      currentBytes: 5,
      authorisationSha256: primaryHash,
      authorisationBytes: 5,
      matchAuthorisationDecision: true,
      writeAllowed: false,
    },
    {
      proposedRepositoryPath: evidence,
      currentSha256: evidenceHash,
      currentBytes: 4,
      authorisationSha256: evidenceHash,
      authorisationBytes: 4,
      matchAuthorisationDecision: true,
      writeAllowed: false,
    },
  ];

  const tokenOperations = [{
    sequence: 1,
    targetId: 'dossier:test',
    operation: 'manual_review_and_integrate_evidence',
    candidatePaths: [primary, evidence],
    candidateHashes: [
      { proposedRepositoryPath: primary, sha256: primaryHash, bytes: 5 },
      { proposedRepositoryPath: evidence, sha256: evidenceHash, bytes: 4 },
    ],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const scopeHash = h(stableStringify({
    targetIds: ['dossier:test'],
    operations: tokenOperations,
  }));

  const tokenRequest = {
    id: 'token-request-1',
    recordHash: h('trr'),
    payloadHash: h('trp'),
    payload: {
      authorisationDecision: {
        id: authorisationDecision.id,
        recordHash: authorisationDecision.recordHash,
        payloadHash: authorisationDecision.payloadHash,
        authorisationRequestId: authorisationRequest.id,
        executionPlanDecisionId: planDecision.id,
        executionPlanId: plan.id,
        sourceDecisionId: changeDecision.id,
        changeRequestId: changeRequest.id,
        applicationId: 'app-1',
        applicationFingerprint: h('app'),
        candidateSnapshotHash: h(stableStringify(targetMappings)),
        executionStepsHash: h(stableStringify(steps)),
        backupManifestHash: h('backup'),
        restoreManifestHash: h('restore'),
      },
      validity: {
        validFrom: '2026-07-29T22:02:00.000Z',
        expiresAt: '2026-07-29T22:04:00.000Z',
        upstreamExpiresAt: '2026-07-29T22:10:00.000Z',
      },
      finalSnapshot: {
        snapshotHash: h(stableStringify(requestCandidates)),
        candidates: requestCandidates,
      },
      scope: {
        scopeHash,
        targetIds: ['dossier:test'],
        operations: tokenOperations,
      },
    },
  };

  const decisionCandidates = requestCandidates.map((candidate) => ({
    proposedRepositoryPath: candidate.proposedRepositoryPath,
    currentSha256: candidate.currentSha256,
    currentBytes: candidate.currentBytes,
    requestSha256: candidate.currentSha256,
    requestBytes: candidate.currentBytes,
    matchRequest: true,
    writeAllowed: false,
  }));

  const decisionOperations = options.decisionScopeChanged
    ? tokenOperations.map((operation) => ({ ...operation, operation: 'unexpected_operation' }))
    : tokenOperations;
  const decisionScopeHash = h(stableStringify({
    targetIds: ['dossier:test'],
    operations: decisionOperations,
  }));

  const tokenDecision = {
    id: 'token-decision-1',
    recordHash: h('tdr'),
    payloadHash: h('tdp'),
    payload: {
      decision: 'approve',
      status: 'approved_execution_token_request_record_only',
      tokenRequest: {
        id: tokenRequest.id,
        recordHash: tokenRequest.recordHash,
        payloadHash: tokenRequest.payloadHash,
        authorisationDecisionId: authorisationDecision.id,
        authorisationRequestId: authorisationRequest.id,
        executionPlanDecisionId: planDecision.id,
        executionPlanId: plan.id,
        sourceDecisionId: changeDecision.id,
        changeRequestId: changeRequest.id,
        applicationId: 'app-1',
        applicationFingerprint: h('app'),
        scopeHash,
        finalSnapshotHash: tokenRequest.payload.finalSnapshot.snapshotHash,
        candidateSnapshotHash: tokenRequest.payload.authorisationDecision.candidateSnapshotHash,
        executionStepsHash: tokenRequest.payload.authorisationDecision.executionStepsHash,
        backupManifestHash: h('backup'),
        restoreManifestHash: h('restore'),
      },
      finalPreflight: {
        required: true,
        snapshotHash: h(stableStringify(decisionCandidates)),
        allMatchRequest: true,
        candidates: decisionCandidates,
      },
      scopeReview: {
        required: true,
        requestScopeHash: scopeHash,
        recomputedScopeHash: decisionScopeHash,
        exactScopeMatch: !options.decisionScopeChanged,
        operationCount: 1,
        candidateCount: 2,
        operations: decisionOperations,
      },
      targetIds: ['dossier:test'],
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      tokenIssued: false,
      executionTokenAvailable: false,
    },
  };

  return {
    primary,
    evidence,
    changeRequest,
    changeDecision,
    plan,
    planDecision,
    authorisationRequest,
    authorisationDecision,
    tokenRequest,
    tokenDecision,
  };
}

function baseOptions(root, chain, issuanceStore, auditLog, clock) {
  const key = 'k'.repeat(40);
  return {
    executionTokenDecisionId: chain.tokenDecision.id,
    changeRequestStore: new FakeStore([chain.changeRequest]),
    changeDecisionStore: new FakeStore([chain.changeDecision]),
    planStore: new FakeStore([chain.plan]),
    planDecisionStore: new FakeStore([chain.planDecision]),
    authorisationRequestStore: new FakeStore([chain.authorisationRequest]),
    authorisationDecisionStore: new FakeStore([chain.authorisationDecision]),
    tokenRequestStore: new FakeStore([chain.tokenRequest]),
    tokenDecisionStore: new FakeStore([chain.tokenDecision]),
    tokenIssuanceRequestStore: issuanceStore,
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
    requesterName: 'phase114-requester',
    requesterRole: 'production-owner',
    requesterNote: 'Request a separate token issuance review without issuing token material.',
    durationSeconds: 30,
    clock,
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase114-repo-'));
  const runtime = path.join(root, '.autonomous-machine');
  fs.mkdirSync(runtime, { recursive: true });
  const chain = makeChain(root);
  const storePath = path.join(runtime, 'token-issuance-requests.jsonl');
  const issuanceStore = new ProductionExecutionTokenIssuanceRequestStore(storePath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));
  const sentinel = path.join(root, 'production-sentinel.json');
  fs.writeFileSync(sentinel, '{"safe":true}');
  const sentinelHash = hashBytes(fs.readFileSync(sentinel));
  const clock = () => new Date('2026-07-29T22:02:30.000Z');
  const base = baseOptions(root, chain, issuanceStore, auditLog, clock);

  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, tokenIssuanceRequestSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, executionTokenDecisionId: '' }), /executionTokenDecisionId/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, requesterName: '' }), /requesterName/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, requesterRole: '' }), /requesterRole/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, requesterNote: 'short' }), /requesterNote/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, durationSeconds: 9 }), /between 10 and 60/);
  await rejects(() => requestProductionExecutionTokenIssuance({ ...base, durationSeconds: 61 }), /between 10 and 60/);

  const created = requestProductionExecutionTokenIssuance(base);
  check(() => assert.equal(created.candidateCount, 2));
  check(() => assert.equal(created.operationCount, 1));
  check(() => assert.equal(created.tokenIssued, false));
  check(() => assert.equal(created.tokenMaterialIssued, false));
  check(() => assert.equal(created.readyForExecution, false));
  check(() => assert.equal(created.executionAuthorityGranted, false));
  check(() => assert.equal(created.authorisationGranted, false));
  check(() => assert.equal(created.productionWrites, 0));
  check(() => assert.equal(issuanceStore.readRecords().length, 1));
  check(() => assert.equal(issuanceStore.verify('k'.repeat(40)).valid, true));
  check(() => assert.equal(issuanceStore.verify('z'.repeat(40)).valid, false));
  check(() => assert.equal(fs.readFileSync(storePath, 'utf8').includes('k'.repeat(40)), false));

  const record = issuanceStore.readRecords()[0];
  check(() => assert.equal(assertExecutionTokenIssuanceRequestPayload(record.payload), true));
  check(() => assert.equal(record.payload.status, 'pending_manual_single_use_execution_token_issuance_review'));
  check(() => assert.equal(record.payload.authority, 'single_use_execution_token_issuance_request_only_no_token_or_execution_authority'));
  check(() => assert.equal(record.payload.validity.durationSeconds, 30));
  check(() => assert.equal(record.payload.validity.expiresAt, '2026-07-29T22:03:00.000Z'));
  check(() => assert.equal(record.payload.issuanceState.issuanceRequested, true));
  check(() => assert.equal(record.payload.issuanceState.tokenMaterialIssued, false));
  check(() => assert.equal(record.payload.issuanceState.tokenDigest, null));
  check(() => assert.equal(record.payload.issuanceState.tokenId, null));
  check(() => assert.equal(record.payload.issuanceState.bearerSecretIssued, false));
  check(() => assert.equal(record.payload.issuanceState.credentialIssued, false));
  check(() => assert.equal(record.payload.lastMomentPreflight.allMatchTokenDecision, true));
  check(() => assert.equal(record.payload.lastMomentPreflight.candidates.length, 2));
  check(() => assert.equal(record.payload.scope.exactScopeMatch, true));
  check(() => assert.equal(record.payload.scope.operationCount, 1));
  check(() => assert.equal(record.payload.scope.candidateCount, 2));
  check(() => assert.equal(record.payload.tokenIssued, false));
  check(() => assert.equal(record.payload.executionTokenAvailable, false));
  check(() => assert.equal(record.payload.readyForExecution, false));
  check(() => assert.equal(record.payload.executionAuthorityGranted, false));
  check(() => assert.equal(record.payload.safety.executionAllowed, false));
  check(() => assert.equal(record.payload.safety.productionWriteAllowed, false));

  const duplicate = requestProductionExecutionTokenIssuance(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.executionTokenIssuanceRequestId, created.executionTokenIssuanceRequestId));
  check(() => assert.equal(issuanceStore.readRecords().length, 1));

  await rejects(() => requestProductionExecutionTokenIssuance({
    ...base,
    requesterNote: 'A conflicting issuance request rationale that must fail closed.',
  }), /different signed/);

  await rejects(() => requestProductionExecutionTokenIssuance({
    ...base,
    clock: () => new Date('2026-07-29T22:03:55.000Z'),
    tokenIssuanceRequestStore: new ProductionExecutionTokenIssuanceRequestStore(path.join(runtime, 'short-window.jsonl')),
    durationSeconds: 10,
  }), /at least 10 seconds/);

  await rejects(() => requestProductionExecutionTokenIssuance({
    ...base,
    clock: () => new Date('2026-07-29T22:03:40.000Z'),
    tokenIssuanceRequestStore: new ProductionExecutionTokenIssuanceRequestStore(path.join(runtime, 'duration-window.jsonl')),
    durationSeconds: 30,
  }), /duration exceeds/);

  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase114-changed-'));
  const changedChain = makeChain(changedRoot, { changed: true });
  await rejects(() => requestProductionExecutionTokenIssuance(baseOptions(
    changedRoot,
    changedChain,
    new ProductionExecutionTokenIssuanceRequestStore(path.join(changedRoot, 'issuance.jsonl')),
    new AuditLog(path.join(changedRoot, 'audit.jsonl')),
    clock,
  )), /Last-moment token-issuance hash/);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase114-missing-'));
  const missingChain = makeChain(missingRoot, { missing: true });
  await rejects(() => requestProductionExecutionTokenIssuance(baseOptions(
    missingRoot,
    missingChain,
    new ProductionExecutionTokenIssuanceRequestStore(path.join(missingRoot, 'issuance.jsonl')),
    new AuditLog(path.join(missingRoot, 'audit.jsonl')),
    clock,
  )), /Last-moment token-issuance hash/);

  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase114-scope-'));
  const scopeChain = makeChain(scopeRoot, { decisionScopeChanged: true });
  await rejects(() => requestProductionExecutionTokenIssuance(baseOptions(
    scopeRoot,
    scopeChain,
    new ProductionExecutionTokenIssuanceRequestStore(path.join(scopeRoot, 'issuance.jsonl')),
    new AuditLog(path.join(scopeRoot, 'audit.jsonl')),
    clock,
  )), /approved, exact/);

  await rejects(() => requestProductionExecutionTokenIssuance({
    ...base,
    planStore: new FakeStore([chain.plan], false),
    tokenIssuanceRequestStore: new ProductionExecutionTokenIssuanceRequestStore(path.join(runtime, 'invalid-upstream.jsonl')),
  }), /Production execution plan ledger verification failed/);

  const expiredRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase114-expired-'));
  const expiredChain = makeChain(expiredRoot);
  const expiredStore = new ProductionExecutionTokenIssuanceRequestStore(path.join(expiredRoot, 'issuance.jsonl'));
  const expiredAudit = new AuditLog(path.join(expiredRoot, 'audit.jsonl'));
  requestProductionExecutionTokenIssuance(baseOptions(
    expiredRoot,
    expiredChain,
    expiredStore,
    expiredAudit,
    () => new Date('2026-07-29T22:02:30.000Z'),
  ));
  await rejects(() => requestProductionExecutionTokenIssuance(baseOptions(
    expiredRoot,
    expiredChain,
    expiredStore,
    expiredAudit,
    () => new Date('2026-07-29T22:03:01.000Z'),
  )), /expired; renewal is not supported/);

  const tampered = JSON.parse(fs.readFileSync(storePath, 'utf8').trim());
  tampered.payload.requester.note = 'tampered';
  const tamperedPath = path.join(runtime, 'tampered.jsonl');
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
  check(() => assert.equal(new ProductionExecutionTokenIssuanceRequestStore(tamperedPath).verify('k'.repeat(40)).valid, false));

  const mutated = JSON.parse(JSON.stringify(record.payload));
  mutated.issuanceState.tokenMaterialIssued = true;
  check(() => assert.throws(() => assertExecutionTokenIssuanceRequestPayload(mutated), /cannot issue or consume/));
  const mutatedAuthority = JSON.parse(JSON.stringify(record.payload));
  mutatedAuthority.executionAuthorityGranted = true;
  check(() => assert.throws(() => assertExecutionTokenIssuanceRequestPayload(mutatedAuthority), /cannot grant/));

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.tokenIssued === false
      && entry.details.tokenMaterialIssued === false
      && entry.details.readyForExecution === false
      && entry.details.executionAuthorityGranted === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  )), true));
  check(() => assert.equal(hashBytes(fs.readFileSync(sentinel)), sentinelHash));
  check(() => assert.equal(fs.existsSync(path.join(root, '.git', 'index.lock')), false));
  check(() => assert.equal(fs.existsSync(path.join(root, 'deploy')), false));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedTokenIssuanceRequests: issuanceStore.readRecords().length,
    candidates: created.candidateCount,
    operations: created.operationCount,
    tokenIssued: false,
    tokenMaterialIssued: false,
    readyForExecution: false,
    executionAuthorityGranted: false,
    authorisationGranted: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
    auditEntries: auditLog.verify().entries,
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
