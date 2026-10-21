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
  ProductionExecutionTokenDecisionStore,
  assertExecutionTokenDecisionPayload,
} = require('./production-execution-token-decision-store');
const { decideProductionExecutionToken } = require('./production-execution-token-decision-service');

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
  verify() { return this.valid ? { valid: true, records: this.records.length } : { valid: false, reason: 'forced_invalid' }; }
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
    id: 'change-request-1', recordHash: h('crr'), payloadHash: h('crp'),
    payload: { application: { id: 'app-1', fingerprint: h('app') } },
  };
  const changeDecision = {
    id: 'change-decision-1', recordHash: h('cdr'), payloadHash: h('cdp'),
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
    action: 'manual_review_and_integrate_evidence',
    candidatePaths: [primary, evidence],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const plan = {
    id: 'plan-1', recordHash: h('pr'), payloadHash: h('pp'),
    payload: { repositorySnapshot: { maxFileBytes: 1024 }, targetMappings, executionPlan: { steps } },
  };
  const planDecision = {
    id: 'plan-decision-1', recordHash: h('pdr'), payloadHash: h('pdp'),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const authorisationRequest = {
    id: 'auth-request-1', recordHash: h('arr'), payloadHash: h('arp'),
    payload: { validity: { expiresAt: '2026-07-29T22:10:00.000Z' } },
  };
  const authorisationDecision = {
    id: 'auth-decision-1', recordHash: h('adr'), payloadHash: h('adp'),
    payload: {
      decision: 'approve',
      status: 'approved_execution_authorisation_record_only',
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      authorisationRequest: {
        id: authorisationRequest.id,
        recordHash: authorisationRequest.recordHash,
        payloadHash: authorisationRequest.payloadHash,
      },
    },
  };
  const finalCandidates = [
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
  const operations = [{
    sequence: 1,
    targetId: 'dossier:test',
    operation: options.scopeChanged ? 'unexpected_operation' : 'manual_review_and_integrate_evidence',
    candidatePaths: [primary, evidence],
    candidateHashes: [
      { proposedRepositoryPath: primary, sha256: primaryHash, bytes: 5 },
      { proposedRepositoryPath: evidence, sha256: evidenceHash, bytes: 4 },
    ],
    executionAllowed: false,
    productionWriteAllowed: false,
  }];
  const scope = {
    scopeType: 'candidate_paths_and_plan_operations_only',
    targetIds: ['dossier:test'],
    operationCount: 1,
    candidateCount: 2,
    operations,
  };
  scope.scopeHash = h(stableStringify({ targetIds: scope.targetIds, operations: scope.operations }));
  const tokenRequest = {
    id: 'token-request-1', recordHash: h('trr'), payloadHash: h('trp'),
    payload: {
      status: 'pending_manual_single_use_execution_token_review',
      authority: 'single_use_execution_token_request_only_no_token_or_execution_authority',
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
        requestFreshSnapshotHash: h('request-fresh'),
        decisionFreshSnapshotHash: h('decision-fresh'),
        backupManifestHash: h('backup'),
        restoreManifestHash: h('restore'),
      },
      validity: {
        validFrom: '2026-07-29T22:02:00.000Z',
        expiresAt: '2026-07-29T22:04:00.000Z',
        upstreamExpiresAt: '2026-07-29T22:10:00.000Z',
      },
      tokenState: {
        tokenMaterialIssued: false, tokenDigest: null, tokenId: null,
        consumed: false, useCount: 0, maxUses: 1,
      },
      finalSnapshot: {
        snapshotHash: h(stableStringify(finalCandidates)),
        allMatchAuthorisationDecision: true,
        candidates: finalCandidates,
      },
      scope,
      targetIds: ['dossier:test'],
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      tokenIssued: false,
      executionTokenAvailable: false,
    },
  };
  return {
    primary, evidence, changeRequest, changeDecision, plan, planDecision,
    authorisationRequest, authorisationDecision, tokenRequest,
  };
}

function baseOptions(root, chain, tokenDecisionStore, auditLog, clock) {
  const key = 'k'.repeat(40);
  return {
    executionTokenRequestId: chain.tokenRequest.id,
    changeRequestStore: new FakeStore([chain.changeRequest]),
    changeDecisionStore: new FakeStore([chain.changeDecision]),
    planStore: new FakeStore([chain.plan]),
    planDecisionStore: new FakeStore([chain.planDecision]),
    authorisationRequestStore: new FakeStore([chain.authorisationRequest]),
    authorisationDecisionStore: new FakeStore([chain.authorisationDecision]),
    tokenRequestStore: new FakeStore([chain.tokenRequest]),
    tokenDecisionStore,
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
    decision: 'approve',
    reviewerName: 'phase113-reviewer',
    reviewerRole: 'production-owner',
    reviewerNote: 'Approve the token request record for a separate issuance review only.',
    completedReviews: {
      tokenRequestWindowReview: true,
      finalPreflightReview: true,
      scopeReview: true,
      backupEvidenceReview: true,
      restoreEvidenceReview: true,
      productionOwnerReview: true,
    },
    clock,
  };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase113-repo-'));
  const runtime = path.join(root, '.autonomous-machine');
  fs.mkdirSync(runtime, { recursive: true });
  const chain = makeChain(root);
  const storePath = path.join(runtime, 'token-decisions.jsonl');
  const tokenDecisionStore = new ProductionExecutionTokenDecisionStore(storePath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));
  const sentinel = path.join(root, 'production-sentinel.json');
  fs.writeFileSync(sentinel, '{"safe":true}');
  const sentinelHash = hashBytes(fs.readFileSync(sentinel));
  const clock = () => new Date('2026-07-29T22:02:30.000Z');
  const base = baseOptions(root, chain, tokenDecisionStore, auditLog, clock);

  await rejects(() => decideProductionExecutionToken({ ...base, tokenDecisionSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => decideProductionExecutionToken({ ...base, executionTokenRequestId: '' }), /executionTokenRequestId/);
  await rejects(() => decideProductionExecutionToken({ ...base, decision: 'maybe' }), /approve or reject/);
  await rejects(() => decideProductionExecutionToken({ ...base, reviewerName: '' }), /reviewerName/);
  await rejects(() => decideProductionExecutionToken({ ...base, reviewerRole: '' }), /reviewerRole/);
  await rejects(() => decideProductionExecutionToken({ ...base, reviewerNote: 'short' }), /reviewerNote/);
  await rejects(() => decideProductionExecutionToken({ ...base, completedReviews: {} }), /completedReviews/);
  await rejects(() => decideProductionExecutionToken({
    ...base,
    completedReviews: { ...base.completedReviews, scopeReview: false },
    tokenDecisionStore: new ProductionExecutionTokenDecisionStore(path.join(runtime, 'incomplete.jsonl')),
  }), /completed scopeReview/);

  const approved = decideProductionExecutionToken(base);
  check(() => assert.equal(approved.decision, 'approve'));
  check(() => assert.equal(approved.candidateCount, 2));
  check(() => assert.equal(approved.operationCount, 1));
  check(() => assert.equal(approved.tokenIssued, false));
  check(() => assert.equal(approved.readyForExecution, false));
  check(() => assert.equal(approved.executionAuthorityGranted, false));
  check(() => assert.equal(approved.authorisationGranted, false));
  check(() => assert.equal(approved.productionWrites, 0));
  check(() => assert.equal(tokenDecisionStore.readRecords().length, 1));
  check(() => assert.equal(tokenDecisionStore.verify('k'.repeat(40)).valid, true));
  check(() => assert.equal(tokenDecisionStore.verify('z'.repeat(40)).valid, false));
  check(() => assert.equal(fs.readFileSync(storePath, 'utf8').includes('k'.repeat(40)), false));

  const record = tokenDecisionStore.readRecords()[0];
  check(() => assert.equal(assertExecutionTokenDecisionPayload(record.payload), true));
  check(() => assert.equal(record.payload.status, 'approved_execution_token_request_record_only'));
  check(() => assert.equal(record.payload.authority, 'signed_human_execution_token_decision_only_no_token_or_execution_authority'));
  check(() => assert.equal(record.payload.validityReview.activeAtDecision, true));
  check(() => assert.equal(record.payload.validityReview.remainingSeconds, 90));
  check(() => assert.equal(record.payload.finalPreflight.required, true));
  check(() => assert.equal(record.payload.finalPreflight.allMatchRequest, true));
  check(() => assert.equal(record.payload.finalPreflight.candidates.length, 2));
  check(() => assert.equal(record.payload.scopeReview.required, true));
  check(() => assert.equal(record.payload.scopeReview.exactScopeMatch, true));
  check(() => assert.equal(record.payload.scopeReview.operationCount, 1));
  check(() => assert.equal(record.payload.scopeReview.candidateCount, 2));
  check(() => assert.equal(record.payload.tokenState.tokenMaterialIssued, false));
  check(() => assert.equal(record.payload.tokenState.tokenDigest, null));
  check(() => assert.equal(record.payload.tokenState.tokenId, null));
  check(() => assert.equal(record.payload.tokenState.consumed, false));
  check(() => assert.equal(record.payload.tokenIssued, false));
  check(() => assert.equal(record.payload.executionTokenAvailable, false));
  check(() => assert.equal(record.payload.readyForExecution, false));
  check(() => assert.equal(record.payload.executionAuthorityGranted, false));
  check(() => assert.equal(record.payload.safety.executionAllowed, false));
  check(() => assert.equal(record.payload.safety.productionWriteAllowed, false));

  const duplicate = decideProductionExecutionToken(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.executionTokenDecisionId, approved.executionTokenDecisionId));
  check(() => assert.equal(tokenDecisionStore.readRecords().length, 1));
  await rejects(() => decideProductionExecutionToken({ ...base, decision: 'reject' }), /different signed/);

  await rejects(() => decideProductionExecutionToken({
    ...base,
    clock: () => new Date('2026-07-29T22:04:00.000Z'),
    tokenDecisionStore: new ProductionExecutionTokenDecisionStore(path.join(runtime, 'expired.jsonl')),
  }), /active token request/);
  await rejects(() => decideProductionExecutionToken({
    ...base,
    clock: () => new Date('2026-07-29T22:03:50.000Z'),
    tokenDecisionStore: new ProductionExecutionTokenDecisionStore(path.join(runtime, 'short-window.jsonl')),
  }), /at least 15 seconds/);

  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase113-changed-'));
  const changedChain = makeChain(changedRoot, { changed: true });
  await rejects(() => decideProductionExecutionToken(baseOptions(
    changedRoot,
    changedChain,
    new ProductionExecutionTokenDecisionStore(path.join(changedRoot, 'decisions.jsonl')),
    new AuditLog(path.join(changedRoot, 'audit.jsonl')),
    clock,
  )), /preflight hash/);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase113-missing-'));
  const missingChain = makeChain(missingRoot, { missing: true });
  await rejects(() => decideProductionExecutionToken(baseOptions(
    missingRoot,
    missingChain,
    new ProductionExecutionTokenDecisionStore(path.join(missingRoot, 'decisions.jsonl')),
    new AuditLog(path.join(missingRoot, 'audit.jsonl')),
    clock,
  )), /preflight hash/);

  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase113-scope-'));
  const scopeChain = makeChain(scopeRoot, { scopeChanged: true });
  await rejects(() => decideProductionExecutionToken(baseOptions(
    scopeRoot,
    scopeChain,
    new ProductionExecutionTokenDecisionStore(path.join(scopeRoot, 'decisions.jsonl')),
    new AuditLog(path.join(scopeRoot, 'audit.jsonl')),
    clock,
  )), /scope does not exactly match/);

  await rejects(() => decideProductionExecutionToken({
    ...base,
    planStore: new FakeStore([chain.plan], false),
    tokenDecisionStore: new ProductionExecutionTokenDecisionStore(path.join(runtime, 'invalid-upstream.jsonl')),
  }), /Production execution plan ledger verification failed/);

  const rejectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase113-reject-'));
  const rejectChain = makeChain(rejectRoot);
  const rejectStore = new ProductionExecutionTokenDecisionStore(path.join(rejectRoot, 'decisions.jsonl'));
  const rejected = decideProductionExecutionToken({
    ...baseOptions(
      rejectRoot,
      rejectChain,
      rejectStore,
      new AuditLog(path.join(rejectRoot, 'audit.jsonl')),
      () => new Date('2026-07-29T22:05:00.000Z'),
    ),
    decision: 'reject',
    reviewerName: 'phase113-rejector',
    reviewerRole: 'editorial-reviewer',
    reviewerNote: 'Reject the token request without issuing token material or authority.',
    completedReviews: {
      tokenRequestWindowReview: true,
      finalPreflightReview: false,
      scopeReview: false,
      backupEvidenceReview: false,
      restoreEvidenceReview: false,
      productionOwnerReview: false,
    },
  });
  check(() => assert.equal(rejected.decision, 'reject'));
  check(() => assert.equal(rejected.candidateCount, 0));
  check(() => assert.equal(rejected.operationCount, 0));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.status, 'rejected_execution_token_request_no_token_or_authority'));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.nextAction, 'none'));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.finalPreflight.required, false));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.scopeReview.required, false));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.tokenIssued, false));

  const tampered = JSON.parse(fs.readFileSync(storePath, 'utf8').trim());
  tampered.payload.reviewer.note = 'tampered';
  const tamperedPath = path.join(runtime, 'tampered.jsonl');
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
  check(() => assert.equal(new ProductionExecutionTokenDecisionStore(tamperedPath).verify('k'.repeat(40)).valid, false));

  const mutated = JSON.parse(JSON.stringify(record.payload));
  mutated.tokenState.tokenMaterialIssued = true;
  check(() => assert.throws(() => assertExecutionTokenDecisionPayload(mutated), /cannot issue/));
  const mutatedScope = JSON.parse(JSON.stringify(record.payload));
  mutatedScope.scopeReview.recomputedScopeHash = h('wrong');
  check(() => assert.throws(() => assertExecutionTokenDecisionPayload(mutatedScope), /does not exactly match/));

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.tokenIssued === false
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
    signedExecutionTokenDecisions: tokenDecisionStore.readRecords().length + rejectStore.readRecords().length,
    approved: 1,
    rejected: 1,
    candidates: approved.candidateCount,
    operations: approved.operationCount,
    tokenIssued: false,
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
