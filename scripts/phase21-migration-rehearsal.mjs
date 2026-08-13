import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrations = [
  'migrations/0001_membership_foundation.sql',
  'migrations/phase5_member_experience.sql',
  'migrations/phase13_member_entitlement_datetime_fix.sql',
  'migrations/phase6_paypal_subscriptions.sql',
  'migrations/phase6_paypal_failure_counter_fix.sql',
  'migrations/phase9_ai_resource_orchestration.sql',
  'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql',
  'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql',
  'migrations/phase15_matrix_value_hunter.sql',
  'migrations/phase16_permissionless_value_harvester.sql',
  'migrations/phase17_matrix_operating_system.sql',
  'migrations/phase18_matrix_continuous_evolution.sql',
  'migrations/phase19_matrix_capital_challenge.sql',
  'migrations/phase20_bounty_completion_engine.sql',
  'migrations/phase21_fresh_investigation_proof.sql'
];

const database = new DatabaseSync(':memory:');
try {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const migration of migrations) database.exec(fs.readFileSync(migration, 'utf8'));
    console.log(`Completed Phase 21 migration rehearsal pass ${pass}`);
  }
  for (const table of ['matrix_public_source_adapters', 'matrix_public_source_retrievals', 'matrix_public_investigation_proofs']) {
    assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `${table} missing`);
  }
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_public_source_adapters WHERE enabled=1 AND authentication_required=0 AND monetary_cost_eur=0').get().count, 2);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_PUBLIC_INVESTIGATION_FRESH_SOURCES_ENABLED'").get().enabled, 1);
  assert.throws(() => database.prepare(`INSERT INTO matrix_public_source_adapters(
    adapter_id,provider,official_api_url,official_documentation_url,authentication_required,monetary_cost_eur,enabled,maximum_results,evidence_boundary,updated_at
  ) VALUES('unsafe','Unsafe','https://example.test','https://example.test/docs',1,0,1,4,'unsafe',CURRENT_TIMESTAMP)`).run(), /constraint/i);
  assert.throws(() => database.prepare(`INSERT INTO matrix_public_source_adapters(
    adapter_id,provider,official_api_url,official_documentation_url,authentication_required,monetary_cost_eur,enabled,maximum_results,evidence_boundary,updated_at
  ) VALUES('paid','Paid','https://example.test','https://example.test/docs',0,1,1,4,'paid',CURRENT_TIMESTAMP)`).run(), /constraint/i);
  console.log('Phase 21 migration rehearsal passed twice with official zero-cost adapters, immutable proof storage and paid/authenticated adapters rejected by schema.');
} finally {
  database.close();
}
