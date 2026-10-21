'use strict';

const TASK_STATUSES = Object.freeze({
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  COMPLETED: 'completed',
  FAILED: 'failed',
  HELD: 'held',
  REJECTED: 'rejected',
});

const TASK_TYPES = Object.freeze({
  SOURCE_DISCOVERY: 'source_discovery',
  INGEST: 'ingest',
  VERIFY: 'verify',
  ENTITY_RESOLUTION: 'entity_resolution',
  ROUTE_UPDATE: 'route_update',
  CONCLUDE: 'conclude',
  PUBLICATION_CANDIDATE: 'publication_candidate',
});

const EVIDENCE_CLASSES = Object.freeze({
  PRIMARY: 'primary',
  OFFICIAL: 'official',
  RELIABLE_SECONDARY: 'reliable_secondary',
  SECONDARY: 'secondary',
  ALLEGATION: 'allegation',
  INFERENCE: 'inference',
  SPECULATION: 'speculation',
});

const SENSITIVITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const PUBLICATION_MODES = Object.freeze({
  DISABLED: 'disabled',
  REVIEW_ONLY: 'review_only',
});

module.exports = {
  TASK_STATUSES,
  TASK_TYPES,
  EVIDENCE_CLASSES,
  SENSITIVITY,
  PUBLICATION_MODES,
};
