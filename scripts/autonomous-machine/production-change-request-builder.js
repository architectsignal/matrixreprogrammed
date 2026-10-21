'use strict';

const { assertSigningKey } = require('./review-handoff-store');
const { sha256, stableStringify } = require('./route-registry');
const { validateAppliedDocument } = require('./staging-preview-applier');
const { STAGING_APPLY_STATUS } = require('./staging-apply-store');
const {
  CHANGE_REQUEST_AUTHORITY,
  CHANGE_REQUEST_STATUS,
} = require('./production-change-request-store');

function assertText(value, field, min, max) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains control characters`);
  if (text.length < min || text.length > max) throw new TypeError(`${field} must contain ${min}-${max} characters`);
  return text;
}

function assertApplicationSafety(application) {
  if (!application.safety || application.safety.workspaceType !== 'disposable_runtime_copy') {
    throw new Error('Production change request requires a disposable runtime application');
  }
  if (application.safety.productionTarget !== null) throw new Error('Production change request application has a production target');
  for (const field of ['productionWriteAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (application.safety[field] !== false) throw new Error(`Production change request application safety changed: ${field}`);
  }
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (application.safety[field] !== 0) throw new Error(`Production change request application safety changed: ${field}`);
  }
}

function buildProductionChangeRequest(options = {}) {
  const { applicationId, applyStore, requestStore, auditLog } = options;
  if (typeof applicationId !== 'string' || !applicationId.trim()) throw new TypeError('production change request requires applicationId');
  if (!applyStore || !requestStore || !auditLog) throw new TypeError('production change request requires applyStore, requestStore and auditLog');
  assertSigningKey(options.signingKey);
  const requesterName = assertText(options.requesterName, 'requesterName', 3, 120);
  const requesterNote = assertText(options.requesterNote, 'requesterNote', 10, 2000);

  const applyIntegrity = applyStore.verify();
  if (!applyIntegrity.valid) throw new Error(`Staging application store verification failed: ${applyIntegrity.reason}`);
  const requestIntegrity = requestStore.verify(options.signingKey);
  if (!requestIntegrity.valid) throw new Error(`Production change request ledger verification failed: ${requestIntegrity.reason}`);
  const application = applyStore.read(applicationId.trim());
  if (!application) throw new Error(`Disposable staging application not found: ${applicationId}`);
  if (application.status !== STAGING_APPLY_STATUS) throw new Error('Disposable staging application status is invalid');
  if (application.exactMatch !== true) throw new Error('Production change request requires an exact staging application');
  assertApplicationSafety(application);
  validateAppliedDocument(application.appliedDocument);

  const appliedDocumentHash = sha256(stableStringify(application.appliedDocument));
  if (appliedDocumentHash !== application.actualAfterHash || appliedDocumentHash !== application.expectedAfterHash) {
    throw new Error('Production change request application document hash is not exact');
  }
  if (application.diffHash !== sha256(stableStringify(application.diff))) {
    throw new Error('Production change request application diff hash is invalid');
  }
  if (application.diff.exactPreviewMatch !== true) throw new Error('Production change request requires exactPreviewMatch=true');

  const sourceSnapshot = application.appliedDocument.sourceSnapshot;
  if (!Array.isArray(sourceSnapshot.provenance) || sourceSnapshot.provenance.length === 0) {
    throw new Error('Production change request requires source provenance');
  }
  const changes = application.appliedDocument.routeCandidates
    .map((candidate) => ({
      targetId: candidate.targetId,
      targetType: candidate.targetType,
      title: candidate.title,
      route: candidate.route,
      evidenceRoute: candidate.evidenceRoute,
      machineRoute: candidate.machineRoute || null,
      requestedOperation: 'manual_review_and_integrate_evidence',
      reviewStatus: 'pending_manual_production_review',
      productionFilePath: null,
      productionDestinationResolved: false,
      evidenceBoundary: candidate.evidenceBoundary || sourceSnapshot.evidenceBoundary || '',
      match: candidate.match || null,
    }))
    .sort((left, right) => left.targetId.localeCompare(right.targetId));

  const payload = {
    schemaVersion: 1,
    requestType: 'advisory_production_change_request',
    mode: 'change_request_only',
    authority: CHANGE_REQUEST_AUTHORITY,
    status: CHANGE_REQUEST_STATUS,
    application: {
      id: application.id,
      fingerprint: application.fingerprint,
      previewId: application.preview.id,
      previewFingerprint: application.preview.fingerprint,
      handoffId: application.preview.handoffId,
      routeBatchId: application.preview.routeBatchId,
      beforeHash: application.beforeHash,
      afterHash: application.actualAfterHash,
      patchHash: application.patchHash,
      diffHash: application.diffHash,
      exactMatch: true,
    },
    requester: {
      name: requesterName,
      note: requesterNote,
    },
    sourceSnapshot,
    changes,
    requiredApprovals: {
      evidenceReview: true,
      editorialReview: true,
      legalReview: ['medium', 'high'].includes(sourceSnapshot.sensitivity),
      productionOwnerApproval: true,
    },
    safety: {
      productionTarget: null,
      productionWriteAllowed: false,
      commitAllowed: false,
      deploymentAllowed: false,
      publicationAllowed: false,
      productionWrites: 0,
      publicationTasksCreated: 0,
      commitActions: 0,
      deploymentActions: 0,
    },
  };

  const appended = requestStore.appendSigned(
    payload,
    options.signingKey,
    options.signingKeyId || 'production-change-request-key',
  );
  auditLog.append('advisory_production_change_request_signed', {
    applicationId: application.id,
    applicationFingerprint: application.fingerprint,
    changeRequestId: appended.record.id,
    changeRequestRecordHash: appended.record.recordHash,
    changeCount: changes.length,
    deduplicated: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  }, requesterName);
  return {
    changeRequestId: appended.record.id,
    changeRequestRecordHash: appended.record.recordHash,
    applicationId: application.id,
    changeCount: changes.length,
    legalReviewRequired: payload.requiredApprovals.legalReview,
    idempotent: appended.idempotent,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = {
  assertApplicationSafety,
  buildProductionChangeRequest,
};
