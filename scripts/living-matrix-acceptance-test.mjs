import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { deriveLivingActions } from '../ai-management/living-matrix/living-matrix-cycle.mjs';
import { evaluateModelCandidate } from '../src/matrix-synergy-core.js';
import { handleLivingMatrixRoute, runLivingMatrixCycle } from '../src/worker-living-matrix.js';
import { handlePublicInvestigationRoute } from '../src/worker-public-investigation.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
}

const raw = new DatabaseSync(':memory:');
for (const migration of [
  'migrations/phase9_ai_resource_orchestration.sql',
  'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql',
  'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql',
  'migrations/phase15_matrix_value_hunter.sql'
]) raw.exec(fs.readFileSync(migration, 'utf8'));
const database = new D1Database(raw);
const emptyCorpus = JSON.stringify({
  schema_version: 'matrix-public-investigation-corpus-v1',
  evidence_boundary: 'Retrieval relevance is not proof. Claims remain bounded by the cited records.',
  evidence: [], relationships: [], routes: [], counts: { evidence: 0 }
});
const env = {
  MEMBERS_DB: database,
  ASSETS: { fetch: async () => new Response(emptyCorpus, { headers: { 'content-type': 'application/json' } }) },
  MATRIX_PUBLIC_INVESTIGATION_ENABLED: 'true',
  MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED: 'false'
};

function insertEvent({ id, type = 'record.verified', at, summary, probability = 0.7, evidenceClass = 'VERIFIED', publicationApproved = true }) {
  const payload = {
    change_summary: `${summary} This change propagated through the living Matrix.`,
    evidence: {
      evidence_id: 'living-evidence-alpha',
      title: 'Northbridge solar procurement award',
      summary,
      establishes: summary,
      does_not_establish: 'The award alone does not establish misconduct, private coordination or delivery performance.',
      source_route: 'https://records.example.test/northbridge-solar-award',
      source_publisher: 'Northbridge Public Procurement Register',
      source_type: 'official-public-record',
      evidence_grade: 'A · verified primary record',
      factual_status: 'verified',
      related_entities: ['Northbridge Council', 'Solar Alpha Ltd'],
      claim_class: 'documented_fact',
      matrix_route: 'answer-engine.html',
      publication_approved: publicationApproved
    },
    claim: {
      claim_id: 'northbridge-award-claim',
      statement: summary,
      status: 'supported',
      evidence_ids: ['living-evidence-alpha']
    },
    dossier: {
      dossier_id: 'northbridge-council',
      title: 'Northbridge Council procurement dossier',
      summary,
      evidence_ids: ['living-evidence-alpha'],
      claim_ids: ['northbridge-award-claim']
    },
    forecast: {
      forecast_id: 'northbridge-delivery-forecast',
      previous_probability: 0.5,
      new_probability: probability,
      reason: 'The published award changes the delivery baseline.',
      evidence_ids: ['living-evidence-alpha']
    }
  };
  raw.prepare(`INSERT INTO matrix_events(event_id,event_type,timestamp,origin,source,evidence_class,actor,
    affected_entities_json,affected_pages_json,confidence,review_state,audit_identifier,propagation_json,payload_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, type, at, 'acceptance-test', payload.evidence.source_route, evidenceClass, 'verified-pipeline',
    JSON.stringify(payload.evidence.related_entities), JSON.stringify(['dossier-northbridge.html', 'answer-engine.html']),
    evidenceClass === 'VERIFIED' ? 100 : 0,
    evidenceClass === 'VERIFIED' ? 'automatically-verified' : 'automatically-labelled-speculation',
    `audit-${id}`, '[]', JSON.stringify(payload), at
  );
}

// No unverified event can publish, even when its payload asks to be public.
const speculative = deriveLivingActions({
  event_id: 'speculative', event_type: 'evidence.created', timestamp: '2026-08-13T08:00:00.000Z',
  evidence_class: 'SPECULATION', payload: { evidence: { evidence_id: 'unsafe-public', publication_approved: true } }
});
assert.equal(speculative.publication, 'internal-only');
assert.ok(speculative.actions.every(action => action.public_visible === false));

// Two registered nodes prove horizontal capacity is counted from real state, not a hard-coded dashboard.
for (const [nodeId, name] of [['node-one', 'Owner Node One'], ['node-two', 'Owner Node Two']]) {
  raw.prepare(`INSERT INTO ai_local_runtime_nodes(node_id,node_name,platform,architecture,hardware_json,server_inventory_json,
    model_count,gpu_count,total_gpu_memory_mb,status,cost_confirmed_zero,external_network_used,registered_at,last_seen,expires_at)
    VALUES(?,?,?,?,?,?,1,0,0,'online',1,0,?,?,?)`).run(
    nodeId, name, 'windows', 'x64', '{}', '[]', '2026-08-13T07:00:00.000Z', '2026-08-13T08:00:00.000Z', '2026-08-14T08:00:00.000Z'
  );
}

insertEvent({
  id: 'event-alpha',
  at: '2026-08-13T09:00:00.000Z',
  summary: 'Northbridge Council published a £4.2 million solar procurement award to Solar Alpha Ltd.'
});
const first = await runLivingMatrixCycle(env, { trigger: 'acceptance-test', clock: () => new Date('2026-08-13T09:05:00.000Z') });
assert.equal(first.ok, true);
assert.equal(first.report.intelligence.processed_this_cycle, 1);
assert.equal(first.report.compute.online_nodes, 2);
assert.equal(first.report.cost_confirmed_zero, true);

for (const type of ['evidence', 'claim', 'dossier', 'forecast', 'page', 'what_changed']) {
  assert.ok(raw.prepare('SELECT COUNT(*) AS count FROM matrix_living_projections WHERE projection_type=?').get(type).count > 0, `missing ${type} projection`);
}
assert.ok(raw.prepare('SELECT COUNT(*) AS count FROM matrix_page_dependencies').get().count >= 8);
assert.equal(raw.prepare("SELECT public_visible FROM matrix_living_projections WHERE projection_key='evidence:living-evidence-alpha'").get().public_visible, 1);

const evolutionResponse = await handleLivingMatrixRoute(new Request('https://matrixreprogrammed.com/api/matrix/evolution'), env);
const evolution = await evolutionResponse.json();
assert.equal(evolution.live, true);
assert.equal(evolution.what_changed[0].evidence_ids[0], 'living-evidence-alpha');

// Ask Matrix must see the newly projected D1 evidence even though the compiled asset corpus is empty.
const investigationResponse = await handlePublicInvestigationRoute(new Request('https://matrixreprogrammed.com/api/investigate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.20' },
  body: JSON.stringify({ question: 'What did Northbridge Council publish about the solar procurement award?', mode: 'standard' })
}), env);
assert.equal(investigationResponse.status, 200);
const investigation = await investigationResponse.json();
assert.deepEqual(investigation.result.evidence_ids, ['living-evidence-alpha']);
assert.match(investigation.result.answer, /£4\.2 million solar procurement award/);

// A correction versions every stable projection, preserves its prior hash and changes future Ask Matrix output.
insertEvent({
  id: 'event-alpha-correction',
  type: 'record.corrected',
  at: '2026-08-13T10:00:00.000Z',
  probability: 0.62,
  summary: 'Northbridge Council corrected the published solar procurement award value to £3.8 million.'
});
const second = await runLivingMatrixCycle(env, { trigger: 'acceptance-correction', clock: () => new Date('2026-08-13T10:05:00.000Z') });
assert.equal(second.report.intelligence.processed_this_cycle, 2);
assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM matrix_events WHERE event_type='learning.signal.created'").get().count, 1);
const corrected = raw.prepare("SELECT version,previous_hash,content_json FROM matrix_living_projections WHERE projection_key='evidence:living-evidence-alpha'").get();
assert.equal(corrected.version, 2);
assert.equal(corrected.previous_hash.length, 64);
assert.match(corrected.content_json, /£3\.8 million/);
const correctedInvestigationResponse = await handlePublicInvestigationRoute(new Request('https://matrixreprogrammed.com/api/investigate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.21' },
  body: JSON.stringify({ question: 'What value did Northbridge Council publish for the solar procurement award?', mode: 'standard' })
}), env);
assert.equal(correctedInvestigationResponse.status, 200);
const correctedInvestigation = await correctedInvestigationResponse.json();
assert.match(correctedInvestigation.result.answer, /£3\.8 million/);
assert.doesNotMatch(correctedInvestigation.result.answer, /£4\.2 million/);

// Failed receipts are retryable: the consumer resumes from the durable event instead of losing it.
insertEvent({ id: 'event-recovery', at: '2026-08-13T11:00:00.000Z', summary: 'Northbridge Council republished the corrected £3.8 million award record.' });
raw.prepare(`INSERT INTO matrix_event_dispatches(event_id,consumer_id,status,attempts,receipt_json,error_text,started_at,completed_at)
  VALUES('event-recovery','living-matrix-v1','failed',1,'{}','simulated interruption','2026-08-13T11:01:00.000Z','2026-08-13T11:01:01.000Z')`).run();
const recovered = await runLivingMatrixCycle(env, { trigger: 'acceptance-recovery', clock: () => new Date('2026-08-13T11:05:00.000Z') });
assert.equal(recovered.report.intelligence.processed_this_cycle, 2);
assert.equal(raw.prepare("SELECT status,attempts FROM matrix_event_dispatches WHERE event_id='event-recovery'").get().status, 'processed');
assert.equal(raw.prepare("SELECT attempts FROM matrix_event_dispatches WHERE event_id='event-recovery'").get().attempts, 2);

const beforeReplay = raw.prepare("SELECT version FROM matrix_living_projections WHERE projection_key='evidence:living-evidence-alpha'").get().version;
const replay = await runLivingMatrixCycle(env, { trigger: 'acceptance-idempotency', clock: () => new Date('2026-08-13T11:06:00.000Z') });
assert.equal(replay.report.intelligence.processed_this_cycle, 0);
assert.equal(raw.prepare("SELECT version FROM matrix_living_projections WHERE projection_key='evidence:living-evidence-alpha'").get().version, beforeReplay);

// Model replacement is staged only when zero-cost, privacy, citation, quality and rollback gates all pass.
const modelCandidate = { zeroCostVerified: true, externalChargePossible: false, licenceAllowed: true, privacyPassed: true, rollbackReady: true, citationIntegrityPassed: true, hallucinationRate: 1, incumbentHallucinationRate: 2, qualityScore: 92, incumbentQualityScore: 90 };
assert.equal(evaluateModelCandidate(modelCandidate).replace, true);
assert.equal(evaluateModelCandidate({ ...modelCandidate, citationIntegrityPassed: false }).replace, false);

console.log('Living Matrix acceptance passed: verified event propagation, dynamic Ask Matrix retrieval, correction versioning, retry recovery, idempotency, two-node expansion, zero-spend reporting and guarded model replacement.');
