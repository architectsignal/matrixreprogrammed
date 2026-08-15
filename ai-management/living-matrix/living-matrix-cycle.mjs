const PUBLIC_EVENT_TYPES = new Set([
  'record.verified', 'record.corrected', 'record.withdrawn',
  'evidence.created', 'claim.created', 'claim.changed', 'claim.contradicted',
  'dossier.changed', 'forecast.changed', 'user.correction.accepted'
]);

const WITHDRAWAL_EVENT_TYPES = new Set(['record.withdrawn', 'claim.contradicted']);
const CORRECTION_EVENT_TYPES = new Set(['record.corrected', 'claim.changed', 'user.correction.accepted']);
const OPERATIONAL_EVENT_PREFIXES = Object.freeze(['resource.', 'model.', 'learning.', 'value.', 'cycle.', 'system.', 'build.', 'deploy.']);

function text(value, maximum = 1600) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function values(input, maximum = 100) {
  return [...new Set((Array.isArray(input) ? input : []).map(item => text(item, 1000)).filter(Boolean))].slice(0, maximum);
}

function object(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function safeId(value, fallback) {
  const normalized = text(value, 180).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function projection(type, subjectId, event, content, options = {}) {
  return {
    projection_key: `${type}:${subjectId}`,
    projection_type: type,
    subject_id: subjectId,
    source_event_id: event.event_id,
    evidence_class: event.evidence_class,
    content,
    public_visible: options.publicVisible === true,
    state: options.state || 'active'
  };
}

function evidenceContent(event, evidence) {
  const evidenceId = safeId(evidence.evidence_id, `event-${event.event_id}`);
  return {
    evidence_id: evidenceId,
    title: text(evidence.title || `Verified Matrix record ${evidenceId}`, 300),
    summary: text(evidence.summary || evidence.establishes, 1800),
    establishes: text(evidence.establishes || evidence.summary, 1800),
    does_not_establish: text(evidence.does_not_establish || 'This record does not establish facts beyond its stated evidence boundary.', 1200),
    source_route: text(evidence.source_route || event.source, 1500),
    source_publisher: text(evidence.source_publisher || event.origin, 300),
    source_type: text(evidence.source_type || 'public-record', 100),
    source_asset: text(evidence.source_asset || 'matrix-living-projection', 300),
    evidence_grade: text(evidence.evidence_grade || 'A · verified', 100),
    factual_status: text(evidence.factual_status || 'verified', 100),
    related_entities: values(evidence.related_entities || event.affected_entities, 40),
    claim_class: text(evidence.claim_class || 'documented_fact', 100),
    matrix_route: text(evidence.matrix_route || event.affected_pages?.[0] || 'answer-engine.html', 1000),
    evidence_boundary: text(evidence.evidence_boundary || evidence.does_not_establish, 1200),
    missing_records: values(evidence.missing_records, 20),
    event_id: event.event_id,
    observed_at: event.timestamp
  };
}

export function deriveLivingActions(input = {}) {
  const event = {
    event_id: safeId(input.event_id, 'unknown-event'),
    event_type: text(input.event_type, 100),
    timestamp: text(input.timestamp, 50),
    origin: text(input.origin, 180),
    source: text(input.source, 1500),
    evidence_class: text(input.evidence_class, 80),
    affected_entities: values(input.affected_entities, 100),
    affected_pages: values(input.affected_pages, 100)
  };
  const payload = object(input.payload);
  const actions = [];
  const verified = event.evidence_class === 'VERIFIED';
  const approved = verified && payload.evidence?.publication_approved === true && PUBLIC_EVENT_TYPES.has(event.event_type);
  const quarantined = event.evidence_class === 'SECURITY_QUARANTINE';
  const withdrawn = WITHDRAWAL_EVENT_TYPES.has(event.event_type);
  const state = quarantined ? 'quarantined' : withdrawn ? 'withdrawn' : 'active';
  const dependencyIds = [];

  if (payload.evidence) {
    const content = evidenceContent(event, object(payload.evidence));
    actions.push(projection('evidence', content.evidence_id, event, content, { publicVisible: approved && !withdrawn, state }));
    dependencyIds.push(['evidence', content.evidence_id]);
  }

  if (payload.claim) {
    const claim = object(payload.claim);
    const id = safeId(claim.claim_id, `event-${event.event_id}`);
    const content = {
      claim_id: id,
      statement: text(claim.statement, 2000),
      status: withdrawn ? 'contradicted-or-withdrawn' : text(claim.status || (verified ? 'supported' : 'speculative'), 100),
      evidence_ids: values(claim.evidence_ids || (payload.evidence?.evidence_id ? [payload.evidence.evidence_id] : []), 50),
      changed_by_event: event.event_id,
      changed_at: event.timestamp,
      correction: CORRECTION_EVENT_TYPES.has(event.event_type)
    };
    actions.push(projection('claim', id, event, content, { publicVisible: approved && !withdrawn, state }));
    dependencyIds.push(['claim', id]);
  }

  if (payload.dossier) {
    const dossier = object(payload.dossier);
    const id = safeId(dossier.dossier_id, event.affected_entities[0] || `event-${event.event_id}`);
    const content = {
      dossier_id: id,
      title: text(dossier.title || id, 300),
      summary: text(dossier.summary, 2400),
      evidence_ids: values(dossier.evidence_ids || (payload.evidence?.evidence_id ? [payload.evidence.evidence_id] : []), 100),
      claim_ids: values(dossier.claim_ids || (payload.claim?.claim_id ? [payload.claim.claim_id] : []), 100),
      changed_by_event: event.event_id,
      changed_at: event.timestamp
    };
    actions.push(projection('dossier', id, event, content, { publicVisible: approved && !withdrawn, state }));
    dependencyIds.push(['dossier', id]);
  }

  if (payload.forecast) {
    const forecast = object(payload.forecast);
    const id = safeId(forecast.forecast_id, `event-${event.event_id}`);
    const previous = Number(forecast.previous_probability);
    const next = Number(forecast.new_probability);
    const content = {
      forecast_id: id,
      previous_probability: Number.isFinite(previous) ? Math.max(0, Math.min(1, previous)) : null,
      new_probability: Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : null,
      reason: text(forecast.reason, 1600),
      evidence_ids: values(forecast.evidence_ids || (payload.evidence?.evidence_id ? [payload.evidence.evidence_id] : []), 50),
      changed_by_event: event.event_id,
      changed_at: event.timestamp
    };
    actions.push(projection('forecast', id, event, content, { publicVisible: approved && !withdrawn, state }));
    dependencyIds.push(['forecast', id]);
  }

  for (const pageId of event.affected_pages) {
    const id = safeId(pageId, 'unknown-page');
    actions.push(projection('page', id, event, {
      page_id: pageId,
      stale: true,
      reason: `${event.event_type} changed a declared page dependency.`,
      dependency_ids: dependencyIds.map(([, dependencyId]) => dependencyId),
      changed_at: event.timestamp
    }, { publicVisible: false, state: 'stale' }));
  }

  const operationalEvent = OPERATIONAL_EVENT_PREFIXES.some(prefix => event.event_type.startsWith(prefix));
  if (actions.length || operationalEvent) {
    actions.push(projection('what_changed', event.event_id, event, {
      change_id: event.event_id,
      event_type: event.event_type,
      summary: text(payload.change_summary || `${event.event_type} updated ${actions.map(action => action.projection_type).join(', ')}.`, 1000),
      affected_entities: event.affected_entities,
      affected_pages: event.affected_pages,
      evidence_ids: values(payload.evidence?.evidence_id ? [payload.evidence.evidence_id] : [], 20),
      changed_at: event.timestamp
    }, { publicVisible: approved, state: quarantined ? 'quarantined' : 'active' }));
  }

  return {
    event,
    actions,
    dependencies: event.affected_pages.flatMap(pageId => [
      ['event', event.event_id],
      ...dependencyIds
    ].map(([dependency_type, dependency_id]) => ({ page_id: pageId, dependency_type, dependency_id }))),
    publication: approved ? 'approved' : 'internal-only',
    quarantine: quarantined
  };
}

export const livingMatrixInternals = { CORRECTION_EVENT_TYPES, OPERATIONAL_EVENT_PREFIXES, PUBLIC_EVENT_TYPES, WITHDRAWAL_EVENT_TYPES };
