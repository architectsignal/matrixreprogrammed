import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  completePublicInvestigationLocalResult,
  handlePublicInvestigationRoute,
  publicInvestigationInternals,
  retrieveEvidence
} from '../src/worker-public-investigation.js';
import { validatePublicInvestigationResult } from '../src/public-investigation-contract.js';
import { parseModelJson } from '../local-agent/matrix-local-agent.mjs';

class D1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.parameters = [];
  }

  bind(...parameters) {
    this.parameters = parameters;
    return this;
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.parameters) || null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.parameters) };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
}

function createDatabase({ localJobs = false } = {}) {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync('migrations/phase13_matrix_synergy.sql', 'utf8'));
  database.exec(fs.readFileSync('migrations/public_investigation_api.sql', 'utf8'));
  if (localJobs) {
    database.exec(fs.readFileSync('migrations/phase9_ai_resource_orchestration.sql', 'utf8'));
    database.exec(fs.readFileSync('migrations/phase10_ai_autonomy.sql', 'utf8'));
    database.exec(fs.readFileSync('migrations/phase11_local_job_queue.sql', 'utf8'));
  }
  return { raw: database, d1: new D1Database(database) };
}

const corpusText = fs.readFileSync('data/public-investigation-corpus.json', 'utf8');
const corpus = JSON.parse(corpusText);
assert.ok(corpus.counts.evidence > 0, 'compiled corpus must retain public evidence');
assert.ok(corpus.counts.entities > 0, 'compiled corpus must retain evidence-linked entities');
assert.ok(corpus.counts.relationships > 0, 'compiled corpus must retain sourced relationships');
const recordedSearch = corpus.source_assets.find(item => item.path === 'search-index.json');
assert.ok(recordedSearch, 'compiled corpus must record its Search V3 source');
assert.equal(recordedSearch.sha256, crypto.createHash('sha256').update(fs.readFileSync('search-index.json')).digest('hex'));
if (fs.existsSync('_site/data/public-investigation-corpus.json')) {
  assert.equal(crypto.createHash('sha256').update(corpusText).digest('hex'),
    crypto.createHash('sha256').update(fs.readFileSync('_site/data/public-investigation-corpus.json')).digest('hex'),
    'root and deployable investigation corpora must be byte-identical');
}
const assets = {
  async fetch() {
    return new Response(corpusText, { status: 200, headers: { 'content-type': 'application/json' } });
  }
};

async function post(env, question, body = {}, headers = {}) {
  const request = new Request('https://matrixreprogrammed.com/api/investigate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ question, ...body })
  });
  const response = await handlePublicInvestigationRoute(request, env);
  return { response, body: await response.json() };
}

function assertCitationsResolve(payload) {
  const evidence = new Set((payload.evidence_used || []).map(item => item.evidence_id));
  for (const id of payload.result?.evidence_ids || []) assert.ok(evidence.has(id), `citation ${id} must resolve to selected evidence`);
  for (const section of ['facts', 'allegations_or_disputed_claims', 'inferences']) {
    for (const claim of payload.result?.[section] || []) {
      assert.ok(claim.evidence_ids.length > 0, `${section} claim must cite evidence`);
      for (const id of claim.evidence_ids) assert.ok(evidence.has(id), `${section} citation ${id} must resolve`);
    }
  }
}

// D1 and evidence-corpus failures must stop safely before an unsupported answer is published.
{
  const response = await handlePublicInvestigationRoute(new Request('https://matrixreprogrammed.com/api/investigate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What public record supports this question?' })
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).recoverable, true);
}

{
  const database = createDatabase();
  const unavailableAssets = { fetch: async () => new Response('missing', { status: 503, headers: { 'content-type': 'text/plain' } }) };
  const result = await post({ MEMBERS_DB: database.d1, ASSETS: unavailableAssets, MATRIX_PUBLIC_INVESTIGATION_ENABLED: 'true' }, 'What source record supports this question?');
  assert.equal(result.response.status, 503);
  assert.equal(result.body.status, 'failed');
  assert.match(result.body.error, /temporarily unavailable/i);
}

const database = createDatabase();
const env = {
  MEMBERS_DB: database.d1,
  ASSETS: assets,
  MATRIX_PUBLIC_INVESTIGATION_ENABLED: 'true',
  MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED: 'false'
};

const representativeQuestions = [
  ['simple documented fact', 'What does the official Tesla SEC filings route establish?'],
  ['entity relationship', 'What documented relationship appears between Vanguard S&P 500 ETF and Vanguard Group?'],
  ['controversial disputed claim', 'What disputed claim or allegation about Epstein and banks is present in the current evidence?'],
  ['insufficient evidence', 'What proves the zyxqv fabricated moon ledger controlled Parliament in 1811?'],
  ['several related records', 'What multiple public records connect Health and Human Services Department with Centers for Medicare and Medicaid Services?']
];

for (const [label, question] of representativeQuestions) {
  const result = await post(env, question);
  assert.equal(result.response.status, 200, `${label} should return an immediate validated fallback`);
  assert.equal(result.body.status, 'complete');
  assert.equal(result.body.fallback_used, true);
  assert.equal(result.body.synthesis_pending, false);
  assert.ok(result.body.result?.answer, `${label} should include an answer`);
  assert.ok(result.body.result?.evidence_boundary, `${label} should include an evidence boundary`);
  assert.ok(result.body.state_history.some(item => item.state === 'retrieving'));
  assert.ok(result.body.state_history.some(item => item.state === 'verifying'));
  assert.ok(result.body.state_history.some(item => item.state === 'complete'));
  assertCitationsResolve(result.body);
  const persisted = database.raw.prepare('SELECT status,answer_json FROM matrix_public_investigations WHERE investigation_id=?').get(result.body.investigation_id);
  assert.equal(persisted.status, 'complete');
  assert.ok(JSON.parse(persisted.answer_json).answer);
}

const insufficientRow = database.raw.prepare("SELECT answer_json FROM matrix_public_investigations WHERE normalized_question LIKE '%zyxqv%' LIMIT 1").get();
const insufficientAnswer = JSON.parse(insufficientRow.answer_json);
assert.equal(insufficientAnswer.evidence_ids.length, 0);
assert.match(insufficientAnswer.answer, /not currently have enough relevant evidence/i);

const disputedRow = database.raw.prepare("SELECT answer_json FROM matrix_public_investigations WHERE normalized_question LIKE '%epstein%' LIMIT 1").get();
assert.ok(JSON.parse(disputedRow.answer_json).allegations_or_disputed_claims.length > 0);

assert.equal(database.raw.prepare('SELECT COUNT(*) AS count FROM matrix_learning_ledger WHERE observation LIKE ?').get('public-investigation:%').count, representativeQuestions.length);
assert.equal(database.raw.prepare('SELECT COUNT(*) AS count FROM matrix_public_investigation_evidence').get().count > 0, true);

// Public abuse control hashes the client identity and returns a bounded retry response.
{
  const limitedDatabase = createDatabase();
  const limitedEnv = {
    MEMBERS_DB: limitedDatabase.d1,
    ASSETS: assets,
    MATRIX_PUBLIC_INVESTIGATION_ENABLED: 'true',
    MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED: 'false',
    MATRIX_PUBLIC_INVESTIGATION_RATE_LIMIT_PER_MINUTE: '2',
    CONTACT_RATE_LIMIT_SALT: 'test-only-salt'
  };
  const headers = { 'cf-connecting-ip': '203.0.113.44' };
  const originalDateNow = Date.now;
  Date.now = () => Date.parse('2026-08-12T12:00:10.000Z');
  let limited;
  try {
    assert.equal((await post(limitedEnv, 'What does the first official Tesla record establish?', {}, headers)).response.status, 200);
    assert.equal((await post(limitedEnv, 'What does the second official Tesla record establish?', {}, headers)).response.status, 200);
    limited = await post(limitedEnv, 'What does the third official Tesla record establish?', {}, headers);
  } finally {
    Date.now = originalDateNow;
  }
  assert.equal(limited.response.status, 429, 'all three requests must remain in one deterministic fixed-minute window');
  assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
  const bucket = limitedDatabase.raw.prepare('SELECT bucket_key FROM matrix_public_investigation_rate_limits LIMIT 1').get().bucket_key;
  assert.equal(bucket.length, 64);
  assert.equal(bucket.includes('203.0.113.44'), false);
}

// A repeat query reuses the persisted result instead of creating duplicate work.
{
  const firstCount = database.raw.prepare('SELECT COUNT(*) AS count FROM matrix_public_investigations').get().count;
  const repeat = await post(env, representativeQuestions[0][1]);
  assert.equal(repeat.body.reused, true);
  assert.equal(database.raw.prepare('SELECT COUNT(*) AS count FROM matrix_public_investigations').get().count, firstCount);
}

// Invented evidence, invented routes, malformed JSON and hidden reasoning all fail closed.
{
  const context = {
    investigation_id: 'investigation-contract',
    question: 'What does the record establish?',
    evidence: [{ evidence_id: 'evidence-1', source_route: 'https://example.test/source' }],
    related_routes: [],
    evidence_boundary: 'Bounded by the cited record.'
  };
  const valid = {
    investigation_id: context.investigation_id,
    question: context.question,
    answer: 'The selected record exists.',
    facts: [{ text: 'The selected record exists.', evidence_ids: ['evidence-1'] }],
    allegations_or_disputed_claims: [],
    inferences: [],
    unknowns: [],
    evidence_ids: ['evidence-1'],
    source_routes: ['https://example.test/source'],
    confidence: 0.7,
    related_entities: [],
    related_investigations: [],
    evidence_boundary: context.evidence_boundary
  };
  assert.equal(validatePublicInvestigationResult(valid, context).evidence_ids[0], 'evidence-1');
  assert.throws(() => validatePublicInvestigationResult({ ...valid, evidence_ids: ['invented-id'] }, context), /invented|unselected/i);
  assert.throws(() => validatePublicInvestigationResult({ ...valid, reasoning: 'private' }, context), /private reasoning|unsupported field/i);
  assert.throws(() => parseModelJson('{not valid json'), /Malformed model JSON/);
}

// A prior validated outcome changes a later deterministic ranking without changing policy or evidence thresholds.
{
  const synthetic = {
    evidence: [
      { evidence_id: 'first', title: 'Alpha record', summary: 'alpha record', source_route: 'https://example.test/1', related_entities: [] },
      { evidence_id: 'learned', title: 'Alpha record', summary: 'alpha record', source_route: 'https://example.test/2', related_entities: [] }
    ],
    routes: [],
    relationships: []
  };
  const baseline = retrieveEvidence(synthetic, 'alpha record').selected[0].evidence_id;
  const learned = retrieveEvidence(synthetic, 'alpha record', { learnedEvidenceIds: new Set(['learned']) }).selected[0].evidence_id;
  assert.equal(baseline, 'first');
  assert.equal(learned, 'learned');
}

// A valid owner-local public result can replace the fallback; raw model output is not part of the stored contract.
{
  const localDatabase = createDatabase({ localJobs: true });
  const createdAt = new Date().toISOString();
  const investigationId = 'investigation-local-test';
  const evidence = {
    evidence_id: 'local-evidence-1',
    title: 'Official local test record',
    summary: 'The record exists.',
    establishes: 'The record exists.',
    does_not_establish: 'It does not establish motive.',
    evidence_boundary: 'It does not establish motive.',
    evidence_grade: 'A',
    source_route: 'https://example.test/local-record',
    matrix_route: 'evidence-vault.html',
    related_entities: ['Example Entity']
  };
  const context = {
    investigation_id: investigationId,
    question: 'What does the official local test record establish?',
    evidence_boundary: 'Bounded by the selected record.',
    evidence: [evidence],
    related_routes: ['evidence-vault.html']
  };
  localDatabase.raw.prepare(`INSERT INTO matrix_public_investigations(
    investigation_id,question_hash,question,normalized_question,mode,status,query_classification_json,answer_json,
    evidence_ids_json,source_routes_json,related_entities_json,local_job_id,model_id,resource_id,prompt_version,
    fallback_used,synthesis_pending,validation_json,state_history_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,'queued','{}','{}','[]','[]','[]',?,?,?,'ask-matrix-public-v1',1,1,'{}','[]',?,?)`).run(
    investigationId, 'hash-local', context.question, publicInvestigationInternals.normalizeQuestion(context.question), 'standard',
    'public-investigation-local-test', 'ollama-test', 'local-resource-test', createdAt, createdAt
  );
  localDatabase.raw.prepare(`INSERT INTO matrix_public_investigation_evidence(
    investigation_id,evidence_id,rank,retrieval_score,source_route,evidence_snapshot_json,selected_at
  ) VALUES(?,?,1,10,?,?,?)`).run(investigationId, evidence.evidence_id, evidence.source_route, JSON.stringify(evidence), createdAt);
  localDatabase.raw.prepare(`INSERT INTO ai_local_jobs(
    job_id,job_type,payload_json,requirements_json,data_class,priority,status,attempt_count,maximum_attempts,created_at,updated_at
  ) VALUES(?,'llm.generate',?,'{}','public','P1','leased',1,3,?,?)`).run(
    'public-investigation-local-test', JSON.stringify({ public_investigation: context }), createdAt, createdAt
  );
  const publicResult = {
    investigation_id: investigationId,
    question: context.question,
    answer: 'The official record establishes that the record exists; it does not establish motive.',
    facts: [{ text: 'The record exists.', evidence_ids: [evidence.evidence_id] }],
    allegations_or_disputed_claims: [],
    inferences: [],
    unknowns: [{ text: 'Motive remains unknown.', evidence_ids: [] }],
    evidence_ids: [evidence.evidence_id],
    source_routes: [evidence.source_route],
    confidence: 0.8,
    related_entities: ['Example Entity'],
    related_investigations: ['evidence-vault.html'],
    evidence_boundary: context.evidence_boundary
  };
  const completion = await completePublicInvestigationLocalResult({ MEMBERS_DB: localDatabase.d1 }, {
    job_id: 'public-investigation-local-test',
    payload_json: JSON.stringify({ public_investigation: context })
  }, { result: { public_result: publicResult }, duration_ms: 25, started_at: createdAt });
  assert.equal(completion.handled, true);
  const stored = localDatabase.raw.prepare('SELECT status,fallback_used,synthesis_pending,answer_json FROM matrix_public_investigations WHERE investigation_id=?').get(investigationId);
  assert.equal(stored.status, 'complete');
  assert.equal(stored.fallback_used, 0);
  assert.equal(stored.synthesis_pending, 0);
  assert.equal(JSON.parse(stored.answer_json).answer, publicResult.answer);
}

console.log('PUBLIC INVESTIGATION TEST PASSED');
console.log('Verified real-corpus retrieval, five golden questions, evidence-only degradation, citation subset enforcement, persistence, learning, ranking reuse, local public-result synchronization and recoverable failure modes.');
