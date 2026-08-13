import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleValueHunterRoute, runValueHunterCycle } from '../src/worker-value-hunter.js';

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
  'migrations/phase9_ai_resource_orchestration.sql', 'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql', 'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql', 'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql', 'migrations/phase15_matrix_value_hunter.sql'
]) raw.exec(fs.readFileSync(migration, 'utf8'));

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(`
  <html><body>
    <a href="/funding/digital-trust-grant">Digital trust innovation grant</a>
    <a href="https://attacker.example/funding/fake-grant">Fake external grant</a>
  </body></html>
`, { status: 200, headers: { 'content-type': 'text/html' } });

const env = {
  MEMBERS_DB: new D1Database(raw), MATRIX_VALUE_HUNTER_ENABLED: 'true',
  MATRIX_VALUE_AUTO_COLLECTION_ENABLED: 'true', AI_RESOURCE_ZERO_SPEND_LOCK: 'true'
};

try {
  const first = await runValueHunterCycle(env, { trigger: 'integration-one', clock: () => new Date('2026-08-13T12:00:00.000Z') });
  assert.equal(first.ok, true);
  assert.equal(first.report.objective.target_net_minor, 1000000);
  assert.ok(first.report.discovery.scanned >= 5);
  assert.ok(first.report.discovery.discovered >= 3);
  assert.ok(first.decisions.every(item => item.state === 'ENTITLEMENT_UNCERTAIN'));
  assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM matrix_value_opportunities WHERE decision_json LIKE '%attacker.example%'").get().count, 0);
  assert.ok(raw.prepare('SELECT COUNT(*) AS count FROM matrix_value_learning').get().count >= 2);
  assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM matrix_events WHERE event_type='value.cycle.completed'").get().count, 1);

  const claimantResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/claimants', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      claimant_id: 'matrix-operating-entity', display_label: 'Matrix operating entity', authority_status: 'proven', identity_status: 'matched',
      identity_vault_reference: 'vault://claimants/matrix-operating-entity', jurisdictions: ['jurisdiction-gb-official-claims']
    })
  }), env);
  assert.equal(claimantResponse.status, 201);

  const destinationResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/destinations', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      destination_id: 'matrix-eur-account', claimant_id: 'matrix-operating-entity', destination_type: 'payment-account',
      destination_vault_reference: 'vault://destinations/matrix-eur-account', public_identifier_hash: 'a'.repeat(64), allowed_assets: ['EUR']
    })
  }), env);
  assert.equal(destinationResponse.status, 201);
  assert.equal(raw.prepare("SELECT destination_vault_reference FROM matrix_value_destinations WHERE destination_id='matrix-eur-account'").get().destination_vault_reference, 'vault://destinations/matrix-eur-account');

  raw.prepare(`UPDATE matrix_value_sources SET source_status='active',terms_current=1,terms_hash='terms-v1',validated_terms_hash='terms-v1'
    WHERE source_id='official-fr-business-aid'`).run();
  raw.prepare(`UPDATE matrix_value_jurisdictions SET status='current',automation_permitted=1,automation_level=4,validated_at='2026-08-13T12:00:00.000Z',valid_until='2027-08-13T12:00:00.000Z'
    WHERE jurisdiction_id='jurisdiction-fr-business-aid'`).run();

  const opportunityResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/opportunities', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      opportunity_id: 'matrix-proven-refund', source_id: 'official-fr-business-aid', jurisdiction_id: 'jurisdiction-fr-business-aid',
      claimant_id: 'matrix-operating-entity', destination_id: 'matrix-eur-account', category: 'refund', legal_basis: 'refund',
      title: 'Proven Matrix entity refund', asset: 'EUR', amount_minor: 125000, fee_minor: 0,
      entitlement_proven: true, provider_adapter_id: 'not-installed-financial-adapter', idempotency_key: 'matrix-proven-refund:v1',
      evidence: [{ evidence_id: 'refund-proof-1', evidence_type: 'official-refund-entitlement', source_url: 'https://www.entreprises.gouv.fr/refund-proof', content_sha256: 'b'.repeat(64), establishes: 'The registered Matrix entity is the named refund claimant.', authority_verified: true, identity_match_verified: true, ownership_verified: true, retrieved_at: '2026-08-13T12:05:00.000Z' }]
    })
  }), env);
  assert.equal(opportunityResponse.status, 201);

  const second = await runValueHunterCycle(env, { trigger: 'integration-two', clock: () => new Date('2026-08-14T12:00:00.000Z') });
  assert.equal(second.ok, true);
  const proven = second.decisions.find(item => item.opportunity_id === 'matrix-proven-refund');
  assert.equal(proven.state, 'AUTOMATION_NOT_PERMITTED');
  assert.ok(proven.reasons.includes('constrained-provider-adapter-unavailable'));
  assert.equal(raw.prepare("SELECT COUNT(*) AS count FROM matrix_value_claim_queue WHERE opportunity_id='matrix-proven-refund'").get().count, 0);

  const secretResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/claimants', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimant_id: 'unsafe', private_key: 'never-store-this' })
  }), env);
  assert.equal(secretResponse.status, 400);
  assert.match((await secretResponse.json()).error, /forbidden/i);

  const statusResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter'), env);
  const status = await statusResponse.json();
  assert.equal(status.target.target_net_minor, 1000000);
  assert.equal(status.truthful_status, 'discovery-and-proof-operational-collection-adapter-required');
  assert.deepEqual(status.installed_collection_adapters, []);
  console.log('Value Hunter Worker integration passed: official discovery, same-host boundary, D1 persistence, Matrix claimant/destination, adapter fail-closed, learning and truthful EUR 10,000 status.');
} finally {
  globalThis.fetch = originalFetch;
  raw.close();
}
