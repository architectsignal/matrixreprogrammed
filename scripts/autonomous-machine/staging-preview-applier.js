'use strict';

const { assertPreviewBundle } = require('./staging-preview-store');
const { assertSafeRoute, sha256, stableStringify } = require('./route-registry');

const ALLOWED_PATCH_PATHS = Object.freeze([
  '/generatedFrom',
  '/sourceSnapshot',
  '/routeCandidates',
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function assertPreviewSafety(preview) {
  if (preview.patch.productionTarget !== null || preview.safety.productionTarget !== null) {
    throw new Error('Preview contains a production target');
  }
  for (const field of ['autoApplyAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (preview.safety[field] !== false) throw new Error(`Preview safety boundary changed: ${field}`);
  }
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (preview.safety[field] !== 0) throw new Error(`Preview safety boundary changed: ${field}`);
  }
}

function validateAppliedDocument(document) {
  assertObject(document, 'applied staging document');
  if (document.schemaVersion !== 1) throw new Error('Applied staging document schemaVersion must be 1');
  if (document.documentType !== 'route_handoff_staging_document') {
    throw new Error('Applied staging document type is invalid');
  }
  assertObject(document.generatedFrom, 'applied generatedFrom');
  assertObject(document.sourceSnapshot, 'applied sourceSnapshot');
  if (!Array.isArray(document.sourceSnapshot.provenance) || document.sourceSnapshot.provenance.length === 0) {
    throw new Error('Applied staging document requires source provenance');
  }
  if (!Array.isArray(document.routeCandidates) || document.routeCandidates.length === 0) {
    throw new Error('Applied staging document requires route candidates');
  }
  const targetIds = new Set();
  document.routeCandidates.forEach((candidate, index) => {
    assertObject(candidate, `route candidate ${index}`);
    for (const field of ['targetId', 'targetType', 'title', 'route', 'evidenceRoute', 'status']) {
      if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
        throw new TypeError(`route candidate ${index} requires ${field}`);
      }
    }
    if (targetIds.has(candidate.targetId)) throw new Error(`Applied staging document has duplicate route target: ${candidate.targetId}`);
    targetIds.add(candidate.targetId);
    assertSafeRoute(candidate.route, `route candidate ${index}.route`);
    assertSafeRoute(candidate.evidenceRoute, `route candidate ${index}.evidenceRoute`);
    if (candidate.machineRoute !== null && candidate.machineRoute !== undefined) {
      assertSafeRoute(candidate.machineRoute, `route candidate ${index}.machineRoute`);
    }
    if (candidate.status !== 'proposed_for_manual_production_review') {
      throw new Error('Applied route candidate status is invalid');
    }
  });
  return true;
}

function applyPreviewOperations(before, operations) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error('Preview patch requires operations');
  const document = deepClone(before);
  const seen = new Set();
  for (const operation of operations) {
    assertObject(operation, 'preview patch operation');
    if (operation.op !== 'replace') throw new Error(`Disposable application only permits replace operations: ${operation.op}`);
    if (!ALLOWED_PATCH_PATHS.includes(operation.path)) throw new Error(`Disposable application path is not allowed: ${operation.path}`);
    if (seen.has(operation.path)) throw new Error(`Disposable application contains a duplicate path: ${operation.path}`);
    seen.add(operation.path);
    const key = operation.path.slice(1);
    document[key] = deepClone(operation.value);
  }
  if (seen.size !== ALLOWED_PATCH_PATHS.length || ALLOWED_PATCH_PATHS.some((item) => !seen.has(item))) {
    throw new Error('Disposable application requires the complete staging patch set');
  }
  return document;
}

function applyStagingPreview(options = {}) {
  const { previewId, previewStore, applyStore, auditLog } = options;
  if (typeof previewId !== 'string' || !previewId.trim()) throw new TypeError('staging application requires previewId');
  if (!previewStore || !applyStore || !auditLog) {
    throw new TypeError('staging application requires previewStore, applyStore and auditLog');
  }
  const previewIntegrity = previewStore.verify();
  if (!previewIntegrity.valid) throw new Error(`Staging preview store verification failed: ${previewIntegrity.reason}`);
  const applyIntegrity = applyStore.verify();
  if (!applyIntegrity.valid) throw new Error(`Staging application store verification failed: ${applyIntegrity.reason}`);
  const preview = previewStore.read(previewId.trim());
  if (!preview) throw new Error(`Staging preview not found: ${previewId}`);
  assertPreviewBundle(preview);
  if (preview.status !== 'staging_preview_only') throw new Error('Staging preview status is invalid');
  if (preview.fingerprint !== options.expectedPreviewFingerprint && options.expectedPreviewFingerprint) {
    throw new Error('Staging preview fingerprint does not match the expected fingerprint');
  }
  assertPreviewSafety(preview);

  const before = deepClone(preview.before);
  const actualAfter = applyPreviewOperations(before, preview.patch.operations);
  validateAppliedDocument(actualAfter);
  const beforeHash = sha256(stableStringify(before));
  const expectedAfterHash = sha256(stableStringify(preview.after));
  const actualAfterHash = sha256(stableStringify(actualAfter));
  const patchHash = sha256(stableStringify(preview.patch));
  if (actualAfterHash !== expectedAfterHash || stableStringify(actualAfter) !== stableStringify(preview.after)) {
    throw new Error('Disposable staging application does not exactly match the preview after document');
  }
  const changedTopLevelPaths = ALLOWED_PATCH_PATHS.slice();
  const diff = {
    format: 'canonical-json-diff-summary',
    changedTopLevelPaths,
    operationCount: preview.patch.operations.length,
    beforeHash,
    afterHash: actualAfterHash,
    exactPreviewMatch: true,
  };
  const safety = {
    workspaceType: 'disposable_runtime_copy',
    productionTarget: null,
    productionWriteAllowed: false,
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
    applyType: 'disposable_staging_application',
    mode: 'disposable_runtime_only',
    preview: {
      id: preview.id,
      fingerprint: preview.fingerprint,
      handoffId: preview.handoff.id,
      routeBatchId: preview.handoff.routeBatchId,
    },
    beforeHash,
    expectedAfterHash,
    actualAfterHash,
    patchHash,
    exactMatch: true,
    appliedDocument: actualAfter,
    diff,
    diffHash: sha256(stableStringify(diff)),
    safety,
  };
  const stored = applyStore.add(bundle);
  auditLog.append('staging_preview_applied_to_disposable_runtime_copy', {
    previewId: preview.id,
    previewFingerprint: preview.fingerprint,
    applicationId: stored.application.id,
    applicationFingerprint: stored.application.fingerprint,
    exactMatch: true,
    operationCount: preview.patch.operations.length,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  });
  return {
    applicationId: stored.application.id,
    applicationFingerprint: stored.application.fingerprint,
    previewId: preview.id,
    exactMatch: true,
    operationCount: preview.patch.operations.length,
    routeCandidateCount: actualAfter.routeCandidates.length,
    deduplicated: stored.deduplicated,
    productionWrites: 0,
    publicationTasksCreated: 0,
    commitActions: 0,
    deploymentActions: 0,
  };
}

module.exports = {
  ALLOWED_PATCH_PATHS,
  applyPreviewOperations,
  applyStagingPreview,
  validateAppliedDocument,
};
