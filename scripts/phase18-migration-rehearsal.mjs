import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrations = [
  'migrations/0001_membership_foundation.sql',
  'migrations/phase5_member_experience.sql',
  'migrations/phase13_member_entitlement_datetime_fix.sql',
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
  'migrations/phase18_matrix_continuous_evolution.sql'
];

const database = new DatabaseSync(':memory:');
try {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const migration of migrations) database.exec(fs.readFileSync(migration, 'utf8'));
    console.log(`Completed Phase 18 migration rehearsal pass ${pass}`);
  }

  for (const table of ['matrix_capability_graph','matrix_human_dependencies','matrix_site_health_checks','matrix_evolution_cycles','matrix_acceptance_receipts','matrix_permanent_objectives']) {
    assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `${table} missing`);
  }
  assert.ok(database.prepare('SELECT COUNT(*) count FROM matrix_capability_graph').get().count >= 20);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_human_dependencies').get().count, 5);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_permanent_objectives').get().count, 3);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_acceptance_receipts').get().count, 5);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM ai_feature_flags WHERE flag_name IN ('MATRIX_EVOLUTION_DIRECTOR_ENABLED','MATRIX_SITE_OPERATOR_ENABLED') AND enabled=1").get().count, 2);
  assert.throws(() => database.prepare("UPDATE matrix_capability_graph SET capability_expansion_grants_authority=1 WHERE capability_id='matrix-constitution'").run(), /constraint/i);
  assert.throws(() => database.prepare("INSERT INTO matrix_acceptance_receipts(receipt_id,loop_type,state,first_real_receipt,external_receipt_reference,before_json,result_json,after_json,net_value_minor,evidence_json,verified_at,created_at) VALUES('fake-live','VALUE','LIVE_VERIFIED',1,NULL,'{}','{}','{}',0,'{}',NULL,CURRENT_TIMESTAMP)").run(), /constraint/i);
  assert.equal(database.prepare("SELECT current_state FROM matrix_permanent_objectives WHERE objective_id='MAXIMIZE_LAWFUL_MATRIX_VALUE'").get().current_state, 'PARTIAL');
  assert.equal(database.prepare("SELECT state FROM matrix_acceptance_receipts WHERE receipt_id='acceptance-value'").get().state, 'SIMULATION_ONLY');
  console.log('Phase 18 migration rehearsal passed twice with a durable self-model, human-dependency ledger, site/evolution receipts, permanent objectives and fail-closed acceptance truth.');
} finally {
  database.close();
}
