'use strict';

const { ROUTE_PROPOSAL_STATUSES } = require('./route-proposal-store');
const { assertSigningKey } = require('./review-handoff-store');

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new TypeError(`${field} contains control characters`);
  }
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function normaliseTargets(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError('selectedTargetIds must be an array');
  return [...new Set(value.map((item) => assertText(item, 'selectedTargetId', 3, 180)))].sort();
}

function sameDecision(existing, expected) {
  const payload = existing.payload || {};
  return payload.decision === expected.decision
    && payload.reviewer === expected.reviewer
    && payload.reviewNote === expected.reviewNote
    && JSON.stringify(payload.selectedTargetIds || []) === JSON.stringify(expected.selectedTargetIds || []);
}

function reviewRouteProposal(options = {}) {
  const { batchId, decision, routeRegistry, proposalStore, reviewStore, handoffStore, auditLog } = options;
  if (!routeRegistry || typeof routeRegistry.fingerprint !== 'string') throw new TypeError('route review requires routeRegistry');
  if (!proposalStore || !reviewStore || !handoffStore || !auditLog) {
    throw new TypeError('route review requires proposalStore, reviewStore, handoffStore and auditLog');
  }
  assertSigningKey(options.signingKey);
  const reviewer = assertText(options.reviewer, 'reviewer', 3, 120);
  const reviewNote = assertText(options.reviewNote, 'reviewNote', 10, 2000);
  if (!['accept', 'reject'].includes(decision)) throw new TypeError('decision must be accept or reject');
  const selectedTargetIds = normaliseTargets(options.selectedTargetIds);
  const batch = proposalStore.get(assertText(batchId, 'batchId', 8, 180));
  if (!batch) throw new Error(`Route proposal batch not found: ${batchId}`);
  if (batch.registryFingerprint !== routeRegistry.fingerprint) throw new Error('Route proposal registry fingerprint is stale');
  const reviewRecord = reviewStore.list().find((record) => record.id === batch.reviewRecordId);
  if (!reviewRecord) throw new Error(`Review record not found: ${batch.reviewRecordId}`);
  if (reviewRecord.fingerprint !== batch.reviewFingerprint) {
    throw new Error('Review record fingerprint changed after route proposal creation');
  }

  const proposalMap = new Map(batch.proposals.map((proposal) => [proposal.targetId, proposal]));
  if (decision === 'accept') {
    if (batch.unmatched || selectedTargetIds.length === 0) throw new Error('Accept requires at least one matched route target');
    selectedTargetIds.forEach((targetId) => {
      if (!proposalMap.has(targetId)) throw new Error(`Selected route target is not in proposal batch: ${targetId}`);
    });
  } else if (selectedTargetIds.length !== 0) {
    throw new Error('Reject decisions cannot include route targets');
  }

  const expected = { decision, reviewer, reviewNote, selectedTargetIds };
  const existing = handoffStore.findByRouteBatchId(batch.id);
  if (existing) {
    if (!sameDecision(existing, expected)) {
      throw new Error(`A different signed decision already exists for route batch: ${batch.id}`);
    }
    const status = decision === 'accept' ? ROUTE_PROPOSAL_STATUSES.ACCEPTED : ROUTE_PROPOSAL_STATUSES.REJECTED;
    proposalStore.resolve(batch.id, {
      status,
      decisionId: existing.id,
      reviewedAt: existing.payload.decidedAt,
      reviewer,
      reviewNote,
      selectedTargetIds,
    });
    return {
      decisionId: existing.id,
      routeBatchId: batch.id,
      decision,
      selectedTargetIds,
      idempotent: true,
      productionWrites: 0,
      publicationTasksCreated: 0,
    };
  }
  if (batch.status !== ROUTE_PROPOSAL_STATUSES.PENDING) {
    throw new Error(`Route proposal batch is already resolved without a signed handoff: ${batch.id}`);
  }

  const decidedAt = (options.now || (() => new Date()))().toISOString();
  const selectedProposals = selectedTargetIds.map((targetId) => proposalMap.get(targetId));
  const payload = {
    schemaVersion: 1,
    handoffType: decision === 'accept' ? 'route_proposal_acceptance' : 'route_proposal_rejection',
    authority: decision === 'accept'
      ? 'handoff_only_manual_production_review_required'
      : 'closed_no_handoff',
    routeBatchId: batch.id,
    routeBatchFingerprint: batch.fingerprint,
    reviewRecordId: reviewRecord.id,
    reviewFingerprint: reviewRecord.fingerprint,
    registryFingerprint: batch.registryFingerprint,
    decision,
    reviewer,
    reviewNote,
    decidedAt,
    selectedTargetIds,
    selectedProposals,
    sourceSnapshot: {
      sourceId: reviewRecord.sourceId,
      sourceLabel: reviewRecord.sourceLabel,
      sourceUrl: reviewRecord.sourceUrl,
      title: reviewRecord.title,
      evidenceClass: reviewRecord.evidenceClass,
      sensitivity: reviewRecord.sensitivity,
      evidenceBoundary: reviewRecord.evidenceBoundary,
      provenance: reviewRecord.provenance,
    },
    productionWrites: 0,
    publicationTasksCreated: 0,
    nextAction: decision === 'accept' ? 'manual_production_handoff_review' : 'none',
  };
  const appended = handoffStore.appendSigned(
    payload,
    options.signingKey,
    options.signingKeyId || 'manual-review-key',
  );
  const status = decision === 'accept' ? ROUTE_PROPOSAL_STATUSES.ACCEPTED : ROUTE_PROPOSAL_STATUSES.REJECTED;
  proposalStore.resolve(batch.id, {
    status,
    decisionId: appended.record.id,
    reviewedAt: decidedAt,
    reviewer,
    reviewNote,
    selectedTargetIds,
  });
  auditLog.append('route_proposal_human_decision_signed', {
    routeBatchId: batch.id,
    decisionId: appended.record.id,
    decision,
    reviewer,
    selectedTargetIds,
    registryFingerprint: batch.registryFingerprint,
    productionWrites: 0,
    publicationTasksCreated: 0,
  }, reviewer);
  return {
    decisionId: appended.record.id,
    routeBatchId: batch.id,
    decision,
    selectedTargetIds,
    idempotent: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
  };
}

module.exports = { reviewRouteProposal };
