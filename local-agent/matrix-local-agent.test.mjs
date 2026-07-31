import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.MATRIX_LOCAL_AGENT_SHARED_SECRET = 'test-secret-that-is-at-least-thirty-two-characters';
process.env.MATRIX_LOCAL_AGENT_HOST = '127.0.0.1';
process.env.MATRIX_LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:11434';

const { executeJob, sha256, timingSafeEqual, verifySignature } = await import('./matrix-local-agent.mjs');

assert.equal(sha256('matrix'), crypto.createHash('sha256').update('matrix').digest('hex'));
assert.equal(timingSafeEqual('abc', 'abc'), true);
assert.equal(timingSafeEqual('abc', 'abd'), false);
assert.equal(timingSafeEqual('abc', 'abcd'), false);

const result = await executeJob({ job_type: 'deterministic.hash', payload: { value: 'matrix' } });
assert.equal(result.algorithm, 'sha256');
assert.equal(result.digest, sha256('matrix'));
assert.equal(result.bytes, 6);

await assert.rejects(
  executeJob({ job_type: 'shell.execute', payload: { command: 'whoami' } }),
  /Unsupported job type/
);

const body = JSON.stringify({ job_type: 'deterministic.hash', payload: { value: 'signed' } });
const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const url = '/v1/jobs/execute';
const canonical = `POST\n${url}\n${timestamp}\n${nonce}\n${sha256(body)}`;
const signature = crypto.createHmac('sha256', process.env.MATRIX_LOCAL_AGENT_SHARED_SECRET).update(canonical).digest('hex');
const request = {
  method: 'POST',
  url,
  headers: {
    'x-matrix-timestamp': timestamp,
    'x-matrix-nonce': nonce,
    'x-matrix-signature': signature
  }
};
assert.deepEqual(verifySignature(request, body), { ok: true });
assert.match(verifySignature(request, body).error, /already been used/);

const tamperedRequest = {
  ...request,
  headers: { ...request.headers, 'x-matrix-nonce': crypto.randomUUID() }
};
assert.match(verifySignature(tamperedRequest, `${body} `).error, /invalid/);

console.log('Matrix local agent tests passed.');
