'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { assertSafeRoute } = require('./route-registry');

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
}

function buildStagingPreview(options = {}) {
  const { handoffId, handoffStore, routeRegistry, previewStore, auditLog } = options;
  if (typeof handoffId !== 'string' || !handoffId.trim()) throw new TypeError('staging preview requires handoffId');
  if (!handoffStore || !previewStore || !auditLog) throw new TypeError('staging preview requires handoffStore, previewStore and auditLog');
  if (!routeRegistry || typeof routeRegistry.fingerprint !== 'string' || !Array.isArray(routeRegistry.targets)) {
    throw new TypeError('staging preview requires routeRegistry');
  }
  assertSigningKey(options.signingKey);
  const ledger = handoffStore.verify(options.signingKey);
  if (!ledger.valid) throw new Error(`Signed handoff ledger verification failed: ${ledger.reason}`);
  const handoff = handoffStore.readRecords().find((record) => record.id === handoffId.trim());
  if (!handoff) throw new Error(`Signed handoff not found: ${handoffId}`);
  const payload = handoff.payload;
  assertObject(payload, 'handoff payload');
  if (payload.decision !== 'accept' || payload.handoffType !== 'route_proposal_acceptance') {
    throw new Error('Only accepted route proposal handoffs can produce staging previews');
  }
  if (payload.authority !== 'handoff_only_manual_production_review_required') {
    throw new Error('Accepted handoff authority is invalid');
  }
  if (payload.productionWrites !== 0 || payload.publicationTasksCreated !== 0) {
    throw new Error('Accepted handoff violates zero-write safety boundary');
  }
  if (payload.registryFingerprint !== routeRegistry.fingerprint) {
    throw new Error('Accepted handoff route registry fingerprint is stale');
  }
  if (!payload.sourceSnapshot || !Array.isArray(payload.sourceSnapshot.provenance) || payload.sourceSnapshot.provenance.length === 0) {
    throw new Error('Accepted handoff requires source provenance');
  }
  if (!Array.isArray(payload.selectedTargetIds) || payload.selectedTargetIds.length === 0) {
    throw new Error('Accepted handoff requires selected route targets');
  }
  if (!Array.isArray(payload.selectedProposals) || payload.selectedProposals.length !== payload.selectedTargetIds.length) {
    throw new Error('Accepted handoff selected proposal snapshot is incomplete');
  }

  const selectedTargetIds = [...new Set(payload.selectedTargetIds)].sort();
  if (selectedTargetIds.length !== payload.selectedTargetIds.length) throw new Error('Accepted handoff contains duplicate route targets');
  const proposalMap = new Map(payload.selectedProposals.map((proposal) => [proposal.targetId, proposal]));
  const targetMap = new Map(routeRegistry.targets.map((target) => [target.targetId, target]));
  const routeCandidates = selectedTargetIds.map((targetId) => {
    const proposal = proposalMap.get(targetId);
    const target = targetMap.get(targetId);
    if (!proposal) throw new Error(`Accepted handoff is missing proposal snapshot: ${targetId}`);
    if (!target) throw new Error(`Accepted handoff route target no longer exists: ${targetId}`);
    if (proposal.targetType !== target.targetType || proposal.title !== target.title
      || proposal.route !== target.route || proposal.evidenceRoute !== target.evidenceRoute) {
      throw new Error(`Accepted handoff route target changed after signing: ${targetId}`);
    }
    assertSafeRoute(target.route, `${targetId}.route`);
    assertSafeRoute(target.evidenceRoute, `${targetId}.evidenceRoute`);
    if (target.machineRoute) assertSafeRoute(target.machineRoute, `${targetId}.machineRoute`);
    return {
      targetId,
      targetType: target.targetType,
      title: target.title,
      route: target.route,
      evidenceRoute: target.evidenceRoute,
      machineRoute: target.machineRoute || null,
      match: {
        score: proposal.score,
        confidence: proposal.confidence,
        reasons: Array.isArray(proposal.reasons) ? proposal.reasons : [],
      },
      evidenceBoundary: target.boundary || payload.sourceSnapshot.evidenceBoundary || '',
      status: 'proposed_for_manual_production_review',
    };
  });

  const generatedFrom = {
    handoffId: handoff.id,
    handoffRecordHash: handoff.recordHash,
    handoffPayloadHash: handoff.payloadHash,
    signingKeyId: handoff.signingKeyId,
    routeBatchId: payload.routeBatchId,
    reviewRecordId: payload.reviewRecordId,
    reviewer: payload.reviewer,
    reviewNote: payload.reviewNote,
    decidedAt: payload.decidedAt,
  };
  const sourceSnapshot = {
    ...payload.sourceSnapshot,
    reviewFingerprint: payload.reviewFingerprint,
  };
  const before = {
    schemaVersion: 1,
    documentType: 'route_handoff_staging_document',
    generatedFrom: null,
    sourceSnapshot: null,
    routeCandidates: [],
  };
  const after = {
    schemaVersion: 1,
    documentType: 'route_handoff_staging_document',
    generatedFrom,
    sourceSnapshot,
    routeCandidates,
  };
  const patch = {
    format: 'json-patch-preview',
    target: 'isolated_staging_document',
    productionTarget: null,
    operations: [
      { op: 'replace', path: '/generatedFrom', value: generatedFrom },
      { op: 'replace', path: '/sourceSnapshot', value: sourceSnapshot },
      { op: 'replace', path: '/routeCandidates', value: routeCandidates },
    ],
  };
  const safety = {
    productionTarget: null,
    autoApplyAllowed: false,
    commitAllowed: false,
    deploymentAllowed: false,
    publicationAllowed: false,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
  const bundle = {
    schemaVersion: 1,
    previewType: 'route_handoff_staging_preview',
    mode: 'preview_only',
    handoff: {
      id: handoff.id,
      recordHash: handoff.recordHash,
      payloadHash: handoff.payloadHash,
      routeBatchId: payload.routeBatchId,
      decision: payload.decision,
    },
    registryFingerprint: routeRegistry.fingerprint,
    before,
    after,
    patch,
    safety,
  };
  const stored = previewStore.add(bundle);
  auditLog.append('signed_handoff_staging_preview_created', {
    handoffId: handoff.id,
    previewId: stored.preview.id,
    previewFingerprint: stored.preview.fingerprint,
    routeBatchId: payload.routeBatchId,
    selectedTargetIds,
    deduplicated: stored.deduplicated,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, payload.reviewer);
  return {
    previewId: stored.preview.id,
    previewFingerprint: stored.preview.fingerprint,
    handoffId: handoff.id,
    routeBatchId: payload.routeBatchId,
    routeCandidateCount: routeCandidates.length,
    deduplicated: stored.deduplicated,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = { buildStagingPreview };
