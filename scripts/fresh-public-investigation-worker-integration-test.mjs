import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePublicInvestigationRoute } from '../src/worker-public-investigation.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.parameters); return { success: true, meta: { changes: Number(result.changes || 0) } }; }
}
class D1Database { constructor(database) { this.database = database; } prepare(sql) { return new D1Statement(this.database, sql); } }

const migrations = [
  'migrations/0001_membership_foundation.sql', 'migrations/phase5_member_experience.sql',
  'migrations/phase13_member_entitlement_datetime_fix.sql', 'migrations/phase6_paypal_subscriptions.sql',
  'migrations/phase6_paypal_failure_counter_fix.sql', 'migrations/phase9_ai_resource_orchestration.sql',
  'migrations/phase10_ai_autonomy.sql', 'migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql', 'migrations/phase13_matrix_synergy.sql',
  'migrations/public_investigation_api.sql', 'migrations/phase14_living_matrix.sql',
  'migrations/phase15_matrix_value_hunter.sql', 'migrations/phase16_permissionless_value_harvester.sql',
  'migrations/phase17_matrix_operating_system.sql', 'migrations/phase18_matrix_continuous_evolution.sql',
  'migrations/phase19_matrix_capital_challenge.sql', 'migrations/phase20_bounty_completion_engine.sql',
  'migrations/phase21_fresh_investigation_proof.sql'
];
const raw = new DatabaseSync(':memory:');
for (const migration of migrations) raw.exec(fs.readFileSync(migration, 'utf8'));
const corpusText = fs.readFileSync('data/public-investigation-corpus.json', 'utf8');
const assets = { fetch: async () => new Response(corpusText, { status: 200, headers: { 'content-type': 'application/json' } }) };

const liveOfficialSources = process.env.MATRIX_USE_LIVE_OFFICIAL_SOURCES === 'true';
const originalFetch = globalThis.fetch;
const fixtureFetch = async input => {
  const url = new URL(String(input));
  const qualifying = decodeURIComponent(url.search).includes('correction') || decodeURIComponent(url.search).includes('withdrawal');
  if (url.hostname === 'www.gov.uk') return Response.json({ results: [{
    title: qualifying ? 'Artificial intelligence safety policy correction review' : 'Current official artificial intelligence safety policy record',
    link: qualifying ? '/government/publications/artificial-intelligence-safety-policy-review' : '/government/publications/artificial-intelligence-safety-policy',
    description: 'A current official record describing artificial intelligence safety policy, governance and review evidence.',
    public_timestamp: qualifying ? '2026-08-13T09:00:00Z' : '2026-08-12T09:00:00Z',
    updated_at: '2026-08-13T10:00:00Z',
    organisations: [{ title: 'Department for Science, Innovation and Technology' }]
  }] });
  if (url.hostname === 'www.federalregister.gov') return Response.json({ results: [{
    document_number: qualifying ? '2026-QUALIFY' : '2026-SUPPORT',
    title: qualifying ? 'Artificial Intelligence Safety Policy Review' : 'Current Official Artificial Intelligence Safety Policy Notice',
    abstract: 'A current official record describing artificial intelligence safety policy, governance and review evidence.',
    html_url: `https://www.federalregister.gov/documents/2026/08/13/${qualifying ? '2026-qualify' : '2026-support'}/artificial-intelligence-safety-policy`,
    publication_date: '2026-08-13',
    agencies: [{ name: 'National Institute of Standards and Technology' }]
  }] });
  throw new Error(`Unexpected external request ${url.href}`);
};
if (!liveOfficialSources) globalThis.fetch = fixtureFetch;

const env = {
  MEMBERS_DB: new D1Database(raw),
  ASSETS: assets,
  MATRIX_PUBLIC_INVESTIGATION_ENABLED: 'true',
  MATRIX_PUBLIC_INVESTIGATION_FRESH_SOURCES_ENABLED: 'true',
  MATRIX_PUBLIC_INVESTIGATION_LOCAL_ENRICHMENT_ENABLED: 'false'
};

try {
  const request = new Request('https://matrixreprogrammed.com/api/investigate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.88' },
    body: JSON.stringify({ question: 'What current official records describe artificial intelligence safety policy?', mode: 'deep' })
  });
  const response = await handlePublicInvestigationRoute(request, env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, 'complete');
  assert.equal(payload.proof.auditor_passed, true);
  if (liveOfficialSources) assert.ok(payload.proof.fresh_source_count >= 2);
  else assert.equal(payload.proof.fresh_source_count, 2);
  assert.equal(payload.proof.independent_publisher_count, 2);
  assert.equal(payload.proof.qualifying_evidence_search.performed, true);
  if (!liveOfficialSources) assert.equal(payload.proof.qualifying_evidence_search.possible_qualifying_records.length, 2);
  assert.ok(payload.proof.provenance.every(item => item.response_content_sha256.length === 64));
  assert.ok(payload.proof.entities.length >= 2);
  assert.ok(payload.proof.relationships.length >= 2);
  if (liveOfficialSources) assert.ok(payload.proof.timeline.length >= 2);
  else assert.equal(payload.proof.timeline.length, 2);
  assert.equal(payload.proof.monitoring_hook.cadence, 'daily');
  assert.ok(payload.result.evidence_ids.every(id => payload.evidence_used.some(item => item.evidence_id === id)));
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_public_source_retrievals').get().count, 4);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_public_source_retrievals WHERE search_purpose='qualifying'").get().count, 2);
  assert.equal(raw.prepare('SELECT auditor_passed FROM matrix_public_investigation_proofs').get().auditor_passed, 1);
  const learning = JSON.parse(raw.prepare("SELECT evidence_json FROM matrix_learning_ledger WHERE observation LIKE 'public-investigation:%' ORDER BY created_at DESC LIMIT 1").get().evidence_json);
  assert.equal(learning.learning_effect.behavior_changed, true);
  assert.equal(learning.fresh_investigation_proof.auditor_passed, true);

  const getResponse = await handlePublicInvestigationRoute(new Request(`https://matrixreprogrammed.com/api/investigate/${payload.investigation_id}`), env);
  const persisted = await getResponse.json();
  assert.equal(getResponse.status, 200);
  assert.equal(persisted.proof.mission_id, payload.proof.mission_id);
  if (liveOfficialSources) console.log(JSON.stringify({
    proof_run: 'LIVE_OFFICIAL_PUBLIC_APIS',
    investigation_id: payload.investigation_id,
    status: payload.status,
    answer: payload.result.answer,
    evidence_used: payload.evidence_used.map(item => ({ evidence_id: item.evidence_id, publisher: item.source_publisher, title: item.title, source_route: item.source_route })),
    proof: payload.proof,
    retrieval_rows: raw.prepare('SELECT adapter_id,search_purpose,status,result_count,response_sha256,retrieved_at FROM matrix_public_source_retrievals ORDER BY adapter_id,search_purpose').all(),
    learning_effect: learning.learning_effect
  }, null, 2));
  console.log('Fresh public investigation Worker integration passed: new official retrieval, supporting and qualifying searches, evidence-backed answer, entities, relationships, timeline, independent auditor, durable proof, monitoring hook and behavior-changing learning.');
} finally {
  if (!liveOfficialSources) globalThis.fetch = originalFetch;
  raw.close();
}
