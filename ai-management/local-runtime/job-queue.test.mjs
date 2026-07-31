import assert from 'node:assert/strict';
import { buildLease, hash, recoverExpired, selectQueuedJob, validateJob, verifyCompletion } from './job-queue.mjs';

const validated = validateJob({
  job_type: 'deterministic.hash',
  payload: { value: 'matrix' },
  data_class: 'internal',
  priority: 'P2'
});
assert.equal(validated.requirements.cost_ceiling_eur, 0);
assert.equal(validated.requirements.external_network_allowed, false);
assert.throws(() => validateJob({ job_type: 'shell.exec' }), /Unsupported/);

const selected = selectQueuedJob([
  { job_id: 'later', status: 'queued', priority: 'P3', created_at: '2026-01-01T00:00:00Z', attempt_count: 0, maximum_attempts: 3 },
  { job_id: 'urgent', status: 'queued', priority: 'P1', created_at: '2026-01-02T00:00:00Z', attempt_count: 0, maximum_attempts: 3 }
]);
assert.equal(selected.job_id, 'urgent');

const { token, tokenHash, lease } = buildLease({
  job_id: 'job-1',
  job_type: 'deterministic.hash',
  payload_json: '{"value":"matrix"}',
  requirements_json: '{}',
  data_class: 'internal',
  priority: 'P3'
}, 'node-1', { now: Date.now(), leaseMs: 60000, token: 'a'.repeat(64) });
assert.equal(tokenHash, hash(token));
assert.equal(lease.cost_ceiling_eur, 0);
assert.equal(lease.external_network_allowed, false);

const leasedJob = {
  job_id: 'job-1',
  status: 'leased',
  assigned_node_id: 'node-1',
  lease_token_hash: tokenHash,
  lease_expires_at: new Date(Date.now() + 60000).toISOString()
};
assert.equal(verifyCompletion(leasedJob, {
  job_id: 'job-1',
  node_id: 'node-1',
  cost_confirmed_zero: true,
  external_network_used: false
}, token), true);
assert.throws(() => verifyCompletion(leasedJob, {
  job_id: 'job-1', node_id: 'node-1', cost_confirmed_zero: false, external_network_used: false
}, token), /zero cost/);

const recovered = recoverExpired([
  { job_id: 'retry', status: 'leased', lease_expires_at: '2020-01-01T00:00:00Z', attempt_count: 1, maximum_attempts: 3 },
  { job_id: 'dead', status: 'leased', lease_expires_at: '2020-01-01T00:00:00Z', attempt_count: 3, maximum_attempts: 3 }
]);
assert.deepEqual(recovered.map(item => item.next_status), ['queued', 'failed']);
console.log('Local job queue tests passed.');
