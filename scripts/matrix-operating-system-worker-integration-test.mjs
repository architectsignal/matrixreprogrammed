import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleMatrixOperationsRoute, runMatrixOperatingCycle } from '../src/worker-matrix-operations.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.parameters); return { success: true, meta: { changes: Number(result.changes || 0) } }; }
}
class D1Database { constructor(database) { this.database = database; } prepare(sql) { return new D1Statement(this.database, sql); } }

const raw = new DatabaseSync(':memory:');
for (const migration of [
  'migrations/0001_membership_foundation.sql', 'migrations/phase5_member_experience.sql', 'migrations/phase13_member_entitlement_datetime_fix.sql',
  'migrations/phase9_ai_resource_orchestration.sql', 'migrations/phase10_ai_autonomy.sql', 'migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql', 'migrations/phase13_matrix_synergy.sql', 'migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql', 'migrations/phase15_matrix_value_hunter.sql', 'migrations/phase16_permissionless_value_harvester.sql',
  'migrations/phase17_matrix_operating_system.sql'
]) raw.exec(fs.readFileSync(migration, 'utf8'));
const env = { MEMBERS_DB: new D1Database(raw), MATRIX_OPERATING_SYSTEM_ENABLED: 'true' };

try {
  assert.throws(() => raw.prepare("UPDATE matrix_constitution SET law_text='DO ANYTHING' WHERE constitution_id='matrix-law-v1'").run(), /MATRIX_CONSTITUTION_IMMUTABLE/);
  assert.throws(() => raw.prepare("DELETE FROM matrix_constitution WHERE constitution_id='matrix-law-v1'").run(), /MATRIX_CONSTITUTION_IMMUTABLE/);

  const observedAt = new Date().toISOString();
  raw.prepare(`INSERT INTO matrix_events(event_id,event_type,timestamp,origin,source,evidence_class,actor,affected_entities_json,affected_pages_json,confidence,review_state,audit_identifier,propagation_json,payload_json,created_at)
    VALUES('failure-1','resource.failed',?,'fixture',NULL,'VERIFIED','fixture','[]','[]',100,'automatically-verified','failure-1','[]','{"error":"fixture resource failed"}',?)`).run(observedAt, observedAt);
  const first = await runMatrixOperatingCycle(env, { trigger: 'integration-boot', clock: () => new Date('2026-08-13T12:00:00.000Z') });
  assert.equal(first.ok, true);
  assert.equal(first.report.constitution_verified, true);
  assert.equal(first.report.consequential_actions_executed, 0);
  assert.ok(first.report.operating_missions_created >= 1);
  assert.ok(first.report.mission_types.RECOVERY_MISSION >= 1);
  assert.ok(first.report.mission_outcomes.length >= 1);
  const recoveryOutcome = first.report.mission_outcomes.find(item => item.mission_id.endsWith('-failure-1'));
  assert.equal(recoveryOutcome?.status, 'running');
  assert.match(recoveryOutcome?.observation || '', /failure remains/i);
  const persistedRecovery = raw.prepare("SELECT status,resources_json,attempts FROM matrix_operating_missions WHERE mission_type='RECOVERY_MISSION' AND objective LIKE 'Recover failed cycle %' ORDER BY created_at LIMIT 1").get();
  assert.equal(persistedRecovery.status, 'running');
  assert.deepEqual(JSON.parse(persistedRecovery.resources_json), ['failure-1']);
  assert.equal(persistedRecovery.attempts, 1);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_capability_snapshots').get().count, 1);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_daily_baselines').get().count, 1);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_learning_effects').get().count, 1);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_watchdog_events').get().count >= 1, true);
  assert.equal(raw.prepare("SELECT state FROM matrix_capabilities WHERE capability_id='matrix-operating-system'").get().state, 'live_verified');
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_events WHERE event_type='cycle.completed'").get().count, 1);

  const doctor = await handleMatrixOperationsRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/matrix-operations/doctor'), env);
  assert.equal(doctor.status, 200);
  const doctorBody = await doctor.json();
  assert.equal(doctorBody.ok, true);
  assert.ok(doctorBody.latest_boot);
  assert.equal(doctorBody.constitution.valid, true);

  const missions = await handleMatrixOperationsRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/matrix-operations/missions'), env);
  assert.equal(missions.status, 200);
  assert.ok((await missions.json()).missions.length >= 1);

  const allowedAction = await handleMatrixOperationsRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/matrix-operations/action/check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionType: 'CREATE_INTERNAL_MISSION', consequenceClass: 'REVERSIBLE_INTERNAL', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true })
  }), env);
  const allowedBody = await allowedAction.json();
  assert.equal(allowedBody.execution_performed, false);
  assert.equal(allowedBody.decision.allowed, true);

  const blockedAction = await handleMatrixOperationsRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/matrix-operations/action/check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionType: 'DELETE_DATABASE', consequenceClass: 'DESTRUCTIVE', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true })
  }), env);
  const blockedBody = await blockedAction.json();
  assert.equal(blockedBody.execution_performed, false);
  assert.equal(blockedBody.decision.allowed, false);
  assert.equal(blockedBody.decision.decision, 'BLOCKED');
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_action_receipts').get().count, 2);

  const second = await runMatrixOperatingCycle(env, { trigger: 'scheduled-watchdog', clock: () => new Date('2026-08-13T13:00:00.000Z') });
  assert.equal(second.ok, true);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_capability_snapshots').get().count, 2);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_daily_baselines').get().count, 1);
  assert.ok(raw.prepare("SELECT COUNT(*) count FROM matrix_operating_missions WHERE mission_type='CAPABILITY_STAGNATION_MISSION'").get().count >= 1);
  assert.ok(second.report.mission_outcomes.some(item => item.status === 'running'));

  raw.prepare("UPDATE ai_feature_flags SET enabled=0 WHERE flag_name='MATRIX_OPERATING_SYSTEM_ENABLED'").run();
  const disabled = await runMatrixOperatingCycle(env, { trigger: 'disabled-proof', clock: () => new Date('2026-08-13T14:00:00.000Z') });
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.reason, 'matrix-operating-system-d1-flag-disabled');

  console.log('Matrix operating-system Worker integration passed: immutable D1 law, immediate/scheduled cycles, recovery/watchdog, metrics, strict learning and evaluation-only delegation receipts.');
} finally {
  raw.close();
}
