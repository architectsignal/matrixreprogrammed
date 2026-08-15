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
  'migrations/phase17_matrix_operating_system.sql'
];
const required = [
  'matrix_constitution', 'matrix_system_components', 'matrix_operating_missions', 'matrix_capability_snapshots',
  'matrix_daily_baselines', 'matrix_learning_effects', 'matrix_boot_runs', 'matrix_watchdog_events',
  'matrix_delegations', 'matrix_action_receipts'
];
const database = new DatabaseSync(':memory:');
try {
  for (const pass of [1, 2]) {
    for (const migration of migrations) database.exec(fs.readFileSync(migration, 'utf8'));
    console.log(`Completed Phase 17 migration rehearsal pass ${pass}`);
  }
  const present = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(item => item.name));
  assert.deepEqual(required.filter(name => !present.has(name)), []);
  const constitution = database.prepare("SELECT law_text,law_sha256,immutable,authority_expansion_by_learning FROM matrix_constitution WHERE constitution_id='matrix-law-v1'").get();
  assert.equal(constitution.law_text, 'CAUSE NO HARM OR LOSS.');
  assert.equal(constitution.law_sha256, '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189');
  assert.equal(constitution.immutable, 1);
  assert.equal(constitution.authority_expansion_by_learning, 0);
  assert.throws(() => database.prepare("UPDATE matrix_constitution SET law_text='ALTERED'").run(), /MATRIX_CONSTITUTION_IMMUTABLE/);
  assert.throws(() => database.prepare('DELETE FROM matrix_constitution').run(), /MATRIX_CONSTITUTION_IMMUTABLE/);
  assert.equal(database.prepare("SELECT enabled FROM ai_feature_flags WHERE flag_name='MATRIX_OPERATING_SYSTEM_ENABLED'").get().enabled, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM matrix_delegations WHERE maximum_amount_minor<>0').get().count, 0);
  console.log('Phase 17 migration rehearsal passed twice with immutable law, non-financial standing delegations and all operating-system tables.');
} finally {
  database.close();
}
