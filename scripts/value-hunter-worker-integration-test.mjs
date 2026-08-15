import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ValueProviderRegistry } from '../ai-management/value-hunter/value-collector.mjs';
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

class FixtureCollectionProvider {
  constructor() {
    this.adapterId = 'fixture-lawful-collector';
    this.idempotencyEnforced = true;
    this.receiptSchemaVersion = 'value-receipt-v1';
    this.calls = 0;
  }
  async claim(intent) {
    this.calls += 1;
    return {
      receipt_id: `fixture-provider-receipt-${this.calls}`,
      provider_receipt_reference: `fixture-reference-${this.calls}`,
      status: 'received', amount_minor: intent.amount_minor, fee_minor: 0,
      confirmation_count: 1, reconciled: true, received_at: '2026-08-15T12:00:00.000Z'
    };
  }
}

const raw = new DatabaseSync(':memory:');
for (const migration of [
  'migrations/0001_membership_foundation.sql', 'migrations/phase5_member_experience.sql',
  'migrations/phase13_member_entitlement_datetime_fix.sql', 'migrations/phase6_paypal_subscriptions.sql',
  'migrations/phase6_paypal_failure_counter_fix.sql',
  'migrations/phase9_ai_resource_orchestration.sql', 'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql', 'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql', 'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql', 'migrations/phase15_matrix_value_hunter.sql',
  'migrations/phase16_permissionless_value_harvester.sql', 'migrations/phase17_matrix_operating_system.sql',
  'migrations/phase18_matrix_continuous_evolution.sql', 'migrations/phase19_matrix_capital_challenge.sql'
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
      destination_vault_reference: 'vault://destinations/matrix-eur-account', public_identifier_hash: 'a'.repeat(64), allowed_assets: ['EUR'],
      provider_adapter_id: 'paypal'
    })
  }), env);
  assert.equal(destinationResponse.status, 201);
  assert.equal(raw.prepare("SELECT destination_vault_reference FROM matrix_value_destinations WHERE destination_id='matrix-eur-account'").get().destination_vault_reference, 'vault://destinations/matrix-eur-account');

  const termsHash = 'c'.repeat(64);
  const sourceMetadata = JSON.parse(raw.prepare("SELECT metadata_json FROM matrix_value_sources WHERE source_id='official-fr-business-aid'").get().metadata_json);
  sourceMetadata.collection_adapter_spec = {
    claim_endpoint: 'https://www.entreprises.gouv.fr/api/refunds/claim',
    credential_vault_reference: 'vault://providers/fixture-lawful-collector',
    automation_permitted: true, idempotency_supported: true, receipt_reconciliation_supported: true
  };
  raw.prepare(`UPDATE matrix_value_sources SET source_status='active',terms_current=1,terms_hash=?,validated_terms_hash=?,metadata_json=?
    WHERE source_id='official-fr-business-aid'`).run(termsHash, termsHash, JSON.stringify(sourceMetadata));
  raw.prepare(`UPDATE matrix_value_jurisdictions SET status='current',automation_permitted=1,automation_level=4,validated_at='2026-08-13T12:00:00.000Z',valid_until='2027-08-13T12:00:00.000Z'
    WHERE jurisdiction_id='jurisdiction-fr-business-aid'`).run();

  const opportunityResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/opportunities', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      opportunity_id: 'matrix-proven-refund', source_id: 'official-fr-business-aid', jurisdiction_id: 'jurisdiction-fr-business-aid',
      claimant_id: 'matrix-operating-entity', destination_id: 'matrix-eur-account', category: 'refund', legal_basis: 'refund',
      title: 'Proven Matrix entity refund', asset: 'EUR', amount_minor: 125000, fee_minor: 0,
      entitlement_proven: true, provider_adapter_id: 'fixture-lawful-collector', idempotency_key: 'matrix-proven-refund:v1',
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

  const provider = new FixtureCollectionProvider();
  const providers = new ValueProviderRegistry([provider]);
  const third = await runValueHunterCycle(env, {
    trigger: 'integration-three', clock: () => new Date('2026-08-15T12:00:00.000Z'), providers
  });
  assert.equal(third.ok, true);
  assert.equal(provider.calls, 1);
  assert.equal(third.report.collection.submitted, 1);
  assert.equal(third.report.collection.received, 1);
  assert.equal(third.report.code_improvements.generated.length, 1);
  assert.equal(third.report.status.reconciled_receipts.net_minor, 125000);
  assert.equal(raw.prepare("SELECT state FROM matrix_value_opportunities WHERE opportunity_id='matrix-proven-refund'").get().state, 'SWEPT_TO_APPROVED_DESTINATION');
  assert.equal(raw.prepare("SELECT status FROM matrix_value_claim_queue WHERE opportunity_id='matrix-proven-refund'").get().status, 'completed');
  assert.equal(raw.prepare("SELECT status FROM matrix_value_operations WHERE opportunity_id='matrix-proven-refund'").get().status, 'confirmed');
  assert.equal(raw.prepare("SELECT reconciled FROM matrix_value_receipts").get().reconciled, 1);
  assert.equal(raw.prepare("SELECT activation_allowed FROM matrix_value_improvement_proposals").get().activation_allowed, 0);
  assert.equal(third.report.capital.status.received_net_minor, 125000);
  assert.equal(third.report.capital.status.first_real_euro_received, true);
  assert.equal(third.report.capital.status.next_milestone_minor, 1000000);
  assert.equal(third.report.capital.financial_execution_enabled, false);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_capital_receipts').get().count, 1);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_capital_milestone_receipts').get().count, 4);
  assert.ok(raw.prepare('SELECT COUNT(*) count FROM matrix_capital_opportunities').get().count >= 6);
  assert.equal(raw.prepare("SELECT state FROM matrix_acceptance_receipts WHERE receipt_id='acceptance-value'").get().state, 'LIVE_VERIFIED');

  const fourth = await runValueHunterCycle(env, {
    trigger: 'integration-four', clock: () => new Date('2026-08-16T12:00:00.000Z'), providers
  });
  assert.equal(fourth.ok, true);
  assert.equal(provider.calls, 1, 'completed collection must never be submitted twice');

  const insertPayPal = raw.prepare(`INSERT INTO paypal_payment_records(
    id,subscription_id,provider_subscription_id,provider_payment_id,provider_event_id,payment_type,environment,status,
    gross_amount,refund_amount,currency_code,paid_at,refunded_at,reversed_at,raw_resource_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insertPayPal.run('payment-live-donation', null, null, 'PAYPAL-CAPTURE-1', 'PAYPAL-EVENT-1', 'donation', 'live', 'COMPLETED',
    '3.00', null, 'EUR', '2026-08-16T13:00:00.000Z', null, null,
    JSON.stringify({ matrix_environment: 'live', purchase_units: [{ payments: { captures: [{ seller_receivable_breakdown: { paypal_fee: { value: '0.20' } } }] } }] }),
    '2026-08-16T13:00:00.000Z', '2026-08-16T13:00:00.000Z');
  insertPayPal.run('payment-sandbox-donation', null, null, 'PAYPAL-SANDBOX-1', 'PAYPAL-SANDBOX-EVENT-1', 'donation', 'sandbox', 'COMPLETED',
    '9999.00', null, 'EUR', '2026-08-16T13:00:00.000Z', null, null,
    JSON.stringify({ matrix_environment: 'sandbox', purchase_units: [{ payments: { captures: [{ seller_receivable_breakdown: { paypal_fee: { value: '0.00' } } }] } }] }),
    '2026-08-16T13:00:00.000Z', '2026-08-16T13:00:00.000Z');
  insertPayPal.run('payment-live-missing-fee', null, null, 'PAYPAL-CAPTURE-NO-FEE', 'PAYPAL-EVENT-NO-FEE', 'capture', 'live', 'COMPLETED',
    '10.00', null, 'EUR', '2026-08-16T13:00:00.000Z', null, null, '{}',
    '2026-08-16T13:00:00.000Z', '2026-08-16T13:00:00.000Z');
  const fifth = await runValueHunterCycle(env, {
    trigger: 'integration-five', clock: () => new Date('2026-08-17T12:00:00.000Z'), providers
  });
  assert.equal(fifth.report.capital.status.received_net_minor, 125280);
  assert.equal(fifth.report.capital.imported_receipts.paypal_live_receipts, 1);
  assert.equal(fifth.report.capital.imported_receipts.paypal_live_completed_waiting_for_fee_evidence, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_capital_receipts WHERE source_class='DONATION'").get().count, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_capital_receipts WHERE external_reference='PAYPAL-SANDBOX-1'").get().count, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_capital_receipts WHERE external_reference='PAYPAL-CAPTURE-NO-FEE'").get().count, 0);

  insertPayPal.run('payment-live-refund', null, null, 'PAYPAL-REFUND-1', 'PAYPAL-REFUND-EVENT-1', 'refund', 'live', 'COMPLETED',
    null, '1.00', 'EUR', null, '2026-08-17T13:00:00.000Z', null, JSON.stringify({ matrix_environment: 'live' }),
    '2026-08-17T13:00:00.000Z', '2026-08-17T13:00:00.000Z');
  const sixth = await runValueHunterCycle(env, {
    trigger: 'integration-six', clock: () => new Date('2026-08-18T12:00:00.000Z'), providers
  });
  assert.equal(sixth.report.capital.status.adjustments_minor, 100);
  assert.equal(sixth.report.capital.status.received_net_minor, 125180);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_capital_adjustments').get().count, 1);

  const secretResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/claimants', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimant_id: 'unsafe', private_key: 'never-store-this' })
  }), env);
  assert.equal(secretResponse.status, 400);
  assert.match((await secretResponse.json()).error, /forbidden/i);

  const statusResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter'), env);
  const status = await statusResponse.json();
  assert.equal(status.target.target_net_minor, 1000000);
  assert.equal(status.target.received_net_minor, 125000);
  assert.equal(status.target.remaining_net_minor, 875000);
  assert.equal(status.truthful_status, 'discovery-and-proof-operational-collection-adapter-required');
  assert.deepEqual(status.installed_collection_adapters, []);
  assert.equal(status.capital.truthful_status, 'first-real-euro-receipt-proven');
  const capitalResponse = await handleValueHunterRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/value-hunter/capital'), env);
  const capital = await capitalResponse.json();
  assert.equal(capital.challenge.received_net_minor, 125180);
  assert.equal(capital.adjustments.length, 1);
  assert.equal(capital.automatic_spending, false);
  console.log('Value Hunter Worker integration passed: official discovery, same-host boundary, D1 persistence, Matrix claimant/destination, fail-closed readiness, durable collection, reconciliation, duplicate suppression, learning, capital milestones and truthful EUR status.');
} finally {
  globalThis.fetch = originalFetch;
  raw.close();
}
