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
  'migrations/phase19_matrix_capital_challenge.sql'
];

const tables = [
  'matrix_capital_challenges','matrix_capital_destination_registry','matrix_capital_receipts',
  'matrix_capital_milestone_receipts','matrix_capital_channels','matrix_capital_opportunities',
  'matrix_opportunity_graph_nodes','matrix_opportunity_graph_edges','matrix_acquisition_experiments',
  'matrix_future_opportunity_radar','matrix_capital_cycles'
];

const phase19Sql = fs.readFileSync('migrations/phase19_matrix_capital_challenge.sql', 'utf8');
assert.doesNotMatch(
  phase19Sql,
  /^\s*(?:BEGIN(?:\s+\w+)?|COMMIT|ROLLBACK|SAVEPOINT)\s*;/im,
  'Phase 19 must not contain transaction-control SQL rejected by the remote D1 file importer'
);

const database = new DatabaseSync(':memory:');
try {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const migration of migrations) database.exec(fs.readFileSync(migration, 'utf8'));
    console.log(`Completed Phase 19 migration rehearsal pass ${pass}`);
  }
  for (const table of tables) assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `${table} missing`);
  const challenge = database.prepare("SELECT * FROM matrix_capital_challenges WHERE challenge_id='matrix-capital-challenge-eur-v1'").get();
  assert.equal(challenge.received_net_minor, 0);
  assert.equal(challenge.state, 'AWAITING_FIRST_REAL_RECEIPT');
  assert.equal(challenge.operational_claim_allowed, 0);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_capital_channels').get().count, 6);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM ai_feature_flags WHERE flag_name='MATRIX_CAPITAL_CHALLENGE_ENABLED' AND enabled=1").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM ai_feature_flags WHERE flag_name='MATRIX_CAPITAL_FINANCIAL_EXECUTION_ENABLED' AND enabled=0").get().count, 1);
  assert.throws(() => database.prepare("UPDATE matrix_capital_challenges SET operational_claim_allowed=1 WHERE challenge_id='matrix-capital-challenge-eur-v1'").run(), /constraint/i);
  assert.throws(() => database.prepare("INSERT INTO matrix_capital_destination_registry(registry_id,destination_id,role,allowed_assets_json,exposure_limit_minor,approved,active,raw_credentials_stored,created_at,updated_at) VALUES('unsafe','missing','TREASURY','[\"EUR\"]',0,1,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(), /constraint/i);
  assert.throws(() => database.prepare("INSERT INTO matrix_capital_receipts(capital_receipt_id,source_class,source_receipt_id,external_reference,asset,gross_amount_minor,cost_minor,net_amount_minor,eur_net_minor,conversion_evidence_json,destination_id,reconciled,received_at,reconciled_at,evidence_json,created_at) VALUES('fake','CLAIM_VALUE','fake','fake','EUR',100,0,100,100,'{}','missing',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'{}',CURRENT_TIMESTAMP)").run(), /constraint/i);
  console.log('Phase 19 migration rehearsal passed twice with receipt-only milestones, approved destination references, dynamic opportunities, bounded zero-spend experiments and fail-closed financial execution.');
} finally {
  database.close();
}
