'use strict';

const { matchDossierRoutes } = require('./dossier-route-matcher');

function createDossierRouteHandler(options = {}) {
  const reviewStore = options.reviewStore;
  const proposalStore = options.proposalStore;
  const routeRegistry = options.routeRegistry;
  if (!reviewStore) throw new TypeError('Dossier route handler requires reviewStore');
  if (!proposalStore) throw new TypeError('Dossier route handler requires proposalStore');
  if (!routeRegistry || !Array.isArray(routeRegistry.targets)) throw new TypeError('Dossier route handler requires routeRegistry');

  return async function dossierRouteHandler(task, context) {
    const reviewRecordId = task.payload && task.payload.reviewRecordId;
    if (typeof reviewRecordId !== 'string' || !reviewRecordId) {
      throw new TypeError('Entity-resolution task requires payload.reviewRecordId');
    }
    if (task.payload.registryFingerprint !== routeRegistry.fingerprint) {
      throw new Error('Route registry fingerprint changed after task creation');
    }
    const reviewRecord = reviewStore.list().find((record) => record.id === reviewRecordId);
    if (!reviewRecord) throw new Error(`Review record not found: ${reviewRecordId}`);
    if (reviewRecord.status !== 'pending_review') throw new Error(`Review record is not pending: ${reviewRecordId}`);

    const result = matchDossierRoutes(reviewRecord, routeRegistry, { maxPackProposals: 3 });
    const stored = proposalStore.add(result);
    context.auditLog.append('dossier_route_proposals_created', {
      taskId: task.id,
      reviewRecordId,
      routeBatchId: stored.batch.id,
      proposalCount: result.proposals.length,
      unmatched: result.unmatched,
      deduplicated: stored.deduplicated,
      registryFingerprint: routeRegistry.fingerprint,
      productionWrites: 0,
      publicationRequested: false,
    });
    return {
      mode: 'route_proposal_only',
      reviewRecordId,
      routeBatchId: stored.batch.id,
      proposalCount: result.proposals.length,
      unmatched: result.unmatched,
      deduplicated: stored.deduplicated,
      productionWrites: 0,
      publicationTasksCreated: 0,
    };
  };
}

module.exports = { createDossierRouteHandler };
