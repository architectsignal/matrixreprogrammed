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
  'production-change-request-store': { assertChangeRequestPayload: () => true },
  'production-change-decision-store': { assertDecisionPayload: () => true },
  'production-execution-plan-store': { assertExecutionPlanPayload: () => true },
  'production-execution-plan-decision-store': { assertExecutionPlanDecisionPayload: () => true },
  'production-execution-authorisation-request-store': { assertExecutionAuthorisationRequestPayload: () => true },
  'production-execution-authorisation-decision-store': { assertExecutionAuthorisationDecisionPayload: () => true },
  'production-execution-token-request-store': { assertExecutionTokenRequestPayload: () => true },
  'production-execution-token-decision-store': { assertExecutionTokenDecisionPayload: () => true },
  'production-execution-token-issuance-request-store': { assertExecutionTokenIssuanceRequestPayload: () => true },
  'production-execution-token-issuance-decision-store': { assertExecutionTokenIssuanceDecisionPayload: () => true },
  'production-execution-token-material-generation-request-store': { assertTokenMaterialGenerationRequestPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (repositoryRoot, candidatePath) => {
      const filePath = path.join(repositoryRoot, candidatePath);
      if (!fs.existsSync(filePath)) {
        return { exists: false, currentSha256: null, currentBytes: null };
      }
      const bytes = fs.readFileSync(filePath);
      return { exists: true, currentSha256: hashBytes(bytes), currentBytes: bytes.length };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const {
  ProductionExecutionTokenMaterialGenerationDecisionStore,
  assertTokenMaterialGenerationDecisionPayload,
} = require('./production-execution-token-material-generation-decision-store');
const {
  decideProductionExecutionTokenMaterialGeneration,
} = require('./production-execution-token-material-generation-decision-service');

class FakeStore {
  constructor(records, valid = true) { this.records = records; this.valid = valid; }
  verify() {
    return this.valid
      ? { valid: true, records: this.records.length }
      : { valid: false, reason: 'forced_invalid' };
  }
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
    payload: {
      repositorySnapshot: { maxFileBytes: 1024 },
      targetMappings,
      executionPlan: { steps },
    },
  };
  const planDecision = {
    id: 'plan-decision-1', recordHash: h('pdr'), payloadHash: h('pdp'),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const authorisationRequest = {
    id: 'auth-request-1', recordHash: h('arr'), payloadHash: h('arp'), payload: {},
  };
  const authorisationDecision = {
    id: 'auth-decision-1', recordHash: h('adr'), payloadHash: h('adp'),
    payload: { decision: 'approve', executionAuthorityGranted: false, authorisationGranted: false },
  };

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
  const scopeHash = h(stableStringify({ targetIds: ['dossier:test'], operations }));

  const tokenRequest = {
    id: 'token-request-1', recordHash: h('trr'), payloadHash: h('trp'), payload: {},
  };
  const tokenDecision = {
    id: 'token-decision-1', recordHash: h('tdr'), payloadHash: h('tdp'),
    payload: {
      decision: 'approve', executionAuthorityGranted: false,
      tokenIssued: false, executionTokenAvailable: false,
    },
  };
  const issuanceRequest = {
    id: 'issuance-request-1', recordHash: h('irr'), payloadHash: h('irp'), payload: {},
  };
  const issuanceDecision = {
    id: 'issuance-decision-1', recordHash: h('idr'), payloadHash: h('idp'),
    payload: {
      decision: 'approve',
      status: 'approved_execution_token_issuance_request_record_only',
      readyForExecution: false,
      executionAuthorityGranted: false,
      authorisationGranted: false,
      tokenIssued: false,
      executionTokenAvailable: false,
      issuanceState: { tokenMaterialIssued: false, bearerSecretIssued: false },
      issuanceRequest: {
        id: issuanceRequest.id,
        recordHash: issuanceRequest.recordHash,
        payloadHash: issuanceRequest.payloadHash,
      },
    },
  };

  const requestCandidates = [
    {
      proposedRepositoryPath: primary,
      currentSha256: primaryHash,
      currentBytes: 5,
      issuanceDecisionSha256: primaryHash,
      issuanceDecisionBytes: 5,
      matchIssuanceDecision: true,
      writeAllowed: false,
    },
    {
      proposedRepositoryPath: evidence,
      currentSha256: evidenceHash,
      currentBytes: 4,
      issuanceDecisionSha256: evidenceHash,
      issuanceDecisionBytes: 4,
      matchIssuanceDecision: true,
      writeAllowed: false,
    },
  ];
  const generationRequest = {
    id: 'generation-request-1', recordHash: h('grr'), payloadHash: h('grp'),
    payload: {
      issuanceDecision: {
        id: issuanceDecision.id,
        recordHash: issuanceDecision.recordHash,
        payloadHash: issuanceDecision.payloadHash,
        issuanceRequestId: issuanceRequest.id,
        tokenDecisionId: tokenDecision.id,
        tokenRequestId: tokenRequest.id,
        authorisationDecisionId: authorisationDecision.id,
        authorisationRequestId: authorisationRequest.id,
        executionPlanDecisionId: planDecision.id,
        executionPlanId: plan.id,
        sourceDecisionId: changeDecision.id,
        changeRequestId: changeRequest.id,
        applicationId: changeRequest.payload.application.id,
        applicationFingerprint: changeRequest.payload.application.fingerprint,
        requestScopeHash: scopeHash,
        decisionScopeHash: scopeHash,
        issuanceScopeHash: scopeHash,
        generationScopeHash: scopeHash,
        requestFinalSnapshotHash: h('request-final'),
        decisionPreflightSnapshotHash: h('decision-preflight'),
        issuancePreflightSnapshotHash: h('issuance-preflight'),
        issuanceDecisionPreflightSnapshotHash: h('issuance-decision-preflight'),
        candidateSnapshotHash: h(stableStringify(targetMappings)),
        executionStepsHash: h(stableStringify(steps)),
        backupManifestHash: h('backup'),
        restoreManifestHash: h('restore'),
      },
      validity: {
        validFrom: '2026-07-30T00:40:00.000Z',
        expiresAt: '2026-07-30T00:40:15.000Z',
        issuanceRequestExpiresAt: '2026-07-30T00:41:00.000Z',
        tokenRequestExpiresAt: '2026-07-30T00:42:00.000Z',
        upstreamExpiresAt: '2026-07-30T00:45:00.000Z',
      },
      lastMomentPreflight: {
        snapshotHash: h(stableStringify(requestCandidates)),
        candidates: requestCandidates,
      },
      scope: {
        targetIds: ['dossier:test'],
        operations,
        recomputedScopeHash: scopeHash,
        tokenRequestScopeHash: scopeHash,
        tokenDecisionScopeHash: scopeHash,
        issuanceRequestScopeHash: scopeHash,
        issuanceDecisionScopeHash: scopeHash,
      },
    },
  };

  return {
    changeRequest, changeDecision, plan, planDecision,
    authorisationRequest, authorisationDecision,
    tokenRequest, tokenDecision, issuanceRequest, issuanceDecision, generationRequest,
  };
}

function baseOptions(root, chain, decisionStore, auditLog, clock) {
  const key = 'k'.repeat(40);
  return {
    tokenMaterialGenerationRequestId: chain.generationRequest.id,
    changeRequestStore: new FakeStore([chain.changeRequest]),
    changeDecisionStore: new FakeStore([chain.changeDecision]),
    planStore: new FakeStore([chain.plan]),
    planDecisionStore: new FakeStore([chain.planDecision]),
    authorisationRequestStore: new FakeStore([chain.authorisationRequest]),
    authorisationDecisionStore: new FakeStore([chain.authorisationDecision]),
    tokenRequestStore: new FakeStore([chain.tokenRequest]),
    tokenDecisionStore: new FakeStore([chain.tokenDecision]),
    tokenIssuanceRequestStore: new FakeStore([chain.issuanceRequest]),
    tokenIssuanceDecisionStore: new FakeStore([chain.issuanceDecision]),
    tokenMaterialGenerationRequestStore: new FakeStore([chain.generationRequest]),
    tokenMaterialGenerationDecisionStore: decisionStore,
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
    decision: 'approve',
    reviewerName: 'phase117-reviewer',
    reviewerRole: 'production-owner',
    reviewerNote: 'Approve the material generation request record for a separate entropy-generation review only.',
    completedReviews: {
      generationRequestWindowReview: true,
      finalPreflightReview: true,
      exactScopeReview: true,
      entropyBoundaryReview: true,
      backupEvidenceReview: true,
      restoreEvidenceReview: true,
      productionOwnerReview: true,
    },
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase117-'));
  const chain = makeChain(root);
  const storePath = path.join(root, 'generation-decisions.jsonl');
  const decisionStore = new ProductionExecutionTokenMaterialGenerationDecisionStore(storePath);
  const auditLog = new AuditLog(path.join(root, 'audit.json'));
  const clock = () => new Date('2026-07-30T00:40:05.000Z');
  const base = baseOptions(root, chain, decisionStore, auditLog, clock);

  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    tokenMaterialGenerationDecisionSigningKey: 'short',
  }), /at least 32 bytes/);
  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    decision: 'maybe',
  }), /approve or reject/);
  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    completedReviews: {},
  }), /completedReviews/);
  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    completedReviews: { ...base.completedReviews, entropyBoundaryReview: false },
    tokenMaterialGenerationDecisionStore:
      new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(root, 'incomplete.jsonl')),
  }), /completed entropyBoundaryReview/);

  const approved = decideProductionExecutionTokenMaterialGeneration(base);
  check(() => assert.equal(approved.decision, 'approve'));
  check(() => assert.equal(approved.candidateCount, 2));
  check(() => assert.equal(approved.operationCount, 1));
  check(() => assert.equal(approved.entropyGenerated, false));
  check(() => assert.equal(approved.tokenMaterialGenerated, false));
  check(() => assert.equal(approved.tokenMaterialIssued, false));
  check(() => assert.equal(approved.bearerSecretGenerated, false));
  check(() => assert.equal(approved.bearerSecretIssued, false));
  check(() => assert.equal(approved.executionAuthorityGranted, false));
  check(() => assert.equal(approved.productionWrites, 0));
  check(() => assert.equal(decisionStore.verify('k'.repeat(40)).valid, true));
  check(() => assert.equal(decisionStore.verify('z'.repeat(40)).valid, false));
  check(() => assert.equal(fs.readFileSync(storePath, 'utf8').includes('k'.repeat(40)), false));

  const record = decisionStore.readRecords()[0];
  check(() => assert.equal(assertTokenMaterialGenerationDecisionPayload(record.payload), true));
  check(() => assert.equal(record.payload.status,
    'approved_token_material_generation_request_record_only'));
  check(() => assert.equal(record.payload.validityReview.remainingSeconds, 10));
  check(() => assert.equal(record.payload.finalPreflight.candidates.length, 2));
  check(() => assert.equal(record.payload.scopeReview.exactScopeMatch, true));
  check(() => assert.equal(record.payload.generationState.entropyGenerated, false));
  check(() => assert.equal(record.payload.generationState.tokenMaterialGenerated, false));
  check(() => assert.equal(record.payload.generationState.tokenDigest, null));
  check(() => assert.equal(record.payload.generationState.tokenId, null));
  check(() => assert.equal(record.payload.nextAction,
    'separate_entropy_generation_request_no_secret_output_or_execution'));

  const duplicate = decideProductionExecutionTokenMaterialGeneration(base);
  check(() => assert.equal(duplicate.idempotent, true));
  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    decision: 'reject',
  }), /different signed/);

  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    clock: () => new Date('2026-07-30T00:40:15.000Z'),
    tokenMaterialGenerationDecisionStore:
      new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(root, 'expired.jsonl')),
  }), /active generation request/);
  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    clock: () => new Date('2026-07-30T00:40:13.000Z'),
    tokenMaterialGenerationDecisionStore:
      new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(root, 'short-window.jsonl')),
  }), /at least 3 seconds/);

  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase117-changed-'));
  const changedChain = makeChain(changedRoot, { changed: true });
  await rejects(() => decideProductionExecutionTokenMaterialGeneration(baseOptions(
    changedRoot,
    changedChain,
    new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(changedRoot, 'decisions.jsonl')),
    new AuditLog(path.join(changedRoot, 'audit.json')),
    clock,
  )), /preflight hash/);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase117-missing-'));
  const missingChain = makeChain(missingRoot, { missing: true });
  await rejects(() => decideProductionExecutionTokenMaterialGeneration(baseOptions(
    missingRoot,
    missingChain,
    new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(missingRoot, 'decisions.jsonl')),
    new AuditLog(path.join(missingRoot, 'audit.json')),
    clock,
  )), /preflight hash/);

  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase117-scope-'));
  const scopeChain = makeChain(scopeRoot, { scopeChanged: true });
  await rejects(() => decideProductionExecutionTokenMaterialGeneration(baseOptions(
    scopeRoot,
    scopeChain,
    new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(scopeRoot, 'decisions.jsonl')),
    new AuditLog(path.join(scopeRoot, 'audit.json')),
    clock,
  )), /scope does not exactly match/);

  await rejects(() => decideProductionExecutionTokenMaterialGeneration({
    ...base,
    planStore: new FakeStore([chain.plan], false),
    tokenMaterialGenerationDecisionStore:
      new ProductionExecutionTokenMaterialGenerationDecisionStore(path.join(root, 'invalid-upstream.jsonl')),
  }), /Production execution plan ledger verification failed/);

  const rejectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase117-reject-'));
  const rejectChain = makeChain(rejectRoot);
  const rejectStore = new ProductionExecutionTokenMaterialGenerationDecisionStore(
    path.join(rejectRoot, 'decisions.jsonl'),
  );
  const rejected = decideProductionExecutionTokenMaterialGeneration({
    ...baseOptions(
      rejectRoot,
      rejectChain,
      rejectStore,
      new AuditLog(path.join(rejectRoot, 'audit.json')),
      () => new Date('2026-07-30T00:41:00.000Z'),
    ),
    decision: 'reject',
    reviewerName: 'phase117-rejector',
    reviewerRole: 'editorial-reviewer',
    reviewerNote: 'Reject the generation request without entropy, token material or execution authority.',
    completedReviews: {
      generationRequestWindowReview: true,
      finalPreflightReview: false,
      exactScopeReview: false,
      entropyBoundaryReview: true,
      backupEvidenceReview: false,
      restoreEvidenceReview: false,
      productionOwnerReview: false,
    },
  });
  check(() => assert.equal(rejected.decision, 'reject'));
  check(() => assert.equal(rejected.candidateCount, 0));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.nextAction, 'none'));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.finalPreflight.required, false));

  const tampered = JSON.parse(fs.readFileSync(storePath, 'utf8').trim());
  tampered.payload.reviewer.note = 'tampered';
  const tamperedPath = path.join(root, 'tampered.jsonl');
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`, 'utf8');
  check(() => assert.equal(
    new ProductionExecutionTokenMaterialGenerationDecisionStore(tamperedPath)
      .verify('k'.repeat(40)).valid,
    false,
  ));

  const mutated = JSON.parse(JSON.stringify(record.payload));
  mutated.generationState.entropyGenerated = true;
  check(() => assert.throws(
    () => assertTokenMaterialGenerationDecisionPayload(mutated),
    /cannot generate/,
  ));
  const mutatedScope = JSON.parse(JSON.stringify(record.payload));
  mutatedScope.scopeReview.recomputedScopeHash = h('wrong');
  check(() => assert.throws(
    () => assertTokenMaterialGenerationDecisionPayload(mutatedScope),
    /does not exactly match/,
  ));

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.entropyGenerated === false
      && entry.details.tokenMaterialGenerated === false
      && entry.details.tokenMaterialIssued === false
      && entry.details.bearerSecretGenerated === false
      && entry.details.bearerSecretIssued === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  )), true));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedTokenMaterialGenerationDecisions:
      decisionStore.readRecords().length + rejectStore.readRecords().length,
    approved: 1,
    rejected: 1,
    candidates: approved.candidateCount,
    operations: approved.operationCount,
    entropyGenerated: false,
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
    auditEntries: auditLog.verify().entries,
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
