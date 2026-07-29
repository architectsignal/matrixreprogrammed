'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

class FakeStore {
  constructor(records, valid = true) { this.records = records; this.valid = valid; }
  verify() { return this.valid ? { valid: true, records: this.records.length } : { valid: false, reason: 'forced_invalid' }; }
  readRecords() { return this.records; }
}

function h(value) { return sha256(value); }

function makeChain(repositoryRoot, suffix = 'a') {
  const primary = `target-${suffix}.html`;
  const evidence = `evidence-${suffix}.html`;
  fs.writeFileSync(path.join(repositoryRoot, primary), `alpha-${suffix}`);
  fs.writeFileSync(path.join(repositoryRoot, evidence), `beta-${suffix}`);
  const primaryBytes = fs.statSync(path.join(repositoryRoot, primary)).size;
  const evidenceBytes = fs.statSync(path.join(repositoryRoot, evidence)).size;
  const candidates = [
    {
      proposedRepositoryPath: primary,
      targetIds: [`dossier:${suffix}`],
      roles: ['primary_route'],
      currentSha256: h(`alpha-${suffix}`),
      currentBytes: primaryBytes,
    },
    {
      proposedRepositoryPath: evidence,
      targetIds: [`dossier:${suffix}`],
      roles: ['evidence_route'],
      currentSha256: h(`beta-${suffix}`),
      currentBytes: evidenceBytes,
    },
  ];
  const targetMappings = [{
    targetId: `dossier:${suffix}`,
    candidates: candidates.map((candidate) => ({
      roles: candidate.roles,
      proposedRepositoryPath: candidate.proposedRepositoryPath,
      exists: true,
      regularFile: true,
      symlink: false,
      currentSha256: candidate.currentSha256,
      currentBytes: candidate.currentBytes,
    })),
  }];
  const steps = [{ sequence: 1, targetId: `dossier:${suffix}`, candidatePaths: [primary, evidence] }];
  const changeRequest = {
    id: `change-request-${suffix}`,
    recordHash: h(`cr-record-${suffix}`),
    payloadHash: h(`cr-payload-${suffix}`),
    payload: { application: { id: `application-${suffix}`, fingerprint: h(`application-${suffix}`) } },
  };
  const changeDecision = {
    id: `change-decision-${suffix}`,
    recordHash: h(`cd-record-${suffix}`),
    payloadHash: h(`cd-payload-${suffix}`),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const plan = {
    id: `plan-${suffix}`,
    recordHash: h(`plan-record-${suffix}`),
    payloadHash: h(`plan-payload-${suffix}`),
    payload: {
      repositorySnapshot: { maxFileBytes: 1024 * 1024 },
      targetMappings,
      executionPlan: { steps },
    },
  };
  const planDecision = {
    id: `plan-decision-${suffix}`,
    recordHash: h(`pd-record-${suffix}`),
    payloadHash: h(`pd-payload-${suffix}`),
    payload: { decision: 'approve', executionAuthorityGranted: false },
  };
  const requestCandidates = candidates.map((candidate) => ({
    ...candidate,
    exists: true,
    regularFile: true,
    symlink: false,
    originalSha256: candidate.currentSha256,
    originalBytes: candidate.currentBytes,
    freshMatchOriginal: true,
    writeAllowed: false,
  }));
  const authorisationRequest = {
    id: `authorisation-request-${suffix}`,
    recordHash: h(`ar-record-${suffix}`),
    payloadHash: h(`ar-payload-${suffix}`),
    payload: {
      executionPlanDecision: {
        id: planDecision.id,
        recordHash: planDecision.recordHash,
        payloadHash: planDecision.payloadHash,
        executionPlanId: plan.id,
        executionPlanRecordHash: plan.recordHash,
        executionPlanPayloadHash: plan.payloadHash,
        sourceDecisionId: changeDecision.id,
        changeRequestId: changeRequest.id,
        applicationId: changeRequest.payload.application.id,
        applicationFingerprint: changeRequest.payload.application.fingerprint,
        candidateSnapshotHash: h(stableStringify(targetMappings)),
        executionStepsHash: h(stableStringify(steps)),
      },
      validity: {
        validFrom: '2026-07-29T21:00:00.000Z',
        expiresAt: '2026-07-29T21:15:00.000Z',
      },
      freshSnapshot: {
        verifiedAt: '2026-07-29T21:00:00.000Z',
        maxAgeSeconds: 300,
        snapshotHash: h(stableStringify(requestCandidates)),
        candidates: requestCandidates,
      },
      rollbackPackage: { manifestHash: h(`rollback-${suffix}`) },
      targetIds: [`dossier:${suffix}`],
    },
  };
  return { primary, evidence, candidates, changeRequest, changeDecision, plan, planDecision, authorisationRequest };
}

function makeBackups(chain, backupRoot) {
  const entries = [];
  for (const candidate of chain.candidates) {
    const artifact = `backup-${path.basename(candidate.proposedRepositoryPath)}`;
    fs.copyFileSync(path.join(chain.repositoryRoot, candidate.proposedRepositoryPath), path.join(backupRoot, artifact));
    entries.push({ proposedRepositoryPath: candidate.proposedRepositoryPath, backupArtifactPath: artifact });
  }
  return entries;
}

function baseOptions(root, chain, decisionStore, auditLog, backupRoot, backupEntries, clock) {
  return {
    executionAuthorisationRequestId: chain.authorisationRequest.id,
    changeRequestStore: new FakeStore([chain.changeRequest]),
    changeDecisionStore: new FakeStore([chain.changeDecision]),
    planStore: new FakeStore([chain.plan]),
    planDecisionStore: new FakeStore([chain.planDecision]),
    authorisationRequestStore: new FakeStore([chain.authorisationRequest]),
    authorisationDecisionStore: decisionStore,
    auditLog,
    repositoryRoot: root,
    changeRequestSigningKey: 'a'.repeat(40),
    changeDecisionSigningKey: 'b'.repeat(40),
    planSigningKey: 'c'.repeat(40),
    planDecisionSigningKey: 'd'.repeat(40),
    authorisationRequestSigningKey: 'e'.repeat(40),
    authorisationDecisionSigningKey: 'f'.repeat(40),
    decision: 'approve',
    reviewerName: 'phase111-reviewer',
    reviewerRole: 'production-owner',
    reviewerNote: 'Approve the record only after backup and restore checks complete.',
    completedReviews: {
      requestWindowReview: true,
      freshHashReview: true,
      externalBackupReview: true,
      restoreRehearsalReview: true,
      productionOwnerReview: true,
    },
    backupRoot,
    backupEntries,
    restoreRehearsalRoot: path.join(root, '.autonomous-machine', 'restore-rehearsals'),
    clock,
  };
}

module.exports = { FakeStore, h, makeChain, makeBackups, baseOptions };
