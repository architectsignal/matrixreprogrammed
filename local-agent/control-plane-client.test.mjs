import assert from 'node:assert/strict';
import { completionReceipt, leaseNextJob, runOneControlPlaneJob } from './control-plane-client.mjs';

const config = { siteUrl: 'https://matrix.invalid', adminToken: 'owner-token', nodeId: 'node-test' };

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
  if (url.endsWith('/lease')) {
    return new Response(JSON.stringify({
      ok: true,
      lease_token: 'lease-token',
      job: { job_id: 'job-1', job_type: 'deterministic.hash', payload: { value: 'matrix' } }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('/complete')) {
    return new Response(JSON.stringify({ ok: true, receipt_id: 'receipt-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected URL ${url}`);
};

const lease = await leaseNextJob(config, { fetchImpl });
assert.equal(lease.job.job_id, 'job-1');
assert.equal(calls[0].body.node_id, 'node-test');
assert.equal(calls[0].options.headers['x-admin-token'], 'owner-token');

const receipt = completionReceipt(lease.job, { digest: 'abc' }, Date.now() - 10);
assert.equal(receipt.cost_confirmed_zero, true);
assert.equal(receipt.external_network_used, false);
assert.match(receipt.result_sha256, /^[a-f0-9]{64}$/);

calls.length = 0;
const result = await runOneControlPlaneJob(config, async job => ({ digest: `done-${job.payload.value}` }), { fetchImpl });
assert.equal(result.ok, true);
assert.equal(result.job_id, 'job-1');
assert.equal(calls.length, 2);
assert.equal(calls[1].body.completion.cost_confirmed_zero, true);
assert.equal(calls[1].body.completion.external_network_used, false);
assert.equal(calls[1].body.completion.result.digest, 'done-matrix');

const idle = await leaseNextJob(config, { fetchImpl: async () => new Response(null, { status: 204 }) });
assert.equal(idle, null);

console.log('Control-plane client tests passed.');
