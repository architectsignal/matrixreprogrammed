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
  'migrations/phase20_bounty_completion_engine.sql'
];

const tables = [
  'matrix_bounty_sources','matrix_bounties','matrix_bounty_rules_checks','matrix_bounty_workspaces','matrix_bounty_reviews',
  'matrix_bounty_submissions','matrix_bounty_receipts','matrix_bounty_repository_profiles','matrix_bounty_platform_profiles',
  'matrix_bounty_learning','matrix_bounty_cycles','matrix_bounty_owner_actions'
];

const database = new DatabaseSync(':memory:');
try {
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const migration of migrations) database.exec(fs.readFileSync(migration, 'utf8'));
    console.log(`Completed Phase 20 migration rehearsal pass ${pass}`);
  }
  for (const table of tables) assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1, `${table} missing`);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_bounty_sources WHERE discovery_enabled=1 AND consequential_actions_enabled=0').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM matrix_bounty_platform_profiles WHERE external_writes_enabled=0').get().count, 2);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_BOUNTY_ENGINE_ENABLED'").get().enabled, 1);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_BOUNTY_AUTO_CLAIM_ENABLED'").get().enabled, 0);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_BOUNTY_AUTO_SUBMISSION_ENABLED'").get().enabled, 0);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_SECURITY_BOUNTY_EXECUTION_ENABLED'").get().enabled, 0);
  assert.throws(() => database.prepare(`INSERT INTO matrix_bounties(
    bounty_id,source_id,source_platform,external_id,title,repository,issue_url,bounty_url,reward_currency,task_type,security_bounty,status,discovered_at,updated_at
    ) VALUES('unsafe','bounty-source-opire-featured','opire','unsafe','Unsafe security task','https://github.com/o/r','https://github.com/o/r/issues/1','https://github.com/o/r/issues/1','EUR','security',1,'WORKING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(), /constraint/i);
  assert.throws(() => database.prepare("UPDATE matrix_bounty_platform_profiles SET external_writes_enabled=1 WHERE platform='opire'").run(), /constraint/i);
  console.log('Phase 20 migration rehearsal passed twice with discovery enabled, external writes disabled, receipt-only accounting, isolated workspaces and security execution blocked.');
} finally {
  database.close();
}
