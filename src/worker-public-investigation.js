import { D1ResourceRegistry } from '../ai-management/resource-registry/resource-registry.mjs';
import { routeLocalModel } from '../ai-management/local-runtime/model-router.mjs';
import {
  publicInvestigationPromptPayload,
  validatePublicInvestigationResult
} from './public-investigation-contract.js';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

const ROUTE_ROOT = '/api/investigate';
const CORPUS_PATH = '/data/public-investigation-corpus.json';
const PROMPT_VERSION = 'ask-matrix-public-v1';
const CORPUS_CACHE_MS = 5 * 60 * 1000;
const STOP = new Set('a an and are as at be been but by can could did do does for from had has have how i if in into is it its may might of on or our she should so than that the their them then there these they this those to was we were what when where which who why will with would you your show tell ask matrix please'.split(' '));
const TYPO_MAP = new Map([
  ['epstien', 'epstein'],
  ['goverment', 'government'],
  ['parliment', 'parliament'],
  ['blackrok', 'blackrock'],
  ['redacton', 'redaction'],
  ['contrct', 'contract'],
  ['compny', 'company'],
  ['procurment', 'procurement']
]);

let corpusCache = null;
let corpusCachedAt = 0;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-matrix-origin': 'cloudflare-worker-public-investigation'
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { ...HEADERS, ...extraHeaders } });
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function clean(value, maximum = 1000) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function cleanRefs(values, maximum = 100) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => clean(value, 1000)).filter(Boolean))].slice(0, maximum);
}

function parseJson(value, fallback) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function normalizeQuestion(question) {
  return clean(question, 4000)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9:&/.'-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => TYPO_MAP.get(token) || token)
    .join(' ');
}

function tokens(value) {
  return [...new Set(normalizeQuestion(value).split(/\s+/).filter(token => token.length > 1 && !STOP.has(token)))];
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function nowIso() {
  return new Date().toISOString();
}

async function readBody(request, maximumBytes = 16 * 1024) {
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new Error('Content-Type must be application/json');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximumBytes) throw new Error('Request body exceeds the public investigation limit');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error('Request body exceeds the public investigation limit');
  return text ? JSON.parse(text) : {};
}

function requestIp(request) {
  return clean(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown', 160).split(',')[0].trim();
}

async function enforceRateLimit(request, env) {
  const maximum = Math.max(1, Math.min(60, Number(env?.MATRIX_PUBLIC_INVESTIGATION_RATE_LIMIT_PER_MINUTE || 12)));
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  const bucketKey = await sha256(`${requestIp(request)}|${env?.CONTACT_RATE_LIMIT_SALT || 'matrix-public-investigation-v1'}|${windowStart}`);
  const at = new Date(now).toISOString();
  await env.MEMBERS_DB.prepare(`INSERT INTO matrix_public_investigation_rate_limits(bucket_key,request_count,window_started_at,updated_at)
    VALUES(?,1,?,?) ON CONFLICT(bucket_key) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(
    bucketKey,
    new Date(windowStart).toISOString(),
    at
  ).run();
  const row = await env.MEMBERS_DB.prepare('SELECT request_count FROM matrix_public_investigation_rate_limits WHERE bucket_key=? LIMIT 1').bind(bucketKey).first();
  if (Number(row?.request_count || 0) === 1) {
    await env.MEMBERS_DB.prepare('DELETE FROM matrix_public_investigation_rate_limits WHERE updated_at<?').bind(new Date(now - 2 * 86400000).toISOString()).run().catch(() => null);
  }
  const retryAfter = Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000));
  return { limited: Number(row?.request_count || 0) > maximum, retryAfter };
}

function requestPath(request) {
  return new URL(request.url).pathname.replace(/\/+$/, '') || '/';
}

function investigationIdFromPath(path) {
  const match = String(path || '').match(/^\/api\/investigate\/([a-zA-Z0-9-]{8,180})$/);
  return match ? match[1] : '';
}

function classificationFor(question, mode = '') {
  const value = normalizeQuestion(question);
  const relationship = /\b(?:relationship|connected|connection|linked|link|association|between|network|board|donor|owns|owner|managed by)\b/.test(value);
  const disputed = /\b(?:alleged|allegation|claim|rumou?r|disputed|controvers|accused|conspiracy|cover.?up|corrupt|fraud|criminal|guilty)\b/.test(value);
  const multiRecord = /\b(?:several|multiple|across|pattern|timeline|changed|compare|contradict|contrary|all records)\b/.test(value);
  const sourceHunt = /\b(?:source|record|document|filing|court|enforcement|docket|evidence|proof|contract|award|notice)\b/.test(value);
  let queryType = 'documented-fact';
  if (relationship) queryType = 'entity-relationship';
  if (disputed) queryType = 'disputed-claim';
  if (multiRecord) queryType = 'multi-record-investigation';
  if (!tokens(value).length) queryType = 'insufficient-context';
  return {
    query_type: clean(mode, 60) || queryType,
    relationship_requested: relationship,
    disputed_material_possible: disputed,
    multiple_records_requested: multiRecord,
    source_record_requested: sourceHunt,
    normalized_query: value
  };
}

function corpusItemText(item) {
  return [
    item.title,
    item.summary,
    item.establishes,
    item.does_not_establish,
    item.source_publisher,
    item.source_type,
    item.evidence_grade,
    item.factual_status,
    ...(item.related_entities || []),
    item.relationship?.from,
    item.relationship?.to,
    item.relationship?.type
  ].filter(Boolean).join(' ');
}

function fieldMatches(text, queryTokens) {
  const haystack = ` ${normalizeQuestion(text)} `;
  return queryTokens.filter(token => haystack.includes(` ${token} `) || haystack.includes(token));
}

function scoreEvidence(item, query, queryTokens, classification, learnedEvidenceIds) {
  const normalized = normalizeQuestion(query);
  const titleMatches = fieldMatches(item.title, queryTokens);
  const entityMatches = fieldMatches((item.related_entities || []).join(' '), queryTokens);
  const bodyMatches = fieldMatches(corpusItemText(item), queryTokens);
  const coverage = bodyMatches.length / Math.max(1, queryTokens.length);
  let score = titleMatches.length * 6 + entityMatches.length * 7 + bodyMatches.length * 2 + coverage * 8;
  const all = normalizeQuestion(corpusItemText(item));
  if (normalized.length > 5 && all.includes(normalized)) score += 14;
  if (/^(?:A|verified|official)/i.test(String(item.evidence_grade || ''))) score += 1.5;
  if (classification.relationship_requested && item.relationship) score += 7;
  if (classification.disputed_material_possible && item.claim_class === 'allegation_or_disputed') score += 2;
  if (learnedEvidenceIds.has(item.evidence_id)) score += 5;
  return { score, coverage, matches: bodyMatches };
}

function scoreRoute(item, query, queryTokens) {
  const text = [item.title, item.description, item.category, item.layer, item.entity, ...(item.keywords || [])].filter(Boolean).join(' ');
  const matched = fieldMatches(text, queryTokens);
  const normalized = normalizeQuestion(query);
  const haystack = normalizeQuestion(text);
  return matched.length * 3 + (normalized.length > 5 && haystack.includes(normalized) ? 10 : 0) + Math.min(1, Number(item.priority || 0) / 120);
}

function relatedRouteResults(corpus, query, queryTokens) {
  return (corpus.routes || [])
    .map(item => ({ ...item, _score: scoreRoute(item, query, queryTokens) }))
    .filter(item => item._score > 1)
    .sort((left, right) => right._score - left._score || Number(right.priority || 0) - Number(left.priority || 0))
    .slice(0, 8)
    .map(({ _score, ...item }) => item);
}

function diversifyEvidence(ranked, maximum = 12) {
  const selected = [];
  const perAsset = new Map();
  const perPublisher = new Map();
  for (const item of ranked) {
    const asset = item.source_asset || 'unknown';
    const publisher = item.source_publisher || item.source_type || 'unknown';
    if ((perAsset.get(asset) || 0) >= 5 || (perPublisher.get(publisher) || 0) >= 4) continue;
    selected.push(item);
    perAsset.set(asset, (perAsset.get(asset) || 0) + 1);
    perPublisher.set(publisher, (perPublisher.get(publisher) || 0) + 1);
    if (selected.length >= maximum) break;
  }
  return selected;
}

export function retrieveEvidence(corpus, question, { classification = classificationFor(question), learnedEvidenceIds = new Set() } = {}) {
  const queryTokens = tokens(question);
  if (!queryTokens.length) return { selected: [], routes: [], related_entities: [], related_relationships: [], confidence: 0 };
  const ranked = (corpus.evidence || []).map(item => {
    const detail = scoreEvidence(item, question, queryTokens, classification, learnedEvidenceIds);
    return { ...item, retrieval_score: detail.score, retrieval_coverage: detail.coverage, retrieval_matches: detail.matches };
  }).filter(item => item.retrieval_score >= 4 && item.retrieval_coverage >= (queryTokens.length <= 2 ? 0.5 : 0.3))
    .sort((left, right) => right.retrieval_score - left.retrieval_score || right.retrieval_coverage - left.retrieval_coverage);
  const selected = diversifyEvidence(ranked, classification.multiple_records_requested ? 12 : 8);
  const relatedEntities = cleanRefs(selected.flatMap(item => item.related_entities || []), 30);
  const relatedRelationships = (corpus.relationships || []).filter(item => {
    const text = `${item.from || ''} ${item.to || ''} ${item.relationship_type || ''}`;
    return fieldMatches(text, queryTokens).length > 0;
  }).sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, 8);
  const top = selected[0];
  const confidence = top ? Math.max(0.2, Math.min(0.92, 0.18 + top.retrieval_coverage * 0.42 + top.retrieval_score / 100)) : 0;
  return {
    selected,
    routes: relatedRouteResults(corpus, question, queryTokens),
    related_entities: relatedEntities,
    related_relationships: relatedRelationships,
    confidence
  };
}

function claimFromEvidence(item) {
  return clean(item.establishes || item.summary || `Matrix preserved the source record titled “${item.title}”.`, 1600);
}

function deterministicAnswer({ investigationId, question, classification, retrieval, corpus }) {
  const selected = retrieval.selected;
  const facts = [];
  const allegations = [];
  const inferences = [];
  const unknowns = [];

  for (const item of selected) {
    const claim = { text: claimFromEvidence(item), evidence_ids: [item.evidence_id] };
    if (item.claim_class === 'allegation_or_disputed') allegations.push({
      text: `${claim.text} This is preserved as a lead or disputed item, not a verdict.`,
      evidence_ids: claim.evidence_ids
    });
    else if (item.claim_class === 'documented_association') inferences.push({
      text: `${claim.text} The cited association does not establish guilt, shared motive or private coordination.`,
      evidence_ids: claim.evidence_ids
    });
    else facts.push(claim);
  }

  const missing = cleanRefs(selected.flatMap(item => item.missing_records || []), 6);
  for (const text of missing) unknowns.push({ text, evidence_ids: [] });
  if (!selected.length) {
    unknowns.push({
      text: 'The current public Matrix corpus did not return sufficiently relevant evidence. A narrower entity name, jurisdiction, date, document identifier or source route may be required.',
      evidence_ids: []
    });
  }
  if (!unknowns.length) unknowns.push({
    text: 'The selected records do not establish facts beyond their stated evidence boundaries; motive, causation and undisclosed conduct remain unknown unless a cited record says otherwise.',
    evidence_ids: []
  });

  let answer;
  if (!selected.length) {
    answer = 'Matrix does not currently have enough relevant evidence in its public corpus to answer this question responsibly. The result is an evidence boundary, not a negative proof: the requested fact or relationship may require a more specific name, date, jurisdiction, filing, docket or source record.';
  } else {
    const top = selected[0];
    const boundary = clean(top.does_not_establish || top.evidence_boundary, 900);
    answer = `The strongest bounded answer in the current Matrix corpus is: ${claimFromEvidence(top)}${boundary ? ` The record does not establish: ${boundary}` : ''}`;
    if (classification.disputed_material_possible || top.claim_class === 'allegation_or_disputed') {
      answer += ' Disputed material and source leads are shown separately from documented facts.';
    }
  }

  const result = {
    investigation_id: investigationId,
    question,
    answer,
    facts: facts.slice(0, 6),
    allegations_or_disputed_claims: allegations.slice(0, 6),
    inferences: inferences.slice(0, 6),
    unknowns: unknowns.slice(0, 8),
    evidence_ids: selected.map(item => item.evidence_id),
    source_routes: cleanRefs(selected.map(item => item.source_route), 20),
    confidence: selected.length ? Math.min(0.78, retrieval.confidence) : 0.08,
    related_entities: retrieval.related_entities,
    related_investigations: cleanRefs([...selected.map(item => item.matrix_route), ...retrieval.routes.map(item => item.url)], 20),
    evidence_boundary: corpus.evidence_boundary || 'Retrieval relevance is not proof. Claims remain bounded by the cited records.'
  };
  return validatePublicInvestigationResult(result, {
    investigation_id: investigationId,
    question,
    evidence: selected,
    related_routes: retrieval.routes.map(item => item.url),
    evidence_boundary: corpus.evidence_boundary
  });
}

async function loadCorpus(request, env) {
  if (corpusCache && Date.now() - corpusCachedAt < CORPUS_CACHE_MS) return corpusCache;
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') throw new Error('Public evidence corpus asset binding is unavailable');
  const url = new URL(request.url);
  url.pathname = CORPUS_PATH;
  url.search = '';
  const response = await env.ASSETS.fetch(new Request(url.toString(), { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } }));
  if (!response.ok) throw new Error(`Public evidence corpus returned HTTP ${response.status}`);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();
  if (!type.includes('application/json') || /^\s*</.test(text)) throw new Error('Public evidence corpus returned a non-JSON response');
  const parsed = JSON.parse(text);
  if (parsed?.schema_version !== 'matrix-public-investigation-corpus-v1' || !Array.isArray(parsed.evidence)) throw new Error('Public evidence corpus contract is invalid');
  corpusCache = parsed;
  corpusCachedAt = Date.now();
  return parsed;
}

async function mergeLivingEvidence(corpus, env) {
  if (!env?.MEMBERS_DB?.prepare) return corpus;
  try {
    const result = await env.MEMBERS_DB.prepare(`SELECT content_json FROM matrix_living_projections
      WHERE projection_type='evidence' AND public_visible=1 AND state='active' AND evidence_class='VERIFIED'
      ORDER BY updated_at DESC LIMIT 500`).all();
    const dynamic = (result?.results || []).map(row => parseJson(row.content_json, null)).filter(item => item?.evidence_id && item?.source_route);
    if (!dynamic.length) return corpus;
    const merged = new Map((corpus.evidence || []).map(item => [item.evidence_id, item]));
    for (const item of dynamic) merged.set(item.evidence_id, item);
    return { ...corpus, evidence: [...merged.values()], counts: { ...(corpus.counts || {}), evidence: merged.size, living_evidence: dynamic.length } };
  } catch {
    return corpus;
  }
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  try {
    await env.MEMBERS_DB.prepare('SELECT investigation_id FROM matrix_public_investigations LIMIT 1').all();
    await env.MEMBERS_DB.prepare('SELECT bucket_key FROM matrix_public_investigation_rate_limits LIMIT 1').all();
    await env.MEMBERS_DB.prepare('SELECT learning_id FROM matrix_learning_ledger LIMIT 1').all();
    return true;
  } catch {
    return false;
  }
}

async function updateState(db, investigationId, state, history, extra = {}) {
  const at = nowIso();
  history.push({ state, at });
  await db.prepare(`UPDATE matrix_public_investigations SET status=?,state_history_json=?,updated_at=?,error_type=?,error_text=? WHERE investigation_id=?`).bind(
    state,
    JSON.stringify(history),
    at,
    extra.error_type || null,
    extra.error_text ? clean(extra.error_text, 1200) : null,
    investigationId
  ).run();
  return at;
}

async function learningHints(db, observation) {
  const evidenceIds = new Set();
  try {
    const rows = await db.prepare(`SELECT evidence_json FROM matrix_learning_ledger
      WHERE domain='research' AND observation=? AND decision IN ('recorded','approved')
      ORDER BY created_at DESC LIMIT 20`).bind(observation).all();
    for (const row of rows?.results || []) {
      const evidence = parseJson(row.evidence_json, {});
      if (evidence.validation_passed !== true) continue;
      for (const id of cleanRefs(evidence.evidence_ids, 100)) evidenceIds.add(id);
    }
  } catch {}
  return evidenceIds;
}

async function recordLearning(env, {
  investigationId,
  questionHash,
  normalizedQuestion,
  classification,
  result,
  retrieval,
  modelId,
  resourceId,
  fallbackUsed,
  validationPassed,
  latency,
  failureType = null
}) {
  const db = env.MEMBERS_DB;
  const createdAt = nowIso();
  const learningId = `public-investigation:${investigationId}:${createdAt}`.slice(0, 240);
  const observation = `public-investigation:${questionHash}`;
  const evidence = {
    event_type: 'public-investigation-outcome',
    investigation_id: investigationId,
    normalized_question: normalizedQuestion,
    classification,
    evidence_ids: result?.evidence_ids || [],
    retrieval_scores: (retrieval?.selected || []).map(item => ({ evidence_id: item.evidence_id, score: item.retrieval_score })),
    model_id: modelId || null,
    resource_id: resourceId || null,
    prompt_version: PROMPT_VERSION,
    validation_passed: validationPassed === true,
    fallback_used: fallbackUsed === true,
    failure_type: failureType,
    latency
  };
  await db.prepare(`INSERT OR IGNORE INTO matrix_learning_ledger(
    learning_id,source_event_id,domain,observation,proposed_change,change_class,decision,evidence_json,audit_identifier,created_at
  ) VALUES(?,NULL,'research',?,'Reuse validated evidence selections only as bounded ranking hints for equivalent future queries.','B','recorded',?,?,?)`).bind(
    learningId,
    observation,
    JSON.stringify(evidence),
    `audit:${learningId}`,
    createdAt
  ).run();
  await emitMatrixSystemEvent(env, {
    eventType: 'learning.signal.created',
    auditIdentifier: `learning-signal:${learningId}`,
    timestamp: createdAt,
    origin: 'ask-matrix',
    actor: 'public-investigation-learning',
    affectedPages: ['answer-engine.html'],
    payload: {
      change_summary: `Ask Matrix recorded a validated retrieval outcome for investigation ${investigationId}.`,
      investigation_id: investigationId,
      evidence_ids: evidence.evidence_ids,
      validation_passed: validationPassed === true,
      fallback_used: fallbackUsed === true,
      cost_confirmed_zero: true
    }
  });
}

async function existingRecentInvestigation(db, questionHash) {
  try {
    return await db.prepare(`SELECT * FROM matrix_public_investigations
      WHERE question_hash=? AND created_at>=datetime('now','-5 minutes') AND status IN ('queued','complete')
      ORDER BY created_at DESC LIMIT 1`).bind(questionHash).first();
  } catch {
    return null;
  }
}

function publicRow(row, evidenceRows = []) {
  const answer = parseJson(row.answer_json, null);
  return {
    ok: true,
    investigation_id: row.investigation_id,
    status: row.status,
    question: row.question,
    normalized_question: row.normalized_question,
    mode: row.mode,
    classification: parseJson(row.query_classification_json, {}),
    result: answer,
    evidence_used: evidenceRows.map(item => parseJson(item.evidence_snapshot_json, {})),
    fallback_used: Number(row.fallback_used || 0) === 1,
    synthesis_pending: Number(row.synthesis_pending || 0) === 1,
    model_id: row.model_id || null,
    resource_id: row.resource_id || null,
    prompt_version: row.prompt_version || PROMPT_VERSION,
    state_history: parseJson(row.state_history_json, []),
    latency_ms: {
      retrieval: Number(row.retrieval_latency_ms || 0),
      model: Number(row.model_latency_ms || 0),
      verification: Number(row.verification_latency_ms || 0),
      total: Number(row.total_latency_ms || 0)
    },
    error: row.error_type ? { type: row.error_type, message: row.error_text } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at
  };
}

async function evidenceRows(db, investigationId) {
  const rows = await db.prepare(`SELECT evidence_snapshot_json FROM matrix_public_investigation_evidence
    WHERE investigation_id=? ORDER BY rank ASC LIMIT 20`).bind(investigationId).all();
  return rows?.results || [];
}

async function getInvestigation(env, investigationId) {
  if (!await schemaReady(env)) return json({ ok: false, recoverable: true, error: 'Public investigation storage is unavailable', reason: 'migration-or-d1-unavailable' }, 503);
  const row = await env.MEMBERS_DB.prepare('SELECT * FROM matrix_public_investigations WHERE investigation_id=? LIMIT 1').bind(investigationId).first();
  if (!row) return json({ ok: false, error: 'Investigation not found' }, 404);
  return json(publicRow(row, await evidenceRows(env.MEMBERS_DB, investigationId)));
}

async function selectLocalModel(env, question, evidenceCount) {
  if (!enabled(env?.MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED, false)) return null;
  try {
    const resources = (await new D1ResourceRegistry(env.MEMBERS_DB).list()).filter(resource => Number(resource.resource_tier) === 1 && resource.metadata?.local === true && resource.enabled);
    if (!resources.length) return null;
    const route = routeLocalModel(resources, {
      job_type: 'llm.generate',
      data_class: 'public',
      task_profile: 'long-context',
      prompt_tokens_estimate: Math.min(24000, 600 + evidenceCount * 900 + Math.ceil(question.length / 3)),
      max_tokens: 1800,
      metadata: { public_investigation: true }
    }, { now: new Date() });
    return route?.selected || null;
  } catch {
    return null;
  }
}

async function enqueueLocalEnrichment(env, context, route) {
  const maximumPending = Math.max(0, Math.min(100, Number(env?.MATRIX_PUBLIC_INVESTIGATION_MAX_PENDING_LOCAL_JOBS || 20)));
  if (!maximumPending) return null;
  const pending = await env.MEMBERS_DB.prepare(`SELECT COUNT(*) AS count FROM ai_local_jobs
    WHERE status IN ('queued','leased') AND json_extract(payload_json,'$.public_investigation.investigation_id') IS NOT NULL`).first();
  if (Number(pending?.count || 0) >= maximumPending) return null;
  const jobId = `public-investigation-${context.investigation_id}`.slice(0, 160);
  const createdAt = nowIso();
  const selected = route.resource || {};
  const modelId = clean(selected.metadata?.model_id, 300);
  const resourceId = clean(selected.resource_id, 300);
  if (!modelId || !resourceId) return null;
  const payload = {
    model_id: modelId,
    max_tokens: 1800,
    public_investigation: publicInvestigationPromptPayload(context),
    selected_resource_id: resourceId,
    prompt_compilation_location: 'owner-controlled-local-machine',
    prompt_material_in_cloud_payload: false
  };
  const requirements = {
    cost_ceiling_eur: 0,
    external_network_allowed: false,
    task_profile: 'long-context',
    selected_resource_id: resourceId,
    public_safe_result_required: true
  };
  await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO ai_local_jobs(
    job_id,job_type,payload_json,requirements_json,data_class,priority,status,attempt_count,maximum_attempts,created_at,updated_at
  ) VALUES(?,'llm.generate',?,?, 'public','P1','queued',0,3,?,?)`).bind(
    jobId,
    JSON.stringify(payload),
    JSON.stringify(requirements),
    createdAt,
    createdAt
  ).run();
  return { job_id: jobId, model_id: modelId, resource_id: resourceId };
}

async function createInvestigation(request, env) {
  if (!enabled(env?.MATRIX_PUBLIC_INVESTIGATION_ENABLED, true)) return json({ ok: false, recoverable: true, error: 'Ask Matrix is temporarily disabled' }, 503);
  if (!await schemaReady(env)) return json({ ok: false, recoverable: true, error: 'Public investigation storage is unavailable', reason: 'migration-or-d1-unavailable' }, 503);

  let body;
  try { body = await readBody(request); } catch (error) { return json({ ok: false, error: clean(error?.message || error, 500) }, 400); }
  const question = clean(body.question, 4000);
  if (question.length < 8) return json({ ok: false, error: 'Question must contain at least 8 characters' }, 400);
  const rate = await enforceRateLimit(request, env);
  if (rate.limited) return json({ ok: false, recoverable: true, error: 'Ask Matrix rate limit reached. Try again shortly.' }, 429, { 'retry-after': String(rate.retryAfter) });
  const mode = ['fast','standard','deep'].includes(String(body.mode || '')) ? String(body.mode) : 'standard';
  const normalizedQuestion = normalizeQuestion(question);
  const questionHash = await sha256(normalizedQuestion);
  const recent = await existingRecentInvestigation(env.MEMBERS_DB, questionHash);
  if (recent) return json({ ...publicRow(recent, await evidenceRows(env.MEMBERS_DB, recent.investigation_id)), reused: true }, recent.status === 'queued' ? 202 : 200);

  const investigationId = `investigation-${crypto.randomUUID()}`;
  const createdAt = nowIso();
  const history = [{ state: 'queued', at: createdAt }, { state: 'retrieving', at: createdAt }];
  const classification = classificationFor(question, body.filter || body.mode);
  await env.MEMBERS_DB.prepare(`INSERT INTO matrix_public_investigations(
    investigation_id,question_hash,question,normalized_question,mode,status,query_classification_json,
    answer_json,evidence_ids_json,source_routes_json,related_entities_json,local_job_id,model_id,resource_id,
    prompt_version,fallback_used,synthesis_pending,validation_json,state_history_json,retrieval_latency_ms,
    model_latency_ms,verification_latency_ms,total_latency_ms,error_type,error_text,created_at,updated_at,completed_at
  ) VALUES(?,?,?,?,?,'retrieving',?,NULL,'[]','[]','[]',NULL,NULL,NULL,?,1,0,'{}',?,0,0,0,0,NULL,NULL,?,?,NULL)`).bind(
    investigationId,
    questionHash,
    question,
    normalizedQuestion,
    mode,
    JSON.stringify(classification),
    PROMPT_VERSION,
    JSON.stringify(history),
    createdAt,
    createdAt
  ).run();

  const totalStarted = Date.now();
  let retrieval;
  let corpus;
  let retrievalLatency = 0;
  try {
    const retrievalStarted = Date.now();
    corpus = await mergeLivingEvidence(await loadCorpus(request, env), env);
    const learnedEvidenceIds = await learningHints(env.MEMBERS_DB, `public-investigation:${questionHash}`);
    retrieval = retrieveEvidence(corpus, question, { classification, learnedEvidenceIds });
    retrievalLatency = Date.now() - retrievalStarted;
    await updateState(env.MEMBERS_DB, investigationId, 'analysing', history);
  } catch (error) {
    await updateState(env.MEMBERS_DB, investigationId, 'failed', history, { error_type: 'evidence-corpus-unavailable', error_text: error?.message || error }).catch(() => null);
    return json({
      ok: false,
      recoverable: true,
      investigation_id: investigationId,
      status: 'failed',
      error: 'Matrix evidence retrieval is temporarily unavailable. No answer or citation was fabricated.',
      reason: clean(error?.message || error, 500)
    }, 503);
  }

  const verificationStarted = Date.now();
  await updateState(env.MEMBERS_DB, investigationId, 'verifying', history);
  let fallbackResult;
  try {
    fallbackResult = deterministicAnswer({ investigationId, question, classification, retrieval, corpus });
  } catch (error) {
    await updateState(env.MEMBERS_DB, investigationId, 'failed', history, { error_type: 'deterministic-validation-failed', error_text: error?.message || error }).catch(() => null);
    return json({ ok: false, recoverable: true, investigation_id: investigationId, status: 'failed', error: 'Matrix could not validate the evidence-only answer.' }, 503);
  }
  const verificationLatency = Date.now() - verificationStarted;

  for (let index = 0; index < retrieval.selected.length; index += 1) {
    const item = retrieval.selected[index];
    await env.MEMBERS_DB.prepare(`INSERT INTO matrix_public_investigation_evidence(
      investigation_id,evidence_id,rank,retrieval_score,source_route,evidence_snapshot_json,selected_at
    ) VALUES(?,?,?,?,?,?,?)`).bind(
      investigationId,
      item.evidence_id,
      index + 1,
      Number(item.retrieval_score || 0),
      item.source_route,
      JSON.stringify(item),
      nowIso()
    ).run();
  }

  const route = retrieval.selected.length ? await selectLocalModel(env, question, retrieval.selected.length) : null;
  let local = null;
  if (route) {
    local = await enqueueLocalEnrichment(env, {
      investigation_id: investigationId,
      question,
      classification,
      evidence_boundary: corpus.evidence_boundary,
      evidence: retrieval.selected,
      related_routes: retrieval.routes.map(item => item.url)
    }, route).catch(() => null);
  }

  const finalStatus = local ? 'queued' : 'complete';
  history.push({ state: finalStatus, at: nowIso() });
  const totalLatency = Date.now() - totalStarted;
  const completedAt = finalStatus === 'complete' ? nowIso() : null;
  await env.MEMBERS_DB.prepare(`UPDATE matrix_public_investigations SET
    status=?,answer_json=?,evidence_ids_json=?,source_routes_json=?,related_entities_json=?,local_job_id=?,
    model_id=?,resource_id=?,fallback_used=1,synthesis_pending=?,validation_json=?,state_history_json=?,
    retrieval_latency_ms=?,verification_latency_ms=?,total_latency_ms=?,updated_at=?,completed_at=?
    WHERE investigation_id=?`).bind(
    finalStatus,
    JSON.stringify(fallbackResult),
    JSON.stringify(fallbackResult.evidence_ids),
    JSON.stringify(fallbackResult.source_routes),
    JSON.stringify(fallbackResult.related_entities),
    local?.job_id || null,
    local?.model_id || null,
    local?.resource_id || null,
    local ? 1 : 0,
    JSON.stringify({ passed: true, validator: 'deterministic-evidence-subset-v1', invented_citations_rejected: true }),
    JSON.stringify(history),
    retrievalLatency,
    verificationLatency,
    totalLatency,
    nowIso(),
    completedAt,
    investigationId
  ).run();

  await recordLearning(env, {
    investigationId,
    questionHash,
    normalizedQuestion,
    classification,
    result: fallbackResult,
    retrieval,
    modelId: local?.model_id,
    resourceId: local?.resource_id,
    fallbackUsed: true,
    validationPassed: true,
    latency: { retrieval_ms: retrievalLatency, verification_ms: verificationLatency, total_ms: totalLatency },
    failureType: local ? null : 'no-eligible-model-evidence-fallback'
  }).catch(() => null);

  const row = await env.MEMBERS_DB.prepare('SELECT * FROM matrix_public_investigations WHERE investigation_id=?').bind(investigationId).first();
  return json(publicRow(row, await evidenceRows(env.MEMBERS_DB, investigationId)), local ? 202 : 200, { location: `${ROUTE_ROOT}/${investigationId}` });
}

export async function completePublicInvestigationLocalResult(env, jobRow, completion) {
  const payload = parseJson(jobRow?.payload_json, {});
  const context = payload.public_investigation;
  if (!context?.investigation_id) return { handled: false };
  if (!completion?.result?.public_result) throw new Error('Local investigation completion omitted its validated public_result');
  const row = await env.MEMBERS_DB.prepare('SELECT * FROM matrix_public_investigations WHERE investigation_id=? LIMIT 1').bind(context.investigation_id).first();
  if (!row || row.local_job_id !== jobRow.job_id) throw new Error('Local result does not match a persisted public investigation job');
  const storedEvidence = (await evidenceRows(env.MEMBERS_DB, context.investigation_id)).map(item => parseJson(item.evidence_snapshot_json, {}));
  const validated = validatePublicInvestigationResult(completion.result.public_result, {
    investigation_id: context.investigation_id,
    question: row.question,
    evidence: storedEvidence,
    related_routes: context.related_routes,
    evidence_boundary: context.evidence_boundary
  });
  const completedAt = nowIso();
  const history = parseJson(row.state_history_json, []);
  history.push({ state: 'analysing', at: clean(completion.started_at, 80) || completedAt });
  history.push({ state: 'verifying', at: completedAt });
  history.push({ state: 'complete', at: completedAt });
  const modelLatency = Math.max(0, Number(completion.duration_ms || 0));
  await env.MEMBERS_DB.prepare(`UPDATE matrix_public_investigations SET
    status='complete',answer_json=?,evidence_ids_json=?,source_routes_json=?,related_entities_json=?,
    fallback_used=0,synthesis_pending=0,validation_json=?,state_history_json=?,model_latency_ms=?,
    total_latency_ms=total_latency_ms+?,error_type=NULL,error_text=NULL,updated_at=?,completed_at=?
    WHERE investigation_id=?`).bind(
    JSON.stringify(validated),
    JSON.stringify(validated.evidence_ids),
    JSON.stringify(validated.source_routes),
    JSON.stringify(validated.related_entities),
    JSON.stringify({ passed: true, validator: 'public-safe-model-result-v1', evidence_subset_valid: true, hidden_reasoning_exposed: false }),
    JSON.stringify(history),
    modelLatency,
    modelLatency,
    completedAt,
    completedAt,
    context.investigation_id
  ).run();
  await recordLearning(env, {
    investigationId: context.investigation_id,
    questionHash: row.question_hash,
    normalizedQuestion: row.normalized_question,
    classification: parseJson(row.query_classification_json, {}),
    result: validated,
    retrieval: { selected: storedEvidence },
    modelId: row.model_id,
    resourceId: row.resource_id,
    fallbackUsed: false,
    validationPassed: true,
    latency: { model_ms: modelLatency, total_ms: Number(row.total_latency_ms || 0) + modelLatency }
  });
  return { handled: true, investigation_id: context.investigation_id, public_result: validated };
}

export async function recordPublicInvestigationLocalFailure(env, jobRow, failureType, message, terminal = false) {
  const payload = parseJson(jobRow?.payload_json, {});
  const investigationId = payload?.public_investigation?.investigation_id;
  if (!investigationId) return { handled: false };
  if (!terminal) return { handled: true, investigation_id: investigationId };
  const row = await env.MEMBERS_DB.prepare('SELECT * FROM matrix_public_investigations WHERE investigation_id=? LIMIT 1').bind(investigationId).first();
  if (!row) return { handled: true, investigation_id: investigationId };
  const history = parseJson(row.state_history_json, []);
  history.push({ state: 'complete', at: nowIso(), fallback: true, model_failure: clean(failureType, 120) });
  await env.MEMBERS_DB.prepare(`UPDATE matrix_public_investigations SET
    status='complete',fallback_used=1,synthesis_pending=0,error_type=?,error_text=?,state_history_json=?,updated_at=?,completed_at=?
    WHERE investigation_id=?`).bind(
    clean(failureType || 'local-model-failed', 120),
    clean(message || 'Local model enrichment failed; the validated evidence-only answer remains available.', 1200),
    JSON.stringify(history),
    nowIso(),
    nowIso(),
    investigationId
  ).run();
  return { handled: true, investigation_id: investigationId };
}

export function isPublicInvestigationRoute(path = '') {
  return path === ROUTE_ROOT || Boolean(investigationIdFromPath(path));
}

export async function handlePublicInvestigationRoute(request, env) {
  const path = requestPath(request);
  try {
    if (path === ROUTE_ROOT && request.method === 'POST') return createInvestigation(request, env);
    const investigationId = investigationIdFromPath(path);
    if (investigationId && request.method === 'GET') return getInvestigation(env, investigationId);
    return json({ ok: false, error: 'Method not allowed' }, 405, { allow: path === ROUTE_ROOT ? 'POST' : 'GET' });
  } catch (error) {
    return json({
      ok: false,
      recoverable: true,
      error: 'Ask Matrix failed safely. No unsupported answer or citation was published.',
      reason: clean(error?.message || error, 500)
    }, 503);
  }
}

export const publicInvestigationInternals = {
  classificationFor,
  deterministicAnswer,
  learningHints,
  mergeLivingEvidence,
  normalizeQuestion,
  scoreEvidence,
  scoreRoute,
  tokens
};
