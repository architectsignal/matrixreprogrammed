const TOP_LEVEL_FIELDS = new Set([
  'investigation_id',
  'question',
  'answer',
  'facts',
  'allegations_or_disputed_claims',
  'inferences',
  'unknowns',
  'evidence_ids',
  'source_routes',
  'confidence',
  'related_entities',
  'related_investigations',
  'evidence_boundary'
]);

const FORBIDDEN_KEYS = /(?:chain.?of.?thought|reasoning|analysis|scratchpad|hidden|system.?prompt|developer.?prompt|prompt|messages|raw.?output|credential|secret|token|api.?key)/i;

function clean(value, maximum = 1000) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function cleanRefs(values, maximum = 100) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.map(value => clean(value, 1000)).filter(Boolean))].slice(0, maximum);
}

function containsForbiddenKey(value, depth = 0) {
  if (depth > 8 || value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => containsForbiddenKey(item, depth + 1));
  return Object.entries(value).some(([key, item]) => FORBIDDEN_KEYS.test(key) || containsForbiddenKey(item, depth + 1));
}

function sanitizeClaims(values, allowedEvidenceIds, { citationsRequired = true, maximum = 30 } = {}) {
  const source = Array.isArray(values) ? values : [];
  const claims = [];
  for (const value of source.slice(0, maximum)) {
    const object = typeof value === 'string' ? { text: value, evidence_ids: [] } : value;
    if (!object || typeof object !== 'object') continue;
    const text = clean(object.text || object.claim || object.summary, 1800);
    const requested = cleanRefs(object.evidence_ids || object.evidenceIds, 40);
    const evidenceIds = requested.filter(id => allowedEvidenceIds.has(id));
    if (!text) continue;
    if (requested.length !== evidenceIds.length) throw new Error('Claim cited an evidence ID outside the supplied context');
    if (citationsRequired && evidenceIds.length === 0) throw new Error('Evidence-backed claim omitted its evidence IDs');
    claims.push({ text, evidence_ids: evidenceIds });
  }
  return claims;
}

export function validatePublicInvestigationResult(payload, context = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Public result must be a JSON object');
  if (containsForbiddenKey(payload)) throw new Error('Public result contains private reasoning, prompt or secret material');
  const unknownFields = Object.keys(payload).filter(key => !TOP_LEVEL_FIELDS.has(key));
  if (unknownFields.length) throw new Error(`Public result contains unsupported field: ${unknownFields[0]}`);

  const investigationId = clean(context.investigation_id, 180);
  if (!investigationId || clean(payload.investigation_id, 180) !== investigationId) throw new Error('Public result investigation_id does not match the queued investigation');

  const question = clean(context.question, 4000);
  if (!question || (payload.question != null && clean(payload.question, 4000) !== question)) throw new Error('Public result question does not match the queued investigation');

  const allowedEvidence = Array.isArray(context.evidence) ? context.evidence : [];
  const allowedEvidenceIds = new Set(allowedEvidence.map(item => clean(item?.evidence_id, 300)).filter(Boolean));
  const allowedRoutes = new Set(allowedEvidence.flatMap(item => [item?.source_route, item?.matrix_route]).map(value => clean(value, 1000)).filter(Boolean));
  for (const route of cleanRefs(context.related_routes, 100)) allowedRoutes.add(route);

  const requestedEvidenceIds = cleanRefs(payload.evidence_ids, 100);
  const evidenceIds = requestedEvidenceIds.filter(id => allowedEvidenceIds.has(id));
  if (requestedEvidenceIds.length !== evidenceIds.length) throw new Error('Public result cited an invented or unselected evidence ID');

  const requestedRoutes = cleanRefs(payload.source_routes, 100);
  const sourceRoutes = requestedRoutes.filter(route => allowedRoutes.has(route));
  if (requestedRoutes.length !== sourceRoutes.length) throw new Error('Public result cited a source route outside the supplied context');

  const facts = sanitizeClaims(payload.facts, allowedEvidenceIds, { citationsRequired: true });
  const allegations = sanitizeClaims(payload.allegations_or_disputed_claims, allowedEvidenceIds, { citationsRequired: true });
  const inferences = sanitizeClaims(payload.inferences, allowedEvidenceIds, { citationsRequired: true });
  const unknowns = sanitizeClaims(payload.unknowns, allowedEvidenceIds, { citationsRequired: false });
  const citedByClaims = new Set([...facts, ...allegations, ...inferences, ...unknowns].flatMap(item => item.evidence_ids));
  for (const id of citedByClaims) if (!evidenceIds.includes(id)) evidenceIds.push(id);

  const answer = clean(payload.answer, 7000);
  if (!answer) throw new Error('Public result answer is required');
  if ((facts.length || allegations.length || inferences.length) && evidenceIds.length === 0) throw new Error('Public result made claims without selected evidence');

  const confidence = Math.max(0, Math.min(1, Number(payload.confidence || 0)));
  const evidenceBoundary = clean(payload.evidence_boundary || context.evidence_boundary, 1800);
  if (!evidenceBoundary) throw new Error('Public result evidence boundary is required');

  return {
    investigation_id: investigationId,
    question,
    answer,
    facts,
    allegations_or_disputed_claims: allegations,
    inferences,
    unknowns,
    evidence_ids: evidenceIds,
    source_routes: sourceRoutes,
    confidence,
    related_entities: cleanRefs(payload.related_entities, 40),
    related_investigations: cleanRefs(payload.related_investigations, 30),
    evidence_boundary: evidenceBoundary
  };
}

export function publicInvestigationPromptPayload(context = {}) {
  const evidence = (Array.isArray(context.evidence) ? context.evidence : []).slice(0, 12).map(item => ({
    evidence_id: clean(item.evidence_id, 300),
    title: clean(item.title, 420),
    summary: clean(item.summary || item.establishes, 1000),
    establishes: clean(item.establishes, 1000),
    does_not_establish: clean(item.does_not_establish || item.evidence_boundary, 1000),
    evidence_grade: clean(item.evidence_grade, 140),
    claim_class: clean(item.claim_class, 80),
    source_route: clean(item.source_route, 1000),
    related_entities: cleanRefs(item.related_entities, 24)
  }));
  return {
    investigation_id: clean(context.investigation_id, 180),
    question: clean(context.question, 4000),
    classification: context.classification || {},
    evidence_boundary: clean(context.evidence_boundary, 1800),
    evidence,
    related_routes: cleanRefs(context.related_routes, 20),
    output_contract: {
      fields: [...TOP_LEVEL_FIELDS],
      citations_must_be_subset_of: evidence.map(item => item.evidence_id),
      hidden_reasoning_forbidden: true,
      unsupported_claims_forbidden: true
    }
  };
}

export const publicInvestigationContractInternals = {
  clean,
  cleanRefs,
  containsForbiddenKey,
  sanitizeClaims
};
