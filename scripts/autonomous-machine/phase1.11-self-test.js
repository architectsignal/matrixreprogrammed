#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');
const { AuditLog } = require('./audit-log');

for (const [name, exports] of Object.entries({
  'production-change-request-store': { assertChangeRequestPayload: () => true },
  'production-change-decision-store': { assertDecisionPayload: () => true },
  'production-execution-plan-store': { assertExecutionPlanPayload: () => true },
  'production-execution-plan-decision-store': { assertExecutionPlanDecisionPayload: () => true },
  'production-execution-authorisation-request-store': { assertExecutionAuthorisationRequestPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (repositoryRoot, candidatePath) => {
      const filePath = path.join(repositoryRoot, candidatePath);
      if (!fs.existsSync(filePath)) return { exists: false, regularFile: false, symlink: false, currentSha256: null, currentBytes: null };
      const stat = fs.lstatSync(filePath);
      return {
        exists: stat.isFile(),
        regularFile: stat.isFile(),
        symlink: stat.isSymbolicLink(),
        currentSha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
        currentBytes: stat.size,
      };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const {
  ProductionExecutionAuthorisationDecisionStore,
  assertExecutionAuthorisationDecisionPayload,
} = require('./production-execution-authorisation-decision-store');
const { decideProductionExecutionAuthorisation } = require('./production-execution-authorisation-decision-service');

let checks = 0;
function check(fn) { fn(); checks += 1; }
async function rejects(fn, pattern) {
  let matched = false;
  try { await fn(); }
  catch (error) { matched = pattern.test(error.message); }
  assert.equal(matched, true);
  checks += 1;
}

const { FakeStore, h, makeChain, makeBackups, baseOptions } = require('./phase1.11-test-fixtures');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-repo-'));
  const runtime = path.join(root, '.autonomous-machine');
  fs.mkdirSync(runtime, { recursive: true });
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-backups-'));
  const chain = makeChain(root, 'a');
  chain.repositoryRoot = root;
  const backupEntries = makeBackups(chain, externalRoot);
  const storePath = path.join(runtime, 'production-execution-authorisation-decisions.jsonl');
  const decisionStore = new ProductionExecutionAuthorisationDecisionStore(storePath);
  const auditLog = new AuditLog(path.join(runtime, 'audit.jsonl'));
  const productionSentinel = path.join(root, 'production-sentinel.json');
  fs.writeFileSync(productionSentinel, '{"safe":true}');
  const productionHash = h(fs.readFileSync(productionSentinel));
  const clock = () => new Date('2026-07-29T21:04:00.000Z');
  const base = baseOptions(root, chain, decisionStore, auditLog, externalRoot, backupEntries, clock);

  await rejects(() => decideProductionExecutionAuthorisation({ ...base, authorisationDecisionSigningKey: 'short' }), /at least 32 bytes/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, executionAuthorisationRequestId: '' }), /executionAuthorisationRequestId/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, decision: 'maybe' }), /approve or reject/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, reviewerName: '' }), /reviewerName/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, reviewerRole: '' }), /reviewerRole/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, reviewerNote: 'short' }), /reviewerNote/);
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, completedReviews: {} }), /completedReviews/);

  const approved = decideProductionExecutionAuthorisation(base);
  check(() => assert.equal(approved.decision, 'approve'));
  check(() => assert.equal(approved.backupCount, 2));
  check(() => assert.equal(approved.restoreRehearsalFiles, 2));
  check(() => assert.equal(approved.readyForExecution, false));
  check(() => assert.equal(approved.executionAuthorityGranted, false));
  check(() => assert.equal(approved.authorisationGranted, false));
  check(() => assert.equal(approved.productionWrites, 0));
  check(() => assert.equal(decisionStore.readRecords().length, 1));
  check(() => assert.equal(decisionStore.verify('f'.repeat(40)).valid, true));
  check(() => assert.equal(decisionStore.verify('z'.repeat(40)).valid, false));
  check(() => assert.equal(fs.readFileSync(storePath, 'utf8').includes('f'.repeat(40)), false));

  const record = decisionStore.readRecords()[0];
  check(() => assert.equal(assertExecutionAuthorisationDecisionPayload(record.payload), true));
  check(() => assert.equal(record.payload.status, 'approved_execution_authorisation_record_only'));
  check(() => assert.equal(record.payload.authority, 'signed_human_execution_authorisation_decision_only_no_execution_authority'));
  check(() => assert.equal(record.payload.validityReview.activeAtDecision, true));
  check(() => assert.equal(record.payload.validityReview.remainingSeconds, 660));
  check(() => assert.equal(record.payload.validityReview.requestSnapshotAgeSeconds, 240));
  check(() => assert.equal(record.payload.validityReview.requestSnapshotWithinMaxAge, true));
  check(() => assert.equal(record.payload.freshRecheck.allMatchRequest, true));
  check(() => assert.equal(record.payload.freshRecheck.candidates.length, 2));
  check(() => assert.equal(record.payload.backupVerification.allVerified, true));
  check(() => assert.equal(record.payload.backupVerification.entries.length, 2));
  check(() => assert.equal(record.payload.restoreRehearsal.allVerified, true));
  check(() => assert.equal(record.payload.restoreRehearsal.cleanedUp, true));
  check(() => assert.equal(record.payload.restoreRehearsal.disposableRuntimeWrites, 2));
  check(() => assert.equal(record.payload.productionFilePath, null));
  check(() => assert.equal(record.payload.productionDestinationResolved, false));
  check(() => assert.equal(record.payload.finalDestinationConfirmed, false));
  check(() => assert.equal(record.payload.readyForExecution, false));
  check(() => assert.equal(record.payload.executionAuthorityGranted, false));
  check(() => assert.equal(record.payload.authorisationGranted, false));
  check(() => assert.equal(record.payload.safety.executionAllowed, false));
  check(() => assert.equal(record.payload.safety.productionWriteAllowed, false));
  check(() => assert.equal(fs.readdirSync(base.restoreRehearsalRoot).length, 0));

  const duplicate = decideProductionExecutionAuthorisation(base);
  check(() => assert.equal(duplicate.idempotent, true));
  check(() => assert.equal(duplicate.executionAuthorisationDecisionId, approved.executionAuthorisationDecisionId));
  check(() => assert.equal(decisionStore.readRecords().length, 1));
  await rejects(() => decideProductionExecutionAuthorisation({ ...base, decision: 'reject' }), /different signed/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    completedReviews: { ...base.completedReviews, externalBackupReview: false },
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'incomplete.jsonl')),
  }), /completed externalBackupReview/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    clock: () => new Date('2026-07-29T21:16:00.000Z'),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'expired.jsonl')),
  }), /active request/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    clock: () => new Date('2026-07-29T21:06:00.000Z'),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'stale.jsonl')),
  }), /maximum age/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    clock: () => new Date('2026-07-29T21:14:45.000Z'),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'short-window.jsonl')),
  }), /at least 30 seconds/);

  const changedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-changed-'));
  const changedBackupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-changed-backups-'));
  const changedChain = makeChain(changedRoot, 'changed');
  changedChain.repositoryRoot = changedRoot;
  const changedBackups = makeBackups(changedChain, changedBackupRoot);
  fs.writeFileSync(path.join(changedRoot, changedChain.primary), 'changed-after-request');
  await rejects(() => decideProductionExecutionAuthorisation(baseOptions(
    changedRoot,
    changedChain,
    new ProductionExecutionAuthorisationDecisionStore(path.join(changedRoot, '.autonomous-machine', 'decisions.jsonl')),
    new AuditLog(path.join(changedRoot, '.autonomous-machine', 'audit.jsonl')),
    changedBackupRoot,
    changedBackups,
    clock,
  )), /Final fresh hash/);

  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    backupRoot: path.join(root, '.autonomous-machine', 'inside-backups'),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'inside-backup.jsonl')),
  }), /outside the repository/);
  const wrongBackupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-wrong-backup-'));
  const wrongEntries = makeBackups(chain, wrongBackupRoot);
  fs.writeFileSync(path.join(wrongBackupRoot, wrongEntries[0].backupArtifactPath), 'wrong');
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    backupRoot: wrongBackupRoot,
    backupEntries: wrongEntries,
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'wrong-backup.jsonl')),
  }), /does not match current candidate/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    backupEntries: backupEntries.slice(0, 1),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'missing-backup.jsonl')),
  }), /one backup entry per/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    backupEntries: [
      { ...backupEntries[0], backupArtifactPath: '../escape' },
      backupEntries[1],
    ],
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'escape-backup.jsonl')),
  }), /unsafe segment/);
  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    restoreRehearsalRoot: path.join(root, 'restore-outside-runtime'),
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'bad-restore-root.jsonl')),
  }), /restoreRehearsalRoot/);

  const rejectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase111-reject-'));
  const rejectChain = makeChain(rejectRoot, 'reject');
  rejectChain.repositoryRoot = rejectRoot;
  const rejectRuntime = path.join(rejectRoot, '.autonomous-machine');
  const rejectStore = new ProductionExecutionAuthorisationDecisionStore(path.join(rejectRuntime, 'decisions.jsonl'));
  const rejected = decideProductionExecutionAuthorisation({
    ...baseOptions(rejectRoot, rejectChain, rejectStore, new AuditLog(path.join(rejectRuntime, 'audit.jsonl')), null, null, clock),
    decision: 'reject',
    reviewerName: 'phase111-rejector',
    reviewerRole: 'editorial-reviewer',
    reviewerNote: 'Reject the request without granting any execution authority.',
    completedReviews: {
      requestWindowReview: true,
      freshHashReview: false,
      externalBackupReview: false,
      restoreRehearsalReview: false,
      productionOwnerReview: false,
    },
  });
  check(() => assert.equal(rejected.decision, 'reject'));
  check(() => assert.equal(rejected.backupCount, 0));
  check(() => assert.equal(rejected.restoreRehearsalFiles, 0));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.status, 'rejected_execution_authorisation_no_authorisation'));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.nextAction, 'none'));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.freshRecheck.required, false));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.backupVerification.required, false));
  check(() => assert.equal(rejectStore.readRecords()[0].payload.restoreRehearsal.required, false));

  const tamperedPath = path.join(runtime, 'tampered-decisions.jsonl');
  const tampered = JSON.parse(fs.readFileSync(storePath, 'utf8').trim());
  tampered.payload.reviewer.note = 'tampered';
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
  check(() => assert.equal(new ProductionExecutionAuthorisationDecisionStore(tamperedPath).verify('f'.repeat(40)).valid, false));

  await rejects(() => decideProductionExecutionAuthorisation({
    ...base,
    authorisationDecisionStore: new ProductionExecutionAuthorisationDecisionStore(path.join(runtime, 'invalid-upstream.jsonl')),
    planStore: new FakeStore([chain.plan], false),
  }), /Production execution plan ledger verification failed/);

  check(() => assert.equal(auditLog.verify().valid, true));
  check(() => assert.equal(auditLog.readEntries().every((entry) => (
    entry.details.readyForExecution === false
      && entry.details.executionAuthorityGranted === false
      && entry.details.authorisationGranted === false
      && entry.details.productionWrites === 0
      && entry.details.publicationTasksCreated === 0
      && entry.details.commitActions === 0
      && entry.details.deploymentActions === 0
  )), true));
  check(() => assert.equal(h(fs.readFileSync(productionSentinel)), productionHash));
  check(() => assert.equal(fs.existsSync(path.join(root, '.git', 'index.lock')), false));
  check(() => assert.equal(fs.existsSync(path.join(root, 'deploy')), false));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tests: checks,
    signedAuthorisationDecisions: decisionStore.readRecords().length + rejectStore.readRecords().length,
    approved: 1,
    rejected: 1,
    verifiedBackups: approved.backupCount,
    restoreRehearsalFiles: approved.restoreRehearsalFiles,
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
