import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runScheduledCapacityGrowth } from '../src/worker-capacity-growth.js';
import { completeLocalJob, leaseLocalJob } from '../src/worker-local-job-api.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.parameters);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Database {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1Statement(this.database, sql); }
}

const database = new DatabaseSync(':memory:');
for (const migration of [
  'migrations/phase9_ai_resource_orchestration.sql',
  'migrations/phase10_ai_autonomy.sql',
  'migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql',
  'migrations/phase13_matrix_synergy.sql'
]) database.exec(fs.readFileSync(migration, 'utf8'));

database.prepare(`INSERT INTO ai_local_runtime_nodes(
  node_id,node_name,platform,architecture,hardware_json,server_inventory_json,model_count,gpu_count,total_gpu_memory_mb,
  status,cost_confirmed_zero,external_network_used,registered_at,last_seen,expires_at
) VALUES(?,?,?,?,?,?,0,0,0,'online',1,0,?,?,?)`).run(
  'node-worker-integration',
  'Worker integration node',
  'test',
  'x64',
  JSON.stringify({ hostname: 'worker-integration', cpu_threads: 8, total_memory_mb: 16384, total_gpu_memory_mb: 0 }),
  '[]',
  new Date().toISOString(),
  new Date().toISOString(),
  '2099-01-01T00:00:00.000Z'
);
database.prepare(`INSERT INTO ai_local_runtime_nodes(
  node_id,node_name,platform,architecture,hardware_json,server_inventory_json,model_count,gpu_count,total_gpu_memory_mb,
  status,cost_confirmed_zero,external_network_used,registered_at,last_seen,expires_at
) VALUES(?,?,?,?,?,?,0,0,0,'online',1,1,?,?,?)`).run(
  'node-networked-quarantine',
  'Networked quarantine node',
  'test',
  'x64',
  JSON.stringify({ hostname: 'networked-quarantine', cpu_threads: 64, total_memory_mb: 131072, total_gpu_memory_mb: 0 }),
  '[]',
  new Date().toISOString(),
  new Date().toISOString(),
  '2099-01-01T00:00:00.000Z'
);

const env = {
  MEMBERS_DB: new D1Database(database),
  AI_COMPUTE_RESOURCE_SCOUT_ENABLED: 'true',
  AI_RESOURCE_ZERO_SPEND_LOCK: 'true'
};

const first = await runScheduledCapacityGrowth(env);
assert.equal(first.skipped, false);
assert.equal(first.resources_admitted, 1);
assert.equal(first.assignments, 1);
assert.equal(first.report.confirmed_compute_cost_eur, 0);
assert.equal(first.report.paid_fallback_possible, false);
assert.equal(first.report.online_local_nodes, 1);
assert.equal(first.report.observed_online_local_nodes, 2);
assert.equal(first.report.total_available_cpu_threads, 8, 'quarantined hardware must not inflate available capacity');
assert.ok(first.report.resources_quarantined.some(item => item.candidate_id === 'node-networked-quarantine'));
assert.equal(first.report.daily_benchmark.created, true);
assert.equal(first.report.jobs_assigned[0].node_id, 'node-worker-integration');

const queued = database.prepare("SELECT * FROM ai_local_jobs WHERE job_id LIKE 'capacity-benchmark-%'").get();
assert.equal(queued.status, 'queued');
assert.equal(queued.assigned_node_id, 'node-worker-integration');
assert.equal(JSON.parse(queued.requirements_json).cost_ceiling_eur, 0);
assert.equal(JSON.parse(queued.requirements_json).external_network_allowed, false);

const rejectedLease = await leaseLocalJob(env, { node_id: 'node-networked-quarantine' });
assert.equal(rejectedLease.status, 409);
assert.match((await rejectedLease.json()).error, /not eligible for zero-spend offline execution/);

const leaseResponse = await leaseLocalJob(env, { node_id: 'node-worker-integration' });
assert.equal(leaseResponse.status, 200);
const lease = await leaseResponse.json();
assert.equal(lease.job.job_id, queued.job_id);
assert.equal(lease.job.external_network_allowed, false);

const completeResponse = await completeLocalJob(env, {
  job_id: lease.job.job_id,
  node_id: 'node-worker-integration',
  lease_token: lease.lease_token,
  completion: {
    ok: true,
    result: { sha256: '0'.repeat(64) },
    cost_confirmed_zero: true,
    external_network_used: false
  }
});
assert.equal(completeResponse.status, 200);
assert.equal((await completeResponse.json()).status, 'completed');

const learnedResource = database.prepare("SELECT reliability_score,last_success FROM ai_resources WHERE resource_id='node-worker-integration'").get();
assert.ok(learnedResource.last_success);
assert.equal(learnedResource.reliability_score, 95.5);

const second = await runScheduledCapacityGrowth(env);
assert.equal(second.skipped, false);
assert.equal(second.resources_admitted, 0);
assert.equal(second.assignments, 0);
assert.equal(second.report.daily_benchmark.created, false);
assert.equal(second.report.outcomes_last_24h.completed, 1);
assert.equal(second.report.outcomes_last_24h.leased, 1);
assert.equal(database.prepare("SELECT COUNT(*) count FROM matrix_learning_ledger WHERE domain='zero-cost-compute'").get().count, 2);
assert.equal(database.prepare("SELECT COUNT(*) count FROM ai_local_jobs WHERE status='completed'").get().count, 1);
assert.equal(database.prepare("SELECT COUNT(*) count FROM ai_local_job_receipts WHERE cost_confirmed_zero<>1 OR external_network_used<>0").get().count, 0);

console.log('CAPACITY GROWTH WORKER INTEGRATION TEST PASSED');
console.log('A scheduled cycle admitted an online owner node, persisted and leased its daily benchmark, recorded a EUR 0 outcome, learned reliability, and reported the immutable receipts on the next cycle.');
